import { once } from 'node:events';
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MachineTransportTrust } from '@taucad/runtime/machine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rtspCameraH264 } from '#fixtures/rtsp-camera-h264.js';
import { captureRtspsStill, findFfmpeg } from '#rtsps-still.js';
import { listenRtspCamera } from '#testing/rtsp-camera.js';

const ffmpeg = await findFfmpeg();
const accessCode = 'Zq8Wx3Kp';
/* The camera's own URI: the proxy rewrites ffmpeg's loopback URI to it. */
const cameraUri = 'rtsps://192.0.2.10:322/streaming/live/1';
const trust: MachineTransportTrust = {
  type: 'pinned',
  digest: `sha256:${'a'.repeat(64)}` as Extract<MachineTransportTrust, { type: 'pinned' }>['digest'],
};

const connectTcp = async (port: number): Promise<Socket> => {
  const socket = connect(port, '127.0.0.1');
  await once(socket, 'connect');
  return socket;
};

const cameraDirectories = async (): Promise<string[]> => {
  const names = await readdir(tmpdir());
  return names.filter((name) => name.startsWith('tau-camera-'));
};

/** The picture size a baseline JPEG's start-of-frame segment declares. */
const jpegSize = (bytes: Uint8Array<ArrayBuffer>): Readonly<{ width: number; height: number }> => {
  const view = Buffer.from(bytes);
  const frame = view.indexOf(Buffer.from([0xff, 0xc0]));
  return { width: view.readUInt16BE(frame + 7), height: view.readUInt16BE(frame + 5) };
};

describe.skipIf(ffmpeg === undefined)('captureRtspsStill through a fake RTSP camera and the real ffmpeg', () => {
  let directory: string;
  let wrapper: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-rtsps-camera-'));
    wrapper = join(directory, 'ffmpeg');
    /* Record the exact arguments the host passes, then play through the real ffmpeg. */
    await writeFile(
      wrapper,
      `#!/bin/sh\nprintf '%s\\n' "$@" > '${join(directory, 'argv.txt')}'\nexec '${ffmpeg ?? ''}' "$@"\n`,
    );
    await chmod(wrapper, 0o755);
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each([{ qop: false }, { qop: true }])(
    'should return a JPEG while the proxy alone answers the Digest challenge (qop: $qop)',
    async ({ qop }) => {
      const camera = await listenRtspCamera({ username: 'bblp', password: accessCode, qop, h264: rtspCameraH264 });
      const before = await cameraDirectories();
      try {
        const still = await captureRtspsStill(
          {
            endpoint: { address: '192.0.2.10', port: 322 },
            trust,
            secretRef: 'vault:machine/fixture/camera',
            username: 'bblp',
            path: '/streaming/live/1',
            connectTimeout: 20_000,
            maximumBytes: 1024 * 1024,
            signal: AbortSignal.timeout(30_000),
          },
          { ffmpeg: wrapper, password: async () => accessCode, openUpstream: async () => connectTcp(camera.port) },
        );

        expect(still.mediaType).toBe('image/jpeg');
        expect([...still.bytes.subarray(0, 2), ...still.bytes.subarray(-2)]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
        /* The frame is the fixture's picture, decoded from RTP single NAL units and FU-A fragments. */
        expect(jpegSize(still.bytes)).toEqual({ width: 64, height: 48 });
        /* The first DESCRIBE went without credentials; the proxy answered its challenge with a Digest over the camera URI. */
        expect(camera.requests.slice(0, 5)).toEqual([
          { method: 'OPTIONS', uri: cameraUri, authorization: 'missing' },
          { method: 'DESCRIBE', uri: cameraUri, authorization: 'missing' },
          { method: 'DESCRIBE', uri: cameraUri, authorization: 'verified' },
          { method: 'SETUP', uri: `${cameraUri}/trackID=0`, authorization: 'verified' },
          { method: 'PLAY', uri: cameraUri, authorization: 'verified' },
        ]);
        /* After the challenge, nothing reached the camera without the proxy's credentials. */
        expect(camera.requests.slice(2).filter(({ authorization }) => authorization !== 'verified')).toEqual([]);
        const recorded = await readFile(join(directory, 'argv.txt'), 'utf8');
        const argv = recorded.trimEnd().split('\n');
        expect(argv[argv.indexOf('-i') + 1]).toMatch(/^rtsp:\/\/127\.0\.0\.1:\d+\/streaming\/live\/1$/u);
        expect(argv.join(' ')).not.toContain(accessCode);
        expect(await cameraDirectories()).toEqual(before);
      } finally {
        await camera.close();
      }
    },
    30_000,
  );
});
