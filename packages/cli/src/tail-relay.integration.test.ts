/* eslint-disable @typescript-eslint/naming-convention -- environment variables and Anthropic's provider wire keep their own names. */
/**
 * DS-3 / SP-12: the cursored tail replaces `durable_stream_event` for remote viewing.
 *
 * The exit criteria are asserted verbatim (`agent-session-durability-files-first.md`
 * spike table): *two API replicas, 100 forced disconnects: zero lost/duplicated
 * events; p95 reconnect < 250 ms; zero chat rows written to Postgres.*
 *
 * The configuration is the honest one:
 *
 *   - **Two real API replicas** from `apps/api/dist/main.js` on their own ports,
 *     against the shared Postgres and the shared Redis the API config names.
 *   - **A real `tau serve` daemon**, paired through the real device-code flow,
 *     whose control channel and whose host-side route sockets all live on
 *     replica A.
 *   - **The viewer's session lands on the other replica** for every odd dial, so
 *     those frames cross `host:relay:<sessionId>:agent:*` in Redis rather than
 *     being spliced inside one process. Rewriting the session URL's authority is
 *     what a load balancer does to a browser: the session record, the route
 *     markers and the relay streams all live in Redis, so either replica admits
 *     either leg.
 *   - **Viewers tail; only the owner attaches** (W5-TAIL ruling 1). The viewer
 *     never sends `attach` — that command recovers a non-terminal run and
 *     reports leadership — so no new client option was needed: `tail` already
 *     *is* the read-only window, and `createAgentChannelClient` speaks it.
 *
 * Gated behind `TAU_DS3_TAIL_RELAY=1` so `cli:test` stays a unit suite: this one
 * spawns two API processes, a daemon and a stub gateway, and runs for minutes.
 */

import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import { localDatabaseName } from '@taucad/utils/worktree-database';
import type { AgentChannelClient, AgentLogEvent, EventLogBatch } from '@taucad/agent-host';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../..');
const binPath = resolvePath(repoRoot, 'packages/cli/src/bin.ts');
const apiRoot = resolvePath(repoRoot, 'apps/api');

const agentToken = 'ds3-tail-relay-agent-token-at-least-32-characters';
/** Replica A carries the daemon's control channel and every host-side route. */
const replicaAPort = 4121;
/** Replica B admits half the viewer's browser legs, so those frames cross Redis. */
const replicaBPort = 4122;
const frontendOrigin = 'http://localhost:3000';
/** DS-3's forced-disconnect count, verbatim. */
const forcedDisconnects = 100;
/** DS-3's reconnect budget, verbatim. Milliseconds. */
const reconnectBudget = 250;
/** DS-3's floor on the log the viewer has to reassemble. */
const minimumEvents = 200;
/** `agentChannelTailBatchLimit`; the wire refuses anything larger. */
const tailLimit = 16;
/** Tool-calling turns the fixture gateway answers before its closing text. */
const gatewayTurns = 140;
/** How long each gateway answer is held, so the log grows over a wide window. Milliseconds. */
const gatewayHold = 320;

const enabled = process.env['TAU_DS3_TAIL_RELAY'] === '1';

const disposers: Array<() => Promise<void> | void> = [];

afterAll(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- teardown is ordered: children first, then their servers.
      await dispose();
    } catch {
      /* A resource that is already gone is the outcome teardown wanted. */
    }
  }
});

/** @param milliseconds - How long to wait. */
const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/** Lehmer/MINSTD, so a failing run replays from its seed and no bitwise op is needed. */
const createRandom = (seed: number): (() => number) => {
  const modulus = 2_147_483_647;
  let state = (seed % modulus) + 1;
  return () => {
    state = (state * 48_271) % modulus;
    return state / modulus;
  };
};

const parseEnvironmentFile = (text: string): Record<string, string> => {
  const parsed: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    parsed[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return parsed;
};

const stopChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
  });
  child.kill('SIGTERM');
  await Promise.race([exited, sleep(5000)]);
  child.kill('SIGKILL');
};

/**
 * Boot one built API replica on its own port against the shared Postgres/Redis.
 *
 * The *built* bundle deliberately: `import.meta.env.PROD` is baked true at build
 * time, so `HostsGateway` attaches its WebSocket upgrade to the Fastify server
 * itself. The dev server puts WebSockets on `PORT + 1`, which would leave the
 * session URLs the API mints (built from `TAU_API_URL`, port and all) pointing
 * at a port nothing listens on.
 *
 * @param port - TCP port for this replica.
 * @param logs - Sink for the child's output, printed only when the test fails.
 * @returns The replica's origin.
 */
const startApiReplica = async (port: number, logs: string[]): Promise<string> => {
  const base = parseEnvironmentFile(readFileSync(resolvePath(apiRoot, '.env'), 'utf8'));
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    env: {
      ...process.env,
      ...base,
      PORT: String(port),
      TAU_API_URL: `http://127.0.0.1:${String(port)}`,
      LOG_LEVEL: 'warn',
      LOG_SERVICE: 'console',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = (chunk: Uint8Array<ArrayBuffer>): void => {
    logs.push(`[api:${String(port)}] ${Buffer.from(chunk).toString('utf8')}`);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  disposers.push(async () => stopChild(child));
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- readiness polling is sequential by nature.
      const response = await fetch(`http://127.0.0.1:${String(port)}/health/live`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) {
        return `http://127.0.0.1:${String(port)}`;
      }
    } catch {
      /* Not listening yet. */
    }
    // oxlint-disable-next-line no-await-in-loop -- one probe at a time.
    await sleep(250);
  }
  throw new Error(`API replica ${String(port)} never became healthy`);
};

const runPsql = async (statement: string): Promise<string> => {
  const { stdout } = await execFileAsync(
    'docker',
    [
      'exec',
      'tau-postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'dev_user',
      '-d',
      localDatabaseName(),
      '-t',
      '-A',
      '-F',
      '|',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  );
  return stdout;
};

/** Row counts for every public table, so "zero chat rows" is asserted, not assumed. */
const postgresCensus = async (): Promise<Record<string, number>> => {
  const stdout = await runPsql(
    `SELECT table_name, (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from public.%I', table_name), false, true, '')))[1]::text
     FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`,
  );
  const census: Record<string, number> = {};
  for (const line of stdout.split('\n')) {
    const [table, count] = line.trim().split('|');
    if (table !== undefined && table !== '' && count !== undefined) {
      census[table] = Number(count);
    }
  }
  return census;
};

/**
 * Sign up, verify, sign in; keep the bearer better-auth's `bearer()` plugin emits.
 *
 * @param origin - Replica to seed against; both replicas share the database.
 * @returns The bearer token every later call presents.
 */
const seedAccount = async (origin: string): Promise<string> => {
  const suffix = randomUUID();
  const account = { email: `tau-ds3-${suffix}@example.test`, name: 'DS3 Viewer', password: `Tau-${suffix}-pass` };
  const headers = { 'content-type': 'application/json', origin: frontendOrigin };
  const signUp = await fetch(`${origin}/v1/auth/sign-up/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify(account),
  });
  if (!signUp.ok) {
    throw new Error(`DS-3 account sign-up failed with HTTP ${String(signUp.status)}`);
  }
  disposers.push(async () => {
    await runPsql(`DELETE FROM "user" WHERE email = '${account.email}';`);
  });
  await runPsql(`UPDATE "user" SET email_verified = true WHERE email = '${account.email}';`);
  const signIn = await fetch(`${origin}/v1/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await signIn.json()) as { readonly token?: string };
  const token = signIn.headers.get('set-auth-token') ?? body.token;
  if (token === undefined || token === '') {
    throw new Error(`DS-3 account sign-in returned no bearer (HTTP ${String(signIn.status)})`);
  }
  return token;
};

/**
 * The real device-code pairing flow; nothing about the credential is fabricated.
 *
 * @param origin - Replica to pair through.
 * @param token - The owner's bearer.
 * @returns The device identity `tau serve` is handed in its `host.json`.
 */
const pairDevice = async (
  origin: string,
  token: string,
): Promise<{ readonly deviceId: string; readonly credential: string }> => {
  const headers = { 'content-type': 'application/json', origin: frontendOrigin };
  const created = await fetch(`${origin}/v1/agents/pairings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ deviceLabel: 'ds3-tail-relay' }),
  });
  const pairing = (await created.json()) as { readonly deviceCode: string; readonly userCode: string };
  const approved = await fetch(`${origin}/v1/agents/pairings/approve`, {
    method: 'POST',
    headers: { ...headers, authorization: `Bearer ${token}` },
    body: JSON.stringify({ userCode: pairing.userCode }),
  });
  if (!approved.ok) {
    throw new Error(`DS-3 pairing approval failed with HTTP ${String(approved.status)}`);
  }
  const exchanged = await fetch(`${origin}/v1/agents/pairings/token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ deviceCode: pairing.deviceCode }),
  });
  const granted = (await exchanged.json()) as { readonly deviceId?: string; readonly credential?: string };
  const { deviceId, credential } = granted;
  if (deviceId === undefined || credential === undefined) {
    throw new Error(`DS-3 pairing exchange failed with HTTP ${String(exchanged.status)}`);
  }
  disposers.push(async () => {
    await runPsql(`DELETE FROM agent_device WHERE id = '${deviceId}';`);
  });
  return { deviceId, credential };
};

/**
 * A gateway that answers `turns` tool-calling turns and then one final text.
 *
 * Each answer is held first, so the log grows over a wall-clock window wide
 * enough for a hundred disconnects to land *while the run is still appending* —
 * a tail over a finished file proves much less.
 *
 * @param turns - Tool-calling turns before the closing text.
 * @param hold - Delay before each answer starts streaming. Milliseconds.
 * @returns The gateway's base URL.
 */
const startStubGateway = async (turns: number, hold: number): Promise<URL> => {
  let requestIndex = 0;
  const server: HttpServer = createServer((request, response) => {
    // async-iife: bootstrap -- node's request listener is synchronous.
    void (async () => {
      for await (const _chunk of request) {
        /* Drained: only the body's arrival matters. */
      }
      const current = requestIndex++;
      const writeEvent = (event: string, data: unknown): void => {
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      response.flushHeaders();
      await sleep(hold);
      writeEvent('message_start', {
        type: 'message_start',
        message: {
          id: `ds3-message-${String(current)}`,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'fixture-model',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 12, output_tokens: 0 },
        },
      });
      if (current < turns) {
        writeEvent('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: `ds3-call-${String(current)}`, name: 'create_file', input: {} },
        });
        writeEvent('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: JSON.stringify({
              targetFile: `step-${String(current)}.txt`,
              content: `step ${String(current)}\n`,
            }),
          },
        });
        writeEvent('content_block_stop', { type: 'content_block_stop', index: 0 });
        writeEvent('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use', stop_sequence: null },
          usage: { output_tokens: 6 },
        });
      } else {
        writeEvent('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        });
        writeEvent('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'DS-3 run complete.' },
        });
        writeEvent('content_block_stop', { type: 'content_block_stop', index: 0 });
        writeEvent('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 4 },
        });
      }
      writeEvent('message_stop', { type: 'message_stop' });
      response.end();
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a TCP address.');
  }
  disposers.push(
    async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  );
  return new URL(`http://127.0.0.1:${String(address.port)}`);
};

/**
 * Spawn `tau serve` against a real relay and wait for the origin it prints.
 *
 * @param options - Workspace, config directory, relay, gateway and log sink.
 * @returns The daemon's loopback origin.
 */
const startServe = async (options: {
  readonly workspace: string;
  readonly configDirectory: string;
  readonly relayUrl: string;
  readonly gatewayUrl: string;
  readonly logs: string[];
}): Promise<string> => {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      binPath,
      'serve',
      '--trust-projects',
      '--agentPort=0',
      `--workspace=${options.workspace}`,
      `--relay=${options.relayUrl}`,
      `--gateway=${options.gatewayUrl}`,
      '--model=fixture-model',
      '--modelProvider=anthropic',
      '--no-external-agents',
      /* One relayed session per dial, and a dial per forced disconnect: the
       * default capacity of one exists for a laptop serving one page, not for a
       * reconnect storm. */
      `--max-sessions=${String(forcedDisconnects * 3)}`,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        TAU_CONFIG_DIR: options.configDirectory,
        TAU_HOST_AGENT_TOKEN: agentToken,
        CONSOLA_LEVEL: '4',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const origin = Promise.withResolvers<string>();
  const scan = (chunk: Uint8Array<ArrayBuffer>): void => {
    const text = Buffer.from(chunk).toString('utf8');
    options.logs.push(`[daemon] ${text}`);
    const match = /http:\/\/127\.0\.0\.1:(\d+)/u.exec(text);
    if (match) {
      origin.resolve(`http://127.0.0.1:${match[1]!}`);
    }
  };
  child.stdout.on('data', scan);
  child.stderr.on('data', scan);
  child.once('exit', (code) => {
    origin.reject(new Error(`tau serve exited early with code ${String(code)}`));
  });
  disposers.push(async () => stopChild(child));
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('tau serve never announced its agent channel'));
    }, 90_000);
    timer.unref();
  });
  return Promise.race([origin.promise, deadline]);
};

/** Everything one dial needs; the session is always minted on replica A. */
type Placement = {
  readonly token: string;
  readonly deviceId: string;
  readonly sessionOrigin: string;
  readonly runtimeVersion: string;
};

/** One dialled channel, with each leg of the dial timed separately. */
type DialedChannel = {
  readonly client: AgentChannelClient;
  readonly socket: WebSocket;
  readonly sessionId: string;
  /** True when the browser leg was opened against a replica other than the minting one. */
  readonly crossedReplica: boolean;
  /** `POST /sessions`: offer published, daemon splices its routes, `accept` observed. Milliseconds. */
  readonly offer: number;
  /** The browser leg's own WebSocket upgrade. Milliseconds. */
  readonly open: number;
  /** Absolute `performance.now()` of the first frame that reached the viewer. */
  readonly firstFrameAt: Promise<number>;
};

/**
 * Dial one relayed agent channel as a *viewer*.
 *
 * `viewerOrigin` may differ from the session's minting replica: the session
 * record, the route markers and the relay streams all live in Redis, so a
 * browser leg is admitted by whichever replica it reaches — which is what
 * happens behind a load balancer, and what puts the Redis relay on the path.
 *
 * @param placement - Owner bearer, device, minting replica and runtime version.
 * @param viewerOrigin - Replica the browser leg is opened against.
 * @returns The open channel and its timings.
 */
const dialViewer = async (placement: Placement, viewerOrigin: string): Promise<DialedChannel> => {
  const dialStartedAt = performance.now();
  const created = await fetch(`${placement.sessionOrigin}/v1/agents/${placement.deviceId}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${placement.token}` },
    body: JSON.stringify({ runtimeVersion: placement.runtimeVersion }),
  });
  const session = (await created.json()) as {
    readonly id?: string;
    readonly agentUrl?: string;
    readonly code?: string;
  };
  const acceptedAt = performance.now();
  if (session.agentUrl === undefined || session.id === undefined) {
    throw new Error(`No agent route on the session (HTTP ${String(created.status)} ${session.code ?? ''})`);
  }
  const url = new URL(session.agentUrl);
  const viewerHost = new URL(viewerOrigin).host;
  /* The proof the leg really crossed replicas: the API minted this URL on
   * `sessionOrigin`, and the socket below is opened against another authority. */
  const crossedReplica = url.host !== viewerHost;
  url.host = viewerHost;
  const socket = new WebSocket(url.href, { headers: { authorization: `Bearer ${placement.token}` } });
  const firstFrame = Promise.withResolvers<number>();
  /* Registered before the channel wraps the socket, so the timestamp is the
   * frame's arrival on the wire and not the codec's handling of it. */
  socket.once('message', () => {
    firstFrame.resolve(performance.now());
  });
  /* Wrapped before `open`, deliberately: the daemon posts its channel hello the
   * instant its own upgrade completes, and `ws` drops a frame nobody listens for. */
  const client = createAgentChannelClient(socket, { sessionKey: 'tau-agent' });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
    socket.once('close', (code: number, reason: Uint8Array<ArrayBuffer>) => {
      reject(new Error(`viewer socket closed ${String(code)} ${Buffer.from(reason).toString('utf8')}`));
    });
  });
  return {
    client,
    socket,
    sessionId: session.id,
    crossedReplica,
    offer: acceptedAt - dialStartedAt,
    open: performance.now() - acceptedAt,
    firstFrameAt: firstFrame.promise,
  };
};

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = [...values].sort((first, second) => first - second);
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index]!;
};

const spread = (values: readonly number[]): Record<string, number> => ({
  min: values.length > 0 ? Math.min(...values) : Number.NaN,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: values.length > 0 ? Math.max(...values) : Number.NaN,
});

const identityOf = (event: AgentLogEvent): string => `${event.leaderEpoch}:${String(event.sequence)}`;

const isTerminalLifecycle = (event: AgentLogEvent): boolean =>
  event.type === 'run.lifecycle' && ['completed', 'failed', 'cancelled'].includes(event.state);

/** What one measurement run observed. Every duration is in milliseconds. */
type TailMeasurement = {
  readonly received: readonly AgentLogEvent[];
  readonly seen: ReadonlySet<string>;
  readonly counters: Record<string, number>;
  readonly latencies: Record<string, readonly number[]>;
};

/**
 * Tail one chat through 100 forced disconnects, re-dialling from the last cursor.
 *
 * Cursor discipline is the whole contract: a batch is folded in only when it
 * answered the window actually asked for, so a read the wire died under is
 * re-issued for free rather than duplicating.
 *
 * @param input - Placement, both replicas, the chat, and the seeded PRNG.
 * @returns The reassembled stream, the counters and the raw latency arrays.
 */
const measureTail = async (input: {
  readonly placement: Placement;
  readonly replicaA: string;
  readonly replicaB: string;
  readonly chatId: string;
  readonly random: () => number;
}): Promise<TailMeasurement> => {
  const { chatId, placement, random, replicaA, replicaB } = input;
  const received: AgentLogEvent[] = [];
  const seen = new Set<string>();
  /* Held on one object so a `tail` inside a helper is visibly what moves them. */
  const progress = { cursor: 0, endCursor: 0, complete: false };
  const counters = {
    duplicated: 0,
    cursorViolations: 0,
    disconnects: 0,
    disconnectsWhileGrowing: 0,
    midFlightKills: 0,
    midFlightRaced: 0,
    crossReplicaDials: 0,
  };
  const reconnect: number[] = [];
  const crossReplica: number[] = [];
  const sameReplica: number[] = [];
  const offer: number[] = [];
  const open: number[] = [];
  const residual: number[] = [];
  const usable: number[] = [];

  const accept = (batch: EventLogBatch): void => {
    if (batch.cursor !== progress.cursor) {
      counters.cursorViolations += 1;
      return;
    }
    for (const event of batch.events) {
      const identity = identityOf(event);
      if (seen.has(identity)) {
        counters.duplicated += 1;
      }
      seen.add(identity);
      received.push(event);
      if (isTerminalLifecycle(event)) {
        progress.complete = true;
      }
    }
    progress.cursor = batch.nextCursor;
    progress.endCursor = batch.endCursor;
  };

  let channel = await dialViewer(placement, replicaB);
  await channel.firstFrameAt;

  const tailOnce = async (): Promise<void> => {
    const answer = await channel.client.execute({
      type: 'tail',
      chatId,
      cursor: progress.cursor,
      limit: tailLimit,
    });
    if (answer.type !== 'tail') {
      throw new Error(`tail answered ${answer.type}`);
    }
    accept(answer.batch);
  };

  const redial = async (destroyedAt: number, crossing: boolean): Promise<void> => {
    const replaced = await dialViewer(placement, crossing ? replicaB : replicaA);
    const firstFrameAt = await replaced.firstFrameAt;
    const latency = firstFrameAt - destroyedAt;
    reconnect.push(latency);
    (crossing ? crossReplica : sameReplica).push(latency);
    if (replaced.crossedReplica) {
      counters.crossReplicaDials += 1;
    }
    offer.push(replaced.offer);
    open.push(replaced.open);
    residual.push(latency - replaced.offer - replaced.open);
    channel = replaced;
    /* The conservative reading of "reconnected": not the first byte on the wire,
     * but the first answered read on the replacement. */
    await tailOnce();
    usable.push(performance.now() - destroyedAt);
  };

  const deadline = Date.now() + 900_000;
  while (counters.disconnects < forcedDisconnects && Date.now() < deadline) {
    const rounds = 1 + Math.floor(random() * 3);
    for (let round = 0; round < rounds; round++) {
      // oxlint-disable-next-line no-await-in-loop -- a cursored tail is sequential by definition.
      await tailOnce();
      if (progress.cursor === progress.endCursor) {
        // oxlint-disable-next-line no-await-in-loop -- let the daemon append before asking again.
        await sleep(20 + Math.floor(random() * 40));
      }
    }
    const growing = !progress.complete;
    let pending: Promise<void> | undefined;
    let answeredBeforeKill = false;
    if (random() < 0.5) {
      /* Destroyed with a `tail` outstanding: the answer never lands, the cursor
       * never advances, and the same window is re-issued on the replacement
       * wire. This is the case that can duplicate. */
      pending = channel.client
        .execute({ type: 'tail', chatId, cursor: progress.cursor, limit: tailLimit })
        // oxlint-disable-next-line promise/prefer-await-to-then -- the request must stay in flight while the socket dies.
        .then((answer) => {
          answeredBeforeKill = true;
          if (answer.type === 'tail') {
            accept(answer.batch);
          }
        })
        // oxlint-disable-next-line promise/prefer-await-to-then -- a killed wire rejects it; that is the point.
        .catch(() => undefined);
      // oxlint-disable-next-line no-await-in-loop -- the destroy has to land inside the request.
      await sleep(Math.floor(random() * 8));
    }
    const destroyedAt = performance.now();
    const killedInFlight = pending !== undefined && !answeredBeforeKill;
    channel.socket.terminate();
    if (pending) {
      // oxlint-disable-next-line no-await-in-loop -- observe the in-flight rejection before re-dialling.
      await pending;
    }
    if (pending) {
      if (killedInFlight) {
        counters.midFlightKills += 1;
      } else {
        counters.midFlightRaced += 1;
      }
    }
    counters.disconnects += 1;
    if (growing) {
      counters.disconnectsWhileGrowing += 1;
    }
    // oxlint-disable-next-line no-await-in-loop -- one wire at a time, by construction.
    await redial(destroyedAt, counters.disconnects % 2 === 1);
  }

  // Drain to the end of the log on the last wire.
  const drainDeadline = Date.now() + 300_000;
  while (Date.now() < drainDeadline && !(progress.complete && progress.cursor === progress.endCursor)) {
    // oxlint-disable-next-line no-await-in-loop -- a cursored tail is sequential by definition.
    await tailOnce();
    if (progress.cursor === progress.endCursor && !progress.complete) {
      // oxlint-disable-next-line no-await-in-loop -- wait for the next append.
      await sleep(50);
    }
  }
  channel.client.close('ds3-done');
  channel.socket.close();

  return {
    received,
    seen,
    counters,
    latencies: { reconnect, crossReplica, sameReplica, offer, open, residual, usable },
  };
};

describe.skipIf(!enabled)('DS-3: the cursored tail over the relay replaces durable_stream_event', () => {
  it('loses and duplicates nothing across 100 forced disconnects on two API replicas', async () => {
    const logs: string[] = [];
    const seed = Number(process.env['TAU_DS3_SEED'] ?? '20260903');
    const artifacts = process.env['TAU_DS3_ARTIFACT_DIR'];

    try {
      const replicaA = await startApiReplica(replicaAPort, logs);
      const replicaB = await startApiReplica(replicaBPort, logs);

      const token = await seedAccount(replicaA);
      const { deviceId, credential } = await pairDevice(replicaA, token);

      const workspace = await mkdtemp(join(tmpdir(), 'tau-ds3-ws-'));
      const configDirectory = await mkdtemp(join(tmpdir(), 'tau-ds3-cfg-'));
      disposers.push(async () => {
        await rm(workspace, { recursive: true, force: true });
        await rm(configDirectory, { recursive: true, force: true });
      });
      await mkdir(configDirectory, { recursive: true });
      await writeFile(
        join(configDirectory, 'host.json'),
        `${JSON.stringify({ v: 1, deviceId, credential })}\n`,
        'utf8',
      );

      const gatewayUrl = await startStubGateway(gatewayTurns, gatewayHold);
      await startServe({ workspace, configDirectory, relayUrl: replicaA, gatewayUrl: gatewayUrl.href, logs });

      /* Presence is a Redis key written by the control `ready` frame, and the
       * agent capability exists only while the daemon holds that connection. */
      type DeviceRow = {
        readonly id: string;
        readonly online: boolean;
        readonly runtimeVersion?: string;
        readonly agent?: { readonly workspaceRoot: string };
      };
      let device: DeviceRow | undefined;
      for (let attempt = 0; attempt < 120; attempt++) {
        // oxlint-disable-next-line no-await-in-loop -- presence polling is sequential by nature.
        const response = await fetch(`${replicaA}/v1/agents`, {
          headers: { authorization: `Bearer ${token}` },
        });
        // oxlint-disable-next-line no-await-in-loop -- one probe at a time.
        const rows = (await response.json()) as readonly DeviceRow[];
        device = rows.find((row) => row.id === deviceId);
        if (device?.online === true && device.agent) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- one probe at a time.
        await sleep(500);
      }
      expect(device?.agent, 'the daemon never advertised the agent capability').toBeDefined();
      const placement: Placement = {
        token,
        deviceId,
        sessionOrigin: replicaA,
        runtimeVersion: device?.runtimeVersion ?? '',
      };

      /* The owner starts the turn and leaves: always-on means the run outlives
       * the socket that admitted it, and every later reader is a viewer. */
      const chatId = 'ds3-chat';
      const owner = await dialViewer(placement, replicaA);
      const started = await owner.client.execute({
        type: 'start',
        trigger: 'submit',
        chatId,
        runId: 'ds3-run',
        message: { id: 'ds3-user-1', role: 'user', content: 'Write the DS-3 fixture steps.' },
      });
      expect(started.type).toBe('result');
      owner.client.close('owner-done');
      owner.socket.close();

      const censusBefore = await postgresCensus();
      const measured = await measureTail({
        placement,
        replicaA,
        replicaB,
        chatId,
        random: createRandom(seed),
      });
      const censusAfter = await postgresCensus();

      // The file is the authority; the viewer's stream is compared against it.
      const raw = await readFile(join(workspace, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8');
      const onDisk = raw
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as AgentLogEvent);

      const censusDelta = Object.fromEntries(
        Object.keys({ ...censusBefore, ...censusAfter })
          .map((table) => [table, (censusAfter[table] ?? 0) - (censusBefore[table] ?? 0)] as const)
          .filter(([, delta]) => delta !== 0),
      );
      const reconnect = measured.latencies['reconnect'] ?? [];

      const report = {
        seed,
        ...measured.counters,
        sessionsMinted: measured.counters['disconnects']! + 2,
        eventsOnDisk: onDisk.length,
        eventsRead: measured.received.length,
        uniqueRead: measured.seen.size,
        lost: onDisk.filter((event) => !measured.seen.has(identityOf(event))).length,
        reconnect: {
          ...spread(reconnect),
          crossReplicaP95: percentile(measured.latencies['crossReplica'] ?? [], 0.95),
          sameReplicaP95: percentile(measured.latencies['sameReplica'] ?? [], 0.95),
        },
        /** The same reconnect measured to the first *answered read*, not the first byte. */
        usable: spread(measured.latencies['usable'] ?? []),
        breakdown: {
          offer: spread(measured.latencies['offer'] ?? []),
          socketOpen: spread(measured.latencies['open'] ?? []),
          firstFrameResidual: spread(measured.latencies['residual'] ?? []),
        },
        censusBefore,
        censusAfter,
        censusDelta,
      };
      process.stdout.write(`\n--- DS-3 report ---\n${JSON.stringify(report, undefined, 2)}\n--- end ---\n`);
      if (artifacts !== undefined && artifacts !== '') {
        await writeFile(join(artifacts, 'ds3-report.json'), `${JSON.stringify(report, undefined, 2)}\n`, 'utf8');
        await writeFile(
          join(artifacts, 'ds3-latencies.json'),
          `${JSON.stringify(measured.latencies, undefined, 1)}\n`,
          'utf8',
        );
        await writeFile(join(artifacts, 'ds3-processes.log'), logs.join(''), 'utf8');
        await writeFile(join(artifacts, 'ds3-events.jsonl'), raw, 'utf8');
      }

      // DS-3's configuration, asserted rather than assumed.
      expect(measured.counters['disconnects']).toBe(forcedDisconnects);
      expect(onDisk.length).toBeGreaterThanOrEqual(minimumEvents);
      // Half the re-dials really were admitted by the other replica.
      expect(measured.counters['crossReplicaDials']).toBe(forcedDisconnects / 2);
      // The duplicate-risk case — a read outstanding when the wire died — happened.
      expect(measured.counters['midFlightKills']).toBeGreaterThan(0);
      // And the log was still being appended to while the wire was being killed.
      expect(measured.counters['disconnectsWhileGrowing']).toBeGreaterThan(forcedDisconnects / 2);

      // DS-3's exit criteria, verbatim.
      // 1. Zero lost, zero duplicated: the viewer's stream *is* the file.
      expect(measured.counters['cursorViolations']).toBe(0);
      expect(measured.counters['duplicated']).toBe(0);
      expect(measured.received.map((event) => identityOf(event))).toEqual(onDisk.map((event) => identityOf(event)));
      // 2. p95 reconnect under 250 ms.
      expect(percentile(reconnect, 0.95)).toBeLessThan(reconnectBudget);
      // 3. Zero chat rows in Postgres.
      expect(censusAfter['durable_stream']).toBe(censusBefore['durable_stream']);
      expect(censusAfter['durable_stream_event']).toBe(censusBefore['durable_stream_event']);
    } catch (error) {
      /* The children's own output never rides an `Error` message: vitest parses
       * stack-shaped lines and reads the files they name, and one bundled
       * dependency's source-map comment crashes that reader. */
      process.stderr.write(`\n--- DS-3 process output ---\n${logs.join('')}\n--- end ---\n`);
      throw error instanceof Error ? new Error(error.message) : error;
    }
  }, 1_500_000);
});
