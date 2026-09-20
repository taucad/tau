import { cacheReplayMatches } from '#bench/cache-state';
import type { RssReceipt } from '#bench/process-rss';
import type { SourceRewardInput } from '#bench/source-reward';
import { completeReports, firstReportMatches } from '#bench/report-validation';
import { measurementMembers } from '#bench/measurements';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readHashed, sha256, compareProductReports } from '#bench/lib';
import type { Artifact, ProductBenchmarkConfig } from '#bench/lib';

/**
 * Q7 modes are distinct state contracts, not labels for fresh processes.
 * @internal
 */
export type CampaignMode =
  | 'cold-process'
  | 'warm-engine-cold-subject'
  | 'resident-warm'
  | 'persisted-warm'
  | 'incremental-edit'
  | 'source-to-reward';
/**
 * Independent blocking ratio measurements.
 * @internal
 */
export type CampaignMetric =
  | 'firstActionableReportNs'
  | 'suiteReportNs'
  | 'throughputPerSecond'
  | 'processTreePeakRssBytes';
/**
 * Frozen case, axis and complete profile-specific expected reports.
 * @internal
 */
export type CampaignCase = {
  id: string;
  workload: string;
  mode: CampaignMode;
  /** Claims-only incremental edit on identical source artifact; full prior-profile results are required. */
  priorWorkload?: string;
  sourceReward?: SourceRewardInput;
  /** Parent for unique per-arm private stores, outside the actual project root. */
  persistedCache?: { parent: string; projectRoot: string };
  prefillExpected?: Record<string, Artifact>;
  axis: 'reference-vs-native' | 'native-base-vs-candidate';
  baseline: string;
  candidate: string;
  class: 'ordinary' | 'scale' | 'suite' | 'microcase';
  /**
   * Nanoseconds; required only for microcases.
   */
  sampleBudgetNs?: number;
  metrics: CampaignMetric[];
  expected: Record<string, Artifact>;
  /**
   * Reviewed equal-work disposition for differing canonical profiles.
   */
  equivalence?: Artifact;
};
/**
 * Explicit opt-in campaign inputs. No readiness value has a true default.
 * @internal
 */
export type ProductCampaign = {
  id: string;
  ready: boolean;
  frozenProducts: boolean;
  environment: Artifact;
  /** Declared sampled parent/descendant RSS cadence and final reap deadline, milliseconds. */
  rss?: { samplePeriod: number; reapDeadline: number };
  /** Milliseconds; warm setup and post-ACK cleanup/reap are separate from the public report budget. */
  deadlines?: { startup: number; cleanup: number };
  /** Pinned analysis runtime, separate from product Python consumers. */
  analysis?: { python: Artifact; numpyVersion: string };
  /**
   * Complete harness, runtime executable, package and installed dependency closure.
   */
  freeze: Artifact[];
  /**
   * Four distinct, predeclared PCG64 SeedSequence entropy values.
   */
  seeds: [number, number, number, number];
  cases: CampaignCase[];
  /**
   * Profile/resource/coverage acceptance receipts remain independent of latency.
   */
  gates: Partial<
    Record<
      | 'selectedParity'
      | 'targetMatrix'
      | 'modeMatrix'
      | 'batchThroughput'
      | 'processTreeRss'
      | 'deliverySizes'
      | 'boundaryCopies'
      | 'workReuse',
      Artifact
    >
  >;
};
/**
 * One paired block plus its public-boundary sensitivity arms.
 * @internal
 */
export type CampaignBlock = {
  caseId: string;
  phase: 'aa-baseline' | 'aa-candidate' | 'product';
  pair: number;
  measured: boolean;
  order: ['A', 'B'] | ['B', 'A'];
  routes: { A: string; B: string };
  plants: Array<'firstActionableReportNs' | 'suiteReportNs'>;
};
/**
 * Result fields consumed from the existing installed-product worker.
 * @internal
 */
// oxlint-disable-next-line typescript/no-restricted-types -- Persisted JSON observations use explicit null for absent measurements.
type ObservationNull = null;

/**
 * Fields returned by the existing product runner.
 * @internal
 */
export type CampaignObservation = {
  successful: boolean;
  firstReport?: unknown;
  processTreeRss?: RssReceipt;
  processTreePeakRssBytes?: number | ObservationNull;
  throughputPerSecond?: number;
  completedSubjects?: number;
  completedClaims?: number;
  persistedPreparation?: CampaignObservation;
  stateReady?: Record<string, unknown>;
  startupReadyNs?: number;
  firstActionableReportNs: number | ObservationNull;
  suiteReportNs: number | ObservationNull;
  suiteReports: Array<Record<string, unknown>> | ObservationNull;
  qualification: Record<string, unknown>;
  result: Record<string, unknown> | ObservationNull;
};

const explicitlyTrue = (value: unknown): boolean => value === true;

const modes = new Set<CampaignMode>([
  'cold-process',
  'warm-engine-cold-subject',
  'resident-warm',
  'persisted-warm',
  'incremental-edit',
  'source-to-reward',
]);
const steadyModes = new Set<CampaignMode>(['warm-engine-cold-subject', 'resident-warm', 'incremental-edit']);
const metrics = new Set<CampaignMetric>([
  'firstActionableReportNs',
  'suiteReportNs',
  'throughputPerSecond',
  'processTreePeakRssBytes',
]);
/**
 * Mandatory conjunctive acceptance categories.
 * @internal
 */
export const campaignGates = [
  'selectedParity',
  'targetMatrix',
  'modeMatrix',
  'batchThroughput',
  'processTreeRss',
  'deliverySizes',
  'boundaryCopies',
  'workReuse',
] as const;

/**
 * Freeze fixed sample/alpha parameters; includes control hypotheses conservatively.
 * @internal
 * @param cases - Complete predeclared case and metric family.
 * @returns Exact Q7 parameters.
 */
export const campaignStatistics = (
  cases: CampaignCase[],
): {
  measuredPairs: number;
  steadyWarmupPairs: number;
  familyAlpha: number;
  familySize: number;
  productHypotheses: number;
  controlHypotheses: number;
  caseAlpha: number;
  tailAlpha: number;
  resamples: number;
  endpointTolerance: number;
  generator: string;
  method: string;
} => {
  const productHypotheses = cases.reduce(
    (sum, item) =>
      sum +
      item.metrics.filter(
        (metric) =>
          !(
            item.axis === 'reference-vs-native' &&
            (metric === 'processTreePeakRssBytes' || (item.class === 'microcase' && metric.endsWith('ReportNs')))
          ),
      ).length,
    0,
  );
  const controlHypotheses = cases.reduce(
    (sum, item) =>
      sum + 2 * (item.metrics.length + item.metrics.filter((metric) => metric.endsWith('ReportNs')).length),
    0,
  );
  const familySize = productHypotheses + controlHypotheses;
  assert.ok(familySize > 0, 'A campaign requires a nonempty hypothesis family.');
  const caseAlpha = 0.01 / familySize;
  return {
    measuredPairs: 120,
    steadyWarmupPairs: 5,
    familyAlpha: 0.01,
    familySize,
    productHypotheses,
    controlHypotheses,
    caseAlpha,
    tailAlpha: caseAlpha / 2,
    resamples: Math.max(1_000_000, Math.ceil(100 / (caseAlpha / 2))),
    endpointTolerance: 0.002,
    generator: 'numpy.random.PCG64',
    method: 'whole-pair-log-ratio-percentile',
  };
};

/**
 * Build the entire schedule before launch; no optional stopping or data extension.
 * @internal
 * @param cases - Complete predeclared case and mode family.
 * @returns Immutable serial pair order.
 */
export const campaignSchedule = (cases: CampaignCase[]): CampaignBlock[] =>
  cases.flatMap((item) => {
    const warmups = steadyModes.has(item.mode) ? 5 : 0;
    return (['aa-baseline', 'aa-candidate', 'product'] as const).flatMap((phase) =>
      Array.from({ length: 120 + warmups }, (_, index) => ({
        caseId: item.id,
        phase,
        pair: index - warmups,
        measured: index >= warmups,
        order: ((index - warmups) % 2 === 0 ? ['A', 'B'] : ['B', 'A']) as CampaignBlock['order'],
        routes: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Frozen AB/BA protocol arm names.
          A: phase === 'aa-candidate' ? item.candidate : item.baseline,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Frozen AB/BA protocol arm names.
          B: phase === 'aa-baseline' ? item.baseline : item.candidate,
        },
        // A third arm follows the completed A/A pair: the exact paired-A duration is
        // now known even in BA blocks. It never contributes to product comparisons.
        plants:
          phase === 'product'
            ? []
            : item.metrics.filter((metric): metric is 'firstActionableReportNs' | 'suiteReportNs' =>
                metric.endsWith('ReportNs'),
              ),
      })),
    );
  });

const validateCase = (config: ProductBenchmarkConfig, item: CampaignCase): void => {
  assert.ok(modes.has(item.mode), `Unknown mode: ${item.mode}`);
  assert.ok(
    item.metrics.length > 0 &&
      new Set(item.metrics).size === item.metrics.length &&
      item.metrics.every((metric) => metrics.has(metric)),
    `Invalid metrics: ${item.id}`,
  );
  assert.ok(['ordinary', 'scale', 'suite', 'microcase'].includes(item.class), `Invalid workload class: ${item.id}`);
  assert.ok(['reference-vs-native', 'native-base-vs-candidate'].includes(item.axis), `Invalid axis: ${item.id}`);
  assert.ok(
    config.workloads.some(({ id }) => id === item.workload),
    `Unknown workload: ${item.workload}`,
  );
};

const comparisonInputGaps = (config: ProductBenchmarkConfig, item: CampaignCase): string[] => {
  const gaps: string[] = [];
  const left = config.routes[item.baseline];
  const right = config.routes[item.candidate];
  if (
    left?.state === 'ready' &&
    right?.state === 'ready' &&
    (!left.parityProfile || left.parityProfile !== right.parityProfile) &&
    !item.equivalence
  ) {
    gaps.push(`${item.id}: cross-profile equal-work disposition is absent`);
  }
  if (item.axis === 'native-base-vs-candidate' && (left?.backend === 'legacy' || left?.backend !== right?.backend)) {
    gaps.push(`${item.id}: regression axis requires matching native or mixed deployment backends`);
  }
  if (item.axis === 'reference-vs-native' && (left?.backend !== 'legacy' || right?.backend === 'legacy')) {
    gaps.push(`${item.id}: reference axis requires legacy and a native-engine product (native or mixed)`);
  }
  return gaps;
};

const caseInputGaps = (config: ProductBenchmarkConfig, item: CampaignCase): string[] => {
  const gaps: string[] = [];
  validateCase(config, item);
  const members = measurementMembers(config.workloads, item.workload);
  const workload = config.workloads.find(({ id }) => id === item.workload)!;
  if (item.class === 'suite' && workload.kind !== 'selected-suite') {
    gaps.push(`${item.id}: suite class requires the entire selected-suite inventory`);
  }
  if (item.mode !== 'cold-process' && (members.length > 1 || workload.kind !== 'broad-fixture')) {
    gaps.push(`${item.id}: stateful contract currently requires one broad public workload`);
  }
  if (item.mode === 'persisted-warm' && !item.persistedCache) {
    gaps.push(`${item.id}: explicit private per-arm cache parent/project root absent`);
  }
  if (
    item.mode === 'incremental-edit' &&
    (!item.priorWorkload ||
      item.priorWorkload === item.workload ||
      !config.workloads.some((value) => value.id === item.priorWorkload && value.kind === 'broad-fixture'))
  ) {
    gaps.push(`${item.id}: distinct frozen prior broad claim workload absent`);
  }
  if (item.mode === 'source-to-reward' && item.sourceReward?.cacheState !== 'fresh-runtime-memory') {
    gaps.push(`${item.id}: frozen C2 source/runtime input and cache state absent`);
  }
  if (item.class === 'microcase') {
    assert.ok(
      Number.isFinite(item.sampleBudgetNs) && item.sampleBudgetNs! > 0,
      'Microcases require a frozen finite timeout.',
    );
  }
  for (const name of [item.baseline, item.candidate]) {
    const route = config.routes[name];
    if (
      route?.state !== 'ready' ||
      (route.supportedWorkloads && members.some((member) => !route.supportedWorkloads!.includes(member.workload)))
    ) {
      gaps.push(`${item.id}/${name}: installed route/workload is unavailable`);
    }
    if (
      item.mode !== 'cold-process' &&
      route?.state === 'ready' &&
      !['installed-js', 'installed-legacy-js'].includes(route.execution.kind) &&
      !route.stateContracts?.some((mode) => mode === item.mode)
    ) {
      gaps.push(`${item.id}/${name}: consumer event adapter has no state-ready protocol`);
    }
    if (item.mode === 'incremental-edit' && !item.prefillExpected?.[name]) {
      gaps.push(`${item.id}/${name}: complete prior-profile results absent`);
    }
    if (
      item.mode === 'persisted-warm' &&
      (route?.state !== 'ready' ||
        route.backend !== 'native' ||
        route.cacheContract !== 'native-authenticated-overlap-a3')
    ) {
      gaps.push(
        `${item.id}/${name}: authenticated A3 native cache not declared; historical A14 unsupported and current mixed resident-only`,
      );
    }
    if (!item.expected[name]) {
      gaps.push(`${item.id}/${name}: complete expected reports are absent`);
    }
    if (!route?.profile) {
      gaps.push(`${item.id}/${name}: canonical profile is absent`);
    }
  }
  gaps.push(...comparisonInputGaps(config, item));
  for (const metric of item.metrics) {
    if (metric === 'throughputPerSecond' && workload.kind !== 'independent-subject-batch') {
      gaps.push(`${item.id}: throughput requires a declared independent-subject batch`);
    }
  }
  return gaps;
};

/**
 * Classify unsupported state contracts before spawning, never emulate warm with cold.
 * @internal
 * @param config - Product route/workload declarations.
 * @param campaign - Explicit campaign readiness and freeze.
 * @returns Specific missing implementation inputs.
 */
export const campaignInputGaps = (config: ProductBenchmarkConfig, campaign: ProductCampaign): string[] => {
  assert.ok(campaign.id.trim(), 'Campaign id is required.');
  assert.equal(new Set(campaign.seeds).size, 4, 'Four distinct seed streams are required.');
  assert.ok(
    campaign.seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0),
    'Seeds must be unsigned safe integers.',
  );
  assert.ok(
    campaign.cases.length > 0 && new Set(campaign.cases.map(({ id }) => id)).size === campaign.cases.length,
    'Campaign cases must be nonempty and unique.',
  );
  const gaps: string[] = [];
  if (!explicitlyTrue(campaign.ready)) {
    gaps.push('campaign.ready is not explicitly true');
  }
  if (!explicitlyTrue(campaign.frozenProducts)) {
    gaps.push('products are not explicitly frozen');
  }
  if (!campaign.analysis) {
    gaps.push('pinned PCG64 analysis Python/NumPy runtime is absent');
  }
  if (campaign.freeze.length === 0) {
    gaps.push('complete frozen harness/product/runtime closure is absent');
  }
  if (
    campaign.cases.some((item) => item.metrics.includes('processTreePeakRssBytes')) &&
    (!campaign.rss ||
      !Number.isFinite(campaign.rss.samplePeriod) ||
      campaign.rss.samplePeriod <= 0 ||
      !Number.isFinite(campaign.rss.reapDeadline) ||
      campaign.rss.reapDeadline <= 0)
  ) {
    gaps.push('RSS sampling cadence/final-reap deadline absent or invalid');
  }
  if (
    !campaign.deadlines ||
    !Number.isFinite(campaign.deadlines.startup) ||
    campaign.deadlines.startup <= 0 ||
    !Number.isFinite(campaign.deadlines.cleanup) ||
    campaign.deadlines.cleanup <= 0
  ) {
    gaps.push('finite startup and cleanup/reap deadlines absent');
  }
  gaps.push(...campaign.cases.flatMap((item) => caseInputGaps(config, item)));
  return gaps;
};

/**
 * Verify every full report including a legitimate failed verdict against its own profile.
 * @internal
 * @param observation - Complete settled worker reports.
 * @param expected - Independently frozen complete profile vector.
 * @param backend - Explicit frozen backend; only legacy omits successor canonical records.
 * @returns Complete semantic qualification without tolerance fitting.
 */
export const validateCampaignObservation = (
  observation: CampaignObservation,
  expected: unknown,
  backend: string,
): boolean =>
  observation.successful &&
  completeReports(expected, backend) &&
  completeReports(observation.suiteReports, backend) &&
  firstReportMatches(observation.firstReport, expected, backend) &&
  observation.qualification['evaluationCompleted'] === true &&
  observation.qualification['expectedMatches'] !== false &&
  observation.qualification['overlapVerified'] === true &&
  compareProductReports(observation.suiteReports, expected);

/** Verify selected measurement counts and live-state evidence before another scheduled arm.
 * @internal
 * @param observation - Complete worker/aggregate receipt.
 * @param item - Frozen metric/mode selection.
 * @param config - Frozen workload inventory.
 * @returns Whether requested metrics have actual bounded attribution.
 */
export const validateMeasurementEvidence = (
  observation: CampaignObservation,
  item: CampaignCase,
  config: ProductBenchmarkConfig,
): boolean => {
  if (item.metrics.includes('throughputPerSecond')) {
    const members = measurementMembers(config.workloads, item.workload);
    if (
      members.length < 2 ||
      observation.completedSubjects !== members.length ||
      observation.completedClaims !== observation.suiteReports?.length ||
      !observation.suiteReportNs ||
      observation.throughputPerSecond !== (members.length * 1_000_000_000) / observation.suiteReportNs
    ) {
      return false;
    }
  }
  if (item.metrics.includes('processTreePeakRssBytes')) {
    const rss = observation.processTreeRss;
    if (
      !rss?.complete ||
      rss.peakBytes !== observation.processTreePeakRssBytes ||
      rss.samples.length === 0 ||
      rss.errors.length > 0 ||
      rss.remainingDescendants.length > 0
    ) {
      return false;
    }
  }
  if (
    steadyModes.has(item.mode) &&
    (observation.stateReady?.['mode'] !== item.mode || observation.startupReadyNs === undefined)
  ) {
    return false;
  }
  if (
    item.mode === 'persisted-warm' &&
    !cacheReplayMatches(observation.persistedPreparation?.result?.['cache'], observation.result?.['cache'])
  ) {
    return false;
  }
  if (item.mode === 'source-to-reward' && !observation.result?.['sourceReward']) {
    return false;
  }
  return true;
};

/**
 * Load independently frozen report vectors before timing.
 * @internal
 * @param config - Declared product profiles.
 * @param campaign - Frozen expected vectors and equivalence dispositions.
 * @returns Per-case/route full expected reports.
 */
export const campaignExpectations = async (
  config: ProductBenchmarkConfig,
  campaign: ProductCampaign,
): Promise<Map<string, unknown>> => {
  const expected = new Map<string, unknown>();
  for (const item of campaign.cases) {
    for (const name of new Set([item.baseline, item.candidate])) {
      const artifact = item.expected[name];
      if (!artifact) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Preserve deterministic preflight error attribution.
      const reports: unknown = JSON.parse(Buffer.from(await readHashed(artifact)).toString());
      assert.ok(
        completeReports(reports, config.routes[name]?.backend ?? ''),
        'Expected vectors must contain complete profile-specific records.',
      );
      expected.set(`${item.id}/${name}`, reports);
    }
    const left = config.routes[item.baseline];
    const right = config.routes[item.candidate];
    const sameProfile =
      left?.state === 'ready' &&
      right?.state === 'ready' &&
      left.parityProfile !== undefined &&
      left.parityProfile === right.parityProfile;
    if (sameProfile) {
      assert.ok(
        isDeepStrictEqual(expected.get(`${item.id}/${item.baseline}`), expected.get(`${item.id}/${item.candidate}`)),
        `Complete same-profile expectations differ: ${item.id}`,
      );
    } else if (item.equivalence) {
      // oxlint-disable-next-line no-await-in-loop -- Disposition is bound to exactly these expectation vectors.
      const disposition = JSON.parse(Buffer.from(await readHashed(item.equivalence)).toString()) as {
        caseId: string;
        equalWork: boolean;
        baselineExpectedSha256: string;
        candidateExpectedSha256: string;
        rationale: string;
      };
      assert.ok(
        explicitlyTrue(disposition.equalWork) &&
          disposition.caseId === item.id &&
          disposition.baselineExpectedSha256 === item.expected[item.baseline]?.sha256 &&
          disposition.candidateExpectedSha256 === item.expected[item.candidate]?.sha256 &&
          disposition.rationale.trim(),
        `Invalid equal-work disposition: ${item.id}`,
      );
    }
  }
  return expected;
};

/**
 * Formula is evaluated from this block's unplanted A report, never process exit.
 * @internal
 * @param primaryNs - Nanoseconds at the public report boundary.
 * @returns Nanoseconds planted before publication.
 */
export const reportPlantNs = (primaryNs: number): number => {
  assert.ok(Number.isFinite(primaryNs) && primaryNs > 0, 'A public paired-A metric is required.');
  return Math.max(8_000_000, 0.25 * primaryNs);
};

/**
 * Freeze a useful identity for a prepared input without replacing raw artifacts.
 * @internal
 * @param value - Prepared immutable value.
 * @returns Hash of exact serialized preparation.
 */
export const campaignIdentity = (value: unknown): string => sha256(JSON.stringify(value));
