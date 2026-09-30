// @vitest-environment node
/**
 * tscircuit kernel regression through the composed e2e runtime definition:
 * one checked-in board (`@taucad/tau-examples` `tscircuit/led-board`) rendered
 * once per `output` kind. The 3D output must be a valid GLB with at least one
 * mesh; the schematic and PCB outputs must be SVG documents with a `viewBox`.
 * A fetch guard fails the suite if any render reaches the network.
 */
import { NodeIO } from '@gltf-transform/core';
import { asKnownArtifact } from '@taucad/runtime';
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
let document: ReturnType<Client['open']> | undefined;

const render = async (output: '3d' | 'schematic' | 'pcb') => {
  client ??= createTestRuntimeClient({ runtime, files: fixture.files });
  document ??= client.open({ source: { path: fixture.mainFile }, watch: false });
  const view = document.view(output === '3d' ? 'board' : output);
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded) {
    throw new Error('render was superseded');
  }
  const { rendering } = outcome;
  expect(
    rendering.success,
    rendering.success ? undefined : rendering.issues.map(({ message }) => message).join('\n'),
  ).toBe(true);
  if (!rendering.success) {
    throw new Error('unreachable');
  }
  return asKnownArtifact(rendering.artifact);
};

beforeAll(() => {
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(async () => {
  document?.close();
  document = undefined;
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

    expect(data?.mimeType).toBe('model/gltf-binary');
    if (data?.mimeType !== 'model/gltf-binary') {
      throw new TypeError('Expected board GLB artifact.');
    }
    validateGlbData(data.content);
    const document = await new NodeIO().readBinary(data.content);
    expect(document.getRoot().listMeshes().length).toBeGreaterThanOrEqual(1);
  });

  it.each(['schematic', 'pcb'] as const)('should render the %s output as an SVG with a viewBox', async (output) => {
    const data = await render(output);

    expect(data?.mimeType).toBe('image/svg+xml');
    if (data?.mimeType !== 'image/svg+xml') {
      throw new TypeError(`Expected ${output} SVG artifact.`);
    }
    expect(data.content).toMatch(/^<svg [^>]*viewBox="0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?"/);
  });
});
