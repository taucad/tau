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
import knownRedList from '#filesystem-scenarios/baseline/known-red.json' with { type: 'json' };
import { defaultFixtureSeed, fixtureProfiles, planFixture } from '#filesystem-scenarios/fixture.js';
import type { FixturePlan } from '#filesystem-scenarios/fixture.js';
import type { AtomicityProgress, AtomicityRequest, AtomicityWriter } from '#filesystem-scenarios/atomicity.worker.js';
import { scenarioWorkerReady } from '#filesystem-scenarios/protocol.js';
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
    filesystemScenarioRecord: boolean;
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
const recording = inject('filesystemScenarioRecord');
const fixture = { seed: defaultFixtureSeed, scale: fixtureProfiles[profileName].scale };
/** Every OPFS directory this harness creates starts with this, so a run can clear the last one's. */
const directoryPrefix = 'fsx-';

/* ------------------------------------------------------------------ workers */

type ScenarioWorker = Readonly<{
  call: <Value>(command: WorkerCommand) => Promise<Value>;
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
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
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
    networkRequests,
    ...Object.fromEntries(Object.entries(network).map(([kind, value]) => [`network.${kind}`, value])),
    ...measurement.extra,
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
            /* The apply is one changeset. */
            invalidationsPerChangeset: probe.invalidationsReceived,
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
    if (inject('filesystemScenarioRecord')) {
      await commands.writeFile(`baseline/${engine}-${profileName}.json`, json);
      await commands.writeFile(`baseline/${engine}-${profileName}.md`, markdown);
      const updated = {
        ...knownRedList,
        gates: knownRedGates.map((entry) => ({
          ...entry,
          limit: observedAtHead.get(entry.id)?.limit ?? entry.limit,
          atHead: Object.fromEntries(
            Object.entries({
              ...entry.atHead,
              [baselineKey]: observedAtHead.get(entry.id)?.value ?? entry.atHead[baselineKey],
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
