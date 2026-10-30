/* eslint-disable @typescript-eslint/naming-convention -- CGI environment variables and HTTP header names */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `scripts/dv1-concurrency.mts` (DV1). The arithmetic and the refusal rules run as units; the harness itself runs
 * end to end with `--local` against a loopback double of the Tau API: `git http-backend` behind the API's git and
 * project routes, answering scripted refusals in the API's JSON shape. The run against staging is operator-held.
 */

type RefusalClass = 'lease' | 'owner_cap' | 'rate' | 'frozen' | 'race' | 'restart' | 'other';
type RampOp = 'fetch' | 'push' | 'mixed';
type Row = Readonly<{
  shape: string;
  size: string;
  variant?: string;
  k?: number;
  devices?: number;
  repeat?: number;
  operations: number;
  ok: number;
  failed: number;
  refusals: Record<RefusalClass, number>;
  codes: Record<string, number>;
  skipped?: string;
}>;

/** The parts of the script this test reads. */
type HarnessModule = Readonly<{
  classifyRefusal: (status: number, code: string | undefined) => RefusalClass | undefined;
  retryDelayMilliseconds: (retryAfter: string | undefined, now?: number) => number;
  assertApiOrigin: (value: string | undefined, local: boolean) => URL;
  spreadClients: (k: number, owners: number, op: RampOp) => Readonly<{ ownerOf: readonly number[]; skipped?: string }>;
  capacityOf: (
    rows: readonly Row[],
    size: string,
    op: RampOp,
  ) => Readonly<{
    capacity: number | undefined;
    firstRefusingK: number | undefined;
    reachedTop: boolean;
  }>;
  corpusStream: (size: 'small' | 'median' | 'median8m' | 'large' | 'xl') => Iterable<Uint8Array<ArrayBuffer>>;
  main: (
    argv: readonly string[],
    environment: Readonly<Record<string, unknown>>,
    print: (line: string) => void,
  ) => Promise<number>;
}>;

const scriptModule = '../../scripts/dv1-concurrency.mts';
const harness = (await import(/* @vite-ignore */ scriptModule)) as HarnessModule;

const refusals = (lease = 0): Record<RefusalClass, number> => ({
  lease,
  owner_cap: 0,
  rate: 0,
  frozen: 0,
  race: 0,
  restart: 0,
  other: 0,
});

describe('dv1 harness rules', () => {
  it('should classify each refusal by its code, and anything else at 400 or above as other', () => {
    expect(harness.classifyRefusal(200, undefined)).toBeUndefined();
    expect(harness.classifyRefusal(503, 'GIT_LEASE_OWNER_BUSY')).toBe('lease');
    expect(harness.classifyRefusal(503, 'GIT_LEASE_DISK_FULL')).toBe('lease');
    expect(harness.classifyRefusal(503, 'GIT_HYDRATE_BUDGET_EXHAUSTED')).toBe('lease');
    expect(harness.classifyRefusal(429, 'GIT_OWNER_IN_FLIGHT_LIMIT')).toBe('owner_cap');
    expect(harness.classifyRefusal(429, 'GIT_RATE_LIMITED')).toBe('rate');
    expect(harness.classifyRefusal(429, 'GIT_REPOSITORY_FROZEN')).toBe('frozen');
    expect(harness.classifyRefusal(503, 'GIT_PUSH_RACE_LOST')).toBe('race');
    expect(harness.classifyRefusal(503, 'GIT_SERVICE_RESTARTING')).toBe('restart');
    expect(harness.classifyRefusal(403, 'GIT_SYNC_NOT_ENTITLED')).toBe('other');
    expect(harness.classifyRefusal(502, undefined)).toBe('other');
  });

  it('should wait Retry-After seconds or until its date, 1 s without one, and never past 30 s', () => {
    expect(harness.retryDelayMilliseconds('3')).toBe(3000);
    expect(harness.retryDelayMilliseconds(undefined)).toBe(1000);
    expect(harness.retryDelayMilliseconds('soon')).toBe(1000);
    expect(harness.retryDelayMilliseconds('600')).toBe(30_000);
    expect(harness.retryDelayMilliseconds(new Date(10_000).toUTCString(), 8000)).toBe(2000);
  });

  it('should drive only staging, or a loopback origin under --local, and never production', () => {
    expect(harness.assertApiOrigin('https://api.taucad.dev', false).origin).toBe('https://api.taucad.dev');
    expect(() => harness.assertApiOrigin('https://api.tau.new', false)).toThrow(/Only https:\/\/api\.taucad\.dev/u);
    expect(() => harness.assertApiOrigin('https://api.tau.new', true)).toThrow(/loopback/u);
    expect(() => harness.assertApiOrigin('http://localhost:4000', false)).toThrow();
    expect(harness.assertApiOrigin('http://127.0.0.1:4000', true).port).toBe('4000');
    expect(() => harness.assertApiOrigin('https://api.taucad.dev/v1', false)).toThrow(/bare origin/u);
    expect(() => harness.assertApiOrigin(undefined, false)).toThrow(/TAU_BENCH_API/u);
  });

  it('should spread clients round-robin and refuse a step that would put an owner over its ceilings', () => {
    expect(harness.spreadClients(4, 8, 'push')).toEqual({ ownerOf: [0, 1, 2, 3] });
    expect(harness.spreadClients(32, 8, 'push').skipped).toBeUndefined();
    expect(harness.spreadClients(40, 8, 'push').skipped).toMatch(/needs more owners/u);
    /* 1 push : 4 fetch, so 72 mixed clients over 8 owners is 9 requests and 2 pushes each. */
    expect(harness.spreadClients(72, 8, 'mixed').skipped).toBeUndefined();
    expect(harness.spreadClients(80, 8, 'fetch').skipped).toMatch(/10 requests/u);
  });

  it('should read capacity as the largest K below the first lease refusal, and say when the ramp topped out', () => {
    const row = (k: number, lease: number, repeat = 0): Row => ({
      shape: 'ramp',
      size: 'small',
      variant: 'push',
      k,
      repeat,
      operations: 10,
      ok: 10,
      failed: 0,
      refusals: refusals(lease),
      codes: {},
    });
    expect(harness.capacityOf([row(1, 0), row(2, 0), row(4, 0, 0), row(4, 1, 1), row(8, 0)], 'small', 'push')).toEqual(
      expect.objectContaining({ capacity: 2, firstRefusingK: 4, reachedTop: false }),
    );
    expect(harness.capacityOf([row(1, 0), row(32, 0)], 'small', 'push')).toEqual(
      expect.objectContaining({ capacity: 32, firstRefusingK: undefined, reachedTop: true }),
    );
    expect(harness.capacityOf([row(1, 2)], 'small', 'push').capacity).toBeUndefined();
  });

  it('should generate the same corpus every time, at its stated size', () => {
    const digest = (size: 'median' | 'median8m'): Readonly<{ sha256: string; length: number }> => {
      const hash = createHash('sha256');
      let length = 0;
      for (const chunk of harness.corpusStream(size)) {
        hash.update(chunk);
        length += chunk.length;
      }
      return { sha256: hash.digest('hex'), length };
    };
    expect(digest('median')).toEqual(digest('median'));
    expect(digest('median8m')).toEqual(digest('median8m'));
    expect(digest('median8m').length).toBeGreaterThan(8 * 1024 * 1024);
    /* Streamed, so `large` and `xl` are never one buffer: count its blobs without holding them. */
    let blobs = 0;
    for (const chunk of harness.corpusStream('large')) {
      blobs += chunk.length === 256 * 1024 ? 1 : 0;
    }
    expect(blobs).toBe(2048);
  });

  it('should print a plan without network or credentials under --dry-run', async () => {
    const lines: string[] = [];
    const code = await harness.main(
      ['ramp', '--dry-run', '--owners=2', '--sizes=small', '--ops=push', '--k=1,16'],
      {},
      (line) => {
        lines.push(line);
      },
    );
    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/K=16 .*skipped: needs more owners/u);
  });
});

/* ------------------------------------------------------------------ a loopback double of the API */

const run = promisify(execFile);
const gitAvailable = await run('git', ['--version']).then(
  () => true,
  () => false,
);

type Refusal = Readonly<{ status: number; code: string }>;
type RefusalRule = (
  request: Readonly<{ owner: number; kind: string; origin: string | undefined }>,
) => Refusal | undefined;

/** Answer one request through `git http-backend`, the CGI Tau's own storage runs. */
const serveGit = async (
  { root, pathInfo }: Readonly<{ root: string; pathInfo: string }>,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> => {
  const url = new URL(incoming.url ?? '/', 'http://double.invalid');
  const environment: Record<string, string | undefined> = {
    PATH: process.env['PATH'],
    GIT_PROJECT_ROOT: root,
    GIT_HTTP_EXPORT_ALL: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.receivepack',
    GIT_CONFIG_VALUE_0: 'true',
    REQUEST_METHOD: incoming.method ?? 'GET',
    PATH_INFO: pathInfo,
    QUERY_STRING: url.search.slice(1),
    CONTENT_TYPE: incoming.headers['content-type'] ?? '',
    ...(incoming.headers['content-encoding'] === undefined
      ? {}
      : { HTTP_CONTENT_ENCODING: incoming.headers['content-encoding'] }),
    ...(incoming.headers['git-protocol'] === undefined
      ? {}
      : { GIT_PROTOCOL: String(incoming.headers['git-protocol']) }),
  };
  const child = spawn('git', ['http-backend'], {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a CGI environment is plain strings, not the API's typed env
    env: environment as unknown as NodeJS.ProcessEnv,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  child.stdin.on('error', () => undefined);
  incoming.pipe(child.stdin);
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    chunks.push(chunk);
  });
  await new Promise((resolve) => {
    child.on('close', resolve);
  });
  const output = Buffer.concat(chunks);
  const split = output.indexOf('\r\n\r\n');
  const head = output.subarray(0, split).toString('utf8').split('\r\n');
  const headers: Record<string, string> = {};
  let status = 200;
  for (const line of head) {
    const [name, ...value] = line.split(': ');
    if (name?.toLowerCase() === 'status') {
      status = Number.parseInt(value.join(': '), 10);
    } else if (name !== undefined && name !== '') {
      headers[name] = value.join(': ');
    }
  }
  outgoing.writeHead(status, headers).end(output.subarray(split + 4));
};

/** `PUT /v1/projects/<id>` creates the owner's bare repository; `DELETE` answers deleted. */
const register = async (
  { root, owner, project, method }: Readonly<{ root: string; owner: number; project: string; method?: string }>,
  outgoing: ServerResponse,
): Promise<void> => {
  if (method === 'PUT') {
    await run('git', ['init', '-q', '--bare', join(root, String(owner), `${project}.git`)]);
  }
  outgoing.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: project }));
};

const startDouble = async (
  root: string,
  keys: readonly string[],
  refuse: () => RefusalRule,
): Promise<Readonly<{ server: Server; origin: string; seen: () => readonly string[] }>> => {
  const seen: string[] = [];
  const server = createServer((incoming, outgoing) => {
    const key = incoming.headers['x-api-key'];
    const owner = typeof key === 'string' ? keys.indexOf(key) : -1;
    seen.push(`${incoming.method ?? ''} ${incoming.url ?? ''} owner=${String(owner)}`);
    if (owner < 0) {
      outgoing.writeHead(401, { 'content-type': 'application/json' }).end('{"code":"UNAUTHORIZED"}');
      return;
    }
    const url = new URL(incoming.url ?? '/', 'http://double.invalid');
    const project = /^\/v1\/projects\/(?<id>[\w-]+)$/u.exec(url.pathname)?.groups?.['id'];
    if (project !== undefined) {
      void register({ root, owner, project, method: incoming.method }, outgoing);
      return;
    }
    const git = /^\/v1\/git\/(?<rest>[\w-]+\.git\/.+)$/u.exec(url.pathname)?.groups?.['rest'];
    if (git === undefined) {
      outgoing.writeHead(404).end();
      return;
    }
    const kind = git.endsWith('/info/refs')
      ? 'info/refs'
      : git.endsWith('/git-receive-pack')
        ? 'receive-pack'
        : 'upload-pack';
    const refusal = refuse()({ owner, kind, origin: incoming.headers.origin });
    if (refusal !== undefined) {
      incoming.resume();
      outgoing
        .writeHead(refusal.status, { 'content-type': 'application/json', 'retry-after': '0' })
        .end(JSON.stringify({ code: refusal.code, message: 'scripted refusal' }));
      return;
    }
    void serveGit({ root, pathInfo: `/${String(owner)}/${git}` }, incoming, outgoing);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${String(port)}`, seen: () => [...seen] };
};

describe.runIf(gitAvailable)('dv1 harness, end to end against a loopback API double (--local)', () => {
  const keys = ['sk_dv1_owner_zero_secret', 'sk_dv1_owner_one_secret'];
  let root: string;
  let output: string;
  let double: Awaited<ReturnType<typeof startDouble>>;
  let rule: RefusalRule = () => undefined;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-dv1-double-'));
    output = await mkdtemp(join(tmpdir(), 'tau-dv1-out-'));
    double = await startDouble(root, keys, () => rule);
  });

  afterAll(async () => {
    double.server.closeAllConnections();
    await new Promise((resolve) => {
      double.server.close(resolve);
    });
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  });

  const drive = async (
    argv: readonly string[],
  ): Promise<Readonly<{ code: number; rows: readonly Row[]; printed: string }>> => {
    const lines: string[] = [];
    const code = await harness.main(
      [...argv, '--local', '--run=e2e', '--sizes=small', `--out=${output}`, '--json'],
      { PATH: process.env['PATH'], TAU_BENCH_API: double.origin, TAU_DV1_OWNER_KEYS: keys.join(',') },
      (line) => {
        lines.push(line);
      },
    );
    const printed = lines.join('\n');
    const document = JSON.parse(printed) as { rows: Row[] };
    return { code, rows: document.rows, printed };
  };

  it('should seed every owner once, and push nothing on a second seed of the same run', async () => {
    const first = await drive(['seed']);
    expect(first.code).toBe(0);
    expect(first.rows).toEqual([expect.objectContaining({ shape: 'seed', operations: 4, ok: 4, failed: 0 })]);
    const pushes = (): number => double.seen().filter((line) => line.includes('/git-receive-pack')).length;
    const before = pushes();
    const second = await drive(['seed']);
    expect(second.rows[0]).toEqual(expect.objectContaining({ operations: 2, ok: 2 }));
    expect(pushes()).toBe(before);
  }, 60_000);

  it('should count a lease refusal once, retry after Retry-After and still answer every advertisement', async () => {
    let refused = 0;
    rule = ({ kind, origin }) => {
      /* The relay asks for the JSON envelope, which is where the code is. */
      expect(origin).toBe(double.origin);
      if (kind === 'info/refs' && refused < 2) {
        refused += 1;
        return { status: 503, code: 'GIT_LEASE_OWNER_BUSY' };
      }
      return undefined;
    };
    const { code, rows } = await drive(['adverts6', '--rounds=1']);
    rule = () => undefined;
    expect(code).toBe(0);
    expect(rows).toEqual([
      expect.objectContaining({
        shape: 'adverts6',
        operations: 6,
        ok: 6,
        refusals: refusals(2),
        codes: { GIT_LEASE_OWNER_BUSY: 2 },
      }),
    ]);
  }, 60_000);

  it('should run both storm variants and file an owner-cap refusal in its own column', async () => {
    let capped = false;
    rule = ({ kind }) => {
      if (kind === 'receive-pack' && !capped) {
        capped = true;
        return { status: 429, code: 'GIT_OWNER_IN_FLIGHT_LIMIT' };
      }
      return undefined;
    };
    const { code, rows, printed } = await drive(['storm', '--devices=2', '--rounds=1']);
    rule = () => undefined;
    expect(code, printed).toBe(0);
    expect(rows.map((row) => [row.variant, row.devices, row.failed])).toEqual([
      ['push-then-fetch', 2, 0],
      ['allpush', 2, 0],
    ]);
    expect(rows.reduce((total, row) => total + row.refusals.owner_cap, 0)).toBe(1);
    expect(rows.reduce((total, row) => total + row.refusals.lease, 0)).toBe(0);
  }, 120_000);

  it('should stop the ramp at the first K with a lease refusal and report the capacity below it', async () => {
    /* K=1 runs on owner-0 alone; K=2 adds owner-1, whose first push is refused for its lease. */
    let refused = false;
    rule = ({ kind, owner }) => {
      if (kind === 'receive-pack' && owner === 1 && !refused) {
        refused = true;
        return { status: 503, code: 'GIT_LEASE_DISK_FULL' };
      }
      return undefined;
    };
    const { code, rows, printed } = await drive(['ramp', '--ops=push', '--k=1,2,4', '--step-seconds=1', '--repeats=1']);
    rule = () => undefined;
    expect(code).toBe(0);
    expect(rows.map((row) => [row.k, row.refusals.lease])).toEqual([
      [1, 0],
      [2, 1],
    ]);
    expect(JSON.parse(printed)).toMatchObject({
      capacity: [{ size: 'small', op: 'push', capacity: 1, firstRefusingK: 2, reachedTop: false }],
    });
  }, 120_000);

  it('should never print or write an owner key', async () => {
    const { printed } = await drive(['cleanup']);
    const files = await readdir(output);
    const written = await Promise.all(files.map(async (file) => readFile(join(output, file), 'utf8')));
    for (const text of [printed, ...written]) {
      for (const key of keys) {
        expect(text).not.toContain(key);
      }
    }
    expect(written.length).toBeGreaterThan(0);
  }, 60_000);
});
