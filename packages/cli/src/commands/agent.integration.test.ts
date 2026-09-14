/**
 * The scripted gate for `tau agent` and `tau host inspect`.
 *
 * A real `tau serve` daemon runs as a child process on an ephemeral port and
 * every assertion below drives it through the command surface — argv
 * in, exit code and stdout out — because that is the whole contract a script
 * has. Two stubs stand in for the network: a relay that only accepts the
 * daemon's control socket, and a gateway that holds its answer until this test
 * releases it, so "while the run is still going" is deterministic rather than
 * timing-dependent.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { createAgentChannelClient } from '@taucad/agent-host/channel-client';

import { refusalText } from '#commands/agent/client.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../../..');
const binPath = resolvePath(repoRoot, 'packages/cli/src/bin.ts');
const agentToken = 'integration-agent-token-at-least-32-characters';
/** The ACP agent the daemon advertises as `codex` under `NODE_ENV=test`. */
const fakeAcpAgent = resolvePath(repoRoot, 'packages/host/src/acp/fixtures/fake-agent.ts');

const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered: children first, then their servers.
    await dispose();
  }
});

const listen = async (server: HttpServer): Promise<number> => {
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
        /* A held request would otherwise keep `close` from ever calling back. */
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  );
  return address.port;
};

/** A relay that accepts the daemon's control socket and offers it nothing. */
const startStubRelay = async (): Promise<URL> => {
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, () => {
      /* Accepted and ignored: this test never asserts on the run directory. */
    });
  });
  return new URL(`http://127.0.0.1:${String(await listen(server))}`);
};

/**
 * A gateway that holds every turn until the test releases it.
 *
 * Releasing arms a fresh gate, so a later turn is held again — which is what
 * lets one daemon carry two runs that are both "still going" on demand.
 */
const startStubGateway = async (): Promise<{ readonly url: URL; readonly release: () => void }> => {
  let gate = Promise.withResolvers<void>();
  const server = createServer((request, response) => {
    response.on('error', () => {
      /* The daemon aborts this request when a run is cancelled; that is the
       * outcome under test, not a fixture failure. */
    });
    // async-iife: bootstrap -- node's request listener is synchronous; the stubbed turn can only be fired from here.
    void (async () => {
      for await (const _chunk of request) {
        /* Discarded: only the body's arrival matters. */
      }
      await gate.promise;
      response.writeHead(200, { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'stub-operation-agent' });
      response.write(
        'data: {"id":"chatcmpl-agent","choices":[{"index":0,"delta":{"content":"Daemon ready."},"finish_reason":null}]}\n\n',
      );
      response.write(
        'data: {"id":"chatcmpl-agent","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n',
      );
      response.write('data: [DONE]\n\n');
      response.end();
    })();
  });
  return {
    url: new URL(`http://127.0.0.1:${String(await listen(server))}`),
    release: () => {
      gate.resolve();
      gate = Promise.withResolvers<void>();
    },
  };
};

/** Environment for a child `tau`, built by assignment so no key is a source literal. */
const childEnvironment = (origin: URL | undefined): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  if (origin) {
    environment['TAU_HOST_URL'] = origin.href;
  } else {
    delete environment['TAU_HOST_URL'];
  }
  environment['TAU_HOST_AGENT_TOKEN'] = agentToken;
  environment['NO_COLOR'] = '1';
  return environment;
};

type Invocation = { readonly code: number; readonly stdout: string; readonly stderr: string };

/** Run the CLI the way a script would, and collect everything it produced. */
const tau = async (input: {
  readonly args: readonly string[];
  readonly origin?: URL | undefined;
}): Promise<Invocation> => {
  const child = spawn(process.execPath, ['--import', 'tsx', binPath, ...input.args], {
    cwd: repoRoot,
    env: childEnvironment(input.origin),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => stdout.push(Buffer.from(chunk).toString('utf8')));
  child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(Buffer.from(chunk).toString('utf8')));
  const code = await new Promise<number>((resolve) => {
    child.once('exit', (exit) => {
      resolve(exit ?? 1);
    });
  });
  return { code, stdout: stdout.join(''), stderr: stderr.join('') };
};

/** Start a `tau agent tail` that keeps running, and hand back its eventual output. */
const tailInBackground = async (origin: URL, chatId: string): Promise<Invocation> =>
  tau({ args: ['agent', 'tail', chatId, '--jsonl'], origin });

/** Spawn `tau serve` and wait for the origin it prints when the channel is up. */
const startServe = async (options: {
  readonly workspace: string;
  readonly configDirectory: string;
  readonly relayUrl: URL;
  readonly gatewayUrl: URL;
}): Promise<{ readonly url: URL; readonly kill: (signal?: NodeJS.Signals) => Promise<void> }> => {
  const environment = childEnvironment(undefined);
  environment['TAU_CONFIG_DIR'] = options.configDirectory;
  /* Vitest sets `NODE_ENV=test`, which drops consola to `warn` and silences the
   * line naming the port this test connects to. */
  environment['CONSOLA_LEVEL'] = '4';
  /* Honoured only under `NODE_ENV=test`: the daemon then advertises the
   * deterministic ACP fixture as `codex`, so `--agent` has something to reach. */
  environment['TAU_ACP_ADAPTER_OVERRIDE'] = `${fakeAcpAgent}:codex`;

  const child: ChildProcess = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      binPath,
      'serve',
      '--trust-projects',
      '--agentPort=0',
      `--workspace=${options.workspace}`,
      `--relay=${options.relayUrl.href}`,
      `--gateway=${options.gatewayUrl.href}`,
      '--model=fixture-model',
      '--modelProvider=vertexai',
    ],
    { cwd: repoRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const output: string[] = [];
  const origin = Promise.withResolvers<URL>();
  const scan = (chunk: Uint8Array<ArrayBuffer>): void => {
    const text = Buffer.from(chunk).toString('utf8');
    output.push(text);
    const match = /http:\/\/127\.0\.0\.1:(\d+)/u.exec(text);
    if (match) {
      origin.resolve(new URL(`http://127.0.0.1:${match[1]!}`));
    }
  };
  child.stdout?.on('data', scan);
  child.stderr?.on('data', scan);
  /* The child's own output never rides an `Error` message: vitest reads the
   * files a stack-shaped line names, and one bundled dependency's source-map
   * comment crashes that reader. Print it, then throw something short. */
  const report = (reason: string): Error => {
    process.stderr.write(`\n--- tau serve output ---\n${output.join('')}\n--- end ---\n`);
    return new Error(reason);
  };
  let stopping = false;
  child.once('exit', (code) => {
    if (!stopping) {
      origin.reject(report(`tau serve exited early with code ${String(code)}`));
    }
  });
  /* `SIGKILL` is how a test says "this daemon died"; `SIGTERM` is a graceful
   * stop, and a graceful stop cancels every run it was carrying. */
  const kill = async (signal: NodeJS.Signals = 'SIGTERM'): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    stopping = true;
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => {
        resolve();
      });
    });
    child.kill(signal);
    await Promise.race([
      exited,
      new Promise((resolve) => {
        setTimeout(resolve, 5000);
      }),
    ]);
    child.kill('SIGKILL');
  };
  disposers.push(async () => kill());
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(report('tau serve never announced its agent channel'));
    }, 90_000);
    timer.unref();
  });
  return { url: await Promise.race([origin.promise, deadline]), kill };
};

/** Raise an approval on a live run, which no `tau agent` command can do. */
const raiseInterrupt = async (input: {
  readonly origin: URL;
  readonly chatId: string;
  readonly runId: string;
  readonly interruptId: string;
}): Promise<void> => {
  const socket = new WebSocket(new URL('/agent', input.origin).href.replace('http:', 'ws:'), {
    headers: { authorization: `Bearer ${agentToken}` },
  });
  const client = createAgentChannelClient(socket, { sessionKey: 'tau-agent' });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  try {
    await client.execute({
      type: 'interrupt',
      chatId: input.chatId,
      runId: input.runId,
      interruptId: input.interruptId,
      kind: 'approval',
      prompt: 'May I write the plate?',
    });
  } finally {
    client.close('interrupt raised');
  }
};

/** Poll a probe until it yields a value, failing after ten seconds. */
const until = async <T>(probe: () => Promise<T | undefined>): Promise<T> => {
  const deadline = Date.now() + 10_000;
  // oxlint-disable-next-line eslint/no-await-in-loop -- polling a file the daemon writes is sequential by nature
  for (let value = await probe(); ; value = await probe()) {
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error('The probed condition did not hold within ten seconds.');
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- see above
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
};

const runIdOf = (invocation: Invocation): string => {
  const match = /^run\t(.+)$/mu.exec(invocation.stdout);
  if (!match) {
    throw new Error(`no run id in: ${invocation.stdout}${invocation.stderr}`);
  }
  return match[1]!;
};

const jsonRecords = (stdout: string): ReadonlyArray<Record<string, unknown>> =>
  stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('tau agent (scripted command projections)', () => {
  it('should drive a run, tail it as NDJSON, steer it, cancel it, and resolve its approvals', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tau-agent-cli-ws-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-agent-cli-cfg-'));
    disposers.push(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(configDirectory, { recursive: true, force: true });
    });
    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      join(configDirectory, 'host.json'),
      `${JSON.stringify({ v: 1, deviceId: 'device-1', credential: 'integration-device-credential-32-chars-min' })}\n`,
      'utf8',
    );

    const relayUrl = await startStubRelay();
    const gateway = await startStubGateway();
    const { url: origin } = await startServe({ workspace, configDirectory, relayUrl, gatewayUrl: gateway.url });

    // --- refusals, which need no host at all -------------------------------
    const unnamed = await tau({ args: ['agent', 'tail', 'chat-1'] });
    expect(unnamed.code).toBe(3);
    expect(unnamed.stderr).toContain('A Tau Host is named explicitly');
    expect(unnamed.stdout).toBe('');

    const remoteList = await tau({ args: ['agent', 'list'], origin });
    expect(remoteList.code).toBe(3);
    expect(remoteList.stderr).toContain('no command that lists chats');
    expect(remoteList.stdout).toBe('');

    const ambiguous = await tau({ args: ['agent', 'run', 'chat-1', 'hi', '--file=./nowhere.txt'], origin });
    expect(ambiguous.code).toBe(2);
    expect(ambiguous.stderr).toContain('exactly one prompt source');

    // --- discovery ---------------------------------------------------------
    const inspected = await tau({ args: ['host', 'inspect', '--json'], origin });
    expect(inspected.code).toBe(0);
    expect(jsonRecords(inspected.stdout)).toEqual([
      expect.objectContaining({ v: 1, kind: 'host', ok: true, agent: true, workspaceRoot: workspace }),
    ]);

    // --- run, tail, steer, cancel -----------------------------------------
    const started = await tau({ args: ['agent', 'run', 'chat-1', 'hello daemon', '--detach'], origin });
    expect(started.code).toBe(0);
    expect(started.stdout).toMatch(/^operation\tstart\nrun\t[\w-]+\nstate\t(admitted|running)\n$/u);
    const runId = runIdOf(started);

    const tailing = tailInBackground(origin, 'chat-1');

    const steered = await tau({ args: ['agent', 'steer', 'chat-1', runId, 'focus on the plate'], origin });
    expect(steered.code).toBe(0);
    expect(steered.stdout).toContain('operation\tsteer');

    const cancelled = await tau({ args: ['agent', 'cancel', 'chat-1', runId, '--json'], origin });
    const [cancelRecord] = jsonRecords(cancelled.stdout);
    expect(cancelRecord).toMatchObject({ v: 1, kind: 'agent', operation: 'cancel', run: runId });
    /* D12: the label is the daemon's, never this command's assumption. */
    expect(['completed', 'failed', 'cancelled']).toContain(cancelRecord?.['state']);
    expect(cancelled.code).toBe(0);

    // --- a followed run that is cancelled underneath it exits 4 --------------
    const following = tau({ args: ['agent', 'run', 'chat-cancel', 'hold this one'], origin });
    const heldRunId = await until(async () => {
      try {
        const log = await readFile(join(workspace, '.tau', 'chats', 'chat-cancel', 'events.jsonl'), 'utf8');
        const match = /"runId":"([^"]+)"/u.exec(log);
        return match?.[1];
      } catch {
        return undefined;
      }
    });
    const cancelledUnderneath = await tau({ args: ['agent', 'cancel', 'chat-cancel', heldRunId], origin });
    expect(cancelledUnderneath.stdout).toContain('operation\tcancel');
    const followed = await following;
    /* Requested but not completed: the label is the run's terminal state, the exit code is the CLI's. */
    expect(followed.code).toBe(4);
    expect(followed.stderr).toContain('ended as "cancelled"');

    // The tail follows the same run and stops when it settles.
    const tailed = await tailing;
    expect(tailed.code).toBe(0);
    const records = jsonRecords(tailed.stdout);
    expect(records.every((record) => record['v'] === 1)).toBe(true);
    expect(records.at(-1)).toMatchObject({ kind: 'outcome', ok: true, chatId: 'chat-1' });
    expect(records.some((record) => record['kind'] === 'event')).toBe(true);

    // Plain mode is line-oriented, not JSON.
    const shown = await tau({ args: ['agent', 'show', 'chat-1'], origin });
    expect(shown.code).toBe(0);
    expect(shown.stdout).toMatch(/^\d+\trun\.lifecycle\t/mu);
    expect(shown.stdout.startsWith('{')).toBe(false);

    // --- the local workspace listing --------------------------------------
    const listed = await tau({ args: ['agent', 'list', `--workspace=${workspace}`, '--json'] });
    expect(listed.code).toBe(0);
    expect(jsonRecords(listed.stdout)).toEqual([
      expect.objectContaining({
        kind: 'chats',
        chats: expect.arrayContaining([
          expect.objectContaining({ chat: 'chat-1' }),
          expect.objectContaining({ chat: 'chat-cancel' }),
        ]) as unknown,
      }),
    ]);

    // --- respond, on a real pending interrupt ------------------------------
    const second = await tau({ args: ['agent', 'run', 'chat-2', 'hello again', '--detach'], origin });
    expect(second.code).toBe(0);
    const secondRunId = runIdOf(second);
    await raiseInterrupt({ origin, chatId: 'chat-2', runId: secondRunId, interruptId: 'interrupt-1' });

    const unknownInterrupt = await tau({
      args: ['agent', 'respond', 'chat-2', secondRunId, 'interrupt-missing', 'approved'],
      origin,
    });
    expect(unknownInterrupt.code).toBe(3);
    expect(unknownInterrupt.stderr).toContain('Pending: interrupt-1');

    const responded = await tau({
      args: ['agent', 'respond', 'chat-2', secondRunId, 'interrupt-1', 'approved'],
      origin,
    });
    expect(responded.code).toBe(0);
    expect(responded.stdout).toContain('operation\tresolve-interrupt');

    gateway.release();
  }, 180_000);

  it('should end a tail without an EPIPE report when its reader closes early', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tau-agent-epipe-ws-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-agent-epipe-cfg-'));
    disposers.push(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(configDirectory, { recursive: true, force: true });
    });
    await writeFile(
      join(configDirectory, 'host.json'),
      `${JSON.stringify({ v: 1, deviceId: 'device-1', credential: 'integration-device-credential-32-chars-min' })}\n`,
      'utf8',
    );
    const relayUrl = await startStubRelay();
    const gateway = await startStubGateway();
    const { url: origin } = await startServe({ workspace, configDirectory, relayUrl, gatewayUrl: gateway.url });

    const started = await tau({ args: ['agent', 'run', 'chat-1', 'hello daemon', '--detach'], origin });
    expect(started.code).toBe(0);

    const piped = spawn(
      '/bin/sh',
      ['-c', `"$1" --import tsx "$2" agent tail chat-1 --jsonl | head -c 20`, 'sh', process.execPath, binPath],
      { cwd: repoRoot, env: childEnvironment(origin), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stderr: string[] = [];
    piped.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(Buffer.from(chunk).toString('utf8')));
    const code = await new Promise<number>((resolve) => {
      piped.once('exit', (exit) => {
        resolve(exit ?? 1);
      });
    });

    expect(stderr.join('')).not.toContain('EPIPE');
    expect(code).toBe(0);
    gateway.release();
  }, 180_000);

  it('should fail an external run whose terminal result was lost in a daemon restart', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tau-agent-acp-ws-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-agent-acp-cfg-'));
    disposers.push(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(configDirectory, { recursive: true, force: true });
    });
    await writeFile(
      join(configDirectory, 'host.json'),
      `${JSON.stringify({ v: 1, deviceId: 'device-1', credential: 'integration-device-credential-32-chars-min' })}\n`,
      'utf8',
    );
    const relayUrl = await startStubRelay();
    const gateway = await startStubGateway();
    const first = await startServe({ workspace, configDirectory, relayUrl, gatewayUrl: gateway.url });

    /* `slow` holds the fixture's turn open, so "the daemon died mid-run" is a
     * fact of the test rather than a race against a fast adapter. */
    const started = await tau({
      args: ['agent', 'run', 'chat-acp', 'slow please', '--agent=codex', '--model=gpt-5.3-codex', '--detach'],
      origin: first.url,
    });
    expect(started.code).toBe(0);
    const log = join(workspace, '.tau', 'chats', 'chat-acp', 'events.jsonl');
    const admitted = await until(async () => {
      const text = await readFile(log, 'utf8').catch(() => '');
      return text.includes('"acpSessionId"') ? text : undefined;
    });
    expect(admitted).toContain('"agentId":"codex"');
    expect(admitted).toContain('"model":"gpt-5.3-codex"');

    await first.kill('SIGKILL');
    expect(await readFile(log, 'utf8')).not.toContain('"state":"completed"');
    // The killed daemon's `<log>.lock` stays on disk; the next writer takes it over by pid liveness.

    /* A fresh daemon over the same workspace holds no run at all: only an
     * `attach` recovers one, and `tail` is the command that sends it. */
    const second = await startServe({ workspace, configDirectory, relayUrl, gatewayUrl: gateway.url });
    const tailed = await tau({ args: ['agent', 'tail', 'chat-acp'], origin: second.url });
    expect(tailed.code).toBe(3);
    expect(tailed.stdout).toContain('run.lifecycle\tfailed');
    expect(tailed.stdout).toContain('EXTERNAL_AGENT_RECOVERY_UNKNOWN');
    gateway.release();
  }, 180_000);

  it('should exit refused with the typed code when an external agent turns the turn down', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tau-agent-refuse-ws-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-agent-refuse-cfg-'));
    disposers.push(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(configDirectory, { recursive: true, force: true });
    });
    await writeFile(
      join(configDirectory, 'host.json'),
      `${JSON.stringify({ v: 1, deviceId: 'device-1', credential: 'integration-device-credential-32-chars-min' })}\n`,
      'utf8',
    );
    const relayUrl = await startStubRelay();
    const gateway = await startStubGateway();
    const { url: origin } = await startServe({ workspace, configDirectory, relayUrl, gatewayUrl: gateway.url });

    const refused = await tau({
      args: ['agent', 'run', 'chat-refused', 'noask write it', '--agent=codex', '--model=no-such-model'],
      origin,
    });
    expect(refused.code).toBe(3);
    expect(refused.stderr).toContain('EXTERNAL_AGENT_MODEL_UNAVAILABLE');

    const withoutAgent = await tau({ args: ['agent', 'run', 'chat-refused', 'hi', '--model=whatever'], origin });
    expect(withoutAgent.code).toBe(2);
    gateway.release();
  }, 180_000);
});

describe('external-agent refusal rendering', () => {
  it('should name every VSC4 code and what the user can do about it', async () => {
    /* Imported here, not at module scope: `@taucad/agent-host` is lazy-loaded on
     * this package's own first-paint path, and the boundary rule enforces it. */
    const { externalAgentRefusalCodes } = await import('@taucad/agent-host');
    expect(externalAgentRefusalCodes.length).toBeGreaterThan(0);
    for (const code of externalAgentRefusalCodes) {
      expect(refusalText({ code, message: 'The agent said no.' })).toBe(`${code}: The agent said no.`);
    }
  });

  it('should print the login command an auth refusal offered, verbatim', () => {
    const rendered = refusalText({
      code: 'EXTERNAL_AGENT_AUTH_REQUIRED',
      message: 'codex needs you to sign in.',
      login: {
        kind: 'external-agent-login',
        agentId: 'codex',
        authMethods: [{ id: 'terminal-auth', name: 'Sign in with Codex', terminalCommand: 'codex login' }],
      },
    });
    expect(rendered).toContain('EXTERNAL_AGENT_AUTH_REQUIRED: codex needs you to sign in.');
    expect(rendered).toContain('codex login');
  });

  it('should print the verification page and code of a device-code login', () => {
    const rendered = refusalText({
      code: 'EXTERNAL_AGENT_AUTH_REQUIRED',
      message: 'codex needs you to sign in.',
      login: {
        kind: 'external-agent-login',
        agentId: 'codex',
        authMethods: [],
        url: 'https://example.invalid/device',
        code: 'FAKE-CODE',
      },
    });
    expect(rendered).toContain('https://example.invalid/device');
    expect(rendered).toContain('FAKE-CODE');
  });
});
