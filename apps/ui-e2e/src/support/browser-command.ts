/* oxlint-disable max-params, no-await-in-loop, no-eval, no-restricted-imports, tau-lint/no-bare-time-identifier, typescript/consistent-type-definitions, typescript/no-restricted-types -- Vitest command callbacks add their context parameter to the explicit external-target contract, and config-time modules cannot use test aliases. `no-eval` is the external-target contract itself: `evaluateTarget`, `evaluateTargetLocator` and `waitForTarget` take a function SOURCE across the browser↔node command boundary — nothing else survives that serialization — and the page reconstitutes it. The sources are spec literals, never page-derived input. */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { release } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import type { BrowserCommand, BrowserCommandContext } from 'vitest/node';
import { captureChatLogs, chatLogDestination, writeChatLogs } from '@taucad/formal/capture';
import type { CapturedChatLog } from '@taucad/formal/capture';
import { localDatabaseName } from '@taucad/utils/worktree-database';
import type {
  AgentHostGatewayFixtureOptions,
  TargetClickOptions,
  TargetCookie,
  TargetDiagnostics,
  TargetMouseOptions,
  TargetReadOptions,
  TargetState,
  TargetSurface,
  TargetTauBillingOperation,
  TargetTauTestAccount,
  TargetViewport,
  TargetWebGpuProfile,
  TargetWebGpuQualificationReport,
  TargetWorker,
  TargetWorkerFlowEvidence,
} from './external-target.ts';
import { testBaseURL } from './base-url.ts';
import { classifyWebGpuAdapter, webGpuLaunchArguments } from './webgpu-profile.ts';
import { listTauServeChats, readTauServeFile, startTauServeFixture } from './tau-serve-fixture.ts';
import type { TauServeFixture, TauServeFixtureOptions } from './tau-serve-fixture.ts';
import { validateProjectionFixtureBytes } from './projection-fixture-validation.ts';
import type { ProjectionFixtureProof } from './projection-fixture-validation.ts';
import { browserHostScript, createGatewayScriptWalk } from './agent-host-gateway-script.ts';
import type { GatewayScriptTurn, GatewayScriptWalk, GatewayTurnCount } from './agent-host-gateway-script.ts';

type ProviderContext = BrowserCommandContext['context'];
type TargetPage = Awaited<ReturnType<ProviderContext['newPage']>>;
type CdpSession = Awaited<ReturnType<ProviderContext['newCDPSession']>>;

/** Refusal the agent-host gateway fixture answers with while it is armed. */
type AgentHostGatewayFailure = {
  readonly status: number;
  readonly message: string;
  /**
   * The wire error type, which is what decides the run's coded failure.
   *
   * Tau's own gateway refuses with one of `gatewayErrorCodes` here, and
   * `gatewayErrorCode` maps anything else — an upstream provider's own
   * `api_error`, for one — to `UNKNOWN_GATEWAY_ERROR`, which
   * `isResumableRunFailure` rejects. So the default refusal is one the turn
   * cannot continue from and *Try again* rewinds; a row that means to exercise
   * a *resumable* refusal (I1: one run, two attempts) has to name a code the
   * host can continue, exactly as the gateway would.
   */
  readonly type?: string;
};

/** Where a gateway request is parked, and which turn it belongs to. */
type AgentHostGatewayGate = {
  /** `request` parks before any byte is answered; `stream` parks mid-response. */
  readonly kind: 'request' | 'stream';
  /** The user text of the turn this request asks for. */
  readonly turn: string;
};

type ParkedGate = AgentHostGatewayGate & { readonly release: () => void };

/** What the fixture is holding and what it has been asked, right now. */
export type AgentHostGatewayState = {
  /** Bounded actual SSE writes, for correlating held provider output with channel delivery. */
  readonly emitted: ReadonlyArray<{
    readonly request: number;
    readonly turn: string;
    readonly event: string;
    readonly at: number;
    readonly text?: string;
  }>;
  /** Every request parked at a gate, oldest first. Its length is the pending count. */
  readonly parked: readonly AgentHostGatewayGate[];
  /** Per-turn provider-call counts, in the order the turns were first asked. */
  readonly turns: readonly GatewayTurnCount[];
};

type Session = {
  geospecFault?: TargetDiagnostics['geospecFault'];
  geospecWasm?: Promise<TargetDiagnostics['geospecWasm']>;
  readonly agentHostApiRequests: string[];
  readonly agentHostGatewayRequests: unknown[];
  readonly consoleMessages: Array<{
    readonly text: string;
    readonly type: string;
  }>;
  readonly context: ProviderContext;
  /** The DevTools session of each page whose CPU profile `uiCpuProfile` is recording. */
  readonly cpuProfiles: Map<
    TargetSurface,
    {
      readonly cdp: CdpSession;
      readonly navigationStartSeconds: number;
      readonly stopWorkers?: (path: string) => Promise<void>;
      readonly snapshotWorkers?: (path: string) => Promise<void>;
    }
  >;
  readonly pageErrors: string[];
  readonly posthogEvents: Array<{ readonly event: string; readonly decoded: string }>;
  readonly posthogRequests: string[];
  readonly primary: TargetPage;
  readonly workerIds: WeakMap<object, string>;
  nextWorkerId: number;
  readonly agentHostGatewayGates: ParkedGate[];
  readonly agentHostGatewayEmitted: Array<AgentHostGatewayState['emitted'][number]>;
  agentHostGatewayFailure?: AgentHostGatewayFailure | undefined;
  /** Armed by `uiHoldNextAgentHostGatewayRequest`; consumed by the next request. */
  agentHostGatewayRequestHold?: boolean;
  agentHostGatewayServer?: Server;
  agentHostGatewayWalk?: GatewayScriptWalk;
  secondary?: TargetPage;
  testUserEmail?: string;
  tracing: boolean;
};

const sessions = new Map<string, Session>();
const observedDownloads = new WeakMap<
  TargetPage,
  Array<Promise<{ readonly base64: string; readonly suggestedFilename: string } | Error>>
>();

const hostFixtureProcesses = new Map<string, ChildProcess>();
const outputRoot = resolve(
  import.meta.dirname,
  '../../../..',
  'out/test-results/vitest-browser/apps/ui-e2e/test-output',
);

const tauApiUrl = process.env['TAU_E2E_API_URL'] ?? 'http://localhost:4000';
const execFileAsync = promisify(execFile);

const assertTauTestEmail = (email: string): void => {
  if (!/^[a-z0-9._@-]+$/u.test(email)) {
    throw new Error('UI E2E test-account email contains unsupported characters.');
  }
};

const queryTauDatabase = async (statement: string): Promise<string> => {
  const result = await execFileAsync(
    'docker',
    [
      'exec',
      'tau-postgres',
      'psql',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'dev_user',
      '-d',
      localDatabaseName(),
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  );
  return result.stdout.trim();
};

const executeTauDatabase = async (statement: string): Promise<void> => {
  await queryTauDatabase(statement);
};

const runDevelopmentBillingAccount = async (
  action: 'close' | 'fund',
  email: string,
  creditAtoms?: string,
): Promise<void> => {
  await execFileAsync(
    process.execPath,
    [
      '--env-file-if-exists=apps/api/.env',
      '--import',
      '@oxc-node/core/register',
      'apps/api/app/testing/development-billing-account.ts',
      action,
      '--email',
      email,
      ...(creditAtoms === undefined ? [] : ['--atoms', creditAtoms]),
    ],
    {
      cwd: resolve(import.meta.dirname, '../../../..'),
      encoding: 'utf8',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment contract
      env: { ...process.env, BILLING_ENVIRONMENT: 'development' },
    },
  );
};

const deleteTauTestUser = async (email: string): Promise<void> => {
  assertTauTestEmail(email);
  const statement = `DELETE FROM "user" WHERE email = '${email}';`;
  try {
    await executeTauDatabase(statement);
  } catch (error) {
    /* `billing.require_financial_closure` rejects the delete while a funded
     * owner binding is retained; run the development closure first, as the
     * desktop-e2e seeder does. */
    if (!String(error).includes('financial closure must precede auth deletion')) {
      throw error;
    }
    await runDevelopmentBillingAccount('close', email);
    await executeTauDatabase(statement);
  }
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
  page.on('console', (message) =>
    session.consoleMessages.push({
      text: message.text(),
      type: message.type(),
    }),
  );
  page.on('pageerror', (error) => session.pageErrors.push(error.message));
};

const disposeSession = async (session: Session): Promise<void> => {
  const errors: unknown[] = [];
  for (const gate of session.agentHostGatewayGates.splice(0)) {
    gate.release();
  }
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
  await session.geospecWasm;
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
  await session.context.addInitScript((apiUrl) => {
    Object.defineProperty(globalThis, 'ENV', {
      configurable: true,
      value: Object.fromEntries([['TAU_API_URL', apiUrl]]),
      writable: true,
    });
  }, tauApiUrl);
  const headers = { origin: testBaseURL };
  const signUp = await session.context.request.post(`${tauApiUrl}/v1/auth/sign-up/email`, {
    data: {
      email: account.email,
      name: account.name,
      password: account.password,
    },
    headers,
  });
  if (!signUp.ok()) {
    /* `INVALID_ORIGIN` is the usual one: the API at TAU_E2E_API_URL trusts only
     * its own TAU_FRONTEND_URL, which must be this run's origin. */
    const body = await signUp.text();
    throw new Error(
      `Tau test-account sign-up failed with HTTP ${signUp.status()} from ${tauApiUrl} for origin ${testBaseURL}: ${body.slice(0, 200)}`,
    );
  }

  await executeTauDatabase(`UPDATE "user" SET email_verified = true WHERE email = '${account.email}';`);
  await runDevelopmentBillingAccount('fund', account.email, account.creditAtoms);
  const signIn = await session.context.request.post(`${tauApiUrl}/v1/auth/sign-in/email`, {
    data: { email: account.email, password: account.password },
    headers,
  });
  if (!signIn.ok()) {
    throw new Error(`Tau test-account sign-in failed with HTTP ${signIn.status()}.`);
  }
};

export const uiReadTauVertexOperations: BrowserCommand<[email: string], TargetTauBillingOperation[]> = async (
  _commandContext,
  email,
) => {
  assertTauTestEmail(email);
  const result = await queryTauDatabase(`
    SELECT COALESCE(json_agg(json_build_object(
      'operationId', operation.id,
      'customerState', operation.customer_state,
      'executionStatus', operation.execution_status,
      'meteringStatus', operation.metering_status,
      'outputTokens', operation.output_tokens::text,
      'reasoningTokens', operation.reasoning_tokens::text,
      'terminalRevision', operation.terminal_revision::text
    ) ORDER BY operation.admitted_at), '[]'::json)::text
    FROM billing.credit_operation AS operation
    JOIN billing.billing_owner_binding AS binding ON binding.account_id = operation.account_id
    JOIN "user" AS auth_user ON auth_user.id = binding.auth_user_id
    WHERE auth_user.email = '${email}' AND operation.provider_id = 'vertexai';
  `);
  return JSON.parse(result) as TargetTauBillingOperation[];
};

export const uiOpenTarget: BrowserCommand<[options?: { deviceScaleFactor?: number }]> = async (
  commandContext,
  options,
) => {
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
  const context = await browser.newContext(options);
  context.setDefaultTimeout(10_000);
  const primary = await context.newPage();
  const session: Session = {
    agentHostApiRequests: [],
    agentHostGatewayGates: [],
    agentHostGatewayEmitted: [],
    agentHostGatewayRequests: [],
    consoleMessages: [],
    context,
    cpuProfiles: new Map(),
    pageErrors: [],
    posthogEvents: [],
    posthogRequests: [],
    primary,
    workerIds: new WeakMap(),
    nextWorkerId: 0,
    tracing: false,
  };
  observePage(session, primary);
  if (process.env['TAU_E2E_TRACE'] !== 'false') {
    await context.tracing.start({ screenshots: true, snapshots: true });
    session.tracing = true;
  }
  sessions.set(commandContext.sessionId, session);
};

/**
 * Every `.tau/chats/<chatId>/events.jsonl` in the page's OPFS, the same walk
 * `readHomeGlobText` does. A closed or navigated-away page yields nothing: capture
 * is evidence for `formal:logs`, never a reason to fail teardown.
 */
const readOpfsChatLogs = async (page: TargetPage): Promise<CapturedChatLog[]> => {
  try {
    return await page.evaluate(async () => {
      const found: Array<{ chatId: string; text: string }> = [];
      const walk = async (directory: FileSystemDirectoryHandle, depth: number): Promise<void> => {
        for await (const handle of directory.values()) {
          if (handle.kind !== 'directory') {
            continue;
          }
          if (handle.name === '.tau') {
            const chats = await handle.getDirectoryHandle('chats').catch(() => undefined);
            for await (const chat of chats?.values() ?? []) {
              const file =
                chat.kind === 'directory' ? await chat.getFileHandle('events.jsonl').catch(() => undefined) : undefined;
              if (file) {
                const blob = await file.getFile();
                found.push({ chatId: chat.name, text: await blob.text() });
              }
            }
          } else if (depth > 0) {
            await walk(handle, depth - 1);
          }
        }
      };
      await walk(await navigator.storage.getDirectory(), 3);
      return found;
    });
  } catch {
    return [];
  }
};

export const uiCloseTarget: BrowserCommand = async (commandContext) => {
  const session = sessions.get(commandContext.sessionId);
  if (!session) {
    return;
  }
  sessions.delete(commandContext.sessionId);
  /* Field trace validation (formal-verification policy): keep every chat log this
   * session wrote, from OPFS and from the daemon's workspace, before disposal
   * removes them. `formal:logs` validates the copies against ChatLog.tla. */
  const logs = chatLogDestination('ui-e2e', commandContext.testPath);
  await writeChatLogs(logs, await readOpfsChatLogs(session.primary));
  const daemon = tauServeFixtures.get(commandContext.sessionId);
  if (daemon) {
    await captureChatLogs(daemon.workspace, logs);
  }
  await disposeSession(session);
  /* A spec that fails mid-vertical must not leak a daemon, its two stub
   * servers and a temp workspace onto the machine. */
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
 * Park one request at a gate until a spec releases it.
 *
 * Gates are a list, not one resolver: two chats can be mid-run at once, and a
 * request-entry hold and a stream hold can be pending together. The entry is
 * removed when it resolves, so `parked` is what is waiting *now*.
 */
const parkAtGate = async (session: Session, kind: 'request' | 'stream', turn: string): Promise<void> => {
  const gate = Promise.withResolvers<void>();
  const entry: ParkedGate = { kind, turn, release: gate.resolve };
  session.agentHostGatewayGates.push(entry);
  try {
    await gate.promise;
  } finally {
    const index = session.agentHostGatewayGates.indexOf(entry);
    if (index !== -1) {
      session.agentHostGatewayGates.splice(index, 1);
    }
  }
};

/* Newest first: a single-resolver fixture overwrote its resolver, so the gate a
 * bare release answered was always the most recent one. */
const releaseGate = (session: Session, kind: ParkedGate['kind'], turn: string | undefined, absent: string): void => {
  const index = session.agentHostGatewayGates.findLastIndex(
    (gate) => gate.kind === kind && (turn === undefined || gate.turn.includes(turn)),
  );
  if (index === -1) {
    throw new Error(absent);
  }
  /* Removed here, not only in `parkAtGate`'s `finally`: that runs a microtask
   * later, and two releases in a row would otherwise both answer the same gate
   * and leave the second request parked. */
  const [gate] = session.agentHostGatewayGates.splice(index, 1);
  gate!.release();
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
  /** The user text of the turn this response answers, so its gate is addressable. */
  readonly turnKey: string;
  readonly writeEvent: (event: string, data: unknown) => void;
}): Promise<void> => {
  const { currentRequest, session, turn, turnKey, writeEvent } = options;
  const pause = async (required = turn.gated === true): Promise<void> => {
    if (required) {
      await parkAtGate(session, 'stream', turnKey);
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
  const reasoningBlocks = turn.reasoningBlocks?.map((reasoningBlock) => [reasoningBlock]) ?? [
    turn.reasoningChunks ?? (turn.reasoning === undefined ? [] : [turn.reasoning]),
  ];
  for (const [reasoningBlockIndex, reasoningChunks] of reasoningBlocks.entries()) {
    if (reasoningChunks.length === 0) {
      continue;
    }
    writeEvent('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '' },
    });
    for (const reasoning of reasoningChunks) {
      writeEvent('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'thinking_delta', thinking: reasoning },
      });
      if (turn.gateChunks) {
        await pause(true);
      }
    }
    writeEvent('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: {
        type: 'signature_delta',
        signature: `browser-host-e2e-signature-${String(currentRequest)}-${String(reasoningBlockIndex)}`,
      },
    });
    writeEvent('content_block_stop', { type: 'content_block_stop', index });
    index += 1;
  }
  const textChunks = turn.textChunks ?? (turn.text === undefined ? [] : [turn.text]);
  if (textChunks.length === 0) {
    await pause();
  } else {
    writeEvent('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'text', text: '' },
    });
    for (const text of textChunks) {
      writeEvent('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text },
      });
      if (turn.gateChunks) {
        await pause(true);
      }
    }
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
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify(call.args),
      },
    });
    writeEvent('content_block_stop', { type: 'content_block_stop', index });
    index += 1;
  }
  writeEvent('message_delta', {
    type: 'message_delta',
    delta: {
      stop_reason: (turn.toolCalls?.length ?? 0) > 0 ? 'tool_use' : 'end_turn',
      stop_sequence: null,
    },
    usage: { output_tokens: turn.usage.outputTokens },
  });
  writeEvent('message_stop', { type: 'message_stop' });
};
/* eslint-enable @typescript-eslint/naming-convention -- The Anthropic wire fixture ends here. */

export const uiInstallAgentHostGatewayFixture: BrowserCommand<
  [script?: readonly GatewayScriptTurn[], options?: AgentHostGatewayFixtureOptions]
> = async (commandContext, script = browserHostScript, options = {}) => {
  const session = sessionFor(commandContext);
  let geospecFaultActive = options.geospecFault !== undefined;
  await session.context.route(/\/geospec_engine_native(?:-[\w-]+)?\.wasm(?:\?.*)?$/u, async (route) => {
    if (geospecFaultActive && options.geospecFault !== undefined) {
      const kind = options.geospecFault;
      session.geospecFault = {
        kind,
        url: session.geospecFault?.url ?? route.request().url(),
        requests: (session.geospecFault?.requests ?? 0) + 1,
      };
      if (kind === 'missing') {
        await route.abort('failed');
      } else {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/wasm', 'x-tau-geospec-fault': 'corrupt' },
          body: Buffer.from([0, 1, 2, 3]),
        });
      }
      return;
    }
    if (session.geospecWasm !== undefined) {
      await route.continue();
      return;
    }
    // Capture and forward this intercepted request once, not a second asset fetch.
    // APIResponse.body is decoded; inspector Response.body can evict this large asset.
    session.geospecWasm = (async () => {
      try {
        const response = await route.fetch();
        const bytes = await response.body();
        const headers = response.headers();
        // The decoded body must not advertise its old compressed framing.
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        headers['content-length'] = String(bytes.byteLength);
        await route.fulfill({ status: response.status(), headers, body: bytes });
        const sourceBytes = await readFile(
          resolve(
            import.meta.dirname,
            '../../../../packages/geospec-engine-native/bindings/emscripten/generated/geospec_engine_native.wasm',
          ),
        );
        return {
          url: response.url(),
          status: response.status(),
          byteLength: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
          sourceByteLength: sourceBytes.byteLength,
          expectedSha256: process.env['TAU_E2E_GEOSPEC_WASM_SHA256'],
          expectedByteLength:
            process.env['TAU_E2E_GEOSPEC_WASM_BYTES'] === undefined
              ? undefined
              : Number(process.env['TAU_E2E_GEOSPEC_WASM_BYTES']),
        };
      } catch (error) {
        session.pageErrors.push(
          `GeoSpec WASM response capture failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        await route.abort('failed').catch(() => undefined);
        return undefined;
      }
    })();
    await session.geospecWasm;
  });
  session.agentHostGatewayRequests.length = 0;
  session.agentHostApiRequests.length = 0;
  for (const gate of session.agentHostGatewayGates.splice(0)) {
    gate.release();
  }
  session.agentHostGatewayRequestHold = false;
  session.agentHostGatewayFailure = undefined;
  const walk = createGatewayScriptWalk(script);
  session.agentHostGatewayWalk = walk;
  session.agentHostGatewayEmitted.length = 0;
  let requestIndex = 0;
  const headers = {
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'accept,content-type',
    'access-control-allow-methods': 'OPTIONS,POST',
    'access-control-allow-origin': new URL(testBaseURL).origin,
    'access-control-expose-headers': 'x-tau-operation-id',
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
        const parsed = JSON.parse(body.join('')) as Parameters<typeof walk.record>[0] & {
          readonly tools?: readonly unknown[];
        };
        session.agentHostGatewayRequests.push(parsed);
        /* A compaction summary is the one call the host sends with no tools
         * (`compactionModelsWithTransport`, `session.ts`) and it lands between
         * the agent's own calls. It is not a turn, so it is answered off-script
         * and never reaches the walk: recording it would count as an ask of the
         * turn it summarises. `summary: ''` is the summariser failure a turn
         * must survive. Without the option the fixture behaves as it did. */
        const isSummaryRequest = options.summary !== undefined && (parsed.tools?.length ?? 0) === 0;
        const step = isSummaryRequest ? undefined : walk.record(parsed);
        // F1: park at request entry, before any byte is answered, so a spec can
        // hold its turn in `queued.dispatched` instead of racing the stream.
        if (step !== undefined && session.agentHostGatewayRequestHold === true) {
          session.agentHostGatewayRequestHold = false;
          await parkAtGate(session, 'request', step.turn);
        }
        const { agentHostGatewayFailure } = session;
        if (agentHostGatewayFailure) {
          // A coded provider refusal, not a dropped socket: the browser host
          // records it as the run's typed `RunFailureDetail`, which is what a
          // reattached terminal log has to render back.
          response.writeHead(agentHostGatewayFailure.status, {
            ...headers,
            'content-type': 'application/json',
          });
          response.end(
            JSON.stringify({
              type: 'error',
              error: {
                type: agentHostGatewayFailure.type ?? 'api_error',
                message: agentHostGatewayFailure.message,
              },
            }),
          );
          return;
        }
        const currentRequest = requestIndex++;
        const writeEvent = (event: string, data: unknown): void => {
          response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          const delta = typeof data === 'object' && data !== null && 'delta' in data ? data.delta : undefined;
          const text =
            typeof delta === 'object' && delta !== null && 'text' in delta && typeof delta.text === 'string'
              ? delta.text
              : undefined;
          if (session.agentHostGatewayEmitted.length === 16) {
            session.agentHostGatewayEmitted.shift();
          }
          session.agentHostGatewayEmitted.push({
            request: currentRequest,
            turn: (step?.turn ?? '').slice(0, 256),
            event,
            at: Date.now(),
            ...(text === undefined ? {} : { text: text.slice(0, 256) }),
          });
        };
        response.writeHead(200, {
          ...headers,
          'cache-control': 'no-cache',
          'x-tau-operation-id': `browser-host-e2e-operation-${String(currentRequest)}`,
        });
        response.flushHeaders();
        const turn =
          step === undefined
            ? { text: options.summary, usage: { inputTokens: 40, outputTokens: 10 } }
            : walk.serve(step);
        // Streaming compilation may refetch after a fault. Keep that entire
        // first initialization failed, then retire the fault at the first terminal turn.
        if (turn.toolCalls === undefined && turn.text !== undefined) {
          geospecFaultActive = false;
        }
        await writeScriptedTurn({
          currentRequest,
          session,
          turn,
          turnKey: step?.turn ?? '',
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
    // eslint-disable-next-line @nx/enforce-module-boundaries -- This e2e-only catalog stub deliberately uses the API's real rows.
    await import('../../../api/app/api/models/model.constants.js');
  const catalog = Object.values(modelList)
    .flatMap((entries) => Object.values(entries))
    .filter((entry) => isModelListEntryEnabled(entry))
    // The window a row advertises is the compaction budget `agentHostConfig`
    // hands the host, so overriding it is how a vertical crosses the compaction
    // threshold on scripted usage instead of on real megabytes.
    .map((entry) => {
      const model = modelListEntryToModel(entry);
      const { contextWindow } = options;
      return contextWindow === undefined ? model : { ...model, details: { ...model.details, contextWindow } };
    });
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

/** Local SDK transport: no analytics request can leave the browser context. */
export const uiInstallPostHogFixture: BrowserCommand<[apiKey: string]> = async (commandContext, apiKey) => {
  const session = sessionFor(commandContext);
  const recorder = await readFile(
    resolve(import.meta.dirname, '../../../../node_modules/posthog-js/dist/lazy-recorder.js'),
  );
  const deadClicks = await readFile(
    resolve(import.meta.dirname, '../../../../node_modules/posthog-js/dist/dead-clicks-autocapture.js'),
  );
  await session.context.addInitScript(
    ({ key }) => {
      Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: navigator.userAgent.replace('HeadlessChrome', 'Chrome'),
      });
      (globalThis as typeof globalThis & { ENV?: Record<string, unknown> }).ENV = {
        ...(globalThis as typeof globalThis & { ENV?: Record<string, unknown> }).ENV,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- client environment wire name
        POSTHOG_CLIENT_KEY: key,
      };
      (globalThis as typeof globalThis & { _POSTHOG_REMOTE_CONFIG?: Record<string, unknown> })._POSTHOG_REMOTE_CONFIG =
        {
          [key]: { config: { sessionRecording: { sampleRate: 1, minimumDurationMilliseconds: 0 } } },
        };
    },
    { key: apiKey },
  );
  await session.context.route(/\/api\/ph\//u, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    session.posthogRequests.push(`${request.method()} ${url.pathname}`);
    if (url.pathname.endsWith('/lazy-recorder.js')) {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: recorder });
      return;
    }
    if (url.pathname.endsWith('/dead-clicks-autocapture.js')) {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: deadClicks });
      return;
    }
    const body = request.postDataBuffer();
    if (body && (url.pathname.includes('/e/') || url.pathname.includes('/s/'))) {
      const decoded = body[0] === 31 && body[1] === 139 ? gunzipSync(body).toString('utf8') : body.toString('utf8');
      const payload: unknown = JSON.parse(decoded);
      const events: unknown[] = Array.isArray(payload) ? (payload as unknown[]) : [payload];
      for (const event of events) {
        if (event !== null && typeof event === 'object' && 'event' in event && typeof event.event === 'string') {
          const compressed: string[] = [];
          const visit = (value: unknown): void => {
            if (typeof value === 'string' && value.codePointAt(0) === 31 && value.codePointAt(1) === 139) {
              compressed.push(gunzipSync(Buffer.from(value, 'latin1')).toString('utf8'));
            } else if (Array.isArray(value)) {
              for (const item of value) {
                visit(item);
              }
            } else if (value !== null && typeof value === 'object') {
              for (const item of Object.values(value)) {
                visit(item);
              }
            }
          };
          visit(event);
          session.posthogEvents.push({
            event: event.event,
            decoded: `${JSON.stringify(event)}\n${compressed.join('\n')}`,
          });
        }
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"flags":{}}' });
  });
};

export const uiReadPostHogSummary: BrowserCommand<
  [sentinels: readonly string[]],
  { readonly events: string[]; readonly requests: string[]; readonly present: Record<string, boolean> }
> = (commandContext, sentinels) => {
  const session = sessionFor(commandContext);
  const events = session.posthogEvents;
  return {
    events: events.map(({ event }) => event),
    requests: [...session.posthogRequests],
    present: Object.fromEntries(
      sentinels.map((sentinel) => [sentinel, events.some(({ decoded }) => decoded.includes(sentinel))]),
    ),
  };
};

/** Release a response parked mid-stream; omit `turn` for the newest one. */
export const uiReleaseAgentHostGatewayFixture: BrowserCommand<[turn?: string]> = (commandContext, turn) => {
  releaseGate(
    sessionFor(commandContext),
    'stream',
    turn,
    'Agent-host gateway completion is not waiting at its deterministic gate.',
  );
};

/** Hold the next request at its entry, before the gateway answers a single byte (F1). */
export const uiHoldNextAgentHostGatewayRequest: BrowserCommand = (commandContext) => {
  sessionFor(commandContext).agentHostGatewayRequestHold = true;
};

/** Release a request parked at its entry; omit `turn` for the newest one. */
export const uiReleaseAgentHostGatewayRequest: BrowserCommand<[turn?: string]> = (commandContext, turn) => {
  releaseGate(
    sessionFor(commandContext),
    'request',
    turn,
    'No agent-host gateway request is waiting at its entry gate.',
  );
};

/**
 * What the fixture holds and what it has been asked (F5).
 *
 * `parked.length` is the pending count, and `turns` separates *asks* of a turn
 * from its agent-loop continuations — one ask per attempt is the contract a
 * cumulative request total cannot express.
 */
export const uiReadAgentHostGatewayState: BrowserCommand<[], AgentHostGatewayState> = (commandContext) => {
  const session = sessionFor(commandContext);
  return {
    parked: session.agentHostGatewayGates.map(({ kind, turn }) => ({ kind, turn })),
    turns: session.agentHostGatewayWalk?.counts() ?? [],
    emitted: [...session.agentHostGatewayEmitted],
  };
};

/**
 * Wait until a request is parked at a gate, and answer which one (F2).
 *
 * A gated row used to release blind and fail inside the fixture when nothing
 * was waiting yet; the release keeps that throw, and this is the wait.
 */
export const uiWaitForAgentHostGatewayGate: BrowserCommand<
  [match?: { readonly kind?: 'request' | 'stream'; readonly turn?: string }, timeoutMilliseconds?: number],
  AgentHostGatewayGate
> = async (commandContext, match = {}, timeoutMilliseconds = 30_000) => {
  const session = sessionFor(commandContext);
  const deadline = Date.now() + timeoutMilliseconds;
  for (;;) {
    const parked = session.agentHostGatewayGates.find(
      (gate) =>
        (match.kind === undefined || gate.kind === match.kind) &&
        (match.turn === undefined || gate.turn.includes(match.turn)),
    );
    if (parked) {
      return { kind: parked.kind, turn: parked.turn };
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `No agent-host gateway request parked at ${JSON.stringify(match)} within ${String(timeoutMilliseconds)}ms; parked: ${JSON.stringify(
          session.agentHostGatewayGates.map(({ kind, turn }) => ({ kind, turn })),
        )}`,
      );
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }
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
    await route.fulfill({
      status: 503,
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
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
            cost: {
              inputTokens: 5,
              outputTokens: 25,
              cacheReadTokens: 0.5,
              cacheWriteTokens: 6.25,
            },
          },
          configuration: { streaming: true },
          support: {
            tools: true,
            toolChoice: true,
            modalities: { input: ['text', 'image'], output: ['text'] },
          },
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

/** Whether the daemon's second provider request is parked before its final answer. */
export const uiIsTauServeGatewayHeld: BrowserCommand<[], boolean> = (commandContext) =>
  tauServeFor(commandContext).secondRequestHeld();

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
    const screenshotBytes = await session.primary.screenshot({
      fullPage: true,
    });
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
    geospecWasm: await session.geospecWasm,
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
    type CompilationMessage = {
      readonly message?: string;
      readonly type: string;
    };
    type GpuBuffer = {
      destroy(): void;
      getMappedRange(): ArrayBuffer;
      mapAsync(mode: number): Promise<void>;
      unmap(): void;
    };
    type GpuDevice = {
      readonly lost: Promise<{
        readonly message?: string;
        readonly reason: string;
      }>;
      readonly queue: {
        onSubmittedWorkDone(): Promise<void>;
        submit(commands: readonly unknown[]): void;
      };
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
      createComputePipeline(descriptor: unknown): {
        getBindGroupLayout(index: number): unknown;
      };
      createShaderModule(descriptor: { readonly code: string }): {
        getCompilationInfo(): Promise<{
          readonly messages: readonly CompilationMessage[];
        }>;
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
      const invalid = device.createShaderModule({
        code: '@compute fn broken(',
      });
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
        storage = device.createBuffer({
          size: 4,
          usage: usage.STORAGE + usage.COPY_SRC,
        });
        readback = device.createBuffer({
          size: 4,
          usage: usage.MAP_READ + usage.COPY_DST,
        });
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
      newBrowserCDPSession(): Promise<{
        detach(): Promise<void>;
        send(method: string): Promise<unknown>;
      }>;
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
  await pageFor(sessionFor(commandContext), surface).emulateMedia({
    colorScheme,
  });
};

export const uiEmulateContrast: BrowserCommand<[contrast: 'more' | 'no-preference', surface?: TargetSurface]> = async (
  commandContext,
  contrast,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({ contrast });
};

export const uiEmulateReducedMotion: BrowserCommand<
  [reducedMotion: 'no-preference' | 'reduce', surface?: TargetSurface]
> = async (commandContext, reducedMotion, surface) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({ reducedMotion });
};

export const uiEmulateForcedColors: BrowserCommand<[forcedColors: 'active' | 'none', surface?: TargetSurface]> = async (
  commandContext,
  forcedColors,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({
    forcedColors,
  });
};

export const uiClickTarget: BrowserCommand<
  [selector: string, options?: TargetClickOptions, surface?: TargetSurface]
> = async (commandContext, selector, options, surface) => {
  const { touch = false, ...clickOptions } = options ?? {};
  const locator = pageFor(sessionFor(commandContext), surface).locator(selector);
  await (touch ? locator.tap() : locator.click(clickOptions));
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
    return {
      attributes: {},
      className: '',
      count,
      focused: false,
      text: null,
      visible: false,
    };
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

/**
 * Registers an init script on the whole context rather than one page.
 *
 * `uiAddInitScript` installs on the primary page, so a page opened later — the
 * cold offline start — would evaluate without it.
 */
export const uiAddContextInitScript: BrowserCommand<[source: string, argument?: unknown]> = async (
  commandContext,
  source,
  argument,
) => {
  await sessionFor(commandContext).context.addInitScript({
    content: `(${source})(${JSON.stringify(argument)})`,
  });
};

/** Cuts the context off from the network, so a cached shell is all a navigation can be served from. */
export const uiSetTargetOffline: BrowserCommand<[offline: boolean]> = async (commandContext, offline) => {
  await sessionFor(commandContext).context.setOffline(offline);
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
  [selector?: string | null, artifactName?: string, surface?: TargetSurface],
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

// Installed only in an explicitly opted-in diagnostic worker before application startup.
const installProjectionAcquisitionProbe = (): {
  installed: boolean;
  constructors: { fileHandle: boolean; directoryHandle: boolean; blob: boolean };
} => {
  type Receipt = {
    path: string;
    identity: 'observed-path' | 'unqualified-basename';
    getFileCalls: number;
    /** Milliseconds. */
    getFileDuration: number;
    arrayBufferCalls: number;
    /** Milliseconds. */
    arrayBufferDuration: number;
    bytes: number;
    pending: number;
  };
  const paths = new WeakMap<object, string>();
  const receipts = new Map<string, Receipt>();
  const constructors = {
    fileHandle: typeof FileSystemFileHandle !== 'undefined',
    directoryHandle: typeof FileSystemDirectoryHandle !== 'undefined',
    blob: typeof Blob !== 'undefined',
  };
  if (!constructors.fileHandle || !constructors.directoryHandle || !constructors.blob) {
    return { installed: false, constructors };
  }
  const directory = FileSystemDirectoryHandle.prototype.getDirectoryHandle;
  const handle = FileSystemDirectoryHandle.prototype.getFileHandle;
  const { getFile } = FileSystemFileHandle.prototype;
  const { arrayBuffer } = Blob.prototype;
  FileSystemDirectoryHandle.prototype.getDirectoryHandle = async function (...args) {
    const result = await directory.apply(this, args);
    paths.set(result, `${paths.get(this) ?? this.name}/${args[0]}`);
    return result;
  };
  FileSystemDirectoryHandle.prototype.getFileHandle = async function (...args) {
    const result = await handle.apply(this, args);
    paths.set(result, `${paths.get(this) ?? this.name}/${args[0]}`);
    return result;
  };
  FileSystemFileHandle.prototype.getFile = async function () {
    const observedPath = paths.get(this);
    const path = observedPath ?? this.name;
    if (!path.endsWith('/events.jsonl') && !(observedPath === undefined && path === 'events.jsonl')) {
      return getFile.call(this);
    }
    let receipt = receipts.get(path);
    if (receipt === undefined && receipts.size < 16) {
      receipt = {
        path,
        identity: observedPath === undefined ? 'unqualified-basename' : 'observed-path',
        getFileCalls: 0,
        getFileDuration: 0,
        arrayBufferCalls: 0,
        arrayBufferDuration: 0,
        bytes: 0,
        pending: 0,
      };
      receipts.set(path, receipt);
    }
    const start = performance.now();
    if (receipt !== undefined) {
      receipt.getFileCalls++;
      receipt.pending++;
    }
    try {
      const file = await getFile.call(this);
      paths.set(file, path);
      return file;
    } finally {
      if (receipt !== undefined) {
        receipt.getFileDuration += performance.now() - start;
        receipt.pending--;
      }
    }
  };
  Blob.prototype.arrayBuffer = async function () {
    const path = paths.get(this);
    const receipt = path === undefined ? undefined : receipts.get(path);
    const start = performance.now();
    if (receipt !== undefined) {
      receipt.arrayBufferCalls++;
      receipt.pending++;
    }
    try {
      const bytes = await arrayBuffer.call(this);
      if (receipt !== undefined) {
        receipt.bytes += bytes.byteLength;
      }
      return bytes;
    } finally {
      if (receipt !== undefined) {
        receipt.arrayBufferDuration += performance.now() - start;
        receipt.pending--;
      }
    }
  };
  Object.assign(globalThis, {
    __tauProjectionAcquisition: {
      read: () => ({
        kind: 'native-file-handle-getFile-and-Blob-arrayBuffer',
        receipts: [...receipts.values()].map((entry) => ({ ...entry })),
      }),
      restore: () => {
        FileSystemDirectoryHandle.prototype.getDirectoryHandle = directory;
        FileSystemDirectoryHandle.prototype.getFileHandle = handle;
        FileSystemFileHandle.prototype.getFile = getFile;
        Blob.prototype.arrayBuffer = arrayBuffer;
      },
    },
  });
  return { installed: true, constructors };
};

const startWorkerCpuProfiles = async (
  cdp: CdpSession,
): Promise<{
  stop(path: string): Promise<void>;
  snapshot(path: string): Promise<void>;
}> => {
  type WorkerProfile = {
    readonly sessionId: string;
    readonly targetId: string;
    readonly url: string;
    readonly attachedAt: number;
    startedAt?: number;
    resumedAt?: number;
    acquisitionInstallation?: unknown;
    error?: string;
    ready: Promise<void>;
  };
  const workers: WorkerProfile[] = [];
  const requests = new Map<
    number,
    {
      readonly sessionId: string;
      readonly resolve: (value: unknown) => void;
      readonly reject: (error: Error) => void;
    }
  >();
  const heapChunks = new Map<string, (chunk: string) => void>();
  let nextRequest = 0;
  let stopping = false;
  const command = async (sessionId: string, method: string, params: object = {}): Promise<unknown> => {
    const id = ++nextRequest;
    const response = Promise.withResolvers<unknown>();
    requests.set(id, { sessionId, resolve: response.resolve, reject: response.reject });
    // This bounds only diagnostic protocol replies, never a product or acceptance wait.
    const replyTimer = setTimeout(
      () => {
        response.reject(new Error(`Worker profiler ${method} did not reply.`));
      },
      method === 'HeapProfiler.takeHeapSnapshot' ? 120_000 : 5000,
    );
    try {
      const [, result] = await Promise.all([
        cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }),
        response.promise,
      ]);
      return result;
    } finally {
      clearTimeout(replyTimer);
      requests.delete(id);
    }
  };
  cdp.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    const response = JSON.parse(message) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
      method?: string;
      params?: { chunk?: string };
    };
    if (response.method === 'HeapProfiler.addHeapSnapshotChunk' && response.params?.chunk !== undefined) {
      heapChunks.get(sessionId)?.(response.params.chunk);
      return;
    }
    const request = response.id === undefined ? undefined : requests.get(response.id);
    if (request?.sessionId !== sessionId) {
      return;
    }
    if (response.error) {
      request.reject(new Error(response.error.message));
    } else {
      request.resolve(response.result);
    }
  });
  cdp.on('Target.detachedFromTarget', ({ sessionId }) => {
    for (const request of requests.values()) {
      if (request.sessionId === sessionId) {
        request.reject(new Error('Worker profiler target detached.'));
      }
    }
  });
  cdp.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
    const worker: WorkerProfile = {
      sessionId,
      targetId: targetInfo.targetId,
      url: targetInfo.url,
      attachedAt: Date.now(),
      ready: Promise.resolve(),
    };
    workers.push(worker);
    worker.ready = (async () => {
      try {
        if (!stopping) {
          if (process.env['VITE_TAU_E2E_PROJECTION_MULTICHAT'] === 'true') {
            worker.acquisitionInstallation = await command(sessionId, 'Runtime.evaluate', {
              expression: `(${installProjectionAcquisitionProbe.toString()})()`,
              returnByValue: true,
            });
          }
          await command(sessionId, 'Profiler.enable');
          await command(sessionId, 'Profiler.setSamplingInterval', { interval: 100 });
          await command(sessionId, 'Profiler.start');
          worker.startedAt = Date.now();
        }
      } catch (error) {
        worker.error = String(error);
      } finally {
        try {
          await command(sessionId, 'Runtime.runIfWaitingForDebugger');
          worker.resumedAt = Date.now();
        } catch (error) {
          worker.error = `${worker.error ?? ''} Resume: ${String(error)}`;
        }
      }
    })();
  });
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: false,
    filter: [{ type: 'worker' }, { exclude: true }],
  });
  const stop = async (path: string): Promise<void> => {
    stopping = true;
    const receipts = await Promise.all(
      workers.map(async (worker, index) => {
        await worker.ready;
        let profilePath: string | undefined;
        let acquisition: unknown;
        let acquisitionError: string | undefined;
        if (process.env['VITE_TAU_E2E_PROJECTION_MULTICHAT'] === 'true') {
          try {
            acquisition = await command(worker.sessionId, 'Runtime.evaluate', {
              expression:
                '(() => { const probe = globalThis.__tauProjectionAcquisition; if (!probe) return { available: false }; try { return { available: true, ...probe.read() }; } finally { probe.restore(); } })()',
              returnByValue: true,
            });
          } catch (error) {
            acquisitionError = String(error);
          }
        }
        try {
          if (worker.startedAt !== undefined) {
            const result = await command(worker.sessionId, 'Profiler.stop');
            if (typeof result !== 'object' || result === null || !('profile' in result)) {
              throw new Error('Worker profiler returned no profile.');
            }
            profilePath = `${path}.worker-${String(index)}.cpuprofile`;
            await writeFile(profilePath, JSON.stringify(result.profile));
          }
        } catch (error) {
          worker.error = `${worker.error ?? ''} Stop: ${String(error)}`;
        }
        return { ...worker, ready: undefined, profilePath, acquisition, acquisitionError, stoppedAt: Date.now() };
      }),
    );
    await cdp.send('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: false });
    await writeFile(
      `${path}.workers.json`,
      JSON.stringify(
        {
          diagnosticOnly: true,
          workerStartupPausedForProfiler: true,
          scope:
            'Direct dedicated workers; nested workers are not covered. Attachment-to-resume delay is reported per target.',
          available: receipts.some((receipt) => receipt.profilePath !== undefined),
          workers: receipts,
        },
        null,
        2,
      ),
    );
  };
  return {
    stop,
    snapshot: async (path) => {
      const receipts = [];
      for (const [index, worker] of workers.entries()) {
        await worker.ready;
        const heapPath = `${path}.worker-${String(index)}.heapsnapshot`;
        const file = await open(heapPath, 'w');
        let writing = Promise.resolve();
        let snapshotError: string | undefined;
        let acquisition: unknown;
        let usage: unknown;
        heapChunks.set(worker.sessionId, (chunk) => {
          const previous = writing;
          const writeChunk = async (): Promise<void> => {
            await previous;
            await file.write(chunk);
          };
          writing = writeChunk();
        });
        try {
          acquisition = await command(worker.sessionId, 'Runtime.evaluate', {
            expression: 'globalThis.__tauProjectionAcquisition?.read()',
            returnByValue: true,
          });
          usage = await command(worker.sessionId, 'Runtime.getHeapUsage');
          await command(worker.sessionId, 'HeapProfiler.enable');
          await command(worker.sessionId, 'HeapProfiler.takeHeapSnapshot', { reportProgress: false });
        } catch (error) {
          snapshotError = String(error);
        } finally {
          heapChunks.delete(worker.sessionId);
          try {
            await writing;
          } finally {
            await file.close();
          }
        }
        receipts.push({
          targetId: worker.targetId,
          url: worker.url,
          heapPath,
          acquisition,
          usage,
          error: snapshotError,
        });
      }
      await writeFile(
        `${path}.workers.json`,
        JSON.stringify(
          {
            diagnosticOnly: true,
            at: Date.now(),
            workers: receipts,
            scope:
              'Direct workers only; snapshots are intrusive retained-heap observations, not peak memory or clean latency.',
          },
          null,
          2,
        ),
      );
    },
  };
};

/**
 * Records a CPU profile of one target page through the DevTools protocol.
 *
 * `start` begins sampling at 100 µs; `stop` ends it and writes the profile as `artifactName`
 * (a `.cpuprofile` that DevTools and speedscope open) beside the other test output. The page's
 * own `performance` entries cannot say which function held the main thread; this can.
 *
 * @param commandContext - The Vitest browser command context.
 * @param action - Whether to begin or end the recording.
 * @param artifactName - File name for the profile; required by `stop`.
 * @param surface - Which target page to profile.
 * @returns The profile's absolute path after `stop`; nothing after `start`.
 */
export const uiCpuProfile: BrowserCommand<
  [action: 'start' | 'stop' | 'snapshot', artifactName?: string, surface?: TargetSurface],
  string | undefined
> = async (commandContext, action, artifactName, surface = 'primary') => {
  const session = sessionFor(commandContext);
  if (action === 'start') {
    if (session.cpuProfiles.has(surface)) {
      throw new Error(`A CPU profile of the ${surface} page is already recording.`);
    }
    const cdp = await session.context.newCDPSession(pageFor(session, surface));
    try {
      await cdp.send('Performance.enable');
      const { metrics } = await cdp.send('Performance.getMetrics');
      const navigationStartSeconds = metrics.find((metric) => metric.name === 'NavigationStart')?.value;
      if (navigationStartSeconds === undefined) {
        throw new Error('CPU profiling needs the page navigation clock to align gesture marks.');
      }
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      await cdp.send('Profiler.start');
      const workerProfiles =
        process.env['VITE_TAU_E2E_PROJECTION_DIAGNOSTICS'] === 'true' ? await startWorkerCpuProfiles(cdp) : undefined;
      session.cpuProfiles.set(surface, {
        cdp,
        navigationStartSeconds,
        ...(workerProfiles ? { stopWorkers: workerProfiles.stop, snapshotWorkers: workerProfiles.snapshot } : {}),
      });
    } catch (error) {
      await cdp.detach();
      throw error;
    }
    return undefined;
  }
  const recording = session.cpuProfiles.get(surface);
  if (!recording || !artifactName) {
    throw new Error(`Stopping a CPU profile needs a recording of the ${surface} page and an artifact name.`);
  }
  if (action === 'snapshot') {
    if (process.env['VITE_TAU_E2E_PROJECTION_MULTICHAT'] !== 'true') {
      throw new Error('Heap snapshots require the explicit multi-chat diagnostic flag.');
    }
    const path = resolve(outputRoot, commandContext.sessionId, artifactName.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-'));
    await mkdir(resolve(path, '..'), { recursive: true });
    const file = await open(`${path}.renderer.heapsnapshot`, 'w');
    let writing = Promise.resolve();
    const chunk = (event: { chunk: string }): void => {
      const previous = writing;
      const writeChunk = async (): Promise<void> => {
        await previous;
        await file.write(event.chunk);
      };
      writing = writeChunk();
    };
    recording.cdp.on('HeapProfiler.addHeapSnapshotChunk', chunk);
    try {
      await recording.cdp.send('HeapProfiler.enable');
      await recording.cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    } finally {
      recording.cdp.off('HeapProfiler.addHeapSnapshotChunk', chunk);
      try {
        await writing;
      } finally {
        await file.close();
      }
    }
    await recording.snapshotWorkers?.(path);
    return path;
  }
  session.cpuProfiles.delete(surface);
  const { cdp, navigationStartSeconds, stopWorkers } = recording;
  const path = resolve(outputRoot, commandContext.sessionId, artifactName.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-'));
  await mkdir(resolve(path, '..'), { recursive: true });
  try {
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(path, JSON.stringify(profile));
    const marks = await pageFor(session, surface).evaluate(() =>
      performance
        .getEntriesByType('mark')
        .filter((entry) => entry.name.startsWith('projection:'))
        .map((entry) => ({ name: entry.name, startTime: entry.startTime })),
    );
    await writeFile(`${path}.clock.json`, JSON.stringify({ navigationStartSeconds, marks }));
    await stopWorkers?.(path);
  } finally {
    await cdp.detach();
  }
  return path;
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

/**
 * The dedicated workers exposed for the target page by Playwright (V21, S48(16)).
 *
 * Uses the provider's page-scoped observation without product instrumentation.
 * The selected WebKit provider does not recursively enumerate workers created
 * inside workers. An empty listing therefore cannot establish their absence or
 * qualify nested-worker cardinality.
 *
 * @param commandContext - The Vitest browser command context.
 * @param urlSubstring - Keep only workers whose script URL contains this.
 * @param surface - Which target page to count.
 * @returns Matching instances with stable identities and their script URLs.
 */
export const uiTargetWorkers: BrowserCommand<
  [urlSubstring?: string, surface?: TargetSurface],
  readonly TargetWorker[]
> = async (commandContext, urlSubstring, surface) => {
  const session = sessionFor(commandContext);
  const page = pageFor(session, surface);
  return page
    .workers()
    .map((worker) => {
      let identity = session.workerIds.get(worker);
      if (identity === undefined) {
        session.nextWorkerId += 1;
        identity = `worker-${String(session.nextWorkerId)}`;
        session.workerIds.set(worker, identity);
      }
      return { identity, url: worker.url() };
    })
    .filter(({ url }) => urlSubstring === undefined || url.includes(urlSubstring))
    .toSorted((left, right) => left.identity.localeCompare(right.identity));
};

/** Install/read a fixture-only probe on new catch-up ports in resident page-visible agent-host workers. */
export const uiWorkerCatchUpFlow: BrowserCommand<
  [install: boolean, surface?: TargetSurface],
  readonly TargetWorkerFlowEvidence[]
> = async (commandContext, install, surface) => {
  const page = pageFor(sessionFor(commandContext), surface);
  const workers = page.workers().filter((worker) => worker.url().includes('agent-host.worker'));
  if (workers.length === 0) {
    return [{ url: '', available: false, streams: [] }];
  }
  return Promise.all(
    workers.map(async (worker) => ({
      url: worker.url(),
      available: true,
      streams: await worker.evaluate((shouldInstall) => {
        type Stream = TargetWorkerFlowEvidence['streams'][number];
        type Probe = { streams: Map<string, Stream> };
        type Frame = {
          k?: string;
          i?: string;
          n?: string;
          s?: number;
          a?: { chatId?: string };
          d?: { answer?: { nextCursor?: number }; position?: { cursor?: number } };
        };
        const scope = globalThis as typeof globalThis & { __tauFixtureWorkerCatchUp?: Probe };
        if (shouldInstall && scope.__tauFixtureWorkerCatchUp === undefined) {
          const probe: Probe = { streams: new Map() };
          scope.__tauFixtureWorkerCatchUp = probe;
          const calls = new WeakMap<MessagePort, Map<string, Stream>>();
          const wrappers = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
          const seen = new WeakSet<Event>();
          const post = MessagePort.prototype.postMessage;
          const add = MessagePort.prototype.addEventListener;
          const remove = MessagePort.prototype.removeEventListener;
          let portSequence = 0;
          MessagePort.prototype.addEventListener = function (
            this: MessagePort,
            ...[type, listener, options]: Parameters<EventTarget['addEventListener']>
          ): void {
            if (listener === null) {
              return;
            }
            if (type !== 'message') {
              add.call(this, type, listener, options);
              return;
            }
            const wrapped: EventListener = (event) => {
              const frame = (event as MessageEvent<Frame>).data;
              if (!seen.has(event)) {
                seen.add(event);
                if (frame.k === 'ss' && frame.n === 'catchUp' && frame.i && frame.a?.chatId) {
                  let requests = calls.get(this);
                  if (requests === undefined) {
                    requests = new Map();
                    calls.set(this, requests);
                    portSequence += 1;
                  }
                  const stream: Stream = {
                    id: frame.i,
                    chatId: frame.a.chatId,
                    fa: 0,
                    fw: 0,
                    su: 0,
                    lb: 0,
                    credits: 0,
                    sn: 0,
                    sc: 0,
                    se: 0,
                    lastIncomingAt: Date.now(),
                  };
                  if (probe.streams.size === 16) {
                    const oldest = probe.streams.keys().next().value;
                    if (oldest !== undefined) {
                      probe.streams.delete(oldest);
                    }
                  }
                  if (requests.size === 16) {
                    const oldest = requests.keys().next().value;
                    if (oldest !== undefined) {
                      requests.delete(oldest);
                    }
                  }
                  requests.set(frame.i, stream);
                  probe.streams.set(`${portSequence}:${frame.i}`, stream);
                } else if (frame.i && (frame.k === 'fa' || frame.k === 'fw' || frame.k === 'su' || frame.k === 'lb')) {
                  const stream = calls.get(this)?.get(frame.i);
                  if (stream !== undefined) {
                    stream[frame.k] += 1;
                    stream.lastIncomingAt = Date.now();
                    if (frame.k === 'fw' && typeof frame.s === 'number') {
                      stream.credits += frame.s;
                    }
                  }
                }
              }
              if (typeof listener === 'function') {
                listener.call(this, event);
              } else {
                listener.handleEvent(event);
              }
            };
            wrappers.set(listener, wrapped);
            add.call(this, type, wrapped, options);
          };
          MessagePort.prototype.removeEventListener = function (
            this: MessagePort,
            ...[type, listener, options]: Parameters<EventTarget['removeEventListener']>
          ): void {
            if (listener === null) {
              return;
            }
            remove.call(this, type, wrappers.get(listener) ?? listener, options);
          };
          MessagePort.prototype.postMessage = function (
            message: unknown,
            options?: Transferable[] | StructuredSerializeOptions,
          ): void {
            const frame = message as Frame | undefined;
            if (frame?.i && (frame.k === 'sn' || frame.k === 'sc' || frame.k === 'se')) {
              const stream = calls.get(this)?.get(frame.i);
              if (stream !== undefined) {
                stream[frame.k] += 1;
                stream.lastOutgoingAt = Date.now();
                const cursor = frame.d?.answer?.nextCursor ?? frame.d?.position?.cursor;
                if (typeof cursor === 'number') {
                  stream.lastCursor = cursor;
                }
              }
            }
            post.call(this, message, Array.isArray(options) ? { transfer: options } : options);
          };
        }
        return [...(scope.__tauFixtureWorkerCatchUp?.streams.values() ?? [])].map((stream) => ({ ...stream }));
      }, install),
    })),
  );
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
  await sessionFor(commandContext).context.grantPermissions([...permissions], {
    origin: testBaseURL,
  });
};

export const uiChooseTargetFile: BrowserCommand<
  [
    triggerSelector: string,
    file: {
      readonly base64: string;
      readonly mimeType: string;
      readonly name: string;
    },
  ]
> = async (commandContext, triggerSelector, file) => {
  const page = sessionFor(commandContext).primary;
  const chooser = page.waitForEvent('filechooser');
  await page.locator(triggerSelector).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({
    buffer: Buffer.from(file.base64, 'base64'),
    mimeType: file.mimeType,
    name: file.name,
  });
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

/** Write bounded binary artifact chunks; final SHA proves exact UTF8 bytes survived transport. */
export const uiWriteArtifactChunk: BrowserCommand<
  [name: string, base64: string, offset: number, finalSha256?: string],
  void
> = async (_context, name, base64, offset, finalSha256) => {
  const destination = resolve(outputRoot, name);
  if (!destination.startsWith(`${outputRoot}/`) || !Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Invalid fixture artifact destination/offset.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 65_536) {
    throw new Error('Fixture artifact chunk exceeds bound.');
  }
  await mkdir(outputRoot, { recursive: true });
  const file = await open(destination, offset === 0 ? 'w' : 'r+');
  try {
    const stat = await file.stat();
    if (stat.size !== offset) {
      throw new Error('Fixture artifact chunks arrived out of order.');
    }
    let written = 0;
    while (written < bytes.length) {
      const result = await file.write(bytes, written, bytes.length - written, offset + written);
      if (result.bytesWritten === 0) {
        throw new Error('Fixture artifact write made no progress.');
      }
      written += result.bytesWritten;
    }
  } finally {
    await file.close();
  }
  if (
    finalSha256 !== undefined &&
    createHash('sha256')
      .update(await readFile(destination))
      .digest('hex') !== finalSha256
  ) {
    throw new Error('Fixture artifact final byte proof failed.');
  }
};

/** Validate the immutable benchmark in Node and return only exact small manifest proof. */
export const uiValidateProjectionFixture: BrowserCommand<[path: string], ProjectionFixtureProof> = async (
  _context,
  path,
) => {
  const bytes = await readFile(isAbsolute(path) ? path : resolve(outputRoot, path));
  if (!(bytes.buffer instanceof ArrayBuffer)) {
    throw new Error('Node fixture bytes must have an owned ArrayBuffer.');
  }
  return validateProjectionFixtureBytes(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
};

/** Read immutable fixture input in bounded binary chunks, without WebSocket-sized whole-file replies. */
export const uiReadFixtureChunk: BrowserCommand<
  [path: string, offset: number],
  { readonly base64: string; readonly eof: boolean }
> = async (_context, path, offset) => {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Invalid fixture read offset.');
  }
  const file = await open(isAbsolute(path) ? path : resolve(outputRoot, path), 'r');
  try {
    const bytes = Buffer.alloc(65_536);
    const result = await file.read(bytes, 0, bytes.length, offset);
    const stat = await file.stat();
    return {
      base64: bytes.subarray(0, result.bytesRead).toString('base64'),
      eof: offset + result.bytesRead >= stat.size,
    };
  } finally {
    await file.close();
  }
};

/** Observe actual operator-triggered downloads without invoking product gestures. */
export const uiStartObservedDownloads: BrowserCommand<[], void> = async (commandContext) => {
  const page = sessionFor(commandContext).primary;
  if (observedDownloads.has(page)) {
    return;
  }
  const pending: Array<Promise<{ readonly base64: string; readonly suggestedFilename: string } | Error>> = [];
  observedDownloads.set(page, pending);
  page.on('download', (download) => {
    pending.push(
      (async () => {
        try {
          const path = await download.path();
          if (!path) {
            throw new Error('Observed operator download has no readable physical artifact.');
          }
          const bytes = await readFile(path);
          return { base64: bytes.toString('base64'), suggestedFilename: download.suggestedFilename() };
        } catch (error) {
          return error instanceof Error ? error : new Error(String(error));
        }
      })(),
    );
  });
};

/** Drain completed actual download bytes; errors remain evidence rather than fabricated output. */
export const uiReadObservedDownloads: BrowserCommand<
  [],
  ReadonlyArray<{ readonly base64: string; readonly suggestedFilename: string }>
> = async (commandContext) => {
  const pending = observedDownloads.get(sessionFor(commandContext).primary);
  const results = await Promise.all(pending?.splice(0) ?? []);
  return results.map((result) => {
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
};

export const uiReadTargetEvents: BrowserCommand<
  [],
  {
    readonly consoleMessages: ReadonlyArray<{
      readonly text: string;
      readonly type: string;
    }>;
    readonly pageErrors: readonly string[];
    readonly geospecWasm?: TargetDiagnostics['geospecWasm'];
    readonly geospecFault?: TargetDiagnostics['geospecFault'];
  }
> = async (commandContext) => {
  const session = sessionFor(commandContext);
  return {
    consoleMessages: session.consoleMessages,
    pageErrors: session.pageErrors,
    geospecWasm: await session.geospecWasm,
    geospecFault: session.geospecFault,
  };
};

export const uiBrowserCommands = {
  uiAddContextInitScript,
  uiAddCookies,
  uiAddInitScript,
  uiAuthenticateTauTestUser,
  uiCaptureTargetDiagnostics,
  uiChooseTargetFile,
  uiClickTarget,
  uiCloseSecondaryTarget,
  uiCloseTarget,
  uiCookies,
  uiCpuProfile,
  uiDragTarget,
  uiDownloadTarget,
  uiWriteArtifactChunk,
  uiReadFixtureChunk,
  uiValidateProjectionFixture,
  uiStartObservedDownloads,
  uiReadObservedDownloads,
  uiEmulateColorScheme,
  uiEmulateContrast,
  uiEmulateForcedColors,
  uiEmulateReducedMotion,
  uiEvaluateTarget,
  uiEvaluateTargetLocator,
  uiFillTarget,
  uiFocusTarget,
  uiGrantPermissions,
  uiHoverTarget,
  uiHoldNextAgentHostGatewayRequest,
  uiInstallAgentHostGatewayFixture,
  uiInstallPostHogFixture,
  uiReadAgentHostApiRequests,
  uiReadPostHogSummary,
  uiReadAgentHostGatewayState,
  uiReleaseAgentHostGatewayRequest,
  uiWaitForAgentHostGatewayGate,
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
  uiReadTauVertexOperations,
  uiReleaseAgentHostGatewayFixture,
  uiReadTargetEvents,
  uiReloadTarget,
  uiScreenshotTarget,
  uiSampleCameraDuringClick,
  uiScrollTarget,
  uiSetTargetOffline,
  uiSetViewport,
  uiStartHostFixture,
  uiStartTauServeFixture,
  uiTargetWorkers,
  uiWorkerCatchUpFlow,
  uiStopTauServeFixture,
  uiReleaseTauServeGateway,
  uiIsTauServeGatewayHeld,
  uiReadTauServeFile,
  uiListTauServeChats,
  uiTypeTarget,
  uiWaitForTarget,
};
