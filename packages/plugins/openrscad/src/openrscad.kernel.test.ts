/* oxlint-disable typescript/no-unsafe-assignment -- dynamic plugin test definitions erase context and handle types. */
/* eslint-disable @typescript-eslint/naming-convention -- fixture keys are virtual file paths and OpenSCAD group names. */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import type { ExportShape3DOutput } from '@taulabs/openrscad-engine';
import {
  createMockKernelRuntime,
  getBoundingBoxFromInspect,
  getAllMaterialBaseColors,
  getGeometryStatsFromInspect,
  getInspectReport,
  getSignedVolumeFromGlb,
  expectLinearBaseColor,
  readGltfNamingSummary,
  validateGlbData,
} from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { openrscadExportSchemas, openrscadKernel, openrscadRenderSchema } from '#openrscad.kernel.js';

const renderOptions = {
  tessellation: { segments: 0, minimumAngle: 12, minimumSize: 2 },
} as const;

const createRuntime = (files: Record<string, string | Uint8Array<ArrayBuffer>>) =>
  createMockKernelRuntime({
    filesystemOverrides: {
      readFileResult: async (path) => {
        const content = files[path];
        if (content !== undefined) {
          return content;
        }
        throw Object.assign(new Error(`Missing ${path}`), { code: 'ENOENT' });
      },
    },
  });

const renderModel = async (input: {
  definition: AnyKernelDefinition;
  runtime: ReturnType<typeof createRuntime>;
  context: unknown;
  entryPath: string;
  parameters?: Record<string, unknown>;
  content?: { includeEdges?: boolean };
}) => {
  const request = {
    entryPath: input.entryPath,
    parameters: input.parameters ?? {},
    options: renderOptions,
  };
  const created = await input.definition.createGeometry(request, input.runtime, input.context);
  if (!input.definition.meshGeometry) {
    throw new Error('Expected OpenRSCAD meshGeometry');
  }
  const meshed = await input.definition.meshGeometry(
    { nativeHandle: created.nativeHandle, options: renderOptions, content: input.content },
    input.runtime,
    input.context,
  );
  return { ...created, geometry: meshed.geometry };
};

type GlbJson = {
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    count: number;
    min?: number[];
    max?: number[];
    type?: string;
  }>;
  bufferViews?: Array<{ byteLength: number; byteOffset?: number }>;
  materials?: Array<{
    alphaMode?: string;
    doubleSided?: boolean;
    name?: string;
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
    };
  }>;
  meshes?: Array<{
    primitives: Array<{
      attributes?: { POSITION?: number };
      extras?: unknown;
      indices?: number;
      material?: number;
      mode?: number;
    }>;
  }>;
  nodes?: Array<{
    children?: number[];
    extras?: {
      openrscad?: {
        attribution?: 'ambiguous' | 'exact';
        callSite?: { end: number; source: string; sourceId: number; start: number };
        contributors?: unknown;
        definitionSite?: { end: number; source: string; sourceId: number; start: number };
        fallback?: boolean;
        moduleName?: string;
        provenance?: unknown;
      };
    };
    mesh?: number;
    name?: string;
  }>;
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
};

const readGlbJson = (bytes: Uint8Array<ArrayBuffer>): GlbJson => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GlbJson;
};

/** Feature-edge line segments across every mesh in the document. */
const countLineSegments = (json: GlbJson): number =>
  (json.meshes ?? [])
    .flatMap((mesh) => mesh.primitives)
    .filter((primitive) => primitive.mode === 1)
    .reduce((total, primitive) => total + (json.accessors?.[primitive.indices ?? -1]?.count ?? 0) / 2, 0);

/**
 * Vertices touched by exactly one segment. A patch boundary on a closed surface
 * closes on itself or runs into a junction, so a lone endpoint is a seam that
 * eroded halfway — the failure a segment total cannot see.
 */
const countDanglingEndpoints = (bytes: Uint8Array<ArrayBuffer>, json: GlbJson): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const binaryOffset = 20 + jsonLength + ((4 - (jsonLength % 4)) % 4) + 8;
  const read = <T extends Float32Array | Uint32Array>(accessorIndex: number, build: (buffer: ArrayBuffer) => T): T => {
    const accessor = json.accessors?.[accessorIndex];
    const bufferView = json.bufferViews?.[accessor?.bufferView ?? -1];
    if (!accessor || !bufferView) {
      throw new Error(`Missing accessor ${accessorIndex}`);
    }
    const components = accessor.type === 'VEC3' ? 3 : 1;
    const start = bytes.byteOffset + binaryOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return build(bytes.buffer.slice(start, start + accessor.count * components * 4));
  };

  let dangling = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.mode !== 1) {
        continue;
      }
      const positions = read(primitive.attributes?.POSITION ?? -1, (buffer) => new Float32Array(buffer));
      const indices = read(primitive.indices ?? -1, (buffer) => new Uint32Array(buffer));
      const valence = new Map<string, number>();
      for (const index of indices) {
        const key = `${positions[index * 3]},${positions[index * 3 + 1]},${positions[index * 3 + 2]}`;
        valence.set(key, (valence.get(key) ?? 0) + 1);
      }
      for (const count of valence.values()) {
        if (count === 1) {
          dangling += 1;
        }
      }
    }
  }
  return dangling;
};

const read3mfDocument = async (bytes: Uint8Array<ArrayBuffer>): Promise<Document> => {
  const archive = await JSZip.loadAsync(bytes);
  const model = archive.file('3D/3dmodel.model');
  if (!model) {
    throw new Error('3D/3dmodel.model not found in 3MF');
  }
  const document_ = new JSDOM(await model.async('string'), { contentType: 'text/xml' }).window.document;
  const parserError = document_.querySelector('parsererror');
  if (parserError) {
    throw new Error(`Invalid 3MF model XML: ${parserError.textContent}`);
  }
  return document_;
};

const readSemanticManifest = (json: GlbJson) => {
  const parents = new Map<number, number>();
  for (const [parent, node] of (json.nodes ?? []).entries()) {
    for (const child of node.children ?? []) {
      parents.set(child, parent);
    }
  }

  return (json.nodes ?? []).map((node, index) => {
    const mesh = json.meshes?.[node.mesh!];
    const surfacePrimitives = (mesh?.primitives ?? []).filter((primitive) => (primitive.mode ?? 4) === 4);
    const parent = parents.get(index);
    return {
      name: node.name,
      parent: parent === undefined ? null : json.nodes?.[parent]?.name,
      children: (node.children ?? []).map((child) => json.nodes?.[child]?.name),
      moduleName: node.extras?.openrscad?.moduleName,
      definitionSource: node.extras?.openrscad?.definitionSite?.source,
      attribution: node.extras?.openrscad?.attribution,
      triangleCount: surfacePrimitives.reduce(
        (total, primitive) => total + (json.accessors?.[primitive.indices ?? -1]?.count ?? 0) / 3,
        0,
      ),
      materialNames: surfacePrimitives.map((primitive) => json.materials?.[primitive.material ?? -1]?.name),
    };
  });
};

describe('OpenRSCADKernel', () => {
  it('matches OpenRSCAD normal render quality while retaining explicit export quality', () => {
    expect(openrscadRenderSchema.parse({}).tessellation).toEqual({});
    expect(openrscadExportSchemas.glb.parse({}).tessellation).toEqual({
      segments: 32,
      minimumAngle: 12,
      minimumSize: 2,
    });
  });

  it('preserves tessellation authored in the model unless Tau explicitly overrides it', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/model.scad': '$fn = 64; sphere(10);' });
    const context = await definition.initialize({}, runtime);
    const render = async (tessellation: Record<string, number>) =>
      definition.createGeometry(
        { entryPath: '/project/model.scad', parameters: {}, options: { tessellation } },
        runtime,
        context,
      );

    const modelQuality = await render(openrscadRenderSchema.parse({}).tessellation);
    const matchingOverride = await render({ segments: 64 });
    const draftOverride = await render({ segments: 16 });

    expect(modelQuality.nativeHandle.stats.triangleCount).toBe(matchingOverride.nativeHandle.stats.triangleCount);
    expect(modelQuality.nativeHandle.stats.triangleCount).toBeGreaterThan(
      draftOverride.nativeHandle.stats.triangleCount,
    );
  });

  it('advertises native edges only for render and GLB while exposing native 3MF', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    expect(definition.render?.content).toEqual(['includeEdges']);
    expect(Object.keys(definition.exportFormats)).toEqual(['glb', '3mf']);
    expect(definition.exportFormats.glb.content).toEqual(['includeEdges']);
    expect(definition.exportFormats['3mf']).not.toHaveProperty('content');
  });

  it('invalidates caches with the published engine version', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    // Geometry caches key on this string, so it has to move whenever the engine
    // build does. It used to be a hand-counted `-native-parts.N` suffix because
    // the fork was consumed as a local tarball; now it is the published version
    // of @taulabs/openrscad-engine, which cannot silently fall behind.
    expect(definition.version).toBe('0.11.0-beta.1');
  });

  it('handles SCAD through the environment-neutral OpenRSCAD API', async () => {
    const plugin = openrscadKernel();
    expect(plugin.id).toBe('openrscad');
    expect(plugin.extensions).toEqual(['scad']);

    const definition = await resolveRuntimePluginDefinition('kernel', plugin);
    const runtime = createRuntime({ '/project/model.scad': 'cube(10);' });
    const context = await definition.initialize({}, runtime);
    const result = await renderModel({ definition, runtime, context, entryPath: '/project/model.scad' });

    expect(result.nativeHandle.stats).toMatchObject({ triangleCount: 12, vertexCount: 8, volume: 1000 });
    expect(result.geometry.format).toBe('gltf');
    if (result.geometry.format !== 'gltf') {
      throw new Error('Expected GLB render geometry');
    }
    validateGlbData(result.geometry.content);
    const report = await getInspectReport(result.geometry.content);
    expect(getGeometryStatsFromInspect(report)).toEqual({ vertexCount: 36, faceCount: 12, meshCount: 1 });
    expect(getBoundingBoxFromInspect(report)?.size).toEqual([0.01, 0.01, 0.01]);
    await expect(readGltfNamingSummary(result.geometry.content)).resolves.toEqual({
      nodeNames: ['#F5A523FF Shape 1'],
      meshNames: ['#F5A523FF Shape 1'],
      materialNames: ['#F5A523FF Material'],
      sceneNames: [''],
    });
  });

  it('preserves authored colors in preview and exported GLB materials', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': `
color("red") cube(2);
translate([4, 0, 0]) color("#808080") cube(2);
translate([8, 0, 0]) color("blue", 0.5) cube(2);
`,
    });
    const context = await definition.initialize({}, runtime);
    const created = await renderModel({ definition, runtime, context, entryPath: '/project/model.scad' });
    if (created.geometry.format !== 'gltf') {
      throw new Error('Expected GLB render geometry');
    }

    const readColors = async (content: Uint8Array<ArrayBuffer>) =>
      getAllMaterialBaseColors({ success: true, data: { format: 'gltf', content, hash: 'test' }, issues: [] });
    const assertColors = async (content: Uint8Array<ArrayBuffer>) => {
      const colors = await readColors(content);
      const naming = await readGltfNamingSummary(content);
      const names = naming.materialNames;
      const byName = Object.fromEntries(names.map((name, index) => [name, colors[index]!])) as Record<
        string,
        (typeof colors)[number]
      >;
      expect(colors).toHaveLength(3);
      expectLinearBaseColor(byName['#FF0000FF Material']!, '#FF0000');
      expectLinearBaseColor(byName['#808080FF Material']!, '#808080');
      expectLinearBaseColor(byName['#0000FF80 Material']!, '#0000FF', { opacity: 0.5 });
    };

    await assertColors(created.geometry.content);
    const previewMaterials = readGlbJson(created.geometry.content).materials ?? [];
    expect(
      previewMaterials.map((material) => ({
        name: material.name,
        alphaMode: material.alphaMode ?? 'OPAQUE',
        doubleSided: material.doubleSided ?? false,
        metallicFactor: material.pbrMetallicRoughness?.metallicFactor,
        roughnessFactor: material.pbrMetallicRoughness?.roughnessFactor,
      })),
    ).toEqual([
      {
        name: '#0000FF80 Material',
        alphaMode: 'BLEND',
        doubleSided: true,
        metallicFactor: 0.1,
        roughnessFactor: 0.6,
      },
      {
        name: '#808080FF Material',
        alphaMode: 'OPAQUE',
        doubleSided: true,
        metallicFactor: 0.1,
        roughnessFactor: 0.6,
      },
      {
        name: '#FF0000FF Material',
        alphaMode: 'OPAQUE',
        doubleSided: true,
        metallicFactor: 0.1,
        roughnessFactor: 0.6,
      },
    ]);
    const exported = await definition.exportGeometry(
      {
        format: 'glb',
        nativeHandle: created.nativeHandle,
        options: {
          ...renderOptions,
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        },
      },
      runtime,
      context,
    );
    expect(exported.success).toBe(true);
    if (!exported.success) {
      throw new Error('Expected successful GLB export');
    }
    await assertColors(exported.data[0]!.bytes);
  });

  it('keeps overlapping authored siblings complete while retaining exact aggregate statistics', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': `
color("red") cube(2);
translate([1, 0, 0]) color("blue") cube(2);
`,
    });
    const context = await definition.initialize({}, runtime);
    const created = await renderModel({ definition, runtime, context, entryPath: '/project/model.scad' });
    if (created.geometry.format !== 'gltf') {
      throw new Error('Expected GLB render geometry');
    }

    expect(created.nativeHandle.stats.volume).toBeCloseTo(12, 6);
    await expect(getSignedVolumeFromGlb(created.geometry.content)).resolves.toBeCloseTo(0.000_000_016, 12);
    await expect(readGltfNamingSummary(created.geometry.content)).resolves.toMatchObject({
      nodeNames: ['#0000FFFF Shape 1', '#FF0000FF Shape 1'],
      meshNames: ['#0000FFFF Shape 1', '#FF0000FF Shape 1'],
    });

    const exportInput = {
      format: 'glb',
      nativeHandle: created.nativeHandle,
      options: { ...renderOptions, coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
    } as const;
    const first = await definition.exportGeometry(exportInput, runtime, context);
    const second = await definition.exportGeometry(exportInput, runtime, context);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      throw new Error('Expected successful GLB exports');
    }
    expect(first.data[0]!.bytes).toEqual(second.data[0]!.bytes);
    await expect(getSignedVolumeFromGlb(first.data[0]!.bytes)).resolves.toBeCloseTo(16, 6);
  });

  it('keeps boolean differences exact instead of reconstructing provenance operands', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': `
color("red") difference() {
  cube(2);
  translate([1, 0, 0]) cube(2);
}
`,
    });
    const context = await definition.initialize({}, runtime);
    const created = await renderModel({ definition, runtime, context, entryPath: '/project/model.scad' });
    if (created.geometry.format !== 'gltf') {
      throw new Error('Expected GLB render geometry');
    }

    expect(created.nativeHandle.stats.volume).toBeCloseTo(4, 6);
    await expect(getSignedVolumeFromGlb(created.geometry.content)).resolves.toBeCloseTo(0.000_000_004, 12);
    await expect(readGltfNamingSummary(created.geometry.content)).resolves.toMatchObject({
      nodeNames: ['#FF0000FF Shape 1'],
      meshNames: ['#FF0000FF Shape 1'],
      materialNames: ['#FF0000FF Material'],
    });
  });

  it('keeps preview modifiers factual while omitting background geometry from exact export', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': `
# color("red") translate([0, 0, 12]) cube(10);
% color("blue") translate([0, 0, -12]) cube(10);
color("green") cube(10);
`,
    });
    const context = await definition.initialize({}, runtime);
    const preview = await renderModel({ definition, runtime, context, entryPath: '/project/model.scad' });
    if (preview.geometry.format !== 'gltf') {
      throw new Error('Expected GLB preview geometry');
    }
    const previewJson = readGlbJson(preview.geometry.content);
    expect(previewJson.nodes?.map((node) => node.name)).toEqual([
      '#008000FF Shape 1',
      '#FF0000FF Shape 1',
      '#0000FFFF Shape 1',
    ]);
    expect(previewJson.materials?.map((material) => [material.name, material.alphaMode ?? 'OPAQUE'])).toEqual([
      ['#0000FFFF Material', 'OPAQUE'],
      ['#008000FF Material', 'OPAQUE'],
      ['#FF0000FF Material', 'OPAQUE'],
    ]);

    const exported = await definition.exportGeometry(
      {
        format: 'glb',
        nativeHandle: preview.nativeHandle,
        options: { ...renderOptions, coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      },
      runtime,
      context,
    );
    expect(exported.success).toBe(true);
    if (!exported.success) {
      throw new Error('Expected exact GLB export');
    }
    const exportedJson = readGlbJson(exported.data[0]!.bytes);
    expect(exportedJson.nodes?.map((node) => node.name)).toEqual(['#008000FF Shape 1', '#FF0000FF Shape 1']);
    expect(exportedJson.materials?.map((material) => material.name)).toEqual([
      '#008000FF Material',
      '#FF0000FF Material',
    ]);
  });

  it('emits spatially distinct authored occurrences as selectable provenance nodes', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': `
module part() cube(2);
color("red") {
  part();
  translate([0, 0, 5]) part();
}
`,
    });
    const context = await definition.initialize({}, runtime);
    const created = await renderModel({ definition, runtime, context, entryPath: '/project/model.scad' });
    if (created.geometry.format !== 'gltf') {
      throw new Error('Expected GLB render geometry');
    }

    const summary = await readGltfNamingSummary(created.geometry.content);
    expect(summary.nodeNames).toEqual(['Part 1', 'Part 2']);
    expect(summary.meshNames).toEqual(summary.nodeNames);

    const json = readGlbJson(created.geometry.content);
    expect(json.nodes).toHaveLength(2);
    const round = (value: number): number => {
      const rounded = Math.round(value * 1_000_000) / 1_000_000;
      return Object.is(rounded, -0) ? 0 : rounded;
    };
    expect(
      json.nodes?.map((node) => {
        const primitive = json.meshes?.[node.mesh!]?.primitives[0];
        const position = json.accessors?.[primitive?.attributes?.POSITION ?? -1];
        return { min: position?.min?.map(round), max: position?.max?.map(round) };
      }),
    ).toEqual([
      { min: [0, 0, -0.002], max: [0.002, 0.002, 0] },
      { min: [0, 0.005, -0.002], max: [0.002, 0.007, 0] },
    ]);
    expect(
      json.nodes?.map((node) => {
        const primitive = json.meshes?.[node.mesh!]?.primitives[0];
        return {
          primitiveCount: json.meshes?.[node.mesh!]?.primitives.length,
          mode: primitive?.mode,
          triangleCount: (json.accessors?.[primitive?.indices ?? -1]?.count ?? 0) / 3,
          material: json.materials?.[primitive?.material ?? -1]?.name,
        };
      }),
    ).toEqual([
      { primitiveCount: 1, mode: 4, triangleCount: 12, material: '#FF0000FF Material' },
      { primitiveCount: 1, mode: 4, triangleCount: 12, material: '#FF0000FF Material' },
    ]);
    expect(
      json.nodes?.map((node) => ({
        attribution: node.extras?.openrscad?.attribution,
        moduleName: node.extras?.openrscad?.moduleName,
        source: node.extras?.openrscad?.callSite?.source,
      })),
    ).toEqual([
      { attribution: 'exact', moduleName: 'part', source: '<main>' },
      { attribution: 'exact', moduleName: 'part', source: '<main>' },
    ]);
    expect(
      json.nodes?.every(
        (node) => node.extras?.openrscad?.callSite !== undefined && node.extras.openrscad.definitionSite !== undefined,
      ),
    ).toBe(true);
  });

  it('emits optional native owner-local edges without adding Explorer nodes', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/model.scad': 'color("red") cube(2);' });
    const context = await definition.initialize({}, runtime);
    const plain = await renderModel({
      definition,
      runtime,
      context,
      entryPath: '/project/model.scad',
      content: { includeEdges: false },
    });
    const edged = await renderModel({
      definition,
      runtime,
      context,
      entryPath: '/project/model.scad',
      content: { includeEdges: true },
    });
    if (plain.geometry.format !== 'gltf' || edged.geometry.format !== 'gltf') {
      throw new Error('Expected GLB render geometry');
    }

    const plainJson = readGlbJson(plain.geometry.content);
    const edgedJson = readGlbJson(edged.geometry.content);
    expect(plainJson.nodes).toHaveLength(1);
    expect(edgedJson.nodes).toEqual(plainJson.nodes);
    expect(plainJson.meshes?.[0]?.primitives.map((primitive) => primitive.mode ?? 4)).toEqual([4]);
    expect(edgedJson.meshes?.[0]?.primitives.map((primitive) => primitive.mode ?? 4)).toEqual([4, 1]);
    const lineAccessor = edgedJson.meshes?.[0]?.primitives[1]?.indices;
    expect(lineAccessor).toBeTypeOf('number');
    expect(edgedJson.accessors?.[lineAccessor!]?.count).toBe(24);

    const repeated = await definition.meshGeometry!(
      { nativeHandle: edged.nativeHandle, options: renderOptions, content: { includeEdges: true } },
      runtime,
      context,
    );
    expect(repeated.geometry.format).toBe('gltf');
    if (repeated.geometry.format !== 'gltf') {
      throw new Error('Expected repeated edged GLB render geometry');
    }
    expect(repeated.geometry.content).toBe(edged.geometry.content);

    const exportInput = {
      nativeHandle: edged.nativeHandle,
      options: { ...renderOptions, coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
    } as const;
    const plainExport = await definition.exportGeometry(
      { ...exportInput, format: 'glb', content: { includeEdges: false } },
      runtime,
      context,
    );
    const edgedExport = await definition.exportGeometry(
      { ...exportInput, format: 'glb', content: { includeEdges: true } },
      runtime,
      context,
    );
    const repeatedEdgedExport = await definition.exportGeometry(
      { ...exportInput, format: 'glb', content: { includeEdges: true } },
      runtime,
      context,
    );
    expect(plainExport.success).toBe(true);
    expect(edgedExport.success).toBe(true);
    expect(repeatedEdgedExport.success).toBe(true);
    if (!plainExport.success || !edgedExport.success || !repeatedEdgedExport.success) {
      throw new Error('Expected native GLB exports');
    }
    const plainExportJson = readGlbJson(plainExport.data[0]!.bytes);
    const edgedExportJson = readGlbJson(edgedExport.data[0]!.bytes);
    expect(edgedExportJson.nodes).toEqual(plainExportJson.nodes);
    expect(plainExportJson.meshes?.[0]?.primitives.map((primitive) => primitive.mode ?? 4)).toEqual([4]);
    expect(edgedExportJson.meshes?.[0]?.primitives.map((primitive) => primitive.mode ?? 4)).toEqual([4, 1]);
    expect(repeatedEdgedExport.data[0]!.bytes).toEqual(edgedExport.data[0]!.bytes);
  });

  it('exports native object-aware 3MF with one object and build item per spatial solid', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': `
color("red") cube(2);
translate([0, 0, 4]) color("blue") cube(2);
`,
    });
    const context = await definition.initialize({}, runtime);
    const created = await definition.createGeometry(
      { entryPath: '/project/model.scad', parameters: {}, options: renderOptions },
      runtime,
      context,
    );
    const exported = await definition.exportGeometry(
      { format: '3mf', nativeHandle: created.nativeHandle, options: renderOptions },
      runtime,
      context,
    );
    expect(exported.success).toBe(true);
    if (!exported.success) {
      throw new Error('Expected successful 3MF export');
    }
    expect(exported.data[0]?.name).toBe('model.3mf');
    expect(exported.data[0]?.mimeType).toBe('model/3mf');
    const document_ = await read3mfDocument(exported.data[0]!.bytes);
    const objects = [...document_.querySelectorAll('resources > object[type="model"]')];
    const buildItems = [...document_.querySelectorAll('build > item')];
    const materials = [...document_.querySelectorAll('basematerials > base')];
    const triangles = objects.flatMap((object) => [...object.querySelectorAll('mesh > triangles > triangle')]);
    expect(objects.map((object) => object.getAttribute('name'))).toEqual(['#FF0000FF Shape', '#0000FFFF Shape']);
    expect(buildItems.map((item) => item.getAttribute('objectid'))).toEqual(
      objects.map((object) => object.getAttribute('id')),
    );
    expect(materials.map((material) => material.getAttribute('displaycolor'))).toEqual(['#0000FFFF', '#FF0000FF']);
    expect(triangles).toHaveLength(24);
    expect(
      triangles.every(
        (triangle) =>
          triangle.getAttribute('pid') === '1' &&
          triangle.getAttribute('p1') === triangle.getAttribute('p2') &&
          triangle.getAttribute('p2') === triangle.getAttribute('p3'),
      ),
    ).toBe(true);

    const repeated = await definition.exportGeometry(
      { format: '3mf', nativeHandle: created.nativeHandle, options: renderOptions },
      runtime,
      context,
    );
    expect(repeated.success).toBe(true);
    if (!repeated.success) {
      throw new Error('Expected deterministic 3MF export');
    }
    expect(repeated.data[0]!.bytes).toEqual(exported.data[0]!.bytes);

    const roundtripRuntime = createRuntime({
      '/project/roundtrip.scad': 'import("model.3mf");',
      '/project/model.3mf': exported.data[0]!.bytes,
    });
    const roundtripContext = await definition.initialize({}, roundtripRuntime);
    const roundtrip = await renderModel({
      definition,
      runtime: roundtripRuntime,
      context: roundtripContext,
      entryPath: '/project/roundtrip.scad',
    });
    expect(roundtrip.nativeHandle.stats).toMatchObject({ triangleCount: 24, volume: 16 });
    if (roundtrip.geometry.format !== 'gltf') {
      throw new Error('Expected round-tripped 3MF render geometry');
    }
    const roundtripReport = await getInspectReport(roundtrip.geometry.content);
    expect(getBoundingBoxFromInspect(roundtripReport)?.size).toEqual([0.002, 0.006, 0.002]);
    await expect(readGltfNamingSummary(roundtrip.geometry.content)).resolves.toMatchObject({
      nodeNames: ['#0000FFFF Shape 1', '#FF0000FF Shape 1'],
    });
  });

  it('names unchanged 3MF physical solids from authored provenance', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': `
module roof_frame() {
  cube(2);
  translate([0, 0, 4]) cube(2);
}
roof_frame();
`,
    });
    const context = await definition.initialize({}, runtime);
    const created = await definition.createGeometry(
      { entryPath: '/project/model.scad', parameters: {}, options: renderOptions },
      runtime,
      context,
    );
    const exported = await definition.exportGeometry(
      { format: '3mf', nativeHandle: created.nativeHandle, options: renderOptions },
      runtime,
      context,
    );
    expect(exported.success).toBe(true);
    if (!exported.success) {
      throw new Error('Expected successful semantic 3MF export');
    }

    const document_ = await read3mfDocument(exported.data[0]!.bytes);
    const objects = [...document_.querySelectorAll('resources > object[type="model"]')];
    expect(objects.map((object) => object.getAttribute('name'))).toEqual(['Roof Frame 1', 'Roof Frame 2']);
    for (const object of objects) {
      const ownersMetadata = object.querySelector('metadatagroup > metadata[name="openrscad:semanticOwners"]');
      const attributionMetadata = object.querySelector('metadatagroup > metadata[name="openrscad:attribution"]');
      expect(ownersMetadata?.getAttribute('preserve')).toBe('true');
      expect(attributionMetadata?.textContent).toBe('exact');
      const owners = JSON.parse(ownersMetadata?.textContent ?? 'null') as Array<
        Array<{
          moduleName: string;
          callSite: { source: string; start: number; end: number };
          definitionSite: { source: string; start: number; end: number };
        }>
      >;
      expect(owners[0]?.[0]).toMatchObject({
        moduleName: 'roof_frame',
        callSite: { source: '<main>', start: expect.any(Number), end: expect.any(Number) },
        definitionSite: { source: '<main>', start: expect.any(Number), end: expect.any(Number) },
      });
    }
  });

  it('matches the real greenhouse hierarchy and isolates the complete roof frame', async () => {
    const fixtureUrl = new URL('fixtures/greenhouse/', import.meta.url);
    const source = await readFile(new URL('main.scad', fixtureUrl), 'utf8');
    const expected = JSON.parse(await readFile(new URL('manifest.json', fixtureUrl), 'utf8')) as unknown[];
    const runtime = createRuntime({ '/project/main.scad': source });
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const context = await definition.initialize({}, runtime);
    const rendered = await renderModel({ definition, runtime, context, entryPath: '/project/main.scad' });
    if (rendered.geometry.format !== 'gltf') {
      throw new Error('Expected greenhouse GLB');
    }

    const json = readGlbJson(rendered.geometry.content);
    const manifest = readSemanticManifest(json);
    expect(manifest).toEqual(expected);
    expect(rendered.nativeHandle.stats.triangleCount).toBe(4160);
    expect(manifest.reduce((total, node) => total + node.triangleCount, 0)).toBe(1884);
    expect(json.scenes?.[json.scene ?? 0]?.nodes).toEqual([0]);
    expect(json.nodes?.some((node) => node.name?.includes('Shape'))).toBe(false);

    const roofFrameIndex = json.nodes?.findIndex((node) => node.name === 'Roof Frame') ?? -1;
    const roofFrame = json.nodes?.[roofFrameIndex];
    expect(roofFrame?.mesh).toBeUndefined();
    expect(roofFrame?.children).toHaveLength(1);
    const archIndex = roofFrame?.children?.[0] ?? -1;
    const arch = json.nodes?.[archIndex];
    expect(arch?.name).toBe('Arch Hoop');
    const archMesh = json.meshes?.[arch?.mesh ?? -1];
    const archSurface = archMesh?.primitives.find((primitive) => (primitive.mode ?? 4) === 4);
    const archPositions = json.accessors?.[archSurface?.attributes?.POSITION ?? -1];
    const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
    expect(archPositions?.min?.map(round)).toEqual([-6.22e-2, 0.07, -0.092_145]);
    expect(archPositions?.max?.map(round)).toEqual([6.22e-2, 0.131_859, 0.092_145]);
    expect((json.accessors?.[archSurface?.indices ?? -1]?.count ?? 0) / 3).toBe(1100);
    expect(arch?.extras?.openrscad).toMatchObject({
      attribution: 'exact',
      moduleName: 'arch_hoop',
      callSite: { sourceId: 0, source: '<main>', start: 2581, end: 2603 },
      definitionSite: { sourceId: 0, source: '<main>', start: 817, end: 1068 },
    });
    expect(roofFrame?.extras?.openrscad).toMatchObject({
      attribution: 'exact',
      moduleName: 'roof_frame',
      callSite: { sourceId: 0, source: '<main>', start: 7183, end: 7196 },
      definitionSite: { sourceId: 0, source: '<main>', start: 2403, end: 2611 },
    });

    const benches = json.nodes?.filter((node) => node.extras?.openrscad?.moduleName === 'bench') ?? [];
    expect(benches.map((node) => node.name)).toEqual(['Bench 1', 'Bench 2']);
    expect(benches.map((node) => node.extras?.openrscad?.callSite?.start)).toEqual([7348, 7364]);
    expect(benches.map((node) => node.extras?.openrscad?.definitionSite?.start)).toEqual([5636, 5636]);

    const transparentMaterials = (json.materials ?? [])
      .filter((material) => (material.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1) < 1)
      .map((material) => ({
        alpha: round(material.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1),
        alphaMode: material.alphaMode,
        doubleSided: material.doubleSided,
      }));
    expect(transparentMaterials).toEqual([
      { alpha: 0.450_98, alphaMode: 'BLEND', doubleSided: true },
      { alpha: 0.380_392, alphaMode: 'BLEND', doubleSided: true },
      { alpha: 0.239_216, alphaMode: 'BLEND', doubleSided: true },
      { alpha: 0.258_824, alphaMode: 'BLEND', doubleSided: true },
      { alpha: 0.301_961, alphaMode: 'BLEND', doubleSided: true },
    ]);

    const edged = await definition.meshGeometry!(
      { nativeHandle: rendered.nativeHandle, options: renderOptions, content: { includeEdges: true } },
      runtime,
      context,
    );
    if (edged.geometry.format !== 'gltf') {
      throw new Error('Expected edged greenhouse GLB');
    }
    const edgedJson = readGlbJson(edged.geometry.content);
    expect(edgedJson.nodes).toEqual(json.nodes);
    expect(
      edgedJson.nodes
        ?.filter((node) => node.mesh !== undefined)
        .every((node) => edgedJson.meshes?.[node.mesh!]?.primitives.some((primitive) => primitive.mode === 1)),
    ).toBe(true);
    expect(readSemanticManifest(edgedJson)).toEqual(expected);
  }, 30_000);

  it('draws each edge-topology fixture exactly as its defect requires', async () => {
    const fixtureUrl = new URL('fixtures/edge-topology/', import.meta.url);
    const expected = JSON.parse(await readFile(new URL('expected.json', fixtureUrl), 'utf8')) as Array<{
      fixture: string;
      defect: string;
      shipped: number;
      lineSegments: number;
      note: string;
    }>;
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());

    const measured: Array<{ fixture: string; lineSegments: number; dangling: number }> = [];
    for (const { fixture } of expected) {
      /* oxlint-disable no-await-in-loop -- One Wasm engine renders the fixtures serially; running them concurrently would interleave engine state for no gain on eight small models. */
      const source = await readFile(new URL(fixture, fixtureUrl), 'utf8');
      const runtime = createRuntime({ '/project/main.scad': source });
      const context = await definition.initialize({}, runtime);
      const rendered = await renderModel({
        definition,
        runtime,
        context,
        entryPath: '/project/main.scad',
        content: { includeEdges: true },
      });
      if (rendered.geometry.format !== 'gltf') {
        throw new Error(`Expected ${fixture} to render to GLB`);
      }
      const json = readGlbJson(rendered.geometry.content);
      measured.push({
        fixture,
        lineSegments: countLineSegments(json),
        dangling: countDanglingEndpoints(rendered.geometry.content, json),
      });
      /* oxlint-enable no-await-in-loop */
    }

    // One assertion over the whole set, so a failure names every fixture that
    // moved rather than stopping at the first.
    expect(measured).toEqual(expected.map(({ fixture, lineSegments }) => ({ fixture, lineSegments, dangling: 0 })));
  }, 60_000);

  it('gives feature edges the opaque black material the thumbnail path renders', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/main.scad': 'cube(10);' });
    const context = await definition.initialize({}, runtime);
    const rendered = await renderModel({
      definition,
      runtime,
      context,
      entryPath: '/project/main.scad',
      content: { includeEdges: true },
    });
    if (rendered.geometry.format !== 'gltf') {
      throw new Error('Expected GLB');
    }
    const json = readGlbJson(rendered.geometry.content);
    const linePrimitive = json.meshes?.[0]?.primitives.find((primitive) => primitive.mode === 1);
    const material = json.materials?.[linePrimitive?.material ?? -1];

    // Grey edges shipped for as long as this was 15 %-alpha black in BLEND: the
    // viewer re-materialises line primitives and never showed it, but the
    // thumbnail transcoder consumes the GLB exactly as written.
    expect(material?.name).toBe('Feature Edges');
    expect(material?.pbrMetallicRoughness?.baseColorFactor).toEqual([0, 0, 0, 1]);
    expect(material?.pbrMetallicRoughness?.roughnessFactor).toBe(1);
    expect(material?.alphaMode).toBe('OPAQUE');
    expect(linePrimitive?.extras).toBeUndefined();
  });

  it('matches the complete planetary gearbox part manifest', async () => {
    const fixtureUrl = new URL('fixtures/planetary-gearbox/', import.meta.url);
    const fixtureFiles = [
      'main.scad',
      'lib/params.scad',
      'lib/gear.scad',
      'lib/sun.scad',
      'lib/planet.scad',
      'lib/carrier.scad',
      'lib/housing.scad',
      'lib/cap.scad',
      'lib/bearing.scad',
    ];
    const loaded = await Promise.all(
      fixtureFiles.map(async (name) => [name, await readFile(new URL(name, fixtureUrl), 'utf8')] as const),
    );
    const expected = JSON.parse(await readFile(new URL('manifest.json', fixtureUrl), 'utf8')) as unknown[];
    const runtime = createRuntime(Object.fromEntries(loaded.map(([name, source]) => [`/project/${name}`, source])));
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const context = await definition.initialize({}, runtime);
    const rendered = await renderModel({ definition, runtime, context, entryPath: '/project/main.scad' });
    if (rendered.geometry.format !== 'gltf') {
      throw new Error('Expected gearbox GLB');
    }
    const json = readGlbJson(rendered.geometry.content);
    const manifest = readSemanticManifest(json);

    expect(manifest).toEqual(expected);
    expect(rendered.nativeHandle.stats.triangleCount).toBe(35_084);
    expect(manifest.reduce((total, node) => total + node.triangleCount, 0)).toBe(35_216);
    expect(json.scenes?.[json.scene ?? 0]?.nodes).toEqual([0]);
  }, 30_000);

  it('preserves one deduplicated engine warning through render, mesh, GLB, and 3MF results', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/model.scad': 'color("not-a-color") cube(1);' });
    const context = await definition.initialize({}, runtime);
    const created = await definition.createGeometry(
      { entryPath: '/project/model.scad', parameters: {}, options: renderOptions },
      runtime,
      context,
    );
    expect(created.issues).toHaveLength(1);
    expect(created.issues?.[0]).toMatchObject({ severity: 'warning', message: expect.stringContaining('color') });

    const meshed = await definition.meshGeometry!(
      { nativeHandle: created.nativeHandle, options: renderOptions, content: { includeEdges: false } },
      runtime,
      context,
    );
    expect(meshed.issues).toEqual(created.issues);

    const glb = await definition.exportGeometry(
      {
        format: 'glb',
        nativeHandle: created.nativeHandle,
        options: { ...renderOptions, coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      },
      runtime,
      context,
    );
    const threemf = await definition.exportGeometry(
      { format: '3mf', nativeHandle: created.nativeHandle, options: renderOptions },
      runtime,
      context,
    );
    expect(glb.success).toBe(true);
    expect(threemf.success).toBe(true);
    expect(glb.issues).toEqual(created.issues);
    expect(threemf.issues).toEqual(created.issues);
  });

  it('returns structured geometry diagnostics from successful GLB and failed 3MF exports', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': 'union() { cube(10); polyhedron(points=[[0,0,0],[1,0,0],[0,1,0]], faces=[[0,1,2]]); }',
    });
    const context = await definition.initialize({}, runtime);
    const created = await definition.createGeometry(
      { entryPath: '/project/model.scad', parameters: {}, options: renderOptions },
      runtime,
      context,
    );
    const glb = await definition.exportGeometry(
      {
        format: 'glb',
        nativeHandle: created.nativeHandle,
        options: { ...renderOptions, coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      },
      runtime,
      context,
    );
    expect(glb.success).toBe(true);
    expect(glb.issues).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('union') }),
    ]);

    const threemf = await definition.exportGeometry(
      { format: '3mf', nativeHandle: created.nativeHandle, options: renderOptions },
      runtime,
      context,
    );
    expect(threemf.success).toBe(false);
    expect(threemf.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('union') }),
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('not manifold') }),
      ]),
    );
  });

  it('surfaces invalid source as a render failure', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/model.scad': 'cube(;' });
    const context = await definition.initialize({}, runtime);

    await expect(
      definition.createGeometry(
        { entryPath: '/project/model.scad', parameters: {}, options: renderOptions },
        runtime,
        context,
      ),
    ).rejects.toThrow('parse error: unexpected token in expression: Semi');
  });

  it('resolves nested include files and reports the dependency closure', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': 'include <lib/part.scad>\ninclude </shared.scad>\npart(); shared();',
      '/project/lib/part.scad': 'include <dimensions.scad>\nmodule part() cube(size);',
      '/project/lib/dimensions.scad': 'size = 4;',
      '/shared.scad': 'module shared() translate([10, 0, 0]) cube(2);',
    });
    const context = await definition.initialize({}, runtime);

    await expect(definition.getDependencies({ entryPath: '/project/model.scad' }, runtime, context)).resolves.toEqual({
      resolved: ['/project/model.scad', '/project/lib/part.scad', '/project/lib/dimensions.scad', '/shared.scad'],
      unresolved: [],
    });
    const result = await definition.createGeometry(
      { entryPath: '/project/model.scad', parameters: {}, options: renderOptions },
      runtime,
      context,
    );
    expect(result.nativeHandle.stats.volume).toBe(72);
  });

  it('loads static binary import assets through the native Wasm request', async () => {
    const tetrahedron = new TextEncoder().encode(`solid tetrahedron
facet normal 0 0 -1
outer loop
vertex 0 0 0
vertex 0 1 0
vertex 1 0 0
endloop
endfacet
facet normal 0 -1 0
outer loop
vertex 0 0 0
vertex 1 0 0
vertex 0 0 1
endloop
endfacet
facet normal -1 0 0
outer loop
vertex 0 0 0
vertex 0 0 1
vertex 0 1 0
endloop
endfacet
facet normal 1 1 1
outer loop
vertex 1 0 0
vertex 0 1 0
vertex 0 0 1
endloop
endfacet
endsolid tetrahedron`);
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': 'import("tetrahedron.stl");',
      '/project/tetrahedron.stl': tetrahedron,
    });
    const context = await definition.initialize({}, runtime);

    await expect(definition.getDependencies({ entryPath: '/project/model.scad' }, runtime, context)).resolves.toEqual({
      resolved: ['/project/model.scad', '/project/tetrahedron.stl'],
      unresolved: [],
    });
    const rendered = await renderModel({ definition, runtime, context, entryPath: '/project/model.scad' });
    expect(rendered.nativeHandle.stats).toMatchObject({ triangleCount: 4 });
    expect(rendered.nativeHandle.stats.volume).toBeCloseTo(1 / 6, 6);
  });

  it('applies parameter overrides and exports deterministic z-up millimeter GLB', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/model.scad': 'size = 1; cube(size);' });
    const context = await definition.initialize({}, runtime);
    const created = await definition.createGeometry(
      { entryPath: '/project/model.scad', parameters: { size: 7 }, options: renderOptions },
      runtime,
      context,
    );
    const input = {
      format: 'glb',
      nativeHandle: created.nativeHandle,
      options: {
        ...renderOptions,
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      },
    } as const;
    const first = await definition.exportGeometry(input, runtime, context);
    const second = await definition.exportGeometry(input, runtime, context);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      throw new Error('Expected successful GLB exports');
    }
    expect(first.data[0]?.bytes).toEqual(second.data[0]?.bytes);
    const report = await getInspectReport(first.data[0]!.bytes);
    expect(getBoundingBoxFromInspect(report)?.size).toEqual([7, 7, 7]);
  });

  it('maps OpenRSCAD customizer controls into Tau parameter schema', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({
      '/project/model.scad': '/* [Body] */\nsize = 5; // [1:1:10]\nlabel = "A"; // [A:Alpha,B:Beta]\ncube(size);',
    });
    const context = await definition.initialize({}, runtime);
    const result = await definition.getParameters({ entryPath: '/project/model.scad' }, runtime, context);
    expect(result).toEqual({
      success: true,
      data: {
        defaultParameters: { Body: { size: 5, label: 'A' } },
        jsonSchema: {
          type: 'object',
          properties: {
            Body: {
              type: 'object',
              title: 'Body',
              additionalProperties: false,
              properties: {
                size: { title: 'size', default: 5, type: 'number', minimum: 1, maximum: 10, multipleOf: 1 },
                label: {
                  title: 'label',
                  default: 'A',
                  type: 'string',
                  oneOf: [
                    { const: 'A', title: 'Alpha' },
                    { const: 'B', title: 'Beta' },
                  ],
                },
              },
            },
          },
          additionalProperties: false,
        },
      },
      issues: [],
    });
  });

  it('returns a valid empty GLB for an empty source', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/empty.scad': '  \n' });
    const context = await definition.initialize({}, runtime);
    const result = await renderModel({ definition, runtime, context, entryPath: '/project/empty.scad' });
    expect(result.nativeHandle.stats.triangleCount).toBe(0);
    if (result.geometry.format !== 'gltf') {
      throw new Error('Expected empty GLB render geometry');
    }
    validateGlbData(result.geometry.content);
  });

  it('names OpenSCAD, not the engine, in the unsupported-export-format issue', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/model.scad': 'cube(1);' });
    const context = await definition.initialize({}, runtime);
    const created = await definition.createGeometry(
      { entryPath: '/project/model.scad', parameters: {}, options: renderOptions },
      runtime,
      context,
    );
    const unsupportedRequest = { format: 'step', nativeHandle: created.nativeHandle, options: renderOptions };
    const exported = await definition.exportGeometry(
      unsupportedRequest as unknown as Parameters<NonNullable<typeof definition.exportGeometry>>[0],
      runtime,
      context,
    );
    expect(exported.success).toBe(false);
    if (exported.success) {
      throw new Error('Expected an unsupported-format failure');
    }
    expect(exported.issues[0]?.message).toBe("Export format 'step' is not supported by OpenSCAD.");
  });

  it('names OpenSCAD, not the engine, when the native export fails', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const runtime = createRuntime({ '/project/model.scad': 'cube(1);' });
    const context = await definition.initialize({}, runtime);
    const failedNativeExport = { ok: false } as unknown as ExportShape3DOutput;
    context.backend = { ...context.backend, renderToGlb: async () => failedNativeExport };
    await expect(
      definition.createGeometry(
        { entryPath: '/project/model.scad', parameters: {}, options: renderOptions },
        runtime,
        context,
      ),
    ).rejects.toThrow('OpenSCAD native export failed');
  });

  it('names OpenSCAD, not the engine, in the include-depth warning', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    const depth = 52;
    const files = Object.fromEntries(
      Array.from({ length: depth }, (_unused, index) => [
        `/project/include-${String(index)}.scad`,
        index === depth - 1 ? '// leaf' : `include <include-${String(index + 1)}.scad>`,
      ]),
    );
    const runtime = createRuntime(files);
    const context = await definition.initialize({}, runtime);

    await definition.getDependencies({ entryPath: '/project/include-0.scad' }, runtime, context);

    expect(runtime.logger.warn).toHaveBeenCalledWith(expect.stringContaining('OpenSCAD include depth exceeded 50'));
    expect(runtime.logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('OpenRSCAD'));
  });
});
