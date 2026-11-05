/**
 * The S1–S20 scenario table (charter "Success criteria and scenario budgets"),
 * its count gates, and the rows a run reports.
 *
 * A row always names its fixture, browser, server and network profile (I8).
 * Count gates are hard: a gate listed in `baseline/known-red.json` is red at
 * HEAD and is expected to stay red until the work package that fixes it lands,
 * which then removes it from that list; any other gate must be green. Time
 * targets are recorded, not asserted, until W13.
 *
 * @module
 */

/** A scenario id, S1–S20. */
export type ScenarioId = `S${number}`;

/** One count gate: `metric` must be at most (or exactly) `limit`. */
export type CountGate = Readonly<{
  id: string;
  metric: string;
  comparison: 'at-most' | 'equals';
  /** A number, or the name of another metric in the same row (`writes = files`). */
  limit: number | string;
  description: string;
}>;

/** One time target: `metric` (milliseconds) at most `limit`. */
export type TimeTarget = Readonly<{ metric: string; limit: number; description: string }>;

/** One row of the scenario table. */
export type ScenarioDefinition = Readonly<{
  id: ScenarioId;
  title: string;
  /** What HEAD code path the runner replays, and what it leaves out. */
  model: string;
  times: readonly TimeTarget[];
  gates: readonly CountGate[];
  /** Absent when the harness runs it; otherwise why not, and what unblocks it. */
  pending?: string;
}>;

const serverPending =
  'Needs the local API with its object store and database (the api-e2e git tier: apps/api-e2e/src/git/global-setup.ts boots two APIs, two tau-storage workers, MinIO and PostgreSQL from Docker). This container has no Docker daemon, so the W0.1 harness registers the row and its gates without running them.';

/** Every scenario, in charter order. */
export const scenarioTable: readonly ScenarioDefinition[] = [
  {
    id: 'S1',
    title: 'Cold open: tree visible',
    model: 'Hosted cold open through the revisions host to treeReady.',
    times: [{ metric: 'duration', limit: 3000, description: '≤ 3 s, independent of history size' }],
    gates: [
      {
        id: 'S1.blob-reads',
        metric: 'blobReadsBeforeTree',
        comparison: 'equals',
        limit: 0,
        description: '0 blob reads before the tree renders',
      },
      {
        id: 'S1.whole-packs',
        metric: 'wholePacksBeforeTree',
        comparison: 'equals',
        limit: 0,
        description: '0 pack bodies downloaded whole before treeReady',
      },
      {
        id: 'S1.upload-pack',
        metric: 'uploadPackOnListing',
        comparison: 'equals',
        limit: 0,
        description: '0 upload-pack on the listing path',
      },
    ],
    pending: serverPending,
  },
  {
    id: 'S2',
    title: 'Cold open: entry model rendered',
    model: 'Hosted cold open to the entry model (closure ≤ 10 MB).',
    times: [{ metric: 'duration', limit: 5000, description: '≤ 5 s' }],
    gates: [
      {
        id: 'S2.objects',
        metric: 'objectsBeyondClosure',
        comparison: 'equals',
        limit: 0,
        description: 'objects fetched = closure objects (+ delta bases)',
      },
      {
        id: 'S2.lfs-batches',
        metric: 'lfsBatchesBeyondCeiling',
        comparison: 'equals',
        limit: 0,
        description: 'LFS batch calls ≤ ⌈closure/100⌉',
      },
    ],
    pending: serverPending,
  },
  {
    id: 'S3',
    title: 'Cold open: all text materialised',
    model:
      'apply-tree.ts on an empty checkout: one writeFiles batch to tau-staged siblings, setFileMode per staged file, one bulkMove to the targets; text bytes plus LFS pointers for every binary. Git fetch, inflate and capture are not part of the window.',
    times: [{ metric: 'duration', limit: 15_000, description: '≤ 15 s' }],
    gates: [
      {
        id: 'S3.lock-sets',
        metric: 'lockSets',
        comparison: 'at-most',
        limit: 1,
        description: '1 lock set per changeset (the apply is one changeset)',
      },
      {
        id: 'S3.events',
        metric: 'eventsPerPort',
        comparison: 'at-most',
        limit: 1,
        description: '1 event per changeset per port',
      },
      { id: 'S3.writes', metric: 'writes', comparison: 'equals', limit: 'files', description: 'writes = N' },
      {
        id: 'S3.renames',
        metric: 'renames',
        comparison: 'equals',
        limit: 0,
        description: 'renames on an empty target = 0',
      },
    ],
  },
  {
    id: 'S4',
    title: 'Cold open: LFS fill',
    model: 'Large-object fill of the 450 MB from the hosted LFS store.',
    times: [{ metric: 'duration', limit: Number.POSITIVE_INFINITY, description: '≥ 80% of line rate, no stall' }],
    gates: [
      {
        id: 'S4.downloads',
        metric: 'downloadPasses',
        comparison: 'at-most',
        limit: 1,
        description: 'each byte downloaded 1×',
      },
      { id: 'S4.writes', metric: 'writePasses', comparison: 'at-most', limit: 1, description: 'each byte written 1×' },
      { id: 'S4.hashes', metric: 'hashPasses', comparison: 'at-most', limit: 1, description: 'each byte hashed 1×' },
      {
        id: 'S4.read-back',
        metric: 'readBackPasses',
        comparison: 'at-most',
        limit: 1,
        description: 'each byte read back ≤ 1×',
      },
    ],
    pending: serverPending,
  },
  {
    id: 'S5',
    title: 'Warm open to render',
    model:
      'A fresh authority over the populated project (a reload): one statTree listing, then one exact stat per file as the per-file status compare. The revisions capture memo is not modelled.',
    times: [{ metric: 'duration', limit: 2000, description: '≤ 2 s' }],
    gates: [
      {
        id: 'S5.network',
        metric: 'networkRequests',
        comparison: 'equals',
        limit: 0,
        description: '0 network for content',
      },
      {
        id: 'S5.blob-reads',
        metric: 'bytesRead',
        comparison: 'equals',
        limit: 0,
        description: '0 blob reads for the status compare (bytes read)',
      },
      {
        id: 'S5.compares',
        metric: 'metadataRequests',
        comparison: 'at-most',
        limit: 1,
        description: '1 head-metadata compare of N entries',
      },
    ],
  },
  {
    id: 'S6',
    title: 'Import 500 MB',
    model:
      "The import's durable step: commitPendingProjectDirectory with the whole payload (every text file and every binary's bytes). Archive decode and the IndexedDB journal are not modelled.",
    times: [{ metric: 'duration', limit: 20_000, description: '≤ 20 s to usable' }],
    gates: [
      {
        id: 'S6.durable-writes',
        metric: 'durableWriteRatio',
        comparison: 'at-most',
        limit: 1.01,
        description: 'durable writes = 1× bytes (manifest and identity allowed)',
      },
      { id: 'S6.hash-passes', metric: 'hashPasses', comparison: 'at-most', limit: 1, description: 'hash passes = 1' },
    ],
  },
  {
    id: 'S7',
    title: 'Save one 1 MB text file',
    model: 'Rooted writeFile replacing an existing 1 MiB text file, as an editor flush does.',
    times: [{ metric: 'duration', limit: 100, description: '≤ 100 ms' }],
    gates: [
      {
        id: 'S7.changesets',
        metric: 'lockSets',
        comparison: 'at-most',
        limit: 1,
        description: '1 changeset (one lock set)',
      },
      { id: 'S7.events', metric: 'eventsPerPort', comparison: 'at-most', limit: 1, description: '1 event' },
      {
        id: 'S7.copies',
        metric: 'wholeFileCopies',
        comparison: 'equals',
        limit: 0,
        description: '0 whole-file copies beyond the write',
      },
    ],
  },
  {
    id: 'S8',
    title: 'Agent turn writing 50 files',
    model:
      "Fifty rooted writeFile calls in order, as the agent's write tool issues them; one recursive watch counts deliveries.",
    times: [{ metric: 'duration', limit: 500, description: '≤ 500 ms to durable' }],
    gates: [
      { id: 'S8.changesets', metric: 'lockSets', comparison: 'at-most', limit: 1, description: '1 changeset' },
      { id: 'S8.watch', metric: 'watchDeliveries', comparison: 'at-most', limit: 1, description: '1 watch delivery' },
    ],
  },
  {
    id: 'S9',
    title: 'Push after one edit',
    model: 'Push of one edited file to the warm hosted remote.',
    times: [{ metric: 'duration', limit: 3000, description: '≤ 3 s' }],
    gates: [
      {
        id: 'S9.unchanged-blobs',
        metric: 'unchangedBlobReads',
        comparison: 'equals',
        limit: 0,
        description: '0 unchanged blobs read',
      },
      {
        id: 'S9.lfs-batch',
        metric: 'lfsBatchOldOids',
        comparison: 'equals',
        limit: 0,
        description: 'LFS batch lists new oids only',
      },
      { id: 'S9.info-refs', metric: 'infoRefs', comparison: 'at-most', limit: 1, description: '1 info/refs' },
    ],
    pending: serverPending,
  },
  {
    id: 'S10',
    title: 'Pull a one-file remote change',
    model: 'Pull of one remote edit from the warm hosted remote.',
    times: [{ metric: 'duration', limit: 2000, description: '≤ 2 s' }],
    gates: [
      { id: 'S10.files', metric: 'filesTouched', comparison: 'at-most', limit: 1, description: 'files touched = 1' },
      { id: 'S10.captures', metric: 'captures', comparison: 'equals', limit: 0, description: 'captures = 0' },
    ],
    pending: serverPending,
  },
  {
    id: 'S11',
    title: 'Revision compare / switch',
    model: "Compare one file across two of the fixture's 200 revisions.",
    times: [{ metric: 'duration', limit: 1000, description: '≤ 1 s' }],
    gates: [
      {
        id: 'S11.objects',
        metric: 'objectsBeyondPaths',
        comparison: 'equals',
        limit: 0,
        description: 'objects fetched = those of the compared paths',
      },
    ],
    pending:
      "Needs a git object store holding the fixture's 200 revisions, built through the revision port; @taucad/revisions is not a dependency ui-e2e resolves, so wiring it is a follow-up (W0.2) rather than part of this harness.",
  },
  {
    id: 'S12',
    title: 'Agent grep / glob over the project',
    model:
      "The chat RPC handlers handleGrep (fixture marker, whole project) and handleGlobSearch ('**/*.ts') over a composed agent view of the rooted project, mapped as agent-tools' provider filesystem maps it; runs on the authority's thread.",
    times: [
      { metric: 'grepDuration', limit: 2000, description: 'grep ≤ 2 s' },
      { metric: 'globDuration', limit: 200, description: 'glob ≤ 200 ms' },
    ],
    gates: [
      {
        id: 'S12.binary-bytes',
        metric: 'binaryBytesRead',
        comparison: 'equals',
        limit: 0,
        description: 'binary bytes read = 0',
      },
      { id: 'S12.walks', metric: 'walkCalls', comparison: 'equals', limit: 0, description: 'walk calls = 0 (index)' },
    ],
  },
  {
    id: 'S13',
    title: 'LSP module resolution, 3,000 probes',
    model: '1,000 specifiers × up to three candidates (.ts, .tsx, /index.ts): rooted exists, then stat on a hit.',
    times: [{ metric: 'duration', limit: 300, description: '≤ 300 ms' }],
    gates: [
      {
        id: 'S13.metadata-bytes',
        metric: 'bytesRead',
        comparison: 'equals',
        limit: 0,
        description: 'bytes read for exists/stat = 0',
      },
    ],
  },
  {
    id: 'S14',
    title: 'Export 500 MB project zip',
    model: 'content-ops archive of the whole project.',
    times: [
      { metric: 'duration', limit: Number.POSITIVE_INFINITY, description: 'streams, ≤ 1.2× largest file resident' },
    ],
    gates: [],
    pending: 'Owned by W12 (editor/export); not in the W0.1 runner set. The fixture and worker already support it.',
  },
  {
    id: 'S15',
    title: 'Desktop cold open / save',
    model: 'Desktop node provider and native git.',
    times: [{ metric: 'duration', limit: 30_000, description: '≤ 30 s / ≤ 150 ms' }],
    gates: [],
    pending: 'Needs the desktop harness (gate G-D, W11); this harness is browser-only.',
  },
  {
    id: 'S16',
    title: 'Second tab during S3',
    model:
      "S3 in one authority worker while a second authority worker on the same project (a peer tab's file-manager worker, same origin) reads one file every 50 ms and counts the cross-tab invalidations it receives.",
    times: [{ metric: 'readP95', limit: 200, description: 'no stall: second tab read p95 ≤ 200 ms' }],
    gates: [
      {
        id: 'S16.invalidations',
        metric: 'invalidationsPerChangeset',
        comparison: 'at-most',
        limit: 1,
        description: '≤ 1 invalidation per changeset',
      },
    ],
  },
  {
    id: 'S17',
    title: 'Save during S3',
    model: 'S3 while a 1 MiB rooted writeFile to a path the apply never touches is issued once the apply is writing.',
    times: [{ metric: 'saveLatency', limit: 250, description: 'S7 + ≤ 150 ms' }],
    gates: [
      {
        id: 'S17.lock-wait',
        metric: 'saveWait',
        comparison: 'at-most',
        limit: 50,
        description: "the save's lock set waits only on tokens it shares (ms from the save's call to its first byte)",
      },
    ],
  },
  {
    id: 'S18',
    title: 'Agent turn during S4',
    model: 'S8 while the LFS fill runs.',
    times: [{ metric: 'duration', limit: 600, description: 'S8 + ≤ 100 ms' }],
    gates: [
      {
        id: 'S18.fill-waits',
        metric: 'lockWaitsOnFill',
        comparison: 'equals',
        limit: 0,
        description: '0 lock waits on the fill',
      },
    ],
    pending: `Depends on S4. ${serverPending}`,
  },
  {
    id: 'S19',
    title: 'Grep while saving and reading',
    model: 'S12 grep while a 1 MiB save (S7) lands and a viewer reads one file every 20 ms, all on one authority.',
    times: [
      { metric: 'saveLatency', limit: 100, description: 'S7 unchanged' },
      { metric: 'readP95', limit: 200, description: 'reads p95 ≤ 200 ms' },
    ],
    gates: [
      {
        id: 'S19.compute-worker',
        metric: 'authorityReads',
        comparison: 'equals',
        limit: 0,
        description: 'grep runs on the compute worker (authority reads during grep = 0)',
      },
    ],
  },
  {
    id: 'S20',
    title: 'Two tabs cold-open one project',
    model: 'Two tabs cold-opening one hosted project.',
    times: [{ metric: 'duration', limit: 3000, description: 'second tab usable at the same states' }],
    gates: [
      {
        id: 'S20.downloads',
        metric: 'downloadsPerDevice',
        comparison: 'at-most',
        limit: 1,
        description: 'packs/objects downloaded 1× per device',
      },
    ],
    pending: serverPending,
  },
];

/** The profile a row was measured under (I8). */
export type RowProfile = Readonly<{
  fixture: Readonly<{ name: string; seed: number; scale: number; files: number; bytes: number; revisions: number }>;
  browser: Readonly<{ engine: string; version: string }>;
  server: string;
  network: string;
  storage: string;
}>;

/** One gate's outcome. */
export type GateResult = Readonly<{
  id: string;
  metric: string;
  value: number | undefined;
  limit: number;
  pass: boolean;
  knownRed: boolean;
}>;

/** One measured or pending row. */
export type ScenarioRow = Readonly<{
  id: ScenarioId;
  title: string;
  status: 'measured' | 'pending';
  model: string;
  pending?: string;
  profile: RowProfile;
  /** Per-run samples of every metric; times in milliseconds. */
  samples: ReadonlyArray<Readonly<Record<string, number>>>;
  /** The p75 of each metric over the samples. */
  metrics: Readonly<Record<string, number>>;
  times: ReadonlyArray<
    Readonly<{ metric: string; value: number | undefined; limit: number; met: boolean | undefined }>
  >;
  gates: readonly GateResult[];
  /** The production #1410 spans of the last sample. */
  spans?: unknown;
}>;

/**
 * The p75 of a list (nearest rank).
 *
 * @param values - Samples.
 * @returns The 75th percentile, or 0 for none.
 */
export const p75 = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(0.75 * sorted.length) - 1)] ?? 0;
};

/**
 * Evaluate a gate against a row's metrics.
 *
 * @param gate - The gate.
 * @param metrics - The row's p75 metrics.
 * @param knownRed - Gate ids recorded red at HEAD.
 * @returns The outcome; a missing metric fails.
 */
export const evaluateGate = (
  gate: CountGate,
  metrics: Readonly<Record<string, number>>,
  knownRed: ReadonlySet<string>,
): GateResult => {
  const value = metrics[gate.metric];
  const limit = typeof gate.limit === 'number' ? gate.limit : (metrics[gate.limit] ?? Number.NaN);
  const pass =
    value !== undefined && (gate.comparison === 'equals' ? value === limit : value <= limit + Number.EPSILON);
  return { id: gate.id, metric: gate.metric, value, limit, pass, knownRed: knownRed.has(gate.id) };
};

/**
 * Build a row from per-run metric samples.
 *
 * @param definition - The scenario.
 * @param measurement - What it ran under, one metrics record per run, and the last run's worker spans.
 * @param knownRed - Gate ids recorded red at HEAD.
 * @returns The row.
 */
export const measuredRow = (
  definition: ScenarioDefinition,
  {
    profile,
    samples,
    spans,
  }: Readonly<{ profile: RowProfile; samples: ReadonlyArray<Readonly<Record<string, number>>>; spans?: unknown }>,
  knownRed: ReadonlySet<string>,
): ScenarioRow => {
  const names = [...new Set(samples.flatMap((sample) => Object.keys(sample)))].sort();
  const metrics = Object.fromEntries(
    names.map((name) => [name, p75(samples.flatMap((sample) => (sample[name] === undefined ? [] : [sample[name]])))]),
  );
  return {
    id: definition.id,
    title: definition.title,
    status: 'measured',
    model: definition.model,
    profile,
    samples,
    metrics,
    times: definition.times.map(({ metric, limit }) => {
      const value = metrics[metric];
      return { metric, value, limit, met: value === undefined ? undefined : value <= limit };
    }),
    gates: definition.gates.map((gate) => evaluateGate(gate, metrics, knownRed)),
    ...(spans === undefined ? {} : { spans }),
  };
};

/**
 * Build a declared-but-pending row: its gates exist and report no value.
 *
 * @param definition - A scenario with a `pending` reason.
 * @param profile - The profile the run used.
 * @param knownRed - Gate ids recorded red at HEAD.
 * @returns The row.
 */
export const pendingRow = (
  definition: ScenarioDefinition,
  profile: RowProfile,
  knownRed: ReadonlySet<string>,
): ScenarioRow => ({
  id: definition.id,
  title: definition.title,
  status: 'pending',
  model: definition.model,
  pending: definition.pending ?? 'No reason recorded.',
  profile,
  samples: [],
  metrics: {},
  times: definition.times.map(({ metric, limit }) => ({ metric, value: undefined, limit, met: undefined })),
  gates: definition.gates.map((gate) => ({
    id: gate.id,
    metric: gate.metric,
    value: undefined,
    limit: typeof gate.limit === 'number' ? gate.limit : Number.NaN,
    pass: false,
    knownRed: knownRed.has(gate.id),
  })),
});

const formatNumber = (value: number | undefined): string => {
  if (value === undefined || Number.isNaN(value)) {
    return '—';
  }
  if (!Number.isFinite(value)) {
    return '∞';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(value < 10 ? 2 : 0);
};

/**
 * Render rows as the markdown table a baseline records.
 *
 * @param rows - The rows.
 * @returns Markdown: one line per row with its profile, times and gates.
 */
export const renderMarkdown = (rows: readonly ScenarioRow[]): string => {
  const first = rows[0]?.profile;
  const header = first
    ? [
        `Fixture: ${first.fixture.name} (seed ${String(first.fixture.seed)}, scale ${formatNumber(first.fixture.scale)}, ${String(first.fixture.files)} files, ${formatNumber(first.fixture.bytes / 1024 / 1024)} MiB, ${String(first.fixture.revisions)} revisions)`,
        `Browser: ${first.browser.engine} ${first.browser.version}`,
        `Server: ${first.server}`,
        `Network: ${first.network}`,
        `Storage: ${first.storage}`,
        '',
      ]
    : [];
  const lines = [
    '| ID | Scenario | Status | Time (p75) | Target | Count gates (value / limit) | Samples |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => {
      const times = row.times.map((time) => `${time.metric} ${formatNumber(time.value)} ms`).join('; ');
      const targets = row.times.map((time) => `${time.metric} ≤ ${formatNumber(time.limit)} ms`).join('; ');
      const gates =
        row.gates
          .map(
            (gate) =>
              `${row.status === 'pending' ? 'declared' : gate.pass ? 'green' : gate.knownRed ? 'red (known)' : 'RED'} ${gate.id} ${formatNumber(gate.value)} / ${formatNumber(gate.limit)}`,
          )
          .join('; ') || '—';
      return `| ${row.id} | ${row.title} | ${row.status === 'pending' ? 'pending' : 'measured'} | ${row.status === 'pending' ? '—' : times} | ${targets} | ${gates} | ${String(row.samples.length)} |`;
    }),
  ];
  return [...header, ...lines, ''].join('\n');
};
