/**
 * `test_model` as `tau serve` composes it: the registry is given a runtime
 * client and no GeoSpec runner, so the default runner borrows that client and
 * the native engine verifies the example's own acceptance suite.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { replicad } from '@taucad/replicad';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';

import { createHostToolRegistry } from '#agent-tools.js';

const benchVise = fileURLToPath(new URL('../../../libs/tau-examples/src/kernels/replicad/bench-vise', import.meta.url));

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('test_model over the attached runtime', () => {
  it('should verify a bench vise requirement with the default runner', { timeout: 300_000 }, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-geospec-'));
    roots.push(workspaceRoot);
    await cp(benchVise, workspaceRoot, { recursive: true });
    const client = await createNodeClient({
      runtime: defineRuntime({ plugins: [esbuild(), middleware(), replicad()] }),
      projectPath: workspaceRoot,
    });
    try {
      const registry = createHostToolRegistry({ workspaceRoot, runtimeClient: async () => client });
      expect(registry.list().map((tool) => tool.name)).toContain('test_model');

      const result = await registry.invoke({
        toolCallId: 'bench-vise',
        toolName: 'test_model',
        /* One requirement keeps the default suite affordable; it still exports through the borrowed runtime
         * and checks exact BRep validity, topology, closure and volume on the native engine. */
        input: { files: ['main.geospec.ts'], testNamePattern: 'R10 Frame:' },
        signal: new AbortController().signal,
      });

      expect(result.isError, JSON.stringify(result.content)).toBe(false);
      expect(result.content).toMatchObject({
        success: true,
        passed: 1,
        total: 1,
        accounting: { selected: 1, passed: 1, failed: 0, inconclusive: 0 },
      });
    } finally {
      await client.shutdown();
    }
  });
});
