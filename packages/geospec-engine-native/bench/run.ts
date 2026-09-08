import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- #bench/lib resolves to this package's own bench/lib.ts; includeInternal misclassifies the self-owned module as a dependency.
import { analyzeComparableRoutes, analyzeControls, readHashed, sha256, shuffled, xorshift32 } from '#bench/lib';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- #bench/lib resolves to this package's own bench/lib.ts; includeInternal misclassifies the self-owned module as a dependency.
import type { BenchmarkConfig, Corpus, RouteName, WorkerSuccess, WorkerRow, Decision } from '#bench/lib';

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
    if (key === '--measure') {
      values.set(key, 'true');
    } else {
      const value = process.argv[++index];
      if (value === undefined) {
        throw new Error(`Missing value for ${key}.`);
      }
      values.set(key, value);
    }
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
  return { artifacts, configSha256: sha256(await readFile(configPath)) };
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

const main = async () => {
  const argumentsByName = parseArguments();
  const configPath = resolve(requiredArgument(argumentsByName, '--config'));
  const outputPath = resolve(requiredArgument(argumentsByName, '--output'));
  const measure = argumentsByName.has('--measure');
  const config = JSON.parse(await readFile(configPath, 'utf8')) as BenchmarkConfig;
  const selectedRoutes = (argumentsByName.get('--routes') ?? 'reference,wasm,native').split(',');
  if (selectedRoutes.some((name) => !isRouteName(name))) {
    throw new Error('Unknown route selection.');
  }
  const routeNames = selectedRoutes.filter((name) => isRouteName(name));
  const verified = await verifyConfig({ config, configPath, measure, routeNames });
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

await main();
