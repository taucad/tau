/* eslint-disable @typescript-eslint/naming-convention -- file-system path keys are not camelCase identifiers. */
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

const createHarness = (initial: Record<string, string>) => {
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
  const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
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
});
