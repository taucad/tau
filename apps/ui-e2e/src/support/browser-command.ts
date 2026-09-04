/* oxlint-disable max-params, no-await-in-loop, no-eval, no-restricted-imports, tau-lint/no-bare-time-identifier, typescript/no-restricted-types -- Vitest command callbacks add their context parameter to the explicit external-target contract, and config-time modules cannot use test aliases. `no-eval` is the external-target contract itself: `evaluateTarget`, `evaluateTargetLocator` and `waitForTarget` take a function SOURCE across the browser↔node command boundary — nothing else survives that serialization — and the page reconstitutes it. The sources are spec literals, never page-derived input. */
import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { release } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { BrowserCommand, BrowserCommandContext } from 'vitest/node';
import type {
  TargetClickOptions,
  TargetCookie,
  TargetDiagnostics,
  TargetMouseOptions,
  TargetPaseoConnection,
  TargetPaseoRestFixture,
  TargetReadOptions,
  TargetState,
  TargetSurface,
  TargetTauTestAccount,
  TargetViewport,
  TargetWebGpuProfile,
  TargetWebGpuQualificationReport,
} from './external-target.ts';
import { testBaseURL } from './base-url.ts';
import { startPaseoFakeDaemon as startFakePaseoDaemon } from './paseo-fake-daemon.ts';
import { classifyWebGpuAdapter, webGpuLaunchArguments } from './webgpu-profile.ts';
import { listTauServeChats, readTauServeFile, startTauServeFixture } from './tau-serve-fixture.ts';
import type { TauServeFixture, TauServeFixtureOptions } from './tau-serve-fixture.ts';
import { browserHostScript } from './agent-host-gateway-script.ts';
import type { GatewayScriptTurn } from './agent-host-gateway-script.ts';

type ProviderContext = BrowserCommandContext['context'];
type TargetPage = Awaited<ReturnType<ProviderContext['newPage']>>;

/** Refusal the agent-host gateway fixture answers with while it is armed. */
type AgentHostGatewayFailure = { readonly status: number; readonly message: string };

type Session = {
  readonly agentHostApiRequests: string[];
  readonly agentHostGatewayRequests: unknown[];
  readonly consoleMessages: Array<{ readonly text: string; readonly type: string }>;
  readonly context: ProviderContext;
  readonly pageErrors: string[];
  readonly primary: TargetPage;
  agentHostGatewayFailure?: AgentHostGatewayFailure | undefined;
  agentHostGatewayRelease?: (() => void) | undefined;
  agentHostGatewayServer?: Server;
  secondary?: TargetPage;
  testUserEmail?: string;
  tracing: boolean;
};

const sessions = new Map<string, Session>();
const hostFixtureProcesses = new Map<string, ChildProcess>();
const outputRoot = resolve('out/test-results/vitest-browser/apps/ui-e2e/test-output');

const paseoApiPath = '/v1/connectors/paseo';
const tauApiUrl = process.env['TAU_E2E_API_URL'] ?? 'http://localhost:4000';
const execFileAsync = promisify(execFile);

const assertTauTestEmail = (email: string): void => {
  if (!/^[a-z0-9._@-]+$/u.test(email)) {
    throw new Error('UI E2E test-account email contains unsupported characters.');
  }
};

const executeTauDatabase = async (statement: string): Promise<void> => {
  await execFileAsync(
    'docker',
    ['exec', 'tau-postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'dev_user', '-d', 'tau_dev', '-c', statement],
    { encoding: 'utf8' },
  );
};

const deleteTauTestUser = async (email: string): Promise<void> => {
  assertTauTestEmail(email);
  await executeTauDatabase(`DELETE FROM "user" WHERE email = '${email}';`);
};

const sessionFor = (commandContext: BrowserCommandContext): Session => {
  const session = sessions.get(commandContext.sessionId);
  if (!session) {
    throw new Error('UI E2E target session is not open.');
  }
  return session;
};

const pageFor = (session: Session, surface: TargetSurface = 'primary'): TargetPage => {
  if (surface === 'primary') {
    return session.primary;
  }
  if (!session.secondary) {
    throw new Error('UI E2E secondary target page is not open.');
  }
  return session.secondary;
};

const observePage = (session: Session, page: TargetPage): void => {
  page.on('console', (message) => session.consoleMessages.push({ text: message.text(), type: message.type() }));
  page.on('pageerror', (error) => session.pageErrors.push(error.message));
};

const disposeSession = async (session: Session): Promise<void> => {
  const errors: unknown[] = [];
  session.agentHostGatewayRelease?.();
  session.agentHostGatewayRelease = undefined;
  if (session.agentHostGatewayServer) {
    const server = session.agentHostGatewayServer;
    session.agentHostGatewayServer = undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        server.closeAllConnections();
      });
    } catch (error) {
      errors.push(error);
    }
  }
  if (session.testUserEmail) {
    try {
      await deleteTauTestUser(session.testUserEmail);
    } catch (error) {
      errors.push(error);
    }
  }
  if (session.tracing) {
    try {
      await session.context.tracing.stop();
    } catch (error) {
      errors.push(error);
    }
    session.tracing = false;
  }
  try {
    await session.context.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'UI E2E target cleanup failed.');
  }
};

export const uiAuthenticateTauTestUser: BrowserCommand<[account: TargetTauTestAccount]> = async (
  commandContext,
  account,
) => {
  assertTauTestEmail(account.email);
  const session = sessionFor(commandContext);
  session.testUserEmail = account.email;
  const headers = { origin: testBaseURL };
  const signUp = await session.context.request.post(`${tauApiUrl}/v1/auth/sign-up/email`, {
    data: account,
    headers,
  });
  if (!signUp.ok()) {
    throw new Error(`Tau test-account sign-up failed with HTTP ${signUp.status()}.`);
  }

  await executeTauDatabase(`
    WITH target_user AS (
      UPDATE "user"
      SET email_verified = true
      WHERE email = '${account.email}'
      RETURNING id
    ), inserted_account AS (
      INSERT INTO credit_account (user_id, topup_balance_micro)
      SELECT id, 5000000 FROM target_user
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    )
    INSERT INTO credit_transaction (id, user_id, delta_micro, balance_after_micro, reason)
    SELECT 'ctx_e2e_' || user_id, user_id, 5000000, 5000000, 'topup'
    FROM inserted_account;
  `);
  const signIn = await session.context.request.post(`${tauApiUrl}/v1/auth/sign-in/email`, {
    data: { email: account.email, password: account.password },
    headers,
  });
  if (!signIn.ok()) {
    throw new Error(`Tau test-account sign-in failed with HTTP ${signIn.status()}.`);
  }
};

export const uiOpenTarget: BrowserCommand = async (commandContext) => {
  if (commandContext.provider.name !== 'playwright') {
    throw new TypeError(`UI E2E requires the Playwright provider, received '${commandContext.provider.name}'.`);
  }
  const existing = sessions.get(commandContext.sessionId);
  if (existing) {
    await disposeSession(existing);
    sessions.delete(commandContext.sessionId);
  }
  const browser = commandContext.context.browser();
  if (!browser) {
    throw new Error('Vitest Playwright browser is unavailable.');
  }
  const context = await browser.newContext();
  context.setDefaultTimeout(10_000);
  const primary = await context.newPage();
  const session: Session = {
    agentHostApiRequests: [],
    agentHostGatewayRequests: [],
    consoleMessages: [],
    context,
    pageErrors: [],
    primary,
    tracing: false,
  };
  observePage(session, primary);
  await context.tracing.start({ screenshots: true, snapshots: true });
  session.tracing = true;
  sessions.set(commandContext.sessionId, session);
};

export const uiCloseTarget: BrowserCommand = async (commandContext) => {
  const session = sessions.get(commandContext.sessionId);
  if (!session) {
    return;
  }
  sessions.delete(commandContext.sessionId);
  await disposeSession(session);
  /* A spec that fails mid-vertical must not leak a daemon, its two stub
   * servers and a temp workspace onto the machine. */
  const daemon = tauServeFixtures.get(commandContext.sessionId);
  if (daemon) {
    tauServeFixtures.delete(commandContext.sessionId);
    await daemon.dispose();
  }
  const fixture = hostFixtureProcesses.get(commandContext.sessionId);
  if (fixture) {
    hostFixtureProcesses.delete(commandContext.sessionId);
    fixture.kill('SIGTERM');
    await Promise.race([
      new Promise<void>((resolve) => {
        fixture.once('exit', () => {
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      }),
    ]);
  }
};

export const uiStartHostFixture: BrowserCommand<[], string> = async (commandContext) => {
  const fixture = spawn(process.execPath, ['--import', 'tsx', resolve('apps/ui-e2e/src/support/host-fixture.ts')], {
    cwd: resolve('.'),
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  hostFixtureProcesses.set(commandContext.sessionId, fixture);
  const started = new Promise<string>((resolve, reject) => {
    fixture.once('message', (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'url' in message && typeof message.url === 'string') {
        resolve(message.url);
      } else {
        reject(new Error('Host browser fixture reported an invalid address.'));
      }
    });
    fixture.once('exit', (code, signal) => {
      reject(new Error(`Host browser fixture exited before ready (${String(code)}, ${String(signal)}).`));
    });
  });
  return started;
};

/**
 * Intercepts only Paseo's sanitized REST boundary while every UI and
 * persistence transition continues through production code.
 */
let fakeDaemon: Awaited<ReturnType<typeof startFakePaseoDaemon>> | undefined;

/**
 * Start the fake Paseo daemon for one spec.
 *
 * It runs in this Node process and the *browser* dials it with the real
 * `@getpaseo/client`, so the relay handshake, the ECDH E2EE negotiation and
 * the protocol-v2 session vocabulary are all real. Only the daemon behind the
 * socket is scripted.
 */
export const uiStartPaseoFakeDaemon: BrowserCommand<[options: Parameters<typeof startFakePaseoDaemon>[0]]> = async (
  _commandContext,
  options,
) => {
  await fakeDaemon?.close();
  fakeDaemon = await startFakePaseoDaemon(options);
  return {
    endpoint: fakeDaemon.endpoint,
    serverId: fakeDaemon.serverId,
    daemonPublicKeyB64: fakeDaemon.daemonPublicKeyB64,
  };
};

/** Stop it and report every session message it saw, for assertions. */
export const uiStopPaseoFakeDaemon: BrowserCommand = async () => {
  const seen = fakeDaemon?.received().map(({ type }) => type) ?? [];
  await fakeDaemon?.close();
  fakeDaemon = undefined;
  return seen;
};

export const uiInstallPaseoRestFixture: BrowserCommand<[fixture: TargetPaseoRestFixture]> = async (
  commandContext,
  fixture,
) => {
  const session = sessionFor(commandContext);
  let connections: TargetPaseoConnection[] = [];
  const headers = {
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'accept,anthropic-version,content-type',
    'access-control-allow-methods': 'DELETE,GET,OPTIONS,POST',
    'access-control-allow-origin': new URL(testBaseURL).origin,
    'content-type': 'application/json',
  };
  const fulfillJson = async (
    route: Parameters<Parameters<ProviderContext['route']>[1]>[0],
    body: unknown,
    status = 200,
  ) => {
    await route.fulfill({ body: JSON.stringify(body), headers, status });
  };

  await session.context.route(new RegExp(`${paseoApiPath}(?:/|$)`, 'u'), async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ headers, status: 204 });
      return;
    }

    const path = new URL(request.url()).pathname.slice(paseoApiPath.length);
    if (request.method() === 'GET' && path === '') {
      await fulfillJson(route, { connections });
      return;
    }
    if (request.method() === 'POST' && path === '/pair') {
      connections = [fixture.pairedConnection];
      await fulfillJson(route, fixture.pairedConnection, 201);
      return;
    }

    const connectionPath = `/${encodeURIComponent(fixture.pairedConnection.id)}`;
    if (request.method() === 'POST' && path === `${connectionPath}/offer`) {
      /* The one directory operation that releases pairing material. The page
       * dials whatever relay endpoint this names — here, the fake daemon. */
      await fulfillJson(route, {
        offer: {
          v: 2,
          serverId: fixture.offer.serverId,
          daemonPublicKeyB64: fixture.offer.daemonPublicKeyB64,
          relay: { endpoint: fixture.offer.relayEndpoint, useTls: false },
        },
      });
      return;
    }
    if (request.method() === 'DELETE' && path === connectionPath) {
      connections = [];
      await route.fulfill({ headers, status: 204 });
      return;
    }

    await route.abort('failed');
  });
};

/* eslint-disable @typescript-eslint/naming-convention -- Anthropic's provider wire uses snake_case. */
/**
 * Write one scripted assistant turn onto Anthropic's streaming wire: an
 * optional `thinking` block, an optional `text` block, then a `tool_use` block
 * per scripted call. A gated turn parks after the text and before the tools,
 * where the run is on screen and provably unfinished.
 */
const writeScriptedTurn = async (options: {
  readonly currentRequest: number;
  readonly session: Session;
  readonly turn: GatewayScriptTurn;
  readonly writeEvent: (event: string, data: unknown) => void;
}): Promise<void> => {
  const { currentRequest, session, turn, writeEvent } = options;
  const pause = async (): Promise<void> => {
    if (!turn.gated) {
      return;
    }
    const gate = Promise.withResolvers<void>();
    session.agentHostGatewayRelease = gate.resolve;
    await gate.promise;
    if (session.agentHostGatewayRelease === gate.resolve) {
      session.agentHostGatewayRelease = undefined;
    }
  };
  let index = 0;
  writeEvent('message_start', {
    type: 'message_start',
    message: {
      id: `browser-host-e2e-message-${String(currentRequest)}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'anthropic-claude-opus-4.8',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: turn.usage.inputTokens, output_tokens: 0 },
    },
  });
  if (turn.reasoning !== undefined) {
    writeEvent('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '' },
    });
    writeEvent('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'thinking_delta', thinking: turn.reasoning },
    });
    writeEvent('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'signature_delta', signature: `browser-host-e2e-signature-${String(currentRequest)}` },
    });
    writeEvent('content_block_stop', { type: 'content_block_stop', index });
    index += 1;
  }
  if (turn.text === undefined) {
    await pause();
  } else {
    writeEvent('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'text', text: '' },
    });
    writeEvent('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: turn.text },
    });
    await pause();
    writeEvent('content_block_stop', { type: 'content_block_stop', index });
    index += 1;
  }
  for (const [callIndex, call] of (turn.toolCalls ?? []).entries()) {
    writeEvent('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'tool_use',
        id: `browser-host-e2e-call-${String(currentRequest)}-${String(callIndex)}`,
        name: call.name,
        input: {},
      },
    });
    writeEvent('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.args) },
    });
    writeEvent('content_block_stop', { type: 'content_block_stop', index });
    index += 1;
  }
  writeEvent('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: (turn.toolCalls?.length ?? 0) > 0 ? 'tool_use' : 'end_turn', stop_sequence: null },
    usage: { output_tokens: turn.usage.outputTokens },
  });
  writeEvent('message_stop', { type: 'message_stop' });
};
/* eslint-enable @typescript-eslint/naming-convention -- The Anthropic wire fixture ends here. */

export const uiInstallAgentHostGatewayFixture: BrowserCommand<[script?: readonly GatewayScriptTurn[]]> = async (
  commandContext,
  script = browserHostScript,
) => {
  const session = sessionFor(commandContext);
  session.agentHostGatewayRequests.length = 0;
  session.agentHostApiRequests.length = 0;
  session.agentHostGatewayRelease = undefined;
  session.agentHostGatewayFailure = undefined;
  let requestIndex = 0;
  const headers = {
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'accept,content-type',
    'access-control-allow-methods': 'OPTIONS,POST',
    'access-control-allow-origin': new URL(testBaseURL).origin,
    'content-type': 'text/event-stream',
  };
  const server = createServer((request, response) => {
    // async-iife: bootstrap
    // Node owns request-listener settlement; failures become connection errors.
    void (async () => {
      try {
        if (request.method === 'OPTIONS') {
          response.writeHead(204, {
            ...headers,
            'access-control-allow-headers':
              request.headers['access-control-request-headers'] ?? headers['access-control-allow-headers'],
          });
          response.end();
          return;
        }

        const requestPath = new URL(request.url ?? '/', 'http://agent-host-gateway.invalid').pathname;
        if (request.method !== 'POST' || requestPath !== '/v1/llm/anthropic/v1/messages') {
          throw new Error(`Unexpected browser-host gateway request: ${request.method ?? 'unknown'} ${requestPath}`);
        }
        if (request.headers['anthropic-version'] !== '2023-06-01') {
          throw new Error('Browser-host Anthropic gateway request omitted anthropic-version: 2023-06-01.');
        }

        const body: string[] = [];
        request.setEncoding('utf8');
        for await (const chunk of request) {
          body.push(String(chunk));
        }
        session.agentHostGatewayRequests.push(JSON.parse(body.join('')));
        const { agentHostGatewayFailure } = session;
        if (agentHostGatewayFailure) {
          // A coded provider refusal, not a dropped socket: the browser host
          // records it as the run's typed `RunFailureDetail`, which is what a
          // reattached terminal log has to render back.
          response.writeHead(agentHostGatewayFailure.status, { ...headers, 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              type: 'error',
              error: { type: 'api_error', message: agentHostGatewayFailure.message },
            }),
          );
          return;
        }
        const currentRequest = requestIndex++;
        const writeEvent = (event: string, data: unknown): void => {
          response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        response.writeHead(200, { ...headers, 'cache-control': 'no-cache' });
        response.flushHeaders();
        // The walk wraps: a retried turn replays the script from the top, which
        // is what the rewind vertical in `browser-agent-host.spec.ts` asserts on.
        await writeScriptedTurn({
          currentRequest,
          session,
          turn: script[currentRequest % script.length]!,
          writeEvent,
        });
        response.end();
      } catch (error) {
        // Destroying the socket makes a rejected request invisible to the spec:
        // the gateway-request count simply never advances and the poll dies at
        // its timeout with no cause. Name the fault before dropping the wire.
        console.error('[agent-host-gateway] rejected request', error);
        response.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  // The browser-host vertical proves the API absent from the DATA path; the
  // models catalog is control-plane and is stubbed with the real catalog rows
  // so provider-aware wire gating sees genuine provider ids without a live API.
  const { isModelListEntryEnabled, modelList, modelListEntryToModel } =
    await import('../../../api/app/api/models/model.constants.js');
  const catalog = Object.values(modelList)
    .flatMap((entries) => Object.values(entries))
    .filter((entry) => isModelListEntryEnabled(entry))
    .map((entry) => modelListEntryToModel(entry));
  await session.context.route(/\/v1\/models(?:\?|$)/u, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': new URL(testBaseURL).origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify(catalog),
    });
  });
  session.agentHostGatewayServer = server;
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Agent-host gateway fixture did not bind a TCP address.');
  }
  await session.context.route(/\/v1\/llm\//u, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    url.hostname = '127.0.0.1';
    url.port = String(address.port);
    await route.continue({ url: url.href });
  });
  // A browser-placed chat's runs live in its durable log; the API never held
  // them. Record every chat-run call so a vertical can prove the reattach did
  // not ask (the API is absent from this stack, so the call would 503 anyway).
  await session.context.route(/\/v1\/chat\//u, async (route) => {
    session.agentHostApiRequests.push(new URL(route.request().url()).pathname);
    // Recorded, never redirected: the call still reaches the (absent) API
    // exactly as it did before, so this observation changes no behaviour.
    await route.continue();
  });
};

export const uiSetAgentHostGatewayFailure: BrowserCommand<[failure?: AgentHostGatewayFailure]> = (
  commandContext,
  failure,
) => {
  sessionFor(commandContext).agentHostGatewayFailure = failure;
};

export const uiReadAgentHostApiRequests: BrowserCommand<[], string[]> = (commandContext) => [
  ...sessionFor(commandContext).agentHostApiRequests,
];

export const uiReleaseAgentHostGatewayFixture: BrowserCommand = (commandContext) => {
  const session = sessionFor(commandContext);
  if (!session.agentHostGatewayRelease) {
    throw new Error('Agent-host gateway completion is not waiting at its deterministic gate.');
  }
  session.agentHostGatewayRelease();
};

export const uiReadAgentHostGatewayRequests: BrowserCommand<[], unknown[]> = (commandContext) => [
  ...sessionFor(commandContext).agentHostGatewayRequests,
];

/* ---------------------------------------------------------------------------
 * AV-4: a real `tau serve` daemon, serving the real serve-mode SPA (rung 1).
 * ------------------------------------------------------------------------- */

type RunningTauServe = Awaited<ReturnType<typeof startTauServeFixture>>;
const tauServeFixtures = new Map<string, RunningTauServe>();

const tauServeFor = (commandContext: BrowserCommandContext): RunningTauServe => {
  const fixture = tauServeFixtures.get(commandContext.sessionId);
  if (!fixture) {
    throw new Error('The tau serve fixture is not running for this session.');
  }
  return fixture;
};

export const uiStartTauServeFixture: BrowserCommand<[options?: TauServeFixtureOptions], TauServeFixture> = async (
  commandContext,
  options = {},
) => {
  const session = sessionFor(commandContext);
  session.agentHostApiRequests.length = 0;
  /* The API is absent from this stack by construction: a rung-1 turn goes
   * daemon-direct. Record any `/v1/chat/*` the page still tries so the vertical
   * can assert on the absence rather than on a silent 503. */
  await session.context.route(/\/v1\/chat\//u, async (route) => {
    session.agentHostApiRequests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 503, body: '{}', headers: { 'content-type': 'application/json' } });
  });
  /* The model *catalog* is metadata, not the chat data path: the daemon needs a
   * resolved provider wire on the admission it is handed, and no API runs in
   * this stack. Stubbing it leaves the AV-4 assertion — that no `/v1/chat/*`
   * request is ever made — untouched. */
  await session.context.route(/\/v1\/models(?:\?|$)/u, async (route) => {
    const request = route.request();
    /* `getModels` fetches with `credentials: 'include'`, and a credentialed
     * response may not answer `*` — it must echo the requesting origin and
     * allow credentials, or the browser drops it before the page sees it. */
    const origin = request.headers()['origin'] ?? '*';
    const headers = {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'accept,content-type',
      'access-control-allow-methods': 'GET,OPTIONS',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify([
        {
          id: 'anthropic-claude-opus-4.8',
          providerKind: 'tau-hosted',
          name: 'Claude Opus 4.8',
          slug: 'claude-opus-4-8',
          recommended: true,
          model: 'claude-opus-4-8',
          provider: { id: 'anthropic', name: 'Anthropic' },
          details: {
            family: 'claude',
            families: ['claude'],
            contextWindow: 200_000,
            maxTokens: 64_000,
            cost: { inputTokens: 5, outputTokens: 25, cacheReadTokens: 0.5, cacheWriteTokens: 6.25 },
          },
          configuration: { streaming: true },
          support: { tools: true, toolChoice: true, modalities: { input: ['text', 'image'], output: ['text'] } },
        },
      ]),
    });
  });
  const fixture = await startTauServeFixture(options);
  tauServeFixtures.set(commandContext.sessionId, fixture);
  return { origin: fixture.origin, workspace: fixture.workspace };
};

export const uiReleaseTauServeGateway: BrowserCommand = (commandContext) => {
  tauServeFor(commandContext).release();
};

export const uiReadTauServeFile: BrowserCommand<[relativePath: string], string | undefined> = async (
  commandContext,
  relativePath,
) => readTauServeFile(tauServeFor(commandContext).workspace, relativePath);

export const uiListTauServeChats: BrowserCommand<[], readonly string[]> = async (commandContext) =>
  listTauServeChats(tauServeFor(commandContext).workspace);

export const uiStopTauServeFixture: BrowserCommand = async (commandContext) => {
  const fixture = tauServeFixtures.get(commandContext.sessionId);
  if (!fixture) {
    return;
  }
  tauServeFixtures.delete(commandContext.sessionId);
  await fixture.dispose();
};

export const uiCaptureTargetDiagnostics: BrowserCommand<[], TargetDiagnostics> = async (commandContext) => {
  const session = sessionFor(commandContext);
  const directory = resolve(outputRoot, commandContext.sessionId);
  await mkdir(directory, { recursive: true });
  let screenshot: string | undefined;
  try {
    const screenshotBytes = await session.primary.screenshot({ fullPage: true });
    screenshot = screenshotBytes.toString('base64');
  } catch (error) {
    session.pageErrors.push(`Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  let tracePath: string | undefined;
  if (session.tracing) {
    tracePath = resolve(directory, 'trace.zip');
    await session.context.tracing.stop({ path: tracePath });
    session.tracing = false;
  }
  return {
    consoleMessages: session.consoleMessages,
    pageErrors: session.pageErrors,
    screenshot,
    tracePath,
    url: session.primary.url(),
  };
};

export const uiNavigateTarget: BrowserCommand<
  [path: string, surface?: TargetSurface],
  Readonly<Record<string, string>>
> = async (commandContext, path, surface) => {
  const response = await pageFor(sessionFor(commandContext), surface).goto(new URL(path, testBaseURL).href);
  if (!response) {
    throw new Error('UI E2E navigation did not return a document response.');
  }
  return response.headers();
};

export const uiReloadTarget: BrowserCommand<[surface?: TargetSurface]> = async (commandContext, surface) => {
  await pageFor(sessionFor(commandContext), surface).reload();
};

export const uiQualifyWebGpu: BrowserCommand<[profile: TargetWebGpuProfile], TargetWebGpuQualificationReport> = async (
  commandContext,
  profile,
) => {
  const session = sessionFor(commandContext);
  const page = session.primary;
  const pageReport = await page.evaluate(async (expectedProfile) => {
    type CompilationMessage = { readonly message?: string; readonly type: string };
    type GpuBuffer = {
      destroy(): void;
      getMappedRange(): ArrayBuffer;
      mapAsync(mode: number): Promise<void>;
      unmap(): void;
    };
    type GpuDevice = {
      readonly lost: Promise<{ readonly message?: string; readonly reason: string }>;
      readonly queue: { onSubmittedWorkDone(): Promise<void>; submit(commands: readonly unknown[]): void };
      addEventListener(
        type: 'uncapturederror',
        listener: (event: { readonly error?: { readonly message?: string } }) => void,
      ): void;
      removeEventListener(
        type: 'uncapturederror',
        listener: (event: { readonly error?: { readonly message?: string } }) => void,
      ): void;
      createBindGroup(descriptor: unknown): unknown;
      createBuffer(descriptor: { readonly size: number; readonly usage: number }): GpuBuffer;
      createCommandEncoder(): {
        beginComputePass(): {
          dispatchWorkgroups(count: number): void;
          end(): void;
          setBindGroup(index: number, bindGroup: unknown): void;
          setPipeline(pipeline: unknown): void;
        };
        copyBufferToBuffer(
          source: GpuBuffer,
          sourceOffset: number,
          target: GpuBuffer,
          targetOffset: number,
          size: number,
        ): void;
        finish(): unknown;
      };
      createComputePipeline(descriptor: unknown): { getBindGroupLayout(index: number): unknown };
      createShaderModule(descriptor: { readonly code: string }): {
        getCompilationInfo(): Promise<{ readonly messages: readonly CompilationMessage[] }>;
      };
      destroy(): void;
      popErrorScope(): Promise<{ readonly message?: string } | null>;
      pushErrorScope(filter: 'validation'): void;
    };
    type GpuAdapter = {
      readonly info?: {
        readonly architecture?: string;
        readonly description?: string;
        readonly device?: string;
        readonly vendor?: string;
      };
      readonly isFallbackAdapter?: boolean;
      requestDevice(): Promise<GpuDevice>;
    };
    type GpuNavigator = Navigator & {
      readonly gpu?: { requestAdapter(): Promise<GpuAdapter | null> };
    };
    type GpuConstants = typeof globalThis & {
      readonly GPUBufferUsage?: {
        readonly COPY_DST: number;
        readonly COPY_SRC: number;
        readonly MAP_READ: number;
        readonly STORAGE: number;
      };
      readonly GPUMapMode?: { readonly READ: number };
    };

    const qualificationErrors: string[] = [];
    const uncapturedErrors: string[] = [];
    const targetUrl = location.href;
    if (targetUrl === 'about:blank') {
      qualificationErrors.push('WebGPU qualification cannot run against about:blank.');
    }
    if (!isSecureContext) {
      qualificationErrors.push(`WebGPU qualification requires a secure context; received ${targetUrl}.`);
    }

    const { gpu } = navigator as GpuNavigator;
    const adapter = await gpu?.requestAdapter();
    const adapterInfo = adapter?.info;
    const explicitAdapter = adapter
      ? {
          architecture: adapterInfo?.architecture ?? '',
          description: adapterInfo?.description ?? '',
          device: adapterInfo?.device ?? '',
          fallback: adapter.isFallbackAdapter,
          vendor: adapterInfo?.vendor ?? '',
        }
      : undefined;
    const base = {
      profile: expectedProfile,
      secureContext: isSecureContext,
      targetUrl,
      userAgent: navigator.userAgent,
      hasNavigatorGpu: gpu !== undefined,
      adapterAvailable: adapter !== null && adapter !== undefined,
      adapter: explicitAdapter,
      deviceAvailable: false,
      validShaderErrors: 0,
      invalidShaderErrors: 0,
      expectedValidationError: undefined as string | undefined,
      computeReadback: undefined as number | undefined,
      expectedDeviceLossReason: undefined as string | undefined,
      uncapturedErrors,
      qualificationErrors,
    };

    if (expectedProfile === 'disabled') {
      if (adapter) {
        qualificationErrors.push('Disabled WebGPU profile returned an adapter.');
      }
      return base;
    }
    if (!gpu) {
      qualificationErrors.push('navigator.gpu is unavailable.');
      return base;
    }
    if (!adapter) {
      qualificationErrors.push('navigator.gpu.requestAdapter() returned null.');
      return base;
    }

    const device = await adapter.requestDevice();
    const onUncapturedError = (event: { readonly error?: { readonly message?: string } }): void => {
      uncapturedErrors.push(event.error?.message ?? 'Unknown WebGPU uncaptured error.');
    };
    device.addEventListener('uncapturederror', onUncapturedError);
    const loss = device.lost;
    let storage: GpuBuffer | undefined;
    let readback: GpuBuffer | undefined;
    try {
      const valid = device.createShaderModule({
        code: `@group(0) @binding(0) var<storage, read_write> output: array<u32>;
@compute @workgroup_size(1) fn main() { output[0] = 42u; }`,
      });
      device.pushErrorScope('validation');
      const invalid = device.createShaderModule({ code: '@compute fn broken(' });
      const [validInfo, invalidInfo] = await Promise.all([valid.getCompilationInfo(), invalid.getCompilationInfo()]);
      const expectedValidationError = await device.popErrorScope();
      base.validShaderErrors = validInfo.messages.filter(({ type }) => type === 'error').length;
      base.invalidShaderErrors = invalidInfo.messages.filter(({ type }) => type === 'error').length;
      base.expectedValidationError = expectedValidationError?.message;
      if (base.validShaderErrors !== 0) {
        qualificationErrors.push(`Valid WGSL emitted ${base.validShaderErrors} compilation errors.`);
      }
      if (base.invalidShaderErrors === 0) {
        qualificationErrors.push('Invalid WGSL emitted no compilation errors.');
      }
      if (!base.expectedValidationError) {
        qualificationErrors.push('Invalid WGSL did not produce a scoped validation error.');
      }

      const constants = globalThis as GpuConstants;
      const usage = constants.GPUBufferUsage;
      const mapMode = constants.GPUMapMode;
      if (!usage || !mapMode) {
        qualificationErrors.push('WebGPU buffer constants are unavailable.');
      } else {
        storage = device.createBuffer({ size: 4, usage: usage.STORAGE + usage.COPY_SRC });
        readback = device.createBuffer({ size: 4, usage: usage.MAP_READ + usage.COPY_DST });
        const pipeline = device.createComputePipeline({
          compute: { entryPoint: 'main', module: valid },
          layout: 'auto',
        });
        const bindGroup = device.createBindGroup({
          entries: [{ binding: 0, resource: { buffer: storage } }],
          layout: pipeline.getBindGroupLayout(0),
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(1);
        pass.end();
        encoder.copyBufferToBuffer(storage, 0, readback, 0, 4);
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        await readback.mapAsync(mapMode.READ);
        base.computeReadback = new Uint32Array(readback.getMappedRange())[0];
        readback.unmap();
        if (base.computeReadback !== 42) {
          qualificationErrors.push(`WebGPU compute returned ${String(base.computeReadback)} instead of 42.`);
        }
      }
    } catch (error) {
      qualificationErrors.push(error instanceof Error ? error.message : String(error));
    } finally {
      storage?.destroy();
      readback?.destroy();
      device.destroy();
      const lost = await loss;
      base.expectedDeviceLossReason = lost.reason;
      if (lost.reason !== 'destroyed') {
        qualificationErrors.push(`WebGPU device loss reason was '${lost.reason}', expected 'destroyed'.`);
      }
      device.removeEventListener('uncapturederror', onUncapturedError);
    }

    return { ...base, deviceAvailable: true };
  }, profile);

  const adapterClass = pageReport.adapter ? classifyWebGpuAdapter(pageReport.adapter) : undefined;
  const qualificationErrors = [...pageReport.qualificationErrors];
  if (profile !== 'disabled' && adapterClass !== profile) {
    qualificationErrors.push(`Expected ${profile} WebGPU, received ${adapterClass ?? 'no'} adapter.`);
  }
  const browser = commandContext.context.browser();
  const browserVersion = browser?.version() ?? 'unknown';
  let browserGpuDiagnostics: string | undefined;
  try {
    const cdpBrowser = browser as unknown as {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Playwright's public API uses this initialism.
      newBrowserCDPSession(): Promise<{ detach(): Promise<void>; send(method: string): Promise<unknown> }>;
    };
    const cdp = await cdpBrowser.newBrowserCDPSession();
    browserGpuDiagnostics = JSON.stringify(await cdp.send('SystemInfo.getInfo'));
    await cdp.detach();
  } catch {
    // CDP diagnostics are supplementary; adapter/device execution remains the qualification authority.
  }
  const launchFingerprint = JSON.stringify({
    adapter: pageReport.adapter,
    args: webGpuLaunchArguments(profile),
    browserVersion,
    platform: `${process.platform}-${process.arch}-${release()}`,
    profile,
  });
  const report = {
    ...pageReport,
    adapterClass,
    browserGpuDiagnostics,
    browserVersion,
    hostPlatform: `${process.platform}-${process.arch}-${release()}`,
    launchFingerprint,
    qualificationErrors,
  } as const;
  const directory = resolve(outputRoot, commandContext.sessionId);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `webgpu-qualification-${profile}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
};

export const uiSetViewport: BrowserCommand<[viewport: TargetViewport, surface?: TargetSurface]> = async (
  commandContext,
  viewport,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).setViewportSize(viewport);
};

export const uiEmulateColorScheme: BrowserCommand<
  [colorScheme: 'dark' | 'light' | 'no-preference', surface?: TargetSurface]
> = async (commandContext, colorScheme, surface) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({ colorScheme });
};

export const uiEmulateContrast: BrowserCommand<[contrast: 'more' | 'no-preference', surface?: TargetSurface]> = async (
  commandContext,
  contrast,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({ contrast });
};

export const uiEmulateForcedColors: BrowserCommand<[forcedColors: 'active' | 'none', surface?: TargetSurface]> = async (
  commandContext,
  forcedColors,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({ forcedColors });
};

export const uiClickTarget: BrowserCommand<
  [selector: string, options?: TargetClickOptions, surface?: TargetSurface]
> = async (commandContext, selector, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).click(options);
};

export const uiFillTarget: BrowserCommand<[selector: string, value: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  value,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).fill(value);
};

export const uiTypeTarget: BrowserCommand<[selector: string, value: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  value,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).pressSequentially(value);
};

export const uiPressTarget: BrowserCommand<[selector: string, key: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  key,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).press(key);
};

export const uiHoverTarget: BrowserCommand<[selector: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).hover();
};

export const uiFocusTarget: BrowserCommand<[selector: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).focus();
};

export const uiScrollTarget: BrowserCommand<[selector: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).scrollIntoViewIfNeeded();
};

export const uiDragTarget: BrowserCommand<[source: string, target: string, surface?: TargetSurface]> = async (
  commandContext,
  source,
  target,
  surface,
) => {
  const page = pageFor(sessionFor(commandContext), surface);
  await page.locator(source).dragTo(page.locator(target));
};

export const uiReadTarget: BrowserCommand<
  [selector: string, options?: TargetReadOptions, surface?: TargetSurface],
  TargetState
> = async (commandContext, selector, options, surface) => {
  const page = pageFor(sessionFor(commandContext), surface);
  const locator = page.locator(selector);
  const count = await locator.count();
  if (count === 0) {
    return { attributes: {}, className: '', count, focused: false, text: null, visible: false };
  }
  const first = locator.first();
  const attributes = Object.fromEntries(
    await Promise.all((options?.attributes ?? []).map(async (name) => [name, await first.getAttribute(name)] as const)),
  );
  let value: string | undefined;
  try {
    value = await first.inputValue();
  } catch {
    // Non-input elements have no value.
  }
  return {
    attributes,
    boundingBox: (await first.boundingBox()) ?? undefined,
    className: (await first.getAttribute('class')) ?? '',
    count,
    focused: await first.evaluate((element) => element === document.activeElement),
    text: await first.textContent(),
    value,
    visible: await first.isVisible(),
  };
};

export const uiEvaluateTarget: BrowserCommand<
  [source: string, argument?: unknown, surface?: TargetSurface],
  unknown
> = async (commandContext, source, argument, surface) =>
  pageFor(sessionFor(commandContext), surface).evaluate(
    ({ argument: value, source: functionSource }) =>
      (globalThis.eval(`(${functionSource})`) as (input: unknown) => unknown)(value),
    { argument, source },
  );

export const uiEvaluateTargetLocator: BrowserCommand<
  [selector: string, source: string, argument?: unknown, surface?: TargetSurface],
  unknown
> = async (commandContext, selector, source, argument, surface) =>
  pageFor(sessionFor(commandContext), surface)
    .locator(selector)
    .evaluate(
      (element, payload) =>
        (globalThis.eval(`(${payload.source})`) as (target: Element, input: unknown) => unknown)(
          element,
          payload.argument,
        ),
      { argument, source },
    );

export const uiAddInitScript: BrowserCommand<[source: string, argument?: unknown]> = async (
  commandContext,
  source,
  argument,
) => {
  await sessionFor(commandContext).primary.addInitScript({
    content: `(${source})(${JSON.stringify(argument)})`,
  });
};

export const uiWaitForTarget: BrowserCommand<
  [source: string, argument?: unknown, timeout?: number, surface?: TargetSurface]
> = async (commandContext, source, argument, timeout, surface) => {
  await pageFor(sessionFor(commandContext), surface).waitForFunction(
    ({ argument: value, source: functionSource }) =>
      (globalThis.eval(`(${functionSource})`) as (input: unknown) => unknown)(value),
    { argument, source },
    { timeout },
  );
};

export const uiKeyboardPress: BrowserCommand<[key: string, surface?: TargetSurface]> = async (
  commandContext,
  key,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).keyboard.press(key);
};

export const uiMouseMove: BrowserCommand<
  [x: number, y: number, options?: TargetMouseOptions, surface?: TargetSurface]
> = async (commandContext, x, y, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).mouse.move(x, y, options);
};

export const uiMouseDown: BrowserCommand<
  [options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface]
> = async (commandContext, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).mouse.down(options);
};

export const uiMouseUp: BrowserCommand<
  [options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface]
> = async (commandContext, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).mouse.up(options);
};

export const uiMouseClick: BrowserCommand<
  [x: number, y: number, options?: TargetClickOptions, surface?: TargetSurface]
> = async (commandContext, x, y, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).mouse.click(x, y, options);
};

export const uiScreenshotTarget: BrowserCommand<
  [selector?: string, artifactName?: string, surface?: TargetSurface],
  string
> = async (commandContext, selector, artifactName, surface) => {
  const page = pageFor(sessionFor(commandContext), surface);
  const bytes = selector
    ? await page.locator(selector).screenshot({ animations: 'disabled' })
    : await page.screenshot({ animations: 'disabled', fullPage: true });
  if (artifactName) {
    const safeName = artifactName.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-');
    const path = resolve(outputRoot, commandContext.sessionId, safeName);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes);
  }
  return bytes.toString('base64');
};

export const uiSampleCameraDuringClick: BrowserCommand<[selector: string, frameCount: number], unknown[]> = async (
  commandContext,
  selector,
  frameCount,
) => {
  const page = sessionFor(commandContext).primary;
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error('Viewport gizmo bounding box is unavailable.');
  }

  const samples = page.evaluate(async (count) => {
    const bridge = (
      globalThis as unknown as {
        __TAU_SECTION_VIEW_TEST__?: { getCamera(): unknown };
      }
    ).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is not installed.');
    }
    const frames: unknown[] = [];
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      frames.push(bridge.getCamera());
    }
    return frames;
  }, frameCount);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return samples;
};

export const uiOpenSecondaryTarget: BrowserCommand<[path: string]> = async (commandContext, path) => {
  const session = sessionFor(commandContext);
  if (session.secondary) {
    await session.secondary.close();
  }
  session.secondary = await session.context.newPage();
  observePage(session, session.secondary);
  await session.secondary.goto(new URL(path, testBaseURL).href);
};

export const uiCloseSecondaryTarget: BrowserCommand = async (commandContext) => {
  const session = sessionFor(commandContext);
  await session.secondary?.close();
  session.secondary = undefined;
};

export const uiCookies: BrowserCommand<[], TargetCookie[]> = async (commandContext) =>
  sessionFor(commandContext).context.cookies();

export const uiAddCookies: BrowserCommand<[cookies: readonly TargetCookie[]]> = async (commandContext, cookies) => {
  await sessionFor(commandContext).context.addCookies([...cookies]);
};

export const uiGrantPermissions: BrowserCommand<[permissions: readonly string[]]> = async (
  commandContext,
  permissions,
) => {
  await sessionFor(commandContext).context.grantPermissions([...permissions], { origin: testBaseURL });
};

export const uiChooseTargetFile: BrowserCommand<
  [triggerSelector: string, file: { readonly base64: string; readonly mimeType: string; readonly name: string }]
> = async (commandContext, triggerSelector, file) => {
  const page = sessionFor(commandContext).primary;
  const chooser = page.waitForEvent('filechooser');
  await page.locator(triggerSelector).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({ buffer: Buffer.from(file.base64, 'base64'), mimeType: file.mimeType, name: file.name });
};

export const uiDownloadTarget: BrowserCommand<
  [triggerSelector: string],
  { readonly base64: string; readonly suggestedFilename: string }
> = async (commandContext, triggerSelector) => {
  const page = sessionFor(commandContext).primary;
  const pendingDownload = page.waitForEvent('download', { timeout: 120_000 });
  await page.locator(triggerSelector).click();
  const download = await pendingDownload;
  const path = await download.path();
  if (!path) {
    throw new Error('UI E2E download did not expose a readable artifact path.');
  }
  const bytes = await readFile(path);
  return {
    base64: bytes.toString('base64'),
    suggestedFilename: download.suggestedFilename(),
  };
};

export const uiReadTargetEvents: BrowserCommand<
  [],
  {
    readonly consoleMessages: ReadonlyArray<{ readonly text: string; readonly type: string }>;
    readonly pageErrors: readonly string[];
  }
> = (commandContext) => {
  const session = sessionFor(commandContext);
  return { consoleMessages: session.consoleMessages, pageErrors: session.pageErrors };
};

export const uiBrowserCommands = {
  uiAddCookies,
  uiAddInitScript,
  uiAuthenticateTauTestUser,
  uiCaptureTargetDiagnostics,
  uiChooseTargetFile,
  uiClickTarget,
  uiCloseSecondaryTarget,
  uiCloseTarget,
  uiCookies,
  uiDragTarget,
  uiDownloadTarget,
  uiEmulateColorScheme,
  uiEmulateContrast,
  uiEmulateForcedColors,
  uiEvaluateTarget,
  uiEvaluateTargetLocator,
  uiFillTarget,
  uiFocusTarget,
  uiGrantPermissions,
  uiHoverTarget,
  uiInstallPaseoRestFixture,
  uiStartPaseoFakeDaemon,
  uiStopPaseoFakeDaemon,
  uiInstallAgentHostGatewayFixture,
  uiReadAgentHostApiRequests,
  uiSetAgentHostGatewayFailure,
  uiKeyboardPress,
  uiMouseClick,
  uiMouseDown,
  uiMouseMove,
  uiMouseUp,
  uiNavigateTarget,
  uiOpenSecondaryTarget,
  uiOpenTarget,
  uiPressTarget,
  uiQualifyWebGpu,
  uiReadTarget,
  uiReadAgentHostGatewayRequests,
  uiReleaseAgentHostGatewayFixture,
  uiReadTargetEvents,
  uiReloadTarget,
  uiScreenshotTarget,
  uiSampleCameraDuringClick,
  uiScrollTarget,
  uiSetViewport,
  uiStartHostFixture,
  uiStartTauServeFixture,
  uiStopTauServeFixture,
  uiReleaseTauServeGateway,
  uiReadTauServeFile,
  uiListTauServeChats,
  uiTypeTarget,
  uiWaitForTarget,
};
