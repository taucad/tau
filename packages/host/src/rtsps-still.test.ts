import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:tls';
import type { Server } from 'node:tls';

import type { MachineNetworkStillInput, MachineStill, MachineTransportTrust } from '@taucad/runtime/machine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMachineSecretStore, createNodeMachineRuntime } from '#machine-host.js';
import { findFfmpeg } from '#rtsps-still.js';
import { createMemorySecretVault } from '#secret-vault.js';

type PinnedDigest = Extract<MachineTransportTrust, { type: 'pinned' }>['digest'];

const accessCode = 'Zq8Wx3Kp';
const secretRef = 'vault:machine/bambu/camera-test';
const jpeg = [0xff, 0xd8, 1, 2, 3, 0xff, 0xd9];

/* Speaks one RTSP request through the proxy, then prints one JPEG, like ffmpeg's first frame. */
const fakeFfmpeg = `
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
const argv = process.argv.slice(2);
const input = argv[argv.indexOf('-i') + 1];
const url = new URL(/file '([^']+)'/u.exec(readFileSync(input, 'utf8'))[1]);
writeFileSync(new URL('./record.json', import.meta.url), JSON.stringify({
  argv, mode: statSync(input).mode & 0o777, username: url.username, password: url.password,
}));
let answered = false;
const socket = connect(Number(url.port), url.hostname);
socket.on('error', () => process.exit(1));
socket.on('close', () => { if (!answered) process.exit(1); });
socket.once('data', () => {
  answered = true;
  process.stdout.write(Buffer.from(${JSON.stringify(jpeg)}), () => process.exit(0));
});
socket.write('OPTIONS rtsp://127.0.0.1:' + url.port + url.pathname + ' RTSP/1.0\\r\\nCSeq: 1\\r\\n\\r\\n');
`;

let directory: string;
let ffmpeg: string;
let camera: Server;
let cameraPort: number;
let pin: Extract<MachineTransportTrust, { type: 'pinned' }>;
let received = '';

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-rtsps-still-'));
  ffmpeg = join(directory, 'ffmpeg');
  await writeFile(ffmpeg, `#!${process.execPath}\n${fakeFfmpeg}`);
  await chmod(ffmpeg, 0o755);
  /* The only way Node gets a self-signed certificate without a dependency. */
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=camera',
      '-days',
      '1',
      '-keyout',
      'key.pem',
      '-out',
      'cert.pem',
    ],
    { cwd: directory, stdio: 'ignore' },
  );
  const cert = await readFile(join(directory, 'cert.pem'));
  pin = {
    type: 'pinned',
    digest: `sha256:${createHash('sha256').update(new X509Certificate(cert).raw).digest('hex')}` as PinnedDigest,
  };
  camera = createServer({ cert, key: await readFile(join(directory, 'key.pem')) }, (socket) => {
    socket.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      received += Buffer.from(chunk).toString('latin1');
      if (received.endsWith('\r\n\r\n')) {
        socket.write('RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n');
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => {
    camera.listen(0, '127.0.0.1', resolve);
  });
  cameraPort = (camera.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => {
    camera.close(resolve);
  });
  await rm(directory, { recursive: true, force: true });
});

const capture = async (
  trust: MachineTransportTrust,
  findFfmpegOverride: () => Promise<string | undefined> = async () => ffmpeg,
): Promise<MachineStill> => {
  const secrets = createMachineSecretStore({ vault: createMemorySecretVault() });
  secrets.stage(secretRef, accessCode);
  const runtime = createNodeMachineRuntime({
    secrets,
    findFfmpeg: findFfmpegOverride,
    readArtifact: async () => {
      throw new Error('MACHINE_ARTIFACT_NOT_FOUND');
    },
  });
  const input: MachineNetworkStillInput = {
    endpoint: { address: '127.0.0.1', port: cameraPort },
    trust,
    secretRef,
    username: 'bblp',
    path: '/streaming/live/1',
    connectTimeout: 5000,
    maximumBytes: 1024,
    signal: AbortSignal.timeout(10_000),
  };
  const { captureNetworkStill } = runtime.connection();
  if (!captureNetworkStill) {
    return expect.fail('the node runtime should capture network stills');
  }
  return captureNetworkStill(input);
};

describe('captureNetworkStill', () => {
  it('should return the first JPEG through a pinned camera without the access code in argv', async () => {
    received = '';
    const still = await capture(pin);

    expect([...still.bytes]).toEqual(jpeg);
    expect(still.mediaType).toBe('image/jpeg');
    expect(Date.parse(still.expiresAt) - Date.parse(still.capturedAt)).toBe(15_000);
    expect(received).toBe(`OPTIONS rtsps://127.0.0.1:${cameraPort}/streaming/live/1 RTSP/1.0\r\nCSeq: 1\r\n\r\n`);
    const record = JSON.parse(await readFile(join(directory, 'record.json'), 'utf8')) as {
      argv: string[];
      mode: number;
      username: string;
      password: string;
    };
    expect(record).toMatchObject({ mode: 0o600, username: 'bblp', password: accessCode });
    expect(record.argv.join(' ')).not.toContain(accessCode);
    expect(record.argv).toContain('error');
    await expect(access(record.argv[record.argv.indexOf('-i') + 1]!)).rejects.toThrow('ENOENT');
  });

  it('should reject a camera whose certificate misses the pin without naming the access code', async () => {
    const error = await capture({ type: 'pinned', digest: `sha256:${'0'.repeat(64)}` as PinnedDigest }).then(
      () => expect.fail('a mismatched pin should reject'),
      (error: unknown) => error,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('MACHINE_TLS_PIN_MISMATCH');
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(accessCode);
  });

  it('should reject with a fixed code when ffmpeg is missing', async () => {
    await expect(capture(pin, async () => undefined)).rejects.toThrow('MACHINE_STILL_FFMPEG_MISSING');
  });

  it('should reject with a fixed code when ffmpeg cannot start', async () => {
    await expect(capture(pin, async () => join(directory, 'missing-ffmpeg'))).rejects.toThrow(
      'MACHINE_STILL_FFMPEG_FAILED',
    );
  });
});

describe('findFfmpeg', () => {
  it('should return the first executable ffmpeg on the search path', async () => {
    await expect(findFfmpeg(`relative:${directory}`)).resolves.toBe(ffmpeg);
  });
});
