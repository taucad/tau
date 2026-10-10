import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { connect, createServer as createTcpServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:tls';
import type { Server } from 'node:tls';

import type { MachineNetworkStillInput, MachineStill, MachineTransportTrust } from '@taucad/runtime/machine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMachineSecretStore, createNodeMachineRuntime } from '#machine-host.js';
import {
  captureRtspsStill,
  createRtspAuthenticator,
  createRtspSession,
  digestResponse,
  ffmpegCandidates,
  findFfmpeg,
  listenRtspProxy,
  parseChallenges,
} from '#rtsps-still.js';
import type { RtspSession } from '#rtsps-still.js';
import { createMemorySecretVault } from '#secret-vault.js';

type PinnedDigest = Extract<MachineTransportTrust, { type: 'pinned' }>['digest'];

const accessCode = 'Zq8Wx3Kp';
const secretRef = 'vault:machine/bambu/camera-test';
const jpeg = [0xff, 0xd8, 1, 2, 3, 0xff, 0xd9];

/* Plays like ffmpeg: records its arguments, asks the proxy for OPTIONS and prints one JPEG once the answer is a 200. */
const fakeFfmpeg = `
import { appendFileSync } from 'node:fs';
import { connect } from 'node:net';
const argv = process.argv.slice(2);
appendFileSync(new URL('./runs.jsonl', import.meta.url), JSON.stringify(argv) + '\\n');
const url = new URL(argv[argv.indexOf('-i') + 1]);
let answered = false;
const socket = connect(Number(url.port), url.hostname);
socket.on('error', () => process.exit(1));
socket.on('close', () => { if (!answered) process.exit(1); });
socket.once('data', (reply) => {
  answered = true;
  if (!reply.toString('latin1').startsWith('RTSP/1.0 200')) process.exit(1);
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
let tlsConnections = 0;

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
    tlsConnections += 1;
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

/** The arguments of every fake ffmpeg run so far, in order. */
const ffmpegRuns = async (): Promise<string[][]> => {
  const record = await readFile(join(directory, 'runs.jsonl'), 'utf8').catch(() => '');
  return record
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as string[]);
};

const cameraDirectories = async (): Promise<string[]> => {
  const names = await readdir(tmpdir());
  return names.filter((name) => name.startsWith('tau-camera-'));
};

/* Like the host's own pinned socket, a failed connect rejects with a fixed code. */
const connectTcp = async (port: number): Promise<Socket> => {
  const socket = connect(port, '127.0.0.1');
  try {
    await once(socket, 'connect');
  } catch {
    throw new Error('MACHINE_CONNECT_FAILED');
  }
  return socket;
};

/** A plain TCP camera; resolves with its port and a close. */
const listenTcpCamera = async (
  onConnection: (socket: Socket) => void,
): Promise<Readonly<{ port: number; close(): void }>> => {
  const server = createTcpServer(onConnection);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: (server.address() as AddressInfo).port, close: () => server.close() };
};

const stillInput = (overrides: Partial<MachineNetworkStillInput> = {}): MachineNetworkStillInput => ({
  endpoint: { address: '127.0.0.1', port: cameraPort },
  trust: pin,
  secretRef,
  username: 'bblp',
  path: '/streaming/live/1',
  connectTimeout: 5000,
  maximumBytes: 1024,
  signal: AbortSignal.timeout(10_000),
  ...overrides,
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
  const { captureNetworkStill } = runtime.connection();
  if (!captureNetworkStill) {
    return expect.fail('the node runtime should capture network stills');
  }
  return captureNetworkStill(stillInput({ trust }));
};

const md5 = (text: string): string => createHash('md5').update(text).digest('hex');
const bytes = (text: string): Uint8Array<ArrayBuffer> => Buffer.from(text, 'latin1');
const latin1 = (data: Uint8Array<ArrayBuffer>): string => Buffer.from(data).toString('latin1');
const cameraUri = 'rtsps://192.0.2.10:322/streaming/live/1';
const session = (): RtspSession =>
  createRtspSession({
    loopback: 'rtsp://127.0.0.1:5000',
    camera: 'rtsps://192.0.2.10:322',
    authenticator: createRtspAuthenticator({ username: 'bblp', password: accessCode }),
  });
/** The `name=value` fields of a request's `Authorization` header. */
const authorizationFields = (request: Uint8Array<ArrayBuffer>): Record<string, string> =>
  Object.fromEntries(
    [...(/^Authorization: (.*)$/mu.exec(latin1(request))?.[1] ?? '').matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]+))/gu)].map(
      ([, name = '', text, token]) => [name, text ?? token ?? ''],
    ),
  );

describe('captureNetworkStill', () => {
  it('should return the first JPEG through a pinned camera without the access code reaching ffmpeg', async () => {
    received = '';
    const runsBefore = await ffmpegRuns();
    const before = await cameraDirectories();
    const still = await capture(pin);

    expect([...still.bytes]).toEqual(jpeg);
    expect(still.mediaType).toBe('image/jpeg');
    expect(Date.parse(still.expiresAt) - Date.parse(still.capturedAt)).toBe(15_000);
    /* The camera saw its own URI, not the loopback one ffmpeg asked for. */
    expect(received).toBe(`OPTIONS rtsps://127.0.0.1:${cameraPort}/streaming/live/1 RTSP/1.0\r\nCSeq: 1\r\n\r\n`);
    const runsAfter = await ffmpegRuns();
    const [argv = []] = runsAfter.slice(runsBefore.length);
    expect(argv[argv.indexOf('-i') + 1]).toMatch(/^rtsp:\/\/127\.0\.0\.1:\d+\/streaming\/live\/1$/u);
    expect(argv.slice(argv.indexOf('-rtsp_transport'), argv.indexOf('-timeout') + 1)).toEqual([
      '-rtsp_transport',
      'tcp',
      '-rtsp_flags',
      'prefer_tcp',
      '-timeout',
    ]);
    expect(JSON.stringify(argv)).not.toContain(accessCode);
    expect(await cameraDirectories()).toEqual(before);
  });

  it('should reject a camera whose certificate misses the pin once, without naming the access code', async () => {
    tlsConnections = 0;
    const error = await capture({ type: 'pinned', digest: `sha256:${'0'.repeat(64)}` as PinnedDigest }).then(
      () => expect.fail('a mismatched pin should reject'),
      (error: unknown) => error,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('MACHINE_TLS_PIN_MISMATCH');
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(accessCode);
    /* A pin mismatch is never retried. */
    expect(tlsConnections).toBeLessThanOrEqual(1);
  });

  it('should reject with a fixed code when ffmpeg is missing', async () => {
    await expect(capture(pin, async () => undefined)).rejects.toMatchObject({
      code: 'MACHINE_STILL_FFMPEG_MISSING',
      message: 'MACHINE_STILL_FFMPEG_MISSING',
    });
  });

  it('should reject with a fixed code when ffmpeg cannot start', async () => {
    await expect(capture(pin, async () => join(directory, 'missing-ffmpeg'))).rejects.toThrow(
      'MACHINE_STILL_FFMPEG_FAILED',
    );
  });
});

describe('captureRtspsStill', () => {
  const options = (port: number): Parameters<typeof captureRtspsStill>[1] => ({
    ffmpeg,
    password: async () => accessCode,
    openUpstream: async () => connectTcp(port),
  });

  it('should retry a capture whose first connection the camera resets', { timeout: 15_000 }, async () => {
    let connections = 0;
    const tcpCamera = await listenTcpCamera((socket) => {
      connections += 1;
      if (connections === 1) {
        socket.resetAndDestroy();
        return;
      }
      socket.once('data', () => {
        socket.write('RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n');
      });
    });
    const runsBefore = await ffmpegRuns();
    try {
      const still = await captureRtspsStill(stillInput(), options(tcpCamera.port));

      expect([...still.bytes]).toEqual(jpeg);
      expect(connections).toBe(2);
      const runsAfter = await ffmpegRuns();
      expect(runsAfter.length - runsBefore.length).toBe(2);
    } finally {
      tcpCamera.close();
    }
  });

  it('should give up with the last transient failure instead of timing out', { timeout: 15_000 }, async () => {
    let connections = 0;
    const tcpCamera = await listenTcpCamera((socket) => {
      connections += 1;
      socket.resetAndDestroy();
    });
    try {
      /* Whichever side notices the reset first names it. */
      await expect(captureRtspsStill(stillInput({ connectTimeout: 2500 }), options(tcpCamera.port))).rejects.toThrow(
        /^MACHINE_(?:CONNECT|STILL_STREAM|STILL_CAPTURE)_FAILED$/u,
      );

      expect(connections).toBeGreaterThanOrEqual(2);
    } finally {
      tcpCamera.close();
    }
  });

  it('should not retry once the camera refuses the credentials', async () => {
    let connections = 0;
    const requests: string[] = [];
    const tcpCamera = await listenTcpCamera((socket) => {
      connections += 1;
      socket.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        requests.push(latin1(chunk));
        socket.write(
          'RTSP/1.0 401 Unauthorized\r\nCSeq: 1\r\nWWW-Authenticate: Digest realm="camera", nonce="n1"\r\n\r\n',
        );
      });
    });
    try {
      await expect(
        captureRtspsStill(stillInput({ endpoint: { address: '192.0.2.10', port: 322 } }), options(tcpCamera.port)),
      ).rejects.toThrow('MACHINE_STILL_AUTH_REJECTED');

      expect(connections).toBe(1);
      expect(requests).toHaveLength(2);
      expect(requests[1]).toContain(
        `Authorization: Digest username="bblp", realm="camera", nonce="n1", uri="${cameraUri}", response="`,
      );
    } finally {
      tcpCamera.close();
    }
  });

  it('should reject with the abort reason and stop when the signal aborts mid-capture', async () => {
    let connections = 0;
    const tcpCamera = await listenTcpCamera(() => {
      connections += 1;
    });
    const controller = new AbortController();
    try {
      const capturing = captureRtspsStill(stillInput({ signal: controller.signal }), options(tcpCamera.port));
      setTimeout(() => {
        controller.abort(new Error('CAPTURE_ABORTED_BY_TEST'));
      }, 300);

      await expect(capturing).rejects.toThrow('CAPTURE_ABORTED_BY_TEST');
      expect(connections).toBeLessThanOrEqual(1);
    } finally {
      tcpCamera.close();
    }
  });

  it('should reject with a timeout when the camera never answers within the deadline', async () => {
    const tcpCamera = await listenTcpCamera(() => undefined);
    try {
      await expect(captureRtspsStill(stillInput({ connectTimeout: 1000 }), options(tcpCamera.port))).rejects.toThrow(
        'MACHINE_STILL_TIMEOUT',
      );
    } finally {
      tcpCamera.close();
    }
  });
});

describe('listenRtspProxy', () => {
  /** Whether a loopback connection to `port` is accepted, or the code refusing it. */
  const connectionOutcome = async (port: number): Promise<string> => {
    const socket = connect(port, '127.0.0.1');
    try {
      await once(socket, 'connect');
      return 'accepted';
    } catch (error) {
      return error instanceof Error && 'code' in error ? String(error.code) : 'failed';
    } finally {
      socket.destroy();
    }
  };

  it('should refuse any connection after the first, while it is live and after it closes', async () => {
    const cameraConnections: Socket[] = [];
    const cameraReached = Promise.withResolvers<void>();
    const tcpCamera = await listenTcpCamera((socket) => {
      cameraConnections.push(socket);
      cameraReached.resolve();
    });
    const proxy = await listenRtspProxy({
      openUpstream: async () => connectTcp(tcpCamera.port),
      remote: { address: '192.0.2.10', port: 322 },
      authenticator: createRtspAuthenticator({ username: 'bblp', password: accessCode }),
      onFailure: () => undefined,
    });
    try {
      const first = connect(proxy.port, '127.0.0.1');
      await once(first, 'connect');
      /* The proxy has taken the first connection once it reaches the camera for it. */
      await cameraReached.promise;

      expect(await connectionOutcome(proxy.port)).toBe('ECONNREFUSED');
      first.destroy();
      await once(first, 'close');
      expect(await connectionOutcome(proxy.port)).toBe('ECONNREFUSED');
      expect(cameraConnections).toHaveLength(1);
      await expect(proxy.close()).resolves.toBeUndefined();
    } finally {
      await proxy.close();
      tcpCamera.close();
    }
  });
});

describe('digestResponse', () => {
  it('should match the RFC 2617 §3.5 example with qop=auth', () => {
    expect(
      digestResponse({
        username: 'Mufasa',
        password: 'Circle Of Life',
        realm: 'testrealm@host.com',
        nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
        method: 'GET',
        uri: '/dir/index.html',
        qop: { nc: '00000001', cnonce: '0a4f113b' },
      }),
    ).toBe('6629fae49393a05397450978507c4ef1');
  });

  it('should match the RFC 7616 §3.9.1 MD5 example with qop=auth', () => {
    expect(
      digestResponse({
        username: 'Mufasa',
        password: 'Circle of Life',
        realm: 'http-auth@example.org',
        nonce: '7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v',
        method: 'GET',
        uri: '/dir/index.html',
        qop: { nc: '00000001', cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ' },
      }),
    ).toBe('8ca523f5e9506fed4657c9700eebdbec');
  });

  it('should use the RFC 2069 form when the challenge offers no qop', () => {
    expect(
      digestResponse({
        username: 'Mufasa',
        password: 'Circle Of Life',
        realm: 'testrealm@host.com',
        nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
        method: 'GET',
        uri: '/dir/index.html',
      }),
    ).toBe('670fd8c2df070c60b045671b8b24ff02');
  });
});

describe('parseChallenges', () => {
  const parsed = (header: string): Array<Readonly<{ scheme: string; params: Record<string, string> }>> =>
    parseChallenges(header).map(({ scheme, params }) => ({ scheme, params: Object.fromEntries(params) }));

  it('should keep quoted commas and escapes inside one Digest challenge', () => {
    expect(
      parsed(
        String.raw`Digest realm="Tau, \"fake\" camera", nonce="a,b", qop="auth,auth-int", algorithm=MD5, stale=TRUE`,
      ),
    ).toEqual([
      {
        scheme: 'digest',
        params: { realm: 'Tau, "fake" camera', nonce: 'a,b', qop: 'auth,auth-int', algorithm: 'MD5', stale: 'TRUE' },
      },
    ]);
  });

  it('should read a Basic challenge', () => {
    expect(parsed('Basic realm="camera"')).toEqual([{ scheme: 'basic', params: { realm: 'camera' } }]);
  });

  it('should split several challenges in one value', () => {
    expect(parsed('Basic realm="a", Digest realm="b", nonce="c", Newauth')).toEqual([
      { scheme: 'basic', params: { realm: 'a' } },
      { scheme: 'digest', params: { realm: 'b', nonce: 'c' } },
      { scheme: 'newauth', params: {} },
    ]);
  });
});

describe('createRtspSession', () => {
  it('should resend a challenged request under the camera URI with its own Digest and keep the 401 from ffmpeg', () => {
    const rtsp = session();

    expect(
      latin1(
        rtsp.fromClient(
          bytes(
            'DESCRIBE rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 2\r\nAccept: application/sdp\r\n\r\n',
          ),
        ),
      ),
    ).toBe(`DESCRIBE ${cameraUri} RTSP/1.0\r\nCSeq: 2\r\nAccept: application/sdp\r\n\r\n`);
    const challenged = rtsp.fromCamera(
      bytes(
        'RTSP/1.0 401 Unauthorized\r\nCSeq: 2\r\nWWW-Authenticate: Digest realm="X1C", nonce="abc"\r\nContent-Length: 0\r\n\r\n',
      ),
    );
    const response = md5(`${md5(`bblp:X1C:${accessCode}`)}:abc:${md5(`DESCRIBE:${cameraUri}`)}`);
    expect(challenged.toClient.byteLength).toBe(0);
    expect(latin1(challenged.toCamera)).toBe(
      `DESCRIBE ${cameraUri} RTSP/1.0\r\nCSeq: 2\r\nAccept: application/sdp\r\nAuthorization: Digest username="bblp", realm="X1C", nonce="abc", uri="${cameraUri}", response="${response}"\r\n\r\n`,
    );
    const described = bytes('RTSP/1.0 200 OK\r\nCSeq: 2\r\nContent-Length: 5\r\n\r\nv=0\r\n');
    expect(rtsp.fromCamera(described)).toEqual({ toClient: described, toCamera: Buffer.alloc(0) });
    /* Once the challenge is known, every request carries the credentials from the start. */
    expect(
      authorizationFields(
        rtsp.fromClient(bytes('SETUP rtsp://127.0.0.1:5000/streaming/live/1/trackID=0 RTSP/1.0\r\nCSeq: 3\r\n\r\n')),
      ),
    ).toMatchObject({ username: 'bblp', realm: 'X1C', nonce: 'abc', uri: `${cameraUri}/trackID=0` });
  });

  it('should answer qop=auth with a rising nonce count, a fresh client nonce and the opaque value', () => {
    const rtsp = session();
    rtsp.fromClient(bytes('OPTIONS rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 1\r\n\r\n'));
    const first = authorizationFields(
      rtsp.fromCamera(
        bytes(
          'RTSP/1.0 401 Unauthorized\r\nCSeq: 1\r\nWWW-Authenticate: Digest realm="X1C", nonce="abc", qop="auth,auth-int", opaque="o1"\r\n\r\n',
        ),
      ).toCamera,
    );
    const second = authorizationFields(
      rtsp.fromClient(bytes('DESCRIBE rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 2\r\n\r\n')),
    );

    expect(first).toMatchObject({ qop: 'auth', nc: '00000001', opaque: 'o1' });
    expect(second).toMatchObject({ qop: 'auth', nc: '00000002', opaque: 'o1' });
    expect(first['cnonce']).not.toBe(second['cnonce']);
    for (const [fields, method] of [
      [first, 'OPTIONS'],
      [second, 'DESCRIBE'],
    ] as const) {
      expect(fields['response']).toBe(
        digestResponse({
          username: 'bblp',
          password: accessCode,
          realm: 'X1C',
          nonce: 'abc',
          method,
          uri: cameraUri,
          qop: { nc: fields['nc'] ?? '', cnonce: fields['cnonce'] ?? '' },
        }),
      );
    }
  });

  it('should fail with MACHINE_STILL_AUTH_REJECTED when the camera refuses the credentials', () => {
    const rtsp = session();
    rtsp.fromClient(bytes('DESCRIBE rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 2\r\n\r\n'));
    const challenge = bytes(
      'RTSP/1.0 401 Unauthorized\r\nCSeq: 2\r\nWWW-Authenticate: Digest realm="X1C", nonce="abc"\r\n\r\n',
    );

    expect(latin1(rtsp.fromCamera(challenge).toCamera)).toContain('Authorization: Digest ');
    expect(() => rtsp.fromCamera(challenge)).toThrow('MACHINE_STILL_AUTH_REJECTED');
  });

  it('should recompute once when a second challenge only renews a stale nonce', () => {
    const rtsp = session();
    rtsp.fromClient(bytes('DESCRIBE rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 2\r\n\r\n'));
    const challenge = (nonce: string, isStale: boolean): Uint8Array<ArrayBuffer> =>
      bytes(
        `RTSP/1.0 401 Unauthorized\r\nCSeq: 2\r\nWWW-Authenticate: Digest realm="X1C", nonce="${nonce}"${isStale ? ', stale=true' : ''}\r\n\r\n`,
      );

    expect(authorizationFields(rtsp.fromCamera(challenge('n1', false)).toCamera)).toMatchObject({ nonce: 'n1' });
    expect(authorizationFields(rtsp.fromCamera(challenge('n2', true)).toCamera)).toMatchObject({ nonce: 'n2' });
    expect(() => rtsp.fromCamera(challenge('n3', true))).toThrow('MACHINE_STILL_AUTH_REJECTED');
  });

  it('should answer a Basic-only challenge with Basic and prefer Digest when both are offered', () => {
    const basic = session();
    basic.fromClient(bytes('DESCRIBE rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 2\r\n\r\n'));
    const both = session();
    both.fromClient(bytes('DESCRIBE rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 2\r\n\r\n'));

    expect(
      latin1(
        basic.fromCamera(
          bytes('RTSP/1.0 401 Unauthorized\r\nCSeq: 2\r\nWWW-Authenticate: Basic realm="camera"\r\n\r\n'),
        ).toCamera,
      ),
    ).toContain(`Authorization: Basic ${Buffer.from(`bblp:${accessCode}`).toString('base64')}\r\n`);
    expect(
      latin1(
        both.fromCamera(
          bytes(
            'RTSP/1.0 401 Unauthorized\r\nCSeq: 2\r\nWWW-Authenticate: Basic realm="camera"\r\nWWW-Authenticate: Digest realm="camera", nonce="n1"\r\n\r\n',
          ),
        ).toCamera,
      ),
    ).toContain('Authorization: Digest username="bblp", realm="camera", nonce="n1"');
  });

  it("should drop ffmpeg's own Authorization header", () => {
    expect(
      latin1(
        session().fromClient(
          bytes(
            'OPTIONS rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 1\r\nAuthorization: Basic Zm9vOmJhcg==\r\n\r\n',
          ),
        ),
      ),
    ).toBe(`OPTIONS ${cameraUri} RTSP/1.0\r\nCSeq: 1\r\n\r\n`);
  });

  it('should forward a request split across TCP chunks once it is whole', () => {
    const rtsp = session();
    const parts = ['DESC', 'RIBE rtsp://127.0.0.1:5000/stream', 'ing/live/1 RTSP/1.0\r\nCSeq: 3\r\n\r', '\n'];

    expect(parts.map((part) => latin1(rtsp.fromClient(bytes(part))))).toEqual([
      '',
      '',
      '',
      `DESCRIBE ${cameraUri} RTSP/1.0\r\nCSeq: 3\r\n\r\n`,
    ]);
  });

  it('should carry request and response bodies and interleaved frames through byte for byte', () => {
    const rtsp = session();
    /* A `$` frame whose payload looks like a blank line, and a body that looks like a second request. */
    const frame = Buffer.from([0x24, 1, 0, 4, 0x0d, 0x0a, 0x0d, 0x0a]);
    const body = 'position\r\n\r\nGET_PARAMETER rtsp://127.0.0.1:5000/other RTSP/1.0\r\n\r\n';
    const request = `SET_PARAMETER rtsp://127.0.0.1:5000/streaming/live/1 RTSP/1.0\r\nCSeq: 4\r\nContent-Type: text/parameters\r\nContent-Length: ${body.length}\r\n\r\n${body}`;
    const reply = bytes('RTSP/1.0 200 OK\r\nCSeq: 4\r\nContent-Length: 3\r\n\r\nabc');

    expect(rtsp.fromClient(Buffer.concat([frame, bytes(request), frame]))).toEqual(
      Buffer.concat([
        frame,
        bytes(request.replace('rtsp://127.0.0.1:5000/streaming', 'rtsps://192.0.2.10:322/streaming')),
        frame,
      ]),
    );
    expect(rtsp.fromCamera(Buffer.concat([frame, reply, frame]))).toEqual({
      toClient: Buffer.concat([frame, reply, frame]),
      toCamera: Buffer.alloc(0),
    });
  });
});

describe('findFfmpeg', () => {
  it('should look for ffmpeg.exe on PATH, then in the WinGet, Chocolatey and Scoop directories on Windows', () => {
    const environment = Object.fromEntries([
      ['PATH', String.raw`C:\Tools\bin;relative\bin;;D:\ffmpeg`],
      ['LOCALAPPDATA', String.raw`C:\Users\ada\AppData\Local`],
      ['ProgramData', String.raw`C:\ProgramData`],
      ['USERPROFILE', String.raw`C:\Users\ada`],
    ]);

    expect(ffmpegCandidates('win32', environment)).toEqual([
      String.raw`C:\Tools\bin\ffmpeg.exe`,
      String.raw`D:\ffmpeg\ffmpeg.exe`,
      String.raw`C:\Users\ada\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe`,
      String.raw`C:\ProgramData\chocolatey\bin\ffmpeg.exe`,
      String.raw`C:\Users\ada\scoop\shims\ffmpeg.exe`,
    ]);
  });

  it('should look on PATH, then in Homebrew and MacPorts on macOS and Linux', () => {
    expect(ffmpegCandidates('darwin', Object.fromEntries([['PATH', '/usr/bin:relative:/opt/homebrew/bin']]))).toEqual([
      '/usr/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/opt/local/bin/ffmpeg',
    ]);
  });

  it('should return the first executable ffmpeg on the search path', async () => {
    await expect(findFfmpeg(process.platform, Object.fromEntries([['PATH', `relative:${directory}`]]))).resolves.toBe(
      ffmpeg,
    );
  });
});
