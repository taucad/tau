/* oxlint-disable max-params, no-await-in-loop, no-eval, no-restricted-imports, tau-lint/no-bare-time-identifier, typescript/consistent-type-definitions, typescript/no-restricted-types -- Vitest command callbacks add their context parameter to the explicit external-target contract, and config-time modules cannot use test aliases. `no-eval` is the external-target contract itself: `evaluateTarget`, `evaluateTargetLocator` and `waitForTarget` take a function SOURCE across the browser↔node command boundary — nothing else survives that serialization — and the page reconstitutes it. The sources are spec literals, never page-derived input. */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { release } from 'node:os';
import { resolve } from 'node:path';
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
  TargetScalePresentationProbe,
  TargetScaleProbeOptions,
  TargetState,
  TargetSurface,
  TargetTauBillingOperation,
  TargetTauTestAccount,
  TargetViewport,
  TargetViewportLossBinding,
  TargetWebGpuViewportLoss,
  TargetWebGpuProfile,
  TargetWebGpuQualificationReport,
  TargetWorker,
} from './external-target.ts';
import { queryObservedMotionNativeOracle, isMotionPosedExportQualified } from './parts-assemblies-motion.ts';
import type {
  AssemblyTestBridgeApi,
  MotionNativeOracleInput,
  MotionNativeOracleResult,
} from './parts-assemblies-motion.ts';
import type { HostEngine, HostSubjectLifecycle } from '@taucad/geospec-engine-native/node';
import { writeBrowserTraceStream } from './browser-trace-stream.ts';
import { testBaseURL } from './base-url.ts';
import { classifyWebGpuAdapter, webGpuLaunchArguments } from './webgpu-profile.ts';
import { listTauServeChats, readTauServeFile, startTauServeFixture } from './tau-serve-fixture.ts';
import type { TauServeFixture, TauServeFixtureOptions } from './tau-serve-fixture.ts';
import { browserHostScript, createGatewayScriptWalk } from './agent-host-gateway-script.ts';
import type { GatewayScriptTurn, GatewayScriptWalk, GatewayTurnCount } from './agent-host-gateway-script.ts';

type ProviderContext = BrowserCommandContext['context'];
type TargetPage = Awaited<ReturnType<ProviderContext['newPage']>>;
type CdpSession = Awaited<ReturnType<ProviderContext['newCDPSession']>>;
type TargetWorkerInstance = ReturnType<TargetPage['workers']>[number];
type TargetResponse = Awaited<ReturnType<TargetPage['waitForResponse']>>;
type TargetRequest = ReturnType<TargetResponse['request']>;

type WarehousePreparationCapture = {
  readonly profile: CdpSession;
  readonly workers: Set<TargetWorkerInstance>;
  readonly scripts: Map<string, { readonly request: TargetRequest; hash?: Promise<string | undefined> } | undefined>;
  readonly onRequest: (request: TargetRequest) => void;
  readonly onWorker: (worker: TargetWorkerInstance) => void;
  readonly onResponse: (response: TargetResponse) => void;
};

const isRuntimeDebugScript = (url: string): boolean => {
  try {
    return /\/assets\/runtime-debug\.worker-[A-Za-z0-9_-]{8}\.js$/u.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

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
  readonly cpuProfiles: Map<TargetSurface, CdpSession>;
  /** Only the selected warehouse startup recording admits failure-only debugger observation. */
  warehouseStartupProfile?: CdpSession | undefined;
  /** One preparation lifetime; completed worker measures are captured only on its original failure. */
  warehousePreparationCapture?: WarehousePreparationCapture | undefined;
  readonly pageErrors: string[];
  readonly posthogEvents: Array<{ readonly event: string; readonly decoded: string }>;
  readonly posthogRequests: string[];
  readonly primary: TargetPage;
  readonly workerIds: WeakMap<object, string>;
  nextWorkerId: number;
  readonly agentHostGatewayGates: ParkedGate[];
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
  session.warehouseStartupProfile = undefined;
  const preparation = session.warehousePreparationCapture;
  session.warehousePreparationCapture = undefined;
  if (preparation !== undefined) {
    session.primary.off('worker', preparation.onWorker);
    session.primary.off('request', preparation.onRequest);
    session.primary.off('response', preparation.onResponse);
  }
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
  await context.tracing.start({ screenshots: true, snapshots: true });
  session.tracing = true;
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

/** Read one actual producer's completed measures; neither an open await nor a closed publication graph is inferred. */
const captureWarehousePreparation = async (session: Session, directory: string): Promise<void> => {
  const capture = session.warehousePreparationCapture;
  if (capture === undefined) {
    return;
  }
  // Retire before awaiting: duplicate failure capture and normal stop cannot reuse this lifetime.
  session.warehousePreparationCapture = undefined;
  session.primary.off('worker', capture.onWorker);
  session.primary.off('request', capture.onRequest);
  session.primary.off('response', capture.onResponse);
  let stage = 'owner';
  let workerCounts: { captured: number; live: number } | undefined;
  let rejectionClass: 'missing-live-worker' | 'ambiguous-live-workers' | undefined;
  let targetIdentity:
    | {
        readonly pageTargetId: string;
        readonly pageContextId?: string;
        readonly mainFrameId: string;
        readonly candidates: ReadonlyArray<{
          readonly targetId: string;
          readonly parentFrameId?: string;
          readonly browserContextId?: string;
          readonly openerId?: string;
        }>;
      }
    | undefined;
  try {
    const pageUrl = session.primary.url();
    const url = new URL(pageUrl);
    if (
      url.origin !== new URL(testBaseURL).origin ||
      url.pathname !== '/__e2e/project-file-tree' ||
      url.searchParams.get('main') !== 'scale-100k' ||
      url.searchParams.get('prepare') !== '1' ||
      session.cpuProfiles.get('primary') !== capture.profile
    ) {
      throw new Error('The actual warehouse preparation page/profile owner is unavailable.');
    }
    const currentWorkers = session.primary.workers();
    const liveWorkers = [...capture.workers].filter((candidate) => currentWorkers.includes(candidate));
    workerCounts = { captured: capture.workers.size, live: liveWorkers.length };
    const [worker, ...otherWorkers] = liveWorkers;
    if (worker === undefined || otherWorkers.length > 0) {
      rejectionClass = worker === undefined ? 'missing-live-worker' : 'ambiguous-live-workers';
      throw new Error('A unique live warehouse runtime-debug worker is unavailable.');
    }
    const scriptUrl = worker.url();
    if (new URL(scriptUrl).origin !== url.origin) {
      throw new Error('The preparation worker belongs to a foreign origin.');
    }
    stage = 'delivered-script';
    const scriptRequest = capture.scripts.get(scriptUrl);
    if (scriptRequest === undefined || scriptRequest.request.frame() !== session.primary.mainFrame()) {
      throw new Error('The selected producer script request is missing or ambiguous.');
    }
    const scriptSha256 = await scriptRequest.hash;
    if (scriptSha256 === undefined) {
      throw new Error('The actual delivered preparation worker script bytes are unavailable.');
    }
    stage = 'native-target';
    const { targetInfo: pageTarget } = await capture.profile.send('Target.getTargetInfo');
    const { frameTree } = await capture.profile.send('Page.getFrameTree');
    const { targetInfos } = await capture.profile.send('Target.getTargets');
    targetIdentity = {
      pageTargetId: pageTarget.targetId,
      pageContextId: pageTarget.browserContextId,
      mainFrameId: frameTree.frame.id,
      candidates: targetInfos
        .filter((candidate) => candidate.type === 'worker' && candidate.url === scriptUrl)
        .map(({ targetId, parentFrameId, browserContextId, openerId }) => ({
          targetId,
          parentFrameId,
          browserContextId,
          openerId,
        })),
    };
    const [target, ...otherTargets] = targetInfos.filter(
      (candidate) =>
        candidate.type === 'worker' &&
        candidate.url === scriptUrl &&
        candidate.parentFrameId === frameTree.frame.id &&
        candidate.browserContextId !== undefined &&
        candidate.browserContextId === pageTarget.browserContextId,
    );
    if (target === undefined || otherTargets.length > 0) {
      throw new Error('The actual page-related producer CDP target is missing or ambiguous.');
    }
    stage = 'completed-measure-snapshot';
    const snapshot = await worker.evaluate(() => {
      const allowed = new Set([
        'spanId',
        'parentSpanId',
        'entryPath',
        'file',
        'path',
        'kernelId',
        'phase',
        'status',
        'cache',
        'result',
        'hash',
        'digest',
        'generation',
        'dependencyHash',
        'sourceHash',
        'outputHash',
        'contentHash',
        'operationId',
        'documentOperationId',
        'documentId',
        'evaluationId',
        'requestId',
        'subscriptionId',
        'viewId',
        'format',
        'retainedPresentCount',
        'retainedMissingCount',
        'observedBodyBytes',
        'bodyByteCoverageComplete',
      ]);
      const measures = performance.getEntriesByType('measure').filter((entry) => /^tau:.*:\d+:\d+$/u.test(entry.name));
      return {
        workerName: self.name,
        scriptUrl: self.location.href,
        workerTimeOrigin: performance.timeOrigin,
        completedMeasureCount: measures.length,
        truncated: measures.length > 2000,
        measures: measures.slice(-2000).map((entry) => {
          const detail: unknown = entry instanceof PerformanceMeasure ? entry.detail : undefined;
          const attributes: Array<[string, unknown]> =
            typeof detail === 'object' && detail !== null ? Object.entries(detail) : [];
          const retained = attributes.filter(
            ([key, value]) =>
              allowed.has(key) &&
              (key !== 'bodyByteCoverageComplete' || typeof value === 'boolean') &&
              (!['retainedPresentCount', 'retainedMissingCount', 'observedBodyBytes'].includes(key) ||
                (typeof value === 'number' && Number.isFinite(value))) &&
              ((typeof value === 'string' && value.length <= 512 && !value.includes('://') && !value.startsWith('/')) ||
                typeof value === 'boolean' ||
                (typeof value === 'number' && Number.isFinite(value))),
          );
          return {
            name: entry.name.slice(0, 256),
            nameTruncated: entry.name.length > 256,
            startTime: entry.startTime,
            duration: entry.duration,
            detail: Object.fromEntries(retained),
            omittedAttributeCount: attributes.length - retained.length,
          };
        }),
      };
    });
    stage = 'current-owner';
    const { targetInfo: currentTarget } = await capture.profile.send('Target.getTargetInfo', {
      targetId: target.targetId,
    });
    if (
      snapshot.workerName !== 'tau-ui-runtime-debug-worker' ||
      snapshot.scriptUrl !== scriptUrl ||
      !Number.isFinite(snapshot.workerTimeOrigin) ||
      session.primary.url() !== pageUrl ||
      !session.primary.workers().includes(worker) ||
      currentTarget.url !== target.url ||
      capture.scripts.get(scriptUrl) !== scriptRequest ||
      currentTarget.parentFrameId !== target.parentFrameId ||
      currentTarget.browserContextId !== target.browserContextId
    ) {
      throw new Error('The captured preparation producer was replaced or retired.');
    }
    const { scriptUrl: _scriptUrl, ...safeSnapshot } = snapshot;
    await writeFile(
      resolve(directory, 'warehouse-preparation-worker-measures.json'),
      JSON.stringify({
        status: 'OBSERVED',
        pageTargetId: pageTarget.targetId,
        workerTargetId: target.targetId,
        parentFrameId: target.parentFrameId,
        browserContextId: target.browserContextId,
        scriptUrlSha256: createHash('sha256').update(scriptUrl).digest('hex'),
        scriptSha256,
        ...safeSnapshot,
        workerCounts,
        rejectionClass,
        qualification:
          'One actual producer completed-measure snapshot; origin.instance, batch epoch, open await, worker CPU/stack and completed publication root remain unobserved. Page profile is not worker CPU. Truncated/omitted records cannot establish a closed graph or full corpus.',
      }),
    );
  } catch (error) {
    try {
      await writeFile(
        resolve(directory, 'warehouse-preparation-worker-measures.json'),
        JSON.stringify({
          status: 'UNAVAILABLE',
          stage,
          targetIdentity,
          workerCounts,
          rejectionClass,
          // Rejection text can contain a private source URL; retain its identity without dumping it.
          reasonSha256: createHash('sha256').update(String(error)).digest('hex'),
          qualification:
            'No producer association, missing spans or current open await are inferred from an unavailable snapshot.',
        }),
      );
    } catch {
      session.pageErrors.push(
        'Warehouse producer snapshot artifact was unavailable; original failure and profile cleanup remain authoritative.',
      );
    }
  }
};

export const uiCaptureTargetDiagnostics: BrowserCommand<[], TargetDiagnostics> = async (commandContext) => {
  const session = sessionFor(commandContext);
  const directory = resolve(outputRoot, commandContext.sessionId);
  await mkdir(directory, { recursive: true });
  await captureWarehousePreparation(session, directory);
  const warehouseProfile = session.cpuProfiles.get('primary');
  if (warehouseProfile !== undefined && warehouseProfile === session.warehouseStartupProfile) {
    type PausedStack = {
      readonly reason: string;
      readonly framesTruncated: boolean;
      readonly frames: ReadonlyArray<{
        readonly functionName: string;
        readonly scriptId: string;
        readonly lineNumber: number;
        readonly columnNumber?: number;
        readonly urlSha256: string;
      }>;
    };
    const paused = Promise.withResolvers<PausedStack>();
    // Handle close rejection immediately, including while a protocol command is still awaiting its reply.
    const outcome = (async (): Promise<
      { status: 'fulfilled'; value: PausedStack } | { status: 'rejected'; error: unknown }
    > => {
      try {
        return { status: 'fulfilled', value: await paused.promise };
      } catch (error) {
        return { status: 'rejected', error };
      }
    })();
    const onPaused = (event: {
      readonly reason: string;
      readonly callFrames: ReadonlyArray<{
        readonly functionName: string;
        readonly location: { readonly scriptId: string; readonly lineNumber: number; readonly columnNumber?: number };
        readonly url: string;
      }>;
    }): void => {
      paused.resolve({
        reason: event.reason,
        framesTruncated: event.callFrames.length > 64,
        frames: event.callFrames.slice(0, 64).map((frame) => ({
          functionName: frame.functionName.slice(0, 256),
          scriptId: frame.location.scriptId,
          lineNumber: frame.location.lineNumber,
          ...(frame.location.columnNumber === undefined ? {} : { columnNumber: frame.location.columnNumber }),
          urlSha256: createHash('sha256').update(frame.url).digest('hex'),
        })),
      });
    };
    const onClose = (): void => {
      paused.reject(new Error('Warehouse CPU profile session closed before paused observation.'));
    };
    warehouseProfile.once('Debugger.paused', onPaused);
    warehouseProfile.once('close', onClose);
    try {
      await warehouseProfile.send('Debugger.enable');
      await warehouseProfile.send('Debugger.pause');
      const captured = await outcome;
      if (captured.status === 'rejected') {
        throw captured.error;
      }
      await writeFile(
        resolve(directory, 'warehouse-paused-stack.json'),
        JSON.stringify({
          status: 'OBSERVED',
          qualification: 'Failure-only primary page paused point; not CPU duration or worker/native hot-owner proof.',
          ...captured.value,
        }),
      );
    } catch (error) {
      paused.reject(error);
      await writeFile(
        resolve(directory, 'warehouse-paused-stack-unavailable.json'),
        JSON.stringify({ status: 'UNAVAILABLE', message: error instanceof Error ? error.message : String(error) }),
      );
    } finally {
      try {
        await warehouseProfile.send('Debugger.resume');
      } catch (error) {
        session.pageErrors.push(
          `Warehouse debugger resume failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      try {
        await warehouseProfile.send('Debugger.disable');
      } catch (error) {
        session.pageErrors.push(
          `Warehouse debugger disable failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        warehouseProfile.off('Debugger.paused', onPaused);
        warehouseProfile.off('close', onClose);
      }
    }
  }
  // Drain the Node-owned CDP recording before renderer probes that can block on startup work.
  if (session.cpuProfiles.has('primary')) {
    try {
      await uiCpuProfile(commandContext, 'stop', 'startup-failure-primary.cpuprofile', 'primary');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.pageErrors.push(`CPU profile capture failed: ${message}`);
      await writeFile(
        resolve(directory, 'cpu-profile-unavailable.json'),
        JSON.stringify({ status: 'UNAVAILABLE', surface: 'primary', message }, undefined, 2),
      );
    }
  }
  let screenshot: string | undefined;
  try {
    const screenshotBytes = await session.primary.screenshot({
      fullPage: true,
    });
    await writeFile(resolve(directory, 'screenshot.png'), screenshotBytes);
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
  let geometryReadiness:
    | { readonly isGeometryFramed: boolean; readonly componentCount: number; readonly frame: number }
    | null
    | undefined;
  try {
    geometryReadiness = await session.primary.evaluate(() => {
      const bridge = (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST__?: {
            isGeometryFramed(): boolean;
            getModelComponents(): readonly unknown[];
            getRendererIdentity(): { frame: number };
          };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      return bridge
        ? {
            isGeometryFramed: bridge.isGeometryFramed(),
            componentCount: bridge.getModelComponents().length,
            frame: bridge.getRendererIdentity().frame,
          }
        : null;
    });
  } catch (error) {
    session.pageErrors.push(
      `Geometry readiness capture failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let committedAssembly:
    | {
        readonly diagnostics: ReturnType<AssemblyTestBridgeApi['getCommittedAssembly']>['diagnostics'];
        readonly root:
          | NonNullable<ReturnType<AssemblyTestBridgeApi['getCommittedAssembly']>['assemblyDisplay']>['root']
          | undefined;
        readonly isCurrent: boolean;
      }
    | null
    | undefined;
  try {
    committedAssembly = await session.primary.evaluate(() => {
      const browser: typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi } = globalThis;
      const subject = browser.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
      if (!subject) {
        return null;
      }
      const root = subject.assemblyDisplay?.root;
      return {
        diagnostics: subject.diagnostics,
        root: root ? { path: root.path, digest: root.digest, byteLength: root.byteLength } : undefined,
        isCurrent: subject.isCurrent(),
      };
    });
    if (committedAssembly === null) {
      session.pageErrors.push('Committed assembly capture unavailable: test bridge is missing.');
    }
  } catch (error) {
    session.pageErrors.push(
      `Committed assembly capture failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const diagnostics = {
    geometryReadiness,
    committedAssembly,
    consoleMessages: session.consoleMessages,
    pageErrors: session.pageErrors,
    screenshot,
    tracePath,
    url: session.primary.url(),
    geospecWasm: await session.geospecWasm,
  };
  await writeFile(
    resolve(directory, 'diagnostics.json'),
    `${JSON.stringify({ ...diagnostics, screenshot: undefined }, null, 2)}\n`,
  );
  return diagnostics;
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
    accessibilitySnapshot: options?.accessibility ? await first.ariaSnapshot() : undefined,
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
  [action: 'start' | 'stop', artifactName?: string, surface?: TargetSurface],
  string | undefined
> = async (commandContext, action, artifactName, surface = 'primary') => {
  const session = sessionFor(commandContext);
  if (action === 'start') {
    if (session.cpuProfiles.has(surface)) {
      throw new Error(`A CPU profile of the ${surface} page is already recording.`);
    }
    const cdp = await session.context.newCDPSession(pageFor(session, surface));
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    session.cpuProfiles.set(surface, cdp);
    if (
      surface === 'primary' &&
      artifactName === 's15-warehouse-startup' &&
      commandContext.testPath?.endsWith('/parts-assemblies-scale.spec.ts')
    ) {
      session.warehouseStartupProfile = cdp;
    }
    if (
      surface === 'primary' &&
      artifactName === 's15-warehouse-preparation' &&
      commandContext.testPath?.endsWith('/parts-assemblies-scale.spec.ts')
    ) {
      const workers = new Set<TargetWorkerInstance>();
      const scripts: WarehousePreparationCapture['scripts'] = new Map();
      const onWorker = (worker: TargetWorkerInstance): void => {
        if (isRuntimeDebugScript(worker.url())) {
          workers.add(worker);
        }
      };
      const onRequest = (request: TargetRequest): void => {
        if (!isRuntimeDebugScript(request.url())) {
          return;
        }
        // Multiple requests for the same URL have no public Worker↔request identity. Never adopt the latest bytes.
        if (scripts.has(request.url())) {
          scripts.set(request.url(), undefined);
        } else {
          scripts.set(request.url(), { request });
        }
      };
      const onResponse = (response: TargetResponse): void => {
        if (!isRuntimeDebugScript(response.url())) {
          return;
        }
        const script = scripts.get(response.url());
        if (script === undefined || script.request !== response.request() || script.hash !== undefined) {
          scripts.set(response.url(), undefined);
          return;
        }
        script.hash = (async () => {
          try {
            return createHash('sha256')
              .update(await response.body())
              .digest('hex');
          } catch {
            return undefined;
          }
        })();
      };
      session.warehousePreparationCapture = { profile: cdp, workers, scripts, onWorker, onRequest, onResponse };
      session.primary.on('worker', onWorker);
      session.primary.on('request', onRequest);
      session.primary.on('response', onResponse);
    }
    return undefined;
  }
  const cdp = session.cpuProfiles.get(surface);
  if (!cdp || !artifactName) {
    throw new Error(`Stopping a CPU profile needs a recording of the ${surface} page and an artifact name.`);
  }
  session.cpuProfiles.delete(surface);
  const preparation = session.warehousePreparationCapture;
  if (preparation?.profile === cdp) {
    session.warehousePreparationCapture = undefined;
    session.primary.off('worker', preparation.onWorker);
    session.primary.off('request', preparation.onRequest);
    session.primary.off('response', preparation.onResponse);
  }
  if (session.warehouseStartupProfile === cdp) {
    session.warehouseStartupProfile = undefined;
  }
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  const path = resolve(outputRoot, commandContext.sessionId, artifactName.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-'));
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(profile));
  return path;
};

/** Lose the configured native viewport device once in the existing Chromium target, then observe DOM Retry recovery. */
export const uiCrashGpuProcess: BrowserCommand<
  [expected: TargetViewportLossBinding],
  TargetWebGpuViewportLoss
> = async (commandContext, expected) => {
  const session = sessionFor(commandContext);
  const page = session.primary;
  const url = page.url();
  if (
    commandContext.provider.name !== 'playwright' ||
    session.context.browser() !== commandContext.context.browser() ||
    page.isClosed() ||
    new URL(url).origin !== new URL(testBaseURL).origin
  ) {
    throw new Error('Native viewport loss requires the existing Vitest-owned product page.');
  }
  const held = await page.evaluateHandle((binding) => {
    const browser: typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi } = globalThis;
    const bridge = browser.__TAU_SECTION_VIEW_TEST__;
    const subject = bridge?.getCommittedAssembly();
    const draw = bridge?.getCommittedDrawInventory();
    if (
      !bridge ||
      !subject?.assemblyDisplay ||
      !subject.isCurrent() ||
      subject.assemblyDisplay.root.digest !== binding.root ||
      subject.assemblyDisplay.root.path !== binding.rootPath ||
      draw?.candidateSceneId !== binding.candidate ||
      draw.unitId !== binding.unit ||
      draw.poseRevision !== binding.pose ||
      bridge.getRendererIdentity().api !== 'webgpu'
    ) {
      throw new Error('The pinned native WebGPU viewport changed before loss observation.');
    }
    const canvas = bridge.getViewportCanvas();
    const identity = bridge.getRendererIdentity({ includeRenderDevice: true }).renderDevice;
    if (
      !canvas.isConnected ||
      identity?.status !== 'observed' ||
      identity.source !== 'mounted-webgpu-canvas-device' ||
      !identity.configuredDeviceMatches
    ) {
      throw new Error('The mounted native WebGPU canvas/device identity is unavailable.');
    }
    const context: unknown = canvas.getContext('webgpu');
    if (typeof context !== 'object' || context === null || Reflect.get(context, 'canvas') !== canvas) {
      throw new Error('The actual viewport WebGPU context is unavailable.');
    }
    const getConfiguration: unknown = Reflect.get(context, 'getConfiguration');
    if (typeof getConfiguration !== 'function') {
      throw new TypeError('The actual viewport WebGPU configuration is unavailable.');
    }
    const configuration: unknown = Reflect.apply(getConfiguration, context, []);
    const device: unknown =
      typeof configuration === 'object' && configuration !== null ? Reflect.get(configuration, 'device') : undefined;
    const deviceConstructor: unknown = Reflect.get(globalThis, 'GPUDevice');
    if (
      typeof device !== 'object' ||
      device === null ||
      typeof deviceConstructor !== 'function' ||
      !(device instanceof deviceConstructor)
    ) {
      throw new Error('The actual viewport configured native GPUDevice is unavailable.');
    }
    const deviceLoss: unknown = Reflect.get(device, 'lost');
    if (!(deviceLoss instanceof Promise)) {
      throw new Error('The actual viewport native device loss promise is unavailable.');
    }
    const lost: Promise<unknown> = deviceLoss;
    // The native handle holds actual subject/canvas/device identity; nothing is installed on the page global.
    return { bridge, subject, canvas, device, context, getConfiguration, lost, binding, identity };
  }, expected);
  let cdp: CdpSession | undefined;
  let primary: PromiseSettledResult<TargetWebGpuViewportLoss> | undefined;
  let detached: PromiseSettledResult<void> | undefined;
  let released: PromiseSettledResult<void> | undefined;
  try {
    [primary] = await Promise.allSettled([
      (async (): Promise<TargetWebGpuViewportLoss> => {
        cdp = await session.context.newCDPSession(page);
        const browser = await cdp.send('Browser.getVersion');
        const browserCommandLine = await cdp.send('Browser.getBrowserCommandLine');
        const directory = resolve(outputRoot, commandContext.sessionId);
        await mkdir(directory, { recursive: true });
        await writeFile(
          resolve(directory, 'native-viewport-loss-preloss.json'),
          `${JSON.stringify(
            {
              status: 'RAW_PRELOSS_UNQUALIFIED',
              browser,
              browserCommandLine,
              testPath: commandContext.testPath,
              sessionId: commandContext.sessionId,
              url,
              expected,
            },
            undefined,
            2,
          )}\n`,
        );
        if (process.env['TAU_E2E_BROWSER_CHANNEL'] === 'chrome') {
          const { arguments: launchArguments } = browserCommandLine;
          if (
            !/^(?:HeadlessChrome|Chrome)\/154\.0\.8037\.93$/u.test(browser.product) ||
            browser.revision !== '@f89f3a4363808e117c592adedcf9947882ac3b79' ||
            launchArguments[0] !== '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ||
            !launchArguments.includes('--enable-automation') ||
            !launchArguments.includes('--enable-unsafe-webgpu') ||
            launchArguments.includes('--use-webgpu-adapter=swiftshader') ||
            launchArguments.some(
              (argument) => argument.startsWith('--disable-features=') && argument.includes('WebGPUService'),
            )
          ) {
            throw new Error(
              `Native viewport loss requires the exact installed Chrome154 reference and hardware launch, received '${browser.product}' revision '${browser.revision}'.`,
            );
          }
        } else if (!/^(?:HeadlessChrome|Chrome)\/151\./u.test(browser.product)) {
          throw new Error(`Native viewport loss requires actual Chromium151, received '${browser.product}'.`);
        }
        if (session.primary !== page || page.isClosed() || page.url() !== url) {
          throw new Error('The held product page changed before native GPU process loss.');
        }
        await page.evaluate((captured) => {
          const browser: typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi } = globalThis;
          const bridge = browser.__TAU_SECTION_VIEW_TEST__;
          const subject = bridge?.getCommittedAssembly();
          const draw = bridge?.getCommittedDrawInventory();
          const configuration: unknown = Reflect.apply(captured.getConfiguration, captured.context, []);
          if (
            bridge !== captured.bridge ||
            !subject?.isCurrent() ||
            subject.assemblyDisplay?.root.digest !== captured.binding.root ||
            subject.assemblyDisplay.root.path !== captured.binding.rootPath ||
            draw?.key !== captured.binding.root ||
            draw.candidateSceneId !== captured.binding.candidate ||
            draw.unitId !== captured.binding.unit ||
            draw.poseRevision !== captured.binding.pose ||
            !captured.subject.isCurrent() ||
            !captured.canvas.isConnected ||
            captured.bridge.getViewportCanvas() !== captured.canvas ||
            typeof configuration !== 'object' ||
            configuration === null ||
            Reflect.get(configuration, 'device') !== captured.device
          ) {
            throw new Error('The held viewport native device changed before GPU process loss.');
          }
        }, held);
        await cdp.send('Browser.crashGpuProcess');
        const nativeDeviceLoss = await page.evaluate(async (captured) => {
          // Milliseconds; native observation deadline, not a recovery latency budget.
          let deviceLossTimer: ReturnType<typeof setTimeout> | undefined;
          try {
            const info: unknown = await Promise.race([
              captured.lost,
              new Promise<never>((_resolve, reject) => {
                deviceLossTimer = setTimeout(() => {
                  reject(new Error('The mounted native GPUDevice did not report loss.'));
                }, 30_000);
              }),
            ]);
            if (
              typeof info !== 'object' ||
              info === null ||
              !('reason' in info) ||
              info.reason !== 'unknown' ||
              !('message' in info) ||
              typeof info.message !== 'string'
            ) {
              throw new Error('The mounted native GPUDevice did not report an unexpected native loss.');
            }
            return { reason: info.reason, message: info.message };
          } finally {
            clearTimeout(deviceLossTimer);
          }
        }, held);
        await page
          .waitForFunction((captured) => !captured.canvas.isConnected && !captured.subject.isCurrent(), held, {
            timeout: 30_000,
          })
          .then(async (observation) => observation.dispose());
        const retired = await page.evaluate(async (captured) => {
          if (captured.bridge.getCommittedDrawInventory() !== undefined) {
            throw new Error('The retired WebGPU bridge still exposes a committed draw.');
          }
          let readDenied = false;
          try {
            await captured.subject.readRawBytes(captured.binding.rootPath);
          } catch (error) {
            if (!(error instanceof Error) || error.message !== 'Committed assembly changed before reading.') {
              throw error;
            }
            readDenied = true;
          }
          if (!readDenied) {
            throw new Error('The held retired WebGPU capture still permits a managed-root read.');
          }
          return {
            retiredCanvasDisconnected: !captured.canvas.isConnected,
            retiredSubjectCurrent: captured.subject.isCurrent(),
            retiredDrawUnavailable: captured.bridge.getCommittedDrawInventory() === undefined,
            retiredReaderDenied: readDenied,
          };
        }, held);
        await page
          .waitForFunction(
            (captured) => {
              const browser: typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi } = globalThis;
              const bridge = browser.__TAU_SECTION_VIEW_TEST__;
              const subject = bridge?.getCommittedAssembly();
              const draw = bridge?.getCommittedDrawInventory();
              const canvas = bridge?.getViewportCanvas();
              return Boolean(
                subject?.isCurrent() &&
                subject.assemblyDisplay?.root.digest === captured.binding.root &&
                draw?.unitId === captured.binding.unit &&
                draw.poseRevision === captured.binding.pose &&
                draw.candidateSceneId !== captured.binding.candidate &&
                canvas &&
                canvas !== captured.canvas &&
                canvas.isConnected,
              );
            },
            held,
            { timeout: 60_000 },
          )
          .then(async (observation) => observation.dispose());
        if (session.primary !== page || page.isClosed() || page.url() !== url) {
          throw new Error('The held product page changed during native viewport recovery.');
        }
        const renderDevice = await page.evaluate((captured) => captured.identity, held);
        return {
          browser,
          browserCommandLine,
          testPath: commandContext.testPath,
          sessionId: commandContext.sessionId,
          url,
          renderDevice,
          nativeDeviceLoss,
          ...retired,
          newCanvas: true,
        };
      })(),
    ]);
  } finally {
    // Drain both native handles while preserving the exact primary failure, including an undefined rejection.
    [detached] = await Promise.allSettled([Promise.resolve().then(async () => cdp?.detach())]);
    [released] = await Promise.allSettled([Promise.resolve().then(async () => held.dispose())]);
  }
  for (const outcome of [primary, detached, released]) {
    if (outcome.status === 'rejected') {
      const error: unknown = outcome.reason;
      throw error;
    }
  }
  if (primary.status !== 'fulfilled') {
    throw new Error('Native viewport loss observation did not settle.');
  }
  return primary.value;
};

/**
 * Capture one finite viewport trajectory using browser-owned diagnostics.
 *
 * The streamed trace needs an independently qualified target-frame/presented-state join before
 * producing presentation percentiles. Renderer-frame samples and Event Timing remain separately
 * labelled, and isolate heap samples exclude unobserved worker/WASM/GPU allocations.
 *
 * @param commandContext - Existing Vitest target session.
 * @param artifactName - Base name below the existing session artifact directory.
 * @param surface - Existing target page.
 * @param options - Opt-in binary transport and isolated input lineage.
 * @returns Raw artifact paths and trace completeness, never a performance verdict.
 */
export const uiScalePresentationProbe: BrowserCommand<
  [artifactName: string, surface?: TargetSurface, options?: TargetScaleProbeOptions],
  TargetScalePresentationProbe
> = async (commandContext, artifactName, surface = 'primary', options = {}) => {
  const traceFormat = options.traceFormat ?? 'json';
  const inputLineage = options.inputLineage ?? false;
  const session = sessionFor(commandContext);
  const page = pageFor(session, surface);
  const stem = artifactName.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-');
  if (stem.length === 0) {
    throw new Error('Scale probe needs a nonempty artifact name.');
  }
  const cdp = await session.context.newCDPSession(page);
  const tracePath = resolve(
    outputRoot,
    commandContext.sessionId,
    `${stem}.${traceFormat === 'proto' ? 'pftrace' : 'trace.json'}`,
  );
  const reportPath = resolve(outputRoot, commandContext.sessionId, `${stem}.probe.json`);
  const readyMark = `tau-scale-ready-${commandContext.sessionId}`;
  const stopMark = `tau-scale-stop-${commandContext.sessionId}`;
  const marks = {
    ready: readyMark,
    stop: stopMark,
    setupEnd: `tau-scale-setup-end-${commandContext.sessionId}`,
    memoryBeforeStart: `tau-scale-memory-before-start-${commandContext.sessionId}`,
    memoryBeforeEnd: `tau-scale-memory-before-end-${commandContext.sessionId}`,
    inputStart: `tau-scale-input-start-${commandContext.sessionId}`,
    inputEnd: `tau-scale-input-end-${commandContext.sessionId}`,
    drainEnd: `tau-scale-diagnostic-drain-end-${commandContext.sessionId}`,
    memoryAfterStart: `tau-scale-memory-after-start-${commandContext.sessionId}`,
    memoryAfterEnd: `tau-scale-memory-after-end-${commandContext.sessionId}`,
    traceStop: `tau-scale-trace-stop-${commandContext.sessionId}`,
  };
  const clockBoundary = async (mark?: string) =>
    page.evaluate((name) => {
      const at = name === undefined ? performance.now() : performance.mark(name).startTime;
      return { at, timeOrigin: performance.timeOrigin, documentUrl: location.href };
    }, mark);
  let started = false;
  let failed = false;
  let stream: string | undefined;
  let observed: Promise<unknown> | undefined;
  let traceBytes = 0;
  let dataLossOccurred = true;
  let traceBufferHighWater: number | undefined;
  let completeTimeout: ReturnType<typeof setTimeout> | undefined;
  let resolveComplete: ((value: unknown) => void) | undefined;
  const complete = new Promise<unknown>((resolve) => {
    resolveComplete = resolve;
  });
  const onBufferUsage = (value: unknown): void => {
    if (
      typeof value === 'object' &&
      value !== null &&
      'percentFull' in value &&
      typeof value.percentFull === 'number' &&
      Number.isFinite(value.percentFull)
    ) {
      traceBufferHighWater = Math.max(traceBufferHighWater ?? 0, value.percentFull);
    }
  };
  cdp.on('Tracing.bufferUsage', onBufferUsage);
  const onComplete = (value: unknown): void => {
    if (typeof value === 'object' && value !== null && 'stream' in value && typeof value.stream === 'string') {
      stream = value.stream;
    }
    resolveComplete?.(value);
  };
  cdp.on('Tracing.tracingComplete', onComplete);
  const stopObservation = async (): Promise<void> => {
    await page.evaluate((mark) => {
      performance.mark(mark);
    }, stopMark);
  };
  try {
    const setupStart = await clockBoundary();
    const browser = await cdp.send('Browser.getVersion');
    const browserCommandLine = await cdp.send('Browser.getBrowserCommandLine');
    const targetInfoBefore: unknown = await cdp.send('Target.getTargetInfo');
    const targetFrame = await cdp.send('Page.getFrameTree');
    const isolate = await cdp.send('Runtime.getIsolateId');
    const heapBefore = await cdp.send('Runtime.getHeapUsage');
    await mkdir(resolve(tracePath, '..'), { recursive: true });
    // An already active browser-wide recording must fail here; never end a recording we did not start.
    await cdp.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      streamFormat: traceFormat,
      streamCompression: 'none',
      bufferUsageReportingInterval: 250,
      traceConfig: {
        recordMode: 'recordUntilFull',
        traceBufferSizeInKb: 32_768,
        includedCategories: [
          'cc',
          'viz',
          'benchmark',
          'input',
          'blink.user_timing',
          // Chromium151 emits frame/process ownership and SetLayerTreeId in this exact category.
          'disabled-by-default-devtools.timeline',
          'disabled-by-default-devtools.timeline.frame',
          'disabled-by-default-memory-infra',
          ...(inputLineage ? ['devtools.timeline', 'disabled-by-default-devtools.timeline.inputs'] : []),
        ],
      },
    });
    started = true;
    const setupEnd = await clockBoundary(marks.setupEnd);
    const memoryBeforeStart = await clockBoundary(marks.memoryBeforeStart);
    const memoryBefore = await cdp.send('Tracing.requestMemoryDump', { levelOfDetail: 'light' });
    const memoryBeforeEnd = await clockBoundary(marks.memoryBeforeEnd);
    observed = page.evaluate(
      async ({ readyMark, stopMark, inputLineage }) => {
        const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi })
          .__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Mounted viewport is unavailable for the scale probe.');
        }
        const canvas = bridge.getViewportCanvas();
        const inputRegion = canvas.closest<HTMLElement>('[data-testid="cad-viewer-canvas-region"]');
        if (!inputRegion || !inputRegion.isConnected) {
          throw new Error('Scale viewport input owner is unavailable.');
        }
        const cameraBefore = bridge.getCamera();
        const subject = bridge.getCommittedAssembly();
        if (!subject.assemblyDisplay || !subject.isCurrent()) {
          throw new Error('A coherent committed assembly is required for the scale probe.');
        }
        const { assemblyDisplay } = subject;
        // Boundary-only inventory; camera demand may replace the candidate, but never the held subject/viewport.
        const readAuthority = () => {
          const current = bridge.getCommittedAssembly();
          const inventory = bridge.getCommittedDrawInventory();
          const renderer = bridge.getRendererIdentity();
          const resources = bridge.getAssemblyResourceTelemetry();
          const viewportIds = new Set(
            resources.flatMap(({ detail }) => {
              const id = detail?.['viewportActorSessionId'];
              return typeof id === 'string' && id.length > 0 ? [id] : [];
            }),
          );
          const [viewportActorSessionId] = viewportIds;
          if (
            !subject.isCurrent() ||
            !current.isCurrent() ||
            current.assemblyDisplay !== assemblyDisplay ||
            !inventory ||
            inventory.key !== assemblyDisplay.root.digest ||
            current.diagnostics.requestedKey !== inventory.key ||
            current.diagnostics.presentedKey !== inventory.key ||
            current.diagnostics.presentedRevision !== inventory.presentationRevision ||
            viewportIds.size !== 1 ||
            viewportActorSessionId === undefined ||
            !canvas.isConnected ||
            !inputRegion.isConnected ||
            canvas.closest('[data-testid="cad-viewer-canvas-region"]') !== inputRegion ||
            bridge.getViewportCanvas() !== canvas ||
            (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: unknown }).__TAU_SECTION_VIEW_TEST__ !==
              bridge
          ) {
            throw new Error('Scale input probe has no coherent current subject/viewport authority.');
          }
          return {
            root: inventory.key,
            candidateSceneId: inventory.candidateSceneId,
            presentationRevision: inventory.presentationRevision,
            unitId: inventory.unitId,
            poseRevision: inventory.poseRevision,
            viewportActorSessionId,
            backend: renderer.api,
            rendererName: renderer.name,
            rendererFrame: renderer.frame,
            projectId: current.diagnostics.projectId,
            sourceEntryPath: current.diagnostics.sourceEntryPath,
            requestedRenderId: current.diagnostics.requestedRenderId,
            settledRenderId: current.diagnostics.settledRenderId,
            viewport: {
              width: innerWidth,
              height: innerHeight,
              dpr: devicePixelRatio,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
            },
          };
        };
        const authorityBefore = readAuthority();
        const abort = new AbortController();
        const inputs: Array<{ name: string; at: number; actionMark?: string }> = [];
        const eventTiming: Array<{
          name: string;
          start: number;
          duration: number;
          processingStart: number;
          processingEnd: number;
          interactionId: number;
        }> = [];
        const rendererFrames: Array<{ at: number; frame: number }> = [];
        const inputToRender: number[] = [];
        const longAnimationFrames: Array<{ start: number; duration: number; blockingDuration: number }> = [];
        const longFrameSupported = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
        const longFrameObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (longAnimationFrames.length >= maximumSamples) {
              overflow = true;
              continue;
            }
            if ('blockingDuration' in entry && typeof entry.blockingDuration === 'number') {
              longAnimationFrames.push({
                start: entry.startTime,
                duration: entry.duration,
                blockingDuration: entry.blockingDuration,
              });
            }
          }
        });
        const pending: number[] = [];
        const maximumSamples = 2000;
        let overflow = false;
        let raf = 0;
        let previousFrame = bridge.getRendererIdentity({ includeRendererName: false }).frame;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (
              !(entry instanceof PerformanceEventTiming) ||
              !(entry.target instanceof Node) ||
              !inputRegion.contains(entry.target)
            ) {
              continue;
            }
            if (eventTiming.length >= maximumSamples) {
              overflow = true;
              continue;
            }
            eventTiming.push({
              name: entry.name,
              start: entry.startTime,
              duration: entry.duration,
              processingStart: entry.processingStart,
              processingEnd: entry.processingEnd,
              interactionId: entry.interactionId,
            });
          }
        });
        const observerOptions = { type: 'event', buffered: false, durationThreshold: 16 };
        observer.observe(observerOptions);
        if (longFrameSupported) {
          longFrameObserver.observe({ type: 'long-animation-frame', buffered: false });
        }
        const observeInput = (event: Event): void => {
          if (!event.isTrusted || !(event.target instanceof Node) || !inputRegion.contains(event.target)) {
            return;
          }
          if (inputs.length >= maximumSamples) {
            overflow = true;
            return;
          }
          const actionMark = inputLineage ? `${readyMark}-action-${inputs.length}-${event.type}` : undefined;
          if (actionMark !== undefined) {
            performance.mark(actionMark);
          }
          inputs.push({ name: event.type, at: event.timeStamp, ...(actionMark === undefined ? {} : { actionMark }) });
          if (event instanceof PointerEvent && event.type === 'pointermove' && event.buttons !== 0) {
            pending.push(event.timeStamp);
          }
        };
        for (const name of [
          'pointerdown',
          'pointerup',
          'pointermove',
          'click',
          'wheel',
          ...(inputLineage ? ['mousedown', 'mouseup', 'mousemove'] : []),
        ]) {
          inputRegion.addEventListener(name, observeInput, { capture: true, signal: abort.signal });
        }
        performance.clearMarks(readyMark);
        performance.clearMarks(stopMark);
        const startedAt = performance.now();
        performance.mark(readyMark);
        try {
          await new Promise<void>((resolve, reject) => {
            const sample = (): void => {
              const at = performance.now();
              if (performance.getEntriesByName(stopMark).length > 0) {
                resolve();
                return;
              }
              if (at - startedAt > 15_000) {
                reject(new Error('Finite scale input probe timed out.'));
                return;
              }
              if (
                !canvas.isConnected ||
                bridge.getViewportCanvas() !== canvas ||
                (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: unknown })
                  .__TAU_SECTION_VIEW_TEST__ !== bridge
              ) {
                const currentBridge = (
                  globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi }
                ).__TAU_SECTION_VIEW_TEST__;
                const currentSubject = currentBridge?.getCommittedAssembly();
                reject(
                  new Error(
                    `Scale viewport retired during the input interval: ${JSON.stringify({
                      canvasConnected: canvas.isConnected,
                      canvasMatches: bridge.getViewportCanvas() === canvas,
                      bridgeMatches: currentBridge === bridge,
                      replacementCanvasMatches: currentBridge?.getViewportCanvas() === canvas,
                      heldSubjectCurrent: subject.isCurrent(),
                      currentSubjectCurrent: currentSubject?.isCurrent(),
                      before: subject.diagnostics,
                      current: currentSubject?.diagnostics,
                    })}`,
                  ),
                );
                return;
              }
              const { frame } = bridge.getRendererIdentity({ includeRendererName: false });
              if (frame !== previousFrame) {
                if (rendererFrames.length >= maximumSamples) {
                  overflow = true;
                } else {
                  rendererFrames.push({ at, frame });
                }
                inputToRender.push(...pending.splice(0).map((inputAt) => at - inputAt));
                previousFrame = frame;
              }
              raf = requestAnimationFrame(sample);
            };
            raf = requestAnimationFrame(sample);
          });
          const authorityAfter = readAuthority();
          const { candidateSceneId: beforeCandidate, rendererFrame: beforeFrame, ...heldBefore } = authorityBefore;
          const { candidateSceneId: afterCandidate, rendererFrame: afterFrame, ...heldAfter } = authorityAfter;
          if (JSON.stringify(heldBefore) !== JSON.stringify(heldAfter)) {
            throw new Error('Scale root/unit/pose/viewport/backend changed during trusted input.');
          }
          const cameraAfter = bridge.getCamera();
          if (
            inputs.length === 0 ||
            (!cameraAfter.position.some((value, index) => Math.abs(value - cameraBefore.position[index]!) > 1e-6) &&
              !cameraAfter.target.some((value, index) => Math.abs(value - cameraBefore.target[index]!) > 1e-6))
          ) {
            throw new Error('Scale trajectory did not produce trusted viewport input and observed camera movement.');
          }
          return {
            cameraBefore,
            cameraAfter,
            timeOrigin: performance.timeOrigin,
            documentUrl: location.href,
            marks: { ready: readyMark, stop: stopMark },
            startedAt,
            finishedAt: performance.now(),
            authorityBefore,
            authorityAfter,
            candidateBoundary: { before: beforeCandidate, after: afterCandidate },
            rendererFrameBoundary: { before: beforeFrame, after: afterFrame },
            inputs,
            eventTiming,
            rendererFrames,
            inputToRender,
            longAnimationFrames,
            longFrameSupported,
            overflow,
            pendingInputCount: pending.length,
            eventTimingMinimumDuration: 16,
            eventTimingSemantics:
              'discrete next-document-render timings, 8 ms quantization; absent short entries are censored; pointermove/wheel excluded',
            rendererSemantics: 'RAF observes renderer frame counter; inputToRender is not compositor presentation',
            viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            userAgent: navigator.userAgent,
            logicalConcurrency: navigator.hardwareConcurrency,
          };
        } finally {
          cancelAnimationFrame(raf);
          abort.abort();
          observer.disconnect();
          longFrameObserver.disconnect();
          performance.clearMarks(readyMark);
          performance.clearMarks(stopMark);
          for (const input of inputs) {
            if (input.actionMark !== undefined) {
              performance.clearMarks(input.actionMark);
            }
          }
        }
      },
      { readyMark, stopMark, inputLineage },
    );
    // Observe rejection immediately while Playwright sends trusted input in the same target.
    const observation = Promise.allSettled([observed]);
    await page.waitForFunction((mark) => performance.getEntriesByName(mark).length > 0, readyMark, { timeout: 5000 });
    const box = await page.locator('[data-testid="cad-viewer-canvas-region"] canvas').boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error('Scale viewport has no actual pixel area.');
    }
    const inputStart = await clockBoundary(marks.inputStart);
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const x = box.x + box.width * 0.4;
      const y = box.y + box.height * 0.5;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + box.width * 0.2, y + box.height * 0.04, { steps: 24 });
      await page.mouse.up();
    }
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const inputEnd = await clockBoundary(marks.inputEnd);
    // Reuse the existing next-task-after-RAF diagnostic drain; this wait is not a paint assertion.
    await page.evaluate(
      async () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            const channel = new MessageChannel();
            channel.port1.addEventListener(
              'message',
              () => {
                channel.port1.close();
                channel.port2.close();
                resolve();
              },
              { once: true },
            );
            channel.port1.start();
            channel.port2.postMessage(undefined);
          });
        }),
    );
    const diagnosticDrainEnd = await clockBoundary(marks.drainEnd);
    await stopObservation();
    const [input] = await observation;
    if (input.status === 'rejected') {
      const error: unknown = input.reason;
      throw error;
    }
    const documentAfter = await clockBoundary();
    if (
      documentAfter.timeOrigin !== setupStart.timeOrigin ||
      documentAfter.documentUrl !== setupStart.documentUrl ||
      typeof input.value !== 'object' ||
      input.value === null ||
      !('timeOrigin' in input.value) ||
      input.value.timeOrigin !== setupStart.timeOrigin ||
      !('documentUrl' in input.value) ||
      input.value.documentUrl !== setupStart.documentUrl
    ) {
      throw new Error('Scale probe document changed during the capture.');
    }
    const targetInfoAfter: unknown = await cdp.send('Target.getTargetInfo');
    const targetFrameAfter: unknown = await cdp.send('Page.getFrameTree');
    const isolateAfter: unknown = await cdp.send('Runtime.getIsolateId');
    const memoryAfterStart = await clockBoundary(marks.memoryAfterStart);
    const heapAfter = await cdp.send('Runtime.getHeapUsage');
    const memoryAfter = await cdp.send('Tracing.requestMemoryDump', { levelOfDetail: 'light' });
    const memoryAfterEnd = await clockBoundary(marks.memoryAfterEnd);
    const traceStop = await clockBoundary(marks.traceStop);
    await cdp.send('Tracing.end');
    started = false;
    const finished = await Promise.race([
      complete,
      new Promise<never>((_resolve, reject) => {
        completeTimeout = setTimeout(() => {
          reject(new Error('Scale trace completion timed out.'));
        }, 30_000);
      }),
    ]);
    if (
      typeof finished !== 'object' ||
      finished === null ||
      !('dataLossOccurred' in finished) ||
      typeof finished.dataLossOccurred !== 'boolean' ||
      !('stream' in finished) ||
      typeof finished.stream !== 'string'
    ) {
      throw new Error('Compositor trace completion has no checked stream/completeness result.');
    }
    dataLossOccurred = finished.dataLossOccurred;
    stream = finished.stream;
    const traceStream = stream;
    traceBytes = await writeBrowserTraceStream(
      async () => cdp.send('IO.read', { handle: traceStream, size: 65_536 }),
      tracePath,
      traceFormat,
    );
    const traceDrainEnd = await clockBoundary();
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          status: 'raw-probe-only',
          traceFormat,
          tracePath,
          inputLineage,
          browser,
          browserCommandLine,
          targetInfoBefore,
          targetInfoAfter,
          targetFrame,
          targetFrameAfter,
          isolateAfter,
          marks,
          clock: { timeOrigin: setupStart.timeOrigin, documentUrl: setupStart.documentUrl },
          windows: {
            setup: { start: setupStart, end: setupEnd },
            memoryBefore: { start: memoryBeforeStart, end: memoryBeforeEnd },
            trustedInput: { start: inputStart, end: inputEnd },
            diagnosticDrain: { start: inputEnd, end: diagnosticDrainEnd },
            memoryAfter: { start: memoryAfterStart, end: memoryAfterEnd },
            traceStopAndStreamDrain: { start: traceStop, end: traceDrainEnd },
          },
          windowSemantics:
            'Only trustedInput brackets the selected input interval. Setup/dumps/diagnostic drain/stream drain are separate; none is a presentation endpoint.',
          isolate,
          heapBefore,
          heapAfter,
          memoryBefore,
          memoryAfter,
          input: input.value,
          traceBytes,
          dataLossOccurred,
          traceBufferHighWater,
          targetUrl: page.url(),
          traceBufferBytes: 33_554_432,
          presentationJoin:
            'unqualified until actual exported PipelineReporter state/target host/display trace joins are proven; FrameDisplayed alone is insufficient',
          heapBoundary:
            'target V8 isolate only; backing storage may overlap exact typed-array inventory; worker/WASM/GPU/process allocations require actual memory-dump coverage',
        },
        undefined,
        2,
      ),
    );
    return { tracePath, reportPath, traceBytes, dataLossOccurred, presentationQualification: 'raw-probe-only' };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await stopObservation().catch(() => undefined);
    if (observed) {
      await Promise.allSettled([observed]);
    }
    if (started) {
      await cdp.send('Tracing.end').catch(() => undefined);
      let drainTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const finished = await Promise.race([
          complete,
          new Promise<void>((resolve) => {
            drainTimeout = setTimeout(resolve, 5000);
          }),
        ]);
        if (
          typeof finished === 'object' &&
          finished !== null &&
          'dataLossOccurred' in finished &&
          typeof finished.dataLossOccurred === 'boolean' &&
          'stream' in finished &&
          typeof finished.stream === 'string'
        ) {
          dataLossOccurred = finished.dataLossOccurred;
          stream = finished.stream;
          const traceStream = stream;
          traceBytes = await writeBrowserTraceStream(
            async () => cdp.send('IO.read', { handle: traceStream, size: 65_536 }),
            tracePath,
            traceFormat,
          );
          await writeFile(
            reportPath,
            JSON.stringify(
              {
                status: 'failed-probe-only',
                traceFormat,
                traceBytes,
                dataLossOccurred,
                traceBufferHighWater,
                finiteObservation: null,
                completedNativeInputCount: null,
                windows: null,
                presentationQualification: 'unqualified',
                coverage:
                  'Checked trace through failure cleanup; completed finite observation and window fields unavailable.',
              },
              undefined,
              2,
            ),
          );
        }
      } catch {
        // Preserve the original probe error if draining or saving its failed trace also fails.
      }
      if (drainTimeout) {
        clearTimeout(drainTimeout);
      }
    }
    await page
      .evaluate((names) => {
        for (const name of names) {
          performance.clearMarks(name);
        }
      }, Object.values(marks))
      .catch(() => undefined);
    if (stream) {
      await cdp.send('IO.close', { handle: stream }).catch(() => undefined);
    }
    if (completeTimeout) {
      clearTimeout(completeTimeout);
    }
    cdp.off('Tracing.tracingComplete', onComplete);
    cdp.off('Tracing.bufferUsage', onBufferUsage);
    await (failed ? cdp.detach().catch(() => undefined) : cdp.detach());
  }
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
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.locator(triggerSelector).click(),
  ]);
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

/** Validate only the finite copied request/expected fields consumed by this private Node oracle. */
export const uiMotionNativeOracle: BrowserCommand<[input: MotionNativeOracleInput], MotionNativeOracleResult> = async (
  commandContext,
  input,
) => {
  const { observation, expected } = input;
  // The command receives copied transport data, so literal declarations do not establish its runtime qualification.
  const selector: Readonly<{ expectedBodyCount?: unknown }> = input;
  const count = selector.expectedBodyCount ?? 104;
  const names: readonly unknown[] = observation.binding.names;
  const responseStatus: unknown = observation.response?.status;
  const finitePoint = (value: unknown): boolean =>
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate));
  if (
    !isMotionPosedExportQualified(input) ||
    observation.failure !== undefined ||
    responseStatus !== 'cad-geometry' ||
    observation.response?.id !== observation.id ||
    !Number.isFinite(observation.response.distanceMeters) ||
    !finitePoint(observation.response.firstPointMeters) ||
    !finitePoint(observation.response.secondPointMeters) ||
    !Number.isSafeInteger(observation.id) ||
    observation.bytes.length === 0 ||
    observation.bytes.length > 67_108_864 ||
    !observation.bytes.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 255) ||
    (count !== 4 && count !== 104) ||
    expected.length !== count ||
    new Set(expected.map(({ id }) => id)).size !== count ||
    expected.some(
      ({ id, corners, min, max }) =>
        !id ||
        corners.length !== 8 ||
        !corners.every((corner) => finitePoint(corner)) ||
        !finitePoint(min) ||
        !finitePoint(max),
    ) ||
    names.length !== 2 ||
    names[0] === names[1] ||
    !names.every((name) => typeof name === 'string' && expected.some(({ id }) => id === name))
  ) {
    throw new TypeError('The actual finite Node oracle request is unqualified.');
  }
  const session = sessionFor(commandContext);
  const page = session.primary;
  const url = page.url();
  if (page.isClosed() || new URL(url).origin !== new URL(testBaseURL).origin) {
    throw new Error('The actual product page is unavailable for the Node oracle.');
  }
  const held = await page.evaluateHandle((binding) => {
    const browser: typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi } = globalThis;
    const bridge = browser.__TAU_SECTION_VIEW_TEST__;
    const subject = bridge?.getCommittedAssembly();
    const draw = bridge?.getCommittedDrawInventory();
    const canvas = bridge?.getViewportCanvas();
    const display = subject?.assemblyDisplay;
    if (!bridge || !subject || !display || !draw || !canvas) {
      throw new Error('The actual admitted page/root/pose is unavailable for the Node oracle.');
    }
    if (
      !subject.isCurrent() ||
      !canvas.isConnected ||
      !subject.diagnostics.projectId ||
      subject.diagnostics.outcome !== 'success' ||
      subject.diagnostics.requestedKey !== binding.key ||
      subject.diagnostics.presentedKey !== binding.key ||
      subject.diagnostics.requestedRevision !== subject.diagnostics.presentedRevision ||
      subject.diagnostics.requestedRenderId !== subject.diagnostics.settledRenderId ||
      display.root.digest !== binding.key ||
      draw.key !== binding.key ||
      draw.unitId !== binding.unitId ||
      draw.poseRevision !== binding.poseRevision ||
      draw.candidateSceneId !== binding.candidateSceneId
    ) {
      throw new Error('The actual admitted page/root/pose is unavailable for the Node oracle.');
    }
    // The native page handle retains actual bridge/canvas/display identity, without a page-global registry or facade transport.
    return { bridge, canvas, display, binding, diagnostics: subject.diagnostics, revision: draw.presentationRevision };
  }, observation.binding);
  const isCurrent = async (): Promise<boolean> => {
    if (session.primary !== page || page.isClosed() || page.url() !== url) {
      return false;
    }
    return page.evaluate((captured) => {
      const browser: typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi } = globalThis;
      const bridge = browser.__TAU_SECTION_VIEW_TEST__;
      if (
        !bridge ||
        bridge !== captured.bridge ||
        !captured.canvas.isConnected ||
        bridge.getViewportCanvas() !== captured.canvas
      ) {
        return false;
      }
      const subject = bridge.getCommittedAssembly();
      const draw = bridge.getCommittedDrawInventory();
      if (!subject.isCurrent() || subject.assemblyDisplay !== captured.display || !draw) {
        return false;
      }
      const { diagnostics } = subject;
      return (
        diagnostics.projectId === captured.diagnostics.projectId &&
        diagnostics.sourceEntryPath === captured.diagnostics.sourceEntryPath &&
        diagnostics.outcome === 'success' &&
        diagnostics.requestedKey === captured.binding.key &&
        diagnostics.presentedKey === captured.binding.key &&
        diagnostics.requestedRevision === captured.diagnostics.requestedRevision &&
        diagnostics.presentedRevision === captured.diagnostics.presentedRevision &&
        diagnostics.requestedRenderId === captured.diagnostics.requestedRenderId &&
        diagnostics.settledRenderId === captured.diagnostics.settledRenderId &&
        draw.key === captured.binding.key &&
        draw.unitId === captured.binding.unitId &&
        draw.poseRevision === captured.binding.poseRevision &&
        draw.presentationRevision === captured.revision &&
        draw.candidateSceneId === captured.binding.candidateSceneId
      );
    }, held);
  };
  let engine: (HostEngine & HostSubjectLifecycle) | undefined;
  const [primary] = await Promise.allSettled([
    (async (): Promise<MotionNativeOracleResult> => {
      if (!(await isCurrent())) {
        throw new Error('The held product subject retired before Node acquisition.');
      }
      if (input.posedExport) {
        const full = input.posedExport;
        const matches = await held.evaluate((captured, exported) => {
          const { display, binding, diagnostics, revision } = captured;
          return (
            exported.projectId === diagnostics.projectId &&
            exported.sourceEntryPath === diagnostics.sourceEntryPath &&
            exported.root.path === display.root.path &&
            exported.root.digest === display.root.digest &&
            exported.root.byteLength === display.root.byteLength &&
            exported.key === binding.key &&
            exported.unitId === binding.unitId &&
            exported.poseRevision === binding.poseRevision &&
            exported.candidateSceneId === binding.candidateSceneId &&
            exported.presentationRevision === revision
          );
        }, full);
        if (!matches || !(await isCurrent())) {
          throw new Error('The full posed export does not belong to the held current page source.');
        }
      }
      const nativeModule = await import('@taucad/geospec-engine-native/node');
      if (!(await isCurrent())) {
        throw new Error('The held product subject retired during Node module acquisition.');
      }
      const owned = new nativeModule.Engine();
      engine = owned;
      const result = await queryObservedMotionNativeOracle({ ...input, isCurrent }, owned);
      if (!(await isCurrent())) {
        throw new Error('The held product subject retired during the Node oracle.');
      }
      return result;
    })(),
  ]);
  const [closed] = await Promise.allSettled([
    Promise.resolve().then(() => {
      engine?.close();
    }),
  ]);
  const [current] = await Promise.allSettled([isCurrent()]);
  const [released] = await Promise.allSettled([Promise.resolve().then(async () => held.dispose())]);
  if (primary.status === 'rejected') {
    const error: unknown = primary.reason;
    throw error;
  }
  if (closed.status === 'rejected') {
    const error: unknown = closed.reason;
    throw error;
  }
  if (current.status === 'rejected') {
    const error: unknown = current.reason;
    throw error;
  }
  if (!current.value) {
    throw new Error('The held product subject retired before Node oracle delivery.');
  }
  if (released.status === 'rejected') {
    const error: unknown = released.reason;
    throw error;
  }
  return primary.value;
};

export const uiBrowserCommands = {
  uiMotionNativeOracle,
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
  uiCrashGpuProcess,
  uiScalePresentationProbe,
  uiDragTarget,
  uiDownloadTarget,
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
  uiStopTauServeFixture,
  uiReleaseTauServeGateway,
  uiIsTauServeGatewayHeld,
  uiReadTauServeFile,
  uiListTauServeChats,
  uiTypeTarget,
  uiWaitForTarget,
};
