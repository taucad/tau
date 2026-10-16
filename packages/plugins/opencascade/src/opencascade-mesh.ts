/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * OpenCascade shape meshing and native GLB export via RWGltf_CafWriter.
 *
 * Uses OpenCASCADE's native XCAF document + RWGltf_CafWriter to produce GLB
 * directly, eliminating manual vertex extraction and the gltf-transform dependency.
 */

import { Accessor, WebIO, Primitive } from '@gltf-transform/core';
import { compactTriangleIndices, normalizeGltfGeometryNames, srgbHexToLinearTuple } from '@taucad/geometry-core';
import { cadMaterialDefaults } from '@taucad/runtime/types';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';
import type { OpenCascadeInstance } from 'libcascade/init';
import type { ShapeEntry } from '#opencascade.types.js';
import {
  createOcScope,
  createTessellationDowngradedIssue,
  resolveOcctTessellation,
  tessellateWithinOcctBudget,
} from '@taucad/occt-core';
import type { OcctResolvedTessellation, OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';

type MeshOptions = {
  linearTolerance: number;
  angularTolerance: number;
  inParallel?: boolean;
  coordinateSystem?: 'y-up' | 'z-up';
  unit?: {
    length?: 'meter' | 'millimeter';
  };
};

/**
 * RWGltf_CafWriter may merge or reorder meshes relative to `ShapeEntry` order.
 * Assign `ShapeConfig.name` onto the first `min(meshes, entries)` glTF meshes,
 * then propagate mesh names to parent nodes when nodes are anonymous — mirrors
 * the invariants `analyzeGlb` relies on for per-part feedback.
 *
 * @param glb - Source GLB bytes emitted by OpenCascade.
 * @param entries - Shape entries whose names should be projected onto meshes.
 * @returns The tagged GLB.
 */
const tagGlbMeshAndNodesFromShapeEntries = async (
  glb: Uint8Array<ArrayBuffer>,
  entries: ShapeEntry[],
): Promise<Uint8Array<ArrayBuffer>> => {
  const io = new WebIO();
  const document = await io.readBinary(glb);
  const meshes = document.getRoot().listMeshes();
  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      if (primitive.getMode() !== Primitive.Mode['TRIANGLES'] || !positions?.getArray()) {
        continue;
      }
      const indices = primitive.getIndices();
      const sourceIndices =
        indices?.getArray() ?? Uint32Array.from({ length: positions.getCount() }, (_, index) => index);
      const compacted = compactTriangleIndices({ positions: positions.getArray()!, indices: sourceIndices });
      if (compacted.removed === 0) {
        continue;
      }
      if (indices) {
        indices.setArray(compacted.indices);
      } else {
        const buffer = positions.getBuffer() ?? document.getRoot().listBuffers()[0] ?? document.createBuffer();
        primitive.setIndices(
          document.createAccessor().setType(Accessor.Type['SCALAR']!).setBuffer(buffer).setArray(compacted.indices),
        );
      }
    }
  }
  const limit = Math.min(meshes.length, entries.length);
  for (let i = 0; i < limit; i++) {
    const label = entries[i]?.name;
    if (label) {
      meshes[i]!.setName(label);
    }
  }
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    const meshName = mesh?.getName().trim();
    if (meshName && node.getName().trim() === '') {
      node.setName(meshName);
    }
  }
  return io.writeBinary(document);
};

const requireShapeEntryName = (entry: ShapeEntry): string => {
  if (!entry.name) {
    throw new Error('OpenCascade ShapeEntry names must be normalized before GLB export.');
  }

  return entry.name;
};

/**
 * Parse a hex color string into an RGB tuple.
 *
 * @param hex - The hex color string to parse.
 * @returns The RGB tuple.
 * @public
 */
export function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Mesh a shape in OCCT's absolute mode: the linear deflection is millimetres, never a ratio.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param shape - The shape to mesh in place.
 * @param options - Linear deflection in mm, angular deflection in radians, and parallel meshing.
 * @returns The mesher, which the caller deletes.
 */
export function createIncrementalMesh(
  oc: OpenCascadeInstance,
  shape: ShapeEntry['shape'],
  options: Pick<MeshOptions, 'linearTolerance' | 'angularTolerance' | 'inParallel'>,
): { delete(): void } {
  return new oc.BRepMesh_IncrementalMesh(
    shape,
    options.linearTolerance,
    false,
    options.angularTolerance,
    options.inParallel ?? false,
  );
}

/**
 * Mesh OpenCascade shapes and write them as a raw GLB with native RWGltf_CafWriter.
 *
 * Creates an XCAF document, adds shapes with optional colors, meshes them in
 * absolute mode, then uses OpenCASCADE's native GLTF writer. The bytes still need
 * {@link finishShapesGlb} before delivery; {@link countGlbMesh} can read them first.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param shapes - Shapes with optional color/opacity metadata
 * @param options - Meshing parameters (linear deflection in mm, angular deflection in radians)
 * @returns Raw GLB bytes as written by OpenCASCADE
 */
export function writeShapesGlb(
  oc: OpenCascadeInstance,
  shapes: ShapeEntry[],
  options: MeshOptions,
): Uint8Array<ArrayBuffer> {
  const scope = createOcScope();
  let result: Uint8Array<ArrayBuffer>;

  try {
    const documentName = scope.track(new oc.TCollection_ExtendedString());
    const document = scope.track(new oc.TDocStd_Document(documentName));
    const mainLabel = scope.track(document.Main());
    const shapeTool = scope.track(oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel));
    const colorTool = scope.track(oc.XCAFDoc_DocumentTool.ColorTool(mainLabel));

    for (const entry of shapes) {
      if (entry.shape.IsNull()) {
        continue;
      }

      // Per-entry temporaries are freed each iteration; labels outlive the loop
      // because `writer.Perform` reads them from the document.
      const entryScope = createOcScope();
      try {
        oc.BRepTools.Clean(entry.shape, false);
        entryScope.track(createIncrementalMesh(oc, entry.shape, options));

        const label = scope.track(shapeTool.NewShape());
        shapeTool.SetShape(label, entry.shape);

        const shapeLabelName = entryScope.track(new oc.TCollection_ExtendedString(requireShapeEntryName(entry)));
        oc.TDataStd_Name.Set(label, shapeLabelName);

        if (entry.color) {
          const [r, g, b] = parseHexColor(entry.color);
          const color = entryScope.track(new oc.Quantity_Color(r, g, b, oc.Quantity_TypeOfColor.Quantity_TOC_sRGB));
          colorTool.SetColor(label, color, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
        }

        if (entry.metalness !== undefined || entry.roughness !== undefined) {
          const visTool = entryScope.track(oc.XCAFDoc_DocumentTool.VisMaterialTool(mainLabel));
          const pbrMat = entryScope.track(new oc.XCAFDoc_VisMaterialPBR());
          if (entry.color) {
            // The 4-double `Quantity_ColorRGBA` constructor treats inputs as
            // **linear** RGB. CSS hex strings are sRGB, so convert per channel —
            // see docs/policy/color-space-policy.md.
            const [r, g, b, alpha] = srgbHexToLinearTuple(entry.color, entry.opacity ?? 1);
            const baseColor = entryScope.track(new oc.Quantity_ColorRGBA(r, g, b, alpha));
            pbrMat.BaseColor = baseColor;
          }
          pbrMat.Metallic = entry.metalness ?? cadMaterialDefaults.metalnessFactor;
          pbrMat.Roughness = entry.roughness ?? cadMaterialDefaults.roughnessFactor;
          pbrMat.IsDefined = true;
          const visMat = entryScope.track(new oc.XCAFDoc_VisMaterial());
          visMat.SetPbrMaterial(pbrMat);
          const matName = entryScope.track(new oc.TCollection_AsciiString('tau-material'));
          const visMatLabel = entryScope.track(visTool.AddMaterial(visMat, matName));
          visTool.SetShapeMaterial(label, visMatLabel);
        }
      } finally {
        entryScope.dispose();
      }
    }

    const outputPath = `/tmp/export_${Date.now()}.glb`;
    const writerPath = scope.track(new oc.TCollection_AsciiString(outputPath));
    const writer = scope.track(new oc.RWGltf_CafWriter(writerPath, true));

    const converter = scope.track(new oc.RWMesh_CoordinateSystemConverter());
    converter.SetInputLengthUnit(0.001);
    converter.SetInputCoordinateSystem(oc.RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Zup);
    converter.SetOutputLengthUnit(options.unit?.length === 'millimeter' ? 0.001 : 1);
    const outputSystem =
      options.coordinateSystem === 'z-up'
        ? oc.RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Zup
        : oc.RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_glTF;
    converter.SetOutputCoordinateSystem(outputSystem);
    writer.SetCoordinateSystemConverter(converter);

    const pbrMat = scope.track(new oc.XCAFDoc_VisMaterialPBR());
    pbrMat.Metallic = cadMaterialDefaults.metalnessFactor;
    pbrMat.Roughness = cadMaterialDefaults.roughnessFactor;
    const visMat = scope.track(new oc.XCAFDoc_VisMaterial());
    visMat.SetPbrMaterial(pbrMat);
    const defaultStyle = scope.track(new oc.XCAFPrs_Style());
    defaultStyle.SetMaterial(visMat);
    writer.SetDefaultStyle(defaultStyle);

    const progress = scope.track(new oc.Message_ProgressRange());
    const fileInfo = scope.track(new oc.TColStd_IndexedDataMapOfStringString());
    if (!writer.Perform(document, fileInfo, progress)) {
      throw new Error('OpenCascade failed to export GLB');
    }

    const glbData = oc.FS.readFile(outputPath, { encoding: 'binary' }) as Uint8Array<ArrayBuffer>;
    result = new Uint8Array(glbData);

    oc.FS.unlink(outputPath);
  } finally {
    scope.dispose();
  }

  return result;
}

/**
 * Name meshes and nodes after their shape entries and normalize geometry names, turning
 * {@link writeShapesGlb} output into the delivered GLB.
 *
 * @param glb - Raw GLB bytes from {@link writeShapesGlb}.
 * @param shapes - The shape entries the GLB was written from.
 * @returns The delivered GLB.
 */
export async function finishShapesGlb(
  glb: Uint8Array<ArrayBuffer>,
  shapes: ShapeEntry[],
): Promise<Uint8Array<ArrayBuffer>> {
  const tagged = await tagGlbMeshAndNodesFromShapeEntries(glb, shapes);
  return normalizeGltfGeometryNames(tagged, {
    format: 'glb',
    materialNamePolicy: 'clear-all',
    sceneNamePolicy: 'clear-generated',
    sceneNameSource: 'external-generated',
  });
}

/** Triangles and vertices of a mesh. */
export type MeshCount = { triangles: number; vertices: number };

type GlbJson = {
  meshes?: Array<{
    primitives: Array<{ mode?: number; indices?: number; attributes: Partial<Record<string, number>> }>;
  }>;
  accessors?: Array<{ count: number }>;
};

const glbHeaderBytes = 12;
const glbChunkHeaderBytes = 8;
const gltfTrianglesMode = 4;

/**
 * Triangles and vertices of every triangle primitive in a GLB, read from its JSON chunk
 * without decoding any buffer.
 *
 * @param glb - GLB bytes.
 * @returns Triangle and vertex counts summed over every triangle primitive.
 */
export function countGlbMesh(glb: Uint8Array<ArrayBuffer>): MeshCount {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonStart = glbHeaderBytes + glbChunkHeaderBytes;
  const jsonLength = view.getUint32(glbHeaderBytes, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(jsonStart, jsonStart + jsonLength))) as GlbJson;
  const accessorCount = (index: number | undefined): number =>
    index === undefined ? 0 : (json.accessors?.[index]?.count ?? 0);
  let triangles = 0;
  let vertices = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? gltfTrianglesMode) !== gltfTrianglesMode) {
        continue;
      }
      const positions = accessorCount(primitive.attributes['POSITION']);
      triangles += (primitive.indices === undefined ? positions : accessorCount(primitive.indices)) / 3;
      vertices += positions;
    }
  }
  return { triangles, vertices };
}

const binaryStlHeaderBytes = 80;
const binaryStlTriangleBytes = 50;

/**
 * Triangles in an STL file. A file whose length matches its binary header count is binary;
 * any other file is ASCII and its facets are counted.
 *
 * @param bytes - STL file bytes.
 * @returns The triangle count.
 */
export function countStlTriangles(bytes: Uint8Array<ArrayBuffer>): number {
  if (bytes.byteLength >= binaryStlHeaderBytes + 4) {
    const declared = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      binaryStlHeaderBytes,
      true,
    );
    if (bytes.byteLength === binaryStlHeaderBytes + 4 + declared * binaryStlTriangleBytes) {
      return declared;
    }
  }
  return new TextDecoder().decode(bytes).match(/^\s*facet\b/gm)?.length ?? 0;
}

/**
 * Bounding-box diagonal of every shape entry together, in model millimetres. Reads the B-rep
 * geometry rather than any triangulation, so the result does not depend on earlier meshing.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param shapes - Shape entries about to be meshed.
 * @returns The diagonal, or `NaN` when no shape has extent.
 */
export function measureShapesDiagonal(oc: OpenCascadeInstance, shapes: readonly ShapeEntry[]): number {
  const scope = createOcScope();
  try {
    const box = scope.track(new oc.Bnd_Box());
    for (const entry of shapes) {
      if (!entry.shape.IsNull()) {
        oc.BRepBndLib.AddOptimal(entry.shape, box, false, false);
      }
    }
    if (box.IsVoid()) {
      return Number.NaN;
    }
    return Math.hypot(box.GetXMax() - box.GetXMin(), box.GetYMax() - box.GetYMin(), box.GetZMax() - box.GetZMin());
  } finally {
    scope.dispose();
  }
}

/** A tessellation request: a preset or explicit tolerances, and the field values an explicit request omits. */
export type OpencascadeTessellationRequest = Readonly<{
  tessellation: OcctTessellation;
  explicitDefaults: OcctTessellationTolerances;
}>;

/**
 * Resolve a tessellation request into absolute tolerances. Explicit tolerances never measure the shapes.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param shapes - Shape entries about to be meshed.
 * @param request - The preset or explicit tolerances.
 * @returns Absolute tolerances in millimetres and degrees, and the requested form.
 */
export function resolveOpencascadeTessellation(
  oc: OpenCascadeInstance,
  shapes: readonly ShapeEntry[],
  request: OpencascadeTessellationRequest,
): OcctResolvedTessellation {
  return resolveOcctTessellation({ ...request, measureDiagonal: () => measureShapesDiagonal(oc, shapes) });
}

/**
 * The mesher's arguments: OCCT takes the angular deflection in radians.
 *
 * @param tolerances - Absolute tolerances in millimetres and degrees.
 * @returns Linear deflection in millimetres and angular deflection in radians.
 */
export function toMeshTolerances(
  tolerances: OcctTessellationTolerances,
): Pick<MeshOptions, 'linearTolerance' | 'angularTolerance'> {
  return {
    linearTolerance: tolerances.linearTolerance,
    angularTolerance: tolerances.angularTolerance * (Math.PI / 180),
  };
}

/** A rendering within a triangle budget, with its cost report and any downgrade warning. */
export type BudgetedGlb = {
  content: Uint8Array<ArrayBuffer>;
  tessellation: TessellationReport;
  issues: KernelIssue[];
};

/**
 * Render a preview GLB within a triangle budget. The request resolves to absolute tolerances;
 * while the mesh exceeds the budget it is re-meshed one step coarser, at most three times, and
 * a `TESSELLATION_DOWNGRADED` warning names the requested and effective tolerances.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param shapes - The shape entries to render.
 * @param options - Request, triangle budget and parallel meshing.
 * @returns The delivered GLB, its tessellation report and the downgrade warning when one was taken.
 */
export async function renderShapesWithinBudget(
  oc: OpenCascadeInstance,
  shapes: ShapeEntry[],
  options: { request: OpencascadeTessellationRequest; budget: number; inParallel?: boolean },
): Promise<BudgetedGlb> {
  const { request, budget, inParallel } = options;
  const started = performance.now();
  const requested = resolveOpencascadeTessellation(oc, shapes, request);
  const { result, effective, downgraded } = tessellateWithinOcctBudget({
    tolerances: requested,
    budget,
    tessellate(tolerances) {
      const glb = writeShapesGlb(oc, shapes, { ...toMeshTolerances(tolerances), inParallel });
      return { glb, ...countGlbMesh(glb) };
    },
  });
  const content = await finishShapesGlb(result.glb, shapes);
  const delivered = countGlbMesh(content);
  return {
    content,
    tessellation: {
      ...delivered,
      elapsed: performance.now() - started,
      requested: requested.requested,
      linearTolerance: effective.linearTolerance,
      angularTolerance: effective.angularTolerance,
      downgraded,
    },
    issues:
      downgraded === 0
        ? []
        : [
            createTessellationDowngradedIssue({
              producer: 'opencascade',
              requested,
              effective,
              downgraded,
              triangles: delivered.triangles,
              budget,
            }),
          ],
  };
}
