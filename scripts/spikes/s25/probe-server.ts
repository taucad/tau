/**
 * Spike S25 (native-dependency-resolution charter, D7/D25/W5): a probe MCP server that an agent
 * client launches in place of `tau mcp`. It records which environment variable NAMES arrive (never a
 * value), emits `notifications/progress` when a call carries a `progressToken`, and records whether
 * the client sends `notifications/cancelled` when a call outlives the client's tool timeout.
 *
 * Spike code only, no dependencies. Usage:
 *   node scripts/spikes/s25/probe-server.ts <log.jsonl>
 * The log path is an argument, not a variable, because the environment is the thing under test.
 * Protocol: newline-delimited JSON-RPC 2.0 on stdio (MCP stdio transport). Exit code 0 on stdin end.
 *
 * Tools:
 *   env_names       returns the sorted names of `process.env`
 *   progress_probe  emits `steps` progress notifications (default 5, `interval` 300 ms apart) when a token is given
 *   hang            never answers; ends only when cancelled or after `limit` milliseconds (default 600 s)
 */

/* eslint-disable @typescript-eslint/naming-convention -- MCP wire names are the subject of this spike. */

import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { createInterface } from 'node:readline';

type JsonObject = Record<string, unknown>;
type Message = { jsonrpc?: string; id?: number | string; method?: string; params?: JsonObject };

const logPath = process.argv[2];
if (!logPath) {
  process.stderr.write('usage: probe-server.ts <log.jsonl>\n');
  process.exit(2);
}

const started = Date.now();

/**
 * Appends one event to the probe log with a millisecond offset from start-up.
 *
 * @param event - Event fields; never an environment value.
 */
const log = (event: JsonObject): void => {
  appendFileSync(logPath, `${JSON.stringify({ t: Date.now() - started, ...event })}\n`);
};

/**
 * Writes one JSON-RPC message to the client.
 *
 * @param message - The message.
 */
const send = (message: JsonObject): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
};

const envNames = Object.keys(process.env).sort();
log({ event: 'start', pid: process.pid, argv: process.argv.slice(2), envNames });

const tools = [
  {
    name: 'env_names',
    description: 'Returns the names (never values) of the environment variables this server received.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'progress_probe',
    description: 'Emits progress notifications when the call carries a progressToken, then returns.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: { type: 'number' },
        interval: { type: 'number', description: 'Milliseconds between steps.' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'hang',
    description: 'Never answers; ends only when the client cancels the call or after limit milliseconds.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Milliseconds before giving up.' } },
    },
    annotations: { readOnlyHint: true },
  },
];

/** One distinct word per step, so a terminal UI that redraws only changed cells still shows each step. */
const stepWords = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet',
  'kilo',
  'lima',
];

/** Pending `hang` calls by request id, so a cancellation can be matched to its call. */
const hanging = new Map<string, NodeJS.Timeout>();

/**
 * Waits.
 *
 * @param ms - Milliseconds.
 * @returns A promise that settles after `ms`.
 */
const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Answers one `tools/call`.
 *
 * @param id - Request id.
 * @param params - Request params.
 */
const callTool = async (id: number | string, params: JsonObject): Promise<void> => {
  const name = String(params['name']);
  const args = (params['arguments'] ?? {}) as JsonObject;
  const { progressToken } = (params['_meta'] ?? {}) as JsonObject;
  log({ event: 'call', id, name, hasProgressToken: progressToken !== undefined, progressToken: progressToken ?? null });

  if (name === 'env_names') {
    send({ id, result: { content: [{ type: 'text', text: envNames.join('\n') }] } });
    return;
  }

  if (name === 'progress_probe') {
    const steps = typeof args['steps'] === 'number' ? args['steps'] : 5;
    /** Milliseconds between steps. */
    const stepInterval = typeof args['interval'] === 'number' ? args['interval'] : 300;
    let sent = 0;
    for (let step = 1; step <= steps; step += 1) {
      // eslint-disable-next-line no-await-in-loop -- the steps are sequential by design.
      await sleep(stepInterval);
      if (progressToken !== undefined) {
        send({
          method: 'notifications/progress',
          params: {
            progressToken,
            progress: step,
            total: steps,
            message: `step ${step} of ${steps} ${stepWords[(step - 1) % stepWords.length] ?? ''}`,
          },
        });
        sent += 1;
        log({ event: 'progress-sent', id, progress: step, total: steps });
      }
    }
    const text = `progress_probe done: token=${progressToken === undefined ? 'absent' : 'present'} sent=${sent}`;
    send({ id, result: { content: [{ type: 'text', text }] } });
    log({ event: 'result-sent', id, name });
    return;
  }

  if (name === 'hang') {
    /** Milliseconds before the call gives up on its own. */
    const limit = typeof args['limit'] === 'number' ? args['limit'] : 600_000;
    hanging.set(
      String(id),
      setTimeout(() => {
        hanging.delete(String(id));
        log({ event: 'hang-expired', id });
        send({ id, result: { content: [{ type: 'text', text: 'hang expired' }] } });
      }, limit),
    );
    return;
  }

  send({ id, error: { code: -32_602, message: `unknown tool ${name}` } });
};

const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (line.trim() === '') {
    return;
  }

  let message: Message;
  try {
    message = JSON.parse(line) as Message;
  } catch {
    log({ event: 'unparsable', bytes: line.length });
    return;
  }

  const params = message.params ?? {};
  log({
    event: 'recv',
    id: message.id ?? null,
    method: message.method ?? null,
    isResponse: message.method === undefined,
    ...(message.method === 'notifications/cancelled'
      ? { requestId: params['requestId'] ?? null, reason: params['reason'] ?? null }
      : {}),
    ...(message.method === 'initialize'
      ? { clientInfo: params['clientInfo'] ?? null, capabilities: params['capabilities'] ?? null }
      : {}),
  });

  if (message.method === 'notifications/cancelled') {
    const pending = hanging.get(String(params['requestId']));
    if (pending) {
      clearTimeout(pending);
      hanging.delete(String(params['requestId']));
      log({ event: 'hang-cancelled', requestId: params['requestId'] ?? null });
    }

    return;
  }

  if (message.id === undefined || message.method === undefined) {
    return;
  }

  switch (message.method) {
    case 'initialize': {
      send({
        id: message.id,
        result: {
          protocolVersion: typeof params['protocolVersion'] === 'string' ? params['protocolVersion'] : '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 's25-probe', version: '0.0.0' },
        },
      });
      break;
    }

    case 'ping': {
      send({ id: message.id, result: {} });
      break;
    }

    case 'tools/list': {
      send({ id: message.id, result: { tools } });
      break;
    }

    case 'tools/call': {
      void callTool(message.id, params);
      break;
    }

    default: {
      send({ id: message.id, error: { code: -32_601, message: `method not found: ${message.method}` } });
    }
  }
});
lines.on('close', () => {
  log({ event: 'stdin-closed' });
  process.exit(0);
});
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log({ event: 'signal', signal });
    process.exit(0);
  });
}
