/* eslint-disable @typescript-eslint/naming-convention -- Exact upstream protocol fields, bundled class names, and constants are the subjects of these tests. */
/** Config readback is an observation, never a durable-save receipt or permission authority. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

import { test } from 'vitest';
const require = createRequire(import.meta.url);
const bundle = readFileSync(require.resolve('@agentclientprotocol/codex-acp'), 'utf8');
const code = bundle.slice(
  bundle.indexOf('// src/permissions/option-ids.ts'),
  bundle.indexOf('// src/CodexAuthMethod.ts'),
);
type Observation = {
  stored: string;
  effective: string;
  preexisting: boolean | 'unknown';
  layerKind?: string;
  reason?: string;
};
type Request = { options: Array<{ optionId: string }>; toolCall: { _meta?: Record<string, { reason: string }> } };
type Update = { update?: { _meta?: Record<string, Observation> } };
type Result = { action: string };
type Notification = { method: string; params: { threadId: string; item: typeof identity } };
type Handler = {
  handleNotification(notification: Notification): Promise<void>;
  handleElicitation(params: Record<string, unknown>): Promise<Result>;
};
type Context = { handleNotification(notification: Notification): void };
type BundleApi = {
  CodexElicitationHandler: new (
    connection: {
      request(method: string, request: Request): Promise<unknown>;
      notify(method: string, update: Update): Promise<void>;
    },
    context: Context,
    capabilities: Record<string, unknown>,
    signal: AbortSignal | undefined,
    options: { threadId: string; readConfig(): Promise<unknown> },
  ) => Handler;
  PermissionPromptContext: new (standalone: () => string) => Context;
};
// The executable-only dependency exposes no imports; exercise its actual bundled classes.
const api = runInNewContext(code + '; ({CodexElicitationHandler,PermissionPromptContext})', {
  setTimeout,
  clearTimeout,
  AbortController,
  methods: {
    client: {
      session: { requestPermission: 'session/request_permission', update: 'session/update' },
      elicitation: { create: 'elicitation/create' },
    },
  },
  logger: { error: () => assert.fail('Unexpected adapter error') },
}) as BundleApi;
const key = 'tau/permissionPersistence';
const capability = { version: 1, readback: 'config-layers', families: ['mcp-tool'] };
const identity: {
  type: string;
  status: string;
  id: string;
  server: string;
  tool: string;
  pluginId: unknown;
  appContext: unknown;
} = {
  type: 'mcpToolCall',
  status: 'completed',
  id: 'call1',
  server: 'fixture',
  tool: 'operate',
  pluginId: null,
  appContext: null,
};
function config(mode = 'approve', options: { override?: boolean; kind?: string; disabled?: string } = {}) {
  const server: {
    command: string;
    env: Record<string, string>;
    tools: { operate: { approval_mode: string; enabled?: boolean } };
    enabled?: boolean;
    enabled_tools?: string[];
    disabled_tools?: string[];
  } = { command: 'fake-command', env: { SECRET: 'never-leak' }, tools: { operate: { approval_mode: mode } } };
  return {
    config: {
      mcp_servers: {
        fixture: options.override ? { ...server, tools: { operate: { approval_mode: 'prompt' } } } : server,
      },
    },
    layers: [
      {
        name: { type: options.kind ?? 'user', file: '/private/secret/config.toml' },
        disabledReason: options.disabled ?? null,
        config: { mcp_servers: { fixture: server } },
      },
    ],
  };
}
function harness({
  snapshots = [config('auto'), config()],
  capabilities = { _meta: { [key]: capability } },
  choice = 'allow_always',
  readConfig,
  signal,
}: {
  snapshots?: unknown[];
  capabilities?: Record<string, unknown>;
  choice?: string;
  readConfig?: () => Promise<unknown>;
  signal?: AbortSignal;
} = {}) {
  const updates: Update[] = [],
    requests: Request[] = [];
  let reads = 0;
  const context = new api.PermissionPromptContext(() => 'standalone');
  const connection = {
    request: async (_method: string, request: Request) => {
      requests.push(request);
      return { outcome: { outcome: 'selected', optionId: choice } };
    },
    notify: async (_method: string, value: Update) => {
      updates.push(value);
    },
  };
  const handler = new api.CodexElicitationHandler(connection, context, capabilities, signal, {
    threadId: 'thread1',
    readConfig: async () => {
      reads++;
      if (readConfig) {
        return readConfig();
      }
      const value = snapshots[Math.min(reads - 1, snapshots.length - 1)];
      if (value instanceof Error) {
        throw value;
      }
      return value;
    },
  });
  return {
    handler,
    updates,
    requests,
    get reads() {
      return reads;
    },
    async event(method: string, item = identity, threadId = 'thread1') {
      const notification = { method, params: { threadId, item } };
      context.handleNotification(notification);
      await handler.handleNotification(notification);
    },
    async ask(overrides: Record<string, unknown> = {}) {
      return handler.handleElicitation({
        threadId: 'thread1',
        serverName: 'fixture',
        mode: 'form',
        message: 'Run?',
        requestedSchema: { type: 'object', properties: {} },
        _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] },
        ...overrides,
      });
    },
    observation() {
      return updates.find((update) => update.update?._meta?.[key])?.update?._meta?.[key];
    },
  };
}
test('always observes only after exact native terminal completion, without secrets', async () => {
  const h = harness();
  await h.event('item/started');
  await h.ask();
  assert.equal(h.reads, 1);
  assert.equal(h.observation(), undefined);
  await h.event('item/completed', { ...identity, id: 'other' });
  assert.equal(h.observation(), undefined);
  await h.event('item/completed');
  assert.deepEqual(structuredClone(h.observation()), {
    version: 1,
    provider: 'codex',
    optionId: 'allow_always',
    toolCallId: 'call1',
    requestedScope: 'persistent',
    stored: 'present',
    effective: 'allowed',
    preexisting: false,
    observation: 'config-readback',
    layerKind: 'user',
    reason: 'policy-observed',
  });
  assert.equal(h.reads, 2);
  await h.event('item/completed');
  assert.equal(h.reads, 2);
  assert.ok(!JSON.stringify(h.updates).includes('SECRET'));
  assert.ok(!JSON.stringify(h.updates).includes('/private/secret'));
});
test('temporary server cannot offer ineffective persistent scope', async () => {
  const h = harness({ snapshots: [{ config: {}, layers: [] }] });
  await h.event('item/started');
  const result = await h.ask();
  assert.deepEqual(
    Array.from(h.requests[0]!.options, (o) => o.optionId),
    ['allow_once', 'allow_session', 'cancel'],
  );
  assert.equal(result.action, 'cancel');
  assert.equal(h.requests[0]!.toolCall._meta![key]!.reason, 'unconfigured-mcp-server');
});
test('reports effective override and preexisting approval independently', async () => {
  const h = harness({ snapshots: [config(), config('approve', { override: true, kind: 'project' })] });
  await h.event('item/started');
  await h.ask();
  await h.event('item/completed');
  assert.equal(h.observation()!.stored, 'present');
  assert.equal(h.observation()!.effective, 'overridden');
  assert.equal(h.observation()!.preexisting, true);
  assert.equal(h.observation()!.layerKind, 'project');
});
test('failed durable write remains absent rather than saved', async () => {
  const h = harness({ snapshots: [config('auto'), config('auto')] });
  await h.event('item/started');
  await h.ask();
  await h.event('item/completed');
  assert.equal(h.observation()!.stored, 'absent');
  assert.equal(h.observation()!.effective, 'unknown');
});
test('config error preserves provider choices and returns unknown', async () => {
  const h = harness({ snapshots: [new Error('SECRET'), new Error('SECRET')] });
  await h.event('item/started');
  await h.ask();
  assert.ok(h.requests[0]!.options.some((o) => o.optionId === 'allow_always'));
  await h.event('item/completed');
  assert.equal(h.observation()!.stored, 'unknown');
  assert.equal(h.observation()!.preexisting, 'unknown');
  assert.equal(h.observation()!.reason, 'config-read-failed');
  assert.ok(!JSON.stringify(h.updates).includes('SECRET'));
});
test('disabled and non-durable layers never establish durable server support', async () => {
  await Promise.all(
    [{ kind: 'sessionFlags' }, { kind: 'enterpriseManaged' }, { disabled: 'untrusted' }].map(async (options) => {
      const h = harness({ snapshots: [config('approve', options)] });
      await h.event('item/started');
      await h.ask();
      assert.ok(!h.requests[0]!.options.some((o) => o.optionId === 'allow_always'));
    }),
  );
});
test('unnegotiated clients and unknown versions retain unchanged provider behavior', async () => {
  await Promise.all(
    [{}, { _meta: { [key]: { ...capability, version: 2 } } }].map(async (capabilities) => {
      const h = harness({ capabilities });
      await h.event('item/started');
      await h.ask();
      await h.event('item/completed');
      assert.equal(h.reads, 0);
      assert.equal(h.observation(), undefined);
      assert.ok(h.requests[0]!.options.some((o) => o.optionId === 'allow_always'));
    }),
  );
});
test('once and session choices never become a persistent observation', async () => {
  await Promise.all(
    ['allow_once', 'allow_session', 'cancel'].map(async (choice) => {
      const h = harness({ choice });
      await h.event('item/started');
      await h.ask();
      await h.event('item/completed');
      assert.equal(h.observation(), undefined);
      assert.equal(h.reads, 1);
    }),
  );
});
test('unsupported native identities and ambiguous concurrent calls are never guessed', async () => {
  await Promise.all(
    [{ pluginId: 'plugin' }, { appContext: { id: 'app' } }, { tool: '' }].map(async (changed) => {
      const h = harness();
      await h.event('item/started', { ...identity, ...changed });
      await h.ask();
      await h.event('item/completed', { ...identity, ...changed });
      assert.equal(h.reads, 0);
      assert.equal(h.observation(), undefined);
    }),
  );
  const h = harness();
  await h.event('item/started');
  await h.event('item/started', { ...identity, id: 'call2' });
  await h.ask();
  assert.equal(h.reads, 0);
  assert.equal(h.observation(), undefined);
});
test('untrusted form metadata cannot acquire provider observation capability', async () => {
  const h = harness();
  await h.event('item/started');
  await h.ask({ _meta: { persist: ['always'], [key]: capability } });
  await h.event('item/completed');
  assert.equal(h.reads, 0);
  assert.equal(h.observation(), undefined);
});
test('wrong native server, tool or thread does not settle approval', async () => {
  const h = harness();
  await h.event('item/started');
  await h.ask();
  await h.event('item/completed', { ...identity, tool: 'other' });
  assert.equal(h.observation(), undefined);
  await h.event('item/completed', { ...identity, server: 'other' });
  await h.event('item/completed', identity, 'other-thread');
  assert.equal(h.reads, 1);
  await h.event('item/completed');
  assert.equal(h.observation()!.stored, 'present');
});
test('aborted prompt never publishes late successful readback', async () => {
  const controller = new AbortController();
  let release: ((value: unknown) => void) | undefined;
  let n = 0;
  const h = harness({
    signal: controller.signal,
    readConfig: async () => {
      if (++n === 1) {
        return config('auto');
      }
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  await h.event('item/started');
  await h.ask();
  const completed = h.event('item/completed');
  await Promise.resolve();
  controller.abort();
  release!(config());
  await completed;
  assert.equal(h.observation(), undefined);
});

test('strict review and nonrememberable modes cannot claim effective allowance', async () => {
  await Promise.all(
    [true, false].map(async (strict) => {
      const h = harness({ snapshots: [config(strict ? 'auto' : 'prompt'), config()] });
      await h.event('item/started');
      await h.ask({
        _meta: {
          codex_approval_kind: 'mcp_tool_call',
          persist: ['session', 'always'],
          codex_strict_auto_review: strict,
        },
      });
      await h.event('item/completed');
      assert.equal(h.observation()!.stored, 'present');
      assert.equal(h.observation()!.effective, 'unknown');
      assert.equal(h.observation()!.reason, 'policy-unqualified');
    }),
  );
});
test('replaced server configuration invalidates observation instead of blessing new target', async () => {
  const changed = config();
  changed.config.mcp_servers.fixture.command = 'different-command';
  const h = harness({ snapshots: [config('auto'), changed] });
  await h.event('item/started');
  await h.ask();
  await h.event('item/completed');
  assert.equal(h.observation()!.stored, 'unknown');
  assert.equal(h.observation()!.effective, 'unknown');
  assert.equal(h.observation()!.reason, 'config-changed');
});
test('disabled effective tools and server deny lists override stored policy', async () => {
  await Promise.all(
    [
      (server: ReturnType<typeof config>['config']['mcp_servers']['fixture']) => {
        server.enabled = false;
      },
      (server: ReturnType<typeof config>['config']['mcp_servers']['fixture']) => {
        server.tools.operate.enabled = false;
      },
      (server: ReturnType<typeof config>['config']['mcp_servers']['fixture']) => {
        server.disabled_tools = ['operate'];
      },
      (server: ReturnType<typeof config>['config']['mcp_servers']['fixture']) => {
        server.enabled_tools = ['other'];
      },
    ].map(async (mutation) => {
      const before = config('auto'),
        after = config();
      mutation(before.config.mcp_servers.fixture);
      mutation(after.config.mcp_servers.fixture);
      const h = harness({ snapshots: [before, after] });
      await h.event('item/started');
      await h.ask();
      await h.event('item/completed');
      assert.equal(h.observation()!.stored, 'present');
      assert.equal(h.observation()!.effective, 'overridden');
    }),
  );
});

test('failed terminal action can still reveal a stored preference', async () => {
  const h = harness();
  await h.event('item/started');
  await h.ask();
  await h.event('item/completed', { ...identity, status: 'failed' });
  assert.equal(h.observation()?.stored, 'present');
});

test('readback timeout settles unknown and does not wait indefinitely', async () => {
  let reads = 0;
  const h = harness({
    readConfig: async () =>
      ++reads === 1
        ? config('auto')
        : new Promise(() => {
            /* Deliberately unresolved native config request. */
          }),
  });
  await h.event('item/started');
  await h.ask();
  await h.event('item/completed');
  assert.equal(h.observation()?.reason, 'config-read-failed');
}, 10_000);

test('cancellation settles an outstanding read immediately, without a false observation', async () => {
  const controller = new AbortController();
  let reads = 0;
  const h = harness({
    signal: controller.signal,
    readConfig: async () =>
      ++reads === 1
        ? config('auto')
        : new Promise(() => {
            /* Deliberately unresolved native config request. */
          }),
  });
  await h.event('item/started');
  await h.ask();
  const terminal = h.event('item/completed');
  await Promise.resolve();
  controller.abort();
  await terminal;
  assert.equal(h.observation(), undefined);
});

test('malformed snapshots never classify persistence support as absent', async () => {
  await Promise.all(
    [{ config: {}, layers: [{}] }, { config: {}, layers: null }, {}].map(async (snapshot) => {
      const h = harness({ snapshots: [snapshot] });
      await h.event('item/started');
      await h.ask();
      assert.ok(h.requests[0]?.options.some((option) => option.optionId === 'allow_always'));
      await h.event('item/completed');
      assert.equal(h.observation()?.stored, 'unknown');
    }),
  );
});

test('adapter initialize acknowledges only the exact negotiated capability', async () => {
  const start = bundle.indexOf('  async initialize(_params) {', bundle.indexOf('var CodexAcpServer ='));
  const source = bundle.slice(start, bundle.indexOf('  async extMethod(', start));
  const initialize = runInNewContext(`${code};({${source}}).initialize`, {
    logger: { log: () => undefined },
    resolveTerminalOutputMode: () => 'terminal_output_delta',
    clientSupportsBooleanConfigOptions: () => false,
    PROTOCOL_VERSION: 1,
    package_default: { name: 'codex-acp', version: '1.7.0' },
    getCodexAuthMethods: () => [],
    GOAL_EXTENSION_VERSION: 1,
    GOAL_CONTROL_METHOD: 'goal',
    GOAL_CONTROL_ACTIONS: [],
    JETBRAINS_META_KEY: 'jetbrains',
    AIR_META_KEY: 'air',
    AIR_EXTENSION_VERSION_KEY: 'version',
    AIR_EXTENSION_VERSION: 1,
    AIR_EXTENSION_CAPABILITIES_KEY: 'capabilities',
    AIR_SESSION_FAILURE_KEY: 'sessionFailure',
    AIR_AGENT_FILE_CHANGE_REPORT_KEY: 'fileChange',
    AIR_NATIVE_SUBAGENT_SESSIONS_KEY: 'subagents',
  }) as (this: unknown, params: Record<string, unknown>) => Promise<{ _meta: Record<string, unknown> }>;
  const receiver = {
    runWithProcessCheck: async (operation: () => Promise<void>) => operation(),
    codexAcpClient: { initialize: async () => undefined },
  };
  await Promise.all(
    [undefined, { ...capability, version: 2 }, capability].map(async (requested) => {
      const result = await initialize.call(receiver, { clientCapabilities: { _meta: { [key]: requested } } });
      assert.deepEqual(
        result._meta[key] ? structuredClone(result._meta[key]) : undefined,
        requested === capability ? capability : undefined,
      );
      assert.ok(result._meta['steering']);
    }),
  );
});

test('readback uses native config layers and the captured project cwd', async () => {
  const start = bundle.indexOf('  async tauReadPermissionConfig(cwd) {');
  assert.ok(start !== -1, 'Pinned private adapter must expose the narrow readback bridge');
  const source = bundle.slice(start, bundle.indexOf('  async createSessionConfig(', start));
  const read = runInNewContext(`({${source}}).tauReadPermissionConfig`) as (
    this: unknown,
    cwd: string,
  ) => Promise<unknown>;
  const calls: unknown[] = [];
  const snapshot = config();
  const result = await read.call(
    {
      codexClient: {
        configRead: async (params: unknown) => {
          calls.push(params);
          return snapshot;
        },
      },
    },
    '/fixture/project',
  );
  assert.equal(result, snapshot);
  assert.deepEqual(structuredClone(calls), [{ includeLayers: true, cwd: '/fixture/project' }]);
});

test('duplicate native start never replaces a pending approval identity', async () => {
  const h = harness();
  await h.event('item/started');
  await h.ask();
  await h.event('item/started', { ...identity, tool: 'other' });
  await h.event('item/completed');
  await h.event('item/completed', { ...identity, tool: 'other' });
  assert.equal(h.reads, 1);
  assert.equal(h.observation(), undefined);
});

test('the installed native notification queue drains readback before turn finalization', async () => {
  const start = bundle.indexOf('  async waitForSessionNotifications(sessionId) {');
  const source = bundle.slice(start, bundle.indexOf('  async sendPrompt(', start));
  type Queue = {
    sessionNotificationQueues: Map<string, Promise<void>>;
    enqueueSessionNotification(sessionId: string, operation: () => Promise<void>): void;
    waitForSessionNotifications(sessionId: string): Promise<void>;
  };
  const queue = runInNewContext(
    `({sessionNotificationQueues: new Map(), ${source.replaceAll('\n  }\n  ', '\n  },\n  ')}})`,
    { logger: { error: () => assert.fail('Queue operation failed') } },
  ) as Queue;
  let release: ((value: unknown) => void) | undefined;
  let reads = 0;
  const h = harness({
    readConfig: async () =>
      ++reads === 1
        ? config('auto')
        : new Promise((resolve) => {
            release = resolve;
          }),
  });
  await h.event('item/started');
  await h.ask();
  let finalized = false;
  queue.enqueueSessionNotification('thread1', async () => h.event('item/completed'));
  queue.enqueueSessionNotification('thread1', async () => {
    await h.event('turn/completed');
    finalized = true;
  });
  await Promise.resolve();
  assert.equal(finalized, false);
  assert.equal(h.observation(), undefined);
  release!(config());
  await queue.waitForSessionNotifications('thread1');
  assert.equal(h.observation()?.stored, 'present');
  assert.equal(finalized, true);
});
