/**
 * A durable parameter-cache entry across a comment-only edit of a bundle-keyed kernel (G1).
 *
 * The build key ignores comments for a kernel that opts into bundle source identity, but a parameter
 * manifest records each source file's content digest, so the parameter key must stay on those bytes:
 * an entry keyed on the bundle would replay the old `identity.sourceFiles` and fail admission.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { createKernelParameterDeclaration, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import { esbuildBundler } from '@taucad/esbuild';
import { parameterCache } from '@taucad/middleware';

const probe = defineKernel({
  id: 'bundle-keyed-probe',
  extensions: ['ts'],
  name: 'Bundle-keyed probe',
  version: '1.0.0',
  sourceIdentity: 'bundle',
  views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
  exports: {},
  initialize: async () => ({}),
  resolve: async ({ entryPath }, runtime) => runtime.bundler.resolveDependencies(entryPath),
  describe: async ({ entryPath }, runtime) => {
    const bundle = await runtime.bundler.bundle(entryPath);
    await runtime.execute(bundle.code);
    return createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        { size: 1 },
        { type: 'object', properties: { size: { type: 'number', default: 1 } } },
        { id: 'urn:taucad:test:bundle-keyed-probe', name: 'BundleKeyedProbeParameters' },
      ),
    });
  },
  evaluate: async () => ({ handle: 'ok' }),
  render: async () => ({ content: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
});

// The durable parameter key must stay correct while this middleware still ships.
// oxlint-disable-next-line typescript/no-deprecated, eslint/no-deprecated -- exercised on purpose
const runtime = defineRuntime({ kernels: [probe()], bundlers: [esbuildBundler()], middleware: [parameterCache()] });
const source = 'export const defaultParams = { size: 1 };\nexport default function main() { return 1; }\n';

let hostState: string | undefined;
afterEach(async () => {
  if (hostState) {
    await rm(hostState, { recursive: true, force: true });
    hostState = undefined;
  }
});

const evaluate = async (directory: string, text: string) => {
  const engine = createSqliteComputeEngine({ directory });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ 'main.ts': text }),
      compute: { mode: 'durable', store: fromSqlite({ store: engine, workspace: 'parameter-cache' }) },
    }),
  });
  try {
    const document = client.open({ source: { path: 'main.ts' }, parameters: {}, watch: false });
    try {
      const outcome = await document.evaluation();
      return outcome.superseded ? undefined : outcome.evaluation;
    } finally {
      document.close();
      await client.shutdown();
    }
  } finally {
    await engine.dispose();
  }
};

describe('durable parameter cache across a comment-only edit', () => {
  it('describes the commented source successfully from a fresh worker', async () => {
    hostState = await mkdtemp(join(tmpdir(), 'tau-parameter-cache-'));
    const first = await evaluate(hostState, source);
    expect(first?.success).toBe(true);
    const commented = await evaluate(hostState, `// a note\n${source}`);
    expect(commented?.issues ?? []).toEqual([]);
    expect(commented?.success).toBe(true);
  });
});

describe('durable parameter cache across a comment-only edit, same worker', () => {
  it('evaluates a comment-only edit staged on an open document', async () => {
    hostState = await mkdtemp(join(tmpdir(), 'tau-parameter-cache-'));
    const engine = createSqliteComputeEngine({ directory: hostState });
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem: fromMemoryFs({ 'main.ts': source }),
        compute: { mode: 'durable', store: fromSqlite({ store: engine, workspace: 'parameter-cache' }) },
      }),
    });
    const document = client.open({ source: { path: 'main.ts' }, parameters: {}, watch: false });
    try {
      const first = await document.evaluation();
      expect(first.superseded ? undefined : first.evaluation.success).toBe(true);
      // Let the first description publish before the edit.
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      const edited = await document.update({ stage: { 'main.ts': `// a note\n${source}` } });
      const evaluation = edited.superseded ? undefined : edited.evaluation;
      expect(evaluation?.issues ?? []).toEqual([]);
      expect(evaluation?.success).toBe(true);
    } finally {
      document.close();
      await client.shutdown();
      await engine.dispose();
    }
  });
});
