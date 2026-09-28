import { cacheReplayMatches, cachePublicationPresent } from '#bench/cache-state';
import { validateCampaignObservation } from '#bench/campaign';
import type {
  EngineObservation,
  ProductCacheOptions,
  Artifact,
  BroadWorkloadPlan,
  BenchmarkConfig,
  Corpus,
  Decision,
  InstalledProductRoute,
  ProductBenchmarkConfig,
  ProductRoute,
  RouteName,
  WorkerRow,
  WorkerSuccess,
} from '#bench/lib';

import type { SourceRewardInput } from '#bench/source-reward';
import { firstReportMatches } from '#bench/report-validation';
import type { WorkerState } from '#bench/worker-state';
import { measureMembers } from '#bench/measurements';
import { startProcessRss } from '#bench/process-rss';
import { runProductCampaign } from '#bench/campaign-run';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateObservationWork,
  observationWork,
  analyzeComparableRoutes,
  analyzeControls,
  compareProductReports,
  qualifyProductReports,
  planBroadWorkload,
  readHashed,
  sha256,
  shuffled,
  verifyBroadFixtures,
  xorshift32,
} from '#bench/lib';

/** Explicit null in measured observation evidence. */
// oxlint-disable-next-line typescript/no-restricted-types -- Frozen JSON diagnostics distinguish null from omitted values.
type WireNull = null;

const source = '791db2d012253f93417958d560484713049681a3';
const corpusSha256 = '3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476';
const workloadIds = [
  'a2/raw/asymmetric-all-fields',
  'a2/raw/baked-rotation-translation',
  'a2/raw/float32-and-reconstructed-extrema',
  'a2/raw/degenerate-envelope',
];
const workerPath = fileURLToPath(new URL('worker.ts', import.meta.url));

const parseArguments = () => {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (key === undefined) {
      throw new Error('Missing argument name.');
    }
    if (key === '--measure' || key === '--verify-inputs-only' || key === '--plan-campaign') {
      values.set(key, 'true');
    } else {
      const value = process.argv[++index];
      if (value === undefined) {
        throw new Error(`Missing value for ${key}.`);
      }
      values.set(key, value);
    }
  }
  if (values.has('--plan-campaign') && values.has('--measure')) {
    throw new Error('Planning cannot be combined with measurement.');
  }
  if (values.has('--verify-inputs-only') && values.has('--measure')) {
    throw new Error('Input verification cannot be combined with measurement.');
  }
  return values;
};

const timerFloor = (count: number) => {
  const samplesNs = [];
  for (let index = 0; index < count; index += 1) {
    const started = process.hrtime.bigint();
    samplesNs.push(Number(process.hrtime.bigint() - started));
  }
  return samplesNs;
};

const interleavedPairOrder = (round: number, random: () => number) => {
  const controls = shuffled(['native-b', 'native-delay'], random);
  const paired = round % 2 === 0 ? ['wasm', 'native-a', ...controls] : [...controls, 'native-a', 'wasm'];
  paired.splice(Math.floor(random() * (paired.length + 1)), 0, 'reference');
  return paired;
};

const invoke = ({
  config,
  configPath,
  route,
  workload,
  plantedDelay = 0,
}: {
  config: BenchmarkConfig;
  configPath: string;
  route: RouteName;
  workload: string;
  plantedDelay?: number;
}): WorkerRow => {
  const started = process.hrtime.bigint();
  const loader = config.routes[route]!.loader?.path;
  const nodeArguments = [
    ...(loader === undefined ? [] : ['--import', loader]),
    workerPath,
    configPath,
    route,
    workload,
    String(plantedDelay),
  ];
  const child = spawnSync(process.execPath, nodeArguments, {
    encoding: 'utf8',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact frozen tsx loader environment variable.
    env: { ...process.env, TSX_DISABLE_CACHE: '1' },
    maxBuffer: 16 * 1024 * 1024,
  });
  const processWallNs = Number(process.hrtime.bigint() - started);
  if (child.status !== 0) {
    return {
      workload,
      route,
      workerFailure: true,
      status: child.status,
      signal: child.signal,
      stdout: child.stdout,
      stderr: child.stderr,
      processWallNs,
    };
  }
  return { ...(JSON.parse(child.stdout) as WorkerSuccess), processWallNs };
};

const verifyRoute = (config: BenchmarkConfig, name: RouteName): void => {
  const route = config.routes[name];
  if (route?.kind !== name || !Array.isArray(route.artifacts) || route.artifacts.length === 0) {
    throw new Error(`Route ${name} requires kind and hashed artifacts.`);
  }
  if (name === 'reference' && !Number.isInteger(route.registryVersion)) {
    throw new Error('Reference route requires its frozen registry version.');
  }
  const required = [
    route.module.path,
    ...(route.loader === undefined ? [] : [route.loader.path]),
    ...(route.binary === undefined ? [] : [route.binary.path]),
  ];
  if (required.some((path) => !route.artifacts.some((artifact) => artifact.path === path))) {
    throw new Error(`Route ${name} artifact list must include its module and binary.`);
  }
};

const verifyConfig = async ({
  config,
  configPath,
  measure,
  routeNames,
}: {
  config: BenchmarkConfig;
  configPath: string;
  measure: boolean;
  routeNames: RouteName[];
}) => {
  if (process.versions.node.split('.')[0] !== '24') {
    throw new Error(`Node 24 is required, received ${process.version}.`);
  }
  if (config.schemaVersion !== 1 || config.source !== source) {
    throw new Error('Benchmark config source/schema mismatch.');
  }
  if (config.corpus.sha256 !== corpusSha256) {
    throw new Error('Benchmark config must bind the frozen early corpus hash.');
  }
  const corpusBytes = await readHashed(config.corpus);
  const corpus = JSON.parse(corpusBytes.toString()) as Corpus;
  if (corpus.records.length !== 320 || workloadIds.some((id) => !corpus.records.some((record) => record.id === id))) {
    throw new Error('Frozen benchmark workload corpus is incomplete.');
  }
  if (measure && (['reference', 'wasm', 'native'] as const).some((name) => !routeNames.includes(name))) {
    throw new Error('Measurement requires reference, WASM, and native routes.');
  }
  if (measure && (config.sampling.samples !== 120 || config.sampling.order !== 'fixed-120-seeded-interleaved-ab-ba')) {
    throw new Error('Measurement requires the fixed 120-pair seeded interleaved AB/BA schedule.');
  }
  for (const name of routeNames) {
    verifyRoute(config, name);
  }
  const artifacts: Record<string, Array<{ path: string; sha256: string; bytes: number }>> = Object.fromEntries(
    await Promise.all(
      routeNames.map(
        async (name) =>
          [
            name,
            await Promise.all(
              config.routes[name]!.artifacts.map(async (artifact) => {
                const bytes = await readHashed(artifact);
                return { ...artifact, bytes: bytes.byteLength };
              }),
            ),
          ] as const,
      ),
    ),
  );
  if (
    measure &&
    (config.timingGate?.timingEligible !== true ||
      !config.timingGate.artifactHandoff ||
      !config.timingGate.quietWindowObservedAt)
  ) {
    throw new Error('Measurement requires a timing-eligible artifact handoff and quiet-window observation.');
  }
  const broadFixtures = await verifyBroadFixtures(config.broadFixtures);
  return { artifacts, configSha256: sha256(await readFile(configPath)), broadFixtures };
};

type Campaign = {
  schedule: Array<{ workload: string; round: number; measured: boolean; order: string[] }>;
  observations: Array<WorkerRow & { arm: string; sample: number; measured: boolean }>;
  controls: Decision[];
  comparisons?: Decision[];
  timedValidation?: { semanticMatch: boolean; exactNewBytes: boolean };
};
const isRouteName = (name: string): name is RouteName => name === 'reference' || name === 'wasm' || name === 'native';
const requiredArgument = (values: Map<string, string>, name: string): string => {
  const value = values.get(name);
  if (value === undefined) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
};

const collectCampaign = (config: BenchmarkConfig, configPath: string, campaign: Campaign): void => {
  const random = xorshift32(config.sampling.seed);
  const rounds = config.sampling.warmups + config.sampling.samples;
  for (const workload of workloadIds) {
    for (let round = 0; round < rounds; round += 1) {
      const measured = round >= config.sampling.warmups;
      const sample = round - config.sampling.warmups;
      const order = interleavedPairOrder(round, random);
      campaign.schedule.push({ workload, round, measured, order });
      for (const arm of order) {
        const route = arm.startsWith('native-') ? 'native' : arm;
        if (!isRouteName(route)) {
          throw new Error(`Unknown scheduled route ${route}.`);
        }
        const plantedDelay = arm === 'native-delay' ? config.sampling.plantedDelayMs : 0;
        campaign.observations.push({
          ...invoke({ config, configPath, route, workload, plantedDelay }),
          arm,
          sample,
          measured,
        });
      }
    }
  }
};

const preflightDisposition = (semanticMatch: boolean, exactNewBytes: boolean, routeCount: number): string =>
  !semanticMatch || !exactNewBytes
    ? 'preflight-failed-timing-not-run'
    : routeCount === 3
      ? 'preflight-passed-timing-not-run'
      : 'partial-preflight-passed-timing-not-run';

const selectRoutes = (argumentsByName: Map<string, string>, config: BenchmarkConfig): RouteName[] => {
  const selectedRoutes = argumentsByName.has('--routes')
    ? requiredArgument(argumentsByName, '--routes').split(',')
    : argumentsByName.has('--verify-inputs-only')
      ? Object.keys(config.routes)
      : ['reference', 'wasm', 'native'];
  if (selectedRoutes.some((name) => !isRouteName(name))) {
    throw new Error('Unknown route selection.');
  }
  return selectedRoutes.filter((name) => isRouteName(name));
};

const runEarlyMain = async ({
  argumentsByName,
  configPath,
  outputPath,
  config,
}: {
  argumentsByName: Map<string, string>;
  configPath: string;
  outputPath: string;
  config: BenchmarkConfig;
}) => {
  const measure = argumentsByName.has('--measure');
  const verifyInputsOnly = argumentsByName.has('--verify-inputs-only');
  const routeNames = selectRoutes(argumentsByName, config);
  const verified = await verifyConfig({ config, configPath, measure, routeNames });
  if (verifyInputsOnly) {
    const report = {
      schemaVersion: 1,
      source,
      mode: 'verify-inputs-only',
      disposition: 'inputs-verified-engine-correctness-and-timing-pending',
      generatedAt: new Date().toISOString(),
      config: { path: configPath, sha256: verified.configSha256 },
      corpus: { ...config.corpus, records: 320, workloads: workloadIds },
      artifacts: verified.artifacts,
      ...(verified.broadFixtures === undefined ? {} : { broadFixtures: verified.broadFixtures }),
      runtime: { node: process.version, toolchain: config.toolchain },
      execution: { engineWorkersInvoked: 0, timerCalibrationInvoked: false, timingCampaignInvoked: false },
    };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, undefined, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify({ output: outputPath, mode: report.mode, disposition: report.disposition })}\n`,
    );
    return;
  }
  const preflight: WorkerRow[] = [];
  for (const workload of workloadIds) {
    for (const route of routeNames) {
      preflight.push(invoke({ config, configPath, route, workload }));
    }
  }
  const semanticMatch = preflight.every((row) => row.semanticMatch === true);
  const exactNewBytes = preflight
    .filter(({ route }) => route !== 'reference')
    .every(({ exactExpectedBytes }) => exactExpectedBytes);
  const campaign: Campaign = { schedule: [], observations: [], controls: [] };
  const report = {
    schemaVersion: 1,
    source,
    mode: measure ? 'measurement' : routeNames.length === 3 ? 'preflight' : 'partial-preflight',
    generatedAt: new Date().toISOString(),
    config: { path: configPath, sha256: verified.configSha256 },
    corpus: { ...config.corpus, records: 320, workloads: workloadIds },
    artifacts: verified.artifacts,
    ...(verified.broadFixtures === undefined ? {} : { broadFixtures: verified.broadFixtures }),
    runtime: {
      node: process.version,
      versions: process.versions,
      executable: process.execPath,
      platform: platform(),
      architecture: process.arch,
      release: release(),
      cpus: cpus().map(({ model, speed }) => ({ model, speed })),
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtStart: freemem(),
      toolchain: config.toolchain,
    },
    comparability: {
      semanticProjection: 'status plus measured whole-subject bounding box',
      load: 'worker phase covers entry-module import and binding initialization; reference processWall also includes Node plus frozen tsx-loader startup and is source-loader evidence, not packaged-production startup evidence',
      admission: 'non-comparable: legacy analyzes an in-memory mesh while new routes admit mesh-buffer-v1 bytes',
      canonicalPlan: 'unavailable on legacy protocol v2',
      evaluation: 'non-comparable: legacy admission materializes mesh analysis before claim evaluation',
      endToEndRaw:
        'non-comparable: legacy performs full mesh analysis while the new early slice performs bounds-only byte-facade work; raw timings are retained without a legacy/new speed ratio',
      scope: 'early mesh/byte-facade evidence only; no complete-engine promotion',
    },
    preflight: { semanticMatch, exactNewBytes, rows: preflight },
    timerFloorNs: timerFloor(config.sampling.timerSamples),
    ...campaign,
    disposition: 'pending',
  };
  if (!measure) {
    report.disposition = preflightDisposition(semanticMatch, exactNewBytes, routeNames.length);
  }
  if (measure && semanticMatch && exactNewBytes) {
    collectCampaign(config, configPath, report);
    const timedSemanticMatch = report.observations.every((row) => row.semanticMatch === true);
    const timedExactNewBytes = report.observations
      .filter(({ route }) => route !== 'reference')
      .every(({ exactExpectedBytes }) => exactExpectedBytes === true);
    report.timedValidation = { semanticMatch: timedSemanticMatch, exactNewBytes: timedExactNewBytes };
    report.controls = analyzeControls({ observations: report.observations, sampling: config.sampling });
    report.comparisons = analyzeComparableRoutes({
      observations: report.observations,
      sampling: config.sampling,
      controls: report.controls,
    });
    const controlsValid = report.controls.every(({ axis, classification }) =>
      axis === 'native-aa' ? classification === 'noise-characterized' : classification === 'detected',
    );
    report.disposition =
      !timedSemanticMatch || !timedExactNewBytes
        ? 'invalid-timed-semantic-mismatch'
        : controlsValid
          ? 'valid-entry-observation-no-promotion'
          : 'inconclusive-control-failure';
  } else if (measure) {
    report.disposition = 'invalid-semantic-mismatch-no-timing';
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, undefined, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ output: outputPath, mode: report.mode, disposition: report.disposition })}\n`,
  );
  if (!semanticMatch || !exactNewBytes || (measure && report.disposition !== 'valid-entry-observation-no-promotion')) {
    process.exitCode = 1;
  }
};

/** Explicit nulls are retained in subprocess evidence. */
// oxlint-disable-next-line typescript/no-restricted-types -- JSON evidence distinguishes explicit null from an omitted field.
type ReportNull = null;

type ProductObservation = {
  route: string;
  workload: string;
  repeat: number;
  invocationErrors?: string[];
  rawEvents?: Array<Record<string, unknown>>;
  rawLines?: string[];
  reaped?: boolean;
  startupReadyNs?: number;
  stateReady?: Record<string, unknown>;
  successful: boolean;
  firstActionableReportNs: number | ReportNull;
  completeReportNs: number | ReportNull;
  suiteReportNs: number | ReportNull;
  suiteReports: Array<Record<string, unknown>> | ReportNull;
  qualification: Record<string, unknown>;
  reportPlants: { firstActionableReportNs: number; suiteReportNs: number };
  processExitNs: number | ReportNull;
  processReapNs: number;
  firstReport: Record<string, unknown> | ReportNull;
  result: Record<string, unknown> | ReportNull;
  exitCode: number | ReportNull;
  signal: NodeJS.Signals | ReportNull;
  stdoutRemainder: string;
  stderr: string;
};

const productRouteArtifacts = (route: ProductRoute): Artifact[] => route.artifacts ?? [];

const verifyProductRoute = async (name: string, route: ProductRoute): Promise<Array<Artifact & { bytes: number }>> => {
  if (route.comparison.trim().length === 0 || route.profile.trim().length === 0) {
    throw new Error(`Product route ${name} requires explicit profile and comparability text.`);
  }
  if (route.state === 'unavailable') {
    if (route.reason.trim().length === 0) {
      throw new Error(`Unavailable product route ${name} requires a reason.`);
    }
  } else {
    const required =
      route.execution.kind === 'installed-js'
        ? [
            route.execution.harness.path,
            route.execution.binding.path,
            route.execution.assertionClient.path,
            ...(route.execution.campaign === undefined ? [] : [route.execution.campaign.path]),
          ]
        : route.execution.kind === 'installed-legacy-js'
          ? [route.execution.engine.path, route.execution.receipt.path]
          : [];
    if (required.some((path) => !route.artifacts.some((artifact) => artifact.path === path))) {
      throw new Error(`Product route ${name} artifact closure omits an execution input.`);
    }
    if (route.execution.kind !== 'event-command' && route.consumer !== 'standalone') {
      throw new Error(`Built-in installed-js route ${name} supports the standalone consumer only.`);
    }
  }
  return Promise.all(
    productRouteArtifacts(route).map(async (artifact) => {
      const bytes = await readHashed(artifact);
      return { ...artifact, bytes: bytes.byteLength };
    }),
  );
};

const selectProductRoutes = (argumentsByName: Map<string, string>, config: ProductBenchmarkConfig): string[] => {
  const selected = argumentsByName.has('--routes')
    ? requiredArgument(argumentsByName, '--routes').split(',')
    : Object.keys(config.routes);
  if (selected.some((name) => config.routes[name] === undefined)) {
    throw new Error('Unknown product route selection.');
  }
  return selected;
};

const selectProductWorkloads = (
  argumentsByName: Map<string, string>,
  config: ProductBenchmarkConfig,
): ProductBenchmarkConfig['workloads'] => {
  if (!argumentsByName.has('--workloads')) {
    return config.workloads;
  }
  const selected = requiredArgument(argumentsByName, '--workloads').split(',');
  const workloads = selected.map((id) => config.workloads.find((workload) => workload.id === id));
  if (workloads.some((workload) => workload === undefined)) {
    throw new Error('Unknown product workload selection.');
  }
  return workloads.filter((workload) => workload !== undefined);
};

const productRouteSupports = (route: InstalledProductRoute, workload: string): boolean =>
  route.supportedWorkloads === undefined || route.supportedWorkloads.includes(workload);

const verifyProductConfig = async ({
  config,
  configPath,
  routeNames,
}: {
  config: ProductBenchmarkConfig;
  configPath: string;
  routeNames: string[];
}) => {
  if (process.versions.node.split('.')[0] !== '24') {
    throw new Error(`Node 24 is required for this provisional diagnostic, received ${process.version}.`);
  }
  if (!Number.isInteger(config.repeats) || config.repeats < 1 || config.repeats > 3) {
    throw new Error('Product diagnostics permit one to three repeats only.');
  }
  if (config.workloads.length === 0 || new Set(config.workloads.map(({ id }) => id)).size !== config.workloads.length) {
    throw new Error('Product workloads must be nonempty and uniquely identified.');
  }
  if (
    !Object.values(config.routes).some(
      (route) =>
        route.backend === 'legacy' &&
        ((route.state === 'unavailable' && /identity/iu.test(route.reason)) ||
          (route.state === 'ready' && route.execution.kind === 'installed-legacy-js')),
    )
  ) {
    throw new Error('Product diagnostics require an immutable installed legacy identity or an explicit identity gap.');
  }
  const broadFixtures = await verifyBroadFixtures(config.broadFixtures);
  if (broadFixtures === undefined) {
    throw new Error('Product diagnostics require a hash-bound broad-fixture manifest.');
  }
  const artifacts = Object.fromEntries(
    await Promise.all(
      routeNames.map(async (name) => [name, await verifyProductRoute(name, config.routes[name]!)] as const),
    ),
  );
  return { artifacts, broadFixtures, configSha256: sha256(await readFile(configPath)) };
};

const commandForProductRoute = ({
  route,
  configPath,
  routeName,
  workload,
  preparedPath,
}: {
  route: InstalledProductRoute;
  configPath: string;
  routeName: string;
  workload: string;
  preparedPath: string;
}): { executable: string; arguments: string[]; cwd: string; environment: NodeJS.ProcessEnv } => {
  if (route.execution.kind === 'installed-js' || route.execution.kind === 'installed-legacy-js') {
    const environment = { ...process.env };
    environment['TSX_DISABLE_CACHE'] = '1';
    return {
      executable: process.execPath,
      arguments: [workerPath, configPath, routeName, workload, preparedPath],
      cwd: process.cwd(),
      environment,
    };
  }
  const environment = { ...process.env, ...route.execution.environment };
  environment['GEOSPEC_PREPARED_WORKLOAD'] = preparedPath;
  environment['GEOSPEC_WORKLOAD_ID'] = workload;
  const substitutions: Record<string, string> = {
    '{config}': configPath,
    '{route}': routeName,
    '{workload}': workload,
  };
  return {
    executable: route.execution.executable,
    arguments: route.execution.arguments.map((argument) => substitutions[argument] ?? argument),
    cwd: route.execution.cwd,
    environment,
  };
};

const reportTimesInOrder = (times: Array<number | ReportNull>): boolean =>
  times.every((time) => time !== null) && times.every((time, index) => index === 0 || time >= times[index - 1]!);

/** Execute an installed public route; host tests may supply an ordinary synthetic event process.
 * @internal
 * @returns Complete boundary, ACK, exit/reap and error evidence.
 */
export const invokeProductRoute = async ({
  route,
  configPath,
  routeName,
  workload,
  repeat,
  preparedPath,
  prepared,
  plant,
  settled,
  state,
  prefillExpected,
  deadlines,
  firstPublished,
  sourceReward,
  reservationExpiresAt,
  cache,
}: {
  route: InstalledProductRoute;
  configPath: string;
  routeName: string;
  workload: string;
  repeat: number;
  preparedPath: string;
  prepared?: BroadWorkloadPlan;
  plant?: { metric: 'firstActionableReportNs' | 'suiteReportNs'; durationNs: number };
  cache?: ProductCacheOptions;
  reservationExpiresAt?: number;
  sourceReward?: { input: SourceRewardInput; output: string };
  firstPublished?: () => void;
  deadlines?: { report: number; startup: number; cleanup: number };
  state?: WorkerState;
  prefillExpected?: unknown;
  settled?: (reports: Array<Record<string, unknown>>, acknowledge: () => void) => void;
}): Promise<ProductObservation> => {
  const command = commandForProductRoute({ route, configPath, routeName, workload, preparedPath });
  delete command.environment['GEOSPEC_CAMPAIGN_CACHE'];
  if (cache) {
    command.environment['GEOSPEC_CAMPAIGN_CACHE'] = JSON.stringify(cache);
  }
  delete command.environment['GEOSPEC_SOURCE_REWARD'];
  if (sourceReward) {
    command.arguments.unshift('--import', sourceReward.input.loader.path);
    command.environment['GEOSPEC_SOURCE_REWARD'] = JSON.stringify(sourceReward);
  }
  command.environment['GEOSPEC_CAMPAIGN_STATE'] = JSON.stringify(state ?? { mode: 'cold-process' });
  delete command.environment['GEOSPEC_CAMPAIGN_PLANT_METRIC'];
  delete command.environment['GEOSPEC_CAMPAIGN_PLANT_NS'];
  if (plant) {
    command.environment['GEOSPEC_CAMPAIGN_PLANT_METRIC'] = plant.metric;
    command.environment['GEOSPEC_CAMPAIGN_PLANT_NS'] = String(plant.durationNs);
  }
  return new Promise<ProductObservation>((resolve) => {
    const processStarted = process.hrtime.bigint();
    let started = processStarted;
    let stateReady: Record<string, unknown> | undefined;
    let startupReadyNs: number | undefined;
    const child = spawn(command.executable, command.arguments, {
      cwd: command.cwd,
      env: command.environment,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const invocationErrors: string[] = [];
    const rawEvents: Array<Record<string, unknown>> = [];
    const rawLines: string[] = [];
    let reservationDeadline: ReturnType<typeof setTimeout> | undefined;
    let finalized = false;
    let publicDeadline: ReturnType<typeof setTimeout> | undefined;
    let cleanupDeadline: ReturnType<typeof setTimeout> | undefined;
    let finalReapDeadline: ReturnType<typeof setTimeout> | undefined;
    const terminateOwned = (signal: NodeJS.Signals): void => {
      try {
        if (process.platform !== 'win32' && child.pid) {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch (error) {
        invocationErrors.push(`Owned process-group termination: ${String(error)}`);
      }
    };
    const fail = (message: string): void => {
      invocationErrors.push(message);
      if (finalized) {
        return;
      }
      clearTimeout(publicDeadline);
      terminateOwned('SIGTERM');
      finalReapDeadline ??= setTimeout(() => {
        terminateOwned('SIGKILL');
        finalReapDeadline = setTimeout(() => {
          finish(false);
        }, deadlines?.cleanup ?? 5000);
      }, deadlines?.cleanup ?? 5000);
    };
    const armReportDeadline = (): void => {
      clearTimeout(publicDeadline);
      if (deadlines) {
        publicDeadline = setTimeout(
          () => {
            fail('Public report deadline exceeded.');
          },
          deadlines.report + (plant?.durationNs ?? 0) / 1_000_000,
        );
      }
    };
    if (reservationExpiresAt) {
      reservationDeadline = setTimeout(
        () => {
          fail('Environment reservation expired during invocation.');
        },
        Math.max(1, reservationExpiresAt - Date.now()),
      );
    }
    if (deadlines && state && ['warm-engine-cold-subject', 'resident-warm', 'incremental-edit'].includes(state.mode)) {
      publicDeadline = setTimeout(() => {
        fail('Prepared-state startup deadline exceeded.');
      }, deadlines.startup);
    } else {
      armReportDeadline();
    }
    child.stdin.on('error', (error) => {
      fail(`Worker ACK stream: ${error.message}`);
    });
    let pending = '';
    let stderr = '';
    let firstReport: Record<string, unknown> | ReportNull = null;
    let result: Record<string, unknown> | ReportNull = null;
    let firstActionableReportNs: number | ReportNull = null;
    let completeReportNs: number | ReportNull = null;
    let suiteReportNs: number | ReportNull = null;
    let suiteReports: Array<Record<string, unknown>> | ReportNull = null;
    let suiteBeforeCleanup = false;
    const reportPlants = { firstActionableReportNs: 0, suiteReportNs: 0 };
    let processExitNs: number | ReportNull = null;
    let exitCode: number | ReportNull = null;
    let signal: NodeJS.Signals | ReportNull = null;
    const consumeLine = (line: string): void => {
      if (line.trim().length === 0) {
        return;
      }
      rawLines.push(line);
      const event = JSON.parse(line) as {
        [key: string]: unknown;
        event?: string;
        result?: Record<string, unknown>;
      };
      rawEvents.push(event);
      switch (event.event) {
        case 'state-ready': {
          if (
            (stateReady ?? !state) ||
            !['warm-engine-cold-subject', 'resident-warm', 'incremental-edit'].includes(state.mode) ||
            event['mode'] !== state.mode
          ) {
            throw new Error('Unexpected prepared state event.');
          }
          stateReady = event;
          started = process.hrtime.bigint();
          startupReadyNs = Number(started - processStarted);
          armReportDeadline();
          child.stdin.write('\n');

          break;
        }
        case 'first-report': {
          if (firstReport !== null) {
            throw new Error(`${routeName}/${workload} emitted more than one first-report event.`);
          }
          firstActionableReportNs = Number(process.hrtime.bigint() - started);
          firstPublished?.();
          const { event: _event, ...record } = event;
          firstReport = record;
          reportPlants.firstActionableReportNs = Number(event['plantedDelayNs'] ?? 0);

          break;
        }
        case 'suite-report': {
          if (suiteReports !== null) {
            throw new Error('Duplicate public suite.');
          }
          clearTimeout(publicDeadline);
          suiteReportNs = Number(process.hrtime.bigint() - started);
          suiteReports = event['reports'] as Array<Record<string, unknown>>;
          suiteBeforeCleanup = event['cleanupStarted'] === false;
          reportPlants.suiteReportNs = Number(event['plantedDelayNs'] ?? 0);
          let acknowledged = false;
          const acknowledge = (): void => {
            if (!acknowledged) {
              acknowledged = true;
              child.stdin.write('\n');
              if (deadlines) {
                cleanupDeadline = setTimeout(() => {
                  fail('Cleanup/reap deadline exceeded.');
                }, deadlines.cleanup);
              }
            }
          };
          if (settled) {
            settled(suiteReports, acknowledge);
          } else {
            acknowledge();
          }

          break;
        }
        default: {
          if (event.event === 'complete' && event.result !== undefined) {
            completeReportNs = Number(process.hrtime.bigint() - started);
            const work = event.result['workCounters'] as Record<string, unknown> | undefined;
            result =
              work && 'observationEnd' in work
                ? {
                    ...event.result,
                    workCounters: {
                      ...work,
                      ...observationWork(
                        work['observationStart'] as EngineObservation | WireNull,
                        work['observationEnd'] as EngineObservation | WireNull,
                      ),
                    },
                  }
                : event.result;
          } else {
            throw new Error(`${routeName}/${workload} emitted an unknown benchmark event.`);
          }
        }
      }
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      pending += chunk;
      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        try {
          consumeLine(pending.slice(0, newline));
        } catch (error) {
          fail(`Event parse/contract: ${String(error)}`);
        }
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      stderr += `${error.stack ?? error.message}\n`;
      fail(`Worker process: ${error.message}`);
    });
    child.on('exit', (code, receivedSignal) => {
      processExitNs = Number(process.hrtime.bigint() - started);
      exitCode = code;
      signal = receivedSignal;
    });
    const finish = (reaped: boolean): void => {
      if (finalized) {
        return;
      }
      finalized = true;
      clearTimeout(publicDeadline);
      clearTimeout(cleanupDeadline);
      clearTimeout(finalReapDeadline);
      if (pending.trim().length > 0) {
        try {
          consumeLine(pending);
        } catch (error) {
          invocationErrors.push(`Final event: ${String(error)}`);
        }
        pending = '';
      }
      clearTimeout(publicDeadline);
      clearTimeout(cleanupDeadline);
      clearTimeout(reservationDeadline);
      if (!reaped) {
        child.stdout.destroy();
        child.stderr.destroy();
        child.stdin.destroy();
        child.unref();
      }
      const processReapNs = Number(process.hrtime.bigint() - started);
      let qualification;
      try {
        qualification = qualifyProductReports({ route, workload, suiteReports, prepared });
      } catch (error) {
        invocationErrors.push(`Qualification: ${String(error)}`);
        qualification = { evaluationCompleted: false, expectedMatches: false, overlapVerified: false };
      }
      const { evaluationCompleted: completed, expectedMatches, overlapVerified } = qualification;
      resolve({
        route: routeName,
        workload,
        repeat,
        invocationErrors,
        rawEvents,
        rawLines,
        reaped,
        successful:
          reaped &&
          invocationErrors.length === 0 &&
          (state === undefined ||
            state.mode === 'cold-process' ||
            state.mode === 'persisted-warm' ||
            (stateReady !== undefined &&
              (state.mode === 'warm-engine-cold-subject' ||
                compareProductReports(stateReady['prefillReports'], prefillExpected)))) &&
          exitCode === 0 &&
          completed &&
          expectedMatches !== false &&
          overlapVerified &&
          suiteBeforeCleanup &&
          suiteReportNs !== null &&
          suiteReports !== null &&
          firstReportMatches(firstReport, suiteReports, route.backend) &&
          result?.['firstReportAcknowledgedBeforeCleanup'] === true &&
          result['successful'] === true &&
          reportTimesInOrder([firstActionableReportNs, suiteReportNs, completeReportNs, processExitNs, processReapNs]),
        startupReadyNs,
        stateReady,
        firstActionableReportNs,
        suiteReportNs,
        suiteReports,
        qualification,
        reportPlants,
        completeReportNs,
        processExitNs,
        processReapNs,
        firstReport,
        result,
        exitCode,
        signal,
        stdoutRemainder: pending,
        stderr,
      });
    };
    child.on('close', () => {
      finish(true);
    });
  });
};

const compareProductObservations = (observations: ProductObservation[], config: ProductBenchmarkConfig) => {
  const comparisons: Array<{ profile: string; workload: string; left: string; right: string; equal: boolean }> = [];
  for (const left of observations) {
    const profile =
      config.routes[left.route]?.state === 'ready'
        ? (config.routes[left.route] as InstalledProductRoute).parityProfile
        : undefined;
    if (profile === undefined) {
      continue;
    }
    for (const right of observations) {
      const rightRoute = config.routes[right.route];
      if (
        left.route >= right.route ||
        left.workload !== right.workload ||
        left.repeat !== right.repeat ||
        rightRoute?.state !== 'ready' ||
        rightRoute.parityProfile !== profile
      ) {
        continue;
      }
      comparisons.push({
        profile,
        workload: left.workload,
        left: left.route,
        right: right.route,
        equal: compareProductReports(left.suiteReports, right.suiteReports),
      });
    }
  }
  return comparisons;
};

const runProductMain = async ({
  argumentsByName,
  configPath,
  outputPath,
  config,
}: {
  argumentsByName: Map<string, string>;
  configPath: string;
  outputPath: string;
  config: ProductBenchmarkConfig;
}): Promise<void> => {
  const routeNames = selectProductRoutes(argumentsByName, config);
  const workloads = selectProductWorkloads(argumentsByName, config);
  const verified = await verifyProductConfig({ config, configPath, routeNames });
  const verifyInputsOnly = argumentsByName.has('--verify-inputs-only');
  const selected = routeNames.map((name) => ({ name, route: config.routes[name]! }));
  const unavailable = selected
    .filter(({ route }) => route.state === 'unavailable')
    .map(({ name, route }) => ({ name, ...route }));
  const runnable = selected.filter(
    (entry): entry is { name: string; route: InstalledProductRoute } => entry.route.state === 'ready',
  );
  // Selected workload construction and all corpus integrity checking precede process launch.
  await mkdir(dirname(outputPath), { recursive: true });
  const preparedPaths = new Map<string, string>();
  const preparedPlans = new Map<string, BroadWorkloadPlan>();
  if (!verifyInputsOnly) {
    for (const workload of workloads) {
      const prepared =
        workload.kind === 'broad-fixture' ? planBroadWorkload(verified.broadFixtures, workload.fixtureId) : undefined;
      const path = `${outputPath}.${workload.id}.input.json`;
      // oxlint-disable-next-line no-await-in-loop -- Finish each selected immutable input before any worker launch.
      await writeFile(path, JSON.stringify(prepared ?? null), { flag: 'wx' });
      preparedPaths.set(workload.id, path);
      if (prepared !== undefined) {
        preparedPlans.set(workload.id, prepared);
      }
    }
  }
  const observations: ProductObservation[] = [];
  const unsupportedRouteWorkloads = runnable.flatMap(({ name, route }) =>
    workloads
      .filter(({ id }) => !productRouteSupports(route, id))
      .map(({ id }) => ({
        route: name,
        workload: id,
        classification: route.workloadGaps?.[id]?.classification ?? 'adapter-not-implemented',
        reason:
          route.workloadGaps?.[id]?.reason ??
          'No executable adapter for this route/workload pair is declared by the configuration.',
      })),
  );
  if (!verifyInputsOnly) {
    for (let repeat = 0; repeat < config.repeats; repeat += 1) {
      for (const workload of workloads) {
        const workloadRoutes = runnable.filter(({ route }) => productRouteSupports(route, workload.id));
        for (const { name, route } of workloadRoutes) {
          // oxlint-disable-next-line no-await-in-loop -- Product processes stay serial on shared hardware; this is a diagnostic, not a timing campaign.
          observations.push(
            // oxlint-disable-next-line no-await-in-loop -- Ordinary diagnostic processes are deliberately serial.
            await invokeProductRoute({
              route,
              configPath,
              routeName: name,
              workload: workload.id,
              repeat,
              preparedPath: preparedPaths.get(workload.id)!,
              prepared: preparedPlans.get(workload.id),
            }),
          );
        }
      }
    }
  }
  const comparisons = compareProductObservations(observations, config);
  const successful =
    observations.every(({ successful: observationSuccessful }) => observationSuccessful) &&
    comparisons.every(({ equal }) => equal);
  const report = {
    schemaVersion: 2,
    comparisons,
    source: config.source,
    mode: verifyInputsOnly ? 'verify-inputs-only' : 'provisional-product-diagnostic',
    disposition: verifyInputsOnly
      ? 'inputs-verified-no-product-workers-invoked'
      : successful
        ? 'provisional-diagnostic-passed-no-speed-promotion'
        : 'provisional-diagnostic-failed-no-speed-promotion',
    generatedAt: new Date().toISOString(),
    config: { path: configPath, sha256: verified.configSha256 },
    campaignGate: config.campaignGate,
    routes: Object.fromEntries(
      selected.map(({ name, route }) => [name, { ...route, artifacts: verified.artifacts[name] }]),
    ),
    unavailable,
    broadFixtures: verified.broadFixtures,
    preparedInputs: workloads.map(({ id }) => ({
      workload: id,
      path: preparedPaths.get(id),
      sha256: sha256(JSON.stringify(preparedPlans.get(id) ?? null)),
    })),
    workloads,
    repeats: config.repeats,
    runtime: {
      node: process.version,
      executable: process.execPath,
      platform: platform(),
      architecture: process.arch,
      release: release(),
      cpus: cpus().map(({ model, speed }) => ({ model, speed })),
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtStart: freemem(),
      toolchain: config.toolchain,
    },
    timingBoundary: {
      firstActionableReport:
        'parent receipt of the worker JSONL event after the installed consumer produced its first usable result and before release/close',
      suiteReport:
        'parent receipt of the complete settled public reports before ACK, independent validation, release and close',
      completeReport: 'post-cleanup receipt retained separately; not public suite latency',
      coldSetup:
        'Node/module/binding startup and selected input loading/admission included; whole-corpus integrity and workload construction preflighted in parent',
      vitestBridge:
        'file publication plus polling and forwarding; bridge overhead included, no runtime-only latency claim',
      processExit: 'child exit event',
      processReap: 'child close event after stdio closure',
    },
    comparability: {
      routes: Object.fromEntries(selected.map(({ name, route }) => [name, route.comparison])),
      decision: 'raw diagnostic observations only; no ratios, speed gate, or promotion decision',
    },
    execution: {
      engineWorkersInvoked: observations.length,
      releaseCampaignInvoked: false,
      timerCalibrationInvoked: false,
    },
    unsupportedRouteWorkloads,
    observations,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, undefined, 2)}\n`, { flag: 'wx' });
  process.stdout.write(
    `${JSON.stringify({ output: outputPath, mode: report.mode, disposition: report.disposition })}\n`,
  );
  if (!verifyInputsOnly && !successful) {
    process.exitCode = 1;
  }
};

const runCampaignMain = async ({
  argumentsByName,
  configPath,
  outputPath,
  config,
}: {
  argumentsByName: Map<string, string>;
  configPath: string;
  outputPath: string;
  config: ProductBenchmarkConfig;
}): Promise<void> => {
  if (!config.campaign) {
    throw new Error('Schema-v2 measurement requires an explicit frozen campaign configuration.');
  }
  if (
    argumentsByName.has('--routes') ||
    argumentsByName.has('--workloads') ||
    argumentsByName.has('--verify-inputs-only')
  ) {
    throw new Error('Campaign manifests cannot be subset or combined with diagnostic verification.');
  }
  const routeNames = selectProductRoutes(argumentsByName, config);
  const verified = await verifyProductConfig({ config, configPath, routeNames });
  await runProductCampaign({
    config,
    campaign: config.campaign,
    configPath,
    outputPath,
    measure: argumentsByName.has('--measure'),
    broadFixtures: verified.broadFixtures,
    invoke: async (input) => {
      const route = config.routes[input.routeName];
      if (route?.state !== 'ready') {
        throw new Error('Campaign route unavailable.');
      }
      let prefill: ProductObservation | undefined;
      let cache: ProductCacheOptions | undefined;
      if (input.persistedCache) {
        await mkdir(input.persistedCache.base, { mode: 0o700 });
        cache = { root: resolve(input.persistedCache.base, 'store'), projectRoot: input.persistedCache.projectRoot };
        await mkdir(cache.root, { mode: 0o700 });
        prefill = await invokeProductRoute({
          ...input,
          route,
          configPath,
          cache,
          state: { mode: 'cold-process' },
          plant: undefined,
          deadlines: input.deadlines ? { ...input.deadlines, report: input.deadlines.startup } : undefined,
        });
        await writeFile(resolve(input.persistedCache.base, 'prefill.json'), JSON.stringify(prefill), { flag: 'wx' });
        if (
          !validateCampaignObservation(prefill, input.prefillExpected, route.backend) ||
          !cachePublicationPresent(prefill.result?.['cache'])
        ) {
          throw new Error('Persisted prefill did not qualify.', { cause: prefill });
        }
      }
      const sampler = config.campaign?.rss ? await startProcessRss(config.campaign.rss) : undefined;
      try {
        if (!input.members) {
          const observation = await invokeProductRoute({ ...input, route, configPath, cache });
          const processTreeRss = await sampler?.finish();
          return {
            ...observation,
            successful:
              observation.successful &&
              (!prefill || cacheReplayMatches(prefill.result?.['cache'], observation.result?.['cache'])),
            persistedPreparation: prefill,
            processTreeRss,
            processTreePeakRssBytes: processTreeRss?.peakBytes ?? null,
          };
        }
        const started = process.hrtime.bigint();
        let firstGroupReport: number | ReportNull = null;
        const completionWatchers: Array<Promise<void>> = [];
        const aggregate = await measureMembers<ProductObservation>({
          members: input.members,
          startTime: Number(started),
          launch: async (member, index) =>
            new Promise((resolve, reject) => {
              const preparedInput = input.members!.find(({ id }) => id === member.id)!;
              const plantHere =
                input.plant?.metric === 'firstActionableReportNs' ? index === 0 : index === input.members!.length - 1;
              const completed = invokeProductRoute({
                ...input,
                route,
                configPath,
                workload: member.workload,
                preparedPath: preparedInput.path,
                prepared: preparedInput.plan,
                plant: plantHere ? input.plant : undefined,
                firstPublished: () => {
                  firstGroupReport ??= Number(process.hrtime.bigint() - started);
                },
                settled: (reports, acknowledge) => {
                  resolve({ reports, acknowledge, completed });
                },
              });
              const observeCompletion = async (): Promise<void> => {
                try {
                  const observation = await completed;
                  if (observation.suiteReports === null) {
                    reject(new Error('Member exited without a public suite.', { cause: observation }));
                  }
                } catch (error) {
                  reject(error instanceof Error ? error : new Error(String(error)));
                }
              };
              completionWatchers.push(observeCompletion());
            }),
        });
        await Promise.all(completionWatchers);
        const processTreeRss = await sampler?.finish();
        const qualified = aggregate.members.every((member) => member.successful);
        return {
          ...aggregate,
          successful: qualified,
          suiteReports: aggregate.reports,
          firstReport: aggregate.members[0]!.firstReport,
          firstActionableReportNs: firstGroupReport,
          qualification: { evaluationCompleted: qualified, expectedMatches: qualified, overlapVerified: qualified },
          reportPlants: {
            firstActionableReportNs: aggregate.members[0]!.reportPlants.firstActionableReportNs,
            suiteReportNs: aggregate.members.at(-1)!.reportPlants.suiteReportNs,
          },
          processTreeRss,
          processTreePeakRssBytes: processTreeRss?.peakBytes ?? null,
          processReapNs: Number(process.hrtime.bigint() - started),
          result: {
            successful: qualified,
            topology: 'serial-independent-process-admissions-held-until-final-public-report',
            instances: input.members.map(({ id, workload }) => ({ id, workload })),
            workCounters: aggregateObservationWork(
              aggregate.members.map((member) => member.result?.['workCounters'] as Record<string, unknown> | undefined),
            ),
          },
        };
      } catch (error) {
        const processTreeRss = await sampler?.finish();
        throw new Error('Product observation did not complete.', {
          cause: {
            failure: error instanceof Error ? { message: error.message, cause: error.cause } : String(error),
            processTreeRss,
          },
        });
      }
    },
  });
};

const main = async (): Promise<void> => {
  const argumentsByName = parseArguments();
  const outputPath = resolve(requiredArgument(argumentsByName, '--output'));
  if (argumentsByName.has('--analyze')) {
    if (argumentsByName.has('--measure') || argumentsByName.has('--plan-campaign')) {
      throw new Error('Analysis cannot launch measurements.');
    }
    const analyzed = spawnSync(
      requiredArgument(argumentsByName, '--python'),
      [
        fileURLToPath(new URL('campaign-analysis.py', import.meta.url)),
        resolve(requiredArgument(argumentsByName, '--analyze')),
        outputPath,
      ],
      { stdio: 'inherit' },
    );
    if (analyzed.error) {
      throw analyzed.error;
    }
    process.exitCode = analyzed.status ?? 1;
    return;
  }
  const configPath = resolve(requiredArgument(argumentsByName, '--config'));
  const raw = JSON.parse(await readFile(configPath, 'utf8')) as { schemaVersion?: number };
  if (raw.schemaVersion === 2) {
    if (argumentsByName.has('--measure') || argumentsByName.has('--plan-campaign')) {
      await runCampaignMain({ argumentsByName, configPath, outputPath, config: raw as ProductBenchmarkConfig });
      return;
    }
    await runProductMain({
      argumentsByName,
      configPath,
      outputPath,
      config: raw as ProductBenchmarkConfig,
    });
    return;
  }
  if (argumentsByName.has('--plan-campaign')) {
    throw new Error('Campaign planning requires schemaVersion 2.');
  }
  await runEarlyMain({
    argumentsByName,
    configPath,
    outputPath,
    config: raw as BenchmarkConfig,
  });
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
