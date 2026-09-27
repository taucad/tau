/**
 * One JPEG still from a pinned RTSPS camera (the Bambu X1C's port 322), decoded
 * by the system `ffmpeg`.
 *
 * ffmpeg never sees the camera: it talks plain RTSP to a loopback proxy whose
 * upstream is the caller's pinned TLS socket, so the pin is checked in-process.
 * The access code reaches ffmpeg only inside a mode-0600 ffconcat file in a
 * private temporary directory removed after every attempt; ffmpeg's stderr is
 * discarded and every failure is a fixed code.
 *
 * Ported from `createRtspsStillSampler` in
 * `packages/plugins/bambu/scripts/qualify-x1c.mts`, reduced to one attempt.
 *
 * @internal
 */

import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, isIP } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { Transform } from 'node:stream';
import type { Duplex, TransformCallback } from 'node:stream';

import type { MachineNetworkStillInput, MachineStill } from '@taucad/runtime/machine';

/** How long a captured still stays valid; the runtime admits at most 30 s. */
const stillLifetime = 15_000;
const jpegStart = Buffer.from([0xff, 0xd8]);
const jpegEnd = Buffer.from([0xff, 0xd9]);
const safeUsername = /^[\w.-]{1,64}$/u;
const safePath = /^(?:\/[\w.-]+){1,8}$/u;

/**
 * Find an executable `ffmpeg` on `PATH` or in the Homebrew prefixes, which a
 * packaged app launched from Finder does not have on its `PATH`.
 *
 * ponytail: POSIX names only; add `ffmpeg.exe` when stills ship on Windows.
 *
 * @internal
 * @param path - The search path, `process.env.PATH` by default.
 * @returns The first executable candidate, or `undefined` when none is found.
 */
export const findFfmpeg = async (path = process.env['PATH'] ?? ''): Promise<string | undefined> => {
  const candidates = [
    ...path
      .split(delimiter)
      .filter((directory) => isAbsolute(directory))
      .map((directory) => join(directory, 'ffmpeg')),
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ];
  for (const candidate of candidates) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the first executable candidate wins.
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Not here; try the next candidate. */
    }
  }
  return undefined;
};

/**
 * Rewrite the loopback URL in RTSP request lines to the camera's own, leaving
 * headers and interleaved media untouched.
 *
 * @param source - The loopback URL prefix ffmpeg requests.
 * @param replacement - The camera's `rtsps://` URL prefix.
 * @returns A streaming rewriter over the client's bytes.
 */
const createRtspRequestRewriter = (
  source: string,
  replacement: string,
): Readonly<{ push(chunk: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>; flush(): Uint8Array<ArrayBuffer> }> => {
  let pending = '';
  const rewriteLine = (line: string): string =>
    /^[A-Z_]+\s/u.test(line) && /\sRTSP\/\d\.\d$/u.test(line) ? line.replace(source, replacement) : line;
  return Object.freeze({
    push(chunk: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
      const lines = (pending + Buffer.from(chunk).toString('latin1')).split('\r\n');
      pending = lines.pop() ?? '';
      const head = `${lines.map((line) => rewriteLine(line)).join('\r\n')}${lines.length > 0 ? '\r\n' : ''}`;
      if (pending.length > 16 * 1024) {
        const output = head + pending;
        pending = '';
        return Buffer.from(output, 'latin1');
      }
      return Buffer.from(head, 'latin1');
    },
    flush(): Uint8Array<ArrayBuffer> {
      const output = Buffer.from(rewriteLine(pending), 'latin1');
      pending = '';
      return output;
    },
  });
};

type RtspProxy = Readonly<{
  port: number;
  /** The first upstream failure's fixed code, if any. */
  failure(): Error | undefined;
  close(): Promise<void>;
}>;

/**
 * Serve one loopback RTSP client over the pinned upstream the caller opens.
 *
 * @param openUpstream - Open the pinned TLS socket to the camera.
 * @param remote - The camera endpoint request lines are rewritten to.
 * @returns The listening proxy.
 */
const listenRtspProxy = async (
  openUpstream: () => Promise<Duplex>,
  remote: Readonly<{ address: string; port: number }>,
): Promise<RtspProxy> => {
  let failure: Error | undefined;
  const sockets = new Set<Duplex>();
  let localPort = 0;
  const relay = async (client: Socket): Promise<void> => {
    sockets.add(client);
    client.pause();
    client.once('error', () => undefined);
    client.once('close', () => sockets.delete(client));
    let upstream: Duplex;
    try {
      upstream = await openUpstream();
    } catch (error) {
      /* `openUpstream` rejects with fixed codes such as `MACHINE_TLS_PIN_MISMATCH`. */
      failure ??= error instanceof Error ? error : new Error('MACHINE_STILL_STREAM_FAILED');
      client.destroy();
      return;
    }
    sockets.add(upstream);
    upstream.on('error', () => {
      failure ??= new Error('MACHINE_STILL_STREAM_FAILED');
      client.destroy();
    });
    upstream.once('close', () => {
      sockets.delete(upstream);
      client.destroy();
    });
    client.once('close', () => upstream.destroy());
    if (client.destroyed) {
      upstream.destroy();
      return;
    }
    const host = isIP(remote.address) === 6 ? `[${remote.address}]` : remote.address;
    const rewriter = createRtspRequestRewriter(`rtsp://127.0.0.1:${localPort}`, `rtsps://${host}:${remote.port}`);
    const rewrite = new Transform({
      transform(chunk: Uint8Array<ArrayBuffer>, _encoding: BufferEncoding, callback: TransformCallback) {
        callback(undefined, rewriter.push(chunk));
      },
      flush(callback: TransformCallback) {
        callback(undefined, rewriter.flush());
      },
    });
    client.pipe(rewrite).pipe(upstream);
    upstream.pipe(client);
    client.resume();
  };
  const server = createServer((client) => {
    void relay(client);
  });
  server.maxConnections = 1;
  server.on('error', () => {
    failure ??= new Error('MACHINE_STILL_PROXY_FAILED');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => {
      reject(new Error('MACHINE_STILL_PROXY_FAILED'));
    });
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('MACHINE_STILL_PROXY_FAILED');
  }
  localPort = address.port;
  return Object.freeze({
    port: localPort,
    failure: () => failure,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  });
};

/**
 * Find the first complete JPEG in what ffmpeg has written so far.
 *
 * @param bytes - Everything read from ffmpeg's stdout.
 * @param maximumBytes - The largest admissible frame.
 * @returns The frame, or `undefined` while it is still arriving.
 */
const firstJpeg = (bytes: Uint8Array<ArrayBuffer>, maximumBytes: number): Uint8Array<ArrayBuffer> | undefined => {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = view.indexOf(jpegStart);
  const end = start === -1 ? -1 : view.indexOf(jpegEnd, start + 2);
  const length = end === -1 ? view.byteLength - Math.max(start, 0) : end + 2 - start;
  if (length > maximumBytes) {
    throw new Error('MACHINE_STILL_TOO_LARGE');
  }
  return end === -1 ? undefined : Uint8Array.from(view.subarray(start, end + 2));
};

/**
 * Run ffmpeg over the ffconcat input until its first frame, a failure, the
 * deadline or an abort, and kill it before returning.
 *
 * @param input - The provider's camera request.
 * @param run - The ffmpeg executable, its private input file and the proxy it reaches.
 * @returns The first JPEG frame.
 */
const decodeFirstFrame = async (
  input: MachineNetworkStillInput,
  run: Readonly<{ ffmpeg: string; inputPath: string; proxy: RtspProxy }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const child = spawn(
    run.ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-f',
      'concat',
      '-safe',
      '0',
      '-protocol_whitelist',
      'file,tcp,tls,rtp,udp,crypto',
      '-i',
      run.inputPath,
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-q:v',
      '2',
      'pipe:1',
    ],
    /* Its stderr is ignored: diagnostics may echo the input URL. */
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  /* A child that fails to spawn may emit `error` without `close`. */
  const ended = new Promise<void>((resolve) => {
    child.once('close', () => {
      resolve();
    });
    child.once('error', () => {
      resolve();
    });
  });
  const frame = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
  let buffered = Buffer.alloc(0);
  const deadline = setTimeout(() => {
    frame.reject(run.proxy.failure() ?? new Error('MACHINE_STILL_TIMEOUT'));
  }, input.connectTimeout);
  const onAbort = (): void => {
    frame.reject(input.signal.reason);
  };
  input.signal.addEventListener('abort', onAbort, { once: true });
  child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    try {
      buffered = Buffer.concat([buffered, chunk]);
      const jpeg = firstJpeg(buffered, input.maximumBytes);
      if (jpeg) {
        frame.resolve(jpeg);
      }
    } catch (error) {
      frame.reject(error);
    }
  });
  child.once('error', () => {
    frame.reject(new Error('MACHINE_STILL_FFMPEG_FAILED'));
  });
  child.once('close', () => {
    frame.reject(run.proxy.failure() ?? new Error('MACHINE_STILL_CAPTURE_FAILED'));
  });
  try {
    return await frame.promise;
  } finally {
    clearTimeout(deadline);
    input.signal.removeEventListener('abort', onAbort);
    child.kill('SIGKILL');
    await ended;
  }
};

/**
 * Capture one JPEG still from a pinned RTSPS camera.
 *
 * @internal
 * @param input - The provider's camera request.
 * @param options - The resolved `ffmpeg` (or `undefined` when it is missing),
 * the camera's access code, and the pinned TLS socket to the camera, which
 * rejects with a fixed code such as `MACHINE_TLS_PIN_MISMATCH`.
 * @returns A still that expires 15 s after capture.
 */
export const captureRtspsStill = async (
  input: MachineNetworkStillInput,
  options: Readonly<{
    ffmpeg: string | undefined;
    accessCode: () => Promise<string>;
    openUpstream: () => Promise<Duplex>;
  }>,
): Promise<MachineStill> => {
  if (
    input.trust.type !== 'pinned' ||
    !Number.isInteger(input.endpoint.port) ||
    input.endpoint.port < 1 ||
    input.endpoint.port > 65_535 ||
    !safeUsername.test(input.username) ||
    !safePath.test(input.path) ||
    !Number.isFinite(input.connectTimeout) ||
    input.connectTimeout < 1000 ||
    input.connectTimeout > 60_000 ||
    !Number.isInteger(input.maximumBytes) ||
    input.maximumBytes < 4 ||
    input.maximumBytes > 4 * 1024 * 1024
  ) {
    throw new Error('MACHINE_STILL_REQUEST_INVALID');
  }
  input.signal.throwIfAborted();
  if (options.ffmpeg === undefined) {
    throw new Error('MACHINE_STILL_FFMPEG_MISSING');
  }
  const accessCode = await options.accessCode();
  const directory = await mkdtemp(join(tmpdir(), 'tau-camera-'));
  let proxy: RtspProxy | undefined;
  try {
    proxy = await listenRtspProxy(options.openUpstream, input.endpoint);
    const url = new URL(`rtsp://127.0.0.1:${proxy.port}${input.path}`);
    url.username = input.username;
    url.password = accessCode;
    const inputPath = join(directory, 'camera.ffconcat');
    await writeFile(
      inputPath,
      [
        'ffconcat version 1.0',
        `file '${url.toString().replaceAll("'", '%27')}'`,
        'option rtsp_transport tcp',
        'option rtsp_flags prefer_tcp',
        `option timeout ${input.connectTimeout * 1000}`,
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
    const jpeg = await decodeFirstFrame(input, { ffmpeg: options.ffmpeg, inputPath, proxy });
    const capturedAt = Date.now();
    return Object.freeze({
      bytes: jpeg,
      mediaType: 'image/jpeg',
      capturedAt: new Date(capturedAt).toISOString(),
      expiresAt: new Date(capturedAt + stillLifetime).toISOString(),
    });
  } finally {
    await proxy?.close();
    await rm(directory, { recursive: true, force: true });
  }
};
