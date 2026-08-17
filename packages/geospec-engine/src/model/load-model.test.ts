import { join } from 'node:path';
import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it, vi } from 'vitest';
import { openrscad } from '@taucad/openrscad';
import { createNodeClient } from '@taucad/runtime/node';
import { presets } from '@taucad/runtime/presets';
import { defineRuntime } from '@taucad/runtime/worker';
import { GeoSpecModelLoadError } from 'geospec/model';
import type { GeoSpecRuntimeClient, GeoSpecRuntimeSourceAdapter, LoadModelOptions } from 'geospec/model';
import {
  createModelLoader,
  forbiddenRuntimeOptionKeys,
  loadModel,
  setModelLoaderForensicSink,
} from '#model/load-model.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';

const twoCube = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');

const replicadBoxCode = `
  import { makeBaseBox } from 'replicad';
  export default () => makeBaseBox(10, 20, 30);
`;

type ReplicadStepPart = { name: string; x: number };

const replicadStepAssemblyCode = (parts: readonly ReplicadStepPart[]): string => `
  import { makeBaseBox } from 'replicad';

  export default function main() {
    return [
      ${parts
        .map(
          ({ name, x }) => `{ name: ${JSON.stringify(name)}, shape: makeBaseBox(10, 10, 10).translate([${x}, 0, 0]) }`,
        )
        .join(',\n      ')},
    ];
  }
`;

const openScadReplayCode = `
$fa = 2;
$fs = 0.4;
cube_size = 20;
cylinder_radius = 5;
difference() {
  cube(cube_size, center = true);
  cylinder(h = cube_size + 2, r = cylinder_radius, center = true);
}
`;

const createOpenScadSourceAdapter = (): GeoSpecRuntimeSourceAdapter => ({
  id: 'openrscad',
  extensions: ['.scad'],
  async createRuntime({ projectPath }) {
    const baseRuntime = presets.all();
    const runtime = defineRuntime({
      ...baseRuntime,
      kernels: [openrscad(), ...baseRuntime.kernels],
    });
    return (await createNodeClient(projectPath, { runtime })) as unknown as GeoSpecRuntimeClient;
  },
});

/** The smallest real GLB: one triangle in a named node. */
const glbBytes = async (size = 1): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, size, 0, 0, 0, size, 0]));
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(new Uint32Array([0, 1, 2]));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('tri').addPrimitive(primitive);
  document.createScene('scene').addChild(document.createNode('tri').setMesh(mesh));
  return new WebIO().writeBinary(document);
};

const entrySource: Record<string, string> = Object.fromEntries([['main.ts', 'export default () => {};']]);

const triangle: { format: 'mesh-buffer'; name: string; positions: number[]; indices: number[] } = {
  format: 'mesh-buffer',
  name: 'triangle',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
};

/** A runtime whose export route advertises the canonical frame properties. */
const fakeRuntime = (options?: {
  bytes?: Uint8Array<ArrayBuffer>;
  fail?: boolean;
  empty?: boolean;
  routes?: boolean;
  fidelity?: string;
  transcoderId?: string;
  render?: boolean;
  throws?: unknown;
}): GeoSpecRuntimeClient & {
  state: {
    connected: number;
    terminated: number;
    rendered: number;
    exports: Array<{ source?: unknown; parameters?: unknown; exportOptions?: unknown }>;
  };
} => {
  const state: {
    connected: number;
    terminated: number;
    rendered: number;
    exports: Array<{ source?: unknown; parameters?: unknown; exportOptions?: unknown }>;
  } = { connected: 0, terminated: 0, rendered: 0, exports: [] };
  const client = {
    connect: async () => {
      state.connected += 1;
    },
    terminate: () => {
      state.terminated += 1;
    },
    export: async (_format: string, request: { source?: unknown; parameters?: unknown; exportOptions?: unknown }) => {
      state.exports.push(request);
      if (options?.throws !== undefined) {
        // oxlint-disable-next-line typescript/only-throw-error -- a runtime that throws a non-Error is exactly the case under test.
        throw options.throws;
      }
      return options?.fail === true
        ? {
            success: false,
            issues: [
              { code: 'KERNEL_ERROR', message: 'boom', severity: 'error' },
              { message: 'no code at all', severity: 'error' },
            ],
          }
        : {
            success: true,
            issues: [],
            data: options?.empty === true ? [] : [{ name: 'model.glb', bytes: options?.bytes ?? new Uint8Array(0) }],
          };
    },
    ...(options?.render === true
      ? {
          render: async () => {
            state.rendered += 1;
          },
        }
      : {}),
    ...(options?.routes === false
      ? {}
      : {
          bestRouteFor: () => ({
            kernelId: 'replicad',
            sourceFormat: 'glb',
            targetFormat: 'glb',
            ...(options?.transcoderId === undefined ? {} : { transcoderId: options.transcoderId }),
            ...(options?.fidelity === undefined ? {} : { fidelity: options.fidelity }),
            exportOptions: {
              schema: { properties: { coordinateSystem: {}, unit: {}, tessellation: {} } },
              defaults: {},
            },
          }),
        }),
  };
  return Object.assign(client, { state }) as unknown as GeoSpecRuntimeClient & { state: typeof state };
};

const diagnosticsOf = async (run: () => Promise<unknown>): Promise<GeoSpecModelLoadError> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof GeoSpecModelLoadError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected a GeoSpecModelLoadError');
};

const expectStepOverlapPairs = async (
  parts: readonly ReplicadStepPart[],
  expectedPairs: ReadonlyArray<readonly [string, string]>,
): Promise<void> => {
  const subject = await loadModel({
    code: Object.fromEntries([['main.ts', replicadStepAssemblyCode(parts)]]),
    file: 'main.ts',
    format: 'step',
  });
  try {
    const analysis = await analyzeMeshOverlap({ subject, tolerance: 0.001 });

    expect(analysis.success).toBe(true);
    if (!analysis.success) {
      throw new Error(analysis.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    }
    expect(analysis.evidence.componentSource).toBe('named');
    expect(analysis.evidence.componentCount).toBe(parts.length);
    expect(analysis.evidence.overlaps).toHaveLength(expectedPairs.length);
    expect(analysis.evidence.overlaps.map((overlap) => [overlap.leftLabel, overlap.rightLabel])).toEqual(expectedPairs);
    expect(analysis.evidence.overlaps.map((overlap) => overlap.penetration)).toEqual(
      expectedPairs.map(() => 'positive-volume'),
    );
    expect(analysis.evidence.overlaps.every((overlap) => overlap.intersectionVolume > 0)).toBe(true);
  } finally {
    subject.nativeXde?.delete?.();
  }
};

describe('loadModel — direct geometry sources', () => {
  it('should parse an in-memory mesh buffer', async () => {
    const subject = await loadModel({ source: triangle, format: 'mesh-buffer', name: 'triangle' });
    expect(subject.kind).toBe('geometry-subject');
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });

  it('should parse a STEP path through the exact reader', async () => {
    const subject = await loadModel({
      source: twoCube,
      format: 'step',
      mesh: false,
      name: 'two-cube-assembly.step',
      stepStreaming: 'native-stream',
      meshLinearTolerance: 0.1,
      meshAngularToleranceDegrees: 30,
      parameters: { note: 'direct' },
      path: twoCube,
    });
    try {
      expect(subject.step?.xde?.occurrences).toHaveLength(2);
    } finally {
      subject.nativeXde?.delete?.();
    }
  }, 120_000);

  it('should default to GLB and carry explicit parameters into provenance', async () => {
    const subject = await loadModel({ source: await glbBytes(), parameters: { seed: 1 } });
    expect(subject.mesh.format).toBe('glb');
    expect(subject.mesh.stats.boundingBox?.size).toEqual([1000, 1000, 0]);
    expect(subject.provenance.unit).toBe('mm');
    expect(subject.provenance.parameters).toEqual({ seed: 1 });
  });

  it('should treat sourceUnit as input metadata while always returning millimetres', async () => {
    const subject = await loadModel({ source: await glbBytes(20), format: 'glb', sourceUnit: 'mm' });
    expect(subject.mesh.stats.boundingBox?.size).toEqual([20, 20, 0]);
    expect(subject.provenance.unit).toBe('mm');
  });

  it('should reject a source-unit override for self-describing STEP', async () => {
    const error = await diagnosticsOf(async () => loadModel({ source: twoCube, format: 'step', sourceUnit: 'm' }));
    expect(error.diagnostics[0]?.code).toBe('GEOSPEC_INVALID_LOAD_MODEL_OPTIONS');
    expect(error.diagnostics[0]?.message).toContain('declares its own length unit');
  });

  it('should read a STEP source with no optional settings at all', async () => {
    const subject = await loadModel({ source: twoCube, format: 'step' });
    try {
      expect(subject.step?.xde?.occurrences).toHaveLength(2);
    } finally {
      subject.nativeXde?.delete?.();
    }
  }, 120_000);

  it('should refuse a format it cannot read', async () => {
    const error = await diagnosticsOf(async () => loadModel({ source: triangle, format: 'obj' as unknown as 'glb' }));
    expect(error.diagnostics[0]?.code).toBe('GEOSPEC_INVALID_LOAD_MODEL_OPTIONS');
  });

  it('should surface a mesh-loader failure as a load error', async () => {
    const error = await diagnosticsOf(async () => loadModel({ source: new Uint8Array([1, 2, 3]), format: 'glb' }));
    expect(error.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('loadModel — the runtime branch has no frame knobs (Register C7)', () => {
  for (const key of forbiddenRuntimeOptionKeys) {
    it(`should reject '${key}' on a runtime-exported model`, async () => {
      const error = await diagnosticsOf(async () =>
        loadModel({ file: 'main.ts', runtime: fakeRuntime(), [key]: 'anything' } as unknown as LoadModelOptions),
      );
      expect(error.diagnostics[0]?.code).toBe('GEOSPEC_INVALID_LOAD_MODEL_OPTIONS');
      expect(error.diagnostics[0]?.message).toContain(key);
    });
  }
});

describe('loadModel — the runtime branch', () => {
  it('should preserve canonical runtime-exported millimetre coordinates', async () => {
    const subject = await loadModel({ file: 'main.ts', runtime: fakeRuntime({ bytes: await glbBytes(20) }) });
    expect(subject.mesh.stats.boundingBox?.size).toEqual([20, 20, 0]);
    expect(subject.provenance.unit).toBe('mm');
    expect(subject.provenance.exportIntent?.honored?.sourceUnit).toBe('mm');
  });

  it('should honor requested runtime-export tessellation', async () => {
    const runtime = fakeRuntime({ bytes: await glbBytes() });
    await loadModel({
      file: 'main.ts',
      runtime,
      meshLinearTolerance: 0.1,
      meshAngularToleranceDegrees: 30,
    });
    expect(runtime.state.exports[0]?.exportOptions).toMatchObject({
      tessellation: { linearTolerance: 0.1, angularTolerance: 30 },
    });
  });

  it('should preserve real Replicad millimetre dimensions', { timeout: 30_000 }, async () => {
    const subject = await loadModel({
      code: Object.fromEntries([['main.ts', replicadBoxCode]]),
      file: 'main.ts',
    });
    expect([...(subject.mesh.stats.boundingBox?.size ?? [])].sort((a, b) => a - b)).toEqual([10, 20, 30]);
    expect(subject.provenance.unit).toBe('mm');
  });

  it('should preserve the exact 20 mm OpenSCAD replay dimensions', { timeout: 120_000 }, async () => {
    const subject = await loadModel({
      code: Object.fromEntries([['main.scad', openScadReplayCode]]),
      file: 'main.scad',
      sourceAdapters: [createOpenScadSourceAdapter()],
    });
    expect(subject.mesh.stats.boundingBox?.size).toEqual([20, 20, 20]);
    expect(subject.mesh.stats.boundingBox?.center).toEqual([0, 0, 0]);
    expect(subject.mesh.stats.watertight).toBe(true);
    expect(subject.provenance.unit).toBe('mm');
  });

  it('should connect, export, record the honored route and terminate a runtime it created', async () => {
    const runtime = fakeRuntime({ bytes: await glbBytes() });
    const subject = await loadModel({ file: 'main.ts', runtime: async () => runtime });
    expect(subject.mesh.stats.triangleCount).toBe(1);
    expect(subject.provenance.exportIntent?.honored).toMatchObject({
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      sourceUnit: 'mm',
    });
    expect(subject.provenance.exportIntent?.route).toMatchObject({ kernelId: 'replicad', direct: true });
    expect(runtime.state.connected).toBe(1);
    expect(runtime.state.terminated).toBe(1);
  });

  it('should thread the STEP settings of a runtime-exported model through', async () => {
    const { readFile } = await import('node:fs/promises');
    const runtime = fakeRuntime({
      bytes: new Uint8Array(await readFile(twoCube)),
      fidelity: 'brep',
    });
    const subject = await loadModel({
      file: 'main.ts',
      format: 'step',
      runtime,
      mesh: false,
      stepStreaming: 'native-stream',
      meshLinearTolerance: 0.1,
      meshAngularToleranceDegrees: 30,
      parameters: { seed: 2 },
    });
    try {
      expect(subject.step?.xde?.occurrences).toHaveLength(2);
      expect(subject.provenance.exportIntent?.requested.format).toBe('step');
    } finally {
      subject.nativeXde?.delete?.();
    }
  }, 120_000);

  it('should report authored names for runtime-exported STEP component interference', async () => {
    await expectStepOverlapPairs(
      [
        { name: 'Housing and Ring Gear', x: 0 },
        { name: 'Planet Gear', x: 9 },
      ],
      [['Housing and Ring Gear', 'Planet Gear']],
    );
  }, 120_000);

  it('should report the only overlapping named pair in a runtime-exported STEP assembly', async () => {
    await expectStepOverlapPairs(
      [
        { name: 'Housing and Ring Gear', x: 0 },
        { name: 'Planet Gear', x: 9 },
        { name: 'Planet Carrier', x: 30 },
      ],
      [['Housing and Ring Gear', 'Planet Gear']],
    );
  }, 120_000);

  it('should report every overlapping named pair in a runtime-exported STEP assembly', async () => {
    await expectStepOverlapPairs(
      [
        { name: 'Housing and Ring Gear', x: 0 },
        { name: 'Planet Gear', x: 3 },
        { name: 'Planet Carrier', x: 6 },
      ],
      [
        ['Housing and Ring Gear', 'Planet Gear'],
        ['Housing and Ring Gear', 'Planet Carrier'],
        ['Planet Gear', 'Planet Carrier'],
      ],
    );
  }, 120_000);

  it('should not tessellate STEP occurrences for component interference when mesh loading is disabled', async () => {
    const subject = await loadModel({
      code: Object.fromEntries([
        [
          'main.ts',
          replicadStepAssemblyCode([
            { name: 'Housing and Ring Gear', x: 0 },
            { name: 'Planet Gear', x: 9 },
          ]),
        ],
      ]),
      file: 'main.ts',
      format: 'step',
      mesh: false,
    });
    const occurrenceMesh = vi.fn(subject.occurrenceMesh);
    subject.occurrenceMesh = occurrenceMesh;
    try {
      const analysis = await analyzeMeshOverlap({ subject, tolerance: 0.001 });

      expect(analysis.success).toBe(false);
      expect(occurrenceMesh).not.toHaveBeenCalled();
    } finally {
      subject.nativeXde?.delete?.();
    }
  }, 120_000);

  it('should supply the source to every request-scoped export', async () => {
    const parameterized = fakeRuntime({ render: true });
    await diagnosticsOf(async () => loadModel({ file: 'main.ts', runtime: parameterized, parameters: { width: 5 } }));
    const plain = fakeRuntime({ render: true });
    await diagnosticsOf(async () => loadModel({ file: 'main.ts', runtime: plain }));

    expect(parameterized.state.exports[0]?.source).toStrictEqual({ path: 'main.ts' });
    expect(plain.state.exports[0]?.source).toStrictEqual({ path: 'main.ts' });
  });

  it('should leave a caller-supplied client alive', async () => {
    const runtime = fakeRuntime();
    await diagnosticsOf(async () => loadModel({ file: 'main.ts', runtime }));
    expect(runtime.state.terminated).toBe(0);
  });

  it('should route inline code through the runtime source', async () => {
    const runtime = fakeRuntime({ empty: true });
    const error = await diagnosticsOf(async () =>
      loadModel({
        code: entrySource,
        file: 'main.ts',
        parameters: { a: 1 },
        runtime,
      }),
    );
    expect(error.diagnostics[0]?.code).toBe('GEOSPEC_MODEL_EXPORT_FAILED');
  });

  it('should build the default Node runtime client when none is supplied', async () => {
    // No runtime, no adapter: the loader falls back to `createNodeClient`, and
    // the real client answers with its own structured issues.
    const error = await diagnosticsOf(async () => loadModel({ code: entrySource, file: 'main.ts' }));
    expect(error.diagnostics.length).toBeGreaterThan(0);
  }, 180_000);

  it('should surface a failed export as its own issues', async () => {
    const runtime = fakeRuntime({ fail: true });
    const error = await diagnosticsOf(async () => loadModel({ file: 'main.ts', runtime }));
    expect(error.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'KERNEL_ERROR',
      'GEOSPEC_MODEL_EXPORT_FAILED',
    ]);
  });

  it('should surface an export-intent refusal', async () => {
    // A STEP export routed through a transcoder cannot carry exact BRep.
    const runtime = fakeRuntime({ transcoderId: 'mesher', fidelity: 'mesh' });
    const error = await diagnosticsOf(async () => loadModel({ file: 'main.ts', format: 'step', runtime }));
    expect(error.diagnostics[0]?.code).toBe('GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED');
  });

  it('should reject a route that stops honoring exact STEP after export', async () => {
    const { readFile } = await import('node:fs/promises');
    const runtime = fakeRuntime({ bytes: new Uint8Array(await readFile(twoCube)), fidelity: 'brep' });
    const routeAware = runtime as typeof runtime & {
      bestRouteFor(format: string): Record<string, unknown> | undefined;
    };
    const direct = routeAware.bestRouteFor('step')!;
    let calls = 0;
    routeAware.bestRouteFor = () => {
      calls += 1;
      return calls === 1 ? direct : { ...direct, transcoderId: 'mesher', fidelity: 'mesh' };
    };

    const error = await diagnosticsOf(async () => loadModel({ file: 'main.ts', format: 'step', runtime }));
    expect(error.diagnostics[0]?.code).toBe('GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED');
    expect(calls).toBe(2);
  });

  it('should use a source adapter when one claims the file extension', async () => {
    const runtime = fakeRuntime({ empty: true });
    let created = 0;
    const error = await diagnosticsOf(async () =>
      loadModel({
        file: 'part.scad',
        sourceAdapters: [
          {
            id: 'openrscad',
            extensions: ['.scad'],
            createRuntime: async () => {
              created += 1;
              return runtime;
            },
          },
        ],
      }),
    );
    expect(created).toBe(1);
    expect(error.diagnostics[0]?.code).toBe('GEOSPEC_MODEL_EXPORT_FAILED');
  });

  it('should hand a source adapter the project root when one is declared', async () => {
    const runtime = fakeRuntime({ empty: true });
    let seen: { projectPath?: string } | undefined;
    await diagnosticsOf(async () =>
      loadModel({
        file: 'part.scad',
        projectPath: '/tmp/project',
        sourceAdapters: [
          {
            id: 'openrscad',
            extensions: ['.scad'],
            createRuntime: async (created) => {
              seen = created;
              return runtime;
            },
          },
        ],
      }),
    );
    expect(seen?.projectPath).toBe('/tmp/project');
  });

  it('should export request-scoped without publishing preview geometry', async () => {
    const runtime = fakeRuntime({ render: true, bytes: await glbBytes() });
    const subject = await loadModel({ file: 'main.ts', runtime, parameters: { seed: 3 } });
    expect(runtime.state.rendered).toBe(0);
    expect(runtime.state.exports).toHaveLength(1);
    expect(runtime.state.exports[0]).toMatchObject({ source: { path: 'main.ts' }, parameters: { seed: 3 } });
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });

  it('should wrap a raw kernel throw as a structured load failure', async () => {
    const runtime = fakeRuntime({ throws: new Error('kernel exploded') });
    const error = await diagnosticsOf(async () => loadModel({ file: 'main.ts', runtime }));
    expect(error.diagnostics[0]?.code).toBe('GEOSPEC_MODEL_EXPORT_FAILED');
    expect(error.diagnostics[0]?.message).toContain('kernel exploded');

    const opaque = fakeRuntime({ throws: 'not an error' });
    const second = await diagnosticsOf(async () => loadModel({ file: 'main.ts', runtime: opaque }));
    expect(second.diagnostics[0]?.message).toContain('not an error');
  });

  it('should treat a route-less runtime as canonical', async () => {
    const runtime = fakeRuntime({ routes: false, empty: true });
    const error = await diagnosticsOf(async () => loadModel({ file: 'main.ts', runtime }));
    expect(error.diagnostics[0]?.code).toBe('GEOSPEC_MODEL_EXPORT_FAILED');
  });
});

describe('createModelLoader', () => {
  it('should apply its defaults to every call', async () => {
    const loader = createModelLoader({ format: 'mesh-buffer' });
    const subject = await loader({ source: triangle } as unknown as LoadModelOptions);
    expect(subject.mesh.stats.triangleCount).toBe(1);
    await loader.dispose();
  });

  it('should reuse one factory runtime across distinct artifacts and terminate it once', async () => {
    const runtime = fakeRuntime({ bytes: await glbBytes() });
    let created = 0;
    const loader = createModelLoader({
      runtime: async () => {
        created += 1;
        return runtime;
      },
    });

    await loader({ file: 'first.ts' });
    await loader({ file: 'second.ts' });
    expect(created).toBe(1);
    expect(runtime.state.connected).toBe(2);
    expect(runtime.state.exports).toHaveLength(2);
    expect(runtime.state.terminated).toBe(0);

    await loader.dispose();
    await loader.dispose();
    expect(runtime.state.terminated).toBe(1);
  });

  it('should forward runtime telemetry only while a forensic sink is attached', async () => {
    const runtime = fakeRuntime({ bytes: await glbBytes() });
    let emit: Parameters<NonNullable<GeoSpecRuntimeClient['on']>>[1] | undefined;
    const stop = vi.fn();
    runtime.on = (_event, handler) => {
      emit = handler;
      return stop;
    };
    const loader = createModelLoader({ runtime: async () => runtime });
    const measurements: unknown[] = [];
    const clear = setModelLoaderForensicSink(loader, (measurement) => measurements.push(measurement));

    await loader({ file: 'main.ts' });
    emit?.([{ name: 'export.packGltf', duration: 4, startTime: 0, workerTimeOrigin: 0 }]);
    clear();
    await loader.dispose();

    expect(measurements).toContainEqual({ name: 'export.packGltf', value: 4, unit: 'milliseconds' });
    expect(stop).toHaveBeenCalled();
  });

  it('should reject runtime work after disposal', async () => {
    const loader = createModelLoader({ runtime: async () => fakeRuntime() });
    await loader.dispose();
    await expect(loader({ file: 'main.ts' })).rejects.toThrow('disposed');
  });

  it('should leave a concrete default runtime caller-owned', async () => {
    const runtime = fakeRuntime({ bytes: await glbBytes() });
    const loader = createModelLoader({ runtime });
    const subject = await loader({ file: 'main.ts' });
    await loader.dispose();

    expect(subject.mesh.stats.triangleCount).toBe(1);
    expect(runtime.state.terminated).toBe(0);
  });

  it('should dispose cleanly after a shared runtime factory rejects', async () => {
    const loader = createModelLoader({
      runtime: async () => {
        throw new Error('runtime unavailable');
      },
    });
    await expect(loader({ file: 'main.ts' })).rejects.toThrow('runtime unavailable');
    await expect(loader.dispose()).resolves.toBeUndefined();
  });

  it('should lazily build the default Node runtime once', { timeout: 180_000 }, async () => {
    const loader = createModelLoader();
    try {
      const error = await diagnosticsOf(async () => loader({ code: entrySource, file: 'main.ts' }));
      expect(error.diagnostics.length).toBeGreaterThan(0);
    } finally {
      await loader.dispose();
    }
  });
});
