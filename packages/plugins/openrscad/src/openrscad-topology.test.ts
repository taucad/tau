/* oxlint-disable typescript/no-unsafe-assignment -- dynamic plugin test definitions erase context and handle types. */

import { describe, expect, it } from 'vitest';
import { validateTauCadTopology } from '@taucad/geometry-core';
import type { TauCadTopologyPayload, TauCadTopologyPrimitiveRef } from '@taucad/geometry-core';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { openrscadKernel } from '#openrscad.kernel.js';
import { addOpenrscadTopology, deriveOpenrscadTopology } from '#openrscad-topology.js';

/** The transcript's modular chamfered cube with a through-bore (`repro/modules.scad`). */
const chamferedCubeCutout = `
$fa = 2;
$fs = 0.4;
size = 40;
chamfer = 3;
bore_d = 20;
module chamfer_octagon(l, c) {
  h = l / 2;
  polygon([
    [ h,     h - c], [ h - c,  h], [-h + c,  h], [-h,     h - c],
    [-h,    -h + c], [-h + c, -h], [ h - c, -h], [ h,    -h + c]
  ]);
}
module chamfered_block(l, c) {
  intersection() {
    linear_extrude(height = l, center = true) chamfer_octagon(l, c);
    rotate([90, 0, 90]) linear_extrude(height = l, center = true) chamfer_octagon(l, c);
    rotate([90, 0, 0]) linear_extrude(height = l, center = true) chamfer_octagon(l, c);
  }
}
module chamfered_cube_cutout() {
  difference() {
    chamfered_block(size, chamfer);
    cylinder(h = size + 2, d = bore_d, center = true, $fn = 96);
  }
}
chamfered_cube_cutout();
`;

type GlbJson = {
  nodes: Array<{ name?: string; mesh?: number; children?: number[]; extras?: unknown }>;
  meshes: Array<{ primitives: Array<{ mode?: number; indices?: number; extras?: unknown }> }>;
  accessors: Array<{ count: number }>;
  materials?: Array<{ name?: string; doubleSided?: boolean }>;
  extensions?: Record<string, unknown>;
  extensionsUsed?: string[];
};

const readGlbJson = (bytes: Uint8Array<ArrayBuffer>): GlbJson => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as GlbJson;
};

const readTopology = (json: GlbJson): TauCadTopologyPayload =>
  json.extensions?.['TAU_cad_topology'] as TauCadTopologyPayload;

const documentBounds = (json: GlbJson) => ({
  nodes: json.nodes.map((node) => ({ meshIndex: node.mesh })),
  meshes: json.meshes.map((mesh) =>
    mesh.primitives.map((primitive) => ({
      mode: primitive.mode ?? 4,
      indexCount: json.accessors[primitive.indices!]!.count,
    })),
  ),
});

const key = ({ nodeIndex, meshIndex, primitiveIndex }: TauCadTopologyPrimitiveRef): string =>
  `${nodeIndex}/${meshIndex}/${primitiveIndex}`;

/**
 * The primitives the viewer emphasises for a selected (or keeps for an isolated) component, by its rules in
 * `gltf-component-visibility.ts` and `gltf-mesh.tsx`: every primitive has one owning component, and a primitive is
 * included when its owner is the component, one of its ancestors or one of its descendants.
 */
const emphasised = (payload: TauCadTopologyPayload, name: string): string[] => {
  const byId = new Map(payload.components.map((component) => [component.id, component]));
  const target = payload.components.find((component) => component.name === name)!;
  const ancestors = new Set<string>();
  for (let parent = target.parentId; parent !== undefined; parent = byId.get(parent)?.parentId) {
    ancestors.add(parent);
  }
  const descendants = new Set<string>();
  const stack = [...(target.childIds ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    descendants.add(id);
    stack.push(...(byId.get(id)?.childIds ?? []));
  }
  return payload.components
    .filter(({ id }) => id === target.id || ancestors.has(id) || descendants.has(id))
    .flatMap(({ primitiveRefs }) => (primitiveRefs ?? []).map((reference) => key(reference)))
    .toSorted();
};

const render = async (source: string, includeEdges = false) => {
  const runtime = createMockKernelRuntime({
    filesystemOverrides: {
      readFileResult: async (path) => {
        if (path === 'project/model.scad') {
          return source;
        }
        throw Object.assign(new Error(`Missing ${path}`), { code: 'ENOENT' });
      },
    },
  });
  const definition = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
  const context = await definition.initialize({}, runtime);
  const created = await definition.evaluate(
    { entryPath: 'project/model.scad', parameters: {}, options: {} },
    runtime,
    context,
  );
  const preview = await definition.render!(
    { handle: created.handle, view: 'model', options: {}, content: { includeEdges } },
    runtime,
    context,
  );
  const exported = await definition.export!(
    {
      exportId: 'glb',
      handle: created.handle,
      options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      content: { includeEdges },
    },
    runtime,
    context,
  );
  if (typeof preview.content === 'string') {
    throw new TypeError('Expected binary GLB render content');
  }
  return { preview: preview.content, exported: exported.files[0].bytes };
};

describe('OpenRSCAD Explorer topology', () => {
  it('maps module ownership so Chamfered Block selects its faces and Chamfered Cube Cutout the whole solid', async () => {
    const { preview, exported } = await render(chamferedCubeCutout);
    const json = readGlbJson(preview);
    // The engine's layout: a mesh-less module tree over one manifold solid whose primitives name their owner.
    expect(json.nodes.map(({ name, mesh, children }) => ({ name, mesh, children }))).toEqual([
      { name: 'Chamfered Cube Cutout', mesh: undefined, children: [1, 2] },
      { name: 'Chamfered Block', mesh: undefined, children: undefined },
      { name: 'Chamfered Cube Cutout Solid', mesh: 0, children: undefined },
    ]);
    expect(json.meshes[0]!.primitives.map(({ extras }) => extras)).toEqual([
      { openrscad: { displayMode: 'solid', owner: 0 } },
      { openrscad: { displayMode: 'solid', owner: 1 } },
    ]);
    expect(json.extensionsUsed).toEqual(['EXT_mesh_manifold', 'TAU_cad_topology']);
    // The solid's mesh is closed on its own, so the viewer draws it one-sided.
    expect(json.materials).toEqual([expect.objectContaining({ name: '#F5A523FF Material', doubleSided: false })]);

    const topology = readTopology(json);
    expect(validateTauCadTopology(topology, documentBounds(json))).toEqual([]);
    expect(
      topology.components.map(({ id, name, kind, selector, parentId, childIds, primitiveRefs }) => ({
        id,
        name,
        kind,
        selector,
        parentId,
        childIds,
        primitiveRefs,
      })),
    ).toEqual([
      {
        id: 'component:node-0',
        name: 'Chamfered Cube Cutout',
        kind: 'assembly',
        selector: 'node/0',
        parentId: undefined,
        childIds: ['component:node-1', 'component:node-2'],
        primitiveRefs: [],
      },
      {
        id: 'component:node-1',
        name: 'Chamfered Block',
        kind: 'part',
        selector: 'node/1',
        parentId: 'component:node-0',
        childIds: [],
        primitiveRefs: [{ nodeIndex: 2, meshIndex: 0, primitiveIndex: 1 }],
      },
      {
        id: 'component:node-2',
        name: 'Chamfered Cube Cutout Solid',
        kind: 'part',
        selector: 'node/2',
        parentId: 'component:node-0',
        childIds: [],
        primitiveRefs: [{ nodeIndex: 2, meshIndex: 0, primitiveIndex: 0 }],
      },
    ]);
    expect(topology.components[0]?.sourceRefs).toMatchObject({
      kernelId: 'openrscad',
      moduleName: 'chamfered_cube_cutout',
    });

    // The block faces are the 256 triangles OpenRSCAD attributes to `chamfered_block`; the bore wall is the cutout's.
    expect(emphasised(topology, 'Chamfered Block')).toEqual(['2/0/1']);
    expect(json.accessors[json.meshes[0]!.primitives[1]!.indices!]!.count / 3).toBe(256);
    expect(emphasised(topology, 'Chamfered Cube Cutout')).toEqual(['2/0/0', '2/0/1']);

    // The download carries the same components as the preview.
    expect(readTopology(readGlbJson(exported))).toEqual(topology);
    // Every primitive has exactly one owner, so the viewer's last-owner-wins table never has to choose.
    const references = topology.components.flatMap(({ primitiveRefs }) =>
      (primitiveRefs ?? []).map((reference) => key(reference)),
    );
    expect(references.toSorted()).toEqual(['2/0/0', '2/0/1']);
  });

  it('changes only the JSON chunk and keeps every engine extra as written', async () => {
    const engine = await import('@taulabs/openrscad-engine');
    const result = await engine.renderToGlb(chamferedCubeCutout, {});
    const written = new Uint8Array(result.bytes);
    const rewritten = addOpenrscadTopology(written);
    const { extensions, extensionsUsed, ...rest } = readGlbJson(rewritten);
    const original = readGlbJson(written);
    expect({ ...rest, extensionsUsed: original.extensionsUsed }).toEqual(original);
    expect(Object.keys(extensions ?? {})).toEqual(['TAU_cad_topology']);
    expect(extensionsUsed).toEqual(['EXT_mesh_manifold', 'TAU_cad_topology']);
    const binary = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
      bytes.subarray(20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true));
    expect(binary(rewritten)).toEqual(binary(written));
    expect(new DataView(rewritten.buffer).getUint32(8, true)).toBe(rewritten.byteLength);
  });

  it('lists each disjoint solid of one module as its own part', async () => {
    const { preview } = await render(`
module pair() { cube(2); translate([5, 0, 0]) cube(2); }
pair();
`);
    const json = readGlbJson(preview);
    const topology = readTopology(json);
    expect(validateTauCadTopology(topology, documentBounds(json))).toEqual([]);
    expect(
      topology.components.map(({ name, kind, childIds, primitiveRefs }) => ({ name, kind, childIds, primitiveRefs })),
    ).toEqual([
      { name: 'Pair', kind: 'assembly', childIds: ['component:node-1', 'component:node-2'], primitiveRefs: [] },
      {
        name: 'Pair 1',
        kind: 'part',
        childIds: [],
        primitiveRefs: [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }],
      },
      {
        name: 'Pair 2',
        kind: 'part',
        childIds: [],
        primitiveRefs: [{ nodeIndex: 2, meshIndex: 1, primitiveIndex: 0 }],
      },
    ]);
  });

  it('selects each module of a fused union through its own primitive and lists no empty solid row', async () => {
    const { preview } = await render(`
module left_block() cube([10, 10, 10]);
module right_block() translate([10, 0, 0]) cube([10, 10, 10]);
union() { left_block(); right_block(); }
`);
    const json = readGlbJson(preview);
    expect(json.nodes.map(({ name, mesh }) => ({ name, mesh }))).toEqual([
      { name: 'Left Block', mesh: undefined },
      { name: 'Right Block', mesh: undefined },
      { name: 'Shape', mesh: 0 },
    ]);
    const topology = readTopology(json);
    expect(validateTauCadTopology(topology, documentBounds(json))).toEqual([]);
    expect(
      topology.components.map(({ name, kind, parentId, primitiveRefs }) => ({ name, kind, parentId, primitiveRefs })),
    ).toEqual([
      {
        name: 'Left Block',
        kind: 'part',
        parentId: undefined,
        primitiveRefs: [{ nodeIndex: 2, meshIndex: 0, primitiveIndex: 0 }],
      },
      {
        name: 'Right Block',
        kind: 'part',
        parentId: undefined,
        primitiveRefs: [{ nodeIndex: 2, meshIndex: 0, primitiveIndex: 1 }],
      },
    ]);
  });

  it('keeps one row for a module that made one solid, with its feature lines', async () => {
    const { preview } = await render(
      'module part() cube(2);\ncolor("red") { part(); translate([0, 0, 5]) part(); }',
      true,
    );
    const json = readGlbJson(preview);
    const topology = readTopology(json);
    expect(validateTauCadTopology(topology, documentBounds(json))).toEqual([]);
    expect(
      topology.components.map(({ name, kind, childIds, primitiveRefs }) => ({ name, kind, childIds, primitiveRefs })),
    ).toEqual([
      {
        name: 'Part 1',
        kind: 'part',
        childIds: [],
        primitiveRefs: [
          { nodeIndex: 2, meshIndex: 2, primitiveIndex: 0 },
          { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
        ],
      },
      {
        name: 'Part 2',
        kind: 'part',
        childIds: [],
        primitiveRefs: [
          { nodeIndex: 3, meshIndex: 3, primitiveIndex: 0 },
          { nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 },
        ],
      },
    ]);
  });

  it("folds an anonymous solid's feature-line node into the solid's row", async () => {
    const { preview } = await render('cube(2);', true);
    const json = readGlbJson(preview);
    expect(json.nodes.map(({ name }) => name)).toEqual(['#F5A523FF Shape', '#F5A523FF Shape Edges']);
    const topology = readTopology(json);
    expect(validateTauCadTopology(topology, documentBounds(json))).toEqual([]);
    expect(topology.components).toEqual([
      {
        id: 'component:node-0',
        name: '#F5A523FF Shape',
        kind: 'part',
        selector: 'node/0',
        nodeIndex: 0,
        meshIndex: 0,
        childIds: [],
        primitiveRefs: [
          { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
          { nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 },
        ],
        sourceRefs: { kernelId: 'openrscad', attribution: 'exact' },
        capabilities: { hasPreciseTopology: false },
      },
    ]);
  });

  it('leaves a GLB without OpenRSCAD node extras, or with a topology already, as given', async () => {
    const { preview } = await render(chamferedCubeCutout);
    expect(addOpenrscadTopology(preview)).toBe(preview);
    const { preview: empty } = await render('');
    expect(readGlbJson(empty).extensions?.['TAU_cad_topology']).toBeUndefined();
    const notGlb = new Uint8Array(new ArrayBuffer(8));
    expect(addOpenrscadTopology(notGlb)).toBe(notGlb);
    expect(deriveOpenrscadTopology({ nodes: [{ name: 'plain' }], scenes: [{ nodes: [0] }] })).toBeUndefined();
  });

  it('reads the scene roots from the node tree when the GLB names no scene', () => {
    expect(
      deriveOpenrscadTopology({
        nodes: [
          { extras: { openrscad: { moduleName: 'a' } }, children: [1] },
          { extras: { openrscad: { moduleName: 'b' } } },
        ],
      })?.components.map(({ id, name, kind, parentId }) => ({ id, name, kind, parentId })),
    ).toEqual([
      { id: 'component:node-0', name: 'Component 1', kind: 'assembly', parentId: undefined },
      { id: 'component:node-1', name: 'Component 2', kind: 'part', parentId: 'component:node-0' },
    ]);
  });
});
