import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { JsonValue } from '@taucad/agent-host';

import { createHostToolRegistry } from '#agent-tools.js';
import type { HostPrepareKernel } from '#agent-tools.js';
import { prepareKernelToolName } from '#prepare-kernel-tool.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const makeWorkspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-prepare-kernel-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), 'export const main = 1;\n', 'utf8');
  return root;
};

const invoke = async (registry: ReturnType<typeof createHostToolRegistry>, toolName: string, input: JsonValue) =>
  registry.invoke({
    toolCallId: 'call-1',
    toolName,
    input,
    signal: new AbortController().signal,
  });

describe(prepareKernelToolName, () => {
  it('should be offered only by a host that prepares', async () => {
    const without = createHostToolRegistry({ workspaceRoot: await makeWorkspace() });
    const withPreparation = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      prepareKernel: async ({ kernel }) => ({ status: 'ready', kernel }),
    });

    expect(without.list().map(({ name }) => name)).not.toContain('prepare_kernel');
    expect(withPreparation.list().find(({ name }) => name === 'prepare_kernel')).toMatchObject({
      inputSchema: { required: ['kernel'] },
      executionMode: 'sequential',
    });
  });

  it('should forward the call signal, report progress as partial results and error unless ready', async () => {
    const seen: Array<{ kernel: string; aborted: boolean }> = [];
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      prepareKernel: async ({ kernel }, { signal, onProgress }): ReturnType<HostPrepareKernel> => {
        seen.push({ kernel, aborted: signal.aborted });
        onProgress({ progress: 5, total: 10, message: 'downloading python (0/3)' });
        if (kernel === 'build123d') {
          return { status: 'ready', kernel, closureIntegrity: 'sha256-a', treeIntegrity: 'sha256-b', byteLength: 10 };
        }
        return { status: 'blocked', kernel, reason: 'offline-miss', message: 'offline' };
      },
    });
    const updates: unknown[] = [];

    const ready = await registry.invoke({
      toolCallId: 'p1',
      toolName: 'prepare_kernel',
      input: { kernel: 'build123d' },
      signal: new AbortController().signal,
      onUpdate: (update) => updates.push(update),
    });
    const blocked = await invoke(registry, 'prepare_kernel', { kernel: 'picogk' });

    expect(seen).toEqual(['build123d', 'picogk'].map((kernel) => ({ kernel, aborted: false })));
    expect(updates).toEqual([
      { content: { progress: 5, total: 10, message: 'downloading python (0/3)' }, isError: false },
    ]);
    expect(ready).toEqual({
      content: {
        status: 'ready',
        kernel: 'build123d',
        closureIntegrity: 'sha256-a',
        treeIntegrity: 'sha256-b',
        byteLength: 10,
      },
      isError: false,
    });
    expect(blocked).toMatchObject({ isError: true, content: { status: 'blocked', reason: 'offline-miss' } });
  });

  it('should answer an unknown kernel and a missing name as tool errors with their codes', async () => {
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      prepareKernel: async ({ kernel }) => {
        throw Object.assign(
          new Error(`No native kernel is called '${kernel}'. Kernels that can be prepared: build123d, picogk.`),
          {
            code: 'UNKNOWN_KERNEL',
          },
        );
      },
    });

    await expect(invoke(registry, 'prepare_kernel', { kernel: 'nope' })).resolves.toEqual({
      isError: true,
      content: {
        errorCode: 'UNKNOWN_KERNEL',
        message: "No native kernel is called 'nope'. Kernels that can be prepared: build123d, picogk.",
      },
    });
    await expect(invoke(registry, 'prepare_kernel', {})).resolves.toMatchObject({
      isError: true,
      content: { errorCode: 'INVALID_INPUT' },
    });
  });
});
