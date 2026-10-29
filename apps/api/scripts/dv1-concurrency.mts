#!/usr/bin/env node
/**
 * DV1 concurrent-sync harness (STO-20, TAU-API-5): drives many owners' git traffic at the Tau Hosted Remote at
 * once and counts every refusal by class, so "no `GIT_LEASE_*` refusal below the documented capacity" is a
 * measured statement. Written for the DV1 run plan (hosted-storage 2026-10-28, "Harness work needed"). The run
 * is operator-held: its traffic comes only from a one-off Fly Machine in `syd`, never from a laptop or a CI runner.
 *
 * Commands (each a separate invocation; `--run` ties them to one set of projects):
 *   seed      register `dv1-<run>-<size>` for every owner and push its corpus once (skipped when already there)
 *   adverts6  six parallel `GET info/refs?service=git-upload-pack` for one owner's project, `--rounds` times
 *   storm     one owner, D devices on one project: `push-then-fetch` (one device pushes main, then every device
 *             clones) and `allpush` (every device pushes its own branch, then every device clones), `--rounds` times
 *   ramp      K = 1,2,4,…,32 clients looping `fetch` (a full `clone --bare`, what a fresh device open costs),
 *             `push` (one commit to the client's own branch) or `mixed` (1 push : 4 fetch) for `--step-seconds`,
 *             `--repeats` times per K; clients are spread so no owner holds more than 4 pushes or 9 requests
 *   cleanup   delete this run's `dv1-<run>-<size>` projects through the API
 *
 * Sizes, generated here from a fixed seed (W3's workload model): `small` (one commit, three files), `median`
 * (300 commits of a 60-file source tree, 4 tags, 6 chat refs, ~1.9 MiB), `median8m` (8 MiB, the observed staging
 * p50 repository), `large` (512 MiB) and `xl` (1 GiB, for the documented limit only).
 *
 * Classification. Every HTTP exchange goes through a loopback relay inside this process: git talks to the relay,
 * the relay adds the owner's credential and an `Origin` (so the API answers a refusal as JSON with its `code`
 * instead of git's text/plain line) and records status, `code` and `Retry-After` per exchange. Classes: `lease`
 * (GIT_LEASE_OWNER_BUSY, GIT_LEASE_DISK_FULL, GIT_HYDRATE_BUDGET_EXHAUSTED), `owner_cap` (GIT_OWNER_IN_FLIGHT_LIMIT),
 * `rate` (GIT_RATE_LIMITED), `frozen` (GIT_REPOSITORY_FROZEN), `race` (GIT_PUSH_RACE_LOST), `restart`
 * (GIT_SERVICE_RESTARTING) and `other`. Each refused exchange is counted once; an operation refused with 429 or
 * 503 is retried after its `Retry-After` (1 s when absent, 30 s at most), at most 4 attempts, as Tau's client.
 * Capacity per size and op is the largest K whose every repeat, and every smaller K, saw zero `lease` refusals.
 *
 * Environment (names only; values are never printed, logged, written or put on argv — git never sees them):
 *   TAU_BENCH_API        the API origin: exactly https://api.taucad.dev, or a loopback origin with `--local`
 *   TAU_DV1_OWNER_KEYS   comma-separated `sk_` API keys (or session tokens), one per test owner, each entitled to
 *                        Tau Sync; owner i is reported as `owner-<i>`, never by key or account
 *
 * Usage:
 *   node apps/api/scripts/dv1-concurrency.mts <command> [--run=<id>] [--sizes=small,median,median8m,large]
 *     [--devices=2,4,8] [--variants=push-then-fetch,allpush] [--rounds=5] [--ops=fetch,push,mixed]
 *     [--k=1,2,4,8,16,32] [--step-seconds=60] [--repeats=3] [--op-timeout=600]
 *     [--work=<dir>] [--out=<dir>] [--local] [--dry-run] [--owners=<n>] [--json]
 *   --dry-run   no network and no git: prints the plan (projects, steps, owner spread, skipped steps) and
 *               reads TAU_DV1_OWNER_KEYS only to count it (`--owners` stands in when it is unset)
 *   --local     accept a loopback API origin (a local stack or a test double) instead of staging
 * Output: a table per shape on stdout (or the document with `--json`) and `dv1-<UTC>.json` in `--out`
 * (default: the working directory). Exit codes: 0 ran (refusals are results, not failures), 1 refused to run
 * or an operation failed for a reason that is not a refusal, 2 bad arguments.
 *
 * Launch (operator go required; staging only): dispatch `.github/workflows/dv1-staging.yml`, or run the same
 * `flyctl machine run … --region syd --rm` by hand. Evidence and capacity are recorded in the private cloud
 * handbook (operate/scaling.md, reference/verification-log.md, go-live STO-20).
 */
/* oxlint-disable no-await-in-loop -- rounds, steps and retries are sequential by design */
/* eslint-disable @typescript-eslint/naming-convention -- env, HTTP header and git config names */
import { spawn } from 'node:child_process';
import { createCipheriv, createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, OutgoingHttpHeaders, Server, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// ------------------------------------------------------------------------------------------ pure parts

/** The one API this harness may drive outside `--local`. */
export const stagingOrigin = 'https://api.taucad.dev';

/** Refusal classes the DV1 record counts in their own columns. */
export const refusalClasses = ['lease', 'owner_cap', 'rate', 'frozen', 'race', 'restart', 'other'] as const;
export type RefusalClass = (typeof refusalClasses)[number];

const classByCode: Readonly<Record<string, RefusalClass>> = {
  GIT_LEASE_OWNER_BUSY: 'lease',
  GIT_LEASE_DISK_FULL: 'lease',
  GIT_HYDRATE_BUDGET_EXHAUSTED: 'lease',
  GIT_OWNER_IN_FLIGHT_LIMIT: 'owner_cap',
  GIT_RATE_LIMITED: 'rate',
  GIT_REPOSITORY_FROZEN: 'frozen',
  GIT_PUSH_RACE_LOST: 'race',
  GIT_SERVICE_RESTARTING: 'restart',
};

/**
 * The class of one HTTP answer, from its status and the API's JSON `code`.
 *
 * @param status - The HTTP status.
 * @param code - The `code` of the JSON body, when it had one.
 * @returns The refusal class, or `undefined` for an answer below 400.
 */
export const classifyRefusal = (status: number, code: string | undefined): RefusalClass | undefined => {
  if (status < 400) {
    return undefined;
  }
  return (code === undefined ? undefined : classByCode[code]) ?? 'other';
};

/** Whether an answer asks to be retried: every 429 and 503, as Tau's client treats them. */
export const isRetryable = (status: number): boolean => status === 429 || status === 503;

/** How long to wait before retrying, in milliseconds: `Retry-After` seconds or date, 1 s when absent, 30 s at most. */
export const retryDelayMilliseconds = (retryAfter: string | undefined, now = Date.now()): number => {
  const fallback = 1000;
  if (retryAfter === undefined || retryAfter.trim() === '') {
    return fallback;
  }
  const seconds = Number(retryAfter);
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
  return Number.isFinite(milliseconds) ? Math.min(30_000, Math.max(0, milliseconds)) : fallback;
};

/** Attempts per operation, the first included, as Tau's client. */
export const maximumAttempts = 4;

/**
 * Refuse any API but staging, or a loopback origin under `--local`. Production is refused either way.
 *
 * @param value - TAU_BENCH_API.
 * @param local - Whether `--local` was given.
 * @returns The API origin.
 * @throws Error When the origin is not one this harness may drive.
 */
export const assertApiOrigin = (value: string | undefined, local: boolean): URL => {
  if (value === undefined || value === '') {
    throw new Error('TAU_BENCH_API must be set (see the header of this script).');
  }
  const api = new URL(value);
  if (api.pathname !== '/' || api.search !== '' || api.username !== '' || api.password !== '') {
    throw new Error('TAU_BENCH_API must be a bare origin.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname);
  if (local ? !loopback : api.origin !== stagingOrigin) {
    throw new Error(
      local
        ? `--local accepts only a loopback origin, got ${api.origin}.`
        : `Only ${stagingOrigin} may be driven (got ${api.origin}); use --local for a loopback stack.`,
    );
  }
  return api;
};

/**
 * Parse a comma-separated list of whole numbers.
 *
 * @param flag - The flag, for the error.
 * @param value - e.g. `1,2,4`.
 * @param minimum - The smallest allowed value.
 * @returns The numbers, in order.
 */
export const parseCounts = (flag: string, value: string, minimum = 1): readonly number[] => {
  const counts = value
    .split(',')
    .filter((part) => part.trim() !== '')
    .map(Number);
  if (counts.length === 0 || counts.some((count) => !Number.isInteger(count) || count < minimum)) {
    throw new RangeError(`--${flag} must list whole numbers of at least ${String(minimum)} (got "${value}")`);
  }
  return counts;
};

export const corpusSizes = ['small', 'median', 'median8m', 'large', 'xl'] as const;
export type CorpusSize = (typeof corpusSizes)[number];
export const rampOps = ['fetch', 'push', 'mixed'] as const;
export type RampOp = (typeof rampOps)[number];
export const stormVariants = ['push-then-fetch', 'allpush'] as const;
export type StormVariant = (typeof stormVariants)[number];

const parseNames = <Name extends string>(flag: string, value: string, allowed: readonly Name[]): readonly Name[] => {
  const names = value.split(',').filter((part) => part.trim() !== '');
  const unknown = names.filter((name) => !(allowed as readonly string[]).includes(name));
  if (names.length === 0 || unknown.length > 0) {
    throw new RangeError(`--${flag} takes ${allowed.join(', ')} (got "${value}")`);
  }
  return names as Name[];
};

/** Per-owner ceilings the spread stays under: one below the API's 5 pushes and 10 requests in flight (DA6). */
export const ownerPushCeiling = 4;
export const ownerRequestCeiling = 9;

/** What client `index` of one ramp step does. */
export const clientOp = (op: RampOp, index: number): 'fetch' | 'push' =>
  op === 'mixed' ? (index % 5 === 0 ? 'push' : 'fetch') : op;

/**
 * Spread K clients over the owners round-robin and check the per-owner ceilings.
 *
 * @param k - Concurrent clients.
 * @param owners - Owners available.
 * @param op - What the clients do.
 * @returns The owner of each client, and why the step cannot run when it cannot.
 */
export const spreadClients = (
  k: number,
  owners: number,
  op: RampOp,
): Readonly<{ ownerOf: readonly number[]; skipped?: string }> => {
  const ownerOf = Array.from({ length: k }, (_, index) => index % Math.max(1, owners));
  const pushes = new Map<number, number>();
  const requests = new Map<number, number>();
  for (const [index, owner] of ownerOf.entries()) {
    requests.set(owner, (requests.get(owner) ?? 0) + 1);
    if (clientOp(op, index) === 'push') {
      pushes.set(owner, (pushes.get(owner) ?? 0) + 1);
    }
  }
  const mostPushes = Math.max(0, ...pushes.values());
  const mostRequests = Math.max(0, ...requests.values());
  if (owners < 1) {
    return { ownerOf, skipped: 'no owners' };
  }
  if (mostPushes > ownerPushCeiling || mostRequests > ownerRequestCeiling) {
    return {
      ownerOf,
      skipped: `needs more owners: ${String(mostPushes)} pushes and ${String(mostRequests)} requests on one owner (ceilings ${String(ownerPushCeiling)} and ${String(ownerRequestCeiling)})`,
    };
  }
  return { ownerOf };
};

/** The project one owner holds for one size in one run. */
export const projectIdOf = (run: string, size: CorpusSize): string => `dv1-${run}-${size}`;

/** A latency summary in milliseconds, nearest-rank so every figure is an operation that happened. */
export type LatencySummary = Readonly<{ count: number; p50: number; p95: number; max: number }>;

export const summarize = (samples: readonly number[]): LatencySummary => {
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = (percentile: number): number =>
    sorted.length === 0 ? Number.NaN : sorted[Math.ceil((percentile / 100) * sorted.length) - 1]!;
  return {
    count: sorted.length,
    p50: Math.round(rank(50)),
    p95: Math.round(rank(95)),
    max: Math.round(sorted.at(-1) ?? Number.NaN),
  };
};

/** Refusal counts, one per class, plus the raw codes seen. */
export type RefusalCounts = Record<RefusalClass, number>;
export const emptyRefusals = (): RefusalCounts =>
  Object.fromEntries(refusalClasses.map((name) => [name, 0])) as RefusalCounts;

/** One measured configuration. */
export type ResultRow = Readonly<{
  shape: 'adverts6' | 'storm' | 'ramp' | 'seed';
  size: CorpusSize;
  variant?: string;
  devices?: number;
  k?: number;
  repeat?: number;
  operations: number;
  ok: number;
  failed: number;
  refusals: RefusalCounts;
  codes: Readonly<Record<string, number>>;
  latency: LatencySummary;
  skipped?: string;
}>;

/** Capacity per size and op: the largest clean K, the first K with a lease refusal, and whether the ramp topped out. */
export type CapacityRow = Readonly<{
  size: CorpusSize;
  op: RampOp;
  capacity: number | undefined;
  firstRefusingK: number | undefined;
  reachedTop: boolean;
  highestK: number | undefined;
}>;

/**
 * Read capacity off ramp rows: the largest K whose every repeat, and every smaller K's, saw no `lease` refusal.
 *
 * @param rows - Ramp rows of one size and op.
 * @param size - The size.
 * @param op - The op.
 * @returns The capacity row; `capacity` is undefined when even the smallest K refused.
 */
export const capacityOf = (rows: readonly ResultRow[], size: CorpusSize, op: RampOp): CapacityRow => {
  const measured = rows.filter((row) => row.skipped === undefined && row.k !== undefined);
  const ks = [...new Set(measured.map((row) => row.k!))].sort((left, right) => left - right);
  let capacity: number | undefined;
  let firstRefusingK: number | undefined;
  for (const k of ks) {
    if (measured.some((row) => row.k === k && row.refusals.lease > 0)) {
      firstRefusingK = k;
      break;
    }
    capacity = k;
  }
  return {
    size,
    op,
    capacity,
    firstRefusingK,
    reachedTop: firstRefusingK === undefined && ks.length > 0,
    highestK: ks.at(-1),
  };
};

/** Deterministic incompressible bytes for the generated corpora: AES-256-CTR keystream keyed by the seed. */
const seededBytes = (seed: string, length: number): Uint8Array<ArrayBuffer> => {
  const key = createHash('sha256').update(seed).digest();
  const cipher = createCipheriv('aes-256-ctr', key, new Uint8Array(16));
  return Buffer.concat([cipher.update(new Uint8Array(length)), cipher.final()]);
};

const corpusWhen = 1_792_713_600; // 2026-10-23T00:00:00Z, as W3's corpus, so oids are reproducible

/** A seeded uniform [0, 1) source read off the same keystream: the same project every run. */
const seededRandom = (seed: string): (() => number) => {
  const pool = 65_536;
  let block = 0;
  let bytes = seededBytes(`${seed}:0`, pool);
  let offset = 0;
  return () => {
    if (offset + 4 > pool) {
      block += 1;
      bytes = seededBytes(`${seed}:${String(block)}`, pool);
      offset = 0;
    }
    const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    offset += 4;
    return value / 4_294_967_296;
  };
};

const sourceWords = (
  'const width height depth radius fillet chamfer sketch extrude revolve union difference intersection translate ' +
  'rotate mirror shell loft sweep param export import model part assembly bolt nut washer bracket plate hole ' +
  'pattern offset tolerance clearance'
).split(' ');

/**
 * The `git fast-import` stream of one corpus, chunk by chunk, so a 1 GiB corpus is never held in memory.
 *
 * The shapes are W3's workload model (hosted-storage W3 `corpus.py`): `small` is one commit of three files;
 * `median` 300 commits of a 60-file CAD source tree editing 1–4 files each, with 4 tags and 6 chat refs
 * (~1.9 MiB); `median8m` 32 incompressible 256 KiB files over 4 commits (the observed staging p50 repository);
 * `large` 2,048 such files over 4 commits (512 MiB) and `xl` 4,096 over 8 (1 GiB, the documented limit).
 *
 * @param size - The corpus.
 * @yields The stream's chunks, `done` last.
 */
export function* corpusStream(size: CorpusSize): Generator<Uint8Array<ArrayBuffer>> {
  const blob = (mark: number, data: Uint8Array<ArrayBuffer>): ReadonlyArray<Uint8Array<ArrayBuffer>> => [
    Buffer.from(`blob\nmark :${String(mark)}\ndata ${String(data.length)}\n`),
    data,
    Buffer.from('\n'),
  ];
  const commit = ({
    mark,
    parent,
    message,
    files,
    when,
  }: Readonly<{
    mark: number;
    parent: number | undefined;
    message: string;
    files: ReadonlyArray<readonly [string, number]>;
    when: number;
  }>): Uint8Array<ArrayBuffer> => {
    const lines = [
      'commit refs/heads/main',
      `mark :${String(mark)}`,
      `author DV1 Bench <dv1@bench.invalid> ${String(when)} +0000`,
      `committer DV1 Bench <dv1@bench.invalid> ${String(when)} +0000`,
      `data ${String(Buffer.byteLength(message))}`,
      message,
      ...(parent === undefined ? [] : [`from :${String(parent)}`]),
      ...files.map(([path, blobMark]) => `M 100644 :${String(blobMark)} ${path}`),
      '',
    ];
    return Buffer.from(`${lines.join('\n')}\n`);
  };
  if (size === 'small') {
    yield* blob(1, Buffer.from('export const width = 10;\nexport default () => box(width, width, width);\n'));
    yield* blob(2, Buffer.from('# Cube\n\nA one-revision Tau project.\n'));
    yield* blob(3, Buffer.from('{"name":"cube","kernel":"replicad"}\n'));
    yield commit({
      mark: 4,
      parent: undefined,
      message: 'Initial revision',
      files: [
        ['main.ts', 1],
        ['README.md', 2],
        ['.tau/project.json', 3],
      ],
      when: corpusWhen,
    });
  } else if (size === 'median') {
    const random = seededRandom('median:20261023');
    const between = (low: number, high: number): number => low + Math.floor(random() * (high - low + 1));
    const sourceLines = (count: number): string[] =>
      Array.from({ length: count }, (_, line) => {
        const words = Array.from({ length: between(3, 9) }, () => sourceWords[between(0, sourceWords.length - 1)]);
        return `export const ${sourceWords[between(0, sourceWords.length - 1)]!}${String(line)} = ${String(between(0, 9999))}; // ${words.join(' ')}\n`;
      });
    const paths = Array.from({ length: 60 }, (_, file) => `src/part${String(file).padStart(2, '0')}.ts`);
    const contents = new Map<string, string[]>();
    let mark = 1;
    const tree = new Map<string, number>();
    for (const path of paths) {
      const lines = sourceLines(between(40, 160));
      contents.set(path, lines);
      yield* blob(mark, Buffer.from(lines.join('')));
      tree.set(path, mark);
      mark += 1;
    }
    yield commit({
      mark,
      parent: undefined,
      message: 'Initial project',
      files: [...tree.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
      when: corpusWhen,
    });
    let parent = mark;
    mark += 1;
    for (let turn = 1; turn < 300; turn += 1) {
      const changed: Array<readonly [string, number]> = [];
      const chosen = new Set<string>();
      const picks = between(1, 4);
      while (chosen.size < picks) {
        chosen.add(paths[between(0, paths.length - 1)]!);
      }
      for (const path of chosen) {
        const lines = contents.get(path)!;
        for (let edit = between(1, 6); edit > 0; edit -= 1) {
          lines[between(0, lines.length - 1)] = sourceLines(1)[0]!;
        }
        if (random() < 0.3) {
          lines.push(...sourceLines(between(1, 8)));
        }
        yield* blob(mark, Buffer.from(lines.join('')));
        changed.push([path, mark]);
        mark += 1;
      }
      const when = corpusWhen + turn * 60;
      yield commit({ mark, parent, message: `Agent turn ${String(turn)}`, files: changed, when });
      parent = mark;
      mark += 1;
      if ([75, 150, 225, 299].includes(turn)) {
        const message = `release v${String(turn)}`;
        yield Buffer.from(
          `tag v${String(turn)}\nfrom :${String(parent)}\ntagger DV1 Bench <dv1@bench.invalid> ${String(when)} +0000\ndata ${String(message.length)}\n${message}\n`,
        );
      }
      if ([50, 100, 150, 200, 250, 299].includes(turn)) {
        yield Buffer.from(`reset refs/tau/chats/chat-${String(turn).padStart(3, '0')}\nfrom :${String(parent)}\n\n`);
      }
    }
  } else {
    const [files, commits] = size === 'median8m' ? [32, 4] : size === 'large' ? [2048, 4] : [4096, 8];
    let mark = 1;
    let parent: number | undefined;
    for (let round = 0; round < commits; round += 1) {
      const changed: Array<readonly [string, number]> = [];
      for (let file = 0; file < files / commits; file += 1) {
        yield* blob(mark, seededBytes(`${size}:${String(round)}:${String(file)}`, 256 * 1024));
        changed.push([`assets/c${String(round)}/mesh${String(file).padStart(4, '0')}.bin`, mark]);
        mark += 1;
      }
      yield commit({
        mark,
        parent,
        message: `Bulk import ${String(round)}`,
        files: changed,
        when: corpusWhen + round * 60,
      });
      parent = mark;
      mark += 1;
    }
  }
  yield Buffer.from('done\n');
}

// ------------------------------------------------------------------------------------------ the relay

/** One HTTP exchange the relay saw. */
type Exchange = Readonly<{
  kind: string;
  status: number;
  code: string | undefined;
  retryAfter: string | undefined;
  milliseconds: number;
}>;

type Relay = Readonly<{
  /** A git remote URL for this attempt, routed through the relay as `owner`. */
  urlFor: (token: string, owner: number, projectId: string) => string;
  exchanges: (token: string) => readonly Exchange[];
  close: () => Promise<void>;
}>;

const kindOf = (path: string): string =>
  path.endsWith('/info/refs')
    ? 'info/refs'
    : path.endsWith('/git-upload-pack')
      ? 'upload-pack'
      : path.endsWith('/git-receive-pack')
        ? 'receive-pack'
        : 'other';

/** The headers that identify a caller to the API: an `sk_` key as `x-api-key`, anything else as a bearer. */
const credentialHeaders = (credential: string): Readonly<Record<string, string>> =>
  credential.startsWith('sk_') ? { 'x-api-key': credential } : { authorization: `Bearer ${credential}` };

const hopHeaders = new Set([
  'host',
  'authorization',
  'x-api-key',
  'cookie',
  'connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'origin',
]);

/**
 * Start the loopback relay git talks to. Path `/<token>/<owner>/<rest>` is forwarded to `<api>/<rest>` with the
 * owner's credential and the API's own `Origin`; everything it answers is streamed back unchanged.
 */
const startRelay = async (api: URL, credentials: readonly string[]): Promise<Relay> => {
  const seen = new Map<string, Exchange[]>();
  const record = (token: string, exchange: Exchange): void => {
    seen.set(token, [...(seen.get(token) ?? []), exchange]);
  };
  const send = api.protocol === 'https:' ? httpsRequest : httpRequest;
  const server: Server = createServer((incoming: IncomingMessage, outgoing: ServerResponse) => {
    const match = /^\/(?<token>[\w-]+)\/(?<owner>\d+)(?<rest>\/.*)$/u.exec(incoming.url ?? '');
    const credential = match?.groups === undefined ? undefined : credentials[Number(match.groups['owner'])];
    if (match?.groups === undefined || credential === undefined) {
      outgoing.writeHead(404).end();
      return;
    }
    const { token = '', rest = '/' } = match.groups;
    const startedAt = performance.now();
    const headers: OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (!hopHeaders.has(name) && value !== undefined) {
        headers[name] = value;
      }
    }
    Object.assign(headers, credentialHeaders(credential), { origin: api.origin });
    const target = new URL(rest, api);
    const kind = kindOf(target.pathname);
    const upstream = send(target, { method: incoming.method, headers }, (answer) => {
      const status = answer.statusCode ?? 502;
      const retryAfter = typeof answer.headers['retry-after'] === 'string' ? answer.headers['retry-after'] : undefined;
      const forward = { ...answer.headers };
      delete forward['set-cookie'];
      if (status < 400) {
        record(token, { kind, status, code: undefined, retryAfter, milliseconds: performance.now() - startedAt });
        outgoing.writeHead(status, forward);
        answer.pipe(outgoing);
        return;
      }
      /* A refusal is small: read it whole for its `code`, then hand git the same bytes. */
      const body: Array<Uint8Array<ArrayBuffer>> = [];
      let length = 0;
      answer.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        if (length < 65_536) {
          body.push(chunk);
          length += chunk.length;
        }
      });
      answer.on('end', () => {
        const bytes = Buffer.concat(body);
        let code: string | undefined;
        try {
          const parsed = JSON.parse(bytes.toString('utf8')) as { code?: unknown };
          code = typeof parsed.code === 'string' ? parsed.code : undefined;
        } catch {
          code = undefined;
        }
        record(token, { kind, status, code, retryAfter, milliseconds: performance.now() - startedAt });
        delete forward['content-length'];
        delete forward['transfer-encoding'];
        outgoing.writeHead(status, forward).end(bytes);
      });
    });
    upstream.on('error', () => {
      record(token, {
        kind,
        status: 599,
        code: 'NETWORK',
        retryAfter: undefined,
        milliseconds: performance.now() - startedAt,
      });
      if (!outgoing.headersSent) {
        outgoing.writeHead(502);
      }
      outgoing.end();
    });
    incoming.on('error', () => {
      upstream.destroy();
    });
    incoming.pipe(upstream);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    urlFor: (token, owner, projectId) =>
      `http://127.0.0.1:${String(port)}/${token}/${String(owner)}/v1/git/${projectId}.git`,
    exchanges: (token) => seen.get(token) ?? [],
    close: async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};

// ------------------------------------------------------------------------------------------ the run

type Options = Readonly<{
  command: string;
  run: string;
  sizes: readonly CorpusSize[];
  devices: readonly number[];
  variants: readonly StormVariant[];
  rounds: number;
  ops: readonly RampOp[];
  ks: readonly number[];
  stepSeconds: number;
  repeats: number;
  opTimeoutMilliseconds: number;
  work: string | undefined;
  out: string;
  local: boolean;
  dryRun: boolean;
  owners: number | undefined;
  json: boolean;
}>;

export const commands = ['seed', 'adverts6', 'storm', 'ramp', 'cleanup'] as const;

/**
 * Parse argv into options.
 *
 * @param argv - The arguments after the script.
 * @returns The options.
 * @throws RangeError For an unknown command or a bad flag.
 */
export const parseOptions = (argv: readonly string[]): Options => {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      run: { type: 'string', default: new Date().toISOString().slice(0, 10).replaceAll('-', '') },
      sizes: { type: 'string', default: 'small,median,median8m' },
      devices: { type: 'string', default: '2,4,8' },
      variants: { type: 'string', default: 'push-then-fetch,allpush' },
      rounds: { type: 'string', default: '5' },
      ops: { type: 'string', default: 'fetch,push,mixed' },
      k: { type: 'string', default: '1,2,4,8,16,32' },
      'step-seconds': { type: 'string', default: '60' },
      repeats: { type: 'string', default: '3' },
      'op-timeout': { type: 'string', default: '600' },
      work: { type: 'string' },
      out: { type: 'string', default: '.' },
      local: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      owners: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });
  const [command] = positionals;
  if (command === undefined || !(commands as readonly string[]).includes(command) || positionals.length > 1) {
    throw new RangeError(`usage: dv1-concurrency.mts <${commands.join('|')}> [flags] (see the header)`);
  }
  if (!/^[a-z\d]{1,20}$/u.test(values.run)) {
    throw new RangeError('--run is 1–20 lowercase letters and digits');
  }
  return {
    command,
    run: values.run,
    sizes: parseNames('sizes', values.sizes, corpusSizes),
    devices: parseCounts('devices', values.devices),
    variants: parseNames('variants', values.variants, stormVariants),
    rounds: parseCounts('rounds', values.rounds)[0]!,
    ops: parseNames('ops', values.ops, rampOps),
    ks: parseCounts('k', values.k),
    stepSeconds: parseCounts('step-seconds', values['step-seconds'])[0]!,
    repeats: parseCounts('repeats', values.repeats)[0]!,
    opTimeoutMilliseconds: parseCounts('op-timeout', values['op-timeout'])[0]! * 1000,
    work: values.work,
    out: values.out,
    local: values.local,
    dryRun: values['dry-run'],
    owners: values.owners === undefined ? undefined : parseCounts('owners', values.owners)[0],
    json: values.json,
  };
};

/**
 * What a run would do, without doing any of it.
 *
 * @param options - The parsed options.
 * @param owners - How many owners there are.
 * @returns One line per project or step.
 */
export const describePlan = (options: Options, owners: number): readonly string[] => {
  const lines = [`dv1 ${options.command} run ${options.run}: ${String(owners)} owners`];
  switch (options.command) {
    case 'seed':
    case 'cleanup': {
      for (const size of options.sizes) {
        lines.push(`  ${options.command} ${projectIdOf(options.run, size)} for owner-0..owner-${String(owners - 1)}`);
      }
      break;
    }
    case 'adverts6': {
      lines.push(
        `  6 parallel info/refs on owner-0's ${projectIdOf(options.run, options.sizes[0]!)} × ${String(options.rounds)} rounds`,
      );
      break;
    }
    case 'storm': {
      for (const size of options.sizes) {
        for (const devices of options.devices) {
          for (const variant of options.variants) {
            lines.push(`  storm ${size} D=${String(devices)} ${variant} × ${String(options.rounds)} rounds on owner-0`);
          }
        }
      }
      break;
    }
    default: {
      for (const size of options.sizes) {
        for (const op of options.ops) {
          for (const k of options.ks) {
            const { skipped } = spreadClients(k, owners, op);
            lines.push(
              `  ramp ${size} ${op} K=${String(k)} × ${String(options.repeats)} × ${String(options.stepSeconds)} s${skipped === undefined ? '' : ` — skipped: ${skipped}`}`,
            );
          }
        }
      }
    }
  }
  return lines;
};

/** A child's environment: only what git needs, never the API's own typed `process.env`. */
type ChildEnvironment = Readonly<Record<string, string | undefined>>;

/* `NodeJS.ProcessEnv` is the API's typed environment in this project; a child's is plain strings. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a plain string map is a valid child environment
const asProcessEnvironment = (environment: ChildEnvironment): NodeJS.ProcessEnv =>
  environment as unknown as NodeJS.ProcessEnv;

type GitResult = Readonly<{ code: number | undefined; stderr: string; stdout: string; timedOut: boolean }>;

/** Everything one run shares: where git works, the relay and the owners. */
type Harness = Readonly<{
  options: Options;
  api: URL;
  credentials: readonly string[];
  relay: Relay;
  work: string;
  gitEnvironment: ChildEnvironment;
  rows: ResultRow[];
  errors: string[];
}>;

let tokenCounter = 0;
const nextToken = (): string => {
  tokenCounter += 1;
  return `t${String(tokenCounter)}`;
};

const runGit = async (
  harness: Harness,
  args: readonly string[],
  options: Readonly<{ cwd?: string; input?: Iterable<Uint8Array<ArrayBuffer>>; timeoutMilliseconds?: number }> = {},
): Promise<GitResult> =>
  new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: options.cwd ?? harness.work,
      env: asProcessEnvironment(harness.gitEnvironment),
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout = (stdout + chunk).slice(-65_536);
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4096);
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMilliseconds ?? harness.options.opTimeoutMilliseconds);
    const { stdin } = child;
    if (options.input !== undefined && stdin !== null) {
      /* Streamed with backpressure. A git that exits early closes its stdin: its exit code is the answer. */
      stdin.on('error', () => undefined);
      Readable.from(options.input).pipe(stdin);
    }
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? undefined, stderr, stdout, timedOut });
    });
  });

/** One operation's outcome after its retries, with every refusal it met. */
type Outcome = Readonly<{
  ok: boolean;
  milliseconds: number;
  refusals: readonly Exchange[];
  stdout?: string;
  error?: string;
}>;

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/** Whose project an operation reaches, and where its git runs. */
type Target = Readonly<{ owner: number; projectId: string; cwd?: string }>;

/**
 * Run one remote git operation through the relay, retrying a 429/503 refusal after its `Retry-After`.
 *
 * @param harness - The run.
 * @param target - The owner whose credential the relay adds, the project, and where git runs.
 * @param argsFor - The git arguments, given the relay URL of this attempt.
 * @returns The outcome: ok, wall time over all attempts, and the refused exchanges.
 */
const remoteGit = async (
  harness: Harness,
  { owner, projectId, cwd }: Target,
  argsFor: (url: string) => readonly string[],
): Promise<Outcome> => {
  const startedAt = performance.now();
  const refusals: Exchange[] = [];
  for (let attempt = 1; ; attempt += 1) {
    const token = nextToken();
    const result = await runGit(harness, argsFor(harness.relay.urlFor(token, owner, projectId)), { cwd });
    const refused = harness.relay.exchanges(token).filter((exchange) => exchange.status >= 400);
    refusals.push(...refused);
    if (result.code === 0) {
      return { ok: true, milliseconds: performance.now() - startedAt, refusals, stdout: result.stdout };
    }
    const retry = refused.findLast((exchange) => isRetryable(exchange.status));
    if (retry === undefined || attempt >= maximumAttempts) {
      const last = result.stderr.trim().split('\n').at(-1)?.slice(0, 200) ?? '';
      return {
        ok: false,
        milliseconds: performance.now() - startedAt,
        refusals,
        error: result.timedOut ? 'timed out' : refused.length > 0 ? `refused ${String(refused.at(-1)!.status)}` : last,
      };
    }
    await sleep(retryDelayMilliseconds(retry.retryAfter));
  }
};

/** One raw advertisement, with the same retry rule. */
const rawAdvertisement = async (harness: Harness, owner: number, projectId: string): Promise<Outcome> => {
  const startedAt = performance.now();
  const refusals: Exchange[] = [];
  for (let attempt = 1; ; attempt += 1) {
    const token = nextToken();
    const url = `${harness.relay.urlFor(token, owner, projectId)}/info/refs?service=git-upload-pack`;
    try {
      const answer = await fetch(url, { signal: AbortSignal.timeout(harness.options.opTimeoutMilliseconds) });
      await answer.arrayBuffer();
    } catch {
      // Recorded by the relay, or a timeout this loop reports below.
    }
    const exchanges = harness.relay.exchanges(token);
    const refused = exchanges.filter((exchange) => exchange.status >= 400);
    refusals.push(...refused);
    if (exchanges.some((exchange) => exchange.status === 200)) {
      return { ok: true, milliseconds: performance.now() - startedAt, refusals };
    }
    const retry = refused.findLast((exchange) => isRetryable(exchange.status));
    if (retry === undefined || attempt >= maximumAttempts) {
      return { ok: false, milliseconds: performance.now() - startedAt, refusals, error: 'advertisement refused' };
    }
    await sleep(retryDelayMilliseconds(retry.retryAfter));
  }
};

const rowOf = (
  base: Pick<ResultRow, 'shape' | 'size'> &
    Partial<Pick<ResultRow, 'variant' | 'devices' | 'k' | 'repeat' | 'skipped'>>,
  outcomes: readonly Outcome[],
): ResultRow => {
  const refusals = emptyRefusals();
  const codes: Record<string, number> = {};
  for (const exchange of outcomes.flatMap((outcome) => outcome.refusals)) {
    refusals[classifyRefusal(exchange.status, exchange.code)!] += 1;
    const key = exchange.code ?? `HTTP_${String(exchange.status)}`;
    codes[key] = (codes[key] ?? 0) + 1;
  }
  return {
    ...base,
    operations: outcomes.length,
    ok: outcomes.filter((outcome) => outcome.ok).length,
    failed: outcomes.filter((outcome) => !outcome.ok).length,
    refusals,
    codes,
    latency: summarize(outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.milliseconds)),
  };
};

const restHeaders = (credential: string): Record<string, string> => ({
  ...credentialHeaders(credential),
  'content-type': 'application/json',
});

const buildCorpus = async (harness: Harness, size: CorpusSize): Promise<string> => {
  const directory = join(harness.work, 'corpus', size);
  const built = await runGit(harness, ['-C', directory, 'rev-parse', '--verify', '-q', 'refs/heads/main']);
  if (built.code === 0) {
    return directory;
  }
  await mkdir(directory, { recursive: true });
  const init = await runGit(harness, ['init', '-q', '--bare', '-b', 'main', directory]);
  if (init.code !== 0) {
    throw new Error(`git init ${size}: ${init.stderr.trim()}`);
  }
  const imported = await runGit(harness, ['-C', directory, 'fast-import', '--quiet'], {
    input: corpusStream(size),
  });
  const packed = imported.code === 0 ? await runGit(harness, ['-C', directory, 'repack', '-a', '-d', '-q']) : imported;
  if (packed.code !== 0) {
    throw new Error(`building corpus ${size}: ${packed.stderr.trim()}`);
  }
  return directory;
};

const corpusBuilds = new WeakMap<Harness, Map<CorpusSize, Promise<string>>>();

/** The corpus as a local bare repository, built once per size even when devices ask for it concurrently. */
const corpusRepository = async (harness: Harness, size: CorpusSize): Promise<string> => {
  const builds = corpusBuilds.get(harness) ?? new Map<CorpusSize, Promise<string>>();
  corpusBuilds.set(harness, builds);
  const pending = builds.get(size) ?? buildCorpus(harness, size);
  builds.set(size, pending);
  return pending;
};

const seedCommand = async (harness: Harness): Promise<void> => {
  for (const size of harness.options.sizes) {
    const source = await corpusRepository(harness, size);
    const projectId = projectIdOf(harness.options.run, size);
    const outcomes: Outcome[] = [];
    for (const [owner, credential] of harness.credentials.entries()) {
      const registered = await fetch(new URL(`/v1/projects/${projectId}`, harness.api), {
        method: 'PUT',
        redirect: 'error',
        headers: restHeaders(credential),
        body: JSON.stringify({ name: `DV1 ${size}` }),
      });
      await registered.body?.cancel();
      if (!registered.ok) {
        harness.errors.push(`owner-${String(owner)} registering ${projectId}: HTTP ${String(registered.status)}`);
        continue;
      }
      const listed = await remoteGit(harness, { owner, projectId }, (url) => ['ls-remote', url, 'refs/heads/main']);
      outcomes.push(listed);
      /* Seeded once per run and owner: a second `seed` of the same run pushes nothing. */
      if (listed.ok && listed.stdout?.includes('refs/heads/main') === true) {
        continue;
      }
      outcomes.push(
        await remoteGit(harness, { owner, projectId, cwd: source }, (url) => [
          'push',
          '-q',
          url,
          'refs/heads/*:refs/heads/*',
          'refs/tags/*:refs/tags/*',
          'refs/tau/*:refs/tau/*',
        ]),
      );
    }
    harness.rows.push(rowOf({ shape: 'seed', size }, outcomes));
  }
};

const adverts6Command = async (harness: Harness): Promise<void> => {
  const size = harness.options.sizes[0]!;
  const projectId = projectIdOf(harness.options.run, size);
  for (let round = 0; round < harness.options.rounds; round += 1) {
    const outcomes = await Promise.all(Array.from({ length: 6 }, async () => rawAdvertisement(harness, 0, projectId)));
    harness.rows.push(rowOf({ shape: 'adverts6', size, repeat: round }, outcomes));
  }
};

/** A device: a bare clone sharing the corpus objects, so a large repository costs no second copy. */
const deviceRepository = async (harness: Harness, size: CorpusSize, name: string): Promise<string> => {
  const source = await corpusRepository(harness, size);
  const directory = join(harness.work, 'devices', name);
  await rm(directory, { recursive: true, force: true });
  const cloned = await runGit(harness, ['clone', '-q', '--bare', '--shared', source, directory]);
  if (cloned.code !== 0) {
    throw new Error(`cloning device ${name}: ${cloned.stderr.trim()}`);
  }
  return directory;
};

let syncCounter = 0;

/**
 * One sync commit on `parent` adding `sync/<tag>.txt`, written with plumbing so no work tree is checked out.
 *
 * @returns The new commit's id.
 */
const syncCommit = async (
  harness: Harness,
  repository: string,
  { parent, tag }: Readonly<{ parent: string; tag: string }>,
): Promise<string> => {
  syncCounter += 1;
  const index = join(repository, `dv1-index-${String(syncCounter)}`);
  const environment = { ...harness.gitEnvironment, GIT_INDEX_FILE: index };
  const plumbing = async (args: readonly string[], input?: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = spawn('git', ['-C', repository, ...args], {
        env: asProcessEnvironment(environment),
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
      });
      let stdout = '';
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });
      if (child.stdin !== null) {
        child.stdin.on('error', () => undefined);
        child.stdin.end(input);
      }
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`git ${args[0] ?? ''} exited ${String(code)}`));
        }
      });
    });
  const blob = await plumbing(
    ['hash-object', '-w', '--stdin'],
    `turn ${String(syncCounter)} ${tag} ${String(Date.now())} ${String(Math.random())}\n`,
  );
  await plumbing(['read-tree', parent]);
  await plumbing(['update-index', '--add', '--cacheinfo', `100644,${blob},sync/${tag}.txt`]);
  const tree = await plumbing(['write-tree']);
  const commit = await plumbing(['commit-tree', tree, '-p', parent, '-m', `dv1 sync ${tag} ${String(syncCounter)}`]);
  await rm(index, { force: true });
  return commit;
};

/** A full clone into a throwaway directory: what a fresh device's open pull costs the server. */
const cloneOnce = async (harness: Harness, target: Target, name: string): Promise<Outcome> => {
  const directory = join(harness.work, 'clones', name);
  const outcome = await remoteGit(harness, target, (url) => ['clone', '-q', '--bare', '--no-local', url, directory]);
  await rm(directory, { recursive: true, force: true });
  return outcome;
};

const stormCommand = async (harness: Harness): Promise<void> => {
  for (const size of harness.options.sizes) {
    const projectId = projectIdOf(harness.options.run, size);
    for (const devices of harness.options.devices) {
      for (const variant of harness.options.variants) {
        const names = Array.from(
          { length: devices },
          (_, device) => `storm-${size}-${String(devices)}-${String(device)}`,
        );
        const repositories = await Promise.all(names.map(async (name) => deviceRepository(harness, size, name)));
        const branch = `dv1-${harness.options.run}-storm-${String(devices)}-${Date.now().toString(36)}`;
        const tips = new Map<number, string>();
        for (let round = 0; round < harness.options.rounds; round += 1) {
          const outcomes: Outcome[] = [];
          if (variant === 'push-then-fetch') {
            const device = round % devices;
            const repository = repositories[device]!;
            const target = { owner: 0, projectId, cwd: repository };
            outcomes.push(
              await remoteGit(harness, target, (url) => ['fetch', '-q', url, '+refs/heads/main:refs/heads/main']),
            );
            const commit = await syncCommit(harness, repository, {
              parent: 'refs/heads/main',
              tag: `dev${String(device)}`,
            });
            outcomes.push(await remoteGit(harness, target, (url) => ['push', '-q', url, `${commit}:refs/heads/main`]));
          } else {
            outcomes.push(
              ...(await Promise.all(
                repositories.map(async (repository, device) => {
                  const commit = await syncCommit(harness, repository, {
                    parent: tips.get(device) ?? 'refs/heads/main',
                    tag: `dev${String(device)}`,
                  });
                  tips.set(device, commit);
                  return remoteGit(harness, { owner: 0, projectId, cwd: repository }, (url) => [
                    'push',
                    '-q',
                    url,
                    `${commit}:refs/heads/${branch}-dev${String(device)}`,
                  ]);
                }),
              )),
            );
          }
          outcomes.push(
            ...(await Promise.all(
              names.map(async (name, device) =>
                cloneOnce(harness, { owner: 0, projectId }, `${name}-r${String(round)}-${String(device)}`),
              ),
            )),
          );
          harness.rows.push(rowOf({ shape: 'storm', size, variant, devices, repeat: round }, outcomes));
        }
      }
    }
  }
};

const rampCommand = async (harness: Harness): Promise<void> => {
  const owners = harness.credentials.length;
  for (const size of harness.options.sizes) {
    const projectId = projectIdOf(harness.options.run, size);
    for (const op of harness.options.ops) {
      for (const k of harness.options.ks) {
        const { ownerOf, skipped } = spreadClients(k, owners, op);
        if (skipped !== undefined) {
          harness.rows.push(rowOf({ shape: 'ramp', size, variant: op, k, skipped }, []));
          continue;
        }
        const pushers = await Promise.all(
          ownerOf.map(async (_, client) =>
            clientOp(op, client) === 'push'
              ? deviceRepository(harness, size, `ramp-${size}-${op}-${String(k)}-${String(client)}`)
              : undefined,
          ),
        );
        let refused = false;
        for (let repeat = 0; repeat < harness.options.repeats; repeat += 1) {
          const deadline = performance.now() + harness.options.stepSeconds * 1000;
          const tips = new Map<number, string>();
          const branch = `dv1-${harness.options.run}-ramp-${op}-${String(k)}-${Date.now().toString(36)}`;
          const perClient = await Promise.all(
            ownerOf.map(async (owner, client) => {
              const outcomes: Outcome[] = [];
              for (let operation = 0; performance.now() < deadline; operation += 1) {
                const repository = pushers[client];
                if (repository === undefined) {
                  outcomes.push(
                    await cloneOnce(
                      harness,
                      { owner, projectId },
                      `ramp-${String(k)}-${String(client)}-${String(operation)}`,
                    ),
                  );
                } else {
                  const commit = await syncCommit(harness, repository, {
                    parent: tips.get(client) ?? 'refs/heads/main',
                    tag: `k${String(client)}`,
                  });
                  tips.set(client, commit);
                  outcomes.push(
                    await remoteGit(harness, { owner, projectId, cwd: repository }, (url) => [
                      'push',
                      '-q',
                      url,
                      `${commit}:refs/heads/${branch}-c${String(client)}`,
                    ]),
                  );
                }
              }
              return outcomes;
            }),
          );
          const row = rowOf({ shape: 'ramp', size, variant: op, k, repeat }, perClient.flat());
          harness.rows.push(row);
          refused ||= row.refusals.lease > 0;
        }
        /* Capacity is found: a higher K would only add refusals to a shared staging. */
        if (refused) {
          break;
        }
      }
    }
  }
};

const cleanupCommand = async (harness: Harness): Promise<void> => {
  for (const size of harness.options.sizes) {
    const projectId = projectIdOf(harness.options.run, size);
    for (const [owner, credential] of harness.credentials.entries()) {
      const deleted = await fetch(new URL(`/v1/projects/${projectId}`, harness.api), {
        method: 'DELETE',
        redirect: 'error',
        headers: credentialHeaders(credential),
      });
      await deleted.body?.cancel();
      if (!deleted.ok && deleted.status !== 404) {
        harness.errors.push(`owner-${String(owner)} deleting ${projectId}: HTTP ${String(deleted.status)}`);
      }
    }
  }
};

const formatRows = (rows: readonly ResultRow[]): string => {
  const header = ['shape', 'size', 'variant', 'D/K', '#', 'ops', 'ok', 'fail', ...refusalClasses, 'p50 ms', 'p95 ms'];
  const body = rows.map((row) => [
    row.shape,
    row.size,
    row.variant ?? '-',
    String(row.devices ?? row.k ?? '-'),
    String(row.repeat ?? '-'),
    String(row.operations),
    String(row.ok),
    String(row.failed),
    ...refusalClasses.map((name) => String(row.refusals[name])),
    Number.isNaN(row.latency.p50) ? '-' : String(row.latency.p50),
    Number.isNaN(row.latency.p95) ? '-' : String(row.latency.p95),
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...body.map((cells) => cells[column]!.length)));
  return [header, ...body]
    .map((cells) => cells.map((cell, column) => cell.padStart(widths[column]!)).join('  '))
    .join('\n');
};

/**
 * Run one command. Exported for the local end-to-end test; the CLI calls it with `process.argv`.
 *
 * @param argv - Arguments after the script.
 * @param environment - Where TAU_BENCH_API and TAU_DV1_OWNER_KEYS are read.
 * @param print - Where the report goes.
 * @returns The exit code.
 */
export const main = async (
  argv: readonly string[],
  environment: Readonly<Record<string, unknown>> = process.env,
  print: (line: string) => void = (line) => {
    console.log(line);
  },
): Promise<number> => {
  let options: Options;
  try {
    options = parseOptions(argv);
  } catch (error) {
    print(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const read = (name: string): string | undefined => {
    const value = environment[name];
    return typeof value === 'string' ? value : undefined;
  };
  const credentials = (read('TAU_DV1_OWNER_KEYS') ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key !== '');
  if (options.dryRun) {
    for (const line of describePlan(options, credentials.length > 0 ? credentials.length : (options.owners ?? 0))) {
      print(line);
    }
    return 0;
  }
  let api: URL;
  try {
    api = assertApiOrigin(read('TAU_BENCH_API'), options.local);
  } catch (error) {
    print(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (credentials.length === 0) {
    print('TAU_DV1_OWNER_KEYS must list at least one key (see the header of this script).');
    return 1;
  }
  const work = options.work ?? (await mkdtemp(join(tmpdir(), 'tau-dv1-')));
  await mkdir(work, { recursive: true });
  const gitConfig: ReadonlyArray<readonly [string, string]> = [
    ['user.name', 'DV1 Bench'],
    ['user.email', 'dv1@bench.invalid'],
    ['commit.gpgsign', 'false'],
    ['gc.auto', '0'],
    ['maintenance.auto', 'false'],
    ['credential.helper', ''],
  ];
  /* No credential ever reaches git: the relay adds it. */
  const gitEnvironment: ChildEnvironment = {
    PATH: read('PATH'),
    HOME: work,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/bin/false',
    GIT_CONFIG_COUNT: String(gitConfig.length),
    ...Object.fromEntries(
      gitConfig.flatMap(([key, value], index) => [
        [`GIT_CONFIG_KEY_${String(index)}`, key],
        [`GIT_CONFIG_VALUE_${String(index)}`, value],
      ]),
    ),
  };
  const relay = await startRelay(api, credentials);
  const harness: Harness = { options, api, credentials, relay, work, gitEnvironment, rows: [], errors: [] };
  const startedAt = new Date().toISOString();
  try {
    const run = {
      seed: seedCommand,
      adverts6: adverts6Command,
      storm: stormCommand,
      ramp: rampCommand,
      cleanup: cleanupCommand,
    }[options.command as (typeof commands)[number]];
    await run(harness);
  } catch (error) {
    harness.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await relay.close();
    if (options.work === undefined) {
      await rm(work, { recursive: true, force: true });
    }
  }
  const finishedAt = new Date().toISOString();
  const capacity =
    options.command === 'ramp'
      ? options.sizes.flatMap((size) =>
          options.ops.map((op) =>
            capacityOf(
              harness.rows.filter((row) => row.size === size && row.variant === op),
              size,
              op,
            ),
          ),
        )
      : [];
  const document = {
    harness: 'dv1-concurrency',
    command: options.command,
    run: options.run,
    api: api.origin,
    owners: credentials.length,
    startedAt,
    finishedAt,
    settings: {
      sizes: options.sizes,
      devices: options.devices,
      variants: options.variants,
      rounds: options.rounds,
      ops: options.ops,
      k: options.ks,
      stepSeconds: options.stepSeconds,
      repeats: options.repeats,
    },
    rows: harness.rows,
    capacity,
    errors: harness.errors,
  };
  const file = join(resolve(options.out), `dv1-${startedAt.replaceAll(/[:.]/gu, '-')}.json`);
  await mkdir(resolve(options.out), { recursive: true });
  await writeFile(file, `${JSON.stringify(document, undefined, 2)}\n`);
  if (options.json) {
    print(JSON.stringify(document, undefined, 2));
  } else {
    print(
      `DV1 ${options.command}, run ${options.run}: ${api.origin}, ${String(credentials.length)} owners, ${startedAt} – ${finishedAt}`,
    );
    print(formatRows(harness.rows));
    for (const row of capacity) {
      print(
        `capacity ${row.size} ${row.op}: ${row.capacity === undefined ? 'none' : row.reachedTop ? `≥${String(row.capacity)} (not reached)` : String(row.capacity)}${row.firstRefusingK === undefined ? '' : `, first lease refusal at K=${String(row.firstRefusingK)}`}`,
      );
    }
    for (const error of harness.errors) {
      print(`  ✗ ${error}`);
    }
    print(`wrote ${file}`);
  }
  const failed =
    harness.errors.length > 0 ||
    harness.rows.some((row) => row.failed > 0 && Object.values(row.refusals).every((count) => count === 0));
  return failed ? 1 : 0;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  });
}
