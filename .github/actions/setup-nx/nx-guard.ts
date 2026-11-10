/**
 * Every `pnpm nx` call in a job that ran setup-nx goes through this guard (`node_modules/.bin/nx` is replaced by a
 * shim that execs it). It does two things and passes every other exit status through unchanged:
 *
 * 1. Nx 22.7.1 still segfaults now and then about two seconds into a command, before it prints or runs anything
 *    (SIGSEGV with and without the PTY runner, Node 24.10 and 24.20; no local repro). The command is rerun once.
 * 2. Nx's self-hosted remote cache client fails the whole command on any answer it does not expect: an unreachable
 *    server, a 5xx, or a 413 from the Cloudflare edge for an entry over the Workers body limit (Nx 22.7.12,
 *    `http_remote_cache.rs`). A cache fault must never fail a build (tau-cloud `tau-ci-cache`), so when the remote
 *    cache is on and the command fails with one of Nx's remote cache errors, it is rerun once with the remote cache
 *    off. Tasks that already succeeded replay from the local cache.
 *
 * 3. Nx talks to the remote cache through a relay on 127.0.0.1 that this guard runs for the command's lifetime, so Nx
 *    only ever sees answers it accepts (GET 200/404, PUT 200/403/409) and a cache fault costs a miss, not a rerun:
 *    - an entry over the edge request body limit (100 MB on workers.dev; the edge answers 413 or resets the upload
 *      before the Worker runs) is written through the Worker's multipart routes in 64 MiB parts instead, at most 8
 *      parts in flight;
 *    - after the first PUT refused with 403 (a read token, as on pull requests) no further entry is uploaded;
 *    - an unreachable server, a timeout or an unexpected status is a GET miss or a refused PUT. An upload's timeout
 *      grows with its size (300 s plus 1 s per MiB), so a slow runner is not cut off mid-entry;
 *    - idle connections from Nx are never closed by the relay: Nx's client pools them for 90 s and a request written
 *      as Node's default 5 s keep-alive timer closed the socket failed the command ("Failed to send request").
 *    The rerun in 2 stays as the fallback if the relay itself fails. A nested Nx call reuses its parent's relay.
 *    At exit the relay prints a tally line and a timing line (requests, bytes, seconds and the slowest entries).
 *
 * 4. Writes go behind once one has been accepted. Nx 22.7.12 waits for each PUT before it starts its next task, so a
 *    large entry stalled a `--parallel=1` lane for 45-100 s. The first write, and every write until one is answered
 *    200 or 409, waits for the upstream, so a refused token (403) still stops uploads after one answer. After that,
 *    the relay answers 200 as soon as it holds the body and uploads it while Nx runs on: a 200 means accepted by the
 *    relay; stored, or a future miss. At most 1 GiB waits in memory (past it a write waits for its upload again), and
 *    at exit the guard waits at most 10 min for uploads still running. Entries it abandons and entries that fail
 *    after Nx was answered are counted and annotated as warnings; neither can fail the build or store a wrong entry.
 *
 * Output is piped and scanned only while the remote cache is on; otherwise Nx inherits the terminal as before.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { constants } from 'node:os';
import process from 'node:process';

type Outcome = { code: number | undefined; signal: NodeJS.Signals | undefined; matched: boolean };

const [realNx = 'nx', ...args] = process.argv.slice(2);
const cacheServer = 'NX_SELF_HOSTED_REMOTE_CACHE_SERVER';
// Nx's HttpRemoteCacheErrors (`errors.rs`), plus the cache Worker's 401 text.
const remoteCacheError =
  /Misconfigured remote cache endpoint: |Failed to send request: |Unauthorized: missing or invalid token/;
const forwarded: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const run = async (env: NodeJS.ProcessEnv, scan: boolean): Promise<Outcome> =>
  new Promise((resolve) => {
    const child = spawn(realNx, args, { env, stdio: scan ? ['inherit', 'pipe', 'pipe'] : 'inherit' });
    const relays = forwarded.map((signal) => {
      const relay = (): void => {
        child.kill(signal);
      };
      process.on(signal, relay);
      return { signal, relay };
    });
    let matched = false;
    const watch = (source: NodeJS.ReadableStream | undefined, sink: NodeJS.WriteStream): void => {
      let tail = '';
      const decoder = new TextDecoder();
      source?.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        sink.write(chunk);
        if (!matched) {
          const window = `${tail}${decoder.decode(chunk, { stream: true })}`;
          matched = remoteCacheError.test(window);
          tail = window.slice(-256);
        }
      });
    };
    if (scan) {
      watch(child.stdout ?? undefined, process.stdout);
      watch(child.stderr ?? undefined, process.stderr);
    }
    child.on('error', (error) => {
      console.error(`nx-guard: could not start ${realNx}: ${error.message}`);
      resolve({ code: 127, signal: undefined, matched: false });
    });
    child.on('close', (code, signal) => {
      for (const { signal: name, relay } of relays) {
        process.off(name, relay);
      }
      resolve({ code: code ?? undefined, signal: signal ?? undefined, matched });
    });
  });

const warn = (title: string, message: string): void => {
  console.error(`::warning title=${title}::${message}`);
};

const runOnceMoreOnSegfault = async (env: NodeJS.ProcessEnv, scan: boolean): Promise<Outcome> => {
  const first = await run(env, scan);
  if (first.signal !== 'SIGSEGV') {
    return first;
  }
  warn('Nx segfault', `Nx was killed by SIGSEGV; rerunning: nx ${args.join(' ')}`);
  return run(env, scan);
};

const mebibyte = 1024 * 1024;
const defaultLimits = {
  // Cloudflare refuses request bodies over 100 MB on the workers.dev route, so larger entries go in parts.
  singleRequestBytes: 90 * mebibyte,
  partBytes: 64 * mebibyte,
  // Parts of one entry uploading at once; enough to fill a runner's uplink without opening a socket per part.
  partsInFlight: 8,
  // The relay holds an entry in memory; past this it is not uploaded at all.
  maxEntryBytes: 2 * 1024 * mebibyte,
  // An upload's timeout is this floor plus one second per `uploadBytesPerSecond` of the entry.
  uploadFloorMilliseconds: 300_000,
  uploadBytesPerSecond: mebibyte,
  // Bodies accepted but not yet uploaded are held in memory; past this a write waits for its own upload.
  maxPendingBytes: 1024 * mebibyte,
  // After Nx exits, how long the guard keeps uploading before it abandons the rest; within every job's timeout.
  drainMilliseconds: 10 * 60 * 1000,
};
type Limits = typeof defaultLimits;

/** `nx-guard.test.ts` shrinks the limits through `NX_GUARD_TEST_LIMITS` (JSON); CI never sets it. */
const readLimits = (): Limits => {
  const limits = { ...defaultLimits };
  const raw = process.env.NX_GUARD_TEST_LIMITS;
  if (!raw) {
    return limits;
  }
  const overrides = JSON.parse(raw) as Record<string, unknown>;
  for (const name of Object.keys(limits) as Array<keyof Limits>) {
    const value = overrides[name];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      limits[name] = value;
    }
  }
  return limits;
};

/** Milliseconds an upload of `bytes` may take before it counts as a fault. */
const uploadTimeout = (limits: Limits, bytes: number): number =>
  limits.uploadFloorMilliseconds + Math.ceil((bytes / limits.uploadBytesPerSecond) * 1000);

const relayHost = '127.0.0.1';
const cachePath = /^\/v1\/cache\/[\dA-Za-z]{1,128}$/;

type Tally = Record<
  'hits' | 'misses' | 'stored' | 'multipart' | 'present' | 'oversize' | 'refused' | 'faults' | 'behind' | 'abandoned',
  number
>;

/** Requests that reached the upstream, by method: one GET per lookup, one PUT per entry (all of its parts). */
type Timing = Record<'GET' | 'PUT', { requests: number; bytes: number; milliseconds: number; slowest: Sample[] }>;
type Sample = { milliseconds: number; bytes: number };
const slowestKept = 3;

const newTiming = (): Timing => ({
  GET: { requests: 0, bytes: 0, milliseconds: 0, slowest: [] },
  PUT: { requests: 0, bytes: 0, milliseconds: 0, slowest: [] },
});

const seconds = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(2)} s`;
const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(2)} MB`;

/** One line, no hashes: `GET 3 requests, 2.00 MB, 0.12 s summed, slowest 0.10 s (2.00 MB), …; PUT …`. */
const formatTiming = (timing: Timing): string =>
  (Object.entries(timing) as Array<[keyof Timing, Timing[keyof Timing]]>)
    .filter(([, entry]) => entry.requests > 0)
    .map(
      ([method, entry]) =>
        `${method} ${entry.requests} requests, ${megabytes(entry.bytes)}, ${seconds(entry.milliseconds)} summed, slowest ${entry.slowest
          .map((sample) => `${seconds(sample.milliseconds)} (${megabytes(sample.bytes)})`)
          .join(', ')}`,
    )
    .join('; ');

const readBody = async (request: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = chunk as Uint8Array<ArrayBuffer>;
    chunks.push(bytes);
    length += bytes.byteLength;
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const bytes of chunks) {
    body.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return body;
};

const startCacheRelay = async (
  upstream: string,
  limits: Limits,
): Promise<{ url: string; tally: Tally; timing: Timing; lost: () => number; close: () => Promise<void> }> => {
  const tally: Tally = {
    hits: 0,
    misses: 0,
    stored: 0,
    multipart: 0,
    present: 0,
    oversize: 0,
    refused: 0,
    faults: 0,
    behind: 0,
    abandoned: 0,
  };
  const timing = newTiming();
  /** Adds one request that started at `started` (`performance.now()`) and moved `bytes` to the timing line. */
  const record = (method: keyof Timing, started: number, bytes: number): void => {
    const entry = timing[method];
    const milliseconds = performance.now() - started;
    entry.requests += 1;
    entry.bytes += bytes;
    entry.milliseconds += milliseconds;
    entry.slowest.push({ milliseconds, bytes });
    entry.slowest.sort((left, right) => right.milliseconds - left.milliseconds);
    entry.slowest.length = Math.min(entry.slowest.length, slowestKept);
  };
  let writesRefused = false;
  let writesAccepted = false;
  const pending = new Set<Promise<void>>();
  let pendingBytes = 0;
  // Background uploads that ended in neither 200 nor 409, although Nx was told 200.
  let lost = 0;
  const base = upstream.replace(/\/+$/, '');

  const answer = (response: ServerResponse, status: number, body?: Uint8Array<ArrayBuffer>): void => {
    response.writeHead(status, body ? { 'content-length': String(body.byteLength) } : { 'content-length': '0' });
    response.end(body);
  };

  /** `requestTimeout` is in milliseconds, or a signal shared by several requests. */
  const forward = async (
    request: IncomingMessage,
    path: string,
    { requestTimeout, ...init }: RequestInit & { requestTimeout: number | AbortSignal },
  ): Promise<Response> => {
    const headers = new Headers();
    if (request.headers.authorization) {
      headers.set('authorization', request.headers.authorization);
    }
    for (const [name, value] of new Headers(init.headers ?? {})) {
      headers.set(name, value);
    }
    const signal = typeof requestTimeout === 'number' ? AbortSignal.timeout(requestTimeout) : requestTimeout;
    return fetch(`${base}${path}`, { ...init, headers, signal });
  };

  /** Writes one entry through the Worker's multipart routes; returns the status Nx gets. */
  const putInParts = async (request: IncomingMessage, path: string, body: Uint8Array<ArrayBuffer>): Promise<number> => {
    const created = await forward(request, `${path}/multipart`, { method: 'POST', requestTimeout: 60_000 });
    if (created.status !== 200) {
      await created.arrayBuffer();
      if (created.status === 409) {
        tally.present += 1;
        return 409;
      }
      if (created.status === 403) {
        writesRefused = true;
        tally.refused += 1;
        return 403;
      }
      tally.faults += 1;
      return 403;
    }
    const { uploadId } = (await created.json()) as { uploadId?: unknown };
    if (typeof uploadId !== 'string') {
      tally.faults += 1;
      return 403;
    }
    // One deadline for every part, sized to the whole entry; the first failed part stops the rest.
    const stop = new AbortController();
    const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(uploadTimeout(limits, body.byteLength))]);
    try {
      const { partBytes } = limits;
      const count = Math.ceil(body.byteLength / partBytes);
      const parts: Array<{ partNumber: number; etag: string }> = [];
      let next = 0;
      // Each of `partsInFlight` senders takes the next unsent part when its previous one is done.
      const sendParts = async (): Promise<void> => {
        if (next >= count || signal.aborted) {
          return;
        }
        const index = next;
        next += 1;
        const reply = await forward(request, `${path}/multipart/${index + 1}`, {
          method: 'PUT',
          body: body.subarray(index * partBytes, (index + 1) * partBytes),
          headers: { 'content-type': 'application/octet-stream', 'x-upload-id': uploadId },
          requestTimeout: signal,
        });
        if (reply.status !== 200) {
          await reply.arrayBuffer();
          throw new Error(`part ${index + 1}: ${reply.status}`);
        }
        parts[index] = (await reply.json()) as { partNumber: number; etag: string };
        await sendParts();
      };
      try {
        await Promise.all(Array.from({ length: Math.min(limits.partsInFlight, count) }, sendParts));
      } catch (error) {
        stop.abort();
        throw error;
      }
      if (Object.keys(parts).length !== count) {
        throw new Error('upload deadline passed');
      }
      const done = await forward(request, `${path}/multipart/complete`, {
        method: 'POST',
        body: JSON.stringify({ uploadId, parts }),
        headers: { 'content-type': 'application/json' },
        requestTimeout: 120_000,
      });
      await done.arrayBuffer();
      if (done.status === 200) {
        tally.stored += 1;
        tally.multipart += 1;
        return 200;
      }
      if (done.status === 409) {
        tally.present += 1;
        return 409;
      }
      throw new Error(`complete: ${done.status}`);
    } catch {
      tally.faults += 1;
      try {
        const aborted = await forward(request, `${path}/multipart`, {
          method: 'DELETE',
          headers: { 'x-upload-id': uploadId },
          requestTimeout: 30_000,
        });
        await aborted.arrayBuffer();
      } catch {
        // R2 drops an incomplete upload on its own; the bucket lifecycle aborts it after a day.
      }
      return 403;
    }
  };

  const handleGet = async (request: IncomingMessage, path: string, response: ServerResponse): Promise<void> => {
    const started = performance.now();
    try {
      const reply = await forward(request, path, { method: 'GET', requestTimeout: 300_000 });
      if (reply.status === 200) {
        // Buffered, so a dropped download is a miss rather than a truncated entry.
        const body = new Uint8Array(await reply.arrayBuffer());
        tally.hits += 1;
        record('GET', started, body.byteLength);
        answer(response, 200, body);
        return;
      }
      await reply.arrayBuffer();
      record('GET', started, 0);
      if (reply.status === 404) {
        tally.misses += 1;
      } else {
        tally.faults += 1;
      }
    } catch {
      tally.faults += 1;
    }
    answer(response, 404);
  };

  /** Writes one entry upstream and keeps the tally; returns the status Nx gets for it. */
  const upload = async (request: IncomingMessage, path: string, body: Uint8Array<ArrayBuffer>): Promise<number> => {
    const started = performance.now();
    if (body.byteLength > limits.singleRequestBytes) {
      let status = 403;
      try {
        status = await putInParts(request, path, body);
      } catch {
        tally.faults += 1;
      }
      record('PUT', started, body.byteLength);
      return status;
    }
    try {
      const reply = await forward(request, path, {
        method: 'PUT',
        body,
        headers: { 'content-type': 'application/octet-stream' },
        requestTimeout: uploadTimeout(limits, body.byteLength),
      });
      record('PUT', started, body.byteLength);
      await reply.arrayBuffer();
      if (reply.status === 200) {
        tally.stored += 1;
        return 200;
      }
      if (reply.status === 409) {
        tally.present += 1;
        return 409;
      }
      if (reply.status === 403) {
        writesRefused = true;
        tally.refused += 1;
        return 403;
      }
      tally.faults += 1;
    } catch {
      record('PUT', started, body.byteLength);
      tally.faults += 1;
    }
    return 403;
  };

  const handlePut = async (request: IncomingMessage, path: string, response: ServerResponse): Promise<void> => {
    const declared = Number(request.headers['content-length'] ?? Number.NaN);
    const body = await readBody(request);
    if (writesRefused) {
      tally.refused += 1;
      answer(response, 403);
      return;
    }
    const size = Number.isNaN(declared) ? body.byteLength : Math.max(declared, body.byteLength);
    if (size > limits.maxEntryBytes) {
      tally.oversize += 1;
      answer(response, 403);
      return;
    }
    // Write-behind (header, 4): once a write has been accepted, answer at once and upload while Nx runs on.
    if (writesAccepted && pendingBytes + body.byteLength <= limits.maxPendingBytes) {
      pendingBytes += body.byteLength;
      const sendBehind = async (): Promise<void> => {
        try {
          const status = await upload(request, path, body);
          if (status !== 200 && status !== 409) {
            lost += 1;
          }
        } catch {
          lost += 1;
        } finally {
          pendingBytes -= body.byteLength;
          pending.delete(job);
        }
      };
      // `upload` always awaits before it settles, so `job` is assigned before `finally` reads it.
      const job = sendBehind();
      pending.add(job);
      tally.behind += 1;
      answer(response, 200);
      return;
    }
    const status = await upload(request, path, body);
    if (status === 200 || status === 409) {
      writesAccepted = true;
    }
    answer(response, status);
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    try {
      if (!cachePath.test(path)) {
        answer(response, 404);
      } else if (request.method === 'GET') {
        await handleGet(request, path, response);
      } else if (request.method === 'PUT') {
        await handlePut(request, path, response);
      } else {
        answer(response, 405);
      }
    } catch {
      tally.faults += 1;
      if (!response.headersSent) {
        answer(response, request.method === 'GET' ? 404 : 403);
      }
    }
  };

  const server = createServer((request, response) => {
    void handle(request, response);
  });
  // Never close an idle connection: Nx reuses pooled connections for up to 90 s, and a request written in the instant
  // the relay closes one fails the whole command. `server.close()` still closes idle sockets once Nx has exited.
  server.keepAliveTimeout = 0;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, relayHost, () => {
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${relayHost}:${port}`,
    tally,
    timing,
    lost: () => lost,
    /** Stops taking requests, then waits for background uploads, at most `drainMilliseconds`. */
    close: async () => {
      server.close();
      if (pending.size === 0) {
        return;
      }
      const started = performance.now();
      console.error(`nx-guard: remote cache: waiting for ${pending.size} background upload(s)`);
      let timer: NodeJS.Timeout | undefined;
      const expired = new Promise<'abandoned'>((resolve) => {
        timer = setTimeout(() => {
          resolve('abandoned');
        }, limits.drainMilliseconds);
      });
      const drained = async (): Promise<'drained'> => {
        await Promise.allSettled(pending);
        return 'drained';
      };
      const outcome = await Promise.race([drained(), expired]);
      clearTimeout(timer);
      if (outcome === 'abandoned') {
        tally.abandoned += pending.size;
      }
      console.error(
        `nx-guard: remote cache: background uploads ${outcome} after ${seconds(performance.now() - started)}`,
      );
    },
  };
};

const withLoopbackNoProxy = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const merged = [env.NO_PROXY, env.no_proxy, relayHost].filter(Boolean).join(',');
  return { ...env, NO_PROXY: merged, no_proxy: merged };
};

const upstream = process.env[cacheServer] ?? '';
const cacheOn = upstream !== '';
// A nested Nx call (a target that runs Nx) already points at its parent's relay.
const relay =
  cacheOn && !upstream.startsWith(`http://${relayHost}:`) ? await startCacheRelay(upstream, readLimits()) : undefined;
const cacheEnv = relay ? withLoopbackNoProxy({ ...process.env, [cacheServer]: relay.url }) : process.env;

let result = await runOnceMoreOnSegfault(cacheEnv, cacheOn);

if (cacheOn && result.code !== 0 && result.matched) {
  warn(
    'Nx remote cache unavailable',
    `nx ${args.join(' ')} failed on a remote cache error; rerunning once with the remote cache off`,
  );
  result = await runOnceMoreOnSegfault({ ...process.env, [cacheServer]: '' }, false);
}

if (relay) {
  await relay.close();
  const { tally } = relay;
  const summary = Object.entries(tally)
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');
  if (Object.values(tally).some((count) => count > 0)) {
    console.error(`nx-guard: remote cache: ${summary}`);
  }
  const timing = formatTiming(relay.timing);
  if (timing) {
    console.error(`nx-guard: remote cache timing: ${timing}`);
  }
  if (tally.faults > 0) {
    warn('Nx remote cache faults', `${tally.faults} remote cache request(s) failed and were treated as misses`);
  }
  if (relay.lost() > 0) {
    warn(
      'Nx remote cache background uploads failed',
      `${relay.lost()} entr(ies) answered 200 to Nx were not stored; each is a future miss`,
    );
  }
  if (tally.abandoned > 0) {
    warn(
      'Nx remote cache uploads abandoned',
      `${tally.abandoned} background upload(s) were still running after the drain limit; each is a future miss`,
    );
  }
}

process.exitCode = result.signal ? 128 + constants.signals[result.signal] : (result.code ?? 1);
if (relay && relay.tally.abandoned > 0) {
  // oxlint-disable-next-line unicorn/no-process-exit -- abandoned uploads hold sockets open until their own timeouts.
  process.exit();
}
