// T19 wiring: the production seams a Node host records pre-dispatch refusals through. `reportingPrepareKernel` and
// `preparationReporter` are what `tau mcp` and `tau serve` wrap `prepare_kernel` with; `onAdmissionRefusal` on the
// shared machine store is what `tau mcp --machines` hands `admissionRefusalReporter`. Each case runs the shipping Node
// host composition, and the admission cases the shipping machine host over a real store; only the API origin (`fetch`)
// is a test double.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HostAdmissionRefusal } from '@taucad/runtime/host';
import { parseRuntimeEntry } from '@taucad/telemetry';
import type { RuntimeOperationEntry } from '@taucad/telemetry/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { HostPrepareKernel } from '#agent-tools.js';
import { agentMachineFacet, openSharedMachineHost } from '#local-machines.js';
import type { AdmissionRefusalReport, SharedMachineHost } from '#local-machines.js';
import { defaultMachineProviders, machineAgentGrants } from '#machine-host.js';
import {
  admissionRefusalReporter,
  createNodeHostTelemetry,
  preparationReporter,
  reportingPrepareKernel,
} from '#telemetry.js';
import type { NodeHostTelemetry } from '#telemetry.js';

type Posted = Readonly<{ entries: ReadonlyArray<{ name: string; detail: Record<string, unknown> }> }>;

const urlOf = (url: string | URL | Request): string =>
  typeof url === 'string' ? url : 'href' in url ? url.href : url.url;

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

let cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- cleanups run in reverse order
    await cleanup();
  }
  cleanups = [];
});

const scratch = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-t19-wiring-'));
  cleanups.push(async () => rm(directory, { recursive: true, force: true }));
  return directory;
};

/**
 * A signed-in CLI host whose API records everything; `env` sets the device preference, `ingest` the ingest answer.
 */
const reporterHarness = async (
  options: Readonly<{ env?: Readonly<Record<string, string>>; ingest?: () => Response }> = {},
) => {
  const api = vi.fn(async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const target = urlOf(url);
    if (target.endsWith('/v1/telemetry/policy')) {
      return json({ policy: 'on', maxAge: 900 });
    }
    if (target.endsWith('/v1/privacy')) {
      return json({ allowsAiTraining: false, allowsUsageMetrics: true });
    }
    return options.ingest?.() ?? json({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' });
  });
  const telemetry = createNodeHostTelemetry({
    route: 'mcp',
    release: '1.2.3',
    apiOrigin: 'https://api.test',
    configDir: join(await scratch(), 'config'),
    env: options.env ?? {},
    cloudBuild: false,
    readIdentity: async () => ({ kind: 'signed-in', authorization: 'Bearer test-token', principalId: 'account-1' }),
    platform: 'linux',
    fetch: api as typeof globalThis.fetch,
  });
  telemetry.startIdentityBootstrap();
  await vi.waitFor(() => {
    expect(api.mock.calls.some(([url]) => urlOf(url).endsWith('/v1/privacy'))).toBe(true);
  });
  const posted = (): Posted['entries'] =>
    api.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .flatMap(([, init]) => (JSON.parse(init?.body as string) as Posted).entries);
  /** Flush once the policy probe a record starts has answered `on`, and read the operation entries sent. */
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
  return { api, telemetry, flushed, posted };
};

/** The single entry the reporter sent, checked against the ingest contract. */
const onlyEntry = (entries: Posted['entries']): Posted['entries'][number] => {
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  expect(parseRuntimeEntry(entry as RuntimeOperationEntry)).toBeDefined();
  return entry!;
};

const context = { signal: new AbortController().signal, onProgress: () => undefined };

/** A `prepare_kernel` that answers what a native preparation answers, with the kernel's name and a message. */
const answering =
  (answer: Awaited<ReturnType<HostPrepareKernel>>): HostPrepareKernel =>
  async () =>
    answer;

describe('T19: prepare_kernel records one prepare entry per settled preparation', () => {
  it.each([
    [
      'an offline miss',
      { status: 'blocked', kernel: 'build123d', reason: 'offline-miss', message: 'No network at /home/a/.tau' },
      { outcome: 'refused', code: 'offline-miss' },
    ],
    [
      'a missing system library',
      { status: 'blocked', kernel: 'build123d', reason: 'missing-system-library', message: 'libGL.so.1 missing' },
      { outcome: 'refused', code: 'missing-system-library' },
    ],
    [
      'an exhausted store',
      { status: 'failed', kernel: 'build123d', code: 'STORE_EXHAUSTED', message: 'ENOSPC at /home/a/.tau' },
      { outcome: 'refused', code: 'STORE_EXHAUSTED' },
    ],
    [
      'a cancelled preparation',
      { status: 'cancelled', kernel: 'build123d', message: 'Preparing build123d was cancelled' },
      { outcome: 'cancelled' },
    ],
  ] as const)('T19: should record %s as one prepare entry and answer as before', async (_why, answer, detail) => {
    const { telemetry, flushed } = await reporterHarness();

    await expect(
      reportingPrepareKernel(answering(answer), preparationReporter(telemetry))({ kernel: 'build123d' }, context),
    ).resolves.toEqual(answer);

    const entry = onlyEntry(await flushed());
    expect(entry).toMatchObject({
      name: 'runtime.operation',
      detail: { operation: 'prepare', ...detail, route: 'mcp', caller: 'host' },
    });
    expect(JSON.stringify(entry)).not.toMatch(/build123d|libGL|\/home\/a|ENOSPC/u);
  });

  it('T19: should record a ready kernel as prepare/succeeded', async () => {
    const { telemetry, flushed } = await reporterHarness();
    const ready = { status: 'ready', kernel: 'build123d', byteLength: 12 } as const;

    await expect(
      reportingPrepareKernel(answering(ready), preparationReporter(telemetry))({ kernel: 'build123d' }, context),
    ).resolves.toEqual(ready);

    expect(onlyEntry(await flushed()).detail).toMatchObject({ operation: 'prepare', outcome: 'succeeded' });
  });

  it('T19: should record a thrown failure as refused with its code and rethrow the same error', async () => {
    const { telemetry, flushed } = await reporterHarness();
    const thrown = Object.assign(new Error('Every mirror refused https://registry.example/a'), {
      code: 'DOWNLOAD_FAILED',
    });

    await expect(
      reportingPrepareKernel(async () => {
        throw thrown;
      }, preparationReporter(telemetry))({ kernel: 'nope' }, context),
    ).rejects.toBe(thrown);

    const entry = onlyEntry(await flushed());
    expect(entry.detail).toMatchObject({ operation: 'prepare', outcome: 'refused', code: 'DOWNLOAD_FAILED' });
    expect(JSON.stringify(entry)).not.toContain('registry.example');
  });

  it('T19: should record nothing when telemetry is off on this device', async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
    const { telemetry, posted, api } = await reporterHarness({ env: { TAU_TELEMETRY: 'off' } });
    const blocked = { status: 'blocked', kernel: 'build123d', reason: 'offline-miss', message: 'offline' } as const;

    await expect(
      reportingPrepareKernel(answering(blocked), preparationReporter(telemetry))({ kernel: 'build123d' }, context),
    ).resolves.toEqual(blocked);
    await telemetry.shutdown();

    expect(telemetry.ensureReporter()).toBeUndefined();
    expect(posted()).toEqual([]);
    expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toEqual([]);
  });

  it('T19: should answer the refusal unchanged when the reporter throws or the ingest fails', async () => {
    const blocked = { status: 'blocked', kernel: 'build123d', reason: 'offline-miss', message: 'offline' } as const;
    const throwing: Pick<NodeHostTelemetry, 'context' | 'record'> = {
      context: () => {
        throw new Error('context fault');
      },
      record: () => {
        throw new Error('record fault');
      },
    };
    await expect(
      reportingPrepareKernel(answering(blocked), preparationReporter(throwing))({ kernel: 'build123d' }, context),
    ).resolves.toEqual(blocked);
    const thrown = new Error('download failed');
    await expect(
      reportingPrepareKernel(async () => {
        throw thrown;
      }, preparationReporter(throwing))({ kernel: 'build123d' }, context),
    ).rejects.toBe(thrown);
    const faultyReport = (): void => {
      throw new Error('report fault');
    };
    await expect(
      reportingPrepareKernel(answering(blocked), faultyReport)({ kernel: 'build123d' }, context),
    ).resolves.toEqual(blocked);

    const { telemetry, posted } = await reporterHarness({ ingest: () => new Response(null, { status: 500 }) });
    await expect(
      reportingPrepareKernel(answering(blocked), preparationReporter(telemetry))({ kernel: 'build123d' }, context),
    ).resolves.toEqual(blocked);
    await telemetry.shutdown();
    /* The batch was attempted and refused by the API; the caller saw nothing of it. */
    expect(posted().map(({ detail }) => detail['code'])).toContain('offline-miss');
  });
});

describe('T19: the shared machine store records one admit entry per refused request', () => {
  let providers: Awaited<ReturnType<typeof defaultMachineProviders>> = [];

  beforeAll(async () => {
    const served = await defaultMachineProviders();
    providers = served.filter(({ id }) => id === 'bambu-simulator');
  });

  const openStore = async (onAdmissionRefusal: ((refusal: AdmissionRefusalReport) => void) | undefined) => {
    const shared = await openSharedMachineHost({
      providers,
      readArtifact: async () => {
        throw new Error('MACHINE_ARTIFACT_NOT_FOUND');
      },
      onWarning: () => undefined,
      actorId: 'person-a',
      storeRoot: join(await scratch(), 'machines'),
      onAdmissionRefusal,
    });
    if (shared === undefined) {
      throw new Error('The store is held elsewhere.');
    }
    cleanups.push(async () => shared.host.close());
    return shared;
  };

  /** An agent session the store issued and then revoked: its next admission is refused `SESSION_REVOKED`. */
  const revokedAgent = (shared: SharedMachineHost) => {
    const session = shared.host.issueSession({ actor: { kind: 'agent', id: 'agent-a' }, grants: machineAgentGrants });
    shared.admission.revoke(session);
    return session;
  };

  it("T19: should record an agent's call outside its grants as admit/refused ROUTE_DENIED, and refuse it as before", async () => {
    const { telemetry, flushed } = await reporterHarness();
    const shared = await openStore(admissionRefusalReporter(telemetry));
    const facet = agentMachineFacet(shared, 'agent-a');
    cleanups.push(() => {
      facet.close();
    });
    if (!facet.available) {
      throw new Error('The store was not served.');
    }

    await expect(facet.removeBinding({ machineId: 'machine-a' })).rejects.toThrow(/ROUTE_DENIED/u);
    /* An admitted call records no admission entry. */
    await expect(facet.listProviders({})).resolves.toHaveLength(1);

    const entry = onlyEntry(await flushed());
    expect(entry.detail).toMatchObject({
      operation: 'admit',
      outcome: 'refused',
      code: 'ROUTE_DENIED',
      caller: 'agent',
    });
    expect(JSON.stringify(entry)).not.toMatch(/agent-a|person-a|machine-a|machines/u);
  });

  it('T19: should record a revoked session as admit/refused SESSION_REVOKED', async () => {
    const { telemetry, flushed } = await reporterHarness();
    const shared = await openStore(admissionRefusalReporter(telemetry));

    expect(() => shared.host.admitRoute({ session: revokedAgent(shared) })).toThrow(
      new HostAdmissionRefusal('SESSION_REVOKED'),
    );

    expect(onlyEntry(await flushed()).detail).toMatchObject({
      operation: 'admit',
      outcome: 'refused',
      code: 'SESSION_REVOKED',
      caller: 'agent',
    });
  });

  it('T19: should record nothing when telemetry is off on this device', async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
    const { telemetry, posted } = await reporterHarness({ env: { DO_NOT_TRACK: '1' } });
    const shared = await openStore(admissionRefusalReporter(telemetry));

    expect(() => shared.host.admitRoute({ session: revokedAgent(shared) })).toThrow(HostAdmissionRefusal);
    await telemetry.shutdown();

    expect(posted()).toEqual([]);
  });

  it('T19: should refuse with the same code when the refusal listener throws', async () => {
    const listener = vi.fn(() => {
      throw new Error('listener fault');
    });
    const shared = await openStore(listener);

    expect(() => shared.host.admitRoute({ session: revokedAgent(shared) })).toThrow(
      new HostAdmissionRefusal('SESSION_REVOKED'),
    );
    expect(listener).toHaveBeenCalledExactlyOnceWith({ code: 'SESSION_REVOKED', actor: 'agent' });
  });
});
