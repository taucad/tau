import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- #bench/lib resolves to this package's own bench/lib.ts; includeInternal misclassifies the self-owned module as a dependency.
import {
  canonicalBytes,
  decodeMesh,
  expectedProjection,
  projectLegacyBoundingBox,
  semanticEqual,
  sha256,
} from '#bench/lib';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- #bench/lib resolves to this package's own bench/lib.ts; includeInternal misclassifies the self-owned module as a dependency.
import type {
  BenchmarkConfig,
  Corpus,
  CorpusRecord,
  MeshRecord,
  Route,
  NewBinding,
  ExpectedResponse,
  ClaimRequest,
  LegacyImplementation,
} from '#bench/lib';

const elapsed = (started: bigint) => Number(process.hrtime.bigint() - started);

const delay = (milliseconds: number) => {
  if (milliseconds > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  }
};

const loadNew = async (route: Route) => {
  const started = process.hrtime.bigint();
  const binding = (await import(pathToFileURL(route.module.path).href)) as NewBinding;
  if (route.kind === 'wasm') {
    if (route.binary === undefined) {
      throw new Error('WASM route requires a binary.');
    }
    const binary = await readFile(route.binary.path);
    if (typeof binding.initialize === 'function') {
      await binding.initialize(binary);
    } else {
      if (binding.default === undefined) {
        throw new Error('WASM route lacks an initializer.');
      }
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact wasm-bindgen initialization key.
      await binding.default({ module_or_path: binary });
    }
  }
  return { binding, loadNs: elapsed(started) };
};

const runNew = async ({
  route,
  mesh,
  record,
  plantedDelay,
}: {
  route: Route;
  mesh: MeshRecord;
  record: CorpusRecord;
  plantedDelay: number;
}) => {
  const { binding, loadNs } = await loadNew(route);
  const request = Buffer.from(record.inputUtf8);
  const meshBytes = Buffer.from(mesh.meshHex, 'hex');
  const engine = new binding.Engine();
  let started = process.hrtime.bigint();
  engine.ingestMesh(Buffer.from(mesh.requestUtf8), meshBytes);
  const admissionNs = elapsed(started);
  started = process.hrtime.bigint();
  const plan = Buffer.from(engine.canonicalPlan(request));
  const canonicalPlanNs = elapsed(started);
  started = process.hrtime.bigint();
  const evaluated = Buffer.from(engine.evaluatePlan(plan));
  const evaluationNs = elapsed(started);

  started = process.hrtime.bigint();
  const endToEndEngine = new binding.Engine();
  endToEndEngine.ingestMesh(Buffer.from(mesh.requestUtf8), meshBytes);
  const output = Buffer.from(endToEndEngine.processRequest(request));
  delay(plantedDelay);
  const endToEndRawNs = elapsed(started);
  const decoded = JSON.parse(output.toString()) as ExpectedResponse;
  const result = decoded.result.results[0];
  return {
    phases: { loadNs, admissionNs, canonicalPlanNs, evaluationNs, endToEndRawNs },
    projection: { status: result.status, measured: result.evidence.measured },
    outputSha256: sha256(output),
    outputBytes: output.byteLength,
    planSha256: sha256(plan),
    evaluatedSha256: sha256(evaluated),
    exactExpectedBytes: output.equals(Buffer.from(record.expectedUtf8)),
  };
};

const runReferenceOperation = async ({
  implementation,
  route,
  mesh,
  record,
  suffix,
}: {
  implementation: LegacyImplementation;
  route: Route;
  mesh: MeshRecord;
  record: CorpusRecord;
  suffix: string;
}) => {
  const analyzed = await implementation.host.analyzeMesh({ source: decodeMesh(mesh.meshHex), format: 'mesh-buffer' });
  if (!analyzed.success) {
    throw new Error(`Legacy mesh admission failed: ${JSON.stringify(analyzed.diagnostics)}`);
  }
  const source = (JSON.parse(record.inputUtf8) as ClaimRequest).plan.claims[0];
  const claim = canonicalBytes({
    claimId: `${source.claimId}-${suffix}`,
    capability: source.capability,
    subjectIds: [analyzed.subject.subjectId],
    payload: source.payload,
    workUnitBudget: source.workUnitBudget,
  });
  const result = await implementation.protocol.submitClaims({
    requestId: `benchmark-${suffix}`,
    registryVersion: route.registryVersion,
    execution: { forensic: false, matcherWallBackstop: 600_000 },
    claims: [claim],
  });
  implementation.protocol.releaseSubject({ requestId: `release-${suffix}`, subjectId: analyzed.subject.subjectId });
  return {
    projection: { status: result.results[0].status, measured: projectLegacyBoundingBox(analyzed.stats.boundingBox) },
    routeMeasured: analyzed.stats.boundingBox,
    output: Buffer.from(JSON.stringify(result)),
  };
};

const runReference = async ({
  route,
  mesh,
  record,
  plantedDelay,
}: {
  route: Route;
  mesh: MeshRecord;
  record: CorpusRecord;
  plantedDelay: number;
}) => {
  let started = process.hrtime.bigint();
  const module = (await import(pathToFileURL(route.module.path).href)) as {
    geoSpecEngineImplementation?: {
      host?: Partial<LegacyImplementation['host']>;
      protocol: LegacyImplementation['protocol'];
    };
  };
  const candidate = module.geoSpecEngineImplementation;
  if (candidate?.host?.analyzeMesh === undefined) {
    throw new Error('Legacy reference module lacks geoSpecEngineImplementation.host.analyzeMesh.');
  }
  const implementation = candidate as LegacyImplementation;
  const loadNs = elapsed(started);

  started = process.hrtime.bigint();
  const analyzed = await implementation.host.analyzeMesh({ source: decodeMesh(mesh.meshHex), format: 'mesh-buffer' });
  if (!analyzed.success) {
    throw new Error(`Legacy mesh admission failed: ${JSON.stringify(analyzed.diagnostics)}`);
  }
  const admissionNs = elapsed(started);
  const source = (JSON.parse(record.inputUtf8) as ClaimRequest).plan.claims[0];
  const claim = canonicalBytes({
    claimId: source.claimId,
    capability: source.capability,
    subjectIds: [analyzed.subject.subjectId],
    payload: source.payload,
    workUnitBudget: source.workUnitBudget,
  });
  started = process.hrtime.bigint();
  const evaluated = await implementation.protocol.submitClaims({
    requestId: 'benchmark-evaluate',
    registryVersion: route.registryVersion,
    execution: { forensic: false, matcherWallBackstop: 600_000 },
    claims: [claim],
  });
  const evaluationNs = elapsed(started);
  implementation.protocol.releaseSubject({ requestId: 'benchmark-release', subjectId: analyzed.subject.subjectId });

  started = process.hrtime.bigint();
  const endToEnd = await runReferenceOperation({ implementation, route, mesh, record, suffix: 'end-to-end' });
  delay(plantedDelay);
  const endToEndRawNs = elapsed(started);
  return {
    phases: { loadNs, admissionNs, canonicalPlanNs: null, evaluationNs, endToEndRawNs },
    projection: endToEnd.projection,
    routeMeasured: endToEnd.routeMeasured,
    outputSha256: sha256(endToEnd.output),
    outputBytes: endToEnd.output.byteLength,
    planSha256: null,
    evaluatedSha256: sha256(Buffer.from(JSON.stringify(evaluated))),
    exactExpectedBytes: false,
  };
};

const configPath = process.argv[2];
const routeName = process.argv[3];
if (configPath === undefined || (routeName !== 'reference' && routeName !== 'wasm' && routeName !== 'native')) {
  throw new Error('Unknown benchmark route or workload.');
}
const config = JSON.parse(await readFile(configPath, 'utf8')) as BenchmarkConfig;
const route = config.routes[routeName];
const corpus = JSON.parse(await readFile(config.corpus.path, 'utf8')) as Corpus;
const record = corpus.records.find(({ id }) => id === process.argv[4]);
if (route === undefined || record === undefined) {
  throw new Error('Unknown benchmark route or workload.');
}
const mesh = corpus.meshes.find(({ id }) => id === record.ingest[0]);
if (mesh === undefined) {
  throw new Error(`Unknown mesh for ${record.id}.`);
}
/** Milliseconds. */
const plantedDelay = Number(process.argv[5] ?? 0);
const rssBefore = process.memoryUsage().rss;
const started = performance.now();
const result =
  route.kind === 'reference'
    ? await runReference({ route, mesh, record, plantedDelay })
    : await runNew({ route, mesh, record, plantedDelay });
const expected = expectedProjection(record);
process.stdout.write(
  `${JSON.stringify({
    ...result,
    workload: record.id,
    route: route.kind,
    // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Exact retained worker report field; milliseconds.
    plantedDelayMs: plantedDelay,
    semanticMatch: semanticEqual(result.projection, expected),
    expectedProjection: expected,
    rssBefore,
    rssAfter: process.memoryUsage().rss,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    workerWallNs: Math.round((performance.now() - started) * 1_000_000),
  })}\n`,
);
