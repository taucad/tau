/**
 * One JPEG still from a pinned RTSPS camera, decoded by the system `ffmpeg`.
 * The camera's address, port, path and account all come from the caller.
 *
 * ffmpeg never sees the camera or a credential. It plays
 * `rtsp://127.0.0.1:<port><path>` from a loopback proxy whose upstream is the
 * caller's pinned TLS socket, so the pin is checked in-process. The proxy
 * sends each request under the camera's own URI and answers the camera's
 * `401` itself (Basic, or MD5 Digest with or without `qop=auth`), resending the
 * request with its own `Authorization`. ffmpeg's stderr is discarded and every
 * failure is a fixed code.
 *
 * A capture retries a transient failure (the camera refusing or resetting the
 * connection, or ffmpeg ending without a frame while the camera warms up) with
 * a short backoff until its deadline.
 *
 * @internal
 */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer, isIP } from 'node:net';
import type { Socket } from 'node:net';
import { posix, win32 } from 'node:path';
import { Transform } from 'node:stream';
import type { Duplex, TransformCallback } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import type { MachineNetworkStillInput, MachineStill } from '@taucad/runtime/machine';

/** How long a captured still stays valid; the runtime admits at most 30 s. Milliseconds. */
const stillLifetime = 15_000;
/** The pause before the first retry, doubled per attempt up to {@link longestRetryPause}. Milliseconds. */
const firstRetryPause = 500;
/** Milliseconds. */
const longestRetryPause = 2000;
/** An attempt is not started with less time than this left before the deadline. Milliseconds. */
const shortestAttempt = 1000;
const maximumHeadBytes = 16 * 1024;
const maximumBodyBytes = 64 * 1024;
const jpegStart = Buffer.from([0xff, 0xd8]);
const jpegEnd = Buffer.from([0xff, 0xd9]);
const safeUsername = /^[\w.-]{1,64}$/u;
const safePath = /^(?:\/[\w.-]+){1,8}$/u;
/** Failures a later attempt can outlive: the camera refused, reset or ended the session before a frame. */
const transientFailures: ReadonlySet<string> = new Set([
  'MACHINE_CONNECT_FAILED',
  'MACHINE_CONNECT_TIMEOUT',
  'MACHINE_STILL_STREAM_FAILED',
  'MACHINE_STILL_CAPTURE_FAILED',
]);

/**
 * Every place {@link findFfmpeg} looks, in order: `PATH`, then the package
 * managers' own directories, which a packaged app launched from Finder or the
 * Start menu does not have on its `PATH`.
 *
 * @internal
 * @param platform - The operating system the paths are for.
 * @param environment - Its environment variables.
 * @returns Absolute candidate paths, without duplicates.
 */
export const ffmpegCandidates = (platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): string[] => {
  const paths = platform === 'win32' ? win32 : posix;
  const managed =
    platform === 'win32'
      ? [
          environment['LOCALAPPDATA'] === undefined
            ? undefined
            : win32.join(environment['LOCALAPPDATA'], 'Microsoft', 'WinGet', 'Links'),
          environment['ProgramData'] === undefined
            ? undefined
            : win32.join(environment['ProgramData'], 'chocolatey', 'bin'),
          environment['USERPROFILE'] === undefined
            ? undefined
            : win32.join(environment['USERPROFILE'], 'scoop', 'shims'),
        ]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin'];
  const directories = [...(environment['PATH'] ?? '').split(paths.delimiter), ...managed].filter(
    (directory): directory is string => directory !== undefined && paths.isAbsolute(directory),
  );
  return [
    ...new Set(directories.map((directory) => paths.join(directory, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))),
  ];
};

/**
 * Find an executable `ffmpeg`: `PATH` first, then Homebrew and MacPorts on
 * macOS and Linux, or the WinGet, Chocolatey and Scoop directories on Windows.
 *
 * @internal
 * @param platform - The operating system, `process.platform` by default.
 * @param environment - The environment variables, `process.env` by default.
 * @returns The first executable candidate, or `undefined` when none is found.
 */
export const findFfmpeg = async (
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> => {
  for (const candidate of ffmpegCandidates(platform, environment)) {
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

/** One `WWW-Authenticate` challenge: its lower-case scheme and its parameters, names lower-cased. @internal */
export type RtspChallenge = Readonly<{ scheme: string; params: ReadonlyMap<string, string> }>;

const challengeName = /[\s,]*([\w!#$%&'*+.^`|~-]+)\s*/uy;
const challengeValue = /\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]*))/uy;

/**
 * Split one `WWW-Authenticate` value into its challenges, by the HTTP grammar
 * RTSP borrows: a bare token starts a challenge, and each `name=value` pair,
 * quoted or not, belongs to the challenge before it.
 *
 * @internal
 * @param header - One header value, which may hold several challenges.
 * @returns The challenges in order; text that does not parse ends the list.
 */
export const parseChallenges = (header: string): RtspChallenge[] => {
  const challenges: Array<{ scheme: string; params: Map<string, string> }> = [];
  let offset = 0;
  for (;;) {
    challengeName.lastIndex = offset;
    const name = challengeName.exec(header)?.[1]?.toLowerCase();
    if (name === undefined) {
      return challenges;
    }
    offset = challengeName.lastIndex;
    if (header[offset] !== '=') {
      challenges.push({ scheme: name, params: new Map() });
      continue;
    }
    challengeValue.lastIndex = offset + 1;
    const value = challengeValue.exec(header);
    if (value === null) {
      return challenges;
    }
    offset = challengeValue.lastIndex;
    challenges.at(-1)?.params.set(name, value[1]?.replaceAll(/\\(.)/gu, '$1') ?? value[2] ?? '');
  }
};

const md5 = (text: string): string => createHash('md5').update(text).digest('hex');

/**
 * The MD5 Digest `response` for one request (RFC 7616 §3.4.1): with
 * `qop=auth` when `qop` carries the nonce count and client nonce, else the
 * RFC 2069 form a challenge without `qop` asks for.
 *
 * @internal
 * @param input - The credentials, the challenge's realm and nonce, and the
 * request's method and URI as its request line carries them.
 * @returns The lower-case hex response.
 */
export const digestResponse = (
  input: Readonly<{
    username: string;
    password: string;
    realm: string;
    nonce: string;
    method: string;
    uri: string;
    qop?: Readonly<{ nc: string; cnonce: string }>;
  }>,
): string => {
  const secret = md5(`${input.username}:${input.realm}:${input.password}`);
  const request = md5(`${input.method}:${input.uri}`);
  return md5(
    input.qop === undefined
      ? `${secret}:${input.nonce}:${request}`
      : `${secret}:${input.nonce}:${input.qop.nc}:${input.qop.cnonce}:auth:${request}`,
  );
};

/** The camera credentials every attempt of one capture answers challenges with. @internal */
export type RtspAuthenticator = Readonly<{
  /** Adopt a `401`'s first answerable challenge, Digest before Basic: `stale` when it only renews the nonce, `undefined` when none is answerable. */
  challenge(headers: readonly string[]): 'fresh' | 'stale' | undefined;
  /** The `Authorization` value for one request, once a challenge is known. */
  authorization(method: string, uri: string): string | undefined;
}>;

const quoted = (text: string): string => `"${text.replaceAll(/["\\]/gu, String.raw`\$&`)}"`;

/**
 * Whether the proxy can answer a challenge as Digest.
 *
 * @param challenge - One parsed challenge.
 * @returns Whether it is MD5 Digest offering `qop=auth` or no `qop`, with
 * nothing that could break the header it is echoed into.
 */
const isAnswerableDigest = ({ scheme, params }: RtspChallenge): boolean => {
  const qop = params.get('qop');
  return (
    scheme === 'digest' &&
    params.has('realm') &&
    params.has('nonce') &&
    (params.get('algorithm') ?? 'MD5').toUpperCase() === 'MD5' &&
    (qop === undefined || qop.split(',').some((option) => option.trim().toLowerCase() === 'auth')) &&
    ['realm', 'nonce', 'opaque'].every((name) => !/\p{Cc}/u.test(params.get(name) ?? ''))
  );
};

/**
 * Answer camera challenges for one capture, counting nonce uses across its attempts.
 *
 * @internal
 * @param credentials - The camera's username and password.
 * @returns The authenticator the capture's proxies share.
 */
export const createRtspAuthenticator = (
  credentials: Readonly<{ username: string; password: string }>,
): RtspAuthenticator => {
  let adopted: RtspChallenge | undefined;
  let nonceCount = 0;
  const digest = (params: ReadonlyMap<string, string>, method: string, uri: string): string => {
    const realm = params.get('realm') ?? '';
    const nonce = params.get('nonce') ?? '';
    const opaque = params.get('opaque');
    nonceCount += 1;
    const qop = params.has('qop')
      ? { nc: nonceCount.toString(16).padStart(8, '0'), cnonce: randomBytes(16).toString('hex') }
      : undefined;
    const response = digestResponse({ ...credentials, realm, nonce, method, uri, qop });
    return `Digest ${[
      `username=${quoted(credentials.username)}`,
      `realm=${quoted(realm)}`,
      `nonce=${quoted(nonce)}`,
      `uri=${quoted(uri)}`,
      ...(qop === undefined ? [] : ['qop=auth', `nc=${qop.nc}`, `cnonce=${quoted(qop.cnonce)}`]),
      `response=${quoted(response)}`,
      ...(params.has('algorithm') ? ['algorithm=MD5'] : []),
      ...(opaque === undefined ? [] : [`opaque=${quoted(opaque)}`]),
    ].join(', ')}`;
  };
  return Object.freeze({
    challenge(headers: readonly string[]) {
      const offered = headers.flatMap((header) => parseChallenges(header));
      const next =
        offered.find((challenge) => isAnswerableDigest(challenge)) ?? offered.find(({ scheme }) => scheme === 'basic');
      if (next === undefined) {
        return undefined;
      }
      if (next.params.get('nonce') !== adopted?.params.get('nonce')) {
        nonceCount = 0;
      }
      adopted = next;
      return next.params.get('stale')?.toLowerCase() === 'true' ? 'stale' : 'fresh';
    },
    authorization(method: string, uri: string) {
      if (adopted === undefined) {
        return undefined;
      }
      return adopted.scheme === 'basic'
        ? `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
        : digest(adopted.params, method, uri);
    },
  });
};

type RtspMessage = Readonly<{
  type: 'message';
  start: string;
  headers: readonly string[];
  body: Uint8Array<ArrayBuffer>;
  raw: Uint8Array<ArrayBuffer>;
}>;
type RtspUnit = Readonly<{ type: 'frame'; bytes: Uint8Array<ArrayBuffer> }> | RtspMessage;

/**
 * Find where a message head ends: at its first empty line, after CRLF or the bare LF ffmpeg also accepts.
 *
 * @param bytes - The bytes from the head's start.
 * @returns Where the head's last line ends and its body starts, or `undefined` while it is still arriving.
 */
const findHeadEnd = (bytes: Uint8Array<ArrayBuffer>): Readonly<{ head: number; body: number }> | undefined => {
  for (let index = bytes.indexOf(0x0a); index !== -1; index = bytes.indexOf(0x0a, index + 1)) {
    if (bytes[index + 1] === 0x0a) {
      return { head: index, body: index + 2 };
    }
    if (bytes[index + 1] === 0x0d && bytes[index + 2] === 0x0a) {
      return { head: index, body: index + 3 };
    }
  }
  return undefined;
};

const headerValues = (headers: readonly string[], name: string): string[] =>
  headers.flatMap((line) => {
    const colon = line.indexOf(':');
    return colon > 0 && line.slice(0, colon).trim().toLowerCase() === name ? [line.slice(colon + 1).trim()] : [];
  });

/**
 * Read the next interleaved `$` frame or message.
 *
 * @param bytes - The unread bytes of one direction.
 * @returns The unit at their start and its size, or `undefined` while it is still arriving.
 */
const nextUnit = (bytes: Uint8Array<ArrayBuffer>): Readonly<{ unit: RtspUnit; size: number }> | undefined => {
  if (bytes[0] === 0x24) {
    const size = bytes.byteLength < 4 ? Number.POSITIVE_INFINITY : 4 + (bytes[2] ?? 0) * 256 + (bytes[3] ?? 0);
    return bytes.byteLength < size ? undefined : { unit: { type: 'frame', bytes: bytes.subarray(0, size) }, size };
  }
  const end = findHeadEnd(bytes);
  if ((end?.head ?? bytes.byteLength) > maximumHeadBytes) {
    throw new Error('MACHINE_STILL_STREAM_FAILED');
  }
  if (end === undefined) {
    return undefined;
  }
  const [start = '', ...headers] = Buffer.from(bytes.subarray(0, end.head))
    .toString('latin1')
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  const [length = '0'] = headerValues(headers, 'content-length');
  if (!/^\d{1,6}$/u.test(length) || Number(length) > maximumBodyBytes) {
    throw new Error('MACHINE_STILL_STREAM_FAILED');
  }
  const size = end.body + Number(length);
  return bytes.byteLength < size
    ? undefined
    : {
        unit: { type: 'message', start, headers, body: bytes.subarray(end.body, size), raw: bytes.subarray(0, size) },
        size,
      };
};

/**
 * Split one direction of an RTSP connection into interleaved `$` frames and whole messages.
 *
 * @returns A splitter taking each chunk as it arrives and returning the units it completes.
 */
const createRtspSplitter = (): ((chunk: Uint8Array<ArrayBuffer>) => RtspUnit[]) => {
  let pending: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  return (chunk) => {
    pending = pending.byteLength === 0 ? chunk : Buffer.concat([pending, chunk]);
    const units: RtspUnit[] = [];
    for (;;) {
      let skipped = 0;
      /* Line breaks between messages carry nothing. */
      while (pending[skipped] === 0x0d || pending[skipped] === 0x0a) {
        skipped += 1;
      }
      pending = pending.subarray(skipped);
      const next = nextUnit(pending);
      if (next === undefined) {
        return units;
      }
      units.push(next.unit);
      pending = pending.subarray(next.size);
    }
  };
};

type PendingRequest = {
  readonly method: string;
  readonly uri: string;
  readonly version: string;
  readonly headers: readonly string[];
  readonly body: Uint8Array<ArrayBuffer>;
  /** How many `401`s this request has been resent for. */
  challenges: number;
};

const requestLine = /^(\S+) (\S+) (RTSP\/\d\.\d)$/u;
const statusLine = /^RTSP\/\d\.\d (\d{3})(?: |$)/u;

const serializeRequest = (request: PendingRequest, authorization: string | undefined): Uint8Array<ArrayBuffer> =>
  Buffer.concat([
    Buffer.from(
      `${[
        `${request.method} ${request.uri} ${request.version}`,
        ...request.headers,
        ...(authorization === undefined ? [] : [`Authorization: ${authorization}`]),
      ].join('\r\n')}\r\n\r\n`,
      'latin1',
    ),
    request.body,
  ]);

/** One connection's RTSP conversation, as bytes in and bytes out. @internal */
export type RtspSession = Readonly<{
  /** Take the bytes ffmpeg sent; returns the bytes to send the camera. */
  fromClient(chunk: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
  /** Take the bytes the camera sent; returns the bytes for ffmpeg, and any request resent to the camera. */
  fromCamera(
    chunk: Uint8Array<ArrayBuffer>,
  ): Readonly<{ toClient: Uint8Array<ArrayBuffer>; toCamera: Uint8Array<ArrayBuffer> }>;
}>;

/**
 * Speak for ffmpeg to the camera over one connection: requests leave under the
 * camera's URI with the proxy's credentials instead of any of ffmpeg's, and a
 * challenged request is answered and resent under its own `CSeq` before ffmpeg
 * could see the `401`. Interleaved `$` frames and responses pass untouched.
 *
 * @internal
 * @param options - The loopback URL prefix ffmpeg requests, the camera's
 * `rtsps://` prefix, and the capture's authenticator.
 * @returns The session; both directions throw fixed codes, among them
 * `MACHINE_STILL_AUTH_REJECTED` when the camera refuses the credentials.
 */
export const createRtspSession = (
  options: Readonly<{ loopback: string; camera: string; authenticator: RtspAuthenticator }>,
): RtspSession => {
  const splitClient = createRtspSplitter();
  const splitCamera = createRtspSplitter();
  const pending = new Map<string, PendingRequest>();
  const cameraUri = (uri: string): string =>
    uri === options.loopback || uri.startsWith(`${options.loopback}/`)
      ? `${options.camera}${uri.slice(options.loopback.length)}`
      : uri;
  const send = (request: PendingRequest): Uint8Array<ArrayBuffer> =>
    serializeRequest(request, options.authenticator.authorization(request.method, request.uri));
  const forward = (message: RtspMessage): Uint8Array<ArrayBuffer> => {
    const [, method, uri = '', version = ''] = requestLine.exec(message.start) ?? [];
    if (method === undefined) {
      /* Not a request: ffmpeg answering one of the camera's. */
      return message.raw;
    }
    const request: PendingRequest = {
      method,
      uri: cameraUri(uri),
      version,
      headers: message.headers.filter((line) => !/^authorization\s*:/iu.test(line)),
      body: message.body,
      challenges: 0,
    };
    const [sequence] = headerValues(message.headers, 'cseq');
    if (sequence !== undefined) {
      pending.set(sequence, request);
    }
    return send(request);
  };
  const answer = (message: RtspMessage): Uint8Array<ArrayBuffer> => {
    const [sequence] = headerValues(message.headers, 'cseq');
    const request = sequence === undefined ? undefined : pending.get(sequence);
    const renewal = options.authenticator.challenge(headerValues(message.headers, 'www-authenticate'));
    if (request === undefined || renewal === undefined) {
      throw new Error('MACHINE_STILL_AUTH_REJECTED');
    }
    request.challenges += 1;
    /* A second `401` refuses the credentials, unless it only renews a stale nonce, once. */
    if (request.challenges > (renewal === 'stale' ? 2 : 1)) {
      throw new Error('MACHINE_STILL_AUTH_REJECTED');
    }
    return send(request);
  };
  return Object.freeze({
    fromClient(chunk: Uint8Array<ArrayBuffer>) {
      return Buffer.concat(splitClient(chunk).map((unit) => (unit.type === 'frame' ? unit.bytes : forward(unit))));
    },
    fromCamera(chunk: Uint8Array<ArrayBuffer>) {
      const toClient: Array<Uint8Array<ArrayBuffer>> = [];
      const toCamera: Array<Uint8Array<ArrayBuffer>> = [];
      for (const unit of splitCamera(chunk)) {
        const status = unit.type === 'message' ? statusLine.exec(unit.start)?.[1] : undefined;
        if (unit.type === 'message' && status === '401') {
          toCamera.push(answer(unit));
          continue;
        }
        const [sequence] = unit.type === 'message' && status !== undefined ? headerValues(unit.headers, 'cseq') : [];
        if (sequence !== undefined) {
          pending.delete(sequence);
        }
        toClient.push(unit.type === 'frame' ? unit.bytes : unit.raw);
      }
      return Object.freeze({ toClient: Buffer.concat(toClient), toCamera: Buffer.concat(toCamera) });
    },
  });
};

/** A listening loopback proxy. @internal */
export type RtspProxy = Readonly<{ port: number; close(): Promise<void> }>;

const relayTransform = (convert: (chunk: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>): Transform =>
  new Transform({
    transform(chunk: Uint8Array<ArrayBuffer>, _encoding: BufferEncoding, callback: TransformCallback) {
      try {
        const output = convert(chunk);
        callback(undefined, output.byteLength > 0 ? output : undefined);
      } catch (error) {
        callback(error instanceof Error ? error : new Error('MACHINE_STILL_STREAM_FAILED'));
      }
    },
  });

/**
 * Serve one loopback RTSP client over the pinned upstream the caller opens,
 * speaking for it to the camera. The listener closes at the first connection,
 * so no later one, from any local process, reaches the authenticated camera.
 *
 * @internal
 * @param options - Open the pinned TLS socket to the camera; the camera's
 * endpoint; the capture's authenticator; and where each fixed-code failure goes.
 * @returns The listening proxy.
 */
export const listenRtspProxy = async (
  options: Readonly<{
    openUpstream: () => Promise<Duplex>;
    remote: Readonly<{ address: string; port: number }>;
    authenticator: RtspAuthenticator;
    onFailure: (error: Error) => void;
  }>,
): Promise<RtspProxy> => {
  const sockets = new Set<Duplex>();
  const host = isIP(options.remote.address) === 6 ? `[${options.remote.address}]` : options.remote.address;
  let localPort = 0;
  const relay = async (client: Socket): Promise<void> => {
    sockets.add(client);
    client.pause();
    client.on('error', () => undefined);
    client.once('close', () => sockets.delete(client));
    let upstream: Duplex;
    try {
      upstream = await options.openUpstream();
    } catch (error) {
      /* `openUpstream` rejects with fixed codes such as `MACHINE_TLS_PIN_MISMATCH`. */
      options.onFailure(error instanceof Error ? error : new Error('MACHINE_STILL_STREAM_FAILED'));
      client.destroy();
      return;
    }
    sockets.add(upstream);
    const fail = (error: Error): void => {
      options.onFailure(error);
      client.destroy();
      upstream.destroy();
    };
    upstream.on('error', () => {
      fail(new Error('MACHINE_STILL_STREAM_FAILED'));
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
    const session = createRtspSession({
      loopback: `rtsp://127.0.0.1:${localPort}`,
      camera: `rtsps://${host}:${options.remote.port}`,
      authenticator: options.authenticator,
    });
    const requests = relayTransform((chunk) => session.fromClient(chunk));
    const responses = relayTransform((chunk) => {
      const { toClient, toCamera } = session.fromCamera(chunk);
      if (toCamera.byteLength > 0) {
        upstream.write(toCamera);
      }
      return toClient;
    });
    for (const stream of [requests, responses]) {
      stream.on('error', (error) => {
        fail(error);
      });
    }
    client.pipe(requests).pipe(upstream);
    upstream.pipe(responses).pipe(client);
    client.resume();
  };
  const server = createServer((client) => {
    /* The first connection is ffmpeg's; stop listening so nothing else can connect, now or after it closes. */
    server.close();
    void relay(client);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => {
      reject(new Error('MACHINE_STILL_PROXY_FAILED'));
    });
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
  });
  server.on('error', () => {
    options.onFailure(new Error('MACHINE_STILL_PROXY_FAILED'));
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('MACHINE_STILL_PROXY_FAILED');
  }
  localPort = address.port;
  return Object.freeze({
    port: localPort,
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

type CaptureRun = Readonly<{
  ffmpeg: string;
  openUpstream: () => Promise<Duplex>;
  authenticator: RtspAuthenticator;
  /** When the whole capture gives up, as `Date.now()` milliseconds. */
  deadline: number;
}>;

/**
 * Play the camera once through a fresh proxy until ffmpeg's first frame, a
 * failure, the deadline or an abort; ffmpeg is killed and the proxy closed
 * before it returns.
 *
 * @param input - The provider's camera request.
 * @param run - The capture's ffmpeg, upstream, authenticator and deadline.
 * @returns The first JPEG frame.
 */
const attemptCapture = async (input: MachineNetworkStillInput, run: CaptureRun): Promise<Uint8Array<ArrayBuffer>> => {
  const frame = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
  const proxy = await listenRtspProxy({
    openUpstream: run.openUpstream,
    remote: input.endpoint,
    authenticator: run.authenticator,
    onFailure: frame.reject,
  });
  const remaining = run.deadline - Date.now();
  const child = spawn(
    run.ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-rtsp_transport',
      'tcp',
      '-rtsp_flags',
      'prefer_tcp',
      /* The socket I/O timeout, in microseconds. */
      '-timeout',
      String(Math.floor(remaining * 1000)),
      '-i',
      `rtsp://127.0.0.1:${proxy.port}${input.path}`,
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
    /* Its stderr is ignored: diagnostics can repeat what the camera sent. */
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
  let buffered = Buffer.alloc(0);
  const deadlineTimer = setTimeout(() => {
    frame.reject(new Error('MACHINE_STILL_TIMEOUT'));
  }, remaining);
  const onAbort = (): void => {
    frame.reject(input.signal.reason);
  };
  input.signal.addEventListener('abort', onAbort, { once: true });
  if (input.signal.aborted) {
    onAbort();
  }
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
    frame.reject(new Error('MACHINE_STILL_CAPTURE_FAILED'));
  });
  try {
    return await frame.promise;
  } finally {
    clearTimeout(deadlineTimer);
    input.signal.removeEventListener('abort', onAbort);
    child.kill('SIGKILL');
    await ended;
    await proxy.close();
  }
};

const isValidStillRequest = (input: MachineNetworkStillInput): boolean =>
  input.trust.type === 'pinned' &&
  Number.isInteger(input.endpoint.port) &&
  input.endpoint.port >= 1 &&
  input.endpoint.port <= 65_535 &&
  safeUsername.test(input.username) &&
  safePath.test(input.path) &&
  Number.isFinite(input.connectTimeout) &&
  input.connectTimeout >= 1000 &&
  input.connectTimeout <= 60_000 &&
  Number.isInteger(input.maximumBytes) &&
  input.maximumBytes >= 4 &&
  input.maximumBytes <= 4 * 1024 * 1024;

const pauseBeforeRetry = async (pause: number, signal: AbortSignal): Promise<void> => {
  try {
    await sleep(pause, undefined, { signal });
  } catch {
    signal.throwIfAborted();
  }
};

/**
 * Capture one JPEG still from a pinned RTSPS camera, retrying transient
 * failures until `input.connectTimeout` has passed. An authentication refusal
 * (`MACHINE_STILL_AUTH_REJECTED`), a pin mismatch, an oversize frame or an
 * invalid request is never retried.
 *
 * @internal
 * @param input - The provider's camera request.
 * @param options - The resolved `ffmpeg` (or `undefined` when it is missing),
 * the camera's password, and the pinned TLS socket to the camera, which
 * rejects with a fixed code such as `MACHINE_TLS_PIN_MISMATCH`.
 * @returns A still that expires 15 s after capture.
 */
export const captureRtspsStill = async (
  input: MachineNetworkStillInput,
  options: Readonly<{
    ffmpeg: string | undefined;
    password: () => Promise<string>;
    openUpstream: () => Promise<Duplex>;
  }>,
): Promise<MachineStill> => {
  if (!isValidStillRequest(input)) {
    throw new Error('MACHINE_STILL_REQUEST_INVALID');
  }
  input.signal.throwIfAborted();
  if (options.ffmpeg === undefined) {
    throw new Error('MACHINE_STILL_FFMPEG_MISSING');
  }
  const run: CaptureRun = {
    ffmpeg: options.ffmpeg,
    openUpstream: options.openUpstream,
    authenticator: createRtspAuthenticator({ username: input.username, password: await options.password() }),
    deadline: Date.now() + input.connectTimeout,
  };
  for (let attempt = 0; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- attempts are serial: each follows the last one's failure.
      const jpeg = await attemptCapture(input, run);
      const capturedAt = Date.now();
      return Object.freeze({
        bytes: jpeg,
        mediaType: 'image/jpeg',
        capturedAt: new Date(capturedAt).toISOString(),
        expiresAt: new Date(capturedAt + stillLifetime).toISOString(),
      });
    } catch (error) {
      const pause = Math.min(firstRetryPause * 2 ** attempt, longestRetryPause);
      if (
        input.signal.aborted ||
        !(error instanceof Error) ||
        !transientFailures.has(error.message) ||
        run.deadline - Date.now() - pause < shortestAttempt
      ) {
        throw error;
      }
      // oxlint-disable-next-line no-await-in-loop -- the backoff separates serial attempts.
      await pauseBeforeRetry(pause, input.signal);
    }
  }
};
