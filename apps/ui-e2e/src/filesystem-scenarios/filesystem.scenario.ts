/**
 * Filesystem scenario harness (charter W0, D15, I1, I8).
 *
 * Runs the scenario runners in dedicated authority workers on real OPFS,
 * records one row per scenario (time + counts, named fixture, browser, server
 * and network), probes the engine's `createWritable` atomicity, and asserts the
 * count gates against `baseline/known-red.json`: a known-red gate must still be
 * red (fixing it means removing it from the list) and no worse than its value
 * at HEAD for this engine and profile, every other gate green. A model-bound
 * gate is reported, not asserted: the runner fixes its value.
 */
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import { commands, server } from 'vitest/browser';
import { maximumChangesetEntries } from '@taucad/filesystem';
import knownRedList from '#filesystem-scenarios/baseline/known-red.json' with { type: 'json' };
import { defaultFixtureSeed, fixtureProfiles, planFixture } from '#filesystem-scenarios/fixture.js';
import type { FixturePlan } from '#filesystem-scenarios/fixture.js';
import type { AtomicityProgress, AtomicityRequest, AtomicityWriter } from '#filesystem-scenarios/atomicity.worker.js';
import { scenarioCrashPoint, scenarioWorkerReady } from '#filesystem-scenarios/protocol.js';
import type {
  ProbeReport,
  RunnerName,
  ScenarioProject,
  WorkerCommand,
  WorkerMeasurement,
  WorkerResponse,
} from '#filesystem-scenarios/protocol.js';
import {
  measuredRow,
  pendingRow,
  ratchetAtHead,
  renderMarkdown,
  scenarioTable,
  withinBaseline,
} from '#filesystem-scenarios/scenarios.js';
import type { RowProfile, ScenarioDefinition, ScenarioId, ScenarioRow } from '#filesystem-scenarios/scenarios.js';

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- merging into vitest's `ProvidedContext` requires `interface`.
  export interface ProvidedContext {
    filesystemScenarioProfile: 'small' | 'full';
    filesystemScenarioRuns: number;
    /** `true` records and keeps the better value at HEAD; `force` records what it observed. */
    filesystemScenarioRecord: boolean | 'force';
    filesystemScenarioHead: string;
    filesystemScenarioOutput: string;
  }
}

const profileName = inject('filesystemScenarioProfile');
const runs = inject('filesystemScenarioRuns');
type KnownRedGate = Readonly<{ id: string; limit: number; atHead: Readonly<Record<string, number>> }>;
const knownRedGates: readonly KnownRedGate[] = knownRedList.gates;
const knownRed = new Set<string>(knownRedGates.map((gate) => gate.id));
/** The known-red ratchet key: values at HEAD differ by engine and fixture profile. */
const baselineKey = `${server.browser}-${profileName}`;
const recordSetting = inject('filesystemScenarioRecord');
const recording = recordSetting !== false;
const forcing = recordSetting === 'force';
const fixture = { seed: defaultFixtureSeed, scale: fixtureProfiles[profileName].scale };
/** Every OPFS directory this harness creates starts with this, so a run can clear the last one's. */
const directoryPrefix = 'fsx-';

/* ------------------------------------------------------------------ workers */

type ScenarioWorker = Readonly<{
  call: <Value>(command: WorkerCommand) => Promise<Value>;
  /** Settles when the worker posts its crash point (the I1 replacement probe). */
  crashPoint: Promise<void>;
  terminate: () => void;
}>;

/** Every worker spawned, so the suite's teardown stops any a failed test left running. */
const spawned = new Set<Worker>();

/**
 * Start one scenario worker and wait for its ready message.
 *
 * The dev server optimises a dependency the first time a worker imports it and
 * reloads that worker's module graph, which fails the load with no message; a
 * load failure is the harness's, never a scenario's, so it is retried.
 *
 * @param name - The worker's name (also its IndexedDB prefix).
 * @returns The ready worker.
 */
const startWorker = async (name: string): Promise<Worker> => {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const worker = new Worker(new URL('scenario.worker.ts', import.meta.url), { type: 'module', name });
    spawned.add(worker);
    try {
      // oxlint-disable-next-line no-await-in-loop -- a retry follows the failed load.
      await new Promise<void>((resolve, reject) => {
        const onMessage = (event: MessageEvent<unknown>): void => {
          if (event.data === scenarioWorkerReady) {
            worker.removeEventListener('message', onMessage);
            resolve();
          }
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', (event) => {
          reject(new Error(`Scenario worker failed to start: ${event.message || 'module load error'}`));
        });
      });
      return worker;
    } catch (error) {
      lastError = error as Error;
      worker.terminate();
      spawned.delete(worker);
      // oxlint-disable-next-line no-await-in-loop -- let the dev server finish optimising first.
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }
  }
  throw lastError ?? new Error('Scenario worker failed to start.');
};

const spawn = async (name: string): Promise<ScenarioWorker> => {
  const worker = await startWorker(name);
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let sequence = 0;
  const crashPoint = Promise.withResolvers<void>();
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse | typeof scenarioCrashPoint>) => {
    if (event.data === scenarioCrashPoint) {
      crashPoint.resolve();
      return;
    }
    const entry = pending.get(event.data.id);
    if (entry === undefined) {
      return;
    }
    pending.delete(event.data.id);
    if (event.data.ok) {
      entry.resolve(event.data.value);
    } else {
      entry.reject(new Error(event.data.error));
    }
  });
  return {
    crashPoint: crashPoint.promise,
    call: async <Value>(command: WorkerCommand): Promise<Value> =>
      new Promise<Value>((resolve, reject) => {
        sequence += 1;
        pending.set(sequence, { resolve: resolve as (value: unknown) => void, reject });
        worker.postMessage({ id: sequence, command });
      }),
    terminate: () => {
      worker.terminate();
      spawned.delete(worker);
    },
  };
};

/** Past the authority's snapshot debounce (two seconds), so the Project Index is stored. */
const indexPersisted = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const newProject = (label: string): ScenarioProject => {
  const random = crypto.getRandomValues(new Uint8Array(21));
  const suffix = [...random].map((value) => alphabet[value % alphabet.length]).join('');
  return {
    projectId: `proj_${suffix}`,
    providerBasePath: `${directoryPrefix}${label}-${suffix.slice(0, 8).toLowerCase()}`,
  };
};

const clearScenarioDirectories = async (): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  const names: string[] = [];
  for await (const name of (root as FileSystemDirectoryHandle & { keys: () => AsyncIterable<string> }).keys()) {
    if (name.startsWith(directoryPrefix)) {
      names.push(name);
    }
  }
  await Promise.all(names.map(async (name) => root.removeEntry(name, { recursive: true })));
};

/** Open one worker over the given projects. */
const openWorker = async (name: string, projects: readonly ScenarioProject[]): Promise<ScenarioWorker> => {
  const worker = await spawn(name);
  await worker.call({ type: 'open', fixture, projects });
  return worker;
};

const runOn = async (
  worker: ScenarioWorker,
  {
    runner,
    project,
    parameters,
  }: Readonly<{ runner: RunnerName; project: ScenarioProject; parameters?: Readonly<Record<string, number>> }>,
): Promise<WorkerMeasurement> =>
  worker.call<WorkerMeasurement>({
    type: 'run',
    runner,
    projectId: project.projectId,
    ...(parameters ? { parameters } : {}),
  });

/* ------------------------------------------------------------------ metrics */

const flatten = (measurement: WorkerMeasurement): Record<string, number> => {
  const { network, ...counts } = measurement.counts;
  const networkRequests = Object.values(network).reduce((sum, value) => sum + value, 0);
  return {
    duration: measurement.duration,
    ...counts,
    busEvents: measurement.busEvents,
    /* Lock sets and tokens come from production's own counters (cross-tab coordinator). */
    lockSets: measurement.productionCounters['locks.set'] ?? 0,
    lockTokens: measurement.productionCounters['locks.token'] ?? 0,
    /* Changesets the authority applied under their lock set (production's own counter). */
    changesets: measurement.productionCounters['changesets'] ?? 0,
    /* Project Index opens from a stored snapshot and from a full scan (production's own counters). */
    indexLoads: measurement.productionCounters['index.load'] ?? 0,
    indexScans: measurement.productionCounters['index.scan'] ?? 0,
    indexCompares: measurement.productionCounters['index.compare'] ?? 0,
    networkRequests,
    ...Object.fromEntries(Object.entries(network).map(([kind, value]) => [`network.${kind}`, value])),
    ...measurement.extra,
    /* D2 bounds a changeset at 256 entries, so N files need at least ⌈N/256⌉ and an apply should take no more. */
    ...(typeof measurement.extra['files'] === 'number'
      ? { changesetBound: Math.ceil(measurement.extra['files'] / maximumChangesetEntries) }
      : {}),
  };
};

/** Long tasks on this page (the main thread) while `body` runs. */
const watchLongTasks = async <Value>(body: () => Promise<Value>): Promise<{ value: Value; longTasks: number }> => {
  let longTasks = 0;
  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver((list) => {
      longTasks += list.getEntries().filter((entry) => entry.duration > 50).length;
    });
    observer.observe({ type: 'longtask', buffered: false });
  } catch {
    observer = undefined;
  }
  try {
    return { value: await body(), longTasks };
  } finally {
    observer?.disconnect();
  }
};

const percentile95 = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)] ?? 0;
};

/* --------------------------------------------------------------------- rows */

const definition = (id: ScenarioId): ScenarioDefinition => {
  const found = scenarioTable.find((row) => row.id === id);
  if (found === undefined) {
    throw new Error(`No scenario ${id}.`);
  }
  return found;
};

const rows = new Map<ScenarioId, ScenarioRow>();
let plan: FixturePlan;
let rowProfile: RowProfile;
let atomicity: Array<Record<string, unknown>> = [];

const browserVersion = (): string => {
  const match = /(?:Chrome|Firefox|Version)\/([\d.]+)/u.exec(navigator.userAgent);
  return match?.[1] ?? navigator.userAgent;
};

const record = (id: ScenarioId, samples: ReadonlyArray<Record<string, number>>, spans?: unknown): ScenarioRow => {
  const row = measuredRow(definition(id), { profile: rowProfile, samples, spans }, knownRed);
  rows.set(id, row);
  return row;
};

/**
 * Run one scenario `runs` times, each on fresh projects, and record its row.
 *
 * @param id - The scenario.
 * @param sample - One run: returns its metrics and the worker spans.
 */
const scenario = async (
  id: ScenarioId,
  sample: (run: number) => Promise<Readonly<{ metrics: Record<string, number>; spans?: unknown }>>,
): Promise<ScenarioRow> => {
  const samples: Array<Record<string, number>> = [];
  let spans: unknown;
  for (let run = 0; run < runs; run += 1) {
    // oxlint-disable-next-line no-await-in-loop -- samples are sequential so they never contend.
    const result = await sample(run);
    samples.push(result.metrics);
    spans = result.spans;
    // oxlint-disable-next-line no-await-in-loop -- each run cleans up its own directories.
    await clearScenarioDirectories();
  }
  return record(id, samples, spans);
};

/* -------------------------------------------------------------------- suite */

describe(`filesystem scenarios (${profileName} profile)`, { concurrent: false }, () => {
  /* The populated projects later scenarios read: one applied (text + pointers), one imported (full bytes). */
  let applied: ScenarioProject;
  let imported: ScenarioProject;
  let authority: ScenarioWorker;

  beforeAll(async () => {
    plan = planFixture(fixture);
    rowProfile = {
      fixture: {
        name: profileName,
        seed: plan.seed,
        scale: plan.scale,
        files: plan.totals.files,
        bytes: plan.totals.bytes,
        revisions: plan.totals.revisions,
      },
      browser: { engine: server.browser, version: browserVersion() },
      server: 'none: local OPFS only (server-backed rows are pending)',
      network: 'none: no request leaves the page (unthrottled)',
      storage: 'OPFS in a persistent (disk-backed) browser profile',
    };
    await clearScenarioDirectories();
    /* One unmeasured save-during-apply first, so no measured sample pays the cold start (module loads, first OPFS
     * and lock use); the gates stay as they are (I8). */
    const warmUp = newProject('warm-up');
    const worker = await openWorker('warm-up', [warmUp]);
    try {
      await runOn(worker, { runner: 'materialize-with-save', project: warmUp });
    } finally {
      worker.terminate();
    }
    await clearScenarioDirectories();
  });

  test('I1: createWritable never exposes a partial file when its writer is killed', async () => {
    const size = 16 * 1024 * 1024;
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(`${directoryPrefix}atomicity`, { create: true });
    const outcomes: Array<Record<string, unknown>> = [];
    for (const writer of ['writable', 'writable-close', 'sync-handle'] as const satisfies readonly AtomicityWriter[]) {
      const name = `${writer}.bin`;
      // oxlint-disable-next-line no-await-in-loop -- each writer is probed alone.
      const file = await directory.getFileHandle(name, { create: true });
      // oxlint-disable-next-line no-await-in-loop -- the old bytes must be durable before the replacement starts.
      const seed = await file.createWritable();
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await seed.write(new Uint8Array(size).fill(0xaa));
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await seed.close();
      const worker = new Worker(new URL('atomicity.worker.ts', import.meta.url), { type: 'module' });
      // oxlint-disable-next-line no-await-in-loop -- the kill must land before the read-back.
      const killedAt = await new Promise<string>((resolve) => {
        worker.addEventListener('message', (event: MessageEvent<AtomicityProgress>) => {
          if (event.data.type === 'mid-write' || event.data.type === 'closing') {
            worker.terminate();
            resolve(event.data.type);
          } else {
            worker.terminate();
            resolve(`${event.data.type}${event.data.detail === undefined ? '' : `: ${event.data.detail}`}`);
          }
        });
        worker.postMessage({
          writer,
          directory: `${directoryPrefix}atomicity`,
          name,
          size,
          chunk: 1024 * 1024,
          fill: 0x55,
        } satisfies AtomicityRequest);
      });
      /* The engine releases a killed worker's handle asynchronously. */
      // oxlint-disable-next-line no-await-in-loop -- give the storage process time to settle the aborted write.
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
      // oxlint-disable-next-line no-await-in-loop -- read back after the kill.
      const written = await file.getFile();
      // oxlint-disable-next-line no-await-in-loop -- as above.
      const bytes = new Uint8Array(await written.arrayBuffer());
      const allOld = bytes.byteLength === size && bytes.every((byte) => byte === 0xaa);
      const allNew = bytes.byteLength === size && bytes.every((byte) => byte === 0x55);
      const residue: string[] = [];
      // oxlint-disable-next-line no-await-in-loop -- list the directory once per writer.
      for await (const entry of (
        directory as FileSystemDirectoryHandle & { keys: () => AsyncIterable<string> }
      ).keys()) {
        if (entry !== 'writable.bin' && entry !== 'writable-close.bin' && entry !== 'sync-handle.bin') {
          residue.push(entry);
        }
      }
      outcomes.push({
        engine: server.browser,
        writer,
        killedAt,
        result: allOld ? 'old' : allNew ? 'new' : 'partial',
        size: bytes.byteLength,
        residue,
      });
    }
    atomicity = outcomes;
    await clearScenarioDirectories();
    for (const outcome of outcomes) {
      /* Every writer must have been killed while writing or closing, never after it finished. */
      expect(['mid-write', 'closing'], JSON.stringify(outcome)).toContain(outcome['killedAt']);
      expect(outcome['residue'], JSON.stringify(outcome)).toStrictEqual([]);
    }
    /* I1 relies on createWritable's swap-file commit; a sync-handle rewrite is
     * write-then-truncate and expected to tear, which is why replacements stage. */
    for (const outcome of outcomes.filter((row) => row['writer'] !== 'sync-handle')) {
      expect(['old', 'new'], JSON.stringify(outcome)).toContain(outcome['result']);
    }
  });

  test('S3: cold open materialises every text file and pointer', async () => {
    const row = await scenario('S3', async (run) => {
      const project = newProject(`s3-${String(run)}`);
      const worker = await openWorker(`s3-${String(run)}`, [project]);
      try {
        const { value: measured, longTasks } = await watchLongTasks(async () =>
          runOn(worker, { runner: 'materialize', project }),
        );
        return { metrics: { ...flatten(measured), mainThreadLongTasks: longTasks }, spans: measured.spans };
      } finally {
        worker.terminate();
      }
    });
    expect(row.metrics['files']).toBe(plan.totals.files);
  });

  test('S5: warm open of the materialised project on a fresh authority', async () => {
    applied = newProject('applied');
    const writer = await openWorker('applied-writer', [applied]);
    await runOn(writer, { runner: 'materialize', project: applied });
    /* The writer's own index compares once more and stores its snapshot, as a tab does before a reload. */
    await runOn(writer, { runner: 'index-open', project: applied });
    await indexPersisted();
    writer.terminate();
    const row = await (async () => {
      const samples: Array<Record<string, number>> = [];
      let spans: unknown;
      for (let run = 0; run < runs; run += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each run is a fresh authority, one at a time.
        const fresh = await openWorker(`s5-${String(run)}`, [applied]);
        try {
          // oxlint-disable-next-line no-await-in-loop -- as above.
          const measured = await runOn(fresh, { runner: 'warm-open', project: applied });
          samples.push(flatten(measured));
          spans = measured.spans;
        } finally {
          fresh.terminate();
        }
      }
      return record('S5', samples, spans);
    })();
    expect(row.metrics['files']).toBe(plan.totals.files);
    /* Warm: every run loaded the stored index rather than scanning (D5). */
    expect(row.metrics['indexLoads']).toBe(1);
    expect(row.metrics['indexScans']).toBe(0);
  });

  /*
   * D5 across reloads and tabs, on real OPFS with real Web Locks and
   * BroadcastChannel: each worker is one tab's authority.
   */
  test('W3: the Project Index survives a reload, sees an external edit, and keeps the newer snapshot', async () => {
    const project = newProject('index');
    const open = async (name: string) => openWorker(`index-${name}`, [project]);
    const writer = await open('writer');
    await runOn(writer, { runner: 'materialize', project });
    await runOn(writer, { runner: 'index-open', project });
    await indexPersisted();
    writer.terminate();

    /* A reload loads the stored index, compares it, and reads no file content. */
    const reload = await open('reload');
    const reloaded = await runOn(reload, { runner: 'index-open', project });
    reload.terminate();
    expect(reloaded.productionCounters['index.load']).toBe(1);
    expect(reloaded.productionCounters['index.scan'] ?? 0).toBe(0);
    expect(reloaded.counts.bytesRead).toBe(0);
    expect(reloaded.extra['mismatched']).toBe(0);

    /* An edit no authority saw is found by the next load's compare. */
    const editor = await open('editor');
    await runOn(editor, { runner: 'external-edit', project, parameters: { bytes: 4321 } });
    editor.terminate();
    const edited = await open('edited');
    const compared = await runOn(edited, { runner: 'index-open', project });
    await indexPersisted();
    edited.terminate();
    expect(compared.extra['externalMismatched']).toBe(1);
    expect(compared.extra['externalSize']).toBe(4321);

    /* Tab B writes and stores its snapshot; tab A opened before it could hear B's
     * notice, so its later snapshot is behind B's and must not replace it. */
    const tabB = await open('tab-b');
    await runOn(tabB, { runner: 'index-open', project });
    await runOn(tabB, { runner: 'index-write', project });
    const tabA = await open('tab-a');
    const openedA = await runOn(tabA, { runner: 'index-open', project });
    expect(openedA.extra['tabWriteListed']).toBe(1);
    await indexPersisted();
    tabA.terminate();
    tabB.terminate();
    const reader = await open('reader');
    const stored = await runOn(reader, { runner: 'index-snapshot', project });
    const reopened = await runOn(reader, { runner: 'index-open', project });
    reader.terminate();
    /* B's snapshot: the writer's notices and B's own; A, which never wrote, would have stored the writer's alone. */
    expect(stored.extra).toMatchObject({ present: 1, rescan: 0, tabs: 2, tabWriteStored: 1 });
    expect(reopened.productionCounters['index.load']).toBe(1);
    expect(reopened.extra['tabWriteListed']).toBe(1);
  });

  test('S7 and S8: save one file, then an agent turn of 50 files', async () => {
    authority = await openWorker('authority', [applied]);
    const save: Array<Record<string, number>> = [];
    const agent: Array<Record<string, number>> = [];
    let saveSpans: unknown;
    let agentSpans: unknown;
    for (let run = 0; run < runs; run += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential samples.
      const saved = await runOn(authority, { runner: 'save', project: applied });
      const metrics = flatten(saved);
      save.push({
        ...metrics,
        wholeFileCopies: Math.floor((metrics['bytesRead'] ?? 0) / (metrics['savedBytes'] ?? 1)),
      });
      saveSpans = saved.spans;
      // oxlint-disable-next-line no-await-in-loop -- sequential samples.
      const turn = await runOn(authority, { runner: 'agent-write', project: applied });
      agent.push(flatten(turn));
      agentSpans = turn.spans;
    }
    record('S7', save, saveSpans);
    const row = record('S8', agent, agentSpans);
    expect(row.metrics['writes']).toBeGreaterThanOrEqual(50);
  });

  test('S6: import the whole payload as a new project', async () => {
    const row = await (async () => {
      const samples: Array<Record<string, number>> = [];
      let spans: unknown;
      for (let run = 0; run < runs; run += 1) {
        const project = newProject(`import-${String(run)}`);
        // oxlint-disable-next-line no-await-in-loop -- one import at a time.
        const worker = await openWorker(`s6-${String(run)}`, [project]);
        try {
          // oxlint-disable-next-line no-await-in-loop -- as above.
          const { value: measured, longTasks } = await watchLongTasks(async () =>
            runOn(worker, { runner: 'import', project }),
          );
          const metrics = flatten(measured);
          const payload = metrics['payloadBytes'] ?? 1;
          samples.push({
            ...metrics,
            mainThreadLongTasks: longTasks,
            durableWriteRatio: (metrics['bytesWritten'] ?? 0) / payload,
            hashPasses: (metrics['bytesHashed'] ?? 0) / payload,
          });
          spans = measured.spans;
          if (run === runs - 1) {
            imported = project;
          }
        } finally {
          worker.terminate();
        }
      }
      return record('S6', samples, spans);
    })();
    expect(row.metrics['payloadBytes']).toBe(plan.totals.bytes);
  });

  test('S12 and S13: agent grep/glob and module-resolution probes over the imported project', async () => {
    authority.terminate();
    authority = await openWorker('reader', [applied, imported]);
    const grep: Array<Record<string, number>> = [];
    const probes: Array<Record<string, number>> = [];
    let grepSpans: unknown;
    let probeSpans: unknown;
    for (let run = 0; run < runs; run += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential samples.
      const searched = await runOn(authority, { runner: 'grep-glob', project: imported });
      grep.push(flatten(searched));
      grepSpans = searched.spans;
      // oxlint-disable-next-line no-await-in-loop -- sequential samples.
      const probed = await runOn(authority, { runner: 'stat-probes', project: imported });
      probes.push(flatten(probed));
      probeSpans = probed.spans;
    }
    record('S12', grep, grepSpans);
    const row = record('S13', probes, probeSpans);
    expect(row.metrics['probes']).toBeGreaterThanOrEqual(1000);
  });

  test('S19: grep while saving and reading', async () => {
    const samples: Array<Record<string, number>> = [];
    let spans: unknown;
    for (let run = 0; run < runs; run += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential samples.
      const measured = await runOn(authority, { runner: 'grep-with-save-and-reads', project: imported });
      samples.push(flatten(measured));
      spans = measured.spans;
    }
    const row = record('S19', samples, spans);
    expect(row.metrics['reads']).toBeGreaterThan(0);
  });

  test('S16: a second tab while S3 materialises', async () => {
    const row = await scenario('S16', async (run) => {
      const project = newProject(`s16-${String(run)}`);
      const first = await openWorker(`s16-a-${String(run)}`, [project]);
      const second = await openWorker(`s16-b-${String(run)}`, [project]);
      try {
        await second.call({ type: 'probe-start', projectId: project.projectId, readInterval: 50 });
        const measured = await runOn(first, { runner: 'materialize', project });
        const probe = await second.call<ProbeReport>({ type: 'probe-stop' });
        return {
          metrics: {
            ...flatten(measured),
            secondTabReads: probe.reads,
            readP95: percentile95(probe.latencies),
            invalidationsReceived: probe.invalidationsReceived,
            secondTabBusEvents: probe.busEvents,
          },
          spans: measured.spans,
        };
      } finally {
        first.terminate();
        second.terminate();
      }
    });
    expect(row.metrics['secondTabReads']).toBeGreaterThan(0);
  });

  test('S17: a save while S3 materialises', async () => {
    const row = await scenario('S17', async (run) => {
      const project = newProject(`s17-${String(run)}`);
      const worker = await openWorker(`s17-${String(run)}`, [project]);
      try {
        const measured = await runOn(worker, { runner: 'materialize-with-save', project });
        const metrics = flatten(measured);
        return { metrics: { ...metrics, saveWait: metrics['saveStartDelay'] ?? Number.NaN }, spans: measured.spans };
      } finally {
        worker.terminate();
      }
    });
    expect(row.metrics['saveLatency']).toBeGreaterThan(0);
    /* Every sample's save was issued while the apply was still writing; otherwise S17 measured nothing. */
    for (const sample of row.samples) {
      expect(sample['saveIssuedDuringApply'], JSON.stringify(sample)).toBe(1);
    }
  });

  /**
   * Kill an apply at seven points spread across its mutations, then open the
   * project in a fresh worker, recover it as an open does, and read every path.
   *
   * @param label - Names the projects and workers.
   * @param create - Write the new tree over an empty checkout instead of the old tree.
   * @returns One outcome per kill point.
   */
  const killApplyAcrossItsMutations = async (
    label: string,
    create: boolean,
  ): Promise<Array<Record<string, number>>> => {
    const parameters: Readonly<Record<string, number>> = create ? { create: 1 } : {};
    const seed = async (worker: ScenarioWorker, project: ScenarioProject): Promise<void> => {
      if (!create) {
        await runOn(worker, { runner: 'replace-seed', project });
      }
    };
    /* A clean run says how many mutations the apply makes, so the kills can spread across all of them. */
    const calibration = newProject(`${label}-calibrate`);
    const calibrating = await openWorker(`${label}-calibrate`, [calibration]);
    let total: number;
    try {
      await seed(calibrating, calibration);
      const clean = await runOn(calibrating, { runner: 'replace-killable', project: calibration, parameters });
      total = clean.extra['operations'] ?? 0;
    } finally {
      calibrating.terminate();
    }
    expect(total).toBeGreaterThan(40);
    const outcomes: Array<Record<string, number>> = [];
    for (const fraction of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      const killAfter = Math.max(1, Math.floor(fraction * total));
      const project = newProject(`${label}-${String(killAfter)}`);
      // oxlint-disable-next-line no-await-in-loop -- one project per kill point, in order.
      const applying = await openWorker(`${label}-apply-${String(killAfter)}`, [project]);
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await seed(applying, project);
      /* Never settles once the worker is killed; the race below only reads it if the apply ends first. */
      const finished = (async (): Promise<'finished' | 'failed'> => {
        try {
          await runOn(applying, {
            runner: 'replace-killable',
            project,
            parameters: { ...parameters, killAfter },
          });
          return 'finished';
        } catch {
          return 'failed';
        }
      })();
      // oxlint-disable-next-line no-await-in-loop -- the kill lands at the crash point.
      const reached = await Promise.race([
        (async (): Promise<'killed'> => {
          await applying.crashPoint;
          return 'killed';
        })(),
        finished,
      ]);
      applying.terminate();
      /* The engine releases a killed worker's handles asynchronously. */
      // oxlint-disable-next-line no-await-in-loop -- let storage settle the aborted writes.
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
      // oxlint-disable-next-line no-await-in-loop -- a fresh process opens the same files.
      const reopened = await openWorker(`${label}-recover-${String(killAfter)}`, [project]);
      try {
        // oxlint-disable-next-line no-await-in-loop -- recover, then read every path back.
        const recovered = await runOn(reopened, { runner: 'replace-recover', project });
        outcomes.push({ killAfter, total, killed: reached === 'killed' ? 1 : 0, ...recovered.extra });
      } finally {
        reopened.terminate();
      }
    }
    return outcomes;
  };

  const recordAtomicity = (writer: string, outcomes: ReadonlyArray<Record<string, number>>): void => {
    atomicity = [
      ...atomicity,
      ...outcomes.map((outcome) => ({
        engine: server.browser,
        writer,
        killedAt: `${String(outcome['killAfter'])} of ${String(outcome['total'])} mutations`,
        result: `old ${String(outcome['old'])}, new ${String(outcome['new'])}, missing ${String(outcome['missing'])}, partial ${String(outcome['partial'])}`,
        residue: [
          ...(outcome['removed'] === 0 || outcome['removed'] === undefined
            ? []
            : [`${String(outcome['removed'])} short creates removed on open`]),
          ...(outcome['litter'] === 0 ? [] : [`${String(outcome['litter'])} temporary siblings`]),
          ...(outcome['staged'] === 0 ? [] : [`${String(outcome['staged'])} staged files`]),
        ],
      })),
    ];
  };

  test('I1: a replacement killed at any step of stage, move aside and publish leaves old or new bytes', async () => {
    const outcomes = await killApplyAcrossItsMutations('i1', false);
    recordAtomicity('applyTree replace (stage, move aside, publish)', outcomes);
    for (const outcome of outcomes) {
      expect(outcome['killed'], JSON.stringify(outcome)).toBe(1);
      expect(outcome['missing'], JSON.stringify(outcome)).toBe(0);
      expect(outcome['partial'], JSON.stringify(outcome)).toBe(0);
      expect(outcome['litter'], JSON.stringify(outcome)).toBe(0);
      expect(outcome['staged'], JSON.stringify(outcome)).toBe(0);
      expect((outcome['old'] ?? 0) + (outcome['new'] ?? 0), JSON.stringify(outcome)).toBe(48);
    }
  });

  test('I1: a create killed at any step of its changeset reads back absent or new: the open removes what it left short', async () => {
    const outcomes = await killApplyAcrossItsMutations('i1-create', true);
    recordAtomicity('applyTree create (final-path write, recorded size)', outcomes);
    for (const outcome of outcomes) {
      expect(outcome['killed'], JSON.stringify(outcome)).toBe(1);
      expect(outcome['old'], JSON.stringify(outcome)).toBe(0);
      expect(outcome['partial'], JSON.stringify(outcome)).toBe(0);
      expect(outcome['litter'], JSON.stringify(outcome)).toBe(0);
      expect(outcome['staged'], JSON.stringify(outcome)).toBe(0);
      expect((outcome['missing'] ?? 0) + (outcome['new'] ?? 0), JSON.stringify(outcome)).toBe(48);
      /* Every create the record named was checked on the open (none when the kill landed before the first). */
      expect(outcome['verified'] ?? 0, JSON.stringify(outcome)).toBeGreaterThanOrEqual(outcome['removed'] ?? 0);
    }
    /* A kill lands while a writable is open: the file it left empty was found and removed, not reported. */
    expect(
      outcomes.reduce((total, outcome) => total + (outcome['removed'] ?? 0), 0),
      JSON.stringify(outcomes),
    ).toBeGreaterThan(0);
  });

  test('pending scenarios are declared with their reason and gates', () => {
    for (const pending of scenarioTable.filter((row) => row.pending !== undefined)) {
      expect(pending.pending?.length, pending.id).toBeGreaterThan(20);
      rows.set(pending.id, pendingRow(pending, rowProfile, knownRed));
    }
  });

  /** Values of known-red gates this run, recorded into known-red.json in record mode. */
  const observedAtHead = new Map<string, Readonly<{ value: number; limit: number }>>();

  describe('count gates (known-red gates stay red, and no worse than at HEAD, until their package lands)', () => {
    for (const row of scenarioTable.filter((scenarioRow) => scenarioRow.pending === undefined)) {
      for (const gate of row.gates) {
        const red = knownRed.has(gate.id);
        const modelBound = gate.qualifier?.kind === 'model-bound';
        const suffix = modelBound ? ' [model-bound: reported only]' : red ? ' [known red at HEAD]' : '';
        test(`${gate.id}: ${gate.description}${suffix}`, () => {
          const measured = rows.get(row.id);
          expect(measured, `${row.id} produced no row`).toBeDefined();
          const result = measured?.gates.find((candidate) => candidate.id === gate.id);
          expect(result?.value, `${gate.id} has no ${gate.metric}`).toBeDefined();
          if (result === undefined || modelBound) {
            return;
          }
          expect(
            result.pass,
            red
              ? `${gate.id} is green (${String(result.value)} vs ${String(result.limit)}): remove it from baseline/known-red.json`
              : `${gate.id} is red: ${String(result.value)} vs ${String(result.limit)}`,
          ).toBe(!red);
          if (!red) {
            return;
          }
          observedAtHead.set(gate.id, { value: result.value ?? Number.NaN, limit: result.limit });
          if (recording) {
            return;
          }
          const atHead = knownRedGates.find((entry) => entry.id === gate.id)?.atHead[baselineKey];
          expect(
            atHead,
            `${gate.id} has no atHead for ${baselineKey}: re-record with TAU_FS_SCENARIO_RECORD=true`,
          ).toBeDefined();
          expect(
            withinBaseline(result, atHead ?? Number.NaN),
            `${gate.id} regressed: ${String(result.value)} is worse than ${String(atHead)} at HEAD (${baselineKey})`,
          ).toBe(true);
        });
      }
    }
  });

  afterAll(async () => {
    for (const worker of spawned) {
      worker.terminate();
    }
    await clearScenarioDirectories();
    const ordered = scenarioTable.flatMap((scenarioRow) => {
      const row = rows.get(scenarioRow.id);
      return row === undefined ? [] : [row];
    });
    const results = {
      harness: 'filesystem-scenarios',
      head: inject('filesystemScenarioHead'),
      recordedAt: new Date().toISOString(),
      profile: rowProfile,
      runs,
      atomicity,
      rows: ordered,
    };
    const json = `${JSON.stringify(results, null, 2)}\n`;
    const markdown = [
      `# Filesystem scenarios at ${results.head} (${profileName} profile)`,
      '',
      `Recorded ${results.recordedAt}; ${String(runs)} run(s) per scenario, p75. Count gates marked "red (known)" are listed in known-red.json.`,
      '',
      renderMarkdown(ordered),
      '## I1 writer probe',
      '',
      '| Engine | Writer | Killed at | Result | Residue |',
      '| --- | --- | --- | --- | --- |',
      ...atomicity.map(
        (row) =>
          `| ${String(row['engine'])} | ${String(row['writer'])} | ${String(row['killedAt'])} | ${String(row['result'])} | ${(row['residue'] as string[]).join(', ') || '—'} |`,
      ),
      '',
    ].join('\n');
    const output = inject('filesystemScenarioOutput');
    const engine = server.browser;
    await commands.writeFile(`${output}/${engine}-${profileName}.json`, json);
    await commands.writeFile(`${output}/${engine}-${profileName}.md`, markdown);
    if (recording) {
      await commands.writeFile(`baseline/${engine}-${profileName}.json`, json);
      await commands.writeFile(`baseline/${engine}-${profileName}.md`, markdown);
      /* I8: a record run keeps the better of the recorded and observed value, so it never loosens a gate. */
      const comparisonOf = new Map(
        scenarioTable.flatMap((scenarioRow) => scenarioRow.gates.map((gate) => [gate.id, gate.comparison] as const)),
      );
      const updated = {
        ...knownRedList,
        gates: knownRedGates.map((entry) => ({
          ...entry,
          limit: forcing ? (observedAtHead.get(entry.id)?.limit ?? entry.limit) : entry.limit,
          atHead: Object.fromEntries(
            Object.entries({
              ...entry.atHead,
              [baselineKey]: ratchetAtHead(
                {
                  comparison: comparisonOf.get(entry.id) ?? 'at-most',
                  limit: observedAtHead.get(entry.id)?.limit ?? entry.limit,
                },
                {
                  recorded: entry.atHead[baselineKey],
                  observed: observedAtHead.get(entry.id)?.value,
                  force: forcing,
                },
              ),
            })
              .filter((pair): pair is [string, number] => pair[1] !== undefined)
              .sort(([left], [right]) => left.localeCompare(right)),
          ),
        })),
      };
      await commands.writeFile('baseline/known-red.json', `${JSON.stringify(updated, null, 2)}\n`);
    }
  });
});
