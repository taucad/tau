/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { createNodeIo } from '@taucad/geometry-core';
import type { TauCadTopologyRoot } from '@taucad/geometry-core';
import { admitMechanism, evaluatePose, resolveMechanismComponents, sampleAnimation } from '@taucad/kinematics';
import type { Mechanism, MechanismSource } from '@taucad/kinematics';
import { geometryCache } from '@taucad/middleware';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { assertSuccess, createTestRuntimeClient, extractGltfFromResult } from '@taucad/runtime-testing';
import { picovoxel, picovoxelKernel } from '@taucad/picovoxel';

const mechanism: MechanismSource = {
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: Object.fromEntries(
    ['base', 'fixed', 'revolute', 'prismatic', 'cylindrical', 'screw', 'spherical', 'planar'].map((id) => [
      id,
      { shapes: [id] },
    ]),
  ),
  joints: {
    fixed: { type: 'fixed', parent: 'base', child: 'fixed', origin: [10, 20, 30] },
    revolute: {
      type: 'revolute',
      parent: 'base',
      child: 'revolute',
      origin: [10, 20, 30],
      axis: [1, 2, 3],
      limits: { lower: -180, upper: 180 },
    },
    prismatic: {
      type: 'prismatic',
      parent: 'base',
      child: 'prismatic',
      origin: [10, 20, 30],
      axis: [1, 2, 3],
      limits: { lower: 0, upper: 100 },
    },
    cylindrical: {
      type: 'cylindrical',
      parent: 'base',
      child: 'cylindrical',
      origin: [10, 20, 30],
      axis: [1, 2, 3],
      limits: { distance: { lower: 0, upper: 100 }, angle: { lower: -180, upper: 180 } },
    },
    screw: {
      type: 'screw',
      parent: 'base',
      child: 'screw',
      origin: [10, 20, 30],
      axis: [1, 2, 3],
      lead: 12,
      handedness: 'left',
    },
    spherical: {
      type: 'spherical',
      parent: 'base',
      child: 'spherical',
      origin: [10, 20, 30],
      limits: { lower: -90, upper: 90 },
    },
    planar: {
      type: 'planar',
      parent: 'base',
      child: 'planar',
      origin: [10, 20, 30],
      normal: [0, 0, 1],
      xAxis: [1, 0, 0],
      limits: { x: { lower: -100, upper: 100 }, y: { lower: -100, upper: 100 }, angle: { lower: -180, upper: 180 } },
    },
  },
  couplings: [
    { driver: 'revolute', follower: 'screw', ratio: -0.5, offset: 5 },
    { driver: 'prismatic', follower: 'cylindrical/distance', curve: { driverPeriod: 100, values: [0, 40] } },
  ],
  animations: [
    {
      id: 'motion',
      duration: 2,
      loop: 'pingPong',
      keyframes: [
        {
          time: 0,
          coordinates: {
            revolute: 0,
            prismatic: 0,
            'cylindrical/angle': 0,
            'spherical/x': 0,
            'spherical/y': 0,
            'spherical/z': 0,
            'planar/x': 0,
            'planar/y': 0,
            'planar/angle': 0,
          },
        },
        {
          time: 2,
          coordinates: {
            revolute: 60,
            prismatic: 50,
            'cylindrical/angle': 20,
            'spherical/x': 15,
            'spherical/y': 25,
            'spherical/z': 35,
            'planar/x': 30,
            'planar/y': -20,
            'planar/angle': 45,
          },
        },
      ],
    },
  ],
};

const source = (
  exported = `export const mechanism = ${JSON.stringify(mechanism)};`,
  names = ['base', 'fixed', 'revolute', 'prismatic', 'cylindrical', 'screw', 'spherical', 'planar'],
) => `
import type { Pico } from 'picovoxel';
export const defaultParams = { voxelSize: 1, travel: 50 };
export default function main(pico: Pico) {
  return ${JSON.stringify(names)}.map((name, index) => ({ name,
    shape: pico.createMesh({ vertices: [index * 10, 20, 30, index * 10 + 4, 20, 30, index * 10, 26, 30], triangles: [0, 1, 2] }),
    material: { pbrMetallicRoughness: { baseColorFactor: [0.3, 0.6, 0.9, 1], metallicFactor: 0.7, roughnessFactor: 0.2 }, doubleSided: true }
  }));
}
${exported}
`;

const parse = async (bytes: Uint8Array<ArrayBuffer>, format: 'glb' | 'gltf' = 'glb') => {
  const io = await createNodeIo();
  const document =
    format === 'glb'
      ? await io.readBinary(bytes)
      : await io.readJSON({ json: JSON.parse(new TextDecoder().decode(bytes)), resources: {} });
  return { document, topology: document.getRoot().getExtension<TauCadTopologyRoot>('TAU_cad_topology')?.getPayload() };
};
const admitted = (value: unknown): Mechanism => {
  const result = admitMechanism(value);
  if (result.status !== 'admitted') {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.mechanism;
};
const multiply = (a: readonly number[], b: readonly number[]) =>
  Array.from({ length: 16 }, (_, index) => {
    const row = index % 4;
    const column = Math.floor(index / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row]! * b[column * 4 + k]!, 0);
  });
const poseAt = (value: Mechanism, time: number) => {
  const sampled = sampleAnimation({ animation: value.animations![0]!, time });
  const result = evaluatePose({ mechanism: value, coordinates: sampled });
  if (result.status !== 'posed') {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.pose;
};

const createClient = (code = source()) =>
  createTestRuntimeClient({
    runtime: defineRuntime({ plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()] }),
    files: { 'main.ts': code },
  });

describe('PicoVoxel mechanisms through real WASM and runtime', { timeout: 120_000 }, () => {
  it('should preserve the baseline exact default GLB and STL byte pins with an authored mechanism', async () => {
    const client = createClient();
    try {
      const code = `
import type { Pico } from 'picovoxel';
export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico) { return { name: 'base', shape: pico.createMesh({ vertices: [0,20,30,4,20,30,0,26,30], triangles: [0,1,2] }) }; }
export const mechanism = { schemaVersion: 1, units: { length: 'mm', angle: 'deg' }, root: 'base', links: { base: { shapes: ['base'] } }, joints: {} };
`;
      const glb = await client.export('glb', { source: { entry: 'main.ts', files: { 'main.ts': code } } });
      assertSuccess(glb);
      expect(createHash('sha256').update(glb.data[0]!.bytes).digest('hex')).toBe(
        '853d1eecb0d48f0cad26b6decff90df1e43de67d45475939e8cc109cee6807b8',
      );
      const stl = await client.export('stl', { source: { entry: 'main.ts', files: { 'main.ts': code } } });
      assertSuccess(stl);
      expect(createHash('sha256').update(stl.data[0]!.bytes).digest('hex')).toBe(
        'd73acca400b9d1ce02f737bab0687d3d2a695e40b432b3b9a5a4b6e7cf0054d5',
      );
    } finally {
      await client.shutdown();
    }
  });

  it.each(['fast', 'exact'] as const)(
    'should deliver seven joint families, couplings and clips with PBR in the %s lane',
    async (lane) => {
      const client = createClient();
      try {
        const result = await client.render({ source: { path: 'main.ts' }, renderOptions: { lane } });
        if (result.superseded) {
          throw new Error('Unexpected superseded render');
        }
        assertSuccess(result.geometry);
        const { document, topology } = await parse(extractGltfFromResult(result.geometry)!);
        const delivered = admitted(topology?.['mechanism']);
        expect(result.geometry.issues).toEqual([]);
        expect(delivered.units).toEqual({ length: 'm', angle: 'deg' });
        expect(Object.values(delivered.links).flatMap(({ components }) => components)).toEqual(
          Array.from({ length: 8 }, (_, index) => `component:node-${index}`),
        );
        expect(
          document
            .getRoot()
            .listNodes()
            .map((node) => node.getExtras()['tauComponentId']),
        ).toEqual(Array.from({ length: 8 }, (_, index) => `component:node-${index}`));
        expect(document.getRoot().listMaterials()[0]!.getMetallicFactor()).toBe(0.7);
        const pose = poseAt(delivered, 1);
        expect(pose.coordinates['screw']).toBe(-10);
        expect(pose.coordinates['cylindrical/distance']).toBeCloseTo(0.02, 9);
        expect(pose.coordinates['planar/x']).toBeCloseTo(0.015, 9);
        expect(pose.coordinates['spherical/y']).toBe(17.5);
        expect(pose.coordinates['spherical/z']).toBe(-12.5);
        const original = resolveMechanismComponents({
          source: mechanism,
          componentIds: Object.fromEntries(
            Object.keys(mechanism.links).map((name, index) => [name, `component:node-${index}`]),
          ),
        });
        if (original.status !== 'resolved') {
          throw new Error(JSON.stringify(original.issues));
        }
        const reference = poseAt(original.mechanism, 1);
        const g = [0.001, 0, 0, 0, 0, 0, -0.001, 0, 0, 0.001, 0, 0, 0, 0, 0, 1];
        const inverse = [1000, 0, 0, 0, 0, 0, 1000, 0, 0, -1000, 0, 0, 0, 0, 0, 1];
        for (const [link, matrix] of Object.entries(reference.linkTransforms)) {
          const expected = multiply(multiply(g, matrix), inverse);
          expect(
            pose.linkTransforms[link]!.every((value, index) => Math.abs(value - expected[index]!) < 1e-9),
            link,
          ).toBe(true);
        }
        const plain = await client.export('glb');
        assertSuccess(plain);
        const plainScene = await parse(plain.data[0]!.bytes);
        expect(plainScene.topology).toBeUndefined();
        const disabled = await client.export('gltf', { content: { includeTopology: false } });
        assertSuccess(disabled);
        const disabledScene = await parse(disabled.data[0]!.bytes, 'gltf');
        expect(disabledScene.topology).toBeUndefined();
        const stl = await client.export('stl');
        assertSuccess(stl);
        expect(stl.data).toHaveLength(8);
      } finally {
        await client.shutdown();
      }
    },
  );

  it.each(['glb', 'gltf'] as const)(
    'should transform requested %s topology with every output unit and frame',
    async (format) => {
      const client = createClient();
      try {
        for (const coordinateSystem of ['y-up', 'z-up'] as const) {
          for (const length of ['meter', 'millimeter'] as const) {
            // oxlint-disable-next-line no-await-in-loop -- One kernel owns each sequential export.
            const result = await client.export(format, {
              source: { path: 'main.ts' },
              exportOptions: { coordinateSystem, unit: { length } },
              content: { includeTopology: true },
            });
            assertSuccess(result);
            // oxlint-disable-next-line no-await-in-loop -- Parse the just-produced route before its next export.
            const { document, topology } = await parse(result.data[0]!.bytes, format);
            const wire = admitted(topology?.['mechanism']);
            const scale = length === 'meter' ? 0.001 : 1;
            expect(wire.units.length).toBe(length === 'meter' ? 'm' : 'mm');
            expect(wire.joints['revolute']!.origin).toEqual(
              (coordinateSystem === 'y-up' ? [10, 30, -20] : [10, 20, 30]).map((value) => value * scale),
            );
            expect(
              document
                .getRoot()
                .listMeshes()[0]!
                .listPrimitives()[0]!
                .getAttribute('POSITION')!
                .getArray()!
                .slice(0, 3),
            ).toEqual(
              new Float32Array(
                (coordinateSystem === 'y-up' ? [0, 30, -20] : [0, 20, 30]).map((value) => value * scale),
              ),
            );
            expect(wire.joints['screw']).toMatchObject({ lead: 12 * scale });
            expect(wire.joints['prismatic']).toMatchObject({ limits: { lower: 0, upper: 100 * scale } });
            expect(wire.couplings?.[1]).toMatchObject({
              curve: { driverPeriod: 100 * scale, values: [0, 40 * scale] },
            });
          }
        }
      } finally {
        await client.shutdown();
      }
    },
  );

  it.each(['object', 'sync', 'async'] as const)(
    'should read the %s export with the same resolved parameters as main',
    async (kind) => {
      const code =
        kind === 'object'
          ? `export const mechanism = ${JSON.stringify(mechanism)};`
          : `export ${kind === 'async' ? 'async ' : ''}function mechanism(params: { travel: number }) { const data = ${JSON.stringify(mechanism)}; data.joints.prismatic.limits.upper = params.travel; return data; }`;
      const client = createClient(source(code));
      try {
        const result = await client.render({ source: { path: 'main.ts' }, parameters: { travel: 80 } });
        if (result.superseded) {
          throw new Error('Unexpected superseded render');
        }
        assertSuccess(result.geometry);
        const scene = await parse(extractGltfFromResult(result.geometry)!);
        const delivered = admitted(scene.topology?.['mechanism']);
        expect(delivered.joints['prismatic']).toMatchObject({ limits: { upper: kind === 'object' ? 0.1 : 0.08 } });
      } finally {
        await client.shutdown();
      }
    },
  );

  it.each([
    ['throw', 'export function mechanism() { throw new Error("bad mechanism"); }', 'RUNTIME'],
    ['reject', 'export async function mechanism() { throw new Error("rejected mechanism"); }', 'RUNTIME'],
    ['bigint', 'export const mechanism = { bad: 1n };', 'INVALID_ANNOTATION'],
    [
      'cycle',
      'const cycle: Record<string, unknown> = {}; cycle.self = cycle; export const mechanism = cycle;',
      'INVALID_ANNOTATION',
    ],
    ['schema', 'export const mechanism = { schemaVersion: 42 };', 'INVALID_ANNOTATION'],
    [
      'missing shape',
      `export const mechanism = ${JSON.stringify({ ...mechanism, links: { ...mechanism.links, base: { shapes: ['missing'] } } })};`,
      'INVALID_REFERENCE',
    ],
  ])('should retain geometry and actionable warnings for %s', async (kind, exported, code) => {
    const client = createClient(source(exported));
    try {
      const result = await client.render({ source: { path: 'main.ts' } });
      if (result.superseded) {
        throw new Error('Unexpected superseded render');
      }
      assertSuccess(result.geometry);
      const { document, topology } = await parse(extractGltfFromResult(result.geometry)!);
      expect(document.getRoot().listMeshes()).toHaveLength(8);
      expect(topology?.['mechanism']).toBeUndefined();
      expect(result.geometry.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code,
            severity: 'warning',
            details: expect.objectContaining({ producer: { kernelId: 'picovoxel' }, mechanism: expect.any(Object) }),
          }),
        ]),
      );
      if (kind === 'throw' || kind === 'reject') {
        expect(result.geometry.issues[0]!.location).toMatchObject({ fileName: 'main.ts', startLineNumber: 10 });
      }
      const exportedResult = await client.export('glb', { content: { includeTopology: true } });
      assertSuccess(exportedResult);
      const exportedScene = await parse(exportedResult.data[0]!.bytes);
      expect(exportedScene.topology?.['mechanism']).toBeUndefined();
      expect(exportedResult.issues.some((issue) => issue.severity === 'warning')).toBe(true);
    } finally {
      await client.shutdown();
    }
  });

  it('should restore mechanisms from reopened SQLite and rebuild changed parameters and imported sources', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-picovoxel-kinematics-'));
    const plugin = picovoxelKernel({ wasm: 'serial' });
    const definition = await resolveRuntimePluginDefinition('kernel', plugin);
    const build = vi.spyOn(definition, 'createGeometry');
    const restore = vi.spyOn(definition, 'deserializeNativeHandle');
    const cachedRuntime = defineRuntime({ kernels: [plugin], plugins: [esbuild()], middleware: [geometryCache()] });
    const reopen = async (travel: number, format: 'glb' | 'gltf' = 'glb', lead = 12) => {
      const store = createSqliteComputeEngine({ directory });
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime: cachedRuntime,
          fileSystem: fromMemoryFs(),
          compute: { mode: 'durable', store: fromSqlite({ store, workspace: 'kinematics' }) },
        }),
      });
      try {
        const code = source("export { mechanism } from './motion.js';");
        const motion = `export function mechanism(params: { travel: number }) { const data = ${JSON.stringify(mechanism)}; data.joints.prismatic.limits.upper = params.travel; data.joints.screw.lead = ${lead}; return data; }`;
        const result = await client.render({
          source: { entry: 'main.ts', files: { 'main.ts': code, 'motion.ts': motion } },
          parameters: { travel },
          renderOptions: { lane: 'exact' },
        });
        if (result.superseded) {
          throw new Error('Unexpected superseded render');
        }
        assertSuccess(result.geometry);
        const exported = await client.export(format, { content: { includeTopology: true } });
        assertSuccess(exported);
        return await parse(exported.data[0]!.bytes, format);
      } finally {
        await client.shutdown();
        await store.dispose();
      }
    };
    try {
      const first = await reopen(80);
      expect(build).toHaveBeenCalledTimes(1);
      const second = await reopen(80, 'gltf');
      expect(build).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(second.topology).toEqual(first.topology);
      const changedScene = await reopen(90);
      const changed = admitted(changedScene.topology?.['mechanism']);
      expect(changed.joints['prismatic']).toMatchObject({ limits: { upper: 0.09 } });
      expect(build).toHaveBeenCalledTimes(2);
      const changedSource = await reopen(90, 'glb', 24);
      expect(admitted(changedSource.topology?.['mechanism']).joints['screw']).toMatchObject({ lead: 0.024 });
      expect(build).toHaveBeenCalledTimes(3);
    } finally {
      build.mockRestore();
      restore.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it('should restore source-mapped reader warnings through a reopened SQLite build', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-picovoxel-warnings-'));
    const plugin = picovoxelKernel({ wasm: 'serial' });
    const definition = await resolveRuntimePluginDefinition('kernel', plugin);
    const build = vi.spyOn(definition, 'createGeometry');
    const restore = vi.spyOn(definition, 'deserializeNativeHandle');
    const cachedRuntime = defineRuntime({ kernels: [plugin], plugins: [esbuild()], middleware: [geometryCache()] });
    const reopen = async (format: 'glb' | 'gltf') => {
      const store = createSqliteComputeEngine({ directory });
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime: cachedRuntime,
          fileSystem: fromMemoryFs(),
          compute: { mode: 'durable', store: fromSqlite({ store, workspace: 'warnings' }) },
        }),
      });
      try {
        const result = await client.render({
          source: {
            entry: 'main.ts',
            files: {
              'main.ts': source("export { mechanism } from './motion.js';"),
              'motion.ts': "export function mechanism() { throw new Error('imported annotation broke'); }",
            },
          },
          renderOptions: { lane: 'exact' },
        });
        if (result.superseded) {
          throw new Error('Unexpected superseded render');
        }
        assertSuccess(result.geometry);
        expect(result.geometry.issues).toHaveLength(1);
        expect(result.geometry.issues[0]).toMatchObject({
          severity: 'warning',
          location: { fileName: 'motion.ts', startLineNumber: 1 },
        });
        const exported = await client.export(format, { content: { includeTopology: true } });
        assertSuccess(exported);
        expect(exported.issues).toEqual(result.geometry.issues);
        const parsed = await parse(exported.data[0]!.bytes, format);
        expect(parsed.topology?.['components']).toHaveLength(8);
        expect(parsed.topology?.['mechanism']).toBeUndefined();
        return exported.issues;
      } finally {
        await client.shutdown();
        await store.dispose();
      }
    };
    try {
      const first = await reopen('glb');
      expect(build).toHaveBeenCalledTimes(1);
      const restored = await reopen('gltf');
      expect(build).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(restored).toEqual(first);
    } finally {
      build.mockRestore();
      restore.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
