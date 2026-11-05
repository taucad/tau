/**
 * One filesystem authority, as the file-manager worker composes it, with the
 * scenario runners that drive it on real OPFS.
 *
 * Each runner replays the filesystem calls the HEAD code path it models makes
 * (named in the scenario table's `model` column), against the production
 * `WorkspaceFileService` and `OPFSProvider`; the counts come from
 * `counters.ts` and the spans from the production `workerTimings`.
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
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { handleGlobSearch, handleGrep } from '@taucad/chat/rpc';
import type { RpcDirectoryEntry, RpcFileStat, RpcFileSystem } from '@taucad/chat/rpc';
import { projectToManifest, serializeProjectManifest } from '@taucad/project-core';
import { randomUuid } from '@taucad/utils/id';
import { installScenarioCounters } from '#filesystem-scenarios/counters.js';
import { checkoutBytes, fixtureBytes, fixtureMarker, planFixture } from '#filesystem-scenarios/fixture.js';
import type { FixtureEntry, FixturePlan } from '#filesystem-scenarios/fixture.js';
import { scenarioWorkerReady } from '#filesystem-scenarios/protocol.js';
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
  resourceQueue: new ResourceQueue(),
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
const measure = async (body: () => Promise<Readonly<Record<string, number>> | void>): Promise<WorkerMeasurement> => {
  await settle(50);
  counters.reset();
  busEvents = 0;
  const spanStart = workerTimings.now();
  const startedAt = performance.now();
  const extra = (await body()) ?? {};
  const duration = performance.now() - startedAt;
  await settle();
  return { duration, counts: counters.read(), busEvents, spans: workerTimings.summarize(spanStart), extra };
};

const textEncoder = new TextEncoder();
const percentile = (values: readonly number[], fraction: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
};

/** The unique sibling `temporarySibling(path, 'staged')` names in `revision-effects.ts`. */
const stagedSibling = (path: string): string => {
  const separator = path.lastIndexOf('/');
  return `${path.slice(0, separator + 1)}.${path.slice(separator + 1)}.tau-staged.${randomUuid()}.tmp`;
};

/**
 * Replay `applyTree` on an empty checkout (`apply-tree.ts`): stage every file
 * with one `writeFiles` batch, give each staged file its mode, then publish
 * them all with one `bulkMove`.
 *
 * @param live - The checkout's rooted view.
 * @param entries - The tree's files.
 */
const applyOnEmptyTarget = async (live: RootedFileSystem, entries: readonly FixtureEntry[]): Promise<void> => {
  const staged = entries.map((entry) => ({ entry, staged: stagedSibling(entry.path) }));
  const files = Object.fromEntries(staged.map(({ entry, staged: path }) => [path, { content: checkoutBytes(entry) }]));
  if (live.writeFiles === undefined || live.bulkMove === undefined) {
    throw new Error('The rooted view lacks the batch porcelain applyTree uses.');
  }
  await live.writeFiles(files);
  if (live.setFileMode !== undefined) {
    for (const { staged: path } of staged) {
      // oxlint-disable-next-line no-await-in-loop -- apply-tree sets each staged file's mode in order.
      await live.setFileMode(path, '100644');
    }
  }
  const result = await live.bulkMove(staged.map(({ entry, staged: path }) => ({ source: path, target: entry.path })));
  if (result.failed.length > 0) {
    throw new Error(`${String(result.failed.length)} staged files did not publish.`);
  }
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

/**
 * The agent's RPC filesystem over a composed view, mapped as
 * `libs/agent-tools/src/registry/provider-file-system.ts` maps it, for the
 * three calls `handleGrep` and `handleGlobSearch` make.
 *
 * @param live - The project's rooted view.
 * @param tally - Receives each read and listing.
 * @returns The adapter.
 */
const agentFileSystem = (
  live: RootedFileSystem,
  tally: (event: Readonly<{ kind: 'readdir' | 'read'; path: string; bytes: number }>) => void,
): RpcFileSystem => {
  const view = composeView({ filesystem: live }, { consumer: 'agent', policy: tauPathPolicy });
  const refuse = async (): Promise<never> => {
    throw new Error('Not used by the grep and glob handlers.');
  };
  const date = (mtimeMs: number): string => new Date(mtimeMs).toISOString();
  return {
    readFile: async (path) => {
      const bytes = await view.readFile(path);
      tally({ kind: 'read', path, bytes: bytes.byteLength });
      return new TextDecoder().decode(bytes);
    },
    readdir: async (path) => {
      tally({ kind: 'readdir', path, bytes: 0 });
      const rows = await view.readdirWithStats(path);
      return rows.map(
        (row): RpcDirectoryEntry =>
          row.type === 'dir'
            ? { name: row.name, type: 'dir', size: row.size, modifiedAt: date(row.mtimeMs) }
            : row.contentKind === 'text'
              ? {
                  name: row.name,
                  type: 'file',
                  size: row.size,
                  modifiedAt: date(row.mtimeMs),
                  contentKind: 'text',
                  lineCount: row.lineCount,
                }
              : { name: row.name, type: 'file', size: row.size, modifiedAt: date(row.mtimeMs), contentKind: 'binary' },
      );
    },
    stat: async (path): Promise<RpcFileStat> => {
      const value = await view.stat(path);
      const at = date(value.mtimeMs);
      if (value.type === 'dir') {
        return { size: value.size, isDirectory: true, createdAt: at, modifiedAt: at };
      }
      return value.contentKind === 'text'
        ? {
            size: value.size,
            isDirectory: false,
            createdAt: at,
            modifiedAt: at,
            contentKind: 'text',
            lineCount: value.lineCount,
          }
        : { size: value.size, isDirectory: false, createdAt: at, modifiedAt: at, contentKind: 'binary' };
    },
    exists: async (path) => view.exists(path),
    readBinaryFile: refuse,
    writeFile: refuse,
    writeFileChecked: refuse,
    deleteFileChecked: refuse,
    writeBinaryFile: refuse,
    deleteFile: refuse,
    appendFile: refuse,
    editFile: refuse,
  };
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
  const kinds = new Map(fixturePlan().entries.map((entry) => [entry.path, entry.kind]));
  let binaryBytesRead = 0;
  let textBytesRead = 0;
  let walkCalls = 0;
  let authorityReads = 0;
  const fileSystem = agentFileSystem(live, ({ kind, path, bytes }) => {
    if (kind === 'readdir') {
      walkCalls += 1;
      return;
    }
    authorityReads += 1;
    if (kinds.get(path) === 'binary') {
      binaryBytesRead += bytes;
    } else {
      textBytesRead += bytes;
    }
  });
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
  return { grepDuration, globDuration, binaryBytesRead, textBytesRead, walkCalls, authorityReads };
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
      const measured = await measure(async () => {
        await applyOnEmptyTarget(live, entries);
        return { files: entries.length };
      });
      await assertMaterialized(live, entries);
      return measured;
    }
    case 'materialize-with-save': {
      /* S17: a person's save to a path the apply never touches, issued once the apply is writing. */
      const savePath = 'notes/s17-save.ts';
      counters.trace(['s17-save.ts']);
      const measured = await measure(async () => {
        const applying = applyOnEmptyTarget(live, entries);
        while (counters.read().bytesWritten === 0) {
          // oxlint-disable-next-line no-await-in-loop -- wait for the apply's first byte.
          await quiet(5);
        }
        await quiet(parameters['saveDelay'] ?? 20);
        const saveStart = performance.now();
        await live.writeFile(savePath, saveText(saveSize, 17));
        const saveEnd = performance.now();
        const applyStillRunning = await Promise.race([applying.then(() => 0), quiet(0).then(() => 1)]);
        await applying;
        const firstWrite = counters.traced().find((write) => write.name === 's17-save.ts');
        return {
          saveLatency: saveEnd - saveStart,
          saveStartDelay: firstWrite === undefined ? saveEnd - saveStart : firstWrite.startedAt - saveStart,
          saveOverlappedApply: applyStillRunning,
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
      let deliveries = 0;
      const stop = live.watch({ paths: [''], recursive: true }, () => {
        deliveries += 1;
      });
      const turn = randomUuid().slice(0, 8);
      try {
        const measured = await measure(async () => {
          for (let index = 0; index < 50; index += 1) {
            // oxlint-disable-next-line no-await-in-loop -- the agent's tool calls write one file each, in order.
            await live.writeFile(`agent/${turn}/file-${String(index)}.ts`, saveText(2048, index));
          }
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
