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
import type { NativeBuildInput } from '#framework/render-artifact.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import type { ExportGeometryInput, KernelRuntime } from '#types/runtime-kernel.types.js';
import type { CreateGeometryResult, ExportGeometryResult } from '#types/runtime.types.js';
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
  return { worker, files };
};

describe('request-scoped results name the source revision they evaluated (R4)', () => {
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
      getDependencies: () => [{ path, affects: ['createGeometry'] }],
      async wrapCreateGeometry(input, handler) {
        const result = await handler(input);
        return result.success
          ? { ...result, data: { format: 'gltf', content: new TextEncoder().encode(geometryValue) } }
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
      getDependencies: () => [{ path, affects: ['exportGeometry'] }],
      async wrapExportGeometry(input, handler) {
        const result = await handler(input);
        return result.success
          ? { ...result, data: [{ ...result.data[0]!, bytes: new TextEncoder().encode(exportValue) }] }
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
      getDependencies: () => [{ path, affects: ['exportGeometry'] }],
      async wrapExportGeometry(input, handler) {
        const result = await handler(input);
        return result.success
          ? { ...result, data: [{ ...result.data[0]!, bytes: new TextEncoder().encode(exportValue) }] }
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
      getDependencies: () => [{ path, affects: ['createGeometry'] }],
    });
    class SourceBoundHandleWorker extends MockKernelWorker {
      protected override async onCreateGeometry(
        _input: NativeBuildInput,
        _runtime: KernelRuntime,
      ): Promise<CreateGeometryResult> {
        this.createGeometryCalls++;
        this.captureNativeHandle({ value: geometryValue });
        return { success: true, data: { format: 'gltf', content: new TextEncoder().encode(geometryValue) }, issues: [] };
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
      { 'main.ts': 'same', [path]: geometryValue }, [middleware], SourceBoundHandleWorker,
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
