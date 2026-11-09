/**
 * Tests for `nx-guard.ts`, run with `node --test` (`pnpm nx run scripts:validate-nx-guard`).
 *
 * Each test starts a fake cache Worker on `localhost` (not 127.0.0.1, which the guard takes for a parent's relay) in this process and runs the real guard as a child process in
 * front of a fake `nx`: a script that sends the requests of a JSON plan to `NX_SELF_HOSTED_REMOTE_CACHE_SERVER` (the
 * relay) the way Nx's client does, over one keep-alive connection, and prints what it got. `NX_GUARD_TEST_LIMITS`
 * shrinks the guard's sizes and timeouts so that multipart, timeouts and the drain run in milliseconds.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';

const guard = join(import.meta.dirname, 'nx-guard.ts');
const writeToken = 'write-token';
const readToken = 'read-token';

type Step =
  | { put: string; bytes: number }
  | { get: string }
  | { sleep: number }
  | { exit: number }
  | { failIfCache: string };
type Result = { status: number; milliseconds: number; port: number; bytes: number };
type Run = { server: string; results: Result[] };

const fakeNxSource = `#!${process.execPath}
import { Agent, request } from 'node:http';
const plan = JSON.parse(process.argv[2]);
const server = process.env.NX_SELF_HOSTED_REMOTE_CACHE_SERVER ?? '';
const token = process.env.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN ?? '';
const agent = new Agent({ keepAlive: true, maxSockets: 1 });
const results = [];
const send = (method, hash, body) =>
  new Promise((resolve, reject) => {
    const started = performance.now();
    const headers = { authorization: 'Bearer ' + token, 'content-length': String(body?.byteLength ?? 0) };
    const outgoing = request(server + '/v1/cache/' + hash, { method, agent, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        resolve({
          status: response.statusCode,
          milliseconds: performance.now() - started,
          port: outgoing.socket.localPort,
          bytes: bytes.byteLength,
          valid: bytes.every((byte, index) => byte === index % 251),
        });
      });
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
console.log('FAKE-NX-START ' + JSON.stringify({ server }));
for (const step of plan) {
  if ('failIfCache' in step && server) {
    console.error(step.failIfCache);
    process.exit(1);
  } else if ('exit' in step) {
    process.exit(step.exit);
  } else if ('sleep' in step) {
    await new Promise((resolve) => setTimeout(resolve, step.sleep));
  } else if ('put' in step) {
    results.push(await send('PUT', step.put, Uint8Array.from({ length: step.bytes }, (_, index) => index % 251)));
  } else if ('get' in step) {
    results.push(await send('GET', step.get));
  }
}
agent.destroy();
console.log('FAKE-NX ' + JSON.stringify({ server, results }));
`;

const scratch = mkdtempSync(join(tmpdir(), 'nx-guard-test-'));
const fakeNx = join(scratch, 'fake-nx.mjs');
writeFileSync(fakeNx, fakeNxSource);
chmodSync(fakeNx, 0o755);
after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const concat = (chunks: Array<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
};

type Upstream = {
  url: string;
  store: Map<string, Uint8Array<ArrayBuffer>>;
  counts: {
    gets: number;
    puts: number;
    parts: number;
    partsInFlight: number;
    maxPartsInFlight: number;
    aborts: number;
  };
  close: () => Promise<void>;
};
type UpstreamOptions = {
  /** Milliseconds a PUT or a part waits before it is answered, by hash. */
  putDelayMilliseconds?: (hash: string) => number;
  /** A status to answer instead of the normal one. */
  override?: (method: string, path: string) => number | undefined;
};

const readAll = async (request: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of request) {
    chunks.push(chunk as Uint8Array<ArrayBuffer>);
  }
  return concat(chunks);
};

type Exchange = {
  method: string;
  hash: string;
  part: string | undefined;
  body: Uint8Array<ArrayBuffer>;
  reply: (status: number, payload?: Uint8Array<ArrayBuffer> | Record<string, unknown>) => void;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A cache Worker with the routes of tau-cloud `tau-ci-cache`: GET/PUT an entry, and the multipart routes. */
const startUpstream = async (options: UpstreamOptions = {}): Promise<Upstream> => {
  const store = new Map<string, Uint8Array<ArrayBuffer>>();
  const uploads = new Map<string, Map<number, Uint8Array<ArrayBuffer>>>();
  const counts = { gets: 0, puts: 0, parts: 0, partsInFlight: 0, maxPartsInFlight: 0, aborts: 0 };
  const wait = async (hash: string): Promise<void> =>
    new Promise((resolve) => {
      // Unreferenced, so an upload the guard abandoned does not keep this process alive.
      setTimeout(resolve, options.putDelayMilliseconds?.(hash) ?? 0).unref();
    });
  const putEntry = async ({ hash, body, reply }: Exchange): Promise<void> => {
    counts.puts += 1;
    await wait(hash);
    if (store.has(hash)) {
      reply(409);
      return;
    }
    store.set(hash, body);
    reply(200);
  };
  const putPart = async ({ hash, part, body, reply }: Exchange): Promise<void> => {
    counts.parts += 1;
    counts.partsInFlight += 1;
    counts.maxPartsInFlight = Math.max(counts.maxPartsInFlight, counts.partsInFlight);
    await wait(hash);
    counts.partsInFlight -= 1;
    uploads.get(hash)?.set(Number(part), body);
    reply(200, { partNumber: Number(part), etag: `etag-${part}` });
  };
  const complete = ({ hash, body, reply }: Exchange): void => {
    const { parts } = JSON.parse(decoder.decode(body)) as { parts: Array<{ partNumber: number }> };
    const received = uploads.get(hash);
    store.set(hash, concat(parts.map(({ partNumber }) => received?.get(partNumber) ?? new Uint8Array())));
    reply(200);
  };
  /** Write routes by `<method> <route>`, where the route is `entry`, `multipart`, `part` or `complete`. */
  const writes: Partial<Record<string, (exchange: Exchange) => Promise<void> | void>> = {
    'PUT entry': putEntry,
    'POST multipart': ({ hash, reply }) => {
      uploads.set(hash, new Map());
      reply(200, { uploadId: `upload-${hash}` });
    },
    'PUT part': putPart,
    'POST complete': complete,
    'DELETE multipart': ({ hash, reply }) => {
      counts.aborts += 1;
      uploads.delete(hash);
      reply(204);
    },
  };
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readAll(request);
    const method = request.method ?? '';
    const path = request.url ?? '';
    const reply = (status: number, payload?: Uint8Array<ArrayBuffer> | Record<string, unknown>): void => {
      const bytes = payload instanceof Uint8Array ? payload : encoder.encode(payload ? JSON.stringify(payload) : '');
      response.writeHead(status, { 'content-length': String(bytes.byteLength) });
      response.end(bytes);
    };
    const [, hash = '', multipart, part] = /^\/v1\/cache\/(\w+)(?:\/(multipart)(?:\/(\w+))?)?$/.exec(path) ?? [];
    const overridden = options.override?.(method, path);
    const authorization = request.headers.authorization ?? '';
    if (overridden !== undefined) {
      reply(overridden);
    } else if (authorization !== `Bearer ${writeToken}` && authorization !== `Bearer ${readToken}`) {
      reply(401);
    } else if (method === 'GET' && !multipart) {
      counts.gets += 1;
      const entry = store.get(hash);
      reply(entry ? 200 : 404, entry);
    } else if (authorization === `Bearer ${writeToken}`) {
      const route = multipart ? (part === 'complete' ? 'complete' : part ? 'part' : 'multipart') : 'entry';
      const write = writes[`${method} ${route}`];
      if (write) {
        await write({ method, hash, part, body, reply });
      } else {
        reply(405);
      }
    } else {
      counts.puts += 1;
      reply(403);
    }
  };
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, 'localhost', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    store,
    counts,
    close: async () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};

type GuardRun = {
  code: number | undefined;
  milliseconds: number;
  stderr: string;
  starts: string[];
  runs: Run[];
  tally: Record<string, number>;
  timing: string | undefined;
};

const runGuard = async ({
  server,
  plan,
  token = writeToken,
  limits = {},
}: {
  server: string;
  plan: Step[];
  token?: string;
  limits?: Record<string, number>;
}): Promise<GuardRun> => {
  const started = performance.now();
  const env = {
    PATH: process.env.PATH ?? '',
    NO_PROXY: '127.0.0.1,localhost',
    NX_SELF_HOSTED_REMOTE_CACHE_SERVER: server,
    NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN: token,
    NX_GUARD_TEST_LIMITS: JSON.stringify(limits),
  };
  const child = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', guard, fakeNx, JSON.stringify(plan)],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number | undefined>((resolve) => {
    child.on('close', (status) => {
      resolve(status ?? undefined);
    });
  });
  const lines = stdout.split('\n');
  const tallyLine = /^nx-guard: remote cache: (\d+ hits, .*)$/m.exec(stderr)?.[1] ?? '';
  return {
    code,
    milliseconds: performance.now() - started,
    stderr,
    starts: lines
      .filter((line) => line.startsWith('FAKE-NX-START '))
      .map((line) => (JSON.parse(line.slice('FAKE-NX-START '.length)) as { server: string }).server),
    runs: lines
      .filter((line) => line.startsWith('FAKE-NX '))
      .map((line) => JSON.parse(line.slice('FAKE-NX '.length)) as Run),
    tally: Object.fromEntries(
      [...tallyLine.matchAll(/(\d+) (\w+)/g)].map(([, count = '0', name = '']) => [name, Number(count)]),
    ),
    timing: /^nx-guard: remote cache timing: (.*)$/m.exec(stderr)?.[1],
  };
};

const statuses = (run: GuardRun): number[] => run.runs[0]?.results.map((result) => result.status) ?? [];

void test('should store an entry through the relay, read it back and print the tally and timing lines', async () => {
  const upstream = await startUpstream();
  try {
    const run = await runGuard({
      server: upstream.url,
      plan: [{ put: 'a1', bytes: 20_000 }, { get: 'a1' }, { get: 'b2' }],
    });
    assert.equal(run.code, 0);
    assert.deepEqual(statuses(run), [200, 200, 404]);
    assert.equal(run.runs[0]?.results[1]?.bytes, 20_000);
    assert.equal(upstream.store.get('a1')?.byteLength, 20_000);
    assert.equal(run.starts[0]?.startsWith('http://127.0.0.1:'), true);
    assert.notEqual(run.starts[0], upstream.url);
    assert.deepEqual(run.tally, {
      hits: 1,
      misses: 1,
      stored: 1,
      multipart: 0,
      present: 0,
      oversize: 0,
      refused: 0,
      faults: 0,
      behind: 0,
      abandoned: 0,
    });
    assert.match(
      run.timing ?? '',
      /^GET 2 requests, 0\.02 MB, \d+\.\d\d s summed, slowest \d+\.\d\d s \(0\.0[02] MB\), \d+\.\d\d s \(0\.0[02] MB\); PUT 1 requests, 0\.02 MB, \d+\.\d\d s summed, slowest \d+\.\d\d s \(0\.02 MB\)$/,
    );
    assert.doesNotMatch(run.stderr, /a1|b2|::warning/);
  } finally {
    await upstream.close();
  }
});

void test('should answer 409 for an entry already stored, and count it as an accepted write', async () => {
  const upstream = await startUpstream();
  upstream.store.set('a1', new Uint8Array(10));
  try {
    const run = await runGuard({
      server: upstream.url,
      plan: [
        { put: 'a1', bytes: 10 },
        { put: 'b2', bytes: 10 },
      ],
    });
    assert.deepEqual(statuses(run), [409, 200]);
    assert.equal(run.tally.present, 1);
    assert.equal(run.tally.behind, 1);
    assert.equal(upstream.store.get('b2')?.byteLength, 10);
  } finally {
    await upstream.close();
  }
});

void test('should turn upstream errors into a miss and a refused write, and warn', async () => {
  const upstream = await startUpstream({ override: () => 500 });
  try {
    const run = await runGuard({ server: upstream.url, plan: [{ put: 'a1', bytes: 10 }, { get: 'a1' }] });
    assert.equal(run.code, 0);
    assert.deepEqual(statuses(run), [403, 404]);
    assert.equal(run.tally.faults, 2);
    assert.match(run.stderr, /::warning title=Nx remote cache faults::2 remote cache request\(s\) failed/);
    assert.equal(run.starts.length, 1);
  } finally {
    await upstream.close();
  }
});

void test('should treat an unreachable upstream as faults, not a failed command', async () => {
  const upstream = await startUpstream();
  await upstream.close();
  const run = await runGuard({ server: upstream.url, plan: [{ put: 'a1', bytes: 10 }, { get: 'a1' }] });
  assert.equal(run.code, 0);
  assert.deepEqual(statuses(run), [403, 404]);
  assert.equal(run.tally.faults, 2);
});

void test('should stop uploading after the first refused write', async () => {
  const upstream = await startUpstream();
  try {
    const run = await runGuard({
      server: upstream.url,
      token: readToken,
      plan: [
        { put: 'a1', bytes: 10 },
        { put: 'b2', bytes: 10 },
        { put: 'c3', bytes: 10 },
      ],
    });
    assert.deepEqual(statuses(run), [403, 403, 403]);
    assert.equal(upstream.counts.puts, 1);
    assert.equal(run.tally.refused, 3);
    assert.equal(run.tally.faults, 0);
    assert.equal(run.tally.behind, 0);
  } finally {
    await upstream.close();
  }
});

void test('should refuse an entry over the size cap without sending it', async () => {
  const upstream = await startUpstream();
  try {
    const run = await runGuard({
      server: upstream.url,
      limits: { maxEntryBytes: 100 },
      plan: [{ put: 'a1', bytes: 101 }],
    });
    assert.deepEqual(statuses(run), [403]);
    assert.equal(upstream.counts.puts, 0);
    assert.equal(run.tally.oversize, 1);
  } finally {
    await upstream.close();
  }
});

void test('should write a large entry in parts with at most the cap in flight', async () => {
  const upstream = await startUpstream({ putDelayMilliseconds: () => 50 });
  try {
    const run = await runGuard({
      server: upstream.url,
      limits: { singleRequestBytes: 1000, partBytes: 100, partsInFlight: 3 },
      plan: [{ put: 'a1', bytes: 1050 }, { get: 'a1' }],
    });
    assert.deepEqual(statuses(run), [200, 200]);
    assert.equal(upstream.counts.puts, 0);
    assert.equal(upstream.counts.parts, 11);
    assert.equal(upstream.counts.maxPartsInFlight, 3);
    const stored = upstream.store.get('a1') ?? new Uint8Array();
    assert.equal(stored.byteLength, 1050);
    assert.equal(
      stored.every((byte, index) => byte === index % 251),
      true,
    );
    assert.equal(run.tally.stored, 1);
    assert.equal(run.tally.multipart, 1);
  } finally {
    await upstream.close();
  }
});

void test('should abort a multipart upload when a part fails', async () => {
  const upstream = await startUpstream({
    override: (method, path) => (method === 'PUT' && path.endsWith('/multipart/4') ? 500 : undefined),
  });
  try {
    const run = await runGuard({
      server: upstream.url,
      limits: { singleRequestBytes: 1000, partBytes: 100, partsInFlight: 2 },
      plan: [{ put: 'a1', bytes: 1050 }],
    });
    assert.deepEqual(statuses(run), [403]);
    assert.equal(upstream.store.has('a1'), false);
    assert.equal(upstream.counts.aborts, 1);
    assert.ok(upstream.counts.parts < 11, `${upstream.counts.parts} parts sent after a failed part`);
    assert.equal(run.tally.faults, 1);
  } finally {
    await upstream.close();
  }
});

void test('should give an upload a timeout that grows with its size', async () => {
  // Floor 300 ms plus 1 ms per byte: 100 bytes may take 400 ms, 2000 bytes 2300 ms; the upstream takes 1000 ms.
  const upstream = await startUpstream({ putDelayMilliseconds: () => 1000 });
  try {
    const run = await runGuard({
      server: upstream.url,
      limits: { uploadFloorMilliseconds: 300, uploadBytesPerSecond: 1000 },
      plan: [
        { put: 'a1', bytes: 100 },
        { put: 'b2', bytes: 2000 },
      ],
    });
    assert.deepEqual(statuses(run), [403, 200]);
    assert.equal(run.tally.faults, 1);
    assert.equal(run.tally.stored, 1);
  } finally {
    await upstream.close();
  }
});

void test('should keep serving a connection that Nx left idle for 7 s', async () => {
  const upstream = await startUpstream();
  try {
    const run = await runGuard({ server: upstream.url, plan: [{ get: 'a1' }, { sleep: 7000 }, { get: 'b2' }] });
    assert.deepEqual(statuses(run), [404, 404]);
    // One local port means one pooled connection: Node's default would have closed it after 5 s.
    assert.equal(new Set(run.runs[0]?.results.map((result) => result.port)).size, 1);
  } finally {
    await upstream.close();
  }
});

void test('should rerun once with the remote cache off after a remote cache error', async () => {
  const upstream = await startUpstream();
  try {
    const run = await runGuard({
      server: upstream.url,
      plan: [{ failIfCache: ' NX   Failed to send request: error sending request for url' }],
    });
    assert.equal(run.code, 0);
    assert.equal(run.starts.length, 2);
    assert.equal(run.starts[1], '');
    assert.match(run.stderr, /::warning title=Nx remote cache unavailable::/);
  } finally {
    await upstream.close();
  }
});

void test('should pass any other failure through without a rerun', async () => {
  const upstream = await startUpstream();
  try {
    const run = await runGuard({ server: upstream.url, plan: [{ exit: 3 }] });
    assert.equal(run.code, 3);
    assert.equal(run.starts.length, 1);
    assert.doesNotMatch(run.stderr, /::warning/);
  } finally {
    await upstream.close();
  }
});

void test('should run Nx without a relay when the remote cache is off', async () => {
  const run = await runGuard({ server: '', plan: [] });
  assert.equal(run.code, 0);
  assert.deepEqual(run.starts, ['']);
  assert.doesNotMatch(run.stderr, /nx-guard:/);
});

// Write-behind (header, 4). The upstream takes 1500 ms per upload; Nx waiting for one takes at least that long.
const slowUpload = 1500;
/** How long Nx waited for each write's answer. */
const writeWaits = (run: GuardRun): number[] => run.runs[0]?.results.map((result) => result.milliseconds) ?? [];
const waited = (milliseconds: number | undefined): boolean => (milliseconds ?? 0) >= slowUpload - 100;
const answeredAtOnce = (milliseconds: number | undefined): boolean => (milliseconds ?? slowUpload) < slowUpload / 2;

void test('should answer the first write after its upload, later ones at once, and drain them at exit', async () => {
  const upstream = await startUpstream({ putDelayMilliseconds: () => slowUpload });
  try {
    const run = await runGuard({
      server: upstream.url,
      plan: [
        { put: 'a1', bytes: 10 },
        { put: 'b2', bytes: 10 },
        { put: 'c3', bytes: 10 },
      ],
    });
    assert.equal(run.code, 0);
    assert.deepEqual(statuses(run), [200, 200, 200]);
    const [first, second, third] = writeWaits(run);
    assert.ok(waited(first), `first write answered after ${first} ms`);
    assert.ok(answeredAtOnce(second), `second write answered after ${second} ms`);
    assert.ok(answeredAtOnce(third), `third write answered after ${third} ms`);
    assert.deepEqual([...upstream.store.keys()].sort(), ['a1', 'b2', 'c3']);
    assert.equal(run.tally.stored, 3);
    assert.equal(run.tally.behind, 2);
    assert.equal(run.tally.abandoned, 0);
    assert.match(run.stderr, /nx-guard: remote cache: waiting for 2 background upload\(s\)/);
    assert.match(run.stderr, /nx-guard: remote cache: background uploads drained after \d+\.\d\d s/);
    assert.doesNotMatch(run.stderr, /::warning/);
  } finally {
    await upstream.close();
  }
});

void test('should keep every write synchronous while the token is refused', async () => {
  const upstream = await startUpstream({ putDelayMilliseconds: () => slowUpload });
  try {
    const run = await runGuard({
      server: upstream.url,
      token: readToken,
      plan: [
        { put: 'a1', bytes: 10 },
        { put: 'b2', bytes: 10 },
      ],
    });
    assert.deepEqual(statuses(run), [403, 403]);
    assert.equal(run.tally.behind, 0);
    assert.equal(run.tally.refused, 2);
    assert.doesNotMatch(run.stderr, /background/);
  } finally {
    await upstream.close();
  }
});

void test('should wait for a write that would take the pending bytes over the cap', async () => {
  const upstream = await startUpstream({ putDelayMilliseconds: () => slowUpload });
  try {
    const run = await runGuard({
      server: upstream.url,
      limits: { maxPendingBytes: 1500 },
      plan: [
        { put: 'a1', bytes: 1000 },
        { put: 'b2', bytes: 1000 },
        { put: 'c3', bytes: 1000 },
      ],
    });
    assert.deepEqual(statuses(run), [200, 200, 200]);
    const [first, second, third] = writeWaits(run);
    assert.ok(waited(first), `first write answered after ${first} ms`);
    assert.ok(answeredAtOnce(second), `second write answered after ${second} ms`);
    assert.ok(waited(third), `third write, over the cap, answered after ${third} ms`);
    assert.equal(run.tally.behind, 1);
    assert.equal(run.tally.stored, 3);
  } finally {
    await upstream.close();
  }
});

void test('should latch a refusal that arrives for a background upload, and warn', async () => {
  const upstream = await startUpstream({
    override: (method, path) => (method === 'PUT' && path.endsWith('/b2') ? 403 : undefined),
  });
  try {
    const run = await runGuard({
      server: upstream.url,
      plan: [{ put: 'a1', bytes: 10 }, { put: 'b2', bytes: 10 }, { sleep: 300 }, { put: 'c3', bytes: 10 }],
    });
    assert.deepEqual(statuses(run), [200, 200, 403]);
    assert.deepEqual([...upstream.store.keys()], ['a1']);
    assert.equal(run.tally.behind, 1);
    assert.equal(run.tally.refused, 2);
    assert.match(
      run.stderr,
      /::warning title=Nx remote cache background uploads failed::1 entr\(ies\) answered 200 to Nx were not stored/,
    );
  } finally {
    await upstream.close();
  }
});

void test('should warn when a background upload faults', async () => {
  const upstream = await startUpstream({
    override: (method, path) => (method === 'PUT' && path.endsWith('/b2') ? 500 : undefined),
  });
  try {
    const run = await runGuard({
      server: upstream.url,
      plan: [
        { put: 'a1', bytes: 10 },
        { put: 'b2', bytes: 10 },
      ],
    });
    assert.equal(run.code, 0);
    assert.deepEqual(statuses(run), [200, 200]);
    assert.equal(run.tally.faults, 1);
    assert.match(run.stderr, /::warning title=Nx remote cache faults::1 /);
    assert.match(run.stderr, /::warning title=Nx remote cache background uploads failed::1 /);
  } finally {
    await upstream.close();
  }
});

void test('should abandon uploads still running at the drain limit, warn, and exit with Nx status at once', async () => {
  const upstream = await startUpstream({ putDelayMilliseconds: (hash) => (hash === 'b2' ? 60_000 : 0) });
  try {
    const run = await runGuard({
      server: upstream.url,
      limits: { drainMilliseconds: 300 },
      plan: [{ put: 'a1', bytes: 10 }, { put: 'b2', bytes: 10 }, { exit: 4 }],
    });
    assert.equal(run.code, 4);
    // The upload's own timeout is 300 s; without `process.exit()` the guard would wait for it.
    assert.ok(run.milliseconds < 10_000, `guard exited after ${run.milliseconds} ms`);
    assert.equal(run.tally.behind, 1);
    assert.equal(run.tally.abandoned, 1);
    assert.match(run.stderr, /background uploads abandoned after 0\.\d\d s/);
    assert.match(
      run.stderr,
      /::warning title=Nx remote cache uploads abandoned::1 background upload\(s\) were still running after the drain limit/,
    );
  } finally {
    await upstream.close();
  }
});
