#!/usr/bin/env node
/**
 * Build the material-preserving renderer calibration catalog and native CAD fixtures.
 *
 * Source geometry uses millimeters/Z-up; the production Replicad exporter writes meters/Y-up.
 * Required inputs: --onshape <native-edge.glb> and --authored <planetary.glb>.
 * Optional: --output <directory>, --replicas <counts> (4,16), --independent-replicas <counts> (4).
 * Usage: node apps/ui/scripts/render-calibration/generate.mts --onshape <path> --authored <path>
 * Exit codes: 0 success; 1 input, retrieval, geometry, or semantic validation failure.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { Logger, NodeIO, Primitive } from '@gltf-transform/core';
import type { Material, Mesh, Document } from '@gltf-transform/core';
import { KHRMaterialsEmissiveStrength, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import type { EmissiveStrength } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import {
  draw,
  drawCircle,
  drawPolysides,
  drawRoundedRectangle,
  exportSTEP,
  iterTopo,
  makeSphere,
  measureDistanceBetween,
  measureVolume,
  setOC,
} from 'replicad';
import type { Shape3D, ShapeConfig } from 'replicad';
import { srgbHexToLinearTuple } from '@taucad/geometry-core';
// oxlint-disable-next-line no-restricted-imports -- This Node calibration script must exercise the existing internal production converter; it has no public package export.
import { convertReplicadGeometriesToGltf } from '../../../../packages/plugins/replicad/src/utils/replicad-to-gltf.ts'; // eslint-disable-line @nx/enforce-module-boundaries -- Offline fixtures exercise the production serializer without adding a public API just for calibration.

type GeometryReplicad = Parameters<typeof convertReplicadGeometriesToGltf>[0]['geometries'][number];

type Region = {
  id: string;
  nodeNames: string[];
  materialNames: string[];
  featureScaleMeters?: number;
  linearRadiance?: number[];
};

type Fixture = {
  id: string;
  label: string;
  family: string;
  role: 'diagnostic' | 'tuning' | 'holdout' | 'performance';
  file: string;
  sha256: string;
  source: Record<string, unknown>;
  stats: {
    parts: number;
    meshes: number;
    triangles: number;
    uniqueTriangles: number;
    vertices: number;
    lineSegments: number;
    topologicalEdges?: number;
  };
  bounds: { min: number[]; max: number[] };
  materials: Array<ReturnType<typeof describeMaterial>>;
  regions: Region[];
  spatialScale: number;
  brep?: Record<string, unknown>;
};

type Part = {
  name: string;
  shape: Shape3D;
  color?: string;
  metalness?: number;
  roughness?: number;
  featureScaleMeters?: number;
};

const repoRoot = resolve(import.meta.dirname, '../../../..');
const meshOptions = { tolerance: 0.005, angularTolerance: 0.08 };
const khronosRevision = '723ffc6706725b618b8c14ceb82e3e6904b08a76';
const khronosSha256 = '5e677f260ec0f366967a6e9545de2f3dab2a160e307b9bcb9d050cd2028f63f8';
const khronosReadmeSha256 = '098845806e1c120cbbdb7c05c0cf4d78d577a1eb62c8eb375cd1218d211bee79';
const khronosUrl = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${khronosRevision}/Models/MetalRoughSpheresNoTextures/glTF-Binary/MetalRoughSpheresNoTextures.glb`;
const authoredSha256 = 'a760950e8a2515336494e7fbe8bf76ca26147a79731a176d055f34d138a5ac61';
const onshapeSha256 = 'a27cf393bc786b95b5bf260d870e16dc9eca635690ff8cc0d2d4bd682af1183a';
const heldOutSha256 = 'b293d77c4ac82b7f874cc9bdb68031b0229aebd60741efc92d582431b351031a';
const featureSizes = [0.1, 0.3, 1, 3];
const gapSizes = [0, 0.1, 0.3, 1, 3];
const io = new NodeIO()
  .registerExtensions([KHRMaterialsUnlit, KHRMaterialsEmissiveStrength])
  .setLogger(new Logger(Logger.Verbosity.SILENT));
const hash = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const positionKey = (values: ArrayLike<number>, index: number): string =>
  `${values[index]},${values[index + 1]},${values[index + 2]}`;

const describeMaterial = (material: Material) => ({
  name: material.getName(),
  baseColorFactor: material.getBaseColorFactor(),
  metallicFactor: material.getMetallicFactor(),
  roughnessFactor: material.getRoughnessFactor(),
  unlit: Boolean(material.getExtension(KHRMaterialsUnlit.EXTENSION_NAME)),
  emissiveFactor: material.getEmissiveFactor(),
  emissiveStrength:
    material.getExtension<EmissiveStrength>(KHRMaterialsEmissiveStrength.EXTENSION_NAME)?.getEmissiveStrength() ?? 1,
});

const inventory = (document: Document): Pick<Fixture, 'stats' | 'bounds' | 'materials' | 'regions'> => {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  assert.ok(scene, 'A fixture must contain a scene');
  const meshes = new Set<Mesh>();
  const geometries = new Set<string>();
  const accessors = document.getRoot().listAccessors();
  const materials = new Set<Material>();
  const stats = { parts: 0, meshes: 0, triangles: 0, uniqueTriangles: 0, vertices: 0, lineSegments: 0 };
  const regions: Region[] = [];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) {
      return;
    }
    let hasSurface = false;
    let triangleCount = 0;
    const materialNames = new Set<string>();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      assert.ok(position, `${node.getName()} has no positions`);
      const count = primitive.getIndices()?.getCount() ?? position.getCount();
      if (primitive.getMode() === Primitive.Mode['TRIANGLES']) {
        hasSurface = true;
        triangleCount += count / 3;
        stats.vertices += position.getCount();
        const geometryKey = [position, primitive.getAttribute('NORMAL'), primitive.getIndices()]
          .map((accessor) => (accessor ? accessors.indexOf(accessor) : -1))
          .join(':');
        if (!geometries.has(geometryKey)) {
          stats.uniqueTriangles += count / 3;
          geometries.add(geometryKey);
        }
      } else if (primitive.getMode() === Primitive.Mode['LINES']) {
        stats.lineSegments += count / 2;
      } else {
        assert.fail(`Unexpected primitive mode ${primitive.getMode()}`);
      }
      const material = primitive.getMaterial();
      if (material) {
        materials.add(material);
        materialNames.add(material.getName());
      }
    }
    stats.triangles += triangleCount;
    meshes.add(mesh);
    stats.parts += Number(hasSurface);
    regions.push({
      id: `${node.getName()}@${document.getRoot().listNodes().indexOf(node)}`,
      nodeNames: [node.getName()],
      materialNames: [...materialNames],
    });
  });
  stats.meshes = meshes.size;
  const bounds = getBounds(scene);
  assert.ok(
    [...bounds.min, ...bounds.max].every((value) => Number.isFinite(value)),
    'Fixture bounds must be finite',
  );
  assert.ok(stats.triangles > 0, 'A fixture must contain surfaces');
  return { stats, bounds, materials: [...materials].map((material) => describeMaterial(material)), regions };
};

const readPinnedSource = async (options: {
  file: string;
  url: string;
  sha256: string;
}): Promise<Uint8Array<ArrayBuffer>> => {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await readFile(options.file));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
    const response = await fetch(options.url);
    assert.ok(response.ok, `Source download failed: HTTP ${response.status} ${options.url}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  assert.equal(hash(bytes), options.sha256, `Source differs from pinned bytes: ${options.url}`);
  await writeFile(options.file, bytes);
  return bytes;
};

const verifyGeometryScale = async (options: { original: string; scaled: string; scale: number }): Promise<number> => {
  const [original, scaled] = await Promise.all([io.read(options.original), io.read(options.scaled)]);
  const originalMeshes = original.getRoot().listMeshes();
  const scaledMeshes = scaled.getRoot().listMeshes();
  assert.equal(scaledMeshes.length, originalMeshes.length, 'Spatial scale changed mesh count');
  let maximumError = 0;
  for (const [meshIndex, mesh] of originalMeshes.entries()) {
    const originals = mesh.listPrimitives();
    const scaledPrimitives = scaledMeshes[meshIndex]!.listPrimitives();
    assert.equal(scaledPrimitives.length, originals.length);
    for (const [primitiveIndex, primitive] of originals.entries()) {
      const scaledPrimitive = scaledPrimitives[primitiveIndex]!;
      assert.equal(scaledPrimitive.getMode(), primitive.getMode());
      assert.deepEqual(scaledPrimitive.getIndices()?.getArray(), primitive.getIndices()?.getArray());
      assert.deepEqual(
        scaledPrimitive.getAttribute('NORMAL')?.getArray(),
        primitive.getAttribute('NORMAL')?.getArray(),
      );
      assert.deepEqual(
        scaledPrimitive.getExtras(),
        primitive.getExtras(),
        'Spatial scale changed native face/edge identities',
      );
      const positions = primitive.getAttribute('POSITION')!.getArray()!;
      const scaledPositions = scaledPrimitive.getAttribute('POSITION')!.getArray()!;
      assert.equal(scaledPositions.length, positions.length);
      for (const [index, position] of positions.entries()) {
        maximumError = Math.max(maximumError, Math.abs(scaledPositions[index]! - position * options.scale));
      }
    }
  }
  assert.ok(
    maximumError <= 0.000001,
    `Spatial scale introduced more than 1 micrometer of Float32 error: ${maximumError}`,
  );
  return maximumError;
};

const cloneMeshBuffers = (document: Document, original: Mesh, name: string): Mesh => {
  const mesh = document.createMesh(name);
  for (const originalPrimitive of original.listPrimitives()) {
    const primitive = originalPrimitive.clone();
    for (const semantic of originalPrimitive.listSemantics()) {
      const accessor = originalPrimitive.getAttribute(semantic)!;
      // oxlint-disable-next-line unicorn/prefer-spread -- Preserve each typed array's glTF component type while allocating independent storage.
      primitive.setAttribute(semantic, accessor.clone().setArray(accessor.getArray()!.slice()));
    }
    const indices = originalPrimitive.getIndices();
    if (indices) {
      // oxlint-disable-next-line unicorn/prefer-spread -- Preserve Uint16/Uint32 index storage, rather than converting to a plain array.
      primitive.setIndices(indices.clone().setArray(indices.getArray()!.slice()));
    }
    mesh.addPrimitive(primitive);
  }
  return mesh;
};

const featureCoupon = (): Part[] => {
  const base = drawRoundedRectangle(100, 100, 3).sketchOnPlane('XY').extrude(8);
  const pocket = drawRoundedRectangle(22, 20, 2).sketchOnPlane('XY', 3).extrude(6).translate([30, -32, 0]);
  const parts: Part[] = [
    {
      name: 'Coupon base with concave pocket',
      shape: base.cut(pocket).fillet(1, (edges) => edges.inPlane('XY', 3)),
      featureScaleMeters: 0.001,
    },
  ];
  for (const [index, size] of featureSizes.entries()) {
    const x = (index - 1.5) * 24;
    parts.push(
      {
        name: `Convex fillet ${size} mm`,
        shape: drawRoundedRectangle(18, 18)
          .sketchOnPlane('XY')
          .extrude(14)
          .fillet(size, (edges) => edges.inPlane('XY', 14))
          .translate([x, 28, 8]),
        featureScaleMeters: size / 1000,
      },
      {
        name: `Chamfer ${size} mm`,
        shape: drawRoundedRectangle(18, 18)
          .sketchOnPlane('XY')
          .extrude(14)
          .chamfer(size, (edges) => edges.inPlane('XY', 14))
          .translate([x, 0, 8]),
        featureScaleMeters: size / 1000,
      },
    );
  }
  parts.push({
    name: 'Cylinder and conical transition',
    shape: draw([0, 0])
      .lineTo([10, 0])
      .lineTo([10, 8])
      .lineTo([5, 16])
      .lineTo([5, 22])
      .lineTo([0, 22])
      .close()
      .sketchOnPlane('XZ')
      .revolve([0, 0, 1])
      .translate([-28, -32, 8]),
  });
  return parts;
};

const occlusionJig = (): Part[] => {
  let base = drawRoundedRectangle(120, 100, 3).sketchOnPlane('XY').extrude(20);
  for (const [index, depth] of [2, 8, 16].entries()) {
    const tool = drawCircle(4)
      .sketchOnPlane('XY', 20 - depth)
      .extrude(depth + 1)
      .translate([-42 + index * 23, 30, 0]);
    base = base.cut(tool);
  }
  const counterbore = draw([0, 4])
    .lineTo([3, 4])
    .lineTo([3, 16])
    .lineTo([6, 16])
    .lineTo([6, 21])
    .lineTo([0, 21])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1])
    .translate([35, 30, 0]);
  const pocket = drawRoundedRectangle(32, 24, 2).sketchOnPlane('XY', 2).extrude(19).translate([-35, -4, 0]);
  const parts: Part[] = [
    { name: 'Blind holes counterbore and deep pocket', shape: base.cutAll([counterbore, pocket]) },
  ];
  parts.push({
    name: 'Thin wall 0.5 mm',
    shape: drawRoundedRectangle(0.5, 22).sketchOnPlane('XY', 20).extrude(18).translate([5, -4, 0]),
    featureScaleMeters: 0.0005,
  });
  for (const [index, gap] of gapSizes.entries()) {
    const center = (index - 2) * 23;
    const left = drawRoundedRectangle(8, 9)
      .sketchOnPlane('XY', 20)
      .extrude(12)
      .translate([center - 4 - gap / 2, -34, 0]);
    const right = drawRoundedRectangle(8, 9)
      .sketchOnPlane('XY', 20)
      .extrude(12)
      .translate([center + 4 + gap / 2, -34, 0]);
    assert.ok(Math.abs(measureDistanceBetween(left, right) - gap) < 1e-7, `Native gap differs from ${gap} mm`);
    parts.push(
      { name: `Gap ${gap} mm left`, shape: left, featureScaleMeters: gap / 1000 },
      { name: `Gap ${gap} mm right`, shape: right, featureScaleMeters: gap / 1000 },
    );
  }
  return parts;
};

const heldOutHousing = (): Part[] => {
  // All values are frozen synthetic controls, not claims about measured commercial finishes.
  const shell = drawRoundedRectangle(120, 90, 10)
    .sketchOnPlane('XY')
    .extrude(40)
    .shell(4, (faces) => faces.inPlane('XY', 40));
  const coverProfile = drawRoundedRectangle(120, 90, 10).cut(drawRoundedRectangle(80, 50, 8));
  const cover = coverProfile
    .sketchOnPlane('XY', 40)
    .extrude(3)
    .chamfer(0.4, (edges) => edges.inPlane('XY', 43));
  const fastenerSites: Array<[number, number]> = [
    [-48, -33],
    [48, -33],
    [-48, 33],
    [48, 33],
  ];
  const bosses = fastenerSites.map(([x, y]) => drawCircle(6).sketchOnPlane('XY', 4).extrude(36).translate([x, y, 0]));
  const holes = fastenerSites.map(([x, y]) => drawCircle(2.2).sketchOnPlane('XY', 36).extrude(8).translate([x, y, 0]));
  const parts: Part[] = [
    {
      name: 'Cast housing',
      shape: shell.fuseAll(bosses).cutAll(holes),
      color: '#9DA3A7',
      metalness: 1,
      roughness: 0.52,
    },
    {
      name: 'Polymer inspection cover',
      shape: cover.cutAll(holes.map((shape) => shape.clone())),
      color: '#B6532E',
      metalness: 0,
      roughness: 0.42,
    },
  ];
  for (const [index, [x, y]] of fastenerSites.entries()) {
    const screw = draw([0, 0])
      .lineTo([2, 0])
      .lineTo([2, 7])
      .lineTo([4, 7])
      .lineTo([4, 11])
      .lineTo([0, 11])
      .close()
      .sketchOnPlane('XZ')
      .revolve([0, 0, 1])
      .cut(drawPolysides(1.8, 6).sketchOnPlane('XY', 9).extrude(3))
      .chamfer(0.15, (edges) => edges.inPlane('XY', 11))
      .translate([x, y, 36]);
    parts.push({ name: `Socket fastener ${index + 1}`, shape: screw, color: '#CBD0D4', metalness: 1, roughness: 0.2 });
  }
  return parts;
};

const extractNative = (part: Part): GeometryReplicad => {
  let solidCount = 0;
  for (const solid of iterTopo(part.shape.wrapped, 'solid')) {
    solidCount += 1;
    solid.delete();
  }
  assert.equal(solidCount, 1, `${part.name}: expected one connected native solid`);
  const faces = part.shape.mesh(meshOptions);
  const edges = part.shape.meshEdges(meshOptions);
  assert.ok(faces.faceGroups.length > 0 && edges.edgeGroups.length > 0, `${part.name}: missing native topology`);
  assert.equal(
    faces.faceGroups.reduce((sum, face) => sum + face.count, 0),
    faces.triangles.length,
  );
  assert.equal(
    edges.edgeGroups.reduce((sum, edge) => sum + edge.count, 0),
    edges.lines.length / 3,
  );
  const positions = new Set<string>();
  for (let index = 0; index < faces.vertices.length; index += 3) {
    positions.add(positionKey(faces.vertices, index));
    assert.ok(
      Math.abs(Math.hypot(...faces.normals.slice(index, index + 3)) - 1) < 1e-5,
      `${part.name}: invalid native normal`,
    );
  }
  for (let index = 0; index < edges.lines.length; index += 3) {
    assert.ok(
      positions.has(positionKey(edges.lines, index)),
      `${part.name}: native edge does not match surface tessellation`,
    );
  }
  assert.ok(measureVolume(part.shape) > 0, `${part.name}: nonpositive solid volume`);
  return {
    format: 'replicad',
    name: part.name,
    faces,
    edges,
    color: part.color ?? '#B7C1CA',
    metalness: part.metalness ?? 0,
    roughness: part.roughness ?? 0.35,
  };
};

const outputControls = async (): Promise<{ bytes: Uint8Array<ArrayBuffer>; regions: Region[] }> => {
  const sphere = makeSphere(8);
  const surface = sphere.mesh(meshOptions);
  const geometries: GeometryReplicad[] = [];
  const levels = [0, 1 / 6, 2 / 6, 0.5, 4 / 6, 5 / 6, 1];
  for (const [index, roughness] of levels.entries()) {
    geometries.push({
      format: 'replicad',
      name: `White furnace roughness ${roughness}`,
      color: '#FFFFFF',
      metalness: 1,
      roughness,
      faces: {
        ...surface,
        vertices: surface.vertices.map(
          (value, axis) => value + (axis % 3 === 0 ? (index - 3) * 22 : axis % 3 === 1 ? 45 : 8),
        ),
      },
      edges: { lines: [], edgeGroups: [] },
    });
  }
  geometries.push(
    {
      format: 'replicad',
      name: 'Diffuse 18 percent gray probe',
      color: '#767676',
      metalness: 0,
      roughness: 1,
      faces: {
        ...surface,
        vertices: surface.vertices.map((value, axis) => value + (axis % 3 === 0 ? -22 : axis % 3 === 1 ? 70 : 8)),
      },
      edges: { lines: [], edgeGroups: [] },
    },
    {
      format: 'replicad',
      name: 'Near mirror probe',
      color: '#FFFFFF',
      metalness: 1,
      roughness: 0.05,
      faces: {
        ...surface,
        vertices: surface.vertices.map((value, axis) => value + (axis % 3 === 0 ? 22 : axis % 3 === 1 ? 70 : 8)),
      },
      edges: { lines: [], edgeGroups: [] },
    },
  );
  sphere.delete();
  const document = await io.readBinary(convertReplicadGeometriesToGltf({ geometries, includeTauTopology: false }));
  const scene = document.getRoot().listScenes()[0]!;
  const grayNode = document
    .getRoot()
    .listNodes()
    .find((node) => node.getName().startsWith('Diffuse'))!;
  grayNode.getMesh()!.listPrimitives()[0]!.getMaterial()!.setBaseColorFactor([0.18, 0.18, 0.18, 1]);
  const buffer = document.getRoot().listBuffers()[0]!;
  const unlit = document.createExtension(KHRMaterialsUnlit);
  const emissive = document.createExtension(KHRMaterialsEmissiveStrength);
  const regions: Region[] = [];
  const addPatch = (options: {
    name: string;
    x: number;
    y: number;
    color: [number, number, number, number];
    unlit?: boolean;
    radiance?: number;
    metalness?: number;
    roughness?: number;
  }): void => {
    const { name, x, y } = options;
    const material = document
      .createMaterial(name)
      .setBaseColorFactor(options.color)
      .setMetallicFactor(options.metalness ?? 0)
      .setRoughnessFactor(options.roughness ?? 1)
      .setDoubleSided(true);
    if (options.unlit) {
      material.setExtension(KHRMaterialsUnlit.EXTENSION_NAME, unlit.createUnlit());
    }
    if (options.radiance !== undefined) {
      material
        .setBaseColorFactor([0, 0, 0, 1])
        .setEmissiveFactor([1, 1, 1])
        .setExtension(
          KHRMaterialsEmissiveStrength.EXTENSION_NAME,
          emissive.createEmissiveStrength().setEmissiveStrength(options.radiance),
        );
    }
    const position = document
      .createAccessor()
      .setType('VEC3')
      .setBuffer(buffer)
      .setArray(new Float32Array([-0.008, 0, -0.008, 0.008, 0, -0.008, 0.008, 0, 0.008, -0.008, 0, 0.008]));
    const normal = document
      .createAccessor()
      .setType('VEC3')
      .setBuffer(buffer)
      .setArray(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]));
    const indices = document
      .createAccessor()
      .setType('SCALAR')
      .setBuffer(buffer)
      .setArray(new Uint16Array([0, 2, 1, 0, 3, 2]));
    const mesh = document
      .createMesh(name)
      .addPrimitive(
        document
          .createPrimitive()
          .setAttribute('POSITION', position)
          .setAttribute('NORMAL', normal)
          .setIndices(indices)
          .setMaterial(material),
      );
    scene.addChild(
      document
        .createNode(name)
        .setMesh(mesh)
        .setTranslation([x / 1000, 0, -y / 1000]),
    );
    regions.push({
      id: name,
      nodeNames: [name],
      materialNames: [name],
      ...((options.unlit ?? options.radiance !== undefined)
        ? {
            linearRadiance:
              options.radiance === undefined
                ? options.color.slice(0, 3)
                : Array.from({ length: 3 }, () => options.radiance!),
          }
        : {}),
    });
  };
  for (const [index, level] of [0, 0.01, 0.04, 0.18, 0.5, 0.9, 1, 2, 4, 8].entries()) {
    addPatch({
      name: `Output linear ${level}`,
      x: (index - 4.5) * 19,
      y: -20,
      color: [Math.min(level, 1), Math.min(level, 1), Math.min(level, 1), 1],
      ...(level <= 1 ? { unlit: true } : { radiance: level }),
    });
  }
  const swatches = [
    { name: 'White dielectric', color: '#FFFFFF', metalness: 0, roughness: 0.35 },
    { name: 'Charcoal dielectric', color: '#313B46', metalness: 0, roughness: 0.75 },
    { name: 'Red dielectric', color: '#B6532E', metalness: 0, roughness: 0.35 },
    { name: 'Green dielectric', color: '#3C955D', metalness: 0, roughness: 0.35 },
    { name: 'Blue dielectric', color: '#285E88', metalness: 0, roughness: 0.32 },
    { name: 'Blue authored metal', color: '#285E88', metalness: 0.65, roughness: 0.32 },
    { name: 'Gold authored metal', color: '#BE974E', metalness: 0.75, roughness: 0.3 },
  ];
  for (const [index, swatch] of swatches.entries()) {
    addPatch({ ...swatch, color: srgbHexToLinearTuple(swatch.color), x: (index - 3) * 22, y: 4 });
    addPatch({
      ...swatch,
      name: `${swatch.name} unlit color reference`,
      color: srgbHexToLinearTuple(swatch.color),
      x: (index - 3) * 22,
      y: -42,
      unlit: true,
    });
  }
  return {
    bytes: await io.writeBinary(document),
    regions: inventory(document).regions.map(
      (region) => regions.find((reference) => reference.nodeNames[0] === region.nodeNames[0]) ?? region,
    ),
  };
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      onshape: { type: 'string' },
      authored: { type: 'string' },
      output: { type: 'string' },
      replicas: { type: 'string', default: '4,16' },
      'independent-replicas': { type: 'string', default: '4' },
    },
  });
  assert.ok(values.onshape && values.authored, 'Pass --onshape <native-edge.glb> and --authored <planetary.glb>');
  const output = resolve(values.output ?? resolve(repoRoot, 'out/render-calibration'));
  const replicaCounts = values.replicas
    .split(',')
    .filter((entry) => entry.length > 0)
    .map(Number);
  const independentCounts = values['independent-replicas']
    .split(',')
    .filter((entry) => entry.length > 0)
    .map(Number);
  assert.ok(
    [...replicaCounts, ...independentCounts].every(
      (count) => Number.isSafeInteger(count) && count >= 1 && count <= 1024,
    ),
    'Replica counts must be integers in [1,1024]',
  );
  await mkdir(resolve(output, 'fixtures'), { recursive: true });
  await mkdir(resolve(output, 'sources'), { recursive: true });
  const fixtures: Fixture[] = [];
  const save = async (options: {
    id: string;
    label: string;
    family: string;
    role: Fixture['role'];
    bytes: Uint8Array<ArrayBuffer>;
    source: Record<string, unknown>;
    regions?: Region[];
    brep?: Record<string, unknown>;
    spatialScale?: number;
    topologicalEdges?: number;
  }): Promise<Fixture> => {
    const { bytes, regions, brep, topologicalEdges, ...metadata } = options;
    const document = await io.readBinary(bytes);
    const details = inventory(document);
    const fixture: Fixture = {
      ...metadata,
      ...details,
      file: `fixtures/${options.id}.glb`,
      sha256: hash(bytes),
      spatialScale: options.spatialScale ?? 1,
      regions: regions ?? details.regions,
      ...(brep ? { brep } : {}),
    };
    if (topologicalEdges !== undefined) {
      fixture.stats.topologicalEdges = topologicalEdges;
    }
    await writeFile(resolve(output, fixture.file), bytes);
    fixtures.push(fixture);
    console.log(
      `${fixture.id}: ${fixture.stats.parts} parts, ${fixture.stats.triangles} triangles, ${fixture.stats.lineSegments} native line segments`,
    );
    return fixture;
  };

  const [khronosBytes] = await Promise.all([
    readPinnedSource({
      file: resolve(output, 'sources/khronos-metal-roughness.glb'),
      url: khronosUrl,
      sha256: khronosSha256,
    }),
    readPinnedSource({
      file: resolve(output, 'sources/khronos-readme.md'),
      url: khronosUrl.replace('glTF-Binary/MetalRoughSpheresNoTextures.glb', 'README.md'),
      sha256: khronosReadmeSha256,
    }),
  ]);
  const gridDocument = await io.readBinary(khronosBytes);
  const gridMaterials = gridDocument.getRoot().listMaterials();
  assert.equal(gridMaterials.length, 98);
  assert.equal(gridDocument.getRoot().listTextures().length, 0, 'Factor controls may not contain textures');
  const combinations = new Map<string, Set<string>>();
  for (const material of gridMaterials) {
    const color = material.getBaseColorFactor().join(',');
    const cells = combinations.get(color) ?? new Set<string>();
    cells.add(`${Math.round(material.getMetallicFactor() * 6)},${Math.round(material.getRoughnessFactor() * 6)}`);
    combinations.set(color, cells);
  }
  assert.equal(combinations.size, 2);
  assert.ok([...combinations.values()].every((cells) => cells.size === 49));
  await save({
    id: 'f1-metal-roughness',
    label: 'F1: Khronos 98 material cases',
    family: 'F1',
    role: 'tuning',
    bytes: khronosBytes,
    source: {
      url: khronosUrl,
      revision: khronosRevision,
      sha256: khronosSha256,
      license: 'CC0-1.0',
      licenseSourceFile: 'sources/khronos-readme.md',
      licenseSourceSha256: khronosReadmeSha256,
      sourceUnit: 'meter',
      edges: 'none; upstream triangle-only fixture',
    },
  });

  const { default: oc } = await import('replicad-opencascadejs');
  setOC(oc);
  const controls = await outputControls();
  await save({
    id: 'f2-output-controls',
    label: 'F2: output, colors and lighting probes',
    family: 'F2',
    role: 'diagnostic',
    ...controls,
    source: {
      generator: 'Replicad spheres plus planar output controls',
      hdrMeasurementCondition:
        'Disable all illumination and AO; HDR emissive patches retain a dielectric specular term under lights.',
      sourceUnit: 'millimeter',
      sourceUpAxis: 'Z',
    },
  });

  const emitNative = async (options: {
    id: string;
    label: string;
    family: string;
    role?: Fixture['role'];
    parts: Part[];
    material?: { color: string; metalness: number; roughness: number };
    scale?: number;
  }): Promise<void> => {
    const { parts } = options;
    const geometries = parts.map((part) => {
      const analyzer = new oc.BRepCheck_Analyzer(part.shape.wrapped);
      try {
        // oxlint-disable-next-line new-cap -- OpenCascade's bound API names this predicate IsValid.
        assert.ok(analyzer.IsValid(), `${part.name}: invalid BRep`);
      } finally {
        analyzer.delete();
      }
      const geometry = extractNative(part);
      if (options.material) {
        Object.assign(geometry, options.material);
      }
      if (options.scale) {
        geometry.faces.vertices = geometry.faces.vertices.map((value) => value * options.scale!);
        geometry.edges.lines = geometry.edges.lines.map((value) => value * options.scale!);
      }
      return geometry;
    });
    const bytes = convertReplicadGeometriesToGltf({ geometries });
    const stepFile = `sources/${options.id}.step`;
    const shapeConfigs: ShapeConfig[] = parts.map((part) => ({
      ...part,
      ...options.material,
      shape: options.scale ? part.shape.clone().scale(options.scale) : part.shape,
    }));
    const step = new Uint8Array(await exportSTEP(shapeConfigs, { unit: 'MM' }).arrayBuffer());
    await writeFile(resolve(output, stepFile), step);
    if (options.scale) {
      for (const shape of shapeConfigs) {
        shape.shape.delete();
      }
    }
    await save({
      id: options.id,
      label: options.label,
      family: options.family,
      role: options.role ?? 'tuning',
      bytes,
      source: {
        generator: 'Replicad native feature construction',
        sourceUnit: 'millimeter',
        sourceUpAxis: 'Z',
        outputUnit: 'meter',
        outputUpAxis: 'Y',
        stepFile,
        stepSha256: hash(step),
      },
      spatialScale: options.scale ?? 1,
      topologicalEdges: geometries.reduce((sum, part) => sum + part.edges.edgeGroups.length, 0),
      brep: {
        surfaceExtractor: 'ReplicadMeshExtractor',
        edgeExtractor: 'ReplicadEdgeMeshExtractor',
        normals: 'native surface derivatives; no recomputation',
        toleranceMillimeters: meshOptions.tolerance,
        angularToleranceRadians: meshOptions.angularTolerance,
        sourceScale: options.scale ?? 1,
        validation:
          'BRepCheck_Analyzer + one solid per part + positive volume + unit normals + exact edge/surface endpoint equality',
        topology: 'TAU_cad_topology plus primitive faceGroups/edgeGroups; face IDs stable for pinned source and kernel',
        parts: geometries.map((part) => ({
          name: part.name,
          faces: part.faces.faceGroups.length,
          topologicalEdges: part.edges.edgeGroups.length,
          segments: part.edges.lines.length / 6,
        })),
      },
      regions: parts.map((part) => ({
        id: part.name,
        nodeNames: [part.name],
        materialNames: [],
        ...(part.featureScaleMeters === undefined
          ? {}
          : { featureScaleMeters: part.featureScaleMeters * (options.scale ?? 1) }),
      })),
    });
  };
  const coupon = featureCoupon();
  try {
    for (const material of [
      { id: 'dielectric', color: '#B7C1CA', metalness: 0, roughness: 0.35 },
      { id: 'smooth-metal', color: '#B7C1CA', metalness: 1, roughness: 0.15 },
      { id: 'rough-metal', color: '#B7C1CA', metalness: 1, roughness: 0.65 },
      { id: 'blue-carrier', color: '#285E88', metalness: 0.65, roughness: 0.32 },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Shared native shapes and OpenCascade's STEP writer are stateful; variants must be serialized.
      await emitNative({
        id: `f3-${material.id}`,
        label: `F3: feature coupon ${material.id}`,
        family: 'F3',
        parts: coupon,
        material,
      });
    }
  } finally {
    for (const part of coupon) {
      part.shape.delete();
    }
  }
  const jig = occlusionJig();
  try {
    for (const scale of [1, 100]) {
      for (const metalness of [0, 1]) {
        const id = `f4-${metalness === 0 ? 'dielectric' : 'metal'}-${scale}x`;
        // oxlint-disable-next-line no-await-in-loop -- Shared native shapes and STEP writer must not be mutated/exported concurrently.
        await emitNative({
          id,
          label: `F4: AO jig ${metalness === 0 ? 'dielectric' : 'metal'} ${scale}×`,
          family: 'F4',
          parts: jig,
          material: { color: '#B7C1CA', metalness, roughness: 0.35 },
          scale,
        });
      }
    }
  } finally {
    for (const part of jig) {
      part.shape.delete();
    }
  }

  const scaleErrors = await Promise.all(
    ['dielectric', 'metal'].map(async (material) => ({
      material,
      maximumPositionErrorMeters: await verifyGeometryScale({
        original: resolve(output, `fixtures/f4-${material}-1x.glb`),
        scaled: resolve(output, `fixtures/f4-${material}-100x.glb`),
        scale: 100,
      }),
    })),
  );
  const couponErrors = await Promise.all(
    ['smooth-metal', 'rough-metal', 'blue-carrier'].map(async (material) => ({
      material,
      maximumPositionErrorMeters: await verifyGeometryScale({
        original: resolve(output, 'fixtures/f3-dielectric.glb'),
        scaled: resolve(output, `fixtures/f3-${material}.glb`),
        scale: 1,
      }),
    })),
  );

  const referenceBytes = new Uint8Array(await readFile(values.onshape));
  assert.equal(hash(referenceBytes), onshapeSha256, 'Onshape native-edge reference differs from its reviewed archive');
  const referenceDocument = await io.readBinary(referenceBytes);
  const referenceStats = inventory(referenceDocument).stats;
  assert.equal(referenceStats.parts, 34, 'Expected the archived 34-solid Onshape comparison');
  assert.equal(referenceStats.lineSegments, 94_249, 'Expected native edge archive');
  const accessors = new Set(
    referenceDocument
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives().map((primitive) => primitive.getAttribute('POSITION'))),
  );
  for (const accessor of accessors) {
    assert.ok(accessor);
    const array = accessor.getArray();
    assert.ok(array);
    accessor.setArray(Float32Array.from(array, (value) => value / 1000));
  }
  for (const node of referenceDocument.getRoot().listNodes()) {
    const [x, y, z] = node.getTranslation();
    node.setTranslation([x / 1000, y / 1000, z / 1000]);
  }
  const nativeReference = await save({
    id: 'f5-onshape-reference',
    label: 'F5: Onshape native BRep reference',
    family: 'F5',
    role: 'tuning',
    bytes: await io.writeBinary(referenceDocument),
    source: {
      sha256: hash(referenceBytes),
      sourceUnit: 'millimeter',
      sourceUpAxis: 'Y',
      normalization: 'positions and node translations divided by 1000; normals/materials unchanged',
      provenance: 'Archived Replicad STEP mesh and native edge builder; no mesh edge detection',
      materialProvenance:
        'Frozen STEP-derived materials: legacy Replicad STEP export supplied sRGB code values to an OCCT linear-color constructor. The importer and native-edge builder preserved those values; ring linear baseColorFactor is approximately [0.443137, 0.509804, 0.576471], metalness 0, roughness 0.35.',
      comparisonLimitation:
        'F5 and F6 have different base-color albedos as well as different metalness/roughness; they are not a same-albedo material sweep. Preserve F5 for the archived STEP/Onshape reference. Use F2 lit material swatches or F3 variants for controlled material comparisons.',
    },
    topologicalEdges: 6065,
    brep: {
      edgeExtractor: 'ReplicadEdgeMeshExtractor',
      topologySource: 'archived brep-edges.json',
      limitation: 'Archive stores one combined native line primitive, no per-face identities',
    },
  });
  assert.ok(
    Math.abs(nativeReference.bounds.max[0]! - nativeReference.bounds.min[0]! - 0.174) < 1e-6,
    'F5 unit normalization failed',
  );

  const authoredBytes = new Uint8Array(await readFile(values.authored));
  assert.equal(
    hash(authoredBytes),
    authoredSha256,
    'Authored regression fixture changed; explicitly review a new fixture before updating this pin',
  );
  const authored = await save({
    id: 'f6-authored-planetary',
    label: 'F6: authored metallic planetary assembly',
    family: 'F6',
    role: 'tuning',
    bytes: authoredBytes,
    source: {
      sha256: authoredSha256,
      sourceUnit: 'meter',
      sourceUpAxis: 'Y',
      preservation: 'Byte-for-byte copy of the user-provided GLB; native edge line primitives preserved',
      materialProvenance:
        'Authored CSS sRGB colors were correctly converted to linear glTF factors; ring #718293 is [0.1651321945016676, 0.2232279573168085, 0.29177064981753587], metalness 0.8, roughness 0.29. These base-color albedos differ from the legacy STEP-derived F5 materials.',
      comparisonLimitation:
        'F5 and F6 are independent regressions, not a same-albedo material sweep. Their materials and native line geometry remain frozen.',
    },
    brep: {
      edgeSource: 'User Replicad export',
      limitation: 'GLB has native line geometry but no face/edge group identities',
    },
  });
  assert.equal(authored.stats.parts, 34);
  assert.equal(authored.materials.filter((material) => !material.unlit).length, 8);
  assert.ok(
    authored.materials
      .filter((material) => !material.unlit)
      .every((material) => material.metallicFactor >= 0.65 && material.metallicFactor <= 0.85),
  );

  const housing = heldOutHousing();
  try {
    await emitNative({
      id: 'f7-heldout-housing',
      label: 'F7: frozen housing validation assembly',
      family: 'F7',
      role: 'holdout',
      parts: housing,
    });
  } finally {
    for (const part of housing) {
      part.shape.delete();
    }
  }
  assert.equal(
    fixtures.find((fixture) => fixture.family === 'F7')!.sha256,
    heldOutSha256,
    'Held-out geometry changed; review and reserve a new validation fixture before fitting',
  );

  const workloads = [
    ...[...new Set(replicaCounts)].map((copies) => ({ copies, independent: false })),
    ...[...new Set(independentCounts)].map((copies) => ({ copies, independent: true })),
  ];
  for (const { copies, independent } of workloads) {
    // oxlint-disable-next-line no-await-in-loop -- Bound peak memory to one expanded workload at a time.
    const document = await io.readBinary(authoredBytes);
    const scene = document.getRoot().listScenes()[0]!;
    const originals = scene.listChildren();
    const columns = Math.ceil(Math.sqrt(copies));
    for (let index = 1; index < copies; index++) {
      for (const original of originals) {
        assert.equal(original.listChildren().length, 0, 'Performance source must consist of flat part nodes');
        const originalMesh = original.getMesh();
        assert.ok(originalMesh);
        const mesh = independent
          ? cloneMeshBuffers(document, originalMesh, `${originalMesh.getName()} copy ${index + 1}`)
          : originalMesh;
        const clone = document
          .createNode(`${original.getName()} copy ${index + 1}`)
          .setMesh(mesh)
          .setRotation(original.getRotation())
          .setScale(original.getScale());
        const [x, y, z] = original.getTranslation();
        clone.setTranslation([x + (index % columns) * 0.21, y, z + Math.floor(index / columns) * 0.21]);
        scene.addChild(clone);
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- Bound peak memory to one expanded workload at a time.
    const workloadBytes = await io.writeBinary(document);
    // oxlint-disable-next-line no-await-in-loop -- Release each workload before building the next size.
    const fixture = await save({
      id: `perf-planetary-${copies}${independent ? '-independent' : ''}`,
      label: `Performance: ${copies} planetary assemblies (${independent ? 'independent' : 'shared'} buffers)`,
      family: 'performance',
      role: 'performance',
      bytes: workloadBytes,
      source: {
        sourceFixture: authored.id,
        sourceSha256: authored.sha256,
        copies,
        sourceUnit: 'meter',
        geometrySharing: independent
          ? 'Distinct scene nodes and independently copied attribute/index buffers; no GPU instancing'
          : 'Distinct scene nodes share mesh buffers; no GPU instancing; submitted triangles include every copy',
      },
    });
    assert.equal(fixture.stats.parts, authored.stats.parts * copies);
    assert.equal(fixture.stats.triangles, authored.stats.triangles * copies);
    assert.equal(fixture.stats.lineSegments, authored.stats.lineSegments * copies);
    assert.equal(fixture.stats.uniqueTriangles, authored.stats.uniqueTriangles * (independent ? copies : 1));
  }
  await writeFile(
    resolve(output, 'catalog.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        coordinateSystem: { unit: 'meter', upAxis: 'Y' },
        generatorSha256: hash(new Uint8Array(await readFile(new URL(import.meta.url)))),
        dependencies: { replicad: '0.23.4-beta.2', opencascade: '0.23.0-beta.0', gltfTransform: '4.4.0' },
        validation: {
          nativeGapMillimeters: gapSizes,
          nativeGapMaximumErrorMillimeters: 1e-7,
          scaleErrors,
          couponErrors,
          result: 'passed',
        },
        fixtures,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Catalog complete: ${fixtures.length} assets at ${resolve(output, 'catalog.json')}`);
};

try {
  await main();
} catch (error) {
  console.error('Renderer calibration catalog failed:', error);
  process.exitCode = 1;
}
