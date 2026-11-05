/**
 * One filesystem authority, as the file-manager worker composes it, with the
 * scenario runners that drive it on real OPFS.
 *
 * Each runner drives the production code path its scenario names (the table's
 * `model` column): the revisions package's own `createApplyTreeEffects` for an
 * apply, agent-tools' `createProviderRpcFileSystem` under the chat RPC handlers
 * for an agent turn, grep and glob, and the production `WorkspaceFileService`
 * and `OPFSProvider` beneath both. What the harness supplies is only what the
 * revision actors would (the checkout fence, its capture memo, sibling names);
 * the counts come from `counters.ts` and the production `workerTimings`.
 *
 * @module
 */
import {
  ChangeEventBus,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
  workerTimings,
} from '@taucad/filesystem';
import type { RootedFileSystem } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { handleGlobSearch, handleGrep } from '@taucad/chat/rpc';
import type { RpcFileSystem } from '@taucad/chat/rpc';
import { createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
import { createApplyTreeEffects, sweepTemporarySiblings } from '@taucad/revisions/apply-tree';
import { captureRevisionTree, createCaptureMemo, ImmutableRevisionTree } from '@taucad/revisions/algorithms';
import type { Checkout } from '@taucad/revisions';
import { projectToManifest, serializeProjectManifest } from '@taucad/project-core';
import { randomUuid } from '@taucad/utils/id';
import { installScenarioCounters } from '#filesystem-scenarios/counters.js';
import { checkoutBytes, fixtureBytes, fixtureMarker, planFixture } from '#filesystem-scenarios/fixture.js';
import type { FixtureEntry, FixturePlan } from '#filesystem-scenarios/fixture.js';
import { scenarioCrashPoint, scenarioWorkerReady } from '#filesystem-scenarios/protocol.js';
import type {
  ProbeReport,
  RunnerName,
  ScenarioProject,
  WorkerCommand,
  WorkerMeasurement,
  WorkerRequest,
  WorkerResponse,
} from '#filesystem-scenarios/protocol.js';

const counters = installScenarioCounters();
const eventBus = new ChangeEventBus();
let busEvents = 0;
eventBus.subscribe(() => {
  busEvents += 1;
});
/* Cross-tab invalidations this authority receives, on the channel the coordinator uses. */
let invalidationsReceived = 0;
const invalidations = new BroadcastChannel('tau-fs-changes');
invalidations.addEventListener('message', () => {
  invalidationsReceived += 1;
});

const service = new WorkspaceFileService({
  providerRegistry: new ProviderRegistry({ databasePrefix: self.name || 'filesystem-scenarios' }),
  mountTable: new MountTable(),
  resourceQueue: new ResourceQueue({ timings: workerTimings }),
  eventBus,
  policy: tauPathPolicy,
});
const projects = new Map<string, ScenarioProject>();
let plan: FixturePlan | undefined;

const fixturePlan = (): FixturePlan => {
  if (plan === undefined) {
    throw new Error('The worker has no fixture; send `open` first.');
  }
  return plan;
};

const configure = async (): Promise<void> => {
  await service.configureProjectRoots({
    projects: [...projects.values()].map((project) => ({ ...project, backend: 'opfs' })),
    roots: [],
  });
};

const rootedFor = (projectId: string): RootedFileSystem => service.createRootedFileSystem(`/projects/${projectId}`);

const quiet = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/** Wait until no bus event has arrived for `milliseconds`, so late deliveries land in the window. */
const settle = async (milliseconds = 150): Promise<void> => {
  let seen = -1;
  while (seen !== busEvents) {
    seen = busEvents;
    // oxlint-disable-next-line no-await-in-loop -- polling for quiet is sequential by definition.
    await quiet(milliseconds);
  }
};

/**
 * Measure one runner body: reset the counters, time it, read the counts and spans.
 *
 * @param body - The runner; resolves with its extra figures once durable.
 * @returns The measurement.
 */
/** A fixed reading from the worker's start, so two cumulative counter readings subtract exactly. */
const timingsOrigin = workerTimings.now();
const productionCounterTotals = (): Readonly<Record<string, number>> =>
  Object.fromEntries(
    Object.entries(workerTimings.summarize(timingsOrigin).counters).map(([name, summary]) => [name, summary.total]),
  );

const measure = async (body: () => Promise<Readonly<Record<string, number>> | void>): Promise<WorkerMeasurement> => {
  await settle(50);
  counters.reset();
  busEvents = 0;
  const spanStart = workerTimings.now();
  const countersBefore = productionCounterTotals();
  const startedAt = performance.now();
  const extra = (await body()) ?? {};
  const duration = performance.now() - startedAt;
  await settle();
  const countersAfter = productionCounterTotals();
  const productionCounters = Object.fromEntries(
    Object.entries(countersAfter).map(([name, total]) => [name, total - (countersBefore[name] ?? 0)]),
  );
  return {
    duration,
    counts: counters.read(),
    busEvents,
    spans: workerTimings.summarize(spanStart),
    productionCounters,
    extra,
  };
};

const textEncoder = new TextEncoder();
const percentile = (values: readonly number[], fraction: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
};

/**
 * One checkout's apply, through the revisions package's own `applyTree`.
 *
 * The seams are the ones `createRevisionActors` passes (`revision-effects.ts`):
 * the rooted view as the checkout filesystem, the same `tau-<role>` sibling
 * names, a capture built from the same production algorithms
 * (`statTree` + `createCaptureMemo` + `captureRevisionTree`, minus the head
 * mode basis and case-collision check an empty target never needs), and a
 * fence that is uncontended because nothing else applies to this checkout.
 *
 * @param live - The checkout's rooted view.
 * @param projectId - Its project.
 * @returns `materialize(entries)`, which writes the tree over an empty checkout.
 */
const checkoutMaterializer = (live: RootedFileSystem, projectId: string) => {
  const memo = createCaptureMemo();
  const exclude = (path: string): boolean => !tauPathPolicy.classify(path).versioned;
  const capture = async (_place: Checkout, modeBasis?: ImmutableRevisionTree): Promise<ImmutableRevisionTree> => {
    const observedAt = Date.now();
    const memoOptions = memo.unchanged(await live.statTree?.('', { admits: (path) => !exclude(path) }), observedAt);
    return captureRevisionTree(live, {
      exclude,
      inheritedMode: (path) => modeBasis?.mode(path),
      ...memoOptions,
    });
  };
  const { materializeTree } = createApplyTreeEffects({
    useFileSystem: async (_place, operation) => operation(live),
    capture,
    onApplyingTree: undefined,
    policy: tauPathPolicy,
    withCheckoutFence: async (_checkoutId, operation) => operation(),
    /* Read only when an apply fails and must restore the prior tree. */
    checkoutTreeId: async (_checkoutId, tree) =>
      tree
        .entries()
        .map((entry) => `${entry.path}:${String(entry.content.byteLength)}:${entry.mode}`)
        .join('\n'),
    temporarySibling: (path, role) => {
      const separator = path.lastIndexOf('/');
      return `${path.slice(0, separator + 1)}.${path.slice(separator + 1)}.tau-${role}.${randomUuid()}.tmp`;
    },
    unlinkIfPresent: async (filesystem, path) => {
      try {
        await filesystem.unlink(path);
      } catch (error) {
        if ((error as { code?: unknown }).code !== 'ENOENT') {
          throw error;
        }
      }
    },
  });
  const place: Checkout = {
    id: `checkout-${projectId}`,
    projectId,
    root: `/projects/${projectId}`,
    kind: 'live',
    branch: 'main',
    baseRevisionId: undefined,
  };
  return async (target: ImmutableRevisionTree, before: ImmutableRevisionTree): Promise<number> => {
    const { paths } = await materializeTree(place, target, { before });
    return paths.length;
  };
};

/** {@link checkoutMaterializer} over an empty checkout, writing the fixture's tree. */
const checkoutApply = (live: RootedFileSystem, projectId: string) => {
  const materialize = checkoutMaterializer(live, projectId);
  return async (entries: readonly FixtureEntry[]): Promise<number> =>
    materialize(
      new ImmutableRevisionTree(entries.map((entry) => [entry.path, checkoutBytes(entry), '100644'])),
      new ImmutableRevisionTree([]),
    );
};

/* The I1 replacement probe: a tree of files the apply replaces, each version recognisable. */
const replaceFiles = 48;
const replaceFileBytes = 256 * 1024;
const replacePath = (index: number): string => `replace/file-${String(index).padStart(3, '0')}.txt`;
const replaceBytes = (index: number, version: 'old' | 'new'): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(replaceFileBytes).fill(version === 'old' ? 0x6f : 0x6e);
  bytes.set(textEncoder.encode(`${replacePath(index)} ${version}\n`));
  return bytes;
};
const replaceTree = (version: 'old' | 'new'): ImmutableRevisionTree =>
  new ImmutableRevisionTree(
    Array.from({ length: replaceFiles }, (_, index) => [replacePath(index), replaceBytes(index, version), '100644']),
  );
const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

/**
 * Files left in the OPFS staging directory (the provider's `opfsStagingDirectory`)
 * after this realm's open swept the owners that are gone.
 *
 * @returns How many staged files remain, in every owner's directory.
 */
const stagedFiles = async (): Promise<number> => {
  const root = await navigator.storage.getDirectory();
  let staging: FileSystemDirectoryHandle;
  try {
    staging = await root.getDirectoryHandle('.tau-staging');
  } catch {
    return 0;
  }
  type Listable = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
  let count = 0;
  for await (const owner of (staging as Listable).values()) {
    if (owner.kind === 'directory') {
      for await (const _file of (owner as Listable).values()) {
        count += 1;
      }
    }
  }
  return count;
};

const assertMaterialized = async (live: RootedFileSystem, entries: readonly FixtureEntry[]): Promise<void> => {
  const samples = [entries[0], entries[Math.floor(entries.length / 2)], entries.at(-1)];
  for (const entry of samples) {
    // oxlint-disable-next-line no-await-in-loop -- three spot checks.
    if (entry !== undefined && !(await live.exists(entry.path))) {
      throw new Error(`The apply left ${entry.path} unwritten.`);
    }
  }
};

const saveText = (size: number, salt: number): Uint8Array<ArrayBuffer> => {
  const line = textEncoder.encode(`export const saved${String(salt)} = 'edit';\n`);
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += line.length) {
    bytes.set(line.subarray(0, size - offset), offset);
  }
  return bytes;
};

/** What the agent's view served during one scenario, by kind. */
type AgentTally = { readdirCalls: number; reads: number; binaryBytesRead: number; textBytesRead: number };

/**
 * The agent's RPC filesystem exactly as a host builds it: agent-tools'
 * `createProviderRpcFileSystem` over an agent-masked composed view of the
 * project. The view is wrapped only to tally what it served.
 *
 * @param live - The project's rooted view.
 * @param tally - Receives each listing and read.
 * @returns The RPC filesystem the chat handlers consume.
 */
const agentFileSystem = (live: RootedFileSystem, tally: AgentTally): RpcFileSystem => {
  const kinds = new Map(fixturePlan().entries.map((entry) => [entry.path, entry.kind]));
  const view = composeView({ filesystem: live }, { consumer: 'agent', policy: tauPathPolicy });
  const counted = new Proxy(view, {
    get: (target, property, receiver) => {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property === 'readdirWithStats' && typeof value === 'function') {
        return async (...parameters: unknown[]) => {
          tally.readdirCalls += 1;
          return (value as (...values: unknown[]) => Promise<unknown>).apply(target, parameters);
        };
      }
      if (property === 'readFile' && typeof value === 'function') {
        return async (path: string, ...rest: unknown[]) => {
          const bytes = await (value as (...values: unknown[]) => Promise<Uint8Array<ArrayBuffer>>).apply(target, [
            path,
            ...rest,
          ]);
          tally.reads += 1;
          if (kinds.get(path) === 'binary') {
            tally.binaryBytesRead += bytes.byteLength;
          } else {
            tally.textBytesRead += bytes.byteLength;
          }
          return bytes;
        };
      }
      return typeof value === 'function' ? (value as (...values: unknown[]) => unknown).bind(target) : value;
    },
  }) satisfies ComposedView;
  return createProviderRpcFileSystem({ provider: counted, mutations: new ResourceQueue({ timings: workerTimings }) });
};

const grepAndGlob = async (
  live: RootedFileSystem,
): Promise<
  Readonly<{
    grepDuration: number;
    globDuration: number;
    binaryBytesRead: number;
    textBytesRead: number;
    walkCalls: number;
    authorityReads: number;
  }>
> => {
  const tally: AgentTally = { readdirCalls: 0, reads: 0, binaryBytesRead: 0, textBytesRead: 0 };
  const fileSystem = agentFileSystem(live, tally);
  const grepStart = performance.now();
  const grep = await handleGrep({ pattern: fixtureMarker, path: '' }, fileSystem);
  const grepDuration = performance.now() - grepStart;
  if (!grep.success) {
    throw new Error(`grep failed: ${JSON.stringify(grep)}`);
  }
  const globStart = performance.now();
  const glob = await handleGlobSearch({ pattern: '**/*.ts' }, fileSystem);
  const globDuration = performance.now() - globStart;
  if (!glob.success) {
    throw new Error(`glob failed: ${JSON.stringify(glob)}`);
  }
  return {
    grepDuration,
    globDuration,
    binaryBytesRead: tally.binaryBytesRead,
    textBytesRead: tally.textBytesRead,
    walkCalls: tally.readdirCalls,
    authorityReads: tally.reads,
  };
};

let probe:
  | { stop: () => void; done: Promise<void>; latencies: number[]; reads: number; invalidations: number; events: number }
  | undefined;

const startProbe = (projectId: string, readInterval: number): void => {
  const live = rootedFor(projectId);
  const target = fixturePlan().entries.find((entry) => entry.kind === 'text' && entry.path !== '.gitattributes');
  if (target === undefined) {
    throw new Error('The fixture has no text file to probe.');
  }
  const stopping = new AbortController();
  const state = {
    latencies: [] as number[],
    reads: 0,
    invalidations: invalidationsReceived,
    events: busEvents,
    stop: () => {
      stopping.abort();
    },
    done: Promise.resolve(),
  };
  const loop = async (): Promise<void> => {
    while (!stopping.signal.aborted) {
      const startedAt = performance.now();
      try {
        // oxlint-disable-next-line no-await-in-loop -- one read at a time, as a viewer reads.
        await live.stat(target.path);
        // oxlint-disable-next-line no-await-in-loop -- one read at a time, as a viewer reads.
        await live.readFile(target.path);
        state.reads += 1;
        state.latencies.push(performance.now() - startedAt);
      } catch {
        /* The file appears once the apply publishes it; until then the probe only times refusals. */
        state.latencies.push(performance.now() - startedAt);
      }
      // oxlint-disable-next-line no-await-in-loop -- the probe's cadence.
      await quiet(readInterval);
    }
  };
  state.done = loop();
  probe = state;
};

const stopProbe = async (): Promise<ProbeReport> => {
  if (probe === undefined) {
    throw new Error('No probe is running.');
  }
  const running = probe;
  running.stop();
  await running.done;
  await settle();
  probe = undefined;
  return {
    reads: running.reads,
    latencies: running.latencies,
    invalidationsReceived: invalidationsReceived - running.invalidations,
    busEvents: busEvents - running.events,
  };
};

const run = async (runner: RunnerName, projectId: string, parameters: Readonly<Record<string, number>>) => {
  const live = rootedFor(projectId);
  const { entries } = fixturePlan();
  const saveSize = parameters['saveBytes'] ?? 1024 * 1024;
  switch (runner) {
    case 'materialize': {
      const materialize = checkoutApply(live, projectId);
      const measured = await measure(async () => ({ files: await materialize(entries) }));
      await assertMaterialized(live, entries);
      return measured;
    }
    case 'materialize-with-save': {
      /* S17: a person's save to a path the apply never touches, issued once the apply is writing. */
      const savePath = 'notes/s17-save.ts';
      const materialize = checkoutApply(live, projectId);
      counters.trace(['s17-save.ts']);
      const measured = await measure(async () => {
        /* An object, so the loop below sees the apply's completion flip it. */
        const progress = { applied: false };
        const applying = materialize(entries).finally(() => {
          progress.applied = true;
        });
        /* Issue the save once the apply is writing, and while it still is. */
        const deadline = performance.now() + 60_000;
        while (counters.read().bytesWritten === 0 && !progress.applied) {
          if (performance.now() > deadline) {
            throw new Error('The apply wrote nothing within a minute.');
          }
          // oxlint-disable-next-line no-await-in-loop -- wait for the apply's first byte.
          await quiet(2);
        }
        const issuedDuringApply = progress.applied ? 0 : 1;
        const atCall = counters.read();
        const operationsAtCall = atCall.writes + atCall.renames;
        const saveStart = performance.now();
        await live.writeFile(savePath, saveText(saveSize, 17));
        const saveEnd = performance.now();
        await applying;
        const firstWrite = counters.traced().find((write) => write.name === 's17-save.ts');
        /* When the save's whole lock set was held. */
        const ownLock = counters.tracedLocks().find((grant) => grant.name === 's17-save.ts');
        return {
          saveLatency: saveEnd - saveStart,
          saveStartDelay: firstWrite === undefined ? saveEnd - saveStart : firstWrite.startedAt - saveStart,
          saveIssuedDuringApply: issuedDuringApply,
          /* Apply writes and renames that completed while the save acquired its lock set: a
           * save that waited on a token the apply holds exclusively would count the rest of a changeset. */
          applyOperationsBeforeSave: ownLock === undefined ? Number.NaN : ownLock.operationsBefore - operationsAtCall,
          saveLockWait: ownLock === undefined ? Number.NaN : ownLock.startedAt - saveStart,
          /* Reported, not gated: what completed before the save's first byte, which OPFS contention also moves. */
          applyOperationsBeforeSaveByte:
            firstWrite === undefined ? Number.NaN : firstWrite.operationsBefore - operationsAtCall,
        };
      });
      counters.trace([]);
      await assertMaterialized(live, entries);
      return measured;
    }
    case 'warm-open': {
      /* S5 on a fresh authority: one tree listing as the file tree asks for it,
       * then one exact stat per file — the per-file metadata compare a status
       * check makes at HEAD. */
      return measure(async () => {
        let metadataRequests = 0;
        const listing = await live.statTree?.('');
        metadataRequests += 1;
        const files = entries.length;
        for (const entry of entries) {
          // oxlint-disable-next-line no-await-in-loop -- the compare stats each entry in order.
          await live.stat(entry.path);
          metadataRequests += 1;
        }
        return { listed: listing?.length ?? 0, files, metadataRequests };
      });
    }
    case 'import': {
      /* S6's durable step: commit the import's whole payload as a pending project directory. */
      const project = projects.get(projectId);
      if (project === undefined) {
        throw new Error(`Unknown project ${projectId}.`);
      }
      const files = Object.fromEntries(entries.map((entry) => [entry.path, { content: fixtureBytes(entry) }]));
      const manifest = serializeProjectManifest(
        projectToManifest({
          name: 'Scenario import',
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        }),
      );
      projects.delete(projectId);
      await configure();
      const payloadBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
      const measured = await measure(async () => {
        const result = await service.commitPendingProjectDirectory({
          projectId,
          providerBasePath: project.providerBasePath,
          scope: { backend: 'opfs' },
          files,
          manifest,
        });
        if (result.status !== 'committed') {
          throw new Error(`Import commit returned ${result.status}.`);
        }
        return { payloadBytes };
      });
      projects.set(projectId, project);
      await configure();
      return measured;
    }
    case 'save': {
      const savePath = 'src/s7-save.ts';
      await live.writeFile(savePath, saveText(saveSize, 0));
      await settle();
      return measure(async () => {
        await live.writeFile(savePath, saveText(saveSize, 7));
        return { savedBytes: saveSize };
      });
    }
    case 'agent-write': {
      /* One agent turn: the model's fifty parallel write calls, dispatched
       * together through the host's RPC filesystem as one task issues them. */
      let deliveries = 0;
      const stop = live.watch({ paths: [''], recursive: true }, () => {
        deliveries += 1;
      });
      const turn = randomUuid().slice(0, 8);
      const tally: AgentTally = { readdirCalls: 0, reads: 0, binaryBytesRead: 0, textBytesRead: 0 };
      const fileSystem = agentFileSystem(live, tally);
      const text = new TextDecoder();
      try {
        const measured = await measure(async () => {
          await Promise.all(
            Array.from({ length: 50 }, async (_, index) =>
              fileSystem.writeFile(`agent/${turn}/file-${String(index)}.ts`, text.decode(saveText(2048, index))),
            ),
          );
          return {};
        });
        await quiet(300);
        return { ...measured, extra: { ...measured.extra, watchDeliveries: deliveries } };
      } finally {
        stop();
      }
    }
    case 'grep-glob': {
      return measure(async () => grepAndGlob(live));
    }
    case 'grep-with-save-and-reads': {
      return measure(async () => {
        startProbe(projectId, 20);
        const grepping = grepAndGlob(live);
        await quiet(parameters['saveDelay'] ?? 20);
        const saveStart = performance.now();
        await live.writeFile('src/s19-save.ts', saveText(saveSize, 19));
        const saveLatency = performance.now() - saveStart;
        const grep = await grepping;
        const reads = await stopProbe();
        return {
          grepDuration: grep.grepDuration,
          authorityReads: grep.authorityReads,
          saveLatency,
          readP95: percentile(reads.latencies, 0.95),
          reads: reads.reads,
        };
      });
    }
    case 'replace-seed': {
      /* I1: the old tree the killable apply replaces. */
      return measure(async () => ({
        files: await checkoutMaterializer(live, projectId)(replaceTree('old'), new ImmutableRevisionTree([])),
      }));
    }
    case 'replace-killable': {
      /* I1: replace every file through stage + move aside + publish, and say when
       * `killAfter` mutations have completed so the page can kill this worker there.
       * With no `killAfter` it runs to the end and reports how many there were.
       * With `create` set it writes the new tree over an empty checkout instead:
       * the create changesets alone. */
      const killAfter = parameters['killAfter'] ?? Number.POSITIVE_INFINITY;
      const from = parameters['create'] === 1 ? new ImmutableRevisionTree([]) : replaceTree('old');
      const materialize = checkoutMaterializer(live, projectId);
      const operations = (): number => {
        const counts = counters.read();
        return counts.writes + counts.renames + counts.removes;
      };
      return measure(async () => {
        const start = operations();
        const progress = { done: false, signalled: false };
        const watching = (async () => {
          while (!progress.done) {
            if (!progress.signalled && operations() - start >= killAfter) {
              progress.signalled = true;
              self.postMessage(scenarioCrashPoint);
            }
            // oxlint-disable-next-line no-await-in-loop -- polled between the apply's own tasks.
            await quiet(0);
          }
        })();
        try {
          await materialize(replaceTree('new'), from);
        } finally {
          progress.done = true;
          await watching;
        }
        return { operations: operations() - start };
      });
    }
    case 'replace-recover': {
      /* I1: what an open after the kill does first, then what every path holds. */
      return measure(async () => {
        await sweepTemporarySiblings(live, (path) => tauPathPolicy.classify(path).versioned);
        /* The open already verified the creates a killed realm recorded and removed the short ones. */
        const totals = productionCounterTotals();
        const outcome = {
          old: 0,
          new: 0,
          missing: 0,
          partial: 0,
          litter: 0,
          staged: 0,
          verified: totals['uncommitted.verified'] ?? 0,
          removed: totals['uncommitted.removed'] ?? 0,
        };
        for (let index = 0; index < replaceFiles; index += 1) {
          // oxlint-disable-next-line no-await-in-loop -- one read per file, in order.
          const bytes = await live.readFile(replacePath(index)).catch(() => undefined);
          if (bytes === undefined) {
            outcome.missing += 1;
          } else if (sameBytes(bytes, replaceBytes(index, 'old'))) {
            outcome.old += 1;
          } else if (sameBytes(bytes, replaceBytes(index, 'new'))) {
            outcome.new += 1;
          } else {
            outcome.partial += 1;
          }
        }
        const names = await live.readdir('replace').catch(() => []);
        outcome.litter = names.filter((name) => name.includes('.tau-')).length;
        outcome.staged = await stagedFiles();
        return outcome;
      });
    }
    case 'stat-probes': {
      /* S13: module resolution as a language service probes it — up to three
       * candidates per specifier, `exists` then `stat` on a hit. */
      const bases = entries
        .filter((entry) => entry.path.endsWith('.ts'))
        .map((entry) => entry.path.slice(0, -'.ts'.length));
      const specifiers = Array.from({ length: 1000 }, (_, index) =>
        index % 2 === 0 && bases.length > 0 ? (bases[index % bases.length] ?? 'missing') : `missing/m${String(index)}`,
      );
      return measure(async () => {
        let probes = 0;
        let hits = 0;
        for (const specifier of specifiers) {
          for (const candidate of [`${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`]) {
            probes += 1;
            // oxlint-disable-next-line no-await-in-loop -- resolution tries candidates in order.
            if (await live.exists(candidate)) {
              hits += 1;
              // oxlint-disable-next-line no-await-in-loop -- the resolver stats the hit.
              await live.stat(candidate);
              break;
            }
          }
        }
        return { probes, hits };
      });
    }
  }
};

const handle = async (command: WorkerCommand): Promise<unknown> => {
  switch (command.type) {
    case 'open': {
      plan = planFixture(command.fixture);
      for (const project of command.projects) {
        projects.set(project.projectId, project);
      }
      await configure();
      return true;
    }
    case 'run': {
      return run(command.runner, command.projectId, command.parameters ?? {});
    }
    case 'probe-start': {
      startProbe(command.projectId, command.readInterval);
      return true;
    }
    case 'probe-stop': {
      return stopProbe();
    }
  }
};

const respond = async ({ id, command }: WorkerRequest): Promise<void> => {
  try {
    const value = await handle(command);
    self.postMessage({ id, ok: true, value } satisfies WorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
    self.postMessage({ id, ok: false, error: message } satisfies WorkerResponse);
  }
};

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  // async-iife: bootstrap -- every request settles by posting its own response.
  void respond(event.data);
});
self.postMessage(scenarioWorkerReady);
