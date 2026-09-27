// @vitest-environment node
/**
 * tscircuit kernel regression through the composed e2e runtime definition:
 * one checked-in board (`@taucad/tau-examples` `tscircuit/led-board`) rendered
 * once per `output` kind. The 3D output must be a valid GLB with at least one
 * mesh; the schematic and PCB outputs must be SVG documents with a `viewBox`.
 * A fetch guard fails the suite if any render reaches the network.
 */
import { NodeIO } from '@gltf-transform/core';
import { createTestRuntimeClient, validateGlbData } from '@taucad/runtime-testing';
import { loadFixture } from '@taucad/tau-examples/fixtures';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runtime } from '#runtime.definition.js';

const fixture = loadFixture('tscircuit', 'led-board');

const fetchGuard = vi.fn((): never => {
  throw new Error('network access is not allowed during a tscircuit render');
});

type Client = ReturnType<typeof createTestRuntimeClient<typeof runtime>>;
let client: Client | undefined;

const render = async (output: '3d' | 'schematic' | 'pcb') => {
  client ??= createTestRuntimeClient({ runtime, files: fixture.files });
  const outcome = await client.render({ source: { path: fixture.mainFile }, renderOptions: { output } });
  if (outcome.superseded) {
    throw new Error('render was superseded');
  }
  const { geometry } = outcome;
  expect(
    geometry.success,
    geometry.success ? undefined : geometry.issues.map(({ message }) => message).join('\n'),
  ).toBe(true);
  if (!geometry.success) {
    throw new Error('unreachable');
  }
  return geometry.data;
};

beforeAll(() => {
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(async () => {
  await client?.shutdown();
  client = undefined;
  expect(fetchGuard).not.toHaveBeenCalled();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('tscircuit kernel — led-board example outputs', () => {
  it('should render the 3d output as a GLB with at least one mesh', async () => {
    const data = await render('3d');

    expect(data.format).toBe('gltf');
    if (data.format !== 'gltf') {
      throw new Error('unreachable');
    }
    validateGlbData(data.content);
    const document = await new NodeIO().readBinary(data.content);
    expect(document.getRoot().listMeshes().length).toBeGreaterThanOrEqual(1);
  });

  it.each(['schematic', 'pcb'] as const)('should render the %s output as an SVG with a viewBox', async (output) => {
    const data = await render(output);

    expect(data.format).toBe('svg');
    if (data.format !== 'svg') {
      throw new Error('unreachable');
    }
    expect(data.content).toMatch(/^<svg [^>]*viewBox="0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?"/);
  });
});
