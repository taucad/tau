import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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
    return { handle: {} };
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
    expect(client.render).toBeTypeOf('function');
    expect(client.updateParameters).toBeTypeOf('function');
    expect(client.setOptions).toBeTypeOf('function');
    expect(client.setRenderTimeout).toBeTypeOf('function');
    expect(client.export).toBeTypeOf('function');
    expect(client.terminate).toBeTypeOf('function');
    expect(client.on).toBeTypeOf('function');
    expect(client.connect).toBeTypeOf('function');

    client.terminate();
  });

  it('auto-connects on the first inline render', async () => {
    const client = await createClient();
    const outcome = await client.render({ source: { files: { 'main.mock': 'fixture' } } });

    expect(client.lifecycleState).toBe('connected');
    expect(outcome.superseded).toBe(false);
    if (!outcome.superseded) {
      expect(outcome.geometry.success, JSON.stringify(outcome.geometry.issues)).toBe(true);
    }

    client.terminate();
  });

  it('releases fs.watch handles on terminate for a path-backed client', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'taucad-node-client-'));
    await writeFile(join(projectDirectory, 'main.mock'), 'fixture');
    const client = await createClient(projectDirectory);

    const outcome = await client.render({ source: { path: 'main.mock' } });
    expect(outcome.superseded).toBe(false);
    expect(process.getActiveResourcesInfo()).toContain('FSEventWrap');

    client.terminate();
    await vi.waitFor(() => {
      expect(process.getActiveResourcesInfo()).not.toContain('FSEventWrap');
    });
  });
});
