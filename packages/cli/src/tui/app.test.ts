/**
 * The gate for `tau tui`.
 *
 * The app is mounted in this process against injected streams, but everything
 * on the other side of the socket is real: a `tau serve` child on an ephemeral
 * port, started exactly the way `agent.integration.test.ts` starts one, with a
 * stub relay that accepts its control socket and a stub gateway that never
 * answers, so every run stays alive for as long as a keypress needs it to.
 *
 * The refusal test is the one that runs as a child, because "there is no TTY"
 * is only true of a real process's real streams.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import type { AgentLogEvent } from '@taucad/agent-host';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import type { CommandAnswer, ReadAnswer } from '@taucad/agent-host/wire';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { WebSocket, WebSocketServer } from 'ws';

import { runTui } from '#tui/app.js';
import * as agentClient from '#commands/agent/client.js';

/*
 * Ink reads `is-in-ci` once, when it is first imported, and under `CI` or
 * `CONTINUOUS_INTEGRATION` writes nothing but the last frame on unmount. Every
 * assertion here reads frames painted while the app runs, so Ink must load
 * with both cleared; `vi.hoisted` runs before the imports above, and the
 * originals come back once Ink has loaded so the daemon children see the
 * runner's real environment.
 */
const ciEnvironment = vi.hoisted(() => {
  const saved = { ci: process.env['CI'], continuousIntegration: process.env['CONTINUOUS_INTEGRATION'] };
  delete process.env['CI'];
  delete process.env['CONTINUOUS_INTEGRATION'];
  return saved;
});
if (ciEnvironment.ci !== undefined) {
  process.env['CI'] = ciEnvironment.ci;
}
if (ciEnvironment.continuousIntegration !== undefined) {
  process.env['CONTINUOUS_INTEGRATION'] = ciEnvironment.continuousIntegration;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../../..');
const binPath = resolvePath(repoRoot, 'packages/cli/src/bin.ts');
const agentToken = 'integration-agent-token-at-least-32-characters';
/** The ACP agent the daemon advertises as `codex` under `NODE_ENV=test`. */
const fakeAcpAgent = resolvePath(repoRoot, 'packages/host/src/acp/fixtures/fake-agent.ts');

/** The choices the raised approval offers, and what `y` must therefore send. */
const offeredOptions = [
  { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' },
];

const disposers: Array<() => Promise<void> | void> = [];

/**
 * A stdin that claims to be a terminal and records every raw-mode change.
 *
 * Ink reads with `read()` from a `readable` listener and toggles raw mode
 * around its own lifetime, so a duplex stream plus the three TTY members is
 * the whole surface it touches — and the recorded toggles are how this test
 * proves the terminal was handed back.
 */
class FakeStdin extends PassThrough {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- `isTTY` is Node's own member name; a camelCase one would not be read.
  public isTTY = true;

  public isRaw = false;

  public readonly rawModeCalls: boolean[] = [];

  public setRawMode(raw: boolean): this {
    this.isRaw = raw;
    this.rawModeCalls.push(raw);
    return this;
  }

  public ref(): this {
    return this;
  }

  public unref(): this {
    return this;
  }
}

/** A stdout that reports a fixed window; frames are collected from its own data events. */
class FakeStdout extends PassThrough {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- `isTTY` is Node's own member name; a camelCase one would not be read.
  public isTTY = true;

  public columns = 120;

  public rows = 30;
}

/*
 * Ink's `render` takes the nominal `tty` stream types. A duplex stream carrying
 * the TTY members is what every Ink test harness passes it, and `mock<T>()`
 * cannot stand in here: Ink attaches real listeners and reads real bytes, which
 * a Proxy of stubbed methods never delivers. `tty.ReadStream`/`tty.WriteStream`
 * carry ~15 `net.Socket` members Ink never calls and a duplex stream cannot
 * have, so the two assertions below are the whole seam — kept in this one
 * factory, never repeated in a test body.
 */
type Terminal = {
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly output: () => string;
  readonly rawModeCalls: () => readonly boolean[];
};

const createTerminal = (): Terminal => {
  const input = new FakeStdin();
  const output = new FakeStdout();
  const frames: string[] = [];
  output.on('data', (chunk: Uint8Array<ArrayBuffer>) => frames.push(Buffer.from(chunk).toString('utf8')));
  return {
    stdin: input as unknown as NodeJS.ReadStream,
    stdout: output as unknown as NodeJS.WriteStream,
    output: () => frames.join(''),
    rawModeCalls: () => input.rawModeCalls,
  };
};

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

/** A gateway that never answers, so every run this file starts is still alive. */
const startHeldGateway = async (): Promise<URL> => {
  const server = createServer((request, response) => {
    response.on('error', () => {
      /* The daemon aborts this request when a run is cancelled; that is the
       * outcome under test, not a fixture failure. */
    });
    // async-iife: bootstrap -- node's request listener is synchronous.
    void (async () => {
      for await (const _chunk of request) {
        /* Discarded: only the body's arrival matters. */
      }
    })();
  });
  return new URL(`http://127.0.0.1:${String(await listen(server))}`);
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

/** Spawn `tau serve` and wait for the origin it prints when the channel is up. */
const startServe = async (options: {
  readonly workspace: string;
  readonly configDirectory: string;
  readonly relayUrl: URL;
  readonly gatewayUrl: URL;
  readonly liveCodex?: boolean;
}): Promise<URL> => {
  const environment = childEnvironment(undefined);
  environment['TAU_CONFIG_DIR'] = options.configDirectory;
  environment['CONSOLA_LEVEL'] = '4';
  /* Honoured only under `NODE_ENV=test`, which vitest sets and the child
   * inherits: the daemon then advertises the deterministic fixture as `codex`. */
  if (options.liveCodex) {
    delete environment['TAU_ACP_ADAPTER_OVERRIDE'];
  } else {
    environment['TAU_ACP_ADAPTER_OVERRIDE'] = `${fakeAcpAgent}:codex`;
  }

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
  const collected: string[] = [];
  const origin = Promise.withResolvers<URL>();
  const scan = (chunk: Uint8Array<ArrayBuffer>): void => {
    const text = Buffer.from(chunk).toString('utf8');
    collected.push(text);
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
    process.stderr.write(`\n--- tau serve output ---\n${collected.join('')}\n--- end ---\n`);
    return new Error(reason);
  };
  child.once('exit', (code) => {
    origin.reject(report(`tau serve exited early with code ${String(code)}`));
  });
  disposers.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => {
        child.once('exit', () => {
          resolve();
        });
      });
      child.kill('SIGTERM');
      await Promise.race([
        exited,
        new Promise((resolve) => {
          setTimeout(resolve, 5000);
        }),
      ]);
      child.kill('SIGKILL');
    }
  });
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(report('tau serve never announced its agent channel'));
    }, 90_000);
    timer.unref();
  });
  return Promise.race([origin.promise, deadline]);
};

/** Raise an approval on a live run, which no keypress can do. */
const raiseInterrupt = async (input: {
  readonly origin: URL;
  readonly chatId: string;
  readonly runId: string;
  readonly interruptId: string;
}): Promise<void> => {
  const client = createAgentChannelClient({
    connect: () =>
      new WebSocket(new URL('/agent', input.origin).href.replace('http:', 'ws:'), {
        headers: { authorization: `Bearer ${agentToken}` },
      }),
  });
  try {
    await client.execute({
      type: 'interrupt',
      commandId: `raise-${input.interruptId}`,
      payload: {
        chatId: input.chatId,
        runId: input.runId,
        interruptId: input.interruptId,
        kind: 'approval',
        prompt: 'May I write the plate?',
        payload: { options: offeredOptions },
      },
    });
  } finally {
    client.close('interrupt raised');
  }
};

/**
 * Let the app read one chunk before the next keystroke is written.
 *
 * Ink drains everything buffered on one `readable`, so two writes in the same
 * tick arrive as one chunk — and `ESC` followed by `q` then parses as meta-q
 * rather than as escape, then quit.
 */
const settle = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

/** Poll a probe until it yields a value, failing after twenty seconds. */
const until = async <T>(probe: () => Promise<T | undefined> | T | undefined, what = 'condition'): Promise<T> => {
  const deadline = Date.now() + 20_000;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling what a daemon writes is sequential by nature.
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`The probed ${what} did not hold within twenty seconds.`);
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
};

let workspace = '';
let origin = new URL('http://127.0.0.1:0');

/** Read the chat's durable log, or nothing when it has not been written yet. */
const chatLog = async (chatId: string): Promise<string> => {
  try {
    return await readFile(join(workspace, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8');
  } catch {
    return '';
  }
};

/** The run id the daemon minted for a chat's first turn. */
const firstRunId = async (chatId: string): Promise<string> =>
  until(async () => {
    const log = await chatLog(chatId);
    return /"runId":"([^"]+)"/u.exec(log)?.[1];
  }, 'run id');

const mounted: Array<{ readonly terminal: Terminal; readonly finished: Promise<void> }> = [];

/**
 * Mount the app against a fresh fake terminal and hand back both halves.
 *
 * A failed assertion must not leave an app polling the shared daemon for the
 * rest of the file, so every mount is detached in `afterEach` whether or not
 * its test pressed `q`.
 */
const mount = (
  chatId: string,
  agent?: { readonly id: string; readonly model?: string },
): { readonly terminal: Terminal; readonly finished: Promise<void> } => {
  const terminal = createTerminal();
  const app = {
    terminal,
    finished: runTui({
      host: origin.href,
      chatId,
      from: 0,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      ...(agent === undefined ? {} : { agent }),
    }),
  };
  mounted.push(app);
  return app;
};

/** Type a prompt and submit it. */
const submit = async (terminal: Terminal, prompt: string): Promise<void> => {
  await untilPainted(terminal, /Following /u);
  terminal.stdin.write(prompt);
  await until(() => (terminal.output().includes(prompt) ? true : undefined), `prompt "${prompt}"`);
  terminal.stdin.write('\r');
};

/**
 * Wait until something the app has painted matches.
 *
 * A timeout reports the last frame with its escape sequences stripped, because
 * "the app never painted X" is only actionable next to what it did paint.
 */
const untilPainted = async (terminal: Terminal, pattern: RegExp): Promise<void> => {
  try {
    await until(() => (pattern.test(terminal.output()) ? true : undefined), `painted ${pattern.source}`);
  } catch (error) {
    const frame = terminal
      .output()
      // oxlint-disable-next-line no-control-regex -- reading a terminal frame means matching its control bytes.
      .replaceAll(/\u001B[@-_][\d ;?]*[@-~]?/gu, '')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .slice(-24)
      .join('\n');
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nLast frame:\n${frame}`);
  }
};

describe('tau tui', () => {
  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'tau-tui-ws-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-tui-cfg-'));
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
    const gatewayUrl = await startHeldGateway();
    origin = await startServe({ workspace, configDirectory, relayUrl, gatewayUrl });
    process.env['TAU_HOST_AGENT_TOKEN'] = agentToken;
  }, 180_000);

  afterEach(async () => {
    for (const app of mounted.splice(0)) {
      /* Escape first: `q` is a command letter only on an empty prompt, and a
       * test that left a draft behind would otherwise type into it forever. */
      app.terminal.stdin.write('\u001B');
      // oxlint-disable-next-line eslint/no-await-in-loop -- each app is detached before the next.
      await settle();
      app.terminal.stdin.write('q');
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each app is detached before the next.
        await app.finished;
      } catch {
        /* A test that already failed does not need a second failure here. */
      }
    }
  });

  afterAll(async () => {
    for (const dispose of disposers.splice(0).reverse()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- teardown is ordered: children first, then their servers.
      await dispose();
    }
  }, 30_000);

  it('should start a run from a typed prompt, render its transcript, and restore the terminal on q', async () => {
    const { terminal, finished } = mount('chat-tui-run');
    await untilPainted(terminal, /chat-tui-run/u);
    expect(terminal.rawModeCalls()).toContain(true);

    await submit(terminal, 'hello daemon');
    await untilPainted(terminal, /start: applied at \d+/u);
    // The transcript rows are the daemon's durable events, not this view's echo.
    await untilPainted(terminal, /0 {2}run\.lifecycle {2}admitted/u);
    await untilPainted(terminal, /run running/u);
    // The typed keystrokes reached the daemon's durable log, not just the frame.
    expect(await chatLog('chat-tui-run')).toContain('hello daemon');

    terminal.stdin.write('q');
    await expect(finished).resolves.toBeUndefined();
    expect(terminal.rawModeCalls().at(-1)).toBe(false);
    // Detached, not stopped: the daemon still holds the run this chat started.
    expect(await chatLog('chat-tui-run')).not.toContain('"state":"cancelled"');
  }, 120_000);

  it.skipIf(process.env['TAU_ACP_LIVE_TESTS'] !== 'true')(
    'runs a live Codex turn from the TUI keyboard',
    async () => {
      const liveWorkspace = await mkdtemp(join(tmpdir(), 'tau-tui-live-ws-'));
      const configDirectory = await mkdtemp(join(tmpdir(), 'tau-tui-live-cfg-'));
      disposers.push(async () => {
        await rm(liveWorkspace, { recursive: true, force: true });
        await rm(configDirectory, { recursive: true, force: true });
      });
      await writeFile(
        join(configDirectory, 'host.json'),
        JSON.stringify({ v: 1, deviceId: 'device-live', credential: 'integration-device-credential-32-chars-min' }),
      );
      const liveOrigin = await startServe({
        workspace: liveWorkspace,
        configDirectory,
        relayUrl: await startStubRelay(),
        gatewayUrl: await startHeldGateway(),
        liveCodex: true,
      });
      const terminal = createTerminal();
      const model = process.env['TAU_ACP_LIVE_CODEX_MODEL'] ?? 'gpt-5.6-sol';
      const finished = runTui({
        host: liveOrigin.href,
        chatId: 'chat-live-tui',
        from: 0,
        stdin: terminal.stdin,
        stdout: terminal.stdout,
        agent: { id: 'codex', model },
      });
      mounted.push({ terminal, finished });
      await submit(terminal, 'Reply only with the word seahorse.');
      await expect.poll(terminal.output, { timeout: 120_000 }).toContain('completed');
      expect(terminal.output()).toContain('seahorse');
      expect(terminal.output()).toContain('codex');
      const log = await readFile(join(liveWorkspace, '.tau/chats/chat-live-tui/events.jsonl'), 'utf8');
      expect(log).toContain(`"model":"${model}"`);
      expect(log).toContain('"state":"completed"');
      terminal.stdin.write('q');
      await expect(finished).resolves.toBeUndefined();
      expect(terminal.rawModeCalls().at(-1)).toBe(false);
    },
    180_000,
  );

  it('should resolve a pending approval with the option id the request offered', async () => {
    const { terminal, finished } = mount('chat-tui-approve');
    await submit(terminal, 'hold for approval');
    const runId = await firstRunId('chat-tui-approve');
    await raiseInterrupt({ origin, chatId: 'chat-tui-approve', runId, interruptId: 'interrupt-1' });

    await untilPainted(terminal, /Approval needed: May I write the plate\?/u);
    // The banner names the exact ids `y` and `n` will send, and invents none.
    await untilPainted(terminal, /y sends Allow once \(allow-once\), n sends Reject once \(reject-once\)/u);

    terminal.stdin.write('y');
    await untilPainted(terminal, /approve: (applied at \d+|nothing recorded)/u);
    const resolved = await until(async () => {
      const log = await chatLog('chat-tui-approve');
      return log
        .split('\n')
        .find((line) => line.includes('"phase":"resolved"') && line.includes('"interruptId":"interrupt-1"'));
    }, 'resolved interrupt');
    expect(resolved).toContain('"outcome":"approved"');
    expect(resolved).toContain('"optionId":"allow-once"');

    terminal.stdin.write('q');
    await expect(finished).resolves.toBeUndefined();
  }, 120_000);

  it('should report the label the daemon returned for a cancel', async () => {
    const { terminal, finished } = mount('chat-tui-cancel');
    await submit(terminal, 'hold this one');
    await untilPainted(terminal, /start: applied at \d+/u);

    terminal.stdin.write('c');
    /* D12: the answer is the daemon's words: the terminal row's cursor, or the state it found. */
    await untilPainted(terminal, /cancel: (applied at \d+|nothing recorded)/u);

    terminal.stdin.write('q');
    await expect(finished).resolves.toBeUndefined();
  }, 120_000);

  it('should run a turn on the named external agent, title its tool calls, and never steer it', async () => {
    const { terminal, finished } = mount('chat-tui-acp', { id: 'codex', model: 'gpt-5.3-codex' });
    /* The status line names both before a single event exists: what this view
     * will ask for is a fact of the invocation, not of the log. */
    await untilPainted(terminal, /codex · gpt-5\.3-codex/u);

    await submit(terminal, 'noask write it');
    const marker = await until(async () => {
      const log = await chatLog('chat-tui-acp');
      return log.includes('"kind":"external-agent"') ? log : undefined;
    }, 'external marker');
    expect(marker).toContain('"agentId":"codex"');
    expect(marker).toContain('"model":"gpt-5.3-codex"');

    /* One titled line per `call` fact, the title plain and unpainted: this
     * process's stdout is not a TTY, so `paintGlyph` withholds the colour. */
    await untilPainted(terminal, /[○●✓] write hello\.txt/u);
    expect(terminal.output()).not.toContain('[32m✓');
    await untilPainted(terminal, /run completed/u);

    /* A live external run cannot be steered, and the refusal is this view's own
     * — a `steer` command would only be refused by the host after the fact. */
    const secondTurnOutputStart = terminal.output().length;
    await submit(terminal, 'slow noask again');
    /* The transcript row, not the log file: the run is only "live" to this view
     * once the page carrying its admission has been folded. */
    await untilPainted(terminal, /user slow noask again/u);
    expect(terminal.output().slice(secondTurnOutputStart)).not.toContain('start failed:');
    await until(() =>
      /enter keeps draft until this external run settles/u.test(terminal.output().slice(secondTurnOutputStart))
        ? true
        : undefined,
    );
    terminal.stdin.write('nudge');
    await untilPainted(terminal, /nudge/u);
    terminal.stdin.write('\r');
    await untilPainted(terminal, /EXTERNAL_AGENT_UNSUPPORTED/u);
    expect(terminal.output()).not.toContain('steer failed');
    expect(await chatLog('chat-tui-acp')).not.toContain('nudge');

    /* The refused prompt is still in the draft — which is the point — so it is
     * dropped with escape before `q` is a command letter again. */
    terminal.stdin.write('\u001B');
    await settle();
    terminal.stdin.write('q');
    await expect(finished).resolves.toBeUndefined();
  }, 120_000);

  it('should stop a settling start on cancel and restore its draft', async () => {
    const client = mock<AgentChannelClient>();
    client.execute.mockImplementation(async (command) =>
      command.type === 'attach'
        ? {
            commandId: command.commandId,
            generation: 1,
            status: 'applied',
            effect: 'not-applied',
            details: { endCursor: 0 },
          }
        : {
            commandId: command.commandId,
            generation: 1,
            status: 'refused',
            effect: 'not-applied',
            code: 'CHAT_RUN_LIVE',
            message: 'The previous run is settling.',
            details: { state: 'settling' },
          },
    );
    const opened = vi.spyOn(agentClient, 'openAgentChannel').mockResolvedValue({
      client,
      url: new URL('http://127.0.0.1:1'),
    });
    const replay = vi.spyOn(agentClient, 'readNext').mockImplementation(async ({ ledger, signal }) => {
      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      return { ledger, events: [], endCursor: 0, reset: false, sourceHealth: undefined };
    });
    try {
      const terminal = createTerminal();
      const finished = runTui({
        host: 'http://127.0.0.1:1',
        chatId: 'chat-tui-settling-cancel',
        from: 0,
        stdin: terminal.stdin,
        stdout: terminal.stdout,
      });
      mounted.push({ terminal, finished });
      await submit(terminal, 'make a plate');
      await until(() => (client.execute.mock.calls.some(([command]) => command.type === 'start') ? true : undefined));
      const beforeCancel = terminal.output().length;
      terminal.stdin.write('c');
      await until(() => (terminal.output().slice(beforeCancel).includes('> make a plate') ? true : undefined));
      const starts = client.execute.mock.calls.filter(([command]) => command.type === 'start');
      expect(starts).toHaveLength(1);
      expect(client.execute.mock.calls.filter(([command]) => command.type === 'cancel')).toHaveLength(0);
      terminal.stdin.write('\u001B');
      await settle();
      terminal.stdin.write('q');
      await expect(finished).resolves.toBeUndefined();
    } finally {
      replay.mockRestore();
      opened.mockRestore();
    }
  });

  it('should cancel the newly admitted run when cancel was pressed before its start answer', async () => {
    const client = mock<AgentChannelClient>();
    const startAnswer = Promise.withResolvers<CommandAnswer>();
    client.execute.mockImplementation(async (command) => {
      if (command.type === 'attach') {
        return {
          commandId: command.commandId,
          generation: 1,
          status: 'applied',
          effect: 'not-applied',
          details: { endCursor: 0 },
        };
      }
      if (command.type === 'start') {
        return startAnswer.promise;
      }
      return { commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 2 };
    });
    const opened = vi.spyOn(agentClient, 'openAgentChannel').mockResolvedValue({
      client,
      url: new URL('http://127.0.0.1:1'),
    });
    const oldRun: AgentLogEvent = {
      version: 1,
      leaderEpoch: 'epoch-1',
      sequence: 0,
      recordedAt: new Date(0).toISOString(),
      runId: 'old-run',
      type: 'run.lifecycle',
      state: 'completed',
    };
    const replay = vi.spyOn(agentClient, 'readNext').mockImplementation(async ({ ledger, signal }) => {
      if (ledger.position.cursor === 0) {
        return {
          ledger: { ...ledger, position: { cursor: 1 } },
          events: [oldRun],
          endCursor: 1,
          reset: false,
          sourceHealth: undefined,
        };
      }
      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      return { ledger, events: [], endCursor: 1, reset: false, sourceHealth: undefined };
    });
    try {
      const terminal = createTerminal();
      const finished = runTui({
        host: 'http://127.0.0.1:1',
        chatId: 'chat-tui-cancel-unanswered',
        from: 0,
        stdin: terminal.stdin,
        stdout: terminal.stdout,
      });
      mounted.push({ terminal, finished });
      await untilPainted(terminal, /run completed/u);
      await submit(terminal, 'make the next plate');
      const start = await until(() => client.execute.mock.calls.find(([command]) => command.type === 'start')?.[0]);
      if (start.type !== 'start') {
        throw new TypeError('Expected a start command.');
      }
      terminal.stdin.write('c');
      await settle();
      expect(client.execute.mock.calls.filter(([command]) => command.type === 'cancel')).toHaveLength(0);

      startAnswer.resolve({
        commandId: start.commandId,
        generation: 1,
        status: 'applied',
        effect: 'durable',
        cursor: 1,
      });
      const cancelled = await until(
        () => client.execute.mock.calls.find(([command]) => command.type === 'cancel')?.[0],
      );
      if (cancelled.type !== 'cancel') {
        throw new TypeError('Expected a cancel command.');
      }
      expect(cancelled.payload.runId).toBe(start.payload.runId);
      expect(cancelled.payload.runId).not.toBe('old-run');
      expect(client.execute.mock.calls.filter(([command]) => command.type === 'cancel')).toHaveLength(1);
      await untilPainted(terminal, /cancel: applied at 2/u);
      terminal.stdin.write('q');
      await expect(finished).resolves.toBeUndefined();
    } finally {
      replay.mockRestore();
      opened.mockRestore();
    }
  });

  it('keeps the current external run selected when an older turn settles late', async () => {
    const client = mock<AgentChannelClient>();
    client.execute.mockImplementation(async (command) => ({
      commandId: command.commandId,
      generation: 1,
      status: 'applied',
      effect: 'durable',
      cursor: 0,
    }));
    const chatId = 'chat-tui-late-settlement';
    const base = { version: 1, leaderEpoch: 'epoch-1', recordedAt: new Date(0).toISOString() } as const;
    const events = [
      {
        ...base,
        sequence: 0,
        runId: 'old-run',
        type: 'run.lifecycle',
        state: 'completed',
      },
      {
        ...base,
        sequence: 1,
        runId: 'new-run',
        type: 'message.appended',
        message: {
          id: 'new-user',
          role: 'user',
          content: 'slow noask again',
          metadata: { tauInternal: { kind: 'external-agent', agentId: 'codex', model: 'gpt-5.3-codex' } },
        },
      },
      { ...base, sequence: 2, runId: 'new-run', type: 'run.lifecycle', state: 'admitted' },
      { ...base, sequence: 3, runId: 'new-run', type: 'run.lifecycle', state: 'running' },
      {
        ...base,
        sequence: 4,
        runId: 'old-run',
        type: 'turn.finalized',
        turnId: 'old-user',
        chatId,
        projectId: 'project-1',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['old-run'],
      },
      {
        ...base,
        sequence: 5,
        runId: 'old-run',
        type: 'message.envelope-replaced',
        messageId: 'old-assistant',
        replacement: { id: 'old-assistant', role: 'assistant', content: 'late old envelope' },
      },
      {
        ...base,
        sequence: 6,
        runId: 'new-run',
        type: 'message.appended',
        message: { id: 'new-assistant', role: 'assistant', content: 'new turn is active' },
      },
    ] satisfies AgentLogEvent[];
    const opened = vi.spyOn(agentClient, 'openAgentChannel').mockResolvedValue({
      client,
      url: new URL('http://127.0.0.1:1'),
    });
    const replay = vi.spyOn(agentClient, 'readNext').mockImplementation(async ({ ledger, signal }) => {
      if (ledger.position.cursor === 0) {
        return {
          ledger: { ...ledger, position: { cursor: events.length } },
          events,
          endCursor: events.length,
          reset: false,
          sourceHealth: undefined,
        };
      }
      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      return { ledger, events: [], endCursor: events.length, reset: false, sourceHealth: undefined };
    });
    try {
      const terminal = createTerminal();
      const finished = runTui({
        host: 'http://127.0.0.1:1',
        chatId,
        from: 0,
        stdin: terminal.stdin,
        stdout: terminal.stdout,
      });
      mounted.push({ terminal, finished });
      await untilPainted(terminal, /6 {2}message\.appended {2}assistant new turn is active/u);
      const beforeKeypress = terminal.output().length;
      terminal.stdin.write('nudge');
      await until(() => (terminal.output().slice(beforeKeypress).includes('> nudge') ? true : undefined));
      terminal.stdin.write('\r');
      await untilPainted(terminal, /EXTERNAL_AGENT_UNSUPPORTED/u);
      expect(terminal.output()).toContain('4  turn.finalized');
      expect(terminal.output()).toContain('5  message.envelope-replaced');
      expect(terminal.output()).not.toContain('steer failed');
      expect(client.execute.mock.calls.some(([command]) => command.type === 'steer')).toBe(false);
      terminal.stdin.write('\u001B');
      await settle();
      terminal.stdin.write('q');
      await expect(finished).resolves.toBeUndefined();
    } finally {
      replay.mockRestore();
      opened.mockRestore();
    }
  }, 120_000);

  it('steers a locally started Tau run after an external turn completed', async () => {
    const client = mock<AgentChannelClient>();
    const chatId = 'chat-tui-external-to-tau';
    const base = { version: 1, leaderEpoch: 'epoch-1', recordedAt: new Date(0).toISOString() } as const;
    const events = [
      {
        ...base,
        sequence: 0,
        runId: 'external-run',
        type: 'message.appended',
        message: {
          id: 'external-user',
          role: 'user',
          content: 'external turn',
          metadata: { tauInternal: { kind: 'external-agent', agentId: 'codex' } },
        },
      },
      { ...base, sequence: 1, runId: 'external-run', type: 'run.lifecycle', state: 'admitted' },
      { ...base, sequence: 2, runId: 'external-run', type: 'run.lifecycle', state: 'completed' },
    ] satisfies AgentLogEvent[];
    let startedRunId: string | undefined;
    client.execute.mockImplementation(async (command) => {
      if (command.type === 'attach') {
        return { commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 0 };
      }
      if (command.type === 'start') {
        startedRunId = command.payload.runId;
        return {
          commandId: command.commandId,
          generation: 1,
          status: 'applied',
          effect: 'durable',
          cursor: events.length,
        };
      }
      if (command.type === 'steer') {
        return {
          commandId: command.commandId,
          generation: 1,
          status: 'applied',
          effect: 'durable',
          cursor: events.length,
        };
      }
      throw new Error(`unexpected ${command.type} command`);
    });
    const opened = vi.spyOn(agentClient, 'openAgentChannel').mockResolvedValue({
      client,
      url: new URL('http://127.0.0.1:1'),
    });
    const replay = vi.spyOn(agentClient, 'readNext').mockImplementation(async ({ ledger, signal }) => {
      if (ledger.position.cursor === 0) {
        return {
          ledger: { ...ledger, position: { cursor: events.length } },
          events,
          endCursor: events.length,
          reset: false,
          sourceHealth: undefined,
        };
      }
      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      return { ledger, events: [], endCursor: events.length, reset: false, sourceHealth: undefined };
    });
    try {
      const terminal = createTerminal();
      const finished = runTui({
        host: 'http://127.0.0.1:1',
        chatId,
        from: 0,
        stdin: terminal.stdin,
        stdout: terminal.stdout,
      });
      mounted.push({ terminal, finished });
      await untilPainted(terminal, /run completed/u);
      const localOutputStart = terminal.output().length;
      await submit(terminal, 'local turn');
      await until(() => startedRunId);
      await until(() => (/enter steers/u.test(terminal.output().slice(localOutputStart)) ? true : undefined));
      await submit(terminal, 'nudge local');
      await until(() => (client.execute.mock.calls.some(([command]) => command.type === 'steer') ? true : undefined));
      expect(client.execute.mock.calls).toContainEqual([
        expect.objectContaining({ type: 'steer', payload: { chatId, runId: startedRunId, message: 'nudge local' } }),
      ]);
      expect(terminal.output()).not.toContain('EXTERNAL_AGENT_UNSUPPORTED');
      terminal.stdin.write('q');
      await expect(finished).resolves.toBeUndefined();
    } finally {
      replay.mockRestore();
      opened.mockRestore();
    }
  }, 120_000);

  it('shows an interrupted ACP run as abandoned on reattach without repeating the turn', async () => {
    const chatId = 'chat-tui-acp-recovery';
    const directory = join(workspace, '.tau', 'chats', chatId);
    await mkdir(directory, { recursive: true });
    const base = {
      version: 1,
      leaderEpoch: 'epoch-before-restart',
      recordedAt: new Date(0).toISOString(),
      runId: 'run-tui-acp-recovery',
    };
    // The same interrupted durable tail used by the host's recovery gate.
    await writeFile(
      join(directory, 'events.jsonl'),
      [
        {
          ...base,
          sequence: 0,
          type: 'message.appended',
          message: {
            id: 'user-recovery',
            role: 'user',
            content: 'do not repeat this turn',
            metadata: {
              tauInternal: { kind: 'external-agent', agentId: 'codex', acpSessionId: 'fake-session-1' },
            },
          },
        },
        { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted', storageDurability: 'exclusive-append' },
        { ...base, sequence: 2, type: 'run.lifecycle', state: 'running' },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n'),
    );

    const errors = vi.spyOn(console, 'error');
    try {
      const { terminal, finished } = mount(chatId, { id: 'codex' });
      await untilPainted(terminal, /RUN_ABANDONED/u);
      await untilPainted(terminal, /run failed/u);
      const log = await chatLog(chatId);
      expect(log.match(/"role":"user"/gu)).toHaveLength(1);
      expect(log).not.toContain('"role":"tool-input"');
      expect(log).not.toContain('"state":"completed"');
      expect(errors.mock.calls.filter(([message]) => String(message).includes('same key'))).toHaveLength(0);
      terminal.stdin.write('q');
      await expect(finished).resolves.toBeUndefined();
    } finally {
      errors.mockRestore();
    }
  }, 120_000);

  it('should render a typed external-agent refusal with the code the host returned', async () => {
    const { terminal, finished } = mount('chat-tui-acp-refused', { id: 'codex', model: 'no-such-model' });
    await submit(terminal, 'noask write it');
    await untilPainted(terminal, /EXTERNAL_AGENT_MODEL_UNAVAILABLE/u);

    terminal.stdin.write('q');
    await expect(finished).resolves.toBeUndefined();
  }, 120_000);

  it('should refuse without a terminal and name the scripted command instead', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', binPath, 'tui', 'chat-tui-run'], {
      cwd: repoRoot,
      env: childEnvironment(origin),
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

    expect(code).toBe(3);
    expect(stdout.join('')).toBe('');
    expect(stderr.join('')).toContain('needs an interactive terminal');
    expect(stderr.join('')).toContain('tau agent tail <chat> --jsonl');
  }, 120_000);
});

describe('TUI authoritative read health', () => {
  it.each(['first-chat', 'another-chat'])(
    'echoes exact host health, clears it on replacement, and aborts the parked %s read',
    async (chatId) => {
      const client = mock<AgentChannelClient>();
      const healthy = { historyIntact: true, newerHistory: false, quarantined: false };
      const damaged = { historyIntact: false, newerHistory: false, quarantined: true };
      const observed = Promise.withResolvers<void>();
      const cancelled = Promise.withResolvers<void>();
      const batch = (sourceGeneration: string, sourceHealth: typeof healthy): ReadAnswer => ({
        status: 'batch',
        chatId,
        cursor: 0,
        nextCursor: 0,
        endCursor: 0,
        events: [],
        sourceGeneration,
        sourceHealth,
      });
      const answers = [
        batch('owner-a', healthy),
        batch('owner-a', damaged),
        batch('owner-b', healthy),
        batch('owner-b', healthy),
      ];
      let index = 0;
      client.execute.mockImplementation(async (command) => ({
        commandId: command.commandId,
        generation: 1,
        status: 'applied',
        effect: 'not-applied',
        details: { endCursor: 0 },
      }));
      client.read.mockImplementation(async ({ signal }) => {
        const answer = answers[index++];
        if (answer !== undefined) {
          return answer;
        }
        observed.resolve();
        return new Promise<ReadAnswer>((_resolve, reject) => {
          const abort = (): void => {
            cancelled.resolve();
            reject(new DOMException('Read cancelled', 'AbortError'));
          };
          if (signal?.aborted) {
            abort();
          } else {
            signal?.addEventListener('abort', abort, { once: true });
          }
        });
      });
      const opened = vi
        .spyOn(agentClient, 'openAgentChannel')
        .mockResolvedValue({ client, url: new URL('http://127.0.0.1:1') });
      const terminal = createTerminal();
      const finished = runTui({
        host: 'http://127.0.0.1:1',
        chatId,
        from: 0,
        stdin: terminal.stdin,
        stdout: terminal.stdout,
      });
      try {
        await observed.promise;
        expect(client.read.mock.calls.map(([input]) => input.sourceHealth)).toEqual([
          undefined,
          healthy,
          damaged,
          undefined,
          healthy,
        ]);
        expect(client.read.mock.calls.map(([input]) => input.sourceGeneration)).toEqual([
          undefined,
          'owner-a',
          'owner-a',
          undefined,
          'owner-b',
        ]);
        expect(client.read.mock.calls.every(([input]) => input.chatId === chatId)).toBe(true);
      } finally {
        terminal.stdin.write('q');
        await finished;
        await cancelled.promise;
        opened.mockRestore();
      }
      expect(client.read).toHaveBeenCalledTimes(5);
      expect(client.close).toHaveBeenCalledWith('tau tui detached');
      expect(terminal.output()).not.toContain('The channel stopped');
    },
  );
});
