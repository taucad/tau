import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNodeClient } from '#node.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const syntheticKernel = defineKernel({
  id: 'synthetic',
  extensions: ['mock'],
  name: 'SyntheticKernel',
  version: '1.0.0',
  exportFormats: {},
  async initialize() {
    return {};
  },
  async getDependencies({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async getParameters() {
    return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
  },
  async createGeometry() {
    return { geometry: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' }, nativeHandle: {} };
  },
  async exportGeometry() {
    return { success: true, data: [], issues: [] };
  },
});

const runtime = defineRuntime({ kernels: [syntheticKernel()] });
const createClient = async (projectPath?: string) => createNodeClient(projectPath, { runtime });

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
      expect(outcome.geometry.success).toBe(true);
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
