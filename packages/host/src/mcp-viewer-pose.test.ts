import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TauViewerModel, TauViewerViewState } from '@taucad/mcp/viewer-protocol';

import { createMcpViewerPoser } from '#mcp-viewer-pose.js';
import type { McpViewerPosePages } from '#mcp-viewer-pose.js';

const topologyExtension = 'TAU_cad_topology';

/** A GLB whose binary chunk is one `TAU_cad_topology` payload. */
const glbOf = (payload: unknown): Uint8Array<ArrayBuffer> => {
  const pad = (bytes: Uint8Array<ArrayBuffer>, fill: number): Uint8Array<ArrayBuffer> => {
    const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
    padded.set(bytes);
    return padded;
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const bin = pad(payloadBytes, 0);
  const json = pad(
    new TextEncoder().encode(
      JSON.stringify({
        asset: { version: '2.0' },
        extensions: { [topologyExtension]: { topologyBufferView: 0 } },
        buffers: [{ byteLength: bin.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: payloadBytes.byteLength }],
      }),
    ),
    0x20,
  );
  const bytes = new Uint8Array(28 + json.byteLength + bin.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.set(json, 20);
  view.setUint32(20 + json.byteLength, bin.byteLength, true);
  view.setUint32(24 + json.byteLength, 0x00_4e_49_42, true);
  bytes.set(bin, 28 + json.byteLength);
  return bytes;
};

const mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'deg' },
  root: 'frame',
  links: {
    frame: { components: ['component:Frame'] },
    sun: { components: ['component:Sun'] },
    carrier: { components: ['component:Carrier'] },
  },
  joints: {
    sun: { type: 'revolute', parent: 'frame', child: 'sun', origin: [0, 0, 0], axis: [0, 0, 1] },
    carrier: { type: 'revolute', parent: 'frame', child: 'carrier', origin: [0, 0, 0], axis: [0, 0, 1] },
  },
  couplings: [{ driver: 'sun', follower: 'carrier', ratio: 0.25 }],
  animations: [
    {
      id: 'four-sun-turns',
      duration: 8,
      loop: 'repeat',
      keyframes: [
        { time: 0, coordinates: { sun: 0 } },
        { time: 8, coordinates: { sun: 1440 } },
      ],
    },
  ],
};

const model: TauViewerModel = {
  id: 'model-1',
  title: 'main',
  path: '.tau/artifacts/main.glb',
  sourceFile: 'main.ts',
  mimeType: 'model/gltf-binary',
  byteLength: 0,
  sha256: '0'.repeat(64),
};

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'tau-pose-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const pagesOf = (view?: TauViewerViewState) => {
  const posed = vi.fn<McpViewerPosePages['posed']>();
  const pages: McpViewerPosePages = { posed, viewers: () => (view === undefined ? 0 : 1), viewOf: () => view };
  return { pages, posed };
};

const withMechanism = { schemaVersion: 1, components: [], mechanism };
const target = async (payload: unknown = withMechanism) => {
  const absolutePath = join(folder, 'main.glb');
  await writeFile(absolutePath, glbOf(payload));
  return { model, absolutePath };
};

describe('createMcpViewerPoser', () => {
  it('should seek an animation, report every coordinate and hand the pages the resolved command', async () => {
    const { pages, posed } = pagesOf();
    const poser = createMcpViewerPoser(pages, () => 0);

    await expect(
      poser.pose(await target(), { animation: { id: 'four-sun-turns', action: 'seek', time: 2 } }, 'thread-a'),
    ).resolves.toStrictEqual({
      model: { path: '.tau/artifacts/main.glb', sourceFile: 'main.ts' },
      mechanism: { joints: 2, animations: ['four-sun-turns'] },
      playback: { status: 'paused', animationId: 'four-sun-turns', time: 2, speed: 1 },
      coordinates: { sun: 360, carrier: 90 },
      atLimit: [],
      viewers: 0,
    });
    expect(posed).toHaveBeenCalledWith(
      { modelId: 'model-1', animation: { id: 'four-sun-turns', action: 'seek', time: 2, speed: 1 } },
      'thread-a',
    );
  });

  it('should advance a playing clip on the server clock, at its speed, until it is paused', async () => {
    let clock = 0;
    const { pages } = pagesOf();
    const poser = createMcpViewerPoser(pages, () => clock);
    const shown = await target();

    await poser.pose(shown, { animation: { id: 'four-sun-turns', action: 'play', speed: 2 } }, undefined);
    clock = 500;
    const read = await poser.pose(shown, {}, undefined);
    clock = 1000;
    const paused = await poser.pose(shown, { animation: { id: 'four-sun-turns', action: 'pause' } }, undefined);

    expect(read).toMatchObject({ playback: { status: 'playing', time: 1 }, coordinates: { sun: 180, carrier: 45 } });
    expect(paused).toMatchObject({ playback: { status: 'paused', time: 2 }, coordinates: { sun: 360 } });
  });

  it('should set driver coordinates, pausing a playing clip, and read a page the person drives', async () => {
    const { pages, posed } = pagesOf();
    const poser = createMcpViewerPoser(pages, () => 0);
    const shown = await target();

    await expect(poser.pose(shown, { coordinates: { sun: 40 } }, undefined)).resolves.toMatchObject({
      playback: { status: 'stopped' },
      coordinates: { sun: 40, carrier: 10 },
    });
    expect(posed).toHaveBeenCalledWith({ modelId: 'model-1', coordinates: { sun: 40 } }, undefined);

    const view = {
      playback: { status: 'playing', animationId: 'four-sun-turns', time: 4, speed: 1 },
      coordinates: { sun: 720, carrier: 180 },
    } as unknown as TauViewerViewState;
    const driven = createMcpViewerPoser(pagesOf(view).pages, () => 0);
    await expect(driven.pose(shown, {}, undefined)).resolves.toMatchObject({
      playback: view.playback,
      coordinates: view.coordinates,
      viewers: 1,
    });
  });

  it('should refuse an unknown animation, a follower coordinate and a model without a mechanism', async () => {
    const { pages, posed } = pagesOf();
    const poser = createMcpViewerPoser(pages, () => 0);
    const shown = await target();

    await expect(poser.pose(shown, { animation: { id: 'spin', action: 'play' } }, undefined)).resolves.toStrictEqual({
      errorCode: 'UNKNOWN_ANIMATION',
      message: "This model's mechanism has no animation spin; it offers four-sun-turns.",
    });
    await expect(poser.pose(shown, { coordinates: { carrier: 1 } }, undefined)).resolves.toMatchObject({
      errorCode: 'UNKNOWN_COORDINATE',
    });
    await expect(poser.pose(await target({ schemaVersion: 1, components: [] }), {}, undefined)).resolves.toMatchObject({
      errorCode: 'NO_MECHANISM',
    });
    expect(posed).not.toHaveBeenCalled();
  });
});
