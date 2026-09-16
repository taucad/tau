/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
/**
 * The always-on gate for Launcher 1.
 *
 * `tau serve` runs as a real child process on a free port; a client speaks the
 * T0 vocabulary to it over the `/agent` channel, is **killed mid-run**, and a
 * second client — a different socket, a different channel — reconnects and
 * reads the completed transcript from a tail cursor. Nothing in the run is
 * allowed to depend on a client being attached; that is the whole point.
 *
 * Two stubs stand in for the network: a relay that only accepts the daemon's
 * control socket, and a gateway whose response is released by the test, so
 * "mid-run" is deterministic rather than timing-dependent.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type * as WorkerThreads from 'node:worker_threads';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from 'citty';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';

import { agentChannelProtocolSchemas } from '@taucad/agent-host';
import type { AgentChannelCommand, AgentChannelProtocol, AgentChannelResponse } from '@taucad/agent-host';
import { createChannelClient, wrapWebSocket } from '@taucad/rpc';
import type { Channel, WireProtocolSchemas } from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';
import type * as TauHost from '@taucad/host';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../..');
const binPath = resolvePath(repoRoot, 'packages/cli/src/bin.ts');
const agentToken = 'integration-agent-token-at-least-32-characters';

const disposers: Array<() => Promise<void> | void> = [];

const ownerState = vi.hoisted(() => ({
  daemonOptions: undefined as
    | undefined
    | {
        agent?: { compute?: unknown; computeControl?: unknown };
        systemSkillBundles?: readonly unknown[];
      },
  closed: undefined as undefined | PromiseWithResolvers<{ cause: 'requested' }>,
  workers: [] as WorkerThreads.Worker[],
  closeFailure: undefined as Error | undefined,
}));
const capturedDaemonOptions = (): typeof ownerState.daemonOptions => Reflect.get(ownerState, 'daemonOptions');

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkerThreads>();
  class ObservedWorker extends actual.Worker {
    public constructor(filename: string | URL, options?: WorkerThreads.WorkerOptions) {
      super(filename, options);
      ownerState.workers.push(this);
    }
  }
  return { ...actual, Worker: ObservedWorker };
});

vi.mock('@taucad/host', async (importOriginal) => {
  const actual = await importOriginal<typeof TauHost>();
  return {
    ...actual,
    startHostDaemon: vi.fn((options: typeof ownerState.daemonOptions) => {
      ownerState.daemonOptions = options;
      ownerState.closed = Promise.withResolvers<{ cause: 'requested' }>();
      return {
        ready: Promise.resolve(),
        closed: ownerState.closed.promise,
        close: async () => {
          ownerState.closed?.resolve({ cause: 'requested' });
          if (ownerState.closeFailure) {
            throw ownerState.closeFailure;
          }
        },
      };
    }),
  };
});

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered: child first, then its servers.
    await dispose();
  }
});

/** One `ws` frame as text, whichever of its three shapes it arrived in. */
const frameText = (data: RawData): string =>
  (Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)).toString('utf8');

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
        server.close(() => {
          resolve();
        });
      }),
  );
  return address.port;
};

/**
 * A relay that accepts the daemon's control socket and offers it nothing —
 * except that it now keeps what the daemon says. The API's run directory is fed
 * from exactly these frames (PH19 ruling 2), so collecting them is how the
 * always-on gate also proves a detached run stays discoverable.
 */
const startStubRelay = async (): Promise<{ readonly url: URL; readonly controlFrames: unknown[] }> => {
  const controlFrames: unknown[] = [];
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (accepted) => {
      accepted.on('message', (data) => {
        try {
          controlFrames.push(JSON.parse(frameText(data)));
        } catch {
          /* Not every frame has to be JSON for this fixture to be useful. */
        }
      });
    });
  });
  const port = await listen(server);
  return { url: new URL(`http://127.0.0.1:${String(port)}`), controlFrames };
};

/** A gateway whose single turn is released by the caller, not by a timer. */
const startStubGateway = async (): Promise<{ readonly url: URL; readonly release: () => void }> => {
  const released = Promise.withResolvers<void>();
  const server = createServer((request, response) => {
    // async-iife: bootstrap -- node's request listener is synchronous; the stubbed turn can only be fired from here.
    void (async () => {
      // Drain the request so the daemon's fetch does not stall on backpressure.
      for await (const _chunk of request) {
        /* Discarded: only the body's arrival matters. */
      }
      await released.promise;
      /* The transport binds every stream to the gateway's operation identity (D16). */
      response.writeHead(200, { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'stub-operation-daemon' });
      response.write(
        'data: {"id":"chatcmpl-daemon","choices":[{"index":0,"delta":{"content":"Daemon ready."},"finish_reason":null}]}\n\n',
      );
      response.write(
        'data: {"id":"chatcmpl-daemon","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n',
      );
      response.write('data: [DONE]\n\n');
      response.end();
    })();
  });
  const port = await listen(server);
  return {
    url: new URL(`http://127.0.0.1:${String(port)}`),
    release: () => {
      released.resolve();
    },
  };
};

/** Spawn `tau serve` and wait for the origin it prints when the channel is up. */
const startServe = async (options: {
  readonly workspace: string;
  readonly configDirectory: string;
  readonly relayUrl: URL;
  readonly gatewayUrl: URL;
}): Promise<URL> => {
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
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        TAU_CONFIG_DIR: options.configDirectory,
        TAU_HOST_AGENT_TOKEN: agentToken,
        /* Vitest sets `NODE_ENV=test`, which drops consola to `warn` and
         * silences every `success` line the daemon prints — including the one
         * naming the port this test connects to. */
        CONSOLA_LEVEL: '4',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
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
  /* The child's own output never rides an `Error` message: vitest parses a
   * message's stack-shaped lines and reads the files they name, and one
   * bundled dependency's source-map comment crashes that reader. Print it, then
   * throw something short. */
  const report = (reason: string): Error => {
    process.stderr.write(`\n--- tau serve output ---\n${output.join('')}\n--- end ---\n`);
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

type AgentClient = {
  readonly channel: Channel<AgentChannelProtocol>;
  readonly socket: WebSocket;
};

const connectAgent = async (origin: URL): Promise<AgentClient> => {
  const socket = new WebSocket(new URL('/agent', origin).href.replace('http:', 'ws:'), {
    headers: { authorization: `Bearer ${agentToken}` },
  });
  /* Wrapped before `open`: the daemon posts its channel hello the instant the
   * upgrade completes, and `ws` drops a message that lands with no listener
   * attached. `wrapWebSocket` buffers from the moment it is called. */
  const port = wrapWebSocket<unknown>(socket, msgpackCodec);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const channel = createChannelClient<AgentChannelProtocol>({
    port,
    sessionKey: 'tau-agent',
    protocolSchemas: agentChannelProtocolSchemas as WireProtocolSchemas<AgentChannelProtocol>,
  });
  return { channel, socket };
};

const send = async (client: AgentClient, command: AgentChannelCommand): Promise<AgentChannelResponse> =>
  client.channel.call('request', command);

describe('tau serve --agent-port (always-on agent channel)', () => {
  it('keeps a run alive across a client disconnect and replays the transcript from a tail cursor', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tau-serve-agent-ws-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-serve-agent-cfg-'));
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

    const relay = await startStubRelay();
    const relayUrl = relay.url;
    const gateway = await startStubGateway();
    const origin = await startServe({ workspace, configDirectory, relayUrl, gatewayUrl: gateway.url });

    // A wrong secret never reaches the channel at all.
    const unauthorized = new WebSocket(new URL('/agent', origin).href.replace('http:', 'ws:'));
    await expect(
      new Promise((_resolve, reject) => {
        unauthorized.once('open', () => {
          reject(new Error('unauthenticated upgrade was admitted'));
        });
        unauthorized.once('error', reject);
      }),
    ).rejects.toThrow(/401/u);

    /* Rung-1 discovery: a page learns from its own origin that it is an agent
     * host, and which directory that host owns. No secret rides it. */
    const descriptor = await fetch(new URL('/.well-known/tau-host', origin));
    expect(descriptor.headers.get('content-type')).toBe('application/json');
    expect(descriptor.headers.get('cache-control')).toBe('no-store');
    await expect(descriptor.json()).resolves.toMatchObject({ v: 1, agent: true, workspaceRoot: workspace });

    const first = await connectAgent(origin);
    const started = await send(first, {
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-1',
      runId: 'run-1',
      message: { id: 'user-1', role: 'user', content: 'hello daemon' },
    });
    if (started.type !== 'result') {
      throw new Error('start must answer with a result frame');
    }
    expect(started.snapshot.runId).toBe('run-1');
    expect(['admitted', 'running']).toContain(started.snapshot.state);

    // Kill the client while the gateway response is still pending.
    first.socket.terminate();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    gateway.release();

    const second = await connectAgent(origin);
    const settled = new Set(['completed', 'failed', 'cancelled']);
    let attached = await send(second, { type: 'attach', chatId: 'chat-1', cursor: 0, limit: 16 });
    for (
      let attempt = 0;
      attempt < 600 && attached.type === 'attach' && !settled.has(attached.snapshot?.state ?? '');
      attempt++
    ) {
      // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      // oxlint-disable-next-line no-await-in-loop -- each poll depends on the previous projection.
      attached = await send(second, { type: 'attach', chatId: 'chat-1', cursor: 0, limit: 16 });
    }
    if (attached.type !== 'attach') {
      throw new Error('attach must answer with an attach frame');
    }
    expect(attached.snapshot?.state).toBe('completed');
    expect(attached.snapshot?.messages.at(-1)).toMatchObject({ role: 'assistant' });

    // The transcript is a file in the workspace, not a row in a database.
    const log = await readFile(join(workspace, '.tau', 'chats', 'chat-1', 'events.jsonl'), 'utf8');
    expect(log).toContain('"state":"completed"');

    // And the same transcript replays from a cursor on the reconnected client.
    const replayed = await send(second, { type: 'tail', chatId: 'chat-1', cursor: 0, limit: 16 });
    if (replayed.type !== 'tail') {
      throw new Error('tail must answer with a tail frame');
    }
    expect(replayed.batch.events.length).toBeGreaterThan(0);

    /* The run directory (PH19 ruling 2): the daemon reported this run's
     * identity and state to the relay while the client was gone, and reported
     * nothing else — no message, no tool call, no transcript. This is what
     * makes a detached run discoverable by a client that lost its page. */
    type RunFrame = { type: string; runId: string; chatId: string; state: string; updatedAt: string };
    const isRunFrame = (frame: unknown): frame is RunFrame =>
      typeof frame === 'object' && frame !== null && 'type' in frame && (frame as RunFrame).type === 'run';
    const runFramesNow = (): RunFrame[] => relay.controlFrames.filter((frame) => isRunFrame(frame));
    /* Bounded, because the relay connection is downstream of the runtime
     * child: this daemon finished the whole run before its control socket
     * existed, so what is asserted here is that the reporter *converged* —
     * the run reached the directory on the connection, not during it. */
    for (let attempt = 0; attempt < 300 && !runFramesNow().some((frame) => frame.state === 'completed'); attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- polling a delivery is sequential by nature.
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }
    const runFrames = runFramesNow();
    expect(runFrames.map((frame) => frame.state)).toContain('completed');
    expect(runFrames.every((frame) => frame.runId === 'run-1' && frame.chatId === 'chat-1')).toBe(true);
    expect(Object.keys(runFrames.at(-1) ?? {}).toSorted()).toEqual([
      'chatId',
      'runId',
      'state',
      'type',
      'updatedAt',
      'v',
    ]);
    expect(JSON.stringify(runFrames)).not.toContain('Daemon ready.');

    second.channel.close();
    second.socket.close();
  }, 180_000);
});

describe('tau serve compute owner', () => {
  it('allocates only for durable use, invalidates on error, restarts, and awaits worker close', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tau-serve-compute-workspace-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-serve-compute-config-'));
    const previousConfig = process.env['TAU_CONFIG_DIR'];
    process.env['TAU_CONFIG_DIR'] = configDirectory;
    disposers.push(async () => {
      if (previousConfig === undefined) {
        delete process.env['TAU_CONFIG_DIR'];
      } else {
        process.env['TAU_CONFIG_DIR'] = previousConfig;
      }
      await Promise.all(ownerState.workers.splice(0).map(async (worker) => worker.terminate()));
      await rm(workspace, { recursive: true, force: true });
      await rm(configDirectory, { recursive: true, force: true });
    });

    const { serveCommand } = await import('#commands/serve.js');
    const offRun = runCommand(serveCommand, {
      rawArgs: [
        '--trust-projects',
        '--agent-port=0',
        `--workspace=${workspace}`,
        '--compute-mode=off',
        '--relay=http://127.0.0.1:1',
      ],
    });
    await vi.waitFor(() => {
      expect(ownerState.daemonOptions?.agent).toBeDefined();
    });
    expect(ownerState.daemonOptions?.systemSkillBundles).not.toEqual([]);
    expect(JSON.stringify(ownerState.daemonOptions?.systemSkillBundles?.[0])).toContain('"path":"SKILL.md"');
    expect(ownerState.daemonOptions!.agent!.compute).toEqual({ mode: 'off' });
    expect(ownerState.workers).toHaveLength(0);
    ownerState.closed!.resolve({ cause: 'requested' });
    await offRun;
    ownerState.daemonOptions = undefined;

    const running = runCommand(serveCommand, {
      rawArgs: [
        '--trust-projects',
        '--agent-port=0',
        `--workspace=${workspace}`,
        '--compute-mode=durable',
        '--relay=http://127.0.0.1:1',
      ],
    });
    await vi.waitFor(() => {
      expect(capturedDaemonOptions()).toBeDefined();
    });
    const durableOptions = capturedDaemonOptions();
    expect(durableOptions?.agent).toBeDefined();
    expect(ownerState.workers).toHaveLength(0);

    const compute = durableOptions!.agent!.compute as () => { mode: string };
    expect(compute()).toMatchObject({ mode: 'durable' });
    expect(ownerState.workers).toHaveLength(1);
    const control = durableOptions!.agent!.computeControl as {
      inspect(input: Record<string, never>): Promise<{ generation: number }>;
    };
    const before = await control.inspect({});
    const first = ownerState.workers[0]!;
    first.emit('error', new Error('fixture worker error'));
    expect(compute()).toMatchObject({ mode: 'durable' });
    expect(ownerState.workers).toHaveLength(2);
    await first.terminate();
    const after = await control.inspect({});
    expect(after.generation).toBe(before.generation);

    ownerState.closeFailure = new Error('daemon close failed');
    ownerState.closed!.resolve({ cause: 'requested' });
    await expect(running).rejects.toThrow('daemon close failed');
    expect(ownerState.workers[1]!.threadId).toBe(-1);
  });
});

/* ---------------------------------------------------------------------------
 * Launcher 3: the same gate, inside the container image.
 *
 * A cloud host is a paired device the API provisions, so nothing here is new
 * code — it is the same `tau serve`, the same agent channel and the same
 * files-first log, started from `packages/host/docker-entrypoint.sh` with a
 * credential the provisioner passed in instead of one a user's pairing wrote.
 * The point of running it is that "the image works" is not a claim a unit test
 * can make.
 *
 * Env-gated on `TAU_HOST_IMAGE` (`docker build -f packages/host/Dockerfile .`),
 * because the image takes minutes to build and the daemon leg above already
 * covers the semantics.
 * ------------------------------------------------------------------------- */

const containerImage = process.env['TAU_HOST_IMAGE'];
const containerName = `tau-host-it-${String(process.pid)}`;

/** Relay and gateway on one origin, because the entrypoint points both at `$TAU_API_URL`. */
const startStubApi = async (): Promise<{
  readonly port: number;
  readonly controlFrames: unknown[];
  readonly release: () => void;
}> => {
  const released = Promise.withResolvers<void>();
  const controlFrames: unknown[] = [];
  const server = createServer((request, response) => {
    // async-iife: bootstrap -- node's request listener is synchronous.
    void (async () => {
      for await (const _chunk of request) {
        /* Discarded: only the body's arrival matters. */
      }
      await released.promise;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(
        'data: {"id":"chatcmpl-cloud","choices":[{"index":0,"delta":{"content":"Cloud host ready."},"finish_reason":null}]}\n\n',
      );
      response.write(
        'data: {"id":"chatcmpl-cloud","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n',
      );
      response.write('data: [DONE]\n\n');
      response.end();
    })();
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (accepted) => {
      accepted.on('message', (data) => {
        try {
          controlFrames.push(JSON.parse(frameText(data)));
        } catch {
          /* Not every frame has to be JSON for this fixture to be useful. */
        }
      });
    });
  });
  const port = await listen(server);
  return {
    port,
    controlFrames,
    release: () => {
      released.resolve();
    },
  };
};

const docker = async (...arguments_: readonly string[]): Promise<string> => {
  const child = spawn('docker', [...arguments_], { stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks: string[] = [];
  const collect = (chunk: Uint8Array<ArrayBuffer>): void => {
    chunks.push(Buffer.from(chunk).toString('utf8'));
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const code = await new Promise<number>((resolve) => {
    child.once('exit', (exit) => {
      resolve(exit ?? 1);
    });
  });
  const output = chunks.join('');
  if (code !== 0) {
    throw new Error(`docker ${arguments_[0] ?? ''} failed (${String(code)}): ${output.slice(0, 500)}`);
  }
  return output;
};

describe.skipIf(!containerImage)('tau serve in the launcher-3 container image', () => {
  it('runs a detached turn inside the container and replays it from the tail cursor', async () => {
    const api = await startStubApi();
    disposers.push(async () => {
      await docker('rm', '--force', containerName).catch(() => undefined);
    });
    await docker(
      'run',
      '--detach',
      '--name',
      containerName,
      '--add-host',
      'host.docker.internal:host-gateway',
      '--publish',
      '127.0.0.1::7777',
      '--env',
      'TAU_HOST_DEVICE_ID=device-cloud',
      '--env',
      'TAU_HOST_CREDENTIAL=integration-device-credential-32-chars-min',
      '--env',
      `TAU_API_URL=http://host.docker.internal:${String(api.port)}`,
      '--env',
      'TAU_HOST_AGENT_PORT=7777',
      /* The only reason this exists: a test on the machine *outside* the
       * container drives the channel directly. A real cloud host dials out. */
      '--env',
      'TAU_HOST_AGENT_BIND=0.0.0.0',
      '--env',
      `TAU_HOST_AGENT_TOKEN=${agentToken}`,
      '--env',
      'TAU_HOST_MODEL=fixture-model',
      '--env',
      'TAU_HOST_MODEL_PROVIDER=vertexai',
      '--env',
      'CONSOLA_LEVEL=4',
      containerImage ?? '',
    );
    const published = await docker('port', containerName, '7777/tcp');
    const mapped = /:(\d+)\s*$/u.exec(published.trim());
    if (!mapped) {
      throw new Error(`container published no port: ${published}`);
    }
    const origin = new URL(`http://127.0.0.1:${mapped[1]!}`);

    /* The credential file the entrypoint wrote is what a pairing would have
     * produced; the descriptor proves the agent channel is up on it. */
    let descriptor: Response | undefined;
    for (let attempt = 0; attempt < 120 && !descriptor?.ok; attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- waiting for a container to listen is sequential.
      descriptor = await fetch(new URL('/.well-known/tau-host', origin)).catch(() => undefined);
      if (!descriptor?.ok) {
        // oxlint-disable-next-line no-await-in-loop -- ditto.
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
      }
    }
    await expect(descriptor?.json()).resolves.toMatchObject({ v: 1, agent: true, workspaceRoot: '/workspace' });

    const first = await connectAgent(origin);
    const started = await send(first, {
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-1',
      runId: 'run-1',
      message: { id: 'user-1', role: 'user', content: 'hello cloud host' },
    });
    if (started.type !== 'result') {
      throw new Error('start must answer with a result frame');
    }

    // Drop the client mid-run: nothing about the run may depend on it.
    first.socket.terminate();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    api.release();

    const second = await connectAgent(origin);
    const settled = new Set(['completed', 'failed', 'cancelled']);
    let attached = await send(second, { type: 'attach', chatId: 'chat-1', cursor: 0, limit: 16 });
    for (
      let attempt = 0;
      attempt < 600 && attached.type === 'attach' && !settled.has(attached.snapshot?.state ?? '');
      attempt++
    ) {
      // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      // oxlint-disable-next-line no-await-in-loop -- each poll depends on the previous projection.
      attached = await send(second, { type: 'attach', chatId: 'chat-1', cursor: 0, limit: 16 });
    }
    if (attached.type !== 'attach') {
      throw new Error('attach must answer with an attach frame');
    }
    expect(attached.snapshot?.state).toBe('completed');
    expect(attached.snapshot?.messages.at(-1)).toMatchObject({ role: 'assistant' });

    // The log is a file on the container's own disk, under its workspace.
    const log = await docker('exec', containerName, 'cat', '/workspace/.tau/chats/chat-1/events.jsonl');
    expect(log).toContain('"state":"completed"');

    second.channel.close();
    second.socket.close();
  }, 600_000);
});
