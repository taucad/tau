/**
 * Provenance on request-scoped kernel results (blueprint R4, invariant I5).
 *
 * Every request-scoped operation names the source revision it evaluated, in
 * the digest vocabulary the write path uses, so a stale answer is
 * self-diagnosing rather than indistinguishable from a fresh one.
 *
 * See `docs/research/agent-stale-kernel-result-elimination-blueprint.md`.
 */

import { describe, it, expect } from 'vitest';
import { digestContent } from '@taucad/cache-core';
import type { OnWorkerLog } from '@taucad/types';
import type { NativeBuildInput, OperationOwner } from '#framework/render-artifact.js';
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import type { ExportGeometryInput, KernelRuntime } from '#types/runtime-kernel.types.js';
import type { ExportGeometryResult } from '#types/runtime.types.js';
import type { EvaluateResult, RenderResult } from '#types/runtime-kernel-v2.types.js';
import type { RenderRequest } from '#types/runtime-middleware-v2.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  MockKernelWorker,
  createMockFileSystem,
  createGeometryFile,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

const noopLog: OnWorkerLog = () => {
  /* No-op */
};

const notFound = (path: string): NodeJS.ErrnoException => {
  const error = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  return error;
};

/** The digest a write handler computes for the bytes it just wrote. */
const writtenDigest = async (source: string): Promise<string> =>
  digestContent({ bytes: new TextEncoder().encode(source) });

const createHarness = (
  initial: Record<string, string>,
  middleware: ConstructorParameters<typeof MockKernelWorker>[0]['middleware'] = [],
  Worker: new (options: ConstructorParameters<typeof MockKernelWorker>[0]) => MockKernelWorker = MockKernelWorker,
) => {
  const files = new Map(Object.entries(initial));
  const filesystem = createMockFileSystem({
    existsResult: (path) => files.has(path),
    readFileResult: (path) => {
      const value = files.get(path);
      if (value === undefined) {
        throw notFound(path);
      }
      return value;
    },
  });
  filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
    Object.fromEntries(
      paths.map((path) => {
        const value = files.get(path);
        if (value === undefined) {
          throw notFound(path);
        }
        return [path, new TextEncoder().encode(value)];
      }),
    ),
  );
  const worker = new Worker({ middleware, onLog: noopLog, filesystem });
  // @ts-expect-error - the private bridge filesystem is what a host adapter supplies.
  worker.fileSystem = { ...filesystem };
  return { worker, files, filesystem };
};

describe('request-scoped results name the source revision they evaluated (R4)', () => {
  it('should measure repeated authored exports without treating parameter provenance as an export key', async () => {
    const geometryPath = 'geometry.flag';
    const exportPath = 'export.flag';
    const geometryDependencies: Array<{ hash: string; files: string[] }> = [];
    const exportDependencies: Array<{ hash: string; files: string[] }> = [];
    const middleware = defineMiddleware({
      id: 'measured-authored-dependencies',
      name: 'MeasuredAuthoredDependencies',
      resolve: () => [
        { path: geometryPath, affects: ['evaluate'] },
        { path: exportPath, affects: ['write'] },
      ],
      async wrapEvaluate(input, handler, runtime) {
        geometryDependencies.push({
          hash: runtime.dependencyHash,
          files: runtime.dependencies
            .filter((dependency) => dependency.type === 'file')
            .map(({ path, contentHash }) => `${path}:${contentHash}`),
        });
        return handler(input);
      },
      async wrapWrite(input, handler, runtime) {
        exportDependencies.push({
          hash: runtime.dependencyHash,
          files: runtime.dependencies
            .filter((dependency) => dependency.type === 'file')
            .map(({ path, contentHash }) => `${path}:${contentHash}`),
        });
        return handler(input);
      },
    });
    const authored = { files: new Map<string, string>() };
    class MeasuredWorker extends MockKernelWorker {
      protected override async onEvaluateForOwner(): Promise<EvaluateResult> {
        this.createGeometryCalls++;
        const geometry = authored.files.get(geometryPath)!;
        this.captureNativeHandle({ geometry });
        return { success: true, data: { views: ['model'] }, issues: [] };
      }

      protected override async onRenderForOwner(
        _owner: OperationOwner,
        input: RenderRequest & { nativeHandle: unknown },
      ): Promise<RenderResult> {
        const handle = input.nativeHandle as { geometry: string };
        return {
          success: true,
          data: { mimeType: 'model/gltf-binary', content: new TextEncoder().encode(handle.geometry) },
          issues: [],
        };
      }

      protected override async onExportGeometry(
        input: ExportGeometryInput,
        runtime: KernelRuntime,
      ): Promise<ExportGeometryResult> {
        this.exportGeometrySpy(input, runtime);
        const { geometry } = input.nativeHandle as { geometry: string };
        return {
          success: true,
          data: [
            {
              name: 'export.gltf',
              mimeType: 'model/gltf+json',
              bytes: new TextEncoder().encode(`${geometry}:${authored.files.get(exportPath) ?? 'missing'}`),
            },
          ],
          issues: [],
        };
      }
    }
    const harness = createHarness({ 'main.ts': 'same', [geometryPath]: 'g1' }, [middleware], MeasuredWorker);
    const { worker, files, filesystem } = harness;
    authored.files = files;
    const reads: Array<{ paths: string[]; bytes: number }> = [];
    const singleReads: Array<{ path: string; bytes: number }> = [];
    filesystem.mocks.readFile.mockImplementation(async (path: string) => {
      const source = files.get(path);
      if (source === undefined) {
        throw notFound(path);
      }
      const bytes = new TextEncoder().encode(source);
      singleReads.push({ path, bytes: bytes.byteLength });
      return bytes;
    });
    filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) => {
      const contents = Object.fromEntries(
        paths.map((path) => {
          const source = files.get(path);
          if (source === undefined) {
            throw notFound(path);
          }
          return [path, new TextEncoder().encode(source)];
        }),
      );
      reads.push({
        paths: [...paths],
        bytes: Object.values(contents).reduce((sum, value) => sum + value.byteLength, 0),
      });
      return contents;
    });
    const request = { file: createGeometryFile('main.ts'), parameters: {}, format: 'gltf' } satisfies Parameters<
      MockKernelWorker['exportModel']
    >[0];
    const observations = [];
    try {
      for (const edit of [undefined, undefined, 'geometry', 'export'] as const) {
        if (edit === 'geometry') {
          files.set(geometryPath, 'g2');
        } else if (edit === 'export') {
          files.set(exportPath, 'e1');
        }
        const before = reads.length;
        const beforeSingle = singleReads.length;
        const beforeExists = filesystem.mocks.exists.mock.calls.length;
        const beforeExports = worker.exportGeometrySpy.mock.calls.length;
        const started = performance.now();
        // oxlint-disable-next-line no-await-in-loop -- Each authored edit must precede the next export.
        const result = await worker.exportModel(request);
        /** Milliseconds. */
        const elapsed = performance.now() - started;
        expect(result.success).toBe(true);
        if (!result.success) {
          throw new Error('Expected an authored export.');
        }
        const { bytes } = result.data[0]!;
        observations.push({
          sourceRevision: result.sourceRevision,
          // oxlint-disable-next-line no-await-in-loop -- Digest the bytes returned by this exact export before the next edit.
          outputDigest: await digestContent({ bytes }),
          outputText: new TextDecoder().decode(bytes),
          readCalls: reads.length - before,
          readBytes: reads.slice(before).reduce((sum, read) => sum + read.bytes, 0),
          singleReadCalls: singleReads.length - beforeSingle,
          singleReadBytes: singleReads.slice(beforeSingle).reduce((sum, read) => sum + read.bytes, 0),
          existsCalls: filesystem.mocks.exists.mock.calls.length - beforeExists,
          exportCalls: worker.exportGeometrySpy.mock.calls.length - beforeExports,
          elapsed,
        });
      }
      expect(observations.map(({ outputText }) => outputText)).toEqual([
        'g1:missing',
        'g1:missing',
        'g2:missing',
        'g2:e1',
      ]);
      expect(new Set(observations.map(({ outputDigest }) => outputDigest)).size).toBe(3);
      expect(observations.map(({ sourceRevision }) => sourceRevision)).toEqual([
        observations[0]!.sourceRevision,
        observations[0]!.sourceRevision,
        observations[0]!.sourceRevision,
        observations[0]!.sourceRevision,
      ]);
      expect(geometryDependencies).toHaveLength(4);
      expect(exportDependencies).toHaveLength(4);
      expect(geometryDependencies[0]?.hash).toBe(geometryDependencies[1]?.hash);
      expect(geometryDependencies[1]?.hash).not.toBe(geometryDependencies[2]?.hash);
      expect(exportDependencies[2]?.hash).not.toBe(exportDependencies[3]?.hash);
      expect(exportDependencies[0]?.files).toContainEqual(expect.stringContaining(`${exportPath}:missing`));
      expect(exportDependencies[3]?.files).toContainEqual(expect.stringContaining(`${exportPath}:`));
      expect(
        observations.map(({ readCalls, readBytes, existsCalls, exportCalls }) => ({
          readCalls,
          readBytes,
          existsCalls,
          exportCalls,
        })),
      ).toEqual([
        { readCalls: 1, readBytes: 4, existsCalls: 0, exportCalls: 1 },
        { readCalls: 1, readBytes: 6, existsCalls: 1, exportCalls: 1 },
        { readCalls: 1, readBytes: 6, existsCalls: 1, exportCalls: 1 },
        { readCalls: 1, readBytes: 6, existsCalls: 1, exportCalls: 1 },
      ]);
      expect(
        observations.map(({ singleReadCalls, singleReadBytes }) => ({ singleReadCalls, singleReadBytes })),
      ).toEqual([
        { singleReadCalls: 1, singleReadBytes: 2 },
        { singleReadCalls: 0, singleReadBytes: 0 },
        { singleReadCalls: 0, singleReadBytes: 0 },
        { singleReadCalls: 1, singleReadBytes: 2 },
      ]);
      const snapshots = [];
      for (let index = 0; index < 2; index++) {
        const beforeReads = reads.length;
        const beforeSingle = singleReads.length;
        const beforeExists = filesystem.mocks.exists.mock.calls.length;
        // oxlint-disable-next-line no-await-in-loop -- Repeated snapshots must observe the same settled authored state in order.
        const snapshot = await worker.snapshotSource({ file: createGeometryFile('main.ts') });
        expect(snapshot.success).toBe(true);
        if (!snapshot.success) {
          throw new Error('Expected a coherent source snapshot.');
        }
        snapshots.push({
          files: snapshot.data.files.map(({ path, sha256 }) => `${path}:${sha256}`),
          readCalls: reads.length - beforeReads,
          readBytes: reads.slice(beforeReads).reduce((sum, read) => sum + read.bytes, 0),
          singleReadCalls: singleReads.length - beforeSingle,
          singleReadBytes: singleReads.slice(beforeSingle).reduce((sum, read) => sum + read.bytes, 0),
          existsCalls: filesystem.mocks.exists.mock.calls.length - beforeExists,
        });
      }
      expect(snapshots[0]?.files).toEqual(snapshots[1]?.files);
      expect(
        snapshots.map(({ readCalls, readBytes, singleReadCalls, singleReadBytes, existsCalls }) => ({
          readCalls,
          readBytes,
          singleReadCalls,
          singleReadBytes,
          existsCalls,
        })),
      ).toEqual([
        { readCalls: 3, readBytes: 24, singleReadCalls: 0, singleReadBytes: 0, existsCalls: 6 },
        { readCalls: 3, readBytes: 24, singleReadCalls: 0, singleReadBytes: 0, existsCalls: 6 },
      ]);
    } finally {
      await worker.cleanup();
    }
  });

  it('should return the entry digest the write path computes for the same bytes', async () => {
    const { worker } = createHarness({ 'main.ts': 'v1' });

    const result = await worker.evaluateModel({ file: createGeometryFile('main.ts'), parameters: {} });

    expect(result.success).toBe(true);
    expect(result.sourceRevision?.entry).toBe('main.ts');
    expect(result.sourceRevision?.files['main.ts']).toBe(await writtenDigest('v1'));
    await worker.cleanup();
  });

  it('should return a different revision once the entry is rewritten', async () => {
    const { worker, files } = createHarness({ 'main.ts': 'v1' });

    const first = await worker.evaluateModel({ file: createGeometryFile('main.ts'), parameters: {} });
    files.set('main.ts', 'v2');
    const second = await worker.evaluateModel({ file: createGeometryFile('main.ts'), parameters: {} });

    expect(first.sourceRevision?.files['main.ts']).toBe(await writtenDigest('v1'));
    expect(second.sourceRevision?.files['main.ts']).toBe(await writtenDigest('v2'));
    await worker.cleanup();
  });

  it('should name the same revision on getParameters, exportModel and snapshotSource', async () => {
    const { worker } = createHarness({ 'main.ts': 'v1' });
    const expected = await writtenDigest('v1');

    const parameters = await worker.getParameters(createGeometryFile('main.ts'));
    const exported = await worker.exportModel({
      file: createGeometryFile('main.ts'),
      parameters: {},
      format: 'gltf',
    });
    const snapshot = await worker.snapshotSource({ file: createGeometryFile('main.ts') });

    expect(parameters.sourceRevision?.files['main.ts']).toBe(expected);
    expect(exported.sourceRevision?.files['main.ts']).toBe(expected);
    expect(snapshot.sourceRevision?.files['main.ts']).toBe(expected);
    await worker.cleanup();
  });

  it('should not mistake parameter provenance for geometry-only source identity', async () => {
    const path = 'geometry.flag';
    let geometryValue = 'first';
    const middleware = defineMiddleware({
      id: 'geometry-only-provenance',
      name: 'GeometryOnlyProvenance',
      resolve: () => [{ path, affects: ['evaluate'] }],
      async wrapRender(input, handler) {
        const result = await handler(input);
        return result.success
          ? { ...result, data: { ...result.data, content: new TextEncoder().encode(geometryValue) } }
          : result;
      },
    });
    const { worker, files } = createHarness({ 'main.ts': 'same', [path]: geometryValue }, [middleware]);
    try {
      const first = await worker.evaluateModel({ file: createGeometryFile('main.ts'), parameters: {} });
      geometryValue = 'second';
      files.set(path, geometryValue);
      const second = await worker.evaluateModel({ file: createGeometryFile('main.ts'), parameters: {} });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (!first.success || !second.success) {
        throw new Error('Expected two evaluated geometries.');
      }
      expect(first.data.hash).not.toBe(second.data.hash);
      expect(first.sourceRevision).toEqual(second.sourceRevision);
      expect(first.sourceRevision?.files[path]).toBeUndefined();
    } finally {
      await worker.cleanup();
    }
  });

  it('should not mistake parameter provenance for export-only source identity', async () => {
    const path = 'export.flag';
    let exportValue = 'first';
    const middleware = defineMiddleware({
      id: 'export-only-provenance',
      name: 'ExportOnlyProvenance',
      resolve: () => [{ path, affects: ['write'] }],
      async wrapWrite(input, handler) {
        const result = await handler(input);
        return result.success
          ? { ...result, data: [{ ...result.data[0], bytes: new TextEncoder().encode(exportValue) }] }
          : result;
      },
    });
    const { worker, files } = createHarness({ 'main.ts': 'same', [path]: exportValue }, [middleware]);
    try {
      const first = await worker.exportModel({ file: createGeometryFile('main.ts'), parameters: {}, format: 'gltf' });
      exportValue = 'second';
      files.set(path, exportValue);
      const second = await worker.exportModel({ file: createGeometryFile('main.ts'), parameters: {}, format: 'gltf' });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (!first.success || !second.success) {
        throw new Error('Expected two exports.');
      }
      expect(first.data[0]?.bytes).not.toEqual(second.data[0]?.bytes);
      expect(first.sourceRevision).toEqual(second.sourceRevision);
      expect(first.sourceRevision?.files[path]).toBeUndefined();
    } finally {
      await worker.cleanup();
    }
  });

  it('should re-evaluate an export-only missing dependency when the file appears', async () => {
    const path = 'optional-export.flag';
    let exportValue = 'missing';
    const middleware = defineMiddleware({
      id: 'appearing-export-dependency',
      name: 'AppearingExportDependency',
      resolve: () => [{ path, affects: ['write'] }],
      async wrapWrite(input, handler) {
        const result = await handler(input);
        return result.success
          ? { ...result, data: [{ ...result.data[0], bytes: new TextEncoder().encode(exportValue) }] }
          : result;
      },
    });
    const { worker, files } = createHarness({ 'main.ts': 'same' }, [middleware]);
    try {
      const first = await worker.exportModel({ file: createGeometryFile('main.ts'), parameters: {}, format: 'gltf' });
      files.set(path, 'present');
      exportValue = 'present';
      const second = await worker.exportModel({ file: createGeometryFile('main.ts'), parameters: {}, format: 'gltf' });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (!first.success || !second.success) {
        throw new Error('Expected two exports.');
      }
      expect(new TextDecoder().decode(first.data[0]?.bytes)).toBe('missing');
      expect(new TextDecoder().decode(second.data[0]?.bytes)).toBe('present');
      expect(first.sourceRevision).toEqual(second.sourceRevision);
    } finally {
      await worker.cleanup();
    }
  });

  it('should not reuse a published render after its geometry-only dependency changes', async () => {
    const path = 'geometry.flag';
    let geometryValue = 'first';
    const middleware = defineMiddleware({
      id: 'render-cache-source',
      name: 'RenderCacheSource',
      resolve: () => [{ path, affects: ['evaluate'] }],
    });
    class SourceBoundHandleWorker extends MockKernelWorker {
      protected override async onEvaluateForOwner(
        _owner: OperationOwner,
        _input: NativeBuildInput,
        _runtime: KernelRuntime,
      ): Promise<EvaluateResult> {
        this.createGeometryCalls++;
        this.captureNativeHandle({ value: geometryValue });
        return { success: true, data: { views: ['model'] }, issues: [] };
      }

      protected override async onRenderForOwner(
        _owner: OperationOwner,
        input: RenderRequest & { nativeHandle: unknown },
      ): Promise<RenderResult> {
        const handle = input.nativeHandle as { value: string };
        return {
          success: true,
          data: { mimeType: 'model/gltf-binary', content: new TextEncoder().encode(handle.value) },
          issues: [],
        };
      }

      protected override async onExportGeometry(
        input: ExportGeometryInput,
        _runtime: KernelRuntime,
      ): Promise<ExportGeometryResult> {
        const handle = input.nativeHandle as { value: string };
        return {
          success: true,
          data: [{ name: 'export.gltf', mimeType: 'model/gltf+json', bytes: new TextEncoder().encode(handle.value) }],
          issues: [],
        };
      }
    }
    const { worker, files } = createHarness(
      { 'main.ts': 'same', [path]: geometryValue },
      [middleware],
      SourceBoundHandleWorker,
    );
    try {
      await worker.runCreateGeometry('main.ts');
      const first = await worker.exportModel({ file: createGeometryFile('main.ts'), parameters: {}, format: 'gltf' });
      const buildsAfterFirst = worker.createGeometryCalls;
      geometryValue = 'second';
      files.set(path, geometryValue);
      const second = await worker.exportModel({ file: createGeometryFile('main.ts'), parameters: {}, format: 'gltf' });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (!first.success || !second.success) {
        throw new Error('Expected two exports.');
      }
      expect(new TextDecoder().decode(first.data[0]?.bytes)).toBe('first');
      expect(new TextDecoder().decode(second.data[0]?.bytes)).toBe('second');
      expect(first.sourceRevision).toEqual(second.sourceRevision);
      expect(worker.createGeometryCalls).toBeGreaterThan(buildsAfterFirst);
    } finally {
      await worker.cleanup();
    }
  });
});
