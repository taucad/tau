/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * OpenCascade shape meshing and native GLB export via RWGltf_CafWriter.
 *
 * Uses OpenCASCADE's native XCAF document + RWGltf_CafWriter to produce GLB
 * directly, eliminating manual vertex extraction and the gltf-transform dependency.
 */

import { Accessor, NodeIO, Primitive } from '@gltf-transform/core';
import { compactTriangleIndices, normalizeGltfGeometryNames, srgbHexToLinearTuple } from '@taucad/geometry-core';
import { cadMaterialDefaults } from '@taucad/runtime/types';
import type { OpenCascadeInstance } from 'libcascade/init';
import type { ShapeEntry } from '#opencascade.types.js';
import { createOcScope } from '@taucad/occt-core';

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
  const io = new NodeIO();
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
 * Mesh OpenCascade shapes and export to GLB using native RWGltf_CafWriter.
 *
 * Creates an XCAF document, adds shapes with optional colors, meshes them,
 * then uses OpenCASCADE's native GLTF writer to produce a binary GLB.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param shapes - Shapes with optional color/opacity metadata
 * @param options - Meshing parameters (linear deflection, angular deflection)
 * @returns GLB binary as a Uint8Array
 */
export async function meshShapesToGltf(
  oc: OpenCascadeInstance,
  shapes: ShapeEntry[],
  options: MeshOptions,
): Promise<Uint8Array<ArrayBuffer>> {
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

  const tagged = await tagGlbMeshAndNodesFromShapeEntries(result, shapes);
  return normalizeGltfGeometryNames(tagged, {
    format: 'glb',
    materialNamePolicy: 'clear-all',
    sceneNamePolicy: 'clear-generated',
    sceneNameSource: 'external-generated',
  });
}
