/**
 * Builds Tau's local KiCad model pack: `node build-kicad-pack.ts` from this directory.
 *
 * For each entry of `src/engine/kicad-catalog.ts` it downloads the footprint as circuit JSON and its STEP
 * model from kicad-mod-cache.tscircuit.com (a mirror of the official KiCad footprint and
 * kicad-packages3D libraries), tessellates the STEP with occt-import-js, and writes one GLB per
 * model into `src/assets/kicad/`. GLBs keep KiCad's native frame (Z-up millimetres, footprint
 * origin), which is the frame circuit-json-to-gltf expects for `model_glb_url` and `model_step_url`.
 *
 * The pack is versioned by `kicadPackVersion` in `src/kicad-pack.ts`; bump it whenever entries or
 * the tessellation change so cached renders are invalidated.
 */

// oxlint-disable-next-line typescript/triple-slash-reference -- occt-import-js ships no declarations; reuse the brep kernel's.
/// <reference path='../brep/src/types/occt-import-js.d.ts' />
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { Document, NodeIO, VertexLayout } from '@gltf-transform/core';
import type { Material } from '@gltf-transform/core';
import { dedup, flatten, join, weld } from '@gltf-transform/functions';
import occtImportJs from 'occt-import-js';
import type { OcctImportJs, RgbColor } from 'occt-import-js';

import { kicadCatalog as kicadPack } from '#engine/kicad-catalog.js';
import { kicadFootprintCacheUrl } from '#kicad-pack.js';

const fetchOk = async (url: string): Promise<Response> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return response;
};

/** Keep the reference designator text only, as @tscircuit/eval does, and drop KiCad's fabrication notes. */
const keepFootprintElement = (element: { type: string; text?: string }): boolean =>
  !element.type.startsWith('pcb_fabrication_note') &&
  (element.type !== 'pcb_silkscreen_text' || element.text === 'REF**');

const stepToGlb = async (
  occt: OcctImportJs,
  step: Uint8Array<ArrayBuffer>,
): Promise<{ glb: Uint8Array<ArrayBuffer>; triangles: number }> => {
  // oxlint-disable-next-line eslint/new-cap -- occt-import-js names its methods in PascalCase.
  const result = occt.ReadStepFile(step, {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.002,
    angularDeflection: 0.5,
  });
  if (!result.success) {
    throw new Error('occt-import-js could not read the STEP file');
  }
  const document = new Document();
  const buffer = document.createBuffer();
  const mesh = document.createMesh();
  const materials = new Map<string, Material>();
  // The converter reads `baseColorFactor * 255` as sRGB, as it does STEP colours.
  const materialFor = (color: RgbColor | undefined): Material => {
    const key = color ? color.map((value) => value.toFixed(3)).join(',') : 'default';
    let material = materials.get(key);
    if (!material) {
      material = document
        .createMaterial()
        .setBaseColorFactor(color ? [...color, 1] : [0.6, 0.6, 0.6, 1])
        .setMetallicFactor(0)
        .setRoughnessFactor(0.6);
      materials.set(key, material);
    }
    return material;
  };
  let triangles = 0;
  for (const part of result.meshes) {
    const positions = part.attributes.position.array;
    const normals = part.attributes.normal?.array;
    const indices = part.index.array;
    const faces =
      part.brep_faces.length > 0 ? part.brep_faces : [{ first: 0, last: indices.length / 3 - 1, color: part.color }];
    for (const face of faces) {
      const slice = indices.slice(face.first * 3, (face.last + 1) * 3);
      const used = [...new Set(slice)];
      const remap = new Map(used.map((vertex, index) => [vertex, index]));
      const position = new Float32Array(used.length * 3);
      const normal = new Float32Array(used.length * 3);
      for (const [index, vertex] of used.entries()) {
        for (let axis = 0; axis < 3; axis++) {
          position[index * 3 + axis] = positions[vertex * 3 + axis] ?? 0;
          normal[index * 3 + axis] = normals?.[vertex * 3 + axis] ?? 0;
        }
      }
      const primitive = document
        .createPrimitive()
        .setMaterial(materialFor(face.color ?? part.color))
        .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(position).setBuffer(buffer))
        .setIndices(
          document
            .createAccessor()
            .setType('SCALAR')
            .setArray(new Uint32Array(slice.map((vertex) => remap.get(vertex) ?? 0)))
            .setBuffer(buffer),
        );
      if (normals) {
        primitive.setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(normal).setBuffer(buffer));
      }
      mesh.addPrimitive(primitive);
      triangles += slice.length / 3;
    }
  }
  document.createScene().addChild(document.createNode().setMesh(mesh));
  await document.transform(dedup(), flatten(), join(), weld());
  // The converter's GLB reader ignores `byteStride`, so attributes must not be interleaved.
  const glb = await new NodeIO().setVertexLayout(VertexLayout.SEPARATE).writeBinary(document);
  return { glb, triangles };
};

const occt = await occtImportJs();
const entries = await Promise.all(
  kicadPack.map(async (entry) => {
    const footprintResponse = await fetchOk(`${kicadFootprintCacheUrl}/${entry.name}.circuit.json`);
    const footprint = (await footprintResponse.json()) as Array<{ type: string; text?: string }>;
    const stepResponse = await fetchOk(`${kicadFootprintCacheUrl}/${entry.name}.step`);
    return { entry, footprint, step: new Uint8Array(await stepResponse.arrayBuffer()) };
  }),
);
for (const { entry, footprint, step } of entries) {
  writeFileSync(entry.footprint, `${JSON.stringify(footprint.filter((element) => keepFootprintElement(element)))}\n`);
  // The STEP reader is synchronous per file; converting one STEP at a time keeps its heap small.
  // oxlint-disable-next-line eslint/no-await-in-loop -- sequential by design, see above.
  const { glb, triangles } = await stepToGlb(occt, step);
  writeFileSync(entry.model, glb);
  const digest = createHash('sha256').update(glb).digest('hex').slice(0, 12);
  console.log(`${entry.name}: ${triangles} triangles, ${glb.byteLength} bytes, sha256 ${digest}`);
}
