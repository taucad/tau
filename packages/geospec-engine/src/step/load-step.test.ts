/* eslint-disable @typescript-eslint/naming-convention -- `HEAPF64`, `GeoSpecXdeReader` and `FS` are the kernel's own embind names. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { GeoSpecModelLoadError } from 'geospec/model';
import { createStepLoader, defaultWallWorkUnitBudget, loadStep, parseXdeReadResultJson } from '#step/load-step.js';
import type { GeoSpecNativeStepBackend, GeoSpecNativeXdeReadResult, StepSource } from '#step/types.js';

const fixturePath = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');
const fixtureBytes = readFileSync(fixturePath);
const fixtureText = fixtureBytes.toString('utf8');

const readResultJson = JSON.stringify({
  occurrences: [
    { path: 'cubeA', productName: 'cubeA', transform: [], shapeIndex: 0 },
    { path: 'cubeB', productName: 'cubeB', transform: [], shapeIndex: 1 },
  ],
});

/** One triangle laid out at heap offset 80 bytes. */
const heap = new Float64Array(64);
heap.set([0, 0, 0, 1, 0, 0, 0, 1, 0], 10);

type FakeOptions = {
  isSuccess?: boolean;
  meshTriangles?: string;
  resultJson?: string;
  filesystem?: boolean;
  reader?: boolean;
};

const fakeBackend = (
  options: FakeOptions = {},
): { backend: GeoSpecNativeStepBackend; native: GeoSpecNativeXdeReadResult; calls: string[] } => {
  const calls: string[] = [];
  const native = {
    isSuccess: () => options.isSuccess ?? true,
    resultJson: () => options.resultJson ?? readResultJson,
    extrema: () => '{}',
    classifyPoints: () => '{}',
    commonVolume: () => '{}',
    faceFacts: () => '{"faces":[]}',
    analysisSummaryJson: () => '{}',
    analysisMassPropertiesJson: () => '{}',
    analysisFaceFeaturesJson: () => '{}',
    analysisValidityJson: (json: string) => {
      calls.push(`validity:${json}`);
      return '{}';
    },
    analysisWallThicknessJson: (json: string) => {
      calls.push(`wall:${json}`);
      return '{}';
    },
    meshTriangles: (json: string) => {
      calls.push(`mesh:${json}`);
      return options.meshTriangles ?? '{"triangleCount":1}';
    },
    meshTrianglePointer: () => 80,
    meshTriangleCount: () => 1,
    occurrenceMeshTriangles: () => '{}',
    delete: vi.fn(),
  } satisfies GeoSpecNativeXdeReadResult;

  const backend = {
    HEAPF64: heap,
    ...(options.reader === false
      ? {}
      : {
          GeoSpecXdeReader: {
            readText: (data: string, json: string) => {
              calls.push(`readText:${data.length}:${json}`);
              return native;
            },
            readFile: (path: string, json: string) => {
              calls.push(`readFile:${path}:${json}`);
              return native;
            },
          },
        }),
    ...(options.filesystem === false
      ? {}
      : {
          FS: {
            writeFile: (path: string) => calls.push(`writeFile:${path}`),
            unlink: (path: string) => calls.push(`unlink:${path}`),
          },
        }),
  } as unknown as GeoSpecNativeStepBackend;

  return { backend, native, calls };
};

describe('parseXdeReadResultJson', () => {
  it('should default every collection the reader omitted', () => {
    expect(parseXdeReadResultJson('{}')).toStrictEqual({
      occurrences: [],
      subshapeNames: [],
      datumPlacements: [],
      semanticDatums: [],
      datumSystems: [],
      supplementalPlanes: [],
      freeShapeCount: 0,
    });
  });

  it('should surface a reader error as a load failure', () => {
    expect(() => parseXdeReadResultJson('{"error":"bad entity"}')).toThrow(GeoSpecModelLoadError);
  });
});

describe('loadStep source normalization', () => {
  it('should read a filesystem path and record its provenance', async () => {
    const { backend } = fakeBackend();
    const subject = await loadStep({ source: fixturePath, name: 'two-cube', nativeStepBackend: backend });

    expect(subject.provenance).toMatchObject({
      loader: 'opencascade-step',
      unit: 'mm',
      contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) as unknown as string,
      source: {
        kind: 'path',
        format: 'step',
        path: fixturePath,
        name: 'two-cube',
        byteLength: fixtureBytes.byteLength,
      },
    });
    expect(subject.step?.readStrategy).toStrictEqual({
      strategy: 'native-stream',
      inputKind: 'path',
      bytesRead: fixtureBytes.byteLength,
      nativeReadStream: true,
      copiedToEmscriptenFs: false,
    });
  });

  it('should accept every declared source form', async () => {
    const kinds: string[] = [];
    const bytes = (): Uint8Array<ArrayBuffer> => new Uint8Array(fixtureBytes);
    const sources = [
      pathToFileURL(fixturePath),
      bytes(),
      fixtureBytes.buffer.slice(fixtureBytes.byteOffset, fixtureBytes.byteOffset + fixtureBytes.byteLength),
      new Blob([bytes()]),
      new File([bytes()], 'model.step'),
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.enqueue(bytes().slice(0, 10));
          controller.enqueue(bytes().slice(10));
          controller.close();
        },
      }),
      (async function* stream() {
        yield bytes();
      })(),
    ];
    const loaded = await Promise.all(
      sources.map(async (source) =>
        loadStep({ source: source as StepSource, nativeStepBackend: fakeBackend().backend }),
      ),
    );
    const reference = await loadStep({ source: bytes(), nativeStepBackend: fakeBackend().backend });
    for (const subject of loaded) {
      kinds.push(subject.step?.readStrategy.inputKind ?? '?');
      expect(subject.provenance.contentHash).toBe(reference.provenance.contentHash);
    }

    expect(kinds).toStrictEqual(['url', 'bytes', 'array-buffer', 'blob', 'file', 'readable-stream', 'async-iterable']);
  });

  it('should refuse a non-file URL', async () => {
    await expect(loadStep({ source: new URL('https://example.com/a.step') })).rejects.toThrow(
      /only file: URLs are supported/u,
    );
  });

  it('should refuse a source over the byte limit', async () => {
    await expect(loadStep({ source: fixturePath, maxBytes: 10 })).rejects.toThrow(/over the 10-byte limit/u);
  });

  it('should honour an abort signal before and after reading the source', async () => {
    await expect(loadStep({ source: fixturePath, signal: AbortSignal.abort() })).rejects.toThrow();

    const controller = new AbortController();
    const source = (async function* stream() {
      yield new Uint8Array(fixtureBytes);
      controller.abort();
    })();
    await expect(loadStep({ source, signal: controller.signal })).rejects.toThrow();
  });

  it('should report every load phase in order', async () => {
    const { backend } = fakeBackend();
    const phases: string[] = [];
    await loadStep({ source: fixturePath, nativeStepBackend: backend, onProgress: ({ phase }) => phases.push(phase) });

    expect(phases).toStrictEqual(['read-source', 'parse-step', 'mesh-brep']);
  });
});

describe('loadStep kernel handling', () => {
  it('should read through the Emscripten filesystem when asked, and clean up after itself', async () => {
    const { backend, calls } = fakeBackend();
    const subject = await loadStep({ source: fixturePath, streaming: 'filesystem', nativeStepBackend: backend });

    expect(subject.step?.readStrategy).toMatchObject({
      strategy: 'filesystem',
      nativeReadStream: false,
      copiedToEmscriptenFs: true,
    });
    expect(calls.filter((call) => call.startsWith('writeFile') || call.startsWith('unlink'))).toHaveLength(2);
  });

  it('should refuse the filesystem strategy on a build without an Emscripten filesystem', async () => {
    const { backend } = fakeBackend({ filesystem: false });

    await expect(
      loadStep({ source: fixturePath, streaming: 'filesystem', nativeStepBackend: backend }),
    ).rejects.toThrow(/Emscripten filesystem/u);
  });

  it('should refuse a build with no XDE reader binding', async () => {
    const { backend } = fakeBackend({ reader: false });

    await expect(loadStep({ source: fixturePath, nativeStepBackend: backend })).rejects.toThrow(
      /no GeoSpecXdeReader binding/u,
    );
  });

  it('should dispose the handle and fail the load when the read fails', async () => {
    const { backend, native } = fakeBackend({ isSuccess: false, resultJson: 'unsupported schema' });

    await expect(loadStep({ source: fixturePath, nativeStepBackend: backend })).rejects.toThrow(
      /could not read the STEP source/u,
    );
    expect(native.delete).toHaveBeenCalledTimes(1);
  });

  it('should accept the alternate backend injection point', async () => {
    const { backend } = fakeBackend();

    await expect(loadStep({ source: fixturePath, openCascade: backend })).resolves.toMatchObject({
      kind: 'geometry-subject',
    });
  });
});

describe('loadStep evidence', () => {
  it('should build mesh evidence from the retained soup', async () => {
    const { backend } = fakeBackend();
    const subject = await loadStep({ source: fixturePath, name: 'part', nativeStepBackend: backend });

    expect(subject.mesh.format).toBe('mesh-buffer');
    expect(subject.mesh.stats.triangleCount).toBe(1);
    expect(subject.mesh.stats.meshQuality.triangles[0]?.primitive).toBe('part#0');
    expect(subject.capabilities).toContainEqual({ kind: 'mesh', feature: 'triangles' });
  });

  it('should fall back to the source path, then a constant, for the primitive label', async () => {
    const withPath = await loadStep({
      source: fixturePath,
      path: 'main.step',
      nativeStepBackend: fakeBackend().backend,
    });
    expect(withPath.mesh.stats.meshQuality.triangles[0]?.primitive).toBe('main.step#0');

    const bare = await loadStep({ source: fixturePath, nativeStepBackend: fakeBackend().backend });
    expect(bare.mesh.stats.meshQuality.triangles[0]?.primitive).toBe('step#0');
  });

  it('should skip meshing when the caller asked for BRep-only evidence', async () => {
    const { backend, calls } = fakeBackend();
    const subject = await loadStep({ source: fixturePath, mesh: false, nativeStepBackend: backend });

    expect(calls.some((call) => call.startsWith('mesh:'))).toBe(false);
    expect(subject.mesh.stats.triangleCount).toBe(0);
    expect(subject.capabilities.some((capability) => capability.kind === 'mesh')).toBe(false);
  });

  it('should leave mesh evidence empty when the kernel cannot tessellate', async () => {
    const { backend } = fakeBackend({ meshTriangles: '{"error":"meshing failed"}' });
    const subject = await loadStep({ source: fixturePath, nativeStepBackend: backend });

    expect(subject.mesh.stats.triangleCount).toBe(0);
  });

  it('should extract the schema from Part 21 and product structure from XDE', async () => {
    const { backend } = fakeBackend();
    const subject = await loadStep({ source: fixturePath, nativeStepBackend: backend });

    expect(subject.step?.schema).toContain('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING');
    expect(subject.step?.productStructure).toStrictEqual([
      { name: 'cubeA', path: 'cubeA', transform: [] },
      { name: 'cubeB', path: 'cubeB', transform: [] },
    ]);
  });

  it('should ignore raw product tokens in favor of XDE occurrence identity', async () => {
    const { backend } = fakeBackend({
      resultJson: JSON.stringify({
        occurrences: [{ path: "o'ring", productName: "o'ring", transform: [], shapeIndex: 0 }],
      }),
    });
    const text = "FILE_SCHEMA(('X'));\n#1=PRODUCT('wrong raw name','',#2);";
    const subject = await loadStep({ source: new TextEncoder().encode(text), nativeStepBackend: backend });

    expect(subject.step?.productStructure).toStrictEqual([{ name: "o'ring", path: "o'ring", transform: [] }]);
  });

  it('should preserve one XDE row per occurrence of an instanced product', async () => {
    const occurrences = ['Main Cap Bolt', 'Main Cap Bolt 2', 'Main Cap Bolt 3'].map((path, shapeIndex) => ({
      path,
      productName: 'Main Cap Bolt',
      transform: [],
      shapeIndex,
    }));
    const { backend } = fakeBackend({ resultJson: JSON.stringify({ occurrences }) });
    const text = "FILE_SCHEMA(('X'));\n#1=PRODUCT('Main Cap Bolt','',#2);";
    const subject = await loadStep({ source: new TextEncoder().encode(text), nativeStepBackend: backend });

    expect(subject.step?.productStructure).toStrictEqual([
      { name: 'Main Cap Bolt', path: 'Main Cap Bolt', transform: [] },
      { name: 'Main Cap Bolt 2', path: 'Main Cap Bolt 2', transform: [] },
      { name: 'Main Cap Bolt 3', path: 'Main Cap Bolt 3', transform: [] },
    ]);
  });

  it('should record the caller parameters and unit', async () => {
    const { backend } = fakeBackend();
    const subject = await loadStep({
      source: fixturePath,
      unit: 'cm',
      parameters: { width: 3 },
      nativeStepBackend: backend,
    });

    expect(subject.provenance).toMatchObject({ unit: 'cm', parameters: { width: 3 } });
    expect(subject.step?.unit).toBe('cm');
  });

  it('should thread the tessellation and budget settings into the kernel calls', async () => {
    const { backend, calls } = fakeBackend();
    const subject = await loadStep({
      source: fixturePath,
      meshLinearTolerance: 0.5,
      meshAngularToleranceDegrees: 40,
      nativeStepBackend: backend,
    });
    void subject.brep?.minimumWallThickness;

    expect(calls).toContain('mesh:{"mesh":true,"meshLinearTolerance":0.5,"meshAngularToleranceDegrees":40}');
    expect(calls).toContain(
      `wall:{"workUnitBudget":${defaultWallWorkUnitBudget},"meshLinearTolerance":0.5,"meshAngularToleranceDegrees":40}`,
    );
  });
});

describe('loadStep handle lifecycle', () => {
  it('should delete the native handle exactly once and refuse facet reads afterwards', async () => {
    const { backend, native } = fakeBackend();
    const subject = await loadStep({ source: fixturePath, nativeStepBackend: backend });

    subject.nativeXde?.delete?.();
    subject.nativeXde?.delete?.();
    expect(native.delete).toHaveBeenCalledTimes(1);
    expect(subject.brep?.validity).toBeUndefined();
  });

  it('should forward every binding to the retained read', async () => {
    const { backend } = fakeBackend();
    const subject = await loadStep({ source: fixturePath, nativeStepBackend: backend });
    const handle = subject.nativeXde;

    expect(handle?.isSuccess()).toBe(true);
    expect(handle?.resultJson()).toBe(readResultJson);
    expect(handle?.extrema(0, 0, 1, 0)).toBe('{}');
    expect(handle?.classifyPoints(0, '[]')).toBe('{}');
    expect(handle?.commonVolume(0, 1)).toBe('{}');
    expect(handle?.faceFacts(0)).toBe('{"faces":[]}');
    expect(handle?.analysisSummaryJson()).toBe('{}');
    expect(handle?.analysisMassPropertiesJson()).toBe('{}');
    expect(handle?.analysisFaceFeaturesJson()).toBe('{}');
    expect(handle?.analysisValidityJson('{}')).toBe('{}');
    expect(handle?.analysisWallThicknessJson('{}')).toBe('{}');
    expect(handle?.meshTriangles('{}')).toBe('{"triangleCount":1}');
    expect(handle?.meshTrianglePointer()).toBe(80);
    expect(handle?.meshTriangleCount()).toBe(1);
    expect(handle?.occurrenceMeshTriangles(0, '{}')).toBe('{}');
  });
});

describe('createStepLoader', () => {
  it('should apply defaults that each call can override', async () => {
    const { backend } = fakeBackend();
    const load = createStepLoader({ unit: 'cm', nativeStepBackend: backend });

    const defaulted = await load({ source: fixturePath });
    expect(defaulted.provenance.unit).toBe('cm');
    const overridden = await load({ source: fixturePath, unit: 'm' });
    expect(overridden.provenance.unit).toBe('m');
    const bare = await createStepLoader()({ source: fixtureText, nativeStepBackend: backend }).catch(() => 'threw');
    expect(bare).toBe('threw');
  });
});
