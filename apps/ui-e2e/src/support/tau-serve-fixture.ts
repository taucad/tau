/**
 * The AV-4 harness: a real `tau serve` daemon, serving a real serve-mode SPA.
 *
 * Rung 1 of the transport ladder is the only one a page can take with no
 * secret of its own (W4 ruling 2), and it only exists when the daemon *served
 * the page*. So this fixture cannot be faked with a route interception: the
 * browser has to load the document from the daemon's own origin, discover it
 * at `/.well-known/tau-host`, and upgrade `/agent` same-origin so the
 * `HttpOnly` cookie rides along.
 *
 * Two stubs stand in for the network, exactly as
 * `packages/cli/src/serve-agent.integration.test.ts` does: a relay that only
 * accepts the daemon's control socket, and a gateway whose turns are released
 * by the test rather than by a timer.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Derived from this file, never from `process.cwd()`: the ui-e2e targets are
 * split between running from the workspace root and from `apps/ui-e2e`, and a
 * cwd-relative root silently resolves under the wrong directory in one of them. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const binPath = resolve(repoRoot, 'packages/cli/src/bin.ts');
const uiRoot = resolve(repoRoot, 'apps/ui/serve/build/client');
const agentToken = 'av4-serve-agent-token-at-least-32-characters';
/** The deterministic ACP agent AV-5 puts behind the `codex` id. */
const fakeAcpAgent = resolve(repoRoot, 'packages/host/src/acp/fixtures/fake-agent.ts');

/** What the spec is handed: an origin to navigate to, and a directory to read. */
export type TauServeFixture = {
  readonly origin: string;
  readonly workspace: string;
};

type Running = TauServeFixture & {
  release: () => void;
  dispose: () => Promise<void>;
};

/** The file the fixture model writes on its first turn, inside the daemon workspace. */
export const tauServeProofFile = 'main.scad';
export const tauServeProofContent = 'cube(10);\n';
export const tauServePartialText = 'Tau Host started the workspace change.';
export const tauServeFinalText = 'Tau Host completed the workspace change.';

const listen = async (server: HttpServer): Promise<number> => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a TCP address.');
  }
  return address.port;
};

const closeServer = async (server: HttpServer): Promise<void> =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => {
      resolve();
    });
  });

/**
 * A two-turn Anthropic-wire gateway: a tool call, then a final text.
 *
 * The same SSE shape `uiInstallAgentHostGatewayFixture` serves the browser
 * host, so the two hosts are driven by an identical provider wire and any
 * difference in the transcript is a difference in the *host*, not the model.
 */
const startStubGateway = async (): Promise<{
  readonly url: URL;
  readonly server: HttpServer;
  readonly release: () => void;
}> => {
  let requestIndex = 0;
  let held: (() => void) | undefined;
  /* Latched, not edge-triggered: the test releases as soon as it has dropped
   * the client, which routinely happens *before* the daemon issues its second
   * request. An un-latched gate would then hold a turn nobody will ever open. */
  let released = false;
  const toolArguments = JSON.stringify({ targetFile: tauServeProofFile, content: tauServeProofContent });
  const server = createServer((request, response) => {
    // async-iife: bootstrap -- node's request listener is synchronous.
    void (async () => {
      for await (const _chunk of request) {
        /* Drained: only the body's arrival matters. */
      }
      const currentRequest = requestIndex++;
      const writeEvent = (event: string, data: unknown): void => {
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      response.flushHeaders();
      /* eslint-disable @typescript-eslint/naming-convention -- Anthropic's provider wire uses snake_case. */
      writeEvent('message_start', {
        type: 'message_start',
        message: {
          id: `av4-message-${String(currentRequest)}`,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'fixture-model',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 20, output_tokens: 0 },
        },
      });
      if (currentRequest === 0) {
        writeEvent('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        });
        writeEvent('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: tauServePartialText },
        });
        writeEvent('content_block_stop', { type: 'content_block_stop', index: 0 });
        writeEvent('content_block_start', {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'av4-call-0', name: 'create_file', input: {} },
        });
        writeEvent('content_block_delta', {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: toolArguments },
        });
        writeEvent('content_block_stop', { type: 'content_block_stop', index: 1 });
        writeEvent('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use', stop_sequence: null },
          usage: { output_tokens: 8 },
        });
      } else {
        /* The second turn is held until the test releases it, so "the page went
         * away mid-run" is deterministic rather than timing-dependent. */
        if (currentRequest === 1 && !released) {
          const gate = Promise.withResolvers<void>();
          held = gate.resolve;
          await gate.promise;
        }
        writeEvent('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        });
        writeEvent('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: tauServeFinalText },
        });
        writeEvent('content_block_stop', { type: 'content_block_stop', index: 0 });
        writeEvent('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 9 },
        });
      }
      writeEvent('message_stop', { type: 'message_stop' });
      /* eslint-enable @typescript-eslint/naming-convention -- fixture wire ends here. */
      response.end();
    })();
  });
  const port = await listen(server);
  return {
    url: new URL(`http://127.0.0.1:${String(port)}`),
    server,
    release: () => {
      released = true;
      held?.();
      held = undefined;
    },
  };
};

/** A relay that accepts the daemon's control socket and offers it nothing. */
const startStubRelay = async (): Promise<{ readonly url: URL; readonly server: HttpServer }> => {
  const { WebSocketServer } = await import('ws');
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (accepted) => {
      accepted.on('message', () => undefined);
    });
  });
  const port = await listen(server);
  return { url: new URL(`http://127.0.0.1:${String(port)}`), server };
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
  await Promise.race([
    exited,
    new Promise((resolve) => {
      setTimeout(resolve, 5000);
    }),
  ]);
  child.kill('SIGKILL');
};

/** How one fixture daemon is configured. @public */
export type TauServeFixtureOptions = {
  /**
   * Offer external ACP agents (AV-5), with the deterministic fixture agent
   * standing in for `codex`.
   *
   * Off by default, and that is load-bearing for AV-4: with external agents on,
   * a daemon advertises whichever vendor CLIs happen to be installed on the
   * machine running the suite, which would make the selector's contents
   * machine-dependent.
   */
  readonly externalAgents?: boolean | undefined;
};

/**
 * Start one daemon serving the serve-mode SPA on an ephemeral port.
 *
 * @param options - Whether this daemon offers external agents.
 * @returns The origin to navigate to, the workspace to read, and its teardown.
 */
export const startTauServeFixture = async (options: TauServeFixtureOptions = {}): Promise<Running> => {
  try {
    await access(join(uiRoot, 'index.html'));
  } catch {
    throw new Error(`The serve build is missing. Run: pnpm nx run ui:build:serve (expected ${uiRoot}/index.html)`);
  }
  const workspace = await mkdtemp(join(tmpdir(), 'tau-av4-ws-'));
  const configDirectory = await mkdtemp(join(tmpdir(), 'tau-av4-cfg-'));
  await mkdir(configDirectory, { recursive: true });
  await writeFile(
    join(configDirectory, 'host.json'),
    `${JSON.stringify({ v: 1, deviceId: 'device-av4', credential: 'av4-device-credential-32-characters-min' })}\n`,
    'utf8',
  );
  const relay = await startStubRelay();
  const gateway = await startStubGateway();
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      binPath,
      'serve',
      '--trust-projects',
      '--agentPort=0',
      `--ui=${uiRoot}`,
      `--workspace=${workspace}`,
      `--relay=${relay.url.href}`,
      `--gateway=${gateway.url.href}`,
      '--model=fixture-model',
      '--modelProvider=anthropic',
      options.externalAgents === true ? '--external-agents' : '--no-external-agents',
    ],
    {
      cwd: repoRoot,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
      env: {
        ...process.env,
        TAU_CONFIG_DIR: configDirectory,
        TAU_HOST_AGENT_TOKEN: agentToken,
        /* Honoured only under `NODE_ENV=test`, which vitest already sets and the
         * child inherits — see `acpAdapterOverrideVariable`. */
        ...(options.externalAgents === true ? { TAU_ACP_ADAPTER_OVERRIDE: `${fakeAcpAgent}:codex` } : {}),
        /* Vitest sets `NODE_ENV=test`, which drops consola to `warn` and
         * silences the line naming the port this fixture connects to. */
        CONSOLA_LEVEL: '4',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const output: string[] = [];
  const origin = Promise.withResolvers<string>();
  const scan = (chunk: Uint8Array<ArrayBuffer>): void => {
    const text = Buffer.from(chunk).toString('utf8');
    output.push(text);
    const match = /http:\/\/127\.0\.0\.1:(\d+)/u.exec(text);
    if (match) {
      origin.resolve(`http://127.0.0.1:${match[1]!}`);
    }
  };
  child.stdout.on('data', scan);
  child.stderr.on('data', scan);
  const report = (reason: string): Error => {
    process.stderr.write(`\n--- tau serve output ---\n${output.join('')}\n--- end ---\n`);
    return new Error(reason);
  };
  child.once('exit', (code) => {
    origin.reject(report(`tau serve exited early with code ${String(code)}`));
  });
  const dispose = async (): Promise<void> => {
    gateway.release();
    await stopChild(child);
    await closeServer(gateway.server);
    await closeServer(relay.server);
    await rm(workspace, { recursive: true, force: true });
    await rm(configDirectory, { recursive: true, force: true });
  };
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(report('tau serve never announced its agent channel'));
    }, 90_000);
    timer.unref();
  });
  try {
    return { origin: await Promise.race([origin.promise, deadline]), workspace, release: gateway.release, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
};

/** Read one file from the daemon's workspace; `undefined` when it does not exist yet. */
export const readTauServeFile = async (workspace: string, relativePath: string): Promise<string | undefined> => {
  try {
    return await readFile(join(workspace, relativePath), 'utf8');
  } catch {
    return undefined;
  }
};

/** Every chat id the daemon has logged, from the files it actually wrote. */
export const listTauServeChats = async (workspace: string): Promise<readonly string[]> => {
  try {
    return await readdir(join(workspace, '.tau', 'chats'));
  } catch {
    return [];
  }
};
