import { describe, expect, it, vi } from 'vitest';

import type { MachineConnectionRuntime, MachineNetworkStream, MachineTransportTrust } from '@taucad/runtime/machine';

import { captureBambuStill, loadBambuHostLibraries } from '#bambu.host.js';

const capturedAt = '2026-09-14T00:00:00.000Z';
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
type PinnedTrust = Extract<MachineTransportTrust, { type: 'pinned' }>;
const pinnedTrust = {
  type: 'pinned',
  digest: `sha256:${'1'.repeat(64)}` as PinnedTrust['digest'],
} satisfies PinnedTrust;
const cameraFrame = (payload: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const frame = new Uint8Array(16 + payload.byteLength);
  new DataView(frame.buffer).setUint32(0, payload.byteLength, true);
  frame.set(payload, 16);
  return frame;
};

const fixture = (chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>) => {
  const write = vi.fn<MachineNetworkStream['write']>(async () => undefined);
  const close = vi.fn(async () => undefined);
  const stream: MachineNetworkStream = {
    readable: (async function* () {
      yield* chunks;
    })(),
    write,
    close,
  };
  const connectStream = vi.fn(async () => stream);
  const runtime: MachineConnectionRuntime = {
    clock: { now: () => capturedAt },
    log: vi.fn(async () => undefined),
    connectStream,
    async *readArtifact() {
      yield* [];
    },
    resolveSecret: vi.fn(async () => 'unused'),
  };
  return { close, connectStream, runtime, write };
};

describe('Bambu host payload', () => {
  it('should load the reviewed MQTT and FTPS libraries only from the lazy host module', async () => {
    const libraries = await loadBambuHostLibraries();
    expect(libraries.mqttClient).toBeTypeOf('function');
    expect(libraries.ftpClient).toBeTypeOf('function');
  });

  it('should capture one bounded frame over a short-lived pinned camera stream', async () => {
    const { close, connectStream, runtime, write } = fixture([
      cameraFrame(jpeg).slice(0, 11),
      cameraFrame(jpeg).slice(11),
    ]);
    const still = await captureBambuStill({
      address: 'printer.local',
      accessCode: '12345678',
      trust: pinnedTrust,
      runtime,
      signal: new AbortController().signal,
    });

    expect(still).toEqual({
      bytes: jpeg,
      mediaType: 'image/jpeg',
      capturedAt,
      expiresAt: '2026-09-14T00:00:15.000Z',
    });
    expect(connectStream).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: { address: 'printer.local', port: 6000 },
        transport: 'tls',
        maximumReadBytes: 4 * 1024 * 1024 + 16,
        maximumWriteBytes: 80,
      }),
    );
    const authentication = write.mock.calls[0]?.[0];
    expect(authentication).toHaveLength(80);
    if (!authentication) {
      throw new Error('expected camera authentication packet');
    }
    expect(new DataView(authentication.buffer).getUint32(0, true)).toBe(0x40);
    expect(new DataView(authentication.buffer).getUint32(4, true)).toBe(0x30_00);
    expect(new TextDecoder().decode(authentication.slice(16, 20))).toBe('bblp');
    expect(new TextDecoder().decode(authentication.slice(48, 56))).toBe('12345678');
    expect(close).toHaveBeenCalledOnce();
  });

  it('should close the camera stream when a frame exceeds the encoded ceiling', async () => {
    const header = new Uint8Array(16);
    new DataView(header.buffer).setUint32(0, 4 * 1024 * 1024 + 1, true);
    const { close, runtime } = fixture([header]);
    await expect(
      captureBambuStill({
        address: 'printer.local',
        accessCode: '12345678',
        trust: pinnedTrust,
        runtime,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('BAMBU_CAMERA_FRAME_INVALID');
    expect(close).toHaveBeenCalledOnce();
  });

  it('should refuse an unpinned camera connection before opening a stream', async () => {
    const { connectStream, runtime } = fixture([]);
    await expect(
      captureBambuStill({
        address: 'printer.local',
        accessCode: '12345678',
        trust: { type: 'system' },
        runtime,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('BAMBU_CAMERA_AUTH_INVALID');
    expect(connectStream).not.toHaveBeenCalled();
  });
});
