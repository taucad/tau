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
 *      before the Worker runs) is written through the Worker's multipart routes in 64 MiB parts instead;
 *    - after the first PUT refused with 403 (a read token, as on pull requests) no further entry is uploaded;
 *    - an unreachable server, a timeout or an unexpected status is a GET miss or a refused PUT.
 *    The rerun in 2 stays as the fallback if the relay itself fails. A nested Nx call reuses its parent's relay.
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

// Cloudflare refuses request bodies over 100 MB on the workers.dev route, so larger entries go in parts.
const singleRequestBytes = 90 * 1024 * 1024;
const partBytes = 64 * 1024 * 1024;
// The relay holds an entry in memory; past this it is not uploaded at all.
const maxEntryBytes = 2 * 1024 * 1024 * 1024;
const relayHost = '127.0.0.1';
const cachePath = /^\/v1\/cache\/[\dA-Za-z]{1,128}$/;

type Tally = Record<'hits' | 'misses' | 'stored' | 'multipart' | 'present' | 'oversize' | 'refused' | 'faults', number>;

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

const startCacheRelay = async (upstream: string): Promise<{ url: string; tally: Tally; close: () => void }> => {
  const tally: Tally = { hits: 0, misses: 0, stored: 0, multipart: 0, present: 0, oversize: 0, refused: 0, faults: 0 };
  let writesRefused = false;
  const base = upstream.replace(/\/+$/, '');

  const answer = (response: ServerResponse, status: number, body?: Uint8Array<ArrayBuffer>): void => {
    response.writeHead(status, body ? { 'content-length': String(body.byteLength) } : { 'content-length': '0' });
    response.end(body);
  };

  /** `requestTimeout` is in milliseconds. */
  const forward = async (
    request: IncomingMessage,
    path: string,
    { requestTimeout, ...init }: RequestInit & { requestTimeout: number },
  ): Promise<Response> => {
    const headers = new Headers();
    if (request.headers.authorization) {
      headers.set('authorization', request.headers.authorization);
    }
    for (const [name, value] of new Headers(init.headers ?? {})) {
      headers.set(name, value);
    }
    return fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(requestTimeout) });
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
    try {
      const offsets = Array.from({ length: Math.ceil(body.byteLength / partBytes) }, (_, index) => index * partBytes);
      const parts = await Promise.all(
        offsets.map(async (offset, index) => {
          const reply = await forward(request, `${path}/multipart/${index + 1}`, {
            method: 'PUT',
            body: body.subarray(offset, offset + partBytes),
            headers: { 'content-type': 'application/octet-stream', 'x-upload-id': uploadId },
            requestTimeout: 300_000,
          });
          if (reply.status !== 200) {
            throw new Error(`part ${index + 1}: ${reply.status}`);
          }
          return (await reply.json()) as { partNumber: number; etag: string };
        }),
      );
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
    try {
      const reply = await forward(request, path, { method: 'GET', requestTimeout: 300_000 });
      if (reply.status === 200) {
        // Buffered, so a dropped download is a miss rather than a truncated entry.
        const body = new Uint8Array(await reply.arrayBuffer());
        tally.hits += 1;
        answer(response, 200, body);
        return;
      }
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

  const handlePut = async (request: IncomingMessage, path: string, response: ServerResponse): Promise<void> => {
    const declared = Number(request.headers['content-length'] ?? Number.NaN);
    const body = await readBody(request);
    if (writesRefused) {
      tally.refused += 1;
      answer(response, 403);
      return;
    }
    const size = Number.isNaN(declared) ? body.byteLength : Math.max(declared, body.byteLength);
    if (size > maxEntryBytes) {
      tally.oversize += 1;
      answer(response, 403);
      return;
    }
    if (size > singleRequestBytes) {
      try {
        answer(response, await putInParts(request, path, body));
      } catch {
        tally.faults += 1;
        answer(response, 403);
      }
      return;
    }
    try {
      const reply = await forward(request, path, {
        method: 'PUT',
        body,
        headers: { 'content-type': 'application/octet-stream' },
        requestTimeout: 300_000,
      });
      await reply.arrayBuffer();
      if (reply.status === 200) {
        tally.stored += 1;
        answer(response, 200);
        return;
      }
      if (reply.status === 409) {
        tally.present += 1;
        answer(response, 409);
        return;
      }
      if (reply.status === 403) {
        writesRefused = true;
        tally.refused += 1;
        answer(response, 403);
        return;
      }
      tally.faults += 1;
    } catch {
      tally.faults += 1;
    }
    answer(response, 403);
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
    close: () => {
      server.close();
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
const relay = cacheOn && !upstream.startsWith(`http://${relayHost}:`) ? await startCacheRelay(upstream) : undefined;
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
  relay.close();
  const { tally } = relay;
  const summary = Object.entries(tally)
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');
  if (Object.values(tally).some((count) => count > 0)) {
    console.error(`nx-guard: remote cache: ${summary}`);
  }
  if (tally.faults > 0) {
    warn('Nx remote cache faults', `${tally.faults} remote cache request(s) failed and were treated as misses`);
  }
}

process.exitCode = result.signal ? 128 + constants.signals[result.signal] : (result.code ?? 1);
