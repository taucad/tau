import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import parcelWatcher from '@parcel/watcher';
import { createNodeClient } from '#node.js';
import { defineKernelV2 as defineKernel } from '#types/runtime-kernel-v2.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
// oxlint-disable-next-line no-restricted-imports -- Runtime-private fixture stays outside the package build graph.
import { createParameterDeclaration } from '../test/support/kernel-worker.fixture.js';

const syntheticKernel = defineKernel({
  id: 'synthetic',
  extensions: ['mock'],
  name: 'SyntheticKernel',
  version: '1.0.0',
  views: { preview: { title: 'Preview', mimeType: 'model/gltf-binary' } },
  exports: {},
  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe() {
    const declaration = createParameterDeclaration();
    if (!declaration.success) {
      return declaration;
    }
    return { success: true, data: { parameters: declaration.data }, issues: declaration.issues };
  },
  async evaluate() {
    return { handle: {}, views: ['preview'] as const, exports: [] as const };
  },
  async render() {
    return { content: new Uint8Array([1, 2, 3]) };
  },
});

const runtime = defineRuntime({ kernels: [syntheticKernel()] });
const createClient = async (projectPath?: string) => createNodeClient({ runtime, projectPath });

describe('createNodeClient', () => {
  it('returns a lazily connected client with the command surface', async () => {
    const client = await createClient();

    expect(client.lifecycleState).toBe('unconnected');
    expect(client.open).toBeTypeOf('function');
    expect(client.setOperationTimeout).toBeTypeOf('function');
    expect(client.terminate).toBeTypeOf('function');
    expect(client.on).toBeTypeOf('function');
    expect(client.connect).toBeTypeOf('function');

    client.terminate();
  });

  it('auto-connects on the first inline document evaluation and view', async () => {
    const client = await createClient();
    const document = client.open({ source: { files: { 'main.mock': 'fixture' } } });
    const outcome = await document.evaluation();

    expect(client.lifecycleState).toBe('connected');
    expect(outcome.superseded).toBe(false);
    if (!outcome.superseded) {
      expect(outcome.evaluation.success, JSON.stringify(outcome.evaluation.issues)).toBe(true);
    }
    const view = document.view('preview');
    await expect(view.rendering()).resolves.toMatchObject({ superseded: false, rendering: { success: true } });
    view.close();
    document.close();

    client.terminate();
  });

  it('closes the admitted native subscription before shutdown resolves for a path-backed client', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'taucad-node-client-'));
    await writeFile(join(projectDirectory, 'main.mock'), 'fixture');
    const nativeSubscribe = parcelWatcher.subscribe.bind(parcelWatcher);
    const active = new Set<Awaited<ReturnType<typeof parcelWatcher.subscribe>>>();
    const subscribe = vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (...args) => {
      const subscription = await nativeSubscribe(...args);
      active.add(subscription);
      const nativeUnsubscribe = subscription.unsubscribe.bind(subscription);
      vi.spyOn(subscription, 'unsubscribe').mockImplementation(async () => {
        await nativeUnsubscribe();
        active.delete(subscription);
      });
      return subscription;
    });
    let client: Awaited<ReturnType<typeof createClient>> | undefined;
    let document: ReturnType<Awaited<ReturnType<typeof createClient>>['open']> | undefined;
    try {
      client = await createClient(projectDirectory);
      document = client.open({ source: { path: 'main.mock' }, watch: true });
      const outcome = await document.evaluation();
      expect(outcome.superseded).toBe(false);
      expect(subscribe).toHaveBeenCalled();
      expect(active.size).toBeGreaterThan(0);

      document.close();
      // A worker thread may exit right after shutdown; native unsubscribe work
      // still settling then aborts the process inside the addon.
      await client.shutdown();
      expect(active.size).toBe(0);
    } finally {
      document?.close();
      client?.terminate();
      subscribe.mockRestore();
      await rm(projectDirectory, { recursive: true, force: true });
    }
  });
});
