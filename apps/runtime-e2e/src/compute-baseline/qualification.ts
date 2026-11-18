/**
 * W0 pinned qualification data for the compute-reuse substrate charter.
 *
 * This module is the single place where the arms, the measured intervals, the
 * corpus with its rights, and the threshold table are written down. It is data
 * only: the harness under `./harness` produces samples, the tests in this
 * directory assert against these tables, and W1-W8 read the thresholds without
 * being able to refit them.
 *
 * Owner: `docs/research/compute-reuse-qualification-blueprint.md` (charter
 * D19/D22-D28). Every entry here quotes an assertion from that blueprint or a
 * measurement receipt named in `source`.
 */

/** Arms from the blueprint's "Arms and measured intervals" table. */
export type ArmId =
  | 'off'
  | 'empty-durable-cold'
  | 'resident-warm'
  | 'durable-warm'
  | 'restart-warm'
  | 'seeded-fanout'
  | 'simultaneously-cold'
  | 'pressure-failure'
  | 'poison';

export type ArmSpec = {
  readonly id: ArmId;
  /** `run-arm.mts --arm` value plus the step list that realises this arm. */
  readonly runner: { readonly arm: 'bypass' | 'memory' | 'durable' | 'poison'; readonly steps: readonly string[] };
  /** Whether the arm needs a process that has never seen the store. */
  readonly freshProcess: boolean;
  /** Worker counts the arm is run at; a single-worker arm is `[1]`. */
  readonly workers: readonly number[];
  /**
   * Absent (the default) means the `runner` mapping actually produces the proof
   * in `proves`. `false` means the arm is declared but its mapping cannot yet
   * produce that proof -- `run-arm.mts` accepts no budget and coordinates no
   * concurrent starts -- so the row must not be read as "the arm exists".
   */
  readonly runnable?: false;
  readonly proves: string;
};

/**
 * Every qualified arm. `off` is the corrected uninstrumented baseline: the
 * runner passes the kernel's `computeReuse: false`, so no live tier is built and
 * no operation cache is installed; every other arm passes `computeReuse: true`
 * (the live tier, which also follows the runtime's compute reuse when omitted).
 */
export const arms: readonly ArmSpec[] = [
  {
    id: 'off',
    runner: { arm: 'bypass', steps: ['cold', 'warm', 'late', 'early', 'unrelated'] },
    freshProcess: true,
    workers: [1],
    proves: 'Zero-work baseline: no live tier, operation cache, tier counters or compute telemetry (T1/G-B2).',
  },
  {
    id: 'empty-durable-cold',
    runner: { arm: 'durable', steps: ['cold'] },
    freshProcess: true,
    workers: [1],
    proves:
      'Incremental cache overhead over an initialised kernel and an empty store, startup counted separately (T3/G-B4).',
  },
  {
    id: 'resident-warm',
    runner: { arm: 'memory', steps: ['cold', 'warm', 'late'] },
    freshProcess: false,
    workers: [1],
    proves:
      'No I/O or codec work on a local hit (a scene-table revisit runs no user code); only the changed cone is natively recomputed (T5).',
  },
  {
    id: 'durable-warm',
    runner: { arm: 'durable', steps: ['cold', 'warm', 'late'] },
    freshProcess: false,
    workers: [1],
    proves:
      'The live tier over a durable store: Replicad builds made with the tier refuse their native snapshot, so the store adds no Replicad import (T5/T9b).',
  },
  {
    id: 'restart-warm',
    runner: { arm: 'durable', steps: ['restart', 'late'] },
    freshProcess: true,
    workers: [1],
    proves:
      'Startup, bind and solve as separate intervals over a store seeded by an earlier process; the fresh process imports no Replicad operation and renders the seed bytes (T6/G-B6/Q4).',
  },
  {
    id: 'seeded-fanout',
    runner: { arm: 'durable', steps: ['restart', 'late'] },
    freshProcess: true,
    workers: [2, 4, 8, 16],
    proves:
      'N independent variant workers over a seeded store: with the live tier none imports a Replicad operation, each does the full native work and renders the seed bytes, and each reuses its own prefix on an edit (T14/G-A/U39).',
  },
  {
    id: 'simultaneously-cold',
    runner: { arm: 'durable', steps: ['cold'] },
    freshProcess: true,
    workers: [2, 4, 8, 16],
    runnable: false,
    proves: 'Duplicate compute amplification and first-writer behaviour when workers overlap before publication (U39).',
  },
  {
    id: 'pressure-failure',
    runner: { arm: 'durable', steps: ['cold', 'late'] },
    freshProcess: true,
    workers: [1],
    runnable: false,
    proves:
      'Bounded store/resident/pending budget: the arm must miss correctly without violating limits (C-gates/U38).',
  },
  {
    id: 'poison',
    runner: { arm: 'poison', steps: ['cold'] },
    freshProcess: true,
    workers: [1],
    proves:
      "Fault injection: a deliberately wrong cached BRep, answered at the live tier's operation cache, must fail the parity oracle and collapse the work counters (Q1/T7/U41).",
  },
];

/**
 * Measured intervals. `span` names the telemetry span or probe counter the
 * harness records per step; `aggregate` names a value computed from the step.
 * "Reporting only milliseconds before a Promise resolves hides deferred cost",
 * so the publication tail (`session.flush`) is a first-class interval.
 */
export type IntervalSpec = {
  readonly id: string;
  readonly source: { readonly kind: 'span' | 'counter' | 'aggregate'; readonly key: string };
  readonly phase: 'startup' | 'bind' | 'discovery' | 'solve' | 'mesh' | 'encode' | 'store' | 'whole';
  readonly note: string;
};

export const intervals: readonly IntervalSpec[] = [
  {
    id: 'request-to-usable-result',
    source: { kind: 'aggregate', key: 'wallMs' },
    phase: 'whole',
    note: 'Request arrival to usable result for one step.',
  },
  {
    id: 'whole-render',
    source: { kind: 'span', key: 'kernel.render' },
    phase: 'whole',
    note: 'Whole render span inside the worker.',
  },
  {
    id: 'kernel-startup',
    source: { kind: 'span', key: 'kernel.init' },
    phase: 'startup',
    note: 'Kernel construction, before any model work.',
  },
  {
    id: 'wasm-boot',
    source: { kind: 'span', key: 'replicad.wasm-init' },
    phase: 'startup',
    note: 'OCCT WebAssembly boot; T6 forbids charging this to warm preparation.',
  },
  {
    id: 'kernel-select',
    source: { kind: 'span', key: 'kernel.select' },
    phase: 'startup',
    note: 'Kernel selection including wasm boot and font load.',
  },
  {
    id: 'bundle',
    source: { kind: 'span', key: 'kernel.bundle' },
    phase: 'bind',
    note: 'Source bundling for the entry module.',
  },
  {
    id: 'resolve-deps',
    source: { kind: 'span', key: 'kernel.resolve-deps' },
    phase: 'bind',
    note: 'Dependency discovery, read, hash and content hash.',
  },
  {
    id: 'scene-revisit',
    source: { kind: 'span', key: 'replicad.scene-table-hit' },
    phase: 'discovery',
    note: 'A build key the live tier has seen returns its scene without running user code (R16). Replaces the store bind/prefetch interval: the live tier opens no store session.',
  },
  {
    id: 'native-solve',
    source: { kind: 'counter', key: 'native.solve' },
    phase: 'solve',
    note: 'Every native computation the live tier lets through its operation cache (misses and unkeyable calls), timed. Replaces warm import: the live tier imports nothing from a store.',
  },
  {
    id: 'main-program-execution',
    source: { kind: 'span', key: 'create.runOcMain' },
    phase: 'solve',
    note: 'The whole model program: runOcMain wraps main(), so this span also contains every operation the live tier answers or computes. It BOUNDS native solve; native.solve isolates it.',
  },
  {
    id: 'interface-resolution',
    source: { kind: 'span', key: 'create.resolveInterfaces' },
    phase: 'solve',
    note: 'W11 stage; G-B10 pins its share of the whole wall, G-B10-abs holds its absolute cost provisionally.',
  },
  {
    id: 'topology',
    source: { kind: 'span', key: 'create.serializeNativeHandle' },
    phase: 'solve',
    note: 'Native handle serialisation for the topology payload.',
  },
  {
    id: 'mesh',
    source: { kind: 'span', key: 'kernel.mesh' },
    phase: 'mesh',
    note: 'Tessellation plus GLB packing; G-I1 lives here.',
  },
  {
    id: 'tessellate-faces',
    source: { kind: 'span', key: 'replicad.tessellate.faces' },
    phase: 'mesh',
    note: 'Face tessellation alone.',
  },
  { id: 'encode-glb', source: { kind: 'span', key: 'mesh.packGltf' }, phase: 'encode', note: 'GLB packing.' },
  {
    id: 'tier-hits',
    source: { kind: 'aggregate', key: 'lookups.hit' },
    phase: 'store',
    note: 'Operations the live tier answered with a native clone (no codec: the BRep serialize/restore intervals no longer exist), from the replicad.run-main span.',
  },
  {
    id: 'tier-admissions',
    source: { kind: 'aggregate', key: 'records.staged' },
    phase: 'store',
    note: 'Operation results the live tier admitted, from the replicad.run-main span; native clones, so no bytes.',
  },
  {
    id: 'tier-operation',
    source: { kind: 'counter', key: 'tier.operation' },
    phase: 'store',
    note: "Per-operation cost at the live tier's operation cache, the compute included; T12 requires bounded indexed work.",
  },
  {
    id: 'tier-cold-misses',
    source: { kind: 'aggregate', key: 'lookups.miss' },
    phase: 'store',
    note: 'Keyed operations the live tier had not seen, from the replicad.run-main span.',
  },
  {
    id: 'publication-settlement',
    source: { kind: 'counter', key: 'session.flush' },
    phase: 'store',
    note: 'Deferred publication tail; T13 amortisation must include it.',
  },
  {
    id: 'store-directory-scans',
    source: { kind: 'counter', key: 'fs.readdirStat' },
    phase: 'store',
    note: 'T12/G-B15: the new substrate must reach ZERO here.',
  },
  {
    id: 'store-writes',
    source: { kind: 'counter', key: 'fs.writeFile' },
    phase: 'store',
    note: 'Write count and bytes at the filesystem seam.',
  },
];

/**
 * Corpus with provenance and rights.
 *
 * `rights: 'workspace-apache-2.0'` means the model is tracked in this
 * repository under `libs/tau-examples` (LICENSE Apache-2.0) or authored for
 * this harness, and may be distributed with it. `rights: 'host-local'` means
 * the model lives in the operator's private model workspace, carries no
 * licence, and must NOT become a distributed fixture: it is reachable only via
 * `TAU_COMPUTE_BASELINE_WORKSPACE` and its arms are skipped everywhere else,
 * including public CI.
 */
export type CorpusEntry = {
  readonly model: string;
  readonly kernel: 'replicad' | 'build123d' | 'openrscad';
  readonly rights: 'workspace-apache-2.0' | 'host-local';
  readonly origin: string;
  readonly role: 'fault-injection' | 'negative-control' | 'heavy' | 'downstream';
};

export const corpus: readonly CorpusEntry[] = [
  {
    model: 'parity-box',
    kernel: 'replicad',
    rights: 'workspace-apache-2.0',
    origin: 'Authored in harness/models.mts for W0; exact known shape.',
    role: 'fault-injection',
  },
  {
    model: 'hollow-box',
    kernel: 'replicad',
    rights: 'workspace-apache-2.0',
    origin: 'libs/tau-examples/src/kernels/replicad/hollow-box',
    role: 'negative-control',
  },
  {
    model: 'stress-test',
    kernel: 'replicad',
    rights: 'workspace-apache-2.0',
    origin: 'libs/tau-examples/src/kernels/replicad/stress-test',
    role: 'heavy',
  },
  {
    model: 'v8-block-late',
    kernel: 'replicad',
    rights: 'workspace-apache-2.0',
    origin: 'libs/tau-examples/src/kernels/replicad/v8-engine-rev2 plus a harness-side trailing probe cut',
    role: 'heavy',
  },
  {
    model: 'v8-head',
    kernel: 'replicad',
    rights: 'workspace-apache-2.0',
    origin: 'libs/tau-examples/src/kernels/replicad/v8-engine-rev2',
    role: 'heavy',
  },
  {
    model: 'v8-brep-py',
    kernel: 'build123d',
    rights: 'workspace-apache-2.0',
    origin: 'libs/tau-examples/src/kernels/build123d/v8-engine-brep',
    role: 'heavy',
  },
  {
    model: 'kitchen-sink',
    kernel: 'openrscad',
    rights: 'workspace-apache-2.0',
    origin: 'libs/tau-examples/src/kernels/openscad/kitchen-sink',
    role: 'downstream',
  },
  {
    model: 'csg-grid',
    kernel: 'openrscad',
    rights: 'workspace-apache-2.0',
    origin: 'harness/fixtures/csg-grid.scad, authored for this harness',
    role: 'downstream',
  },
  {
    model: 'drone',
    kernel: 'replicad',
    rights: 'host-local',
    origin: 'Operator model workspace `racing-drone-frame-fork`; no licence file. Charter reference workload.',
    role: 'heavy',
  },
  {
    model: 'quadcopter',
    kernel: 'replicad',
    rights: 'host-local',
    origin: 'Operator model workspace `quadcopter`; no licence file.',
    role: 'heavy',
  },
];

/**
 * Threshold table.
 *
 * `status: 'pinned'` means the value is derived from a measurement receipt
 * named in `source` under an admitted load, or is structurally load-invariant
 * (counts, not durations). `status: 'provisional'` means the
 * blueprint proposes it but no admitted measurement exists yet on this host --
 * W1-W8 may not treat a provisional row as a passing gate, and no row may be
 * refitted to a failing optimised implementation (D19).
 */
export type Threshold = {
  readonly id: string;
  readonly gate: string;
  readonly value: string;
  readonly status: 'pinned' | 'provisional';
  readonly source: string;
};

export const thresholds: readonly Threshold[] = [
  {
    id: 'T1',
    gate: 'Off arm performs zero store calls and zero codec work',
    value: 'tier.operation = 0, native.solve = 0 (no operation cache installed), tier lookups and admissions = 0',
    status: 'pinned',
    source:
      'Structural: the off arm passes computeReuse: false, so the kernel builds no live tier and never calls setOperationCache; asserted by compute-baseline-parity.test.ts. The store-binding half of charter D14 is covered by the qualification matrix (compute-qualification.test.ts: no compute store writes with reuse off).',
  },
  {
    id: 'T2',
    gate: 'Cheap control adds bounded work',
    value: 'hollow-box: no admitted records and no publication',
    status: 'provisional',
    source: 'Blueprint T2; the old zero-lookups claim is explicitly not portable to the new native hooks.',
  },
  {
    id: 'T3',
    gate: 'Initialised durable cold wall',
    value: '<= 1.15x the off arm on the same model',
    status: 'provisional',
    source: 'Blueprint T3 proposal; needs an admitted paired campaign.',
  },
  {
    id: 'T4',
    gate: 'Whole-render late edit',
    value: 'ratio <= 1 - 0.6 x (1 - 1/C), C measured per model',
    status: 'provisional',
    source:
      'Blueprint T4. Drone C = 3.26 [2.67-3.59], n=4, from the lane-b exploration; 0.6 is a policy target, not a measurement.',
  },
  {
    id: 'T5',
    gate: 'Durable late vs resident late',
    value: '<= 1.10x resident late',
    status: 'provisional',
    source: 'Blueprint T5 proposal; needs an admitted paired durable-vs-resident campaign on this host.',
  },
  {
    id: 'T6',
    gate: 'Restart warm preparation',
    value: '250 ms preparation and 1.25x resident, excluding interpreter/WASM boot',
    status: 'provisional',
    source: 'Blueprint T6; wasm-boot is a separate interval here so the exclusion is measurable.',
  },
  {
    id: 'T7',
    gate: 'Independent geometry oracle',
    value: 'Bounds, per-occurrence world placement, mesh volume and occurrence labels, not topology+volume alone',
    status: 'pinned',
    source:
      'Implemented in oracle.ts; the injected translate/mirror/swap attacks fail it (compute-baseline-oracle.test.ts).',
  },
  {
    id: 'T9a',
    gate: 'Resident admission floor',
    value: 'Replicad 1 ms, build123d 5 ms',
    status: 'provisional',
    source: 'Blueprint T9a measured floors from earlier lanes; not re-measured on this host.',
  },
  {
    id: 'T9b',
    gate: 'Durable admission floor',
    value: 'Replicad 20 ms, build123d 25 ms',
    status: 'provisional',
    source: 'Blueprint T9b; binary-codec economics still to be remeasured independently.',
  },
  {
    id: 'T12',
    gate: 'Indexed store work',
    value: 'fs.readdirStat = 0 per published record in the new substrate',
    status: 'pinned',
    source:
      'Shipped baseline measured 21 readdirStat calls on parity-box cold (2026-09-09, load 39.5) -- the ceiling W2 must drive to zero.',
  },
  {
    id: 'T13',
    gate: 'Amortisation',
    value: 'durable cold overhead including the publication tail <= 5x the per-late-edit saving',
    status: 'provisional',
    source: 'Blueprint T13; needs an admitted paired campaign on a heavy model including the publication tail.',
  },
  {
    id: 'T14',
    gate: 'Seeded 2/4/8/16 prefix reuse',
    value: 'zero native solves for declared eligible unchanged actions; improved CPU/throughput vs isolated workers',
    status: 'provisional',
    source:
      'Arms exist and are runnable (compute-baseline-arms.test.ts); the throughput half needs an admitted campaign.',
  },
  {
    id: 'G-I1',
    gate: 'build123d rotated-sphere mesh time',
    value: '1.645x the original (target 1.0) -- ACCEPTED EXCEPTION',
    status: 'pinned',
    source:
      'W10 / CR-PRE-1-W10-a1, accepted with named exceptions under operator Q7. Measured fact; never fit a threshold to it.',
  },
  {
    id: 'G-F9',
    gate: 'build123d module scan',
    value: 'first idle-resume scan 14.7 ms (target < 5 ms); 99/100 scans pass -- ACCEPTED EXCEPTION',
    status: 'pinned',
    source: 'W10 / CR-PRE-1-W10-a1, accepted with named exceptions under operator Q7.',
  },
  {
    id: 'G-B10',
    gate: 'Replicad interface enumeration share of the whole wall',
    value:
      'candidate 14.808% median [13.579-15.538] of the whole wall across all 5 samples, target <= 20%; enumeration is linear in the module set (source proof)',
    status: 'pinned',
    source:
      'W11 / CR-PRE-1-R-a4, 5 alternating pairs 2026-09-05. A candidate-internal ratio and a structural proof, both load-invariant: the worst sample keeps a 4.46 pp margin and dropping the interference-contaminated pair 2 leaves the same worst case.',
  },
  {
    id: 'G-B10-abs',
    gate: 'Replicad interface enumeration absolute stage cost',
    value: 'create.resolveInterfaces 1065.79 ms median [994.28-1079.40]',
    status: 'provisional',
    source:
      'W11 / CR-PRE-1-R-a4 at 1-min load 2.13-4.94, host not exclusive. NOT pinnable from that campaign: the same span on the same model measured 1262.1-1755.7 ms at load 16-23 (CR-W0-a1 baseline-provisional/v8-block-late-bypass.json), up to 65% higher. Needs a quiet-window (load < 3) re-measure.',
  },
];
