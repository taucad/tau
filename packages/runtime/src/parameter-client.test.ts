import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { contentDigest } from '@taucad/cache-core';
import { fileParameterEntrySchema } from '@taucad/types';
import { afterEach, describe, expect, it } from 'vitest';
import { createParameterClient } from '#parameter-client.js';
import type { ParameterResolveRequest } from '#parameter-client.js';
import { compileParameterManifest } from '#parameter/manifest.js';
import type { GetParametersResult } from '#types/runtime.types.js';
import type {
  ParameterSetApplyInput,
  ParameterSetApplyResult,
  ParameterSetAuthoritySnapshot,
  ParameterSetIdentity,
  ParameterSetMachineEvent,
  ParameterSetObserveInput,
  ParameterSetPlanInput,
  ParameterSetRequest,
  ParameterSetResolveInput,
  ParameterSetTarget,
} from '#parameter-set.machine.js';

const sandboxes: string[] = [];

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

const target = {
  authority: 'test',
  root: '/project',
  checkout: 'main',
  entry: 'main.ts',
} as const;
const identity: ParameterSetIdentity = {
  sourceRevision: 'source:1',
  manifestRevision: 'manifest:1',
  valueRevision: 'value:1',
  dependencyRevision: 'dependency:1',
};
const initial: ParameterSetAuthoritySnapshot = {
  identity,
  entry: fileParameterEntrySchema.parse({
    activeGroup: 'default',
    groups: { default: { values: { width: 10 } } },
    identity,
  }),
};

const request = (requestId: string, kind: 'native-value' | 'unit-value' = 'native-value'): ParameterSetRequest => ({
  requestId,
  draftGeneration: 1,
  fingerprint: `fingerprint:${requestId}`,
  expected: identity,
  pressure: 'final',
  operation:
    kind === 'native-value'
      ? {
          kind,
          group: 'default',
          parameterId: 'width',
          resource: 'urn:test',
          pointer: '/width',
          value: 25,
        }
      : {
          kind,
          group: 'default',
          parameterId: 'width',
          resource: 'urn:test',
          pointer: '/width',
          inputUnit: '[in_i]',
          value: '1',
        },
});

const committed = (operation: ParameterSetRequest, value = 25): ParameterSetAuthoritySnapshot => {
  const next = { ...identity, valueRevision: `value:${operation.requestId}` };
  return {
    identity: next,
    entry: fileParameterEntrySchema.parse({
      activeGroup: 'default',
      groups: { default: { values: { width: value } } },
      identity: next,
      lastOperation: {
        requestId: operation.requestId,
        fingerprint: operation.fingerprint,
        outcome: 'committed',
        ...next,
      },
    }),
  };
};

const runtimeManifest = async (mode: 'default' | 'declared-only' = 'default') =>
  compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
      },
      defaults: { width: 10 },
    },
    scope: { kind: 'source', authority: 'test', root: '', entry: 'main.ts' },
    source: {
      id: 'test',
      version: '1',
      revision: 'source:1',
      capability: 'json-structure',
    },
    dependency: contentDigest({ value: `sha256:${'1'.repeat(64)}` }),
    middleware: contentDigest({ value: `sha256:${'2'.repeat(64)}` }),
    resolution: { mode },
  });

type Harness = Readonly<{
  target?: ParameterSetTarget;
  apply?: (input: ParameterSetApplyInput) => Promise<ParameterSetApplyResult>;
  read?: () => Promise<ParameterSetAuthoritySnapshot>;
  flush?: () => Promise<void>;
  observe?: (input: ParameterSetObserveInput, emit: (event: ParameterSetMachineEvent) => void) => () => void;
  resolve?: (input: ParameterSetResolveInput, signal: AbortSignal) => Promise<ParameterSetAuthoritySnapshot>;
  manifest?: (input: ParameterResolveRequest) => Promise<GetParametersResult>;
}>;

const client = (overrides: Harness = {}) =>
  createParameterClient({
    target: overrides.target ?? target,
    initialRequestId: 'initial',
    resolveManifest: async (input) =>
      overrides.manifest?.(input) ?? {
        success: true,
        data: await runtimeManifest(input.resolution?.mode ?? 'default'),
        issues: [],
      },
    resolveParameterSet: async (input, signal) =>
      structuredClone(await (overrides.resolve?.(input, signal) ?? initial)),
    planParameterOperation: async ({ request: operation }: ParameterSetPlanInput) => ({
      status: 'ready',
      proposed: committed(operation, operation.operation.kind === 'unit-value' ? 25.4 : 25),
    }),
    applyParameterOperation: async (input) =>
      overrides.apply?.(input) ?? {
        status: 'applied',
        current: structuredClone(input.proposed),
      },
    readParameterSet: async () => structuredClone(await (overrides.read?.() ?? initial)),
    observeParameterSet: overrides.observe ?? (() => () => undefined),
    flushParameterSet: async () => overrides.flush?.(),
  });

const settlementOf = async (promise: Promise<unknown>): Promise<'resolved' | 'rejected'> => {
  try {
    await promise;
    return 'resolved';
  } catch {
    return 'rejected';
  }
};

describe('createParameterClient', () => {
  it('resolves default and declared-only manifests with the current authority snapshot', async () => {
    const facade = client();
    await expect(facade.resolve({ source: { path: 'main.ts' } })).resolves.toMatchObject({
      success: true,
      manifest: { identity: { resolution: { mode: 'default' } } },
      current: { identity },
    });
    await expect(
      facade.resolve({
        source: { path: 'main.ts' },
        resolution: { mode: 'declared-only' },
      }),
    ).resolves.toMatchObject({
      success: true,
      manifest: { identity: { resolution: { mode: 'declared-only' } } },
    });
    await facade.close({ requestId: 'close' });
  });

  it('rejects a superseded resolution while the newer resolution settles', async () => {
    const gate = Promise.withResolvers<void>();
    const facade = client({
      resolve: async () => {
        await gate.promise;
        return initial;
      },
    });
    const first = facade.resolve({ source: { path: 'first.ts' } });
    const firstSettlement = settlementOf(first);
    const second = facade.resolve({ source: { path: 'second.ts' } });

    await expect(firstSettlement).resolves.toBe('rejected');
    gate.resolve();
    await expect(second).resolves.toMatchObject({
      success: true,
      current: { identity },
    });
    await facade.close({ requestId: 'close' });
  });

  it('settles caller abort while authority resolution is pending', async () => {
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const controller = new AbortController();
    const facade = client({
      resolve: async (input) => {
        if (input.requestId.endsWith(':1')) {
          entered.resolve();
        }
        await gate.promise;
        return initial;
      },
    });
    const resolution = facade.resolve({
      source: { path: 'main.ts' },
      signal: controller.signal,
    });
    const settlement = settlementOf(resolution);
    await entered.promise;
    controller.abort();

    await expect(settlement).resolves.toBe('rejected');
    gate.resolve();
    await facade.close({ requestId: 'close' });
  });

  it('passes caller abort through manifest resolution without returning stale data', async () => {
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<AbortSignal>();
    const controller = new AbortController();
    const facade = client({
      manifest: async (input) => {
        entered.resolve(input.signal!);
        await gate.promise;
        return {
          success: true,
          data: await runtimeManifest(),
          issues: [],
        };
      },
    });
    const resolution = facade.resolve({
      source: { path: 'main.ts' },
      signal: controller.signal,
    });
    const settlement = settlementOf(resolution);
    const manifestSignal = await entered.promise;
    controller.abort();

    await expect(settlement).resolves.toBe('rejected');
    expect(manifestSignal.aborted).toBe(true);
    gate.resolve();
    await facade.close({ requestId: 'close' });
  });

  it('aborts and settles manifest resolution before awaited close completes', async () => {
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<AbortSignal>();
    const facade = client({
      manifest: async (input) => {
        entered.resolve(input.signal!);
        await gate.promise;
        return {
          success: true,
          data: await runtimeManifest(),
          issues: [],
        };
      },
    });
    const resolution = facade.resolve({ source: { path: 'main.ts' } });
    const settlement = settlementOf(resolution);
    const manifestSignal = await entered.promise;
    const closing = facade.close({ requestId: 'close' });

    await expect(settlement).resolves.toBe('rejected');
    expect(manifestSignal.aborted).toBe(true);
    await expect(closing).resolves.toMatchObject({ status: 'settled' });
    gate.resolve();
  });

  it.each(['native-value', 'unit-value'] as const)('correlates a supported %s operation', async (kind) => {
    const facade = client();
    await facade.resolve({ source: { path: 'main.ts' } });
    await expect(facade.submit(request(`request:${kind}`, kind))).resolves.toMatchObject({
      status: 'committed',
      requestId: `request:${kind}`,
      write: 'applied',
    });
    await facade.close({ requestId: 'close' });
  });

  it('settles duplicate delivery once and rejects an ID collision without losing the original', async () => {
    const gate = Promise.withResolvers<void>();
    const facade = client({
      apply: async (input) => {
        await gate.promise;
        return { status: 'applied', current: structuredClone(input.proposed) };
      },
    });
    await facade.resolve({ source: { path: 'main.ts' } });
    const original = request('duplicate');
    const first = facade.submit(original);
    const duplicate = facade.submit(structuredClone(original));
    const collision = facade.submit({ ...original, fingerprint: 'different' });
    await expect(collision).resolves.toMatchObject({
      status: 'rejected',
      code: 'REQUEST_ID_COLLISION',
    });
    gate.resolve();
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      expect.objectContaining({ status: 'committed', requestId: 'duplicate' }),
      expect.objectContaining({ status: 'committed', requestId: 'duplicate' }),
    ]);
    await facade.close({ requestId: 'close' });
  });

  it('reconciles a lost acknowledgement only from the durable receipt', async () => {
    const operation = request('lost-reply');
    const facade = client({
      apply: async () => {
        throw new Error('reply lost');
      },
      read: async () => committed(operation),
    });
    await facade.resolve({ source: { path: 'main.ts' } });
    await expect(facade.submit(operation)).resolves.toMatchObject({
      status: 'committed',
      requestId: 'lost-reply',
      write: 'reconciled',
    });
    await facade.close({ requestId: 'close' });
  });

  it('re-subscribes and refreshes authority after watch loss before resolving again', async () => {
    let emit: ((event: ParameterSetMachineEvent) => void) | undefined;
    const resolutions: ParameterSetResolveInput[] = [];
    const watchGenerations: number[] = [];
    const refreshedIdentity = { ...identity, valueRevision: 'value:watch' };
    const refreshedSnapshot: ParameterSetAuthoritySnapshot = {
      identity: refreshedIdentity,
      entry: fileParameterEntrySchema.parse({
        ...initial.entry,
        identity: refreshedIdentity,
      }),
    };
    const facade = client({
      resolve: async (input) => {
        resolutions.push(structuredClone(input));
        return input.requestId === 'initial:2' ? refreshedSnapshot : initial;
      },
      observe: (input, send) => {
        watchGenerations.push(input.generation);
        emit = send;
        return () => undefined;
      },
    });
    const first = await facade.resolve({ source: { path: 'main.ts' } });
    expect(first).toMatchObject({ current: { identity } });
    emit?.({
      type: 'watch.error',
      generation: watchGenerations.at(-1)!,
      code: 'WATCH_LOST',
      message: 'lost',
    });
    const refreshed = await facade.resolve({ source: { path: 'main.ts' } });

    expect(resolutions.at(-1)).toMatchObject({ requestId: 'initial:2' });
    expect(watchGenerations).toEqual([0, 1]);
    expect(refreshed).toMatchObject({
      success: true,
      current: { identity: refreshedIdentity },
    });
    await facade.close({ requestId: 'close' });
  });

  it('returns stale conflicts as business outcomes and reports settled or failed close identity', async () => {
    const facade = client({
      apply: async () => ({
        status: 'conflict',
        code: 'STALE_MANIFEST',
        current: committed(request('other')),
        conflicts: ['/width'],
      }),
    });
    await facade.resolve({ source: { path: 'main.ts' } });
    await expect(facade.submit(request('stale'))).resolves.toMatchObject({
      status: 'rejected',
      requestId: 'stale',
      code: 'STALE_MANIFEST',
    });
    await expect(facade.close({ requestId: 'close' })).resolves.toMatchObject({
      status: 'settled',
      identity: { valueRevision: 'value:other' },
    });

    const flushFailure = client({
      flush: async () => {
        throw new Error('flush failed');
      },
    });
    await flushFailure.resolve({ source: { path: 'main.ts' } });
    await expect(flushFailure.close({ requestId: 'close' })).resolves.toMatchObject({
      status: 'failed',
      code: 'FLUSH_FAILED',
      identity,
    });
  });

  it('reports forced disposal when the shared owner cannot start', async () => {
    const invalid = client({
      target: { authority: '', root: '/project', entry: 'main.ts' },
    });
    await expect(invalid.close({ requestId: 'close' })).resolves.toEqual({
      status: 'forced',
    });
  });

  it('uses the real Node checked authority so exactly one same-revision client commits', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-parameter-client-'));
    sandboxes.push(sandbox);
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    const path = '.tau/parameters/main.ts.json';
    mkdirSync(join(root, '.tau', 'parameters'), { recursive: true });
    mkdirSync(authorityRoot);
    const initialBytes = JSON.stringify(initial.entry);
    writeFileSync(join(root, path), initialBytes);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const channels = [new MessageChannel(), new MessageChannel()] as const;
    const stops = channels.map(({ port2 }) =>
      serveNodeFsProvider(toNodeFsPort(port2), {
        allowRoot: (candidate) => candidate === root,
        authority,
      }),
    );
    const providers = channels.map(({ port1 }) => {
      const channel = new NodeFsChannel(toNodeFsPort(port1));
      return { channel, provider: new NodeFsProviderClient(channel, root) };
    });
    const read = async (provider: NodeFsProviderClient): Promise<ParameterSetAuthoritySnapshot> => {
      const entry = fileParameterEntrySchema.parse(JSON.parse(await provider.readFile(path, 'utf8')));
      return { entry, identity: entry.identity! };
    };
    const create = (provider: NodeFsProviderClient) =>
      client({
        resolve: async () => read(provider),
        apply: async (input) => {
          const result = await provider.writeFileChecked({
            path,
            data: JSON.stringify(input.proposed.entry),
            preconditions: [{ path, expected: initialBytes }],
          });
          if (result.status === 'conflict') {
            const actual = result.conflicts.find((conflict) => conflict.path === path)?.actual;
            if (actual === null || actual === undefined) {
              throw new Error('Expected current conflict bytes.');
            }
            const entry = fileParameterEntrySchema.parse(JSON.parse(new TextDecoder().decode(actual)));
            return {
              status: 'conflict',
              code: 'STALE_MANIFEST',
              conflicts: [path],
              current: { entry, identity: entry.identity! },
            };
          }
          const entry = fileParameterEntrySchema.parse(JSON.parse(new TextDecoder().decode(result.content)));
          return {
            status: result.status,
            current: { entry, identity: entry.identity! },
          };
        },
      });
    const first = create(providers[0]!.provider);
    const second = create(providers[1]!.provider);
    await Promise.all([
      first.resolve({ source: { path: 'main.ts' } }),
      second.resolve({ source: { path: 'main.ts' } }),
    ]);
    const outcomes = await Promise.all([first.submit(request('client-a')), second.submit(request('client-b'))]);

    expect(outcomes.map(({ status }) => status).sort()).toEqual(['committed', 'rejected']);
    const stored = await read(providers[0]!.provider);
    expect(stored.entry.lastOperation?.requestId).toMatch(/^client-[ab]$/u);

    await Promise.all([first.close({ requestId: 'close-a' }), second.close({ requestId: 'close-b' })]);
    for (const { channel } of providers) {
      channel.close();
    }
    await Promise.all(stops.map(async (stop) => stop()));
    for (const { port2 } of channels) {
      port2.close();
    }
  });
});
