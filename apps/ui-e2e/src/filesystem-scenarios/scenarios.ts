/**
 * The S1–S20 scenario table (charter "Success criteria and scenario budgets"),
 * its count gates, and the rows a run reports.
 *
 * A row always names its fixture, browser, server and network profile (I8).
 * Count gates are hard: a gate listed in `baseline/known-red.json` is red at
 * HEAD and is expected to stay red until the work package that fixes it lands,
 * which then removes it from that list, and it may never move further from its
 * limit than the value recorded for its profile and engine (I8: count gates
 * never loosen); any other gate must be green. A model-bound gate is declared
 * and reported but not asserted, because the harness has nothing real to
 * measure for it yet; a vacuous gate is asserted but cannot fail until its
 * server tier exists. Time targets are recorded, not asserted, until W13.
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
  /**
   * `model-bound`: what the harness can measure today is fixed by its own
   * model, so the gate is declared and reported but not asserted. `vacuous`:
   * asserted, but it cannot fail before the server tier exists.
   */
  qualifier?: Readonly<{ kind: 'model-bound' | 'vacuous'; reason: string }>;
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
      "The production applyTree (@taucad/revisions/apply-tree, createApplyTreeEffects) materialising the fixture's tree (text bytes plus an LFS pointer per binary) over an empty checkout, with the seams createRevisionActors passes: the rooted view, tau-<role> siblings, and a capture from the production statTree + capture memo + captureRevisionTree. Git fetch and inflate are not part of the window; the apply's own verifying capture is.",
    times: [{ metric: 'duration', limit: 15_000, description: '≤ 15 s' }],
    gates: [
      {
        id: 'S3.changesets',
        metric: 'changesets',
        comparison: 'at-most',
        limit: 'changesetBound',
        description:
          "changesets ≤ ⌈N/256⌉: the apply's bounded changesets (D2: ≤ 256 entries and ≤ 32 MiB each), counted by production",
      },
      {
        id: 'S3.lock-sets',
        metric: 'lockSets',
        comparison: 'at-most',
        limit: 'changesets',
        description: '1 lock set per changeset',
      },
      {
        id: 'S3.events',
        metric: 'busEvents',
        comparison: 'at-most',
        limit: 'changesets',
        description:
          "1 event per changeset per port (counted at the authority's change bus, which every port fans out from)",
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
      "A fresh authority over the populated project (a reload): the file tree's statTree loads the root's persisted Project Index and runs its one head-metadata compare, then one exact stat per file stands in for the per-file status compare a status check makes until W6. The revisions capture memo is not modelled.",
    times: [{ metric: 'duration', limit: 2000, description: '≤ 2 s' }],
    gates: [
      {
        id: 'S5.network',
        metric: 'networkRequests',
        comparison: 'equals',
        limit: 0,
        description: '0 network for content',
        qualifier: {
          kind: 'vacuous',
          reason: 'The harness has no server: a warm open cannot reach the network until the server tier (S1/S9) runs.',
        },
      },
      {
        id: 'S5.blob-reads',
        metric: 'bytesRead',
        comparison: 'equals',
        limit: 0,
        description: '0 blob reads for the status compare (bytes read)',
      },
      {
        id: 'S5.index-compares',
        metric: 'indexCompares',
        comparison: 'equals',
        limit: 1,
        description: "1 head-metadata compare of the root's Project Index per warm open (production `index.compare`)",
      },
      {
        id: 'S5.compares',
        metric: 'metadataRequests',
        comparison: 'at-most',
        limit: 1,
        description: '1 head-metadata compare of N entries',
        qualifier: {
          kind: 'model-bound',
          reason:
            "The runner keeps a per-file stat as the status check's stand-in until W6 drives status from the Project Index, so the count is fixed by the model; the index's own open is one compare.",
        },
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
      {
        id: 'S6.hash-passes',
        metric: 'hashPasses',
        comparison: 'equals',
        limit: 1,
        description: 'hash passes = 1 (the import hashes every byte once, for its object ids)',
      },
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
      {
        id: 'S7.events',
        metric: 'busEvents',
        comparison: 'at-most',
        limit: 1,
        description: "1 event (at the authority's change bus)",
      },
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
      "One agent turn's fifty write tool calls dispatched together through agent-tools' createProviderRpcFileSystem over an agent-masked composed view, as the host issues a turn's parallel calls. Production's own watch counters are read: the measured turn has one recursive change-set watch on the rooted view; a second turn has the production consumers (WorkerChangeChannel, the runtime proxy's dependency watch, agent-host observeLog) registered over real bridge connections; a third adds one per-path watch to prove the per-path counter moves.",
    times: [{ metric: 'duration', limit: 500, description: '≤ 500 ms to durable' }],
    gates: [
      { id: 'S8.changesets', metric: 'lockSets', comparison: 'at-most', limit: 1, description: '1 changeset' },
      {
        id: 'S8.watch',
        metric: 'watchDeliveries',
        comparison: 'equals',
        limit: 1,
        description: '1 change-set delivery to the rooted watch (production counter)',
      },
      {
        id: 'S8.consumers',
        metric: 'consumerChangeSets',
        comparison: 'equals',
        limit: 'consumers',
        description: '1 change-set delivery per production consumer',
      },
      {
        id: 'S8.path-watch',
        metric: 'pathWatchDeliveries',
        comparison: 'equals',
        limit: 0,
        description: '0 per-path watch deliveries with the production consumers registered',
      },
      {
        id: 'S8.path-watch-armed',
        metric: 'armedPathWatchDeliveries',
        comparison: 'equals',
        limit: 50,
        description: '50 per-path deliveries once one per-path consumer is registered (self-check)',
      },
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
      "Needs a git object store holding the fixture's 200 revisions, built through the revision port (createIsomorphicGitRevisionPort) rather than a tree applied in place; a follow-up (W0.2).",
  },
  {
    id: 'S12',
    title: 'Agent grep / glob over the project',
    model:
      "The chat RPC handlers handleGrep (fixture marker, whole project) and handleGlobSearch ('**/*.ts') over agent-tools' createProviderRpcFileSystem on an agent-masked composed view of the imported project (every binary's bytes present); runs on the authority's thread. Fixture caveat (W12.1): every binary now starts with its format's real header (a text STEP replaced by a SolidWorks .sldprt), so the 512-byte NUL sniff judges each one binary; S12.binary-bytes turned green from that fixture change, not from a change to grep, and a real binary without a NUL in its head would still be read in full.",
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
      {
        id: 'S12.listing-bytes',
        metric: 'listingBytesRead',
        comparison: 'at-most',
        limit: 'listingByteCeiling',
        description: "listings' content facts read ≤ one head per file + text within the line-count cap (D4)",
      },
    ],
  },
  {
    id: 'S13',
    title: 'LSP module resolution, 3,000 probes',
    model:
      "1,000 specifiers × up to three candidates (.ts, .tsx, /index.ts): exists, then the version of a hit, answered by the language worker's index mirror (lsp-fs createIndexMirror, fed by feedIndexMirror from the root's index as the file manager feeds it on attach); a path the index never holds would ask the rooted view, as the worker's slot does. The mirror is built before the measured window, as the worker builds it once on attach.",
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
    model:
      "content-ops' streaming archive (archiveStream) of the whole imported project over the user-masked composed view the file manager archives, each file read by readFileStream and deflated as it streams, gathered into a Blob a batch at a time as archive() gathers it. residentPeak is the gathered batch plus the input pulled since the archive last gave bytes back, at its most; residentCeiling is 1.2× the largest file the archive read. archivedFiles, sourceBytes and archiveBytes are recorded for information.",
    times: [{ metric: 'duration', limit: Number.POSITIVE_INFINITY, description: 'streams; no time target' }],
    gates: [
      {
        id: 'S14.resident',
        metric: 'residentPeak',
        comparison: 'at-most',
        limit: 'residentCeiling',
        description: 'streams, ≤ 1.2× largest file resident',
      },
    ],
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
      "S3 (the production applyTree) in one authority worker while a second authority worker on the same project (a peer tab's file-manager worker, same origin) reads one file every 50 ms and counts the cross-tab invalidations it receives.",
    times: [{ metric: 'readP95', limit: 200, description: 'no stall: second tab read p95 ≤ 200 ms' }],
    gates: [
      {
        id: 'S16.invalidations',
        metric: 'invalidationsReceived',
        comparison: 'at-most',
        limit: 'changesets',
        description: "≤ 1 invalidation per changeset (the second tab's notices against the first tab's changesets)",
      },
    ],
  },
  {
    id: 'S17',
    title: 'Save during S3',
    model:
      'S3 (the production applyTree) while a 1 MiB rooted writeFile to a path the apply never touches is issued as soon as the apply has written its first byte, and before it finishes.',
    times: [{ metric: 'saveLatency', limit: 250, description: 'S7 + ≤ 150 ms' }],
    gates: [
      {
        id: 'S17.lock-wait',
        metric: 'applyOperationsBeforeSave',
        comparison: 'at-most',
        limit: 8,
        description:
          "the save's lock set waits only on tokens it shares (apply writes and renames completed between the save's call and the grant of its whole lock set; 8 allows the writes already in flight)",
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
    model:
      "S12's grep and glob run off the authority, as the agent host runs them: on the page, over agent-tools' createProviderRpcFileSystem on an agent-masked composed view of a 'working-copy' bridge port the authority serves, while a 1 MiB save (S7) lands on the authority and a viewer reads one file every 20 ms there; the viewer keeps reading until the sample holds at least 40 reads, so p95 is a percentile and not the slowest read. readMax, readsDuringGrep (reads completed before grep and glob return) and authorityCalls (what the port served) are recorded for information and never gated; authorityReads (the port's reads of fixture files; the concurrent save's own file, which grep lists or not by when the save lands, is left out so the count does not move between runs) is gated by S19.compute-worker.",
    times: [
      { metric: 'saveLatency', limit: 100, description: 'S7 unchanged' },
      { metric: 'readP95', limit: 200, description: 'reads p95 ≤ 200 ms' },
    ],
    gates: [
      {
        id: 'S19.off-authority',
        metric: 'authoritySearchCalls',
        comparison: 'equals',
        limit: 0,
        description: 'grep and glob run off the authority (grep/glob calls the authority serves = 0)',
      },
      {
        /* The charter's own wording: grep runs where the authority serves none of its
         * reads. Off the authority, the reads still cross to it, so this stays red. */
        id: 'S19.compute-worker',
        metric: 'authorityReads',
        comparison: 'equals',
        limit: 0,
        description: 'grep runs on the compute worker (authority reads during grep = 0)',
      },
      {
        /* S7 unchanged while grep runs, as a gate: the save waits behind the grep's
         * reads on the authority's event loop. */
        id: 'S19.save',
        metric: 'saveLatency',
        comparison: 'at-most',
        limit: 100,
        description: 'the save lands within S7 while grep runs (save latency ≤ 100 ms)',
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
  comparison: CountGate['comparison'];
  pass: boolean;
  knownRed: boolean;
  qualifier?: CountGate['qualifier'];
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
  return {
    id: gate.id,
    metric: gate.metric,
    value,
    limit,
    comparison: gate.comparison,
    pass,
    knownRed: knownRed.has(gate.id),
    ...(gate.qualifier === undefined ? {} : { qualifier: gate.qualifier }),
  };
};

/** A gate's comparison and limit: what deciding "no worse" needs. */
type GateBound = Readonly<{ comparison: CountGate['comparison']; limit: number }>;

/**
 * Whether `value` is no worse than `atHead` for a gate.
 *
 * @param gate - The gate's comparison and limit.
 * @param value - The value now.
 * @param atHead - The value recorded at HEAD.
 * @returns For an at-most gate, `value ≤ atHead`; for an equals gate, `value`
 *   lies between `atHead` and the limit (it moved only toward the limit, never
 *   past it to the other side).
 */
const noWorse = ({ comparison, limit }: GateBound, value: number, atHead: number): boolean =>
  comparison === 'equals'
    ? value >= Math.min(atHead, limit) - Number.EPSILON && value <= Math.max(atHead, limit) + Number.EPSILON
    : value <= atHead + Number.EPSILON;

/**
 * Whether an authority read counts toward S19's `authorityReads`.
 *
 * Only the fixture's own files count. S19's concurrent save writes a file the
 * fixture does not hold, and grep lists it or not by when the save lands, so
 * counting it would move the count by one from run to run and fail a known-red
 * gate that held.
 *
 * @param fixturePaths - The fixture plan's paths.
 * @param path - The path the authority was asked to read.
 * @returns True when the read is of a fixture file.
 */
export const countsAsFixtureRead = (fixturePaths: ReadonlyMap<string, unknown>, path: string): boolean =>
  fixturePaths.has(path);

/**
 * Whether a known-red gate has held or improved on its value at HEAD.
 *
 * A known-red gate stays red until its work package lands, but it must not
 * regress: an at-most gate may not exceed its recorded value, and an equals
 * gate may move only toward its limit.
 *
 * @param gate - The evaluated gate.
 * @param atHead - The value recorded at HEAD for this engine and profile.
 * @returns True when the value is no worse than at HEAD.
 */
export const withinBaseline = (gate: GateResult, atHead: number): boolean =>
  gate.value !== undefined && noWorse(gate, gate.value, atHead);

/**
 * The value a record run keeps at HEAD for one known-red gate (I8: count gates
 * never loosen). It keeps the better of the recorded and the observed value, so
 * a noisy or regressed run cannot widen the ratchet; `force` takes the observed
 * value as it is, for a deliberate re-baseline.
 *
 * @param gate - The gate's comparison and limit, as this run evaluated it.
 * @param values - The value recorded at HEAD so far, this run's value, and whether to take it even when worse.
 * @returns The value to record.
 */
export const ratchetAtHead = (
  gate: GateBound,
  {
    recorded,
    observed,
    force,
  }: Readonly<{ recorded: number | undefined; observed: number | undefined; force: boolean }>,
): number | undefined => {
  if (observed === undefined || Number.isNaN(observed)) {
    return recorded;
  }
  if (force || recorded === undefined) {
    return observed;
  }
  return noWorse(gate, observed, recorded) ? observed : recorded;
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
    comparison: gate.comparison,
    pass: false,
    knownRed: knownRed.has(gate.id),
    ...(gate.qualifier === undefined ? {} : { qualifier: gate.qualifier }),
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

const gateLabel = (row: ScenarioRow, gate: GateResult): string => {
  if (row.status === 'pending') {
    return 'declared';
  }
  if (gate.qualifier?.kind === 'model-bound') {
    return 'declared (model-bound)';
  }
  const outcome = gate.pass ? 'green' : gate.knownRed ? 'red (known)' : 'RED';
  return gate.qualifier?.kind === 'vacuous' ? `${outcome} (vacuous)` : outcome;
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
          .map((gate) => `${gateLabel(row, gate)} ${gate.id} ${formatNumber(gate.value)} / ${formatNumber(gate.limit)}`)
          .join('; ') || '—';
      return `| ${row.id} | ${row.title} | ${row.status === 'pending' ? 'pending' : 'measured'} | ${row.status === 'pending' ? '—' : times} | ${targets} | ${gates} | ${String(row.samples.length)} |`;
    }),
  ];
  return [...header, ...lines, ''].join('\n');
};
