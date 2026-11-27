/**
 * Root isolation (blueprint D1, WP1): Home is the one required root. Every other
 * configured root settles on its own, under a deadline, into a published
 * status, so no caller of `configureProjectRoots` fails on somebody else's
 * folder.
 *
 * The fixture is the neighbouring node-observation test's: a real node host
 * over temporary directories, with `NodeFsProvider.prototype.watch` standing in
 * for the native admission of whichever root a row needs to fail or hang.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import type { ProjectRootConfiguration, RootStatus } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { serveNodeFsProvider } from '#backend/node/host.js';
import { NodeFsProvider } from '#backend/node/provider.js';
import { tauPathPolicy } from '#path-registry.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';

const homeProjectId = 'proj_hhhhhhhhhhhhhhhhhhhhh';
const lostProjectId = 'proj_lllllllllllllllllllll';
const validProjectId = 'proj_vvvvvvvvvvvvvvvvvvvvv';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Each fixture owns its host and temporary roots.
    await cleanup();
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A temporary folder holding one project directory with a manifest and one file. */
const createRoot = (name: string, projectId?: string): string => {
  const root = mkdtempSync(join(tmpdir(), `tau-root-isolation-${name}-`));
  if (projectId !== undefined) {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, 'main.ts'), `${name} source`);
    writeFileSync(
      join(root, name, 'tau.json'),
      JSON.stringify({ $schema: 'https://tau.new/schemas/project.json', id: projectId, name }),
    );
  }
  cleanups.push(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
};

/** A node-backed authority whose host admits exactly the given folders. */
const createNodeService = (allowed: readonly string[]) => {
  const { port1, port2 } = new MessageChannel();
  const stopHost = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => allowed.includes(candidate),
  }).close;
  const providerRegistry = new ProviderRegistry({ createNodeFsPort: async () => port1 });
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable: new MountTable(),
  });
  cleanups.push(async () => {
    await service.close();
    await stopHost();
    port2.close();
  });
  return { service, providerRegistry };
};

const nodeKey = (path: string): string => `node:${path}`;

/**
 * Poll on real I/O turns while `setTimeout` is faked; `vi.waitFor` would
 * advance the fake clock and fire the deadline under test.
 */
const until = async (condition: () => boolean): Promise<void> => {
  for (let turn = 0; turn < 10_000 && !condition(); turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each turn yields to the host's message port.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  expect(condition()).toBe(true);
};

/** {@link until} for a condition only an asynchronous read can answer. */
const untilResolved = async (condition: () => Promise<boolean>): Promise<void> => {
  let met = false;
  for (let turn = 0; turn < 10_000 && !met; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each turn reads once, then yields to the host's message port.
    met = await condition();
    if (!met) {
      // oxlint-disable-next-line no-await-in-loop -- Each turn yields to the host's message port.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
  }
  expect(met).toBe(true);
};

/** Yield real I/O turns, so admissions and queued topology work run. */
const turns = async (count: number): Promise<void> => {
  for (let turn = 0; turn < count; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each turn yields to the host's message port.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

/** A gate a stubbed admission waits on until the row opens it. */
const admissionGate = () => {
  const gate = Promise.withResolvers<() => void>();
  cleanups.push(() => {
    gate.resolve(() => undefined);
  });
  return {
    open: (): void => {
      gate.resolve(() => undefined);
    },
    wait: async () => gate.promise,
  };
};

/** The host directory one node provider serves. */
const baseOf = (provider: NodeFsProvider): string => provider.root;

/**
 * Replace native admission for the named roots; every other root admits for real.
 *
 * @param behaviour - Per root: an error code to reject with, `'hang'`, or an admission that may call the native one.
 * @returns The spy and the roots whose admission was asked for, in call order.
 */
const stubAdmission = (
  behaviour: ReadonlyMap<string, string | 'hang' | ((admit: () => Promise<() => void>) => Promise<() => void>)>,
) => {
  const nativeWatch = NodeFsProvider.prototype.watch;
  const calls: string[] = [];
  const spy = vi
    .spyOn(NodeFsProvider.prototype, 'watch')
    .mockImplementation(async function (this: NodeFsProvider, request, handler) {
      const base = baseOf(this);
      calls.push(base);
      const outcome = behaviour.get(base);
      if (outcome === 'hang') {
        /* Released at teardown, so the host can close; never during the row. */
        const hung = Promise.withResolvers<() => void>();
        cleanups.push(() => {
          hung.resolve(() => undefined);
        });
        return hung.promise;
      }
      if (typeof outcome === 'function') {
        return outcome(async () => nativeWatch.call(this, request, handler));
      }
      if (typeof outcome === 'string') {
        throw Object.assign(new Error(`${outcome}: refused for ${base}`), { code: outcome });
      }
      return nativeWatch.call(this, request, handler);
    });
  return { spy, calls };
};

const nodeProject = (root: string, projectId: string, providerBasePath: string) =>
  ({ backend: 'node', path: root, projectId, providerBasePath }) as const;

describe('WorkspaceFileService root isolation', () => {
  it('should resolve with a notFound status and mount Home when another root is gone (T-B1.1)', async () => {
    const home = createRoot('home', homeProjectId);
    const lost = createRoot('lost', lostProjectId);
    stubAdmission(new Map([[lost, 'ENOENT']]));
    const { service } = createNodeService([home, lost]);

    const result = await service.configureProjectRoots({
      projects: [nodeProject(home, homeProjectId, 'home'), nodeProject(lost, lostProjectId, 'lost')],
      roots: [
        { backend: 'node', path: home },
        { backend: 'node', path: lost },
      ],
    });

    expect(result.roots).toEqual([
      { storageRootKey: nodeKey(home), backend: 'node', state: 'available' },
      { storageRootKey: nodeKey(lost), backend: 'node', state: 'notFound', code: 'ENOENT' },
    ]);
    await expect(service.readFile(`/projects/${homeProjectId}/main.ts`, 'utf8')).resolves.toBe('home source');
    expect(result.skipped).toContainEqual({
      kind: 'project',
      reason: 'root-unavailable',
      projectId: lostProjectId,
      storageRootKey: nodeKey(lost),
    });
    await expect(service.readFile(`/projects/${lostProjectId}/main.ts`, 'utf8')).rejects.toThrow();
  });

  it('should reject with HOME_ROOT_UNAVAILABLE only when Home itself cannot be admitted (T-B1.2)', async () => {
    const home = createRoot('home', homeProjectId);
    stubAdmission(new Map([[home, 'EIO']]));
    const { service } = createNodeService([home]);

    try {
      await service.configureProjectRoots({
        projects: [nodeProject(home, homeProjectId, 'home')],
        roots: [{ backend: 'node', path: home }],
      });
      expect.fail('a Home that cannot be admitted must reject the configuration');
    } catch (error) {
      expect((error as { code?: unknown }).code).toBe('HOME_ROOT_UNAVAILABLE');
      expect((error as Error).message).toContain('EIO');
    }
  });

  it('should map each admission error code to its root state (T-B2.1)', async () => {
    const home = createRoot('home');
    const codes = ['EACCES', 'EPERM', 'ENOTDIR', 'ETIMEDOUT', 'EIO', 'ESTALE', 'EHOSTDOWN', 'EWHATEVER'] as const;
    const roots = codes.map((code) => createRoot(code.toLowerCase()));
    stubAdmission(new Map(roots.map((root, index) => [root, codes[index]!])));
    const { service } = createNodeService([home, ...roots]);

    const result = await service.configureProjectRoots({
      projects: [],
      roots: [{ backend: 'node', path: home }, ...roots.map((path) => ({ backend: 'node', path }) as const)],
    });

    expect(result.roots.map(({ state, code }) => [state, code])).toEqual([
      ['available', undefined],
      ['permission', 'EACCES'],
      ['permission', 'EPERM'],
      ['notFound', 'ENOTDIR'],
      ['unreachable', 'ETIMEDOUT'],
      ['unreachable', 'EIO'],
      ['unreachable', 'ESTALE'],
      ['unreachable', 'EHOSTDOWN'],
      ['error', 'EWHATEVER'],
    ]);
  });

  it('should re-admit a lost root on recheckRoots, publish one event and mount its routes (T-B2.2)', async () => {
    const home = createRoot('home', homeProjectId);
    const lost = createRoot('lost', lostProjectId);
    const behaviour = new Map<string, string>([[lost, 'ENOENT']]);
    stubAdmission(behaviour);
    const { service } = createNodeService([home, lost]);
    const configuration: ProjectRootConfiguration = {
      projects: [nodeProject(home, homeProjectId, 'home'), nodeProject(lost, lostProjectId, 'lost')],
      roots: [
        { backend: 'node', path: home },
        { backend: 'node', path: lost },
      ],
    };
    await service.configureProjectRoots(configuration);
    const events: Array<readonly RootStatus[]> = [];
    service.onRootStatusChange((roots) => events.push(roots));

    behaviour.delete(lost);
    const statuses = await service.recheckRoots();

    expect(statuses.map(({ state }) => state)).toEqual(['available', 'available']);
    await expect(service.getRootStatuses()).resolves.toEqual(statuses);
    expect(events).toEqual([statuses]);
    await expect(service.readFile(`/projects/${lostProjectId}/main.ts`, 'utf8')).resolves.toBe('lost source');
  });

  it('should skip each invalid configuration entry and mount the valid one (T-B3.1)', async () => {
    const home = createRoot('home', homeProjectId);
    mkdirSync(join(home, 'valid'));
    writeFileSync(join(home, 'valid', 'main.ts'), 'valid source');
    const { service } = createNodeService([home]);

    const result = await service.configureProjectRoots({
      projects: [
        nodeProject(home, 'not-a-project-id', 'invalid'),
        nodeProject(home, homeProjectId, 'home'),
        nodeProject(home, homeProjectId, 'home-again'),
        nodeProject(home, 'proj_nnnnnnnnnnnnnnnnnnnnn', './valid/../valid'),
        nodeProject(home, validProjectId, 'valid'),
      ],
      checkouts: [
        {
          backend: 'node',
          path: home,
          projectId: homeProjectId,
          checkoutId: 'chk_one',
          providerBasePath: 'outside-checkouts',
        },
      ],
      roots: [{ backend: 'node', path: home }],
    });

    expect(result.roots).toEqual([{ storageRootKey: nodeKey(home), backend: 'node', state: 'available' }]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'project', reason: 'invalid-project-id', projectId: 'not-a-project-id' }),
        expect.objectContaining({ kind: 'project', reason: 'duplicate-route', projectId: homeProjectId }),
        expect.objectContaining({ kind: 'project', reason: 'non-canonical-path' }),
        expect.objectContaining({ kind: 'checkout', reason: 'checkout-rule' }),
      ]),
    );
    expect(result.skipped).toHaveLength(4);
    await expect(service.readFile(`/projects/${validProjectId}/main.ts`, 'utf8')).resolves.toBe('valid source');
    await expect(service.readFile(`/projects/${homeProjectId}/main.ts`, 'utf8')).resolves.toBe('home source');
  });

  it('should report a root that overlaps the authority as conflict and keep Home available (T-B4.1)', async () => {
    const home = createRoot('home');
    const overlapping = createRoot('overlap');
    stubAdmission(new Map([[overlapping, 'AUTHORITY_ROOT_OVERLAP']]));
    const { service } = createNodeService([home, overlapping]);

    const result = await service.configureProjectRoots({
      projects: [],
      roots: [
        { backend: 'node', path: home },
        { backend: 'node', path: overlapping },
      ],
    });

    expect(result.roots).toEqual([
      { storageRootKey: nodeKey(home), backend: 'node', state: 'available' },
      { storageRootKey: nodeKey(overlapping), backend: 'node', state: 'conflict', code: 'AUTHORITY_ROOT_OVERLAP' },
    ]);
  });

  it('should resolve at the root deadline, not hold the next configuration, and attach a late admission (T-B13.1)', async () => {
    const home = createRoot('home');
    const slow = createRoot('slow');
    const late = Promise.withResolvers<() => void>();
    const { calls } = stubAdmission(new Map([[slow, async () => late.promise]]));
    const { service } = createNodeService([home, slow]);
    const configuration: ProjectRootConfiguration = {
      projects: [],
      roots: [
        { backend: 'node', path: home },
        { backend: 'node', path: slow },
      ],
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let settled: Awaited<ReturnType<WorkspaceFileService['configureProjectRoots']>> | undefined;
    const track = async (): Promise<Awaited<ReturnType<WorkspaceFileService['configureProjectRoots']>>> => {
      settled = await service.configureProjectRoots(configuration);
      return settled;
    };
    const first = track();
    await until(() => calls.includes(slow));
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    const result = await first;
    expect(result.roots[1]).toEqual({
      storageRootKey: nodeKey(slow),
      backend: 'node',
      state: 'unreachable',
      code: 'ROOT_DEADLINE',
    });

    const second = await service.configureProjectRoots(configuration);
    expect(second.roots.map(({ state }) => state)).toEqual(['available', 'unreachable']);
    expect(calls.filter((base) => base === slow)).toHaveLength(1);

    const events: Array<readonly RootStatus[]> = [];
    service.onRootStatusChange((roots) => events.push(roots));
    late.resolve(() => undefined);
    await until(() => events.at(-1)?.[1]?.state === 'available');
    await expect(service.getRootStatuses()).resolves.toEqual(events.at(-1));
    expect(events.at(-1)?.map(({ state }) => state)).toEqual(['available', 'available']);
  });

  it('should keep at most two non-Home probes pending and never probe a pending root twice (T-B13.2)', async () => {
    const home = createRoot('home');
    const hung = Array.from({ length: 5 }, (_, index) => createRoot(`hung-${String(index)}`));
    const { calls } = stubAdmission(new Map(hung.map((root) => [root, 'hang'] as const)));
    const { service } = createNodeService([home, ...hung]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const configured = service.configureProjectRoots({
      projects: [],
      roots: [{ backend: 'node', path: home }, ...hung.map((path) => ({ backend: 'node', path }) as const)],
    });
    await until(() => calls.some((base) => base !== home));
    await vi.advanceTimersByTimeAsync(5000);
    const result = await configured;
    expect(result.roots.slice(1).map(({ state }) => state)).toEqual(Array.from({ length: 5 }, () => 'unreachable'));

    const firstRecheck = service.recheckRoots();
    await vi.advanceTimersByTimeAsync(5000);
    await firstRecheck;
    const secondRecheck = service.recheckRoots();
    await vi.advanceTimersByTimeAsync(5000);
    await secondRecheck;

    const probed = calls.filter((base) => base !== home);
    expect(probed).toHaveLength(2);
    expect(new Set(probed).size).toBe(probed.length);
  });

  it('should report notFound when an admitted root lost its watcher and is gone at the next configuration (T-B14.1)', async () => {
    const home = createRoot('home');
    const other = createRoot('other');
    const nativeWatch = NodeFsProvider.prototype.watch;
    let dropWatcher: (() => void) | undefined;
    let gone = false;
    vi.spyOn(NodeFsProvider.prototype, 'watch').mockImplementation(
      async function (this: NodeFsProvider, request, handler) {
        if (baseOf(this) === other) {
          if (gone) {
            throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
          }
          dropWatcher = () => {
            handler({ type: 'reset' });
          };
        }
        return nativeWatch.call(this, request, handler);
      },
    );
    const { service } = createNodeService([home, other]);
    const configuration: ProjectRootConfiguration = {
      projects: [],
      roots: [
        { backend: 'node', path: home },
        { backend: 'node', path: other },
      ],
    };
    const first = await service.configureProjectRoots(configuration);
    expect(first.roots[1]?.state).toBe('available');

    gone = true;
    dropWatcher?.();
    await vi.waitFor(async () => {
      expect(await service.pollExternalChanges()).toBe(false);
    });
    const second = await service.configureProjectRoots(configuration);

    expect(second.roots[1]).toEqual({
      storageRootKey: nodeKey(other),
      backend: 'node',
      state: 'notFound',
      code: 'ENOENT',
    });
  });

  it('should skip a web project whose provider cannot be created as provider-unavailable (T-B15.1)', async () => {
    vi.stubGlobal('FileSystemObserver', undefined);
    cleanups.push(() => {
      vi.unstubAllGlobals();
    });
    const home = createRoot('home', homeProjectId);
    const { service, providerRegistry } = createNodeService([home]);
    const workspaceId = 'wsp_web_root_unavailable';
    /* The mock implements the directory-handle members the provider reads, not the DOM interface's full surface. */
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- last resort: no typed factory for a DOM handle.
    const directoryHandle = createMockRootHandle() as unknown as FileSystemDirectoryHandle;
    const getProvider = providerRegistry.getProvider.bind(providerRegistry);
    vi.spyOn(providerRegistry, 'getProvider').mockImplementation(async (scope) => {
      if (scope.backend === 'webaccess') {
        throw Object.assign(new Error('The handle could not be opened.'), { name: 'NotAllowedError' });
      }
      return getProvider(scope);
    });

    const result = await service.configureProjectRoots({
      projects: [
        nodeProject(home, homeProjectId, 'home'),
        { backend: 'webaccess', workspaceId, projectId: lostProjectId, providerBasePath: 'web-project' },
      ],
      roots: [
        { backend: 'node', path: home },
        { backend: 'webaccess', workspaceId, directoryHandle },
      ],
    });

    expect(result.skipped).toContainEqual({
      kind: 'project',
      reason: 'provider-unavailable',
      projectId: lostProjectId,
      storageRootKey: `webaccess:${workspaceId}`,
    });
    await expect(service.readFile(`/projects/${homeProjectId}/main.ts`, 'utf8')).resolves.toBe('home source');
  });

  /* Review of #2384 (CodeRabbit): a route's provider was awaited before any admission deadline existed, so a root whose
   * provider never settles held Home's routes and the whole configuration. */
  it("should mount Home and settle at the deadline when another root's provider never resolves", async () => {
    const home = createRoot('home', homeProjectId);
    const hung = createRoot('hung', lostProjectId);
    const { service, providerRegistry } = createNodeService([home, hung]);
    const getProvider = providerRegistry.getProvider.bind(providerRegistry);
    vi.spyOn(providerRegistry, 'getProvider').mockImplementation(async (scope) =>
      providerRegistry.resolveStorageRootKey(scope) === nodeKey(hung)
        ? Promise.withResolvers<never>().promise
        : getProvider(scope),
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const outcome: { result?: Awaited<ReturnType<WorkspaceFileService['configureProjectRoots']>> } = {};
    const configure = async (): Promise<void> => {
      outcome.result = await service.configureProjectRoots({
        projects: [nodeProject(home, homeProjectId, 'home'), nodeProject(hung, lostProjectId, 'hung')],
        roots: [
          { backend: 'node', path: home },
          { backend: 'node', path: hung },
        ],
      });
    };
    const configured = configure();
    await turns(50);
    await vi.advanceTimersByTimeAsync(5000);
    await until(() => outcome.result !== undefined);
    await configured;
    vi.useRealTimers();

    expect(outcome.result?.roots[1]).toEqual({
      storageRootKey: nodeKey(hung),
      backend: 'node',
      state: 'unreachable',
      code: 'ROOT_DEADLINE',
    });
    expect(outcome.result?.skipped).toContainEqual({
      kind: 'project',
      reason: 'root-unavailable',
      projectId: lostProjectId,
      storageRootKey: nodeKey(hung),
    });
    await expect(service.readFile(`/projects/${homeProjectId}/main.ts`, 'utf8')).resolves.toBe('home source');
  });

  /* Review of #2384 (CodeRabbit): a provider failure excluded its route for good, so a root that admitted after the
   * failure read `available` while its project stayed unbound. */
  it('should mount the route of a root that admits after its provider failed once', async () => {
    const home = createRoot('home', homeProjectId);
    const flaky = createRoot('flaky', lostProjectId);
    const { service, providerRegistry } = createNodeService([home, flaky]);
    const getProvider = providerRegistry.getProvider.bind(providerRegistry);
    let refusals = 1;
    vi.spyOn(providerRegistry, 'getProvider').mockImplementation(async (scope) => {
      if (providerRegistry.resolveStorageRootKey(scope) === nodeKey(flaky) && refusals > 0) {
        refusals -= 1;
        throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
      }
      return getProvider(scope);
    });
    const configuration: ProjectRootConfiguration = {
      projects: [nodeProject(home, homeProjectId, 'home'), nodeProject(flaky, lostProjectId, 'flaky')],
      roots: [
        { backend: 'node', path: home },
        { backend: 'node', path: flaky },
      ],
    };

    await service.configureProjectRoots(configuration);
    const statuses = await service.recheckRoots();

    expect(statuses[1]?.state).toBe('available');
    await expect(service.readFile(`/projects/${lostProjectId}/main.ts`, 'utf8')).resolves.toBe('flaky source');
  });

  /* Review of #2384 (CodeRabbit): a late admission attached itself outside the topology queue, so it could mount the
   * previous configuration's provider over a route the configuration in flight had just replaced. */
  it("should attach a late admission after the configuration in flight, never over that configuration's routes", async () => {
    const home = createRoot('home', homeProjectId);
    const late = createRoot('late', lostProjectId);
    const replacement = createRoot('replacement', lostProjectId);
    const gate = admissionGate();
    /* A slow disk: the replacement admits for real, but only after far more I/O turns than the row ever counted.
     * Windows run 44027216143 admitted it after the deadline the row fired by hand, and its route stayed unbound. */
    const slowDisk = async (admit: () => Promise<() => void>): Promise<() => void> => {
      await turns(500);
      return admit();
    };
    const { calls } = stubAdmission(
      new Map([
        [late, gate.wait],
        [replacement, slowDisk],
      ]),
    );
    const { service, providerRegistry } = createNodeService([home, late, replacement]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const first = service.configureProjectRoots({
      projects: [nodeProject(home, homeProjectId, 'home'), nodeProject(late, lostProjectId, 'late')],
      roots: [
        { backend: 'node', path: home },
        { backend: 'node', path: late },
      ],
    });
    /* Only the late root's own deadline may fire: advance once its admission is pending. */
    await until(() => calls.includes(late));
    await vi.advanceTimersByTimeAsync(5000);
    const firstResult = await first;
    expect(firstResult.roots[1]?.state).toBe('unreachable');

    /* The next configuration moves the project to another root and holds on Home's provider for its checkout. */
    const getProvider = providerRegistry.getProvider.bind(providerRegistry);
    const held = Promise.withResolvers<void>();
    let homeCalls = 0;
    let holding = false;
    vi.spyOn(providerRegistry, 'getProvider').mockImplementation(async (scope) => {
      if (providerRegistry.resolveStorageRootKey(scope) === nodeKey(home)) {
        homeCalls += 1;
        if (homeCalls === 2) {
          holding = true;
          await held.promise;
        }
      }
      return getProvider(scope);
    });
    const second = service.configureProjectRoots({
      projects: [nodeProject(home, homeProjectId, 'home'), nodeProject(replacement, lostProjectId, 'replacement')],
      checkouts: [
        {
          backend: 'node',
          path: home,
          projectId: homeProjectId,
          checkoutId: 'chk_review',
          providerBasePath: '.tau/checkouts/review',
        },
      ],
      roots: [
        { backend: 'node', path: home },
        { backend: 'node', path: late },
        { backend: 'node', path: replacement },
      ],
    });
    await until(() => holding);
    gate.open();
    /* The late admission lands while the configuration in flight still holds the topology. */
    await untilResolved(async () => {
      const statuses = await service.getRootStatuses();
      return statuses.some(({ storageRootKey, state }) => storageRootKey === nodeKey(late) && state === 'available');
    });
    /* The attach that admission queued runs once this configuration settles; the row reads after it, not after a
     * count of turns. */
    const lateAttaches: Array<Promise<void>> = [];
    const attaching = service as unknown as { _attachLateRoots: () => Promise<void> };
    const attachLateRoots = attaching._attachLateRoots.bind(service);
    vi.spyOn(attaching, '_attachLateRoots').mockImplementation(async () => {
      const attach = attachLateRoots();
      lateAttaches.push(attach);
      return attach;
    });
    held.resolve();
    /* Every root of this configuration admits, however slowly: no deadline is fired by hand, so the slow
     * replacement settles on its own I/O. */
    const secondResult = await second;
    expect(secondResult.roots.map(({ state }) => state)).toEqual(['available', 'available', 'available']);
    await until(() => lateAttaches.length > 0);
    await Promise.all(lateAttaches);
    vi.useRealTimers();

    await expect(service.readFile(`/projects/${lostProjectId}/main.ts`, 'utf8')).resolves.toBe('replacement source');
  });

  /* Review of #2384 (CodeRabbit): a checkout id the path rules refuse threw out of staging and failed the call. */
  it('should skip a checkout whose id is not a valid path segment and keep the rest of the configuration', async () => {
    const home = createRoot('home', homeProjectId);
    const { service } = createNodeService([home]);

    const result = await service.configureProjectRoots({
      projects: [nodeProject(home, homeProjectId, 'home')],
      checkouts: [
        {
          backend: 'node',
          path: home,
          projectId: homeProjectId,
          checkoutId: 'chk_bad\u0000id',
          providerBasePath: '.tau/checkouts/bad',
        },
      ],
      roots: [{ backend: 'node', path: home }],
    });

    expect(result.skipped).toContainEqual({ kind: 'checkout', reason: 'checkout-rule' });
    await expect(service.readFile(`/projects/${homeProjectId}/main.ts`, 'utf8')).resolves.toBe('home source');
  });

  /* Review of #2384 (CodeRabbit): a probe queued behind the two probe slots admitted its root after the authority was
   * disposed, recreating a provider nothing would release. */
  it('should not admit a queued root once the authority is disposed', async () => {
    const home = createRoot('home');
    const first = createRoot('first');
    const second = createRoot('second');
    const queued = createRoot('queued');
    const firstGate = admissionGate();
    const secondGate = admissionGate();
    stubAdmission(
      new Map([
        [first, firstGate.wait],
        [second, secondGate.wait],
      ]),
    );
    const { service, providerRegistry } = createNodeService([home, first, second, queued]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const configured = service.configureProjectRoots({
      projects: [],
      roots: [home, first, second, queued].map((path) => ({ backend: 'node', path }) as const),
    });
    await turns(50);
    await vi.advanceTimersByTimeAsync(5000);
    await configured;
    vi.useRealTimers();
    const getProvider = vi.spyOn(providerRegistry, 'getProvider');

    service.dispose();
    firstGate.open();
    secondGate.open();
    await turns(200);

    expect(
      getProvider.mock.calls.some(([scope]) => providerRegistry.resolveStorageRootKey(scope) === nodeKey(queued)),
    ).toBe(false);
  });
});
