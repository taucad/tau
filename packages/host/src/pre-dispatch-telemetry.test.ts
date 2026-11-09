// T19 joined: a request the host refuses before dispatch (a preparation that is blocked or fails, or a host admission
// refusal) reaches the Node host reporter as one `refused` entry with its closed code, and the runtime client behind
// the gate starts no kernel span and settles no attempt. Each refusal runs the shipping preparation host on a real
// store, the shipping admission authority, the shipping Node host composition and an in-process runtime client; only
// the API origin (`fetch`) is a test double.
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { createRuntimeClient, defineKernel, defineRuntime, fromMemoryFs } from '@taucad/runtime';
import type { RuntimeOperationObservation } from '@taucad/runtime';
import { createHostAdmissionAuthority, HostAdmissionRefusal } from '@taucad/runtime/host';
import { createKernelSuccess, nonemptyExportFiles } from '@taucad/runtime/kernel';
import { createPreparationHost, parsePluginDeployment, systemLibraryRefusal } from '@taucad/runtime/preparation/node';
import type {
  DependencyPayload,
  HostIndicators,
  PluginPreparation,
  PreparationHost,
  PreparationPlugin,
  PrepareOutcome,
} from '@taucad/runtime/preparation/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { parseRuntimeEntry } from '@taucad/telemetry';
import { admissionEntry, preparationEntry } from '@taucad/telemetry/client';
import type { RuntimeOperationEntry } from '@taucad/telemetry/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeHostTelemetry } from '#telemetry.js';
import type { NodeHostTelemetry } from '#telemetry.js';

/** Paths whose next `writeFile` fails with the kernel's own ENOSPC, read back from `/dev/full`. */
const exhausted = new Set<string>();

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  const writeFile: typeof actual.writeFile = async (path, data, options) => {
    if (typeof path === 'string' && exhausted.has(basename(path))) {
      // A write to the full device: a genuine ENOSPC from the OS, not a constructed error.
      await actual.writeFile('/dev/full', data);
    }
    return actual.writeFile(path, data, options);
  };
  return { ...actual, writeFile, default: { ...actual, writeFile } };
});

const linuxHost: HostIndicators = {
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  libcVersion: '2.39',
  translated: false,
  wasm: { threads: false },
};

const packageName = '@taucad/t19-fixture';
const payloadBytes = new TextEncoder().encode('print("ready")\n');
const payloadUrl = 'https://registry.example/payloads/worker.py';
const payload: DependencyPayload = {
  name: 'worker.py',
  integrity: `sha256-${createHash('sha256').update(payloadBytes).digest('base64')}`,
  byteLength: payloadBytes.byteLength,
  format: 'raw',
  origin: { kind: 'url', urls: [payloadUrl] },
  destination: 'worker',
};

const pluginOf = (seal?: PreparationPlugin['seal']): PreparationPlugin => ({
  package: packageName,
  deployment: parsePluginDeployment({
    schemaVersion: 1,
    dependencies: {
      engine: [{ target: { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' }, payloads: [payload] }],
    },
    kernels: { gate: { requires: ['engine'], extensions: ['gate'] } },
  }),
  ...(seal === undefined ? {} : { seal }),
});

const urlOf = (url: string | URL | Request): string =>
  typeof url === 'string' ? url : 'href' in url ? url.href : url.url;

/** The one payload origin; every other URL is a 404, so nothing reaches the network. */
const registry = vi.fn(async (url: string | URL | Request): Promise<Response> => {
  const target = urlOf(url);
  return target === payloadUrl ? new Response(payloadBytes) : new Response(null, { status: 404 });
});

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

type Posted = Readonly<{ entries: ReadonlyArray<{ name: string; detail: Record<string, unknown> }> }>;

/** A signed-in CLI host whose API records everything. */
const reporterHarness = async (configDirectory: string) => {
  const api = vi.fn(async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const target = urlOf(url);
    if (target.endsWith('/v1/telemetry/policy')) {
      return json({ policy: 'on', maxAge: 900 });
    }
    if (target.endsWith('/v1/privacy')) {
      return json({ allowsAiTraining: false, allowsUsageMetrics: true });
    }
    return json({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' });
  });
  const telemetry = createNodeHostTelemetry({
    route: 'cli',
    release: '1.2.3',
    apiOrigin: 'https://api.test',
    configDir: configDirectory,
    env: {},
    cloudBuild: false,
    readIdentity: async () => ({ kind: 'signed-in', authorization: 'Bearer test-token', principalId: 'account-1' }),
    platform: 'linux',
    fetch: api as typeof globalThis.fetch,
  });
  telemetry.startIdentityBootstrap();
  await vi.waitFor(() => {
    expect(telemetry.ensureReporter()).toBeDefined();
    expect(api.mock.calls.some(([url]) => urlOf(url).endsWith('/v1/privacy'))).toBe(true);
  });
  const posted = (): Posted['entries'] =>
    api.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .flatMap(([, init]) => (JSON.parse(init?.body as string) as Posted).entries);
  /**
   * Flush once the policy probe a record starts has answered `on` (a shutdown before it drops the queue as
   * `policy-unknown`), and read the operation entries sent.
   */
  const flushed = async (): Promise<Posted['entries']> => {
    await new Promise<void>((resolve) => {
      telemetry.ensureReporter()?.onPolicy((policy) => {
        if (policy === 'on') {
          resolve();
        }
      });
    });
    await telemetry.shutdown();
    return posted().filter(({ name }) => name === 'runtime.operation');
  };
  return { telemetry, flushed };
};

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:t19',
    $uses: ['JSONSchemaUnits'],
    name: 'GateParameters',
    type: 'object',
    properties: { width: { type: 'double', ucumUnit: 'mm' } },
    required: ['width'],
  },
  defaults: { width: 10 },
} as const;

/** The runtime client behind the host's gate, with every span and every settled attempt it produces. */
const gatedClient = (telemetry: NodeHostTelemetry) => {
  const kernel = defineKernel({
    id: 'gate-kernel',
    extensions: ['gate'] as const,
    name: 'Gate kernel',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
    exports: { bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' } },
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return createKernelSuccess({ parameters });
    },
    async evaluate() {
      return { handle: {}, views: ['primary'] as const, exports: ['bom'] as const };
    },
    async render() {
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
    async export() {
      return {
        files: nonemptyExportFiles([{ name: 'bom.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('a') }]),
      };
    },
  })();
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime: defineRuntime({ kernels: [kernel] }), fileSystem: fromMemoryFs({}) }),
  });
  const spans: string[] = [];
  const settled: RuntimeOperationObservation[] = [];
  client.on('telemetry', (batch) => {
    spans.push(...batch.entries.map((entry) => entry.name));
  });
  client.on('operation', (observation) => settled.push(observation));
  const unobserve = telemetry.observe(client, 'host');
  /** What a host does once its gate admits: evaluate the model. */
  const dispatch = async (): Promise<void> => {
    const document = client.open({ source: { files: { 'model.gate': 'gate' } }, watch: false });
    try {
      await document.evaluation();
    } finally {
      document.close();
    }
  };
  const close = async (): Promise<void> => {
    unobserve();
    await client.shutdown();
  };
  return { spans, settled, dispatch, close };
};

let cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  exhausted.clear();
  registry.mockClear();
  for (const cleanup of cleanups.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- cleanups run in reverse order
    await cleanup();
  }
  cleanups = [];
});

const scenario = async (seal?: PreparationPlugin['seal']) => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-t19-'));
  cleanups.push(async () => rm(directory, { recursive: true, force: true }));
  const preparation: PreparationHost = createPreparationHost({
    plugins: [pluginOf(seal)],
    store: join(directory, 'store'),
    indicators: linuxHost,
    fetch: registry as typeof globalThis.fetch,
    tauVersion: '1.0.0',
  });
  cleanups.push(() => {
    preparation.dispose();
  });
  const settledPreparations: PluginPreparation[] = [];
  preparation.on('preparation', (event) => settledPreparations.push(event));
  const { telemetry, flushed } = await reporterHarness(join(directory, 'config'));
  const client = gatedClient(telemetry);
  cleanups.push(client.close);

  /**
   * The host's gate: prepare the kernel's closure, report a refusal with the host reporter and stop, or dispatch.
   *
   * @param offline - Whether the host may use the network.
   * @returns The outcome the gate saw.
   */
  const prepareThenDispatch = async (offline = false): Promise<PrepareOutcome | 'failed'> => {
    const started = performance.now();
    let outcome: PrepareOutcome | 'failed';
    try {
      outcome = await preparation.prepare({ package: packageName, offline, signal: AbortSignal.timeout(30_000) });
    } catch {
      outcome = 'failed';
    }
    const state = settledPreparations.at(-1)?.state;
    const entry =
      state === undefined ? undefined : preparationEntry(state, performance.now() - started, telemetry.context('host'));
    if (entry !== undefined) {
      telemetry.record(entry);
    }
    if (outcome !== 'failed' && outcome.status === 'ready') {
      await client.dispatch();
    }
    return outcome;
  };
  return { directory, telemetry, flushed, client, prepareThenDispatch };
};

/** The single prepare/admit entry the reporter sent, checked against the ingest contract. */
const onlyEntry = (entries: Posted['entries']): Posted['entries'][number] => {
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  expect(parseRuntimeEntry(entry as RuntimeOperationEntry)).toBeDefined();
  return entry!;
};

describe('T19: pre-dispatch refusal reaches the Node host reporter with no kernel span', () => {
  it('T19: should dispatch and trace when the closure is ready, so the span assertions below are not vacuous', async () => {
    const { client, flushed, prepareThenDispatch } = await scenario();

    await expect(prepareThenDispatch()).resolves.toMatchObject({ status: 'ready' });

    await vi.waitFor(() => {
      expect(client.spans).toEqual(expect.arrayContaining(['kernel.evaluate']));
      expect(client.settled.map(({ operation }) => operation)).toEqual(expect.arrayContaining(['evaluate']));
    });
    const entries = await flushed();
    expect(entries.map(({ detail }) => [detail['operation'], detail['outcome']])).toEqual(
      expect.arrayContaining([
        ['prepare', 'succeeded'],
        ['evaluate', 'succeeded'],
      ]),
    );
  });

  it('T19: should report an offline miss as a refused prepare with no request, span or attempt', async () => {
    const { client, flushed, prepareThenDispatch } = await scenario();

    await expect(prepareThenDispatch(true)).resolves.toMatchObject({ status: 'blocked', reason: 'offline-miss' });

    expect(registry).not.toHaveBeenCalled();
    const entry = onlyEntry(await flushed());
    expect(entry).toMatchObject({
      name: 'runtime.operation',
      detail: { operation: 'prepare', outcome: 'refused', code: 'offline-miss', route: 'cli', caller: 'host' },
    });
    expect(client.spans).toEqual([]);
    expect(client.settled).toEqual([]);
  });

  it('T19: should report a missing system library the seal step finds as a refused prepare with no span', async () => {
    const { client, flushed, prepareThenDispatch } = await scenario(async (input) => {
      const refusal = systemLibraryRefusal({
        package: input.package,
        output: 'libGL.so.1: cannot open shared object file: No such file or directory',
        attemptId: 'seal',
      });
      return refusal === undefined
        ? undefined
        : {
            reason: refusal.reason,
            message: refusal.message,
            ...(refusal.detail === undefined ? {} : { detail: refusal.detail }),
          };
    });

    await expect(prepareThenDispatch()).resolves.toMatchObject({
      status: 'blocked',
      reason: 'missing-system-library',
      detail: { library: 'libGL.so.1' },
    });

    const entry = onlyEntry(await flushed());
    expect(entry.detail).toMatchObject({ operation: 'prepare', outcome: 'refused', code: 'missing-system-library' });
    expect(JSON.stringify(entry)).not.toContain('libGL');
    expect(client.spans).toEqual([]);
    expect(client.settled).toEqual([]);
  });

  it('T19: should map an ENOSPC store write to STORE_EXHAUSTED, report it with no span, and recover once space returns', async () => {
    const { directory, client, flushed, prepareThenDispatch } = await scenario();
    exhausted.add('receipt.json');

    await expect(prepareThenDispatch()).resolves.toBe('failed');

    const entry = onlyEntry(await flushed());
    expect(entry.detail).toMatchObject({ operation: 'prepare', outcome: 'refused', code: 'STORE_EXHAUSTED' });
    expect(JSON.stringify(entry)).not.toContain(directory);
    expect(client.spans).toEqual([]);
    expect(client.settled).toEqual([]);
    // No staging survives the failed write, and the host is still usable once the volume has room.
    expect(await readdir(join(directory, 'store', 'tmp')).catch(() => [])).toEqual([]);
    exhausted.clear();
    await expect(prepareThenDispatch()).resolves.toMatchObject({ status: 'ready' });
    await vi.waitFor(() => {
      expect(client.spans).toEqual(expect.arrayContaining(['kernel.evaluate']));
    });
  });

  it.each([
    ['SESSION_REVOKED', 'a revoked session'],
    ['WORKSPACE_MISMATCH', 'another workspace'],
    ['ROUTE_DENIED', 'an operation it holds no grant for'],
  ] as const)('T19: should report admission refusal %s (%s) as a refused admit with no span', async (code, _why) => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-t19-'));
    cleanups.push(async () => rm(directory, { recursive: true, force: true }));
    const { telemetry, flushed } = await reporterHarness(join(directory, 'config'));
    const client = gatedClient(telemetry);
    cleanups.push(client.close);
    const authority = createHostAdmissionAuthority({ hostId: 'host-a' });
    const scope = { authorityId: 'authority-a', workspaceId: 'workspace-a' } as const;
    const session = authority.issueTrustedSession({
      actor: { kind: 'agent', id: 'agent-a' },
      ...scope,
      grants: [{ route: 'jobs', operation: 'jobs.submit' }],
    });
    if (code === 'SESSION_REVOKED') {
      authority.revoke(session);
    }
    const request = {
      session,
      ...scope,
      ...(code === 'WORKSPACE_MISMATCH' ? { workspaceId: 'workspace-b' } : {}),
      route: 'jobs',
      operation: code === 'ROUTE_DENIED' ? 'jobs.cancel' : 'jobs.submit',
    } as const;

    try {
      authority.admit(request);
      await client.dispatch();
    } catch (error) {
      if (!(error instanceof HostAdmissionRefusal)) {
        throw error;
      }
      telemetry.record(admissionEntry(error, telemetry.context('agent')));
    }

    const entry = onlyEntry(await flushed());
    expect(entry.detail).toMatchObject({ operation: 'admit', outcome: 'refused', code, caller: 'agent' });
    expect(JSON.stringify(entry)).not.toMatch(/agent-a|workspace-|authority-a|host-a/u);
    expect(client.spans).toEqual([]);
    expect(client.settled).toEqual([]);
  });
});
