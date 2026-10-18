/**
 * The project root a CAD tool's answer names: the folder that call's paths resolved against, the
 * workspace or the checkout a run names.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JsonValue } from '@taucad/agent-host';
import type { GeoSpecRunner } from 'geospec/runner/worker';

import { createHostToolRegistry } from '#agent-tools.js';
import { fakeRuntime } from '#agent-tools-runtime.fixture.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const makeWorkspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-agent-tools-root-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), 'export const main = 1;\n', 'utf8');
  return root;
};

describe('createHostToolRegistry project root', () => {
  it('names the root each CAD call worked in on its answer, and leaves the file tools and failures as they are', async () => {
    const workspaceRoot = await makeWorkspace();
    const checkout = await makeWorkspace();
    await writeFile(join(checkout, 'main.geospec.ts'), 'export const spec = 1;\n', 'utf8');
    const run = vi.fn(async ({ files }: { readonly files: readonly string[] }) => ({
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: files.map(
        (file) =>
          ({
            file,
            result: {
              success: true,
              issues: [],
              tests: [{ suite: ['main'], name: 'is one piece', status: 'passed', assertions: [], diagnostics: [] }],
            },
          }) as const,
      ),
    }));
    const registry = createHostToolRegistry({
      workspaceRoot,
      checkouts: new Map([['run-1', { cwd: checkout }]]),
      runtimeClient: async () => fakeRuntime(),
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fake supplies exactly the runner slice the adapter drives.
      geospecRunner: async () => ({ run, close: async () => undefined }) as unknown as GeoSpecRunner,
    });
    const call = async (toolName: string, input: JsonValue, runId?: string) =>
      registry.invoke({
        toolCallId: `call-${toolName}`,
        toolName,
        input,
        ...(runId === undefined ? {} : { runId }),
        signal: new AbortController().signal,
      });

    for (const [toolName, input] of [
      ['evaluate_model', { targetFile: 'main.ts' }],
      ['screenshot', { targetFile: 'main.ts', mode: 'single' }],
      ['export_model', { targetFile: 'main.ts', to: 'glb' }],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one root after the other, as an agent calls them.
      expect(await call(toolName, input)).toMatchObject({ isError: false, content: { projectRoot: workspaceRoot } });
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      expect(await call(toolName, input, 'run-1')).toMatchObject({
        isError: false,
        content: { projectRoot: checkout },
      });
    }
    expect(await call('test_model', {}, 'run-1')).toMatchObject({ isError: false, content: { projectRoot: checkout } });
    const read = await call('read_file', { targetFile: 'main.ts' });
    expect(read.content).not.toHaveProperty('projectRoot');
    const refused = await call('evaluate_model', { targetFile: '../main.ts' });
    expect(refused.isError).toBe(true);
    expect(refused.content).not.toHaveProperty('projectRoot');
  });
});
