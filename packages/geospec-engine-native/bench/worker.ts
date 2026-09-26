import { cacheOptions, closeMeasuredEngine } from '#bench/cache-state';
import type { SourceRewardInput } from '#bench/source-reward';
import { acknowledgeState, prepareResident } from '#bench/worker-state';
import type { WorkerState } from '#bench/worker-state';
import { plantPublicReport } from '#bench/report-delay';
import { performance } from 'node:perf_hooks';
import { readSync, writeSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  readEngineObservation,
  observationWork,
  byteRecord,
  consumerReportRecord,
  canonicalBytes,
  decodeMesh,
  expectedProjection,
  observePublicConsumerResult,
  projectLegacyBoundingBox,
  semanticEqual,
  sha256,
  evaluationCompleted,
  overlapMatches,
} from '#bench/lib';
import type {
  EngineObservation,
  ProductEngine,
  ProductBinding,
  PublicConsumerReport,
  PublicAssertionClient,
  AssertionClientModule,
  BroadWorkloadPlan,
  BenchmarkConfig,
  Corpus,
  CorpusRecord,
  InstalledProductRoute,
  MeshRecord,
  ProductBenchmarkConfig,
  Route,
  NewBinding,
  ExpectedResponse,
  ClaimRequest,
  LegacyImplementation,
} from '#bench/lib';

type InstalledCampaignRow = {
  id: string;
  capability: string;
  matcher: boolean;
  polarity: 'positive' | 'negative';
  claimId: string;
  subjectSlot: string;
  workUnitBudget: number;
  identityField: 'subjectHash' | 'contentHash';
  expectedIdentity: string | WireNull;
  authoring: { argumentsProtocolJson: unknown[]; queryPayload: unknown };
  sourceRow: {
    transport: {
      ingestRequestUtf8: string;
      primaryBuffer: Uint8Array<ArrayBuffer>;
      resourceBuffers: Array<Uint8Array<ArrayBuffer>>;
    };
  };
  expected: { canonicalResultUtf8: string | WireNull; status: string };
};

type InstalledHarness = {
  loadInstalledCampaign: () => { rows: InstalledCampaignRow[] };
};

/** Explicit nulls are retained in the JSONL report. */
// oxlint-disable-next-line typescript/no-restricted-types -- JSON evidence distinguishes explicit null from an omitted field.
type WireNull = null;

type ProductPhases = {
  initializationNs: number;
  admissionNs: number;
  subjectHandleNs: number;
  canonicalPlanNs: number;
  evaluationNs: number;
  releaseNs: number;
};

const emptyProductPhases = (): ProductPhases => ({
  initializationNs: 0,
  admissionNs: 0,
  subjectHandleNs: 0,
  canonicalPlanNs: 0,
  evaluationNs: 0,
  releaseNs: 0,
});

const jsonBytes = (value: unknown): Uint8Array<ArrayBuffer> => Buffer.from(JSON.stringify(value));

const requiredProductRoute = (config: ProductBenchmarkConfig, name: string): InstalledProductRoute => {
  const route = config.routes[name];
  if (
    route?.state !== 'ready' ||
    (route.execution.kind !== 'installed-js' && route.execution.kind !== 'installed-legacy-js')
  ) {
    throw new Error(`Product worker requires a ready built-in installed route: ${name}.`);
  }
  return route;
};

let sourceEngineStarted: bigint | undefined;

const emitFirstReport = (value: Record<string, unknown>): void => {
  writeSync(
    1,
    `${JSON.stringify({ event: 'first-report', ...value, engineOnlyReportNs: sourceEngineStarted === undefined ? undefined : Number(process.hrtime.bigint() - sourceEngineStarted), plantedDelayNs: plantPublicReport('firstActionableReportNs') })}\n`,
  );
};

const acknowledgeSuiteReport = (reports: Array<Record<string, unknown>>): void => {
  writeSync(
    1,
    `${JSON.stringify({ event: 'suite-report', reports, engineOnlyReportNs: sourceEngineStarted === undefined ? undefined : Number(process.hrtime.bigint() - sourceEngineStarted), cleanupStarted: false, plantedDelayNs: plantPublicReport('suiteReportNs') })}\n`,
  );
  const acknowledgement = Buffer.alloc(1);
  const bytes = readSync(0, acknowledgement, 0, acknowledgement.byteLength, null);
  if (bytes !== 1 || acknowledgement[0] !== 10) {
    throw new Error('Parent did not acknowledge the complete public suite.');
  }
};

const instrumentProductBinding = (binding: ProductBinding): ProductPhases => {
  const phases = emptyProductPhases();
  const { prototype } = binding.Engine;
  const {
    processRequest,
    ingestMesh,
    ingestSubject,
    subjectHandle,
    canonicalPlan,
    evaluatePlan,
    evaluateClaim,
    releaseSubject,
  } = prototype;

  prototype.processRequest = function (input) {
    const started = process.hrtime.bigint();
    try {
      return processRequest.call(this, input);
    } finally {
      phases.initializationNs += elapsed(started);
    }
  };
  prototype.ingestSubject = function (request, primary, resources) {
    const started = process.hrtime.bigint();
    try {
      return ingestSubject.call(this, request, primary, resources);
    } finally {
      phases.admissionNs += elapsed(started);
    }
  };
  prototype.ingestMesh = function (request, mesh) {
    const started = process.hrtime.bigint();
    try {
      return ingestMesh.call(this, request, mesh);
    } finally {
      phases.admissionNs += elapsed(started);
    }
  };
  prototype.subjectHandle = function (input) {
    const started = process.hrtime.bigint();
    try {
      return subjectHandle.call(this, input);
    } finally {
      phases.subjectHandleNs += elapsed(started);
    }
  };
  prototype.canonicalPlan = function (input) {
    const started = process.hrtime.bigint();
    try {
      return canonicalPlan.call(this, input);
    } finally {
      phases.canonicalPlanNs += elapsed(started);
    }
  };
  prototype.evaluatePlan = function (input) {
    const started = process.hrtime.bigint();
    try {
      return evaluatePlan.call(this, input);
    } finally {
      phases.evaluationNs += elapsed(started);
    }
  };
  if (evaluateClaim) {
    // One call canonicalizes and evaluates, so its whole time is evaluation.
    prototype.evaluateClaim = function (input) {
      const started = process.hrtime.bigint();
      try {
        return evaluateClaim.call(this, input);
      } finally {
        phases.evaluationNs += elapsed(started);
      }
    };
  }
  prototype.releaseSubject = function (input) {
    const started = process.hrtime.bigint();
    try {
      return releaseSubject.call(this, input);
    } finally {
      phases.releaseNs += elapsed(started);
    }
  };
  return phases;
};

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

const runEarlyWorker = async (configPath: string, routeName: string, workload: string): Promise<void> => {
  if (routeName !== 'reference' && routeName !== 'wasm' && routeName !== 'native') {
    throw new Error('Unknown benchmark route or workload.');
  }
  const config = JSON.parse(await readFile(configPath, 'utf8')) as BenchmarkConfig;
  const route = config.routes[routeName];
  const corpus = JSON.parse(await readFile(config.corpus.path, 'utf8')) as Corpus;
  const record = corpus.records.find(({ id }) => id === workload);
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
};

const configureInstalledRoute = (config: ProductBenchmarkConfig, route: InstalledProductRoute): void => {
  if (route.execution.kind !== 'installed-js') {
    throw new Error('Installed product worker received an external command route.');
  }
  process.env['GEOSPEC_WORKSPACE_ROOT'] = config.workspaceRoot;
  process.env['GEOSPEC_INSTALLED_BACKEND'] = route.backend;
  if (route.execution.campaign === undefined) {
    delete process.env['GEOSPEC_CAMPAIGN_INPUTS'];
    delete process.env['GEOSPEC_CAMPAIGN_INPUTS_SHA256'];
  } else {
    process.env['GEOSPEC_CAMPAIGN_INPUTS'] = route.execution.campaign.path;
    process.env['GEOSPEC_CAMPAIGN_INPUTS_SHA256'] = route.execution.campaign.sha256;
  }
};

const loadProductBinding = async (route: InstalledProductRoute): Promise<ProductBinding> => {
  if (route.execution.kind !== 'installed-js') {
    throw new Error('Installed product worker received an external command route.');
  }
  const binding = (await import(pathToFileURL(route.execution.binding.path).href)) as ProductBinding;
  if (route.backend === 'mixed') {
    if (binding.initialize === undefined) {
      throw new Error('Mixed installed product route has no initializer.');
    }
    await binding.initialize();
  }
  return binding;
};

const loadAssertionClient = async (route: InstalledProductRoute): Promise<AssertionClientModule> => {
  if (route.execution.kind !== 'installed-js') {
    throw new Error('Installed product worker received an external command route.');
  }
  return (await import(pathToFileURL(route.execution.assertionClient.path).href)) as AssertionClientModule;
};

const restoreJavascriptValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => restoreJavascriptValue(entry));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record['type'] === 'regexp' && typeof record['pattern'] === 'string' && typeof record['flags'] === 'string') {
      return new RegExp(record['pattern'], record['flags']);
    }
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, restoreJavascriptValue(entry)]));
  }
  return value;
};

const reportFromError = (error: unknown): PublicConsumerReport | undefined => {
  if (error !== null && typeof error === 'object') {
    const report = Reflect.get(error, 'report') as unknown;
    if (report !== null && typeof report === 'object') {
      return report as PublicConsumerReport;
    }
  }
  return undefined;
};

const ancillaryCapabilities = new Set([
  'analyzeMesh',
  'analyzeBrep',
  'inspectGeometry',
  'analyzeMeshOverlap',
  'queryPmi',
]);

const consumePublicClaim = async ({
  client,
  subject,
  capability,
  claimId,
  payload,
}: {
  client: PublicAssertionClient;
  subject: Record<string, string>;
  capability: string;
  claimId: string;
  payload: unknown;
}): Promise<PublicConsumerReport> => {
  if (ancillaryCapabilities.has(capability)) {
    return client.query({ capability, claimId, payload, subject });
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || !('expected' in payload)) {
    throw new TypeError(`${claimId}: public matcher payload omitted its expected value.`);
  }
  const matchers = client.expectGeo(subject);
  const matcher = matchers[capability];
  if (typeof matcher !== 'function') {
    throw new TypeError(`${claimId}: installed public matcher ${capability} is unavailable.`);
  }
  try {
    return (await Reflect.apply(matcher, matchers, [payload.expected])) as PublicConsumerReport;
  } catch (error) {
    const actionable = reportFromError(error);
    if (actionable === undefined) {
      throw error;
    }
    return actionable;
  }
};

const createPublicClient = ({
  module,
  binding,
  engine,
  claimId,
  subjectSlot,
  workUnitLimit,
}: {
  module: AssertionClientModule;
  binding: ProductBinding;
  engine: ProductEngine;
  claimId: string;
  subjectSlot: string;
  workUnitLimit: number;
}): PublicAssertionClient =>
  module.createGeoSpecAssertionClient({
    engine: {
      processRequest: (input) => engine.processRequest(input),
      canonicalPlan: (input) => engine.canonicalPlan(input),
      evaluatePlan: (input) => engine.evaluatePlan(input),
      // The installed client calls whichever evaluation route its product ships.
      ...(engine.evaluateClaim ? { evaluateClaim: engine.evaluateClaim.bind(engine) } : {}),
    },
    canonicalize: binding.canonicalize,
    claimId: () => claimId,
    subjectSlot,
    workUnitLimit,
  });

const releaseProductSubject = ({
  engine,
  subjectHandle,
  requestId,
  registryVersion,
}: {
  engine: ProductEngine;
  subjectHandle: unknown;
  requestId: string;
  registryVersion: number;
}): void => {
  engine.releaseSubject(
    jsonBytes({
      method: 'releaseSubject',
      requestId,
      protocolVersion: 3,
      registryVersion,
      canonicalProfile: 'geospec-jcs-v1',
      subjectHandle,
    }),
  );
};

const runInstalledCampaignRow = async ({
  config,
  route,
  rowId,
}: {
  config: ProductBenchmarkConfig;
  route: InstalledProductRoute;
  rowId: string;
}): Promise<Record<string, unknown>> => {
  if (route.execution.kind !== 'installed-js') {
    throw new Error('Installed campaign row requires an installed-js route.');
  }
  configureInstalledRoute(config, route);
  const binding = await loadProductBinding(route);
  const phases = instrumentProductBinding(binding);
  const assertionClient = await loadAssertionClient(route);
  const harness = (await import(pathToFileURL(route.execution.harness.path).href)) as InstalledHarness;
  const { rows } = harness.loadInstalledCampaign();
  const row = rows.find(({ id }) => id === rowId);
  if (row === undefined) {
    throw new Error(`Unknown installed campaign row ${rowId}.`);
  }
  const engine = new binding.Engine(cacheOptions());
  const observationStart: EngineObservation | WireNull = null;
  let workCounters: Record<string, unknown> = { engineReportedConsumedWorkUnits: null };
  const cache: Record<string, unknown> = {};
  const started = performance.now();
  const ingestRequest = JSON.parse(row.sourceRow.transport.ingestRequestUtf8) as { registryVersion: number };
  let cleanupStarted = false;
  let cleanupStartedAtFirstReport: boolean | undefined;
  let cleanup: Record<string, unknown> = { status: 'not-started' };
  let report: PublicConsumerReport;
  try {
    engine.processRequest(
      jsonBytes({
        method: 'initialize',
        requestId: `benchmark-init:${rowId}`,
        protocolVersion: 3,
        registryVersion: ingestRequest.registryVersion,
        canonicalProfile: 'geospec-jcs-v1',
      }),
    );
    const admission = responseResult(
      engine.ingestSubject(
        Buffer.from(row.sourceRow.transport.ingestRequestUtf8),
        Uint8Array.from(row.sourceRow.transport.primaryBuffer),
        row.sourceRow.transport.resourceBuffers.map((resource) => Uint8Array.from(resource)),
      ),
    );
    const subject = admission['subject'] as Record<string, unknown> | undefined;
    const identity = subject?.[row.identityField];
    if (typeof identity !== 'string') {
      throw new TypeError(`${rowId}: admission response omitted ${row.identityField}.`);
    }
    if (row.expectedIdentity !== null && identity !== row.expectedIdentity) {
      throw new Error(`${rowId}: installed subject identity changed.`);
    }
    const subjectReference = { [row.identityField]: identity };
    const handle = responseResult(
      engine.subjectHandle(
        jsonBytes({
          method: 'subjectHandle',
          requestId: `benchmark-handle:${rowId}`,
          protocolVersion: 3,
          registryVersion: ingestRequest.registryVersion,
          canonicalProfile: 'geospec-jcs-v1',
          [row.identityField]: identity,
        }),
      ),
    )['subjectHandle'];
    const client = createPublicClient({
      module: assertionClient,
      binding,
      engine,
      claimId: row.claimId,
      subjectSlot: row.subjectSlot,
      workUnitLimit: row.workUnitBudget,
    });
    report = await observePublicConsumerResult({
      consume: async () => {
        if (!row.matcher) {
          return client.query({
            capability: row.capability,
            claimId: row.claimId,
            payload: restoreJavascriptValue(row.authoring.queryPayload),
            subject: subjectReference,
          });
        }
        const chain = client.expectGeo(subjectReference);
        const methods = row.polarity === 'negative' ? chain.not : chain;
        const method = methods[row.capability];
        if (typeof method !== 'function') {
          throw new TypeError(`${rowId}: installed public matcher ${row.capability} is unavailable.`);
        }
        try {
          return (await Reflect.apply(
            method,
            methods,
            restoreJavascriptValue(row.authoring.argumentsProtocolJson) as unknown[],
          )) as PublicConsumerReport;
        } catch (error) {
          const actionable = reportFromError(error);
          if (actionable === undefined) {
            throw error;
          }
          return actionable;
        }
      },
      acknowledge: (consumerReport) => {
        emitFirstReport({
          workload: rowId,
          boundary: 'installed-public-assertion-client-settled',
          report: consumerReportRecord(consumerReport),
          cleanupStarted,
          phases: { ...phases },
        });
        cleanupStartedAtFirstReport = cleanupStarted;
      },
    });
    acknowledgeSuiteReport([consumerReportRecord(report)]);
    workCounters = observationWork(observationStart, readEngineObservation(engine));
    cleanupStarted = true;
    releaseProductSubject({
      engine,
      subjectHandle: handle,
      requestId: `benchmark-release:${rowId}`,
      registryVersion: ingestRequest.registryVersion,
    });
    cleanup = { status: 'released', close: route.backend === 'mixed' ? 'pending' : 'not-exported' };
  } finally {
    if (engine.close !== undefined) {
      closeMeasuredEngine(engine, cache);
      cleanup = { ...cleanup, close: 'closed' };
    }
  }
  const recordedReport = consumerReportRecord(report);
  const canonicalResultMatches =
    row.expected.canonicalResultUtf8 === null
      ? null
      : byteRecord(report.canonicalResult).utf8 === row.expected.canonicalResultUtf8;
  const successful = report.result.status === row.expected.status && canonicalResultMatches !== false;
  return {
    cache,
    kind: 'm3-row',
    workload: rowId,
    successful,
    routeState: 'public-consumer-settled',
    reportStatus: report.status,
    resultStatus: report.result.status,
    canonicalResultMatches,
    report: recordedReport,
    workCounters: {
      declaredWorkUnitLimit: row.workUnitBudget,
      ...workCounters,
    },
    cleanup,
    firstReportAcknowledgedBeforeCleanup: cleanupStartedAtFirstReport === false,
    phases,
    rssAfter: process.memoryUsage().rss,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    workerWallNs: Math.round((performance.now() - started) * 1_000_000),
  };
};

const responseResult = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> => {
  const response = JSON.parse(Buffer.from(bytes).toString()) as { result?: Record<string, unknown> };
  if (response.result === undefined) {
    throw new Error('Installed engine response omitted its result object.');
  }
  return response.result;
};

const commonTetrahedron = (): {
  format: 'mesh-buffer';
  positions: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
} => ({
  format: 'mesh-buffer',
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
});

const commonTetrahedronBytes = (): Uint8Array<ArrayBuffer> => {
  const source = commonTetrahedron();
  const bytes = Buffer.alloc(
    12 +
      source.positions.length * Float64Array.BYTES_PER_ELEMENT +
      source.indices.length * Uint32Array.BYTES_PER_ELEMENT,
  );
  bytes.write('GSM1');
  bytes.writeUInt32LE(source.positions.length / 3, 4);
  bytes.writeUInt32LE(source.indices.length / 3, 8);
  for (const [index, coordinate] of source.positions.entries()) {
    bytes.writeDoubleLE(coordinate, 12 + index * Float64Array.BYTES_PER_ELEMENT);
  }
  const indicesOffset = 12 + source.positions.length * Float64Array.BYTES_PER_ELEMENT;
  for (const [index, vertex] of source.indices.entries()) {
    bytes.writeUInt32LE(vertex, indicesOffset + index * Uint32Array.BYTES_PER_ELEMENT);
  }
  return bytes;
};

const commonBoundingBoxPayload = () => ({
  expected: {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
    tolerance: 0,
  },
  kind: 'boundingBox',
});

const runNewCommonTetrahedron = async ({
  config,
  route,
}: {
  config: ProductBenchmarkConfig;
  route: InstalledProductRoute;
}): Promise<Record<string, unknown>> => {
  if (route.execution.kind !== 'installed-js') {
    throw new Error('The current-product tetrahedron workload requires an installed-js route.');
  }
  configureInstalledRoute(config, route);
  const binding = await loadProductBinding(route);
  const phases = instrumentProductBinding(binding);
  const assertionClient = await loadAssertionClient(route);
  const mesh = commonTetrahedronBytes();
  const contentHash = sha256(mesh);
  const engine = new binding.Engine(cacheOptions());
  const observationStart: EngineObservation | WireNull = null;
  let workCounters: Record<string, unknown> = { engineReportedConsumedWorkUnits: null };
  const cache: Record<string, unknown> = {};
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  let cleanupStarted = false;
  let cleanupStartedAtFirstReport: boolean | undefined;
  let cleanup: Record<string, unknown> = { status: 'not-started' };
  let report: PublicConsumerReport;
  try {
    engine.processRequest(
      jsonBytes({
        method: 'initialize',
        requestId: 'benchmark-init:common-tetrahedron-bounds',
        protocolVersion: 3,
        registryVersion: 5,
        canonicalProfile: 'geospec-jcs-v1',
      }),
    );
    const admission = responseResult(
      engine.ingestMesh(
        jsonBytes({
          method: 'ingestSubject',
          requestId: 'benchmark-ingest:common-tetrahedron-bounds',
          protocolVersion: 3,
          registryVersion: 5,
          canonicalProfile: 'geospec-jcs-v1',
          contentHash,
          format: 'mesh-buffer-v1',
          frame: { coordinateSystem: 'z-up', unit: 'mm' },
        }),
        mesh,
      ),
    );
    const subject = admission['subject'] as Record<string, unknown> | undefined;
    const admittedHash = subject?.['contentHash'];
    if (admittedHash !== contentHash) {
      throw new Error('Current product changed the common tetrahedron content identity.');
    }
    const handle = responseResult(
      engine.subjectHandle(
        jsonBytes({
          method: 'subjectHandle',
          requestId: 'benchmark-handle:common-tetrahedron-bounds',
          protocolVersion: 3,
          registryVersion: 5,
          canonicalProfile: 'geospec-jcs-v1',
          contentHash,
        }),
      ),
    )['subjectHandle'];
    const client = createPublicClient({
      module: assertionClient,
      binding,
      engine,
      claimId: 'benchmark-common-tetrahedron-bounds',
      subjectSlot: 'subject',
      workUnitLimit: 10_000,
    });
    report = await observePublicConsumerResult({
      consume: async () =>
        consumePublicClaim({
          client,
          subject: { contentHash },
          capability: 'toHaveBoundingBox',
          claimId: 'benchmark-common-tetrahedron-bounds',
          payload: commonBoundingBoxPayload(),
        }),
      acknowledge: (consumerReport) => {
        emitFirstReport({
          workload: 'common-tetrahedron-bounds',
          boundary: 'installed-public-assertion-client-settled',
          report: consumerReportRecord(consumerReport),
          cleanupStarted,
          phases: { ...phases },
        });
        cleanupStartedAtFirstReport = cleanupStarted;
      },
    });
    acknowledgeSuiteReport([consumerReportRecord(report)]);
    workCounters = observationWork(observationStart, readEngineObservation(engine));
    cleanupStarted = true;
    releaseProductSubject({
      engine,
      subjectHandle: handle,
      requestId: 'benchmark-release:common-tetrahedron-bounds',
      registryVersion: 5,
    });
    cleanup = { status: 'released', close: route.backend === 'mixed' ? 'pending' : 'not-exported' };
  } finally {
    if (engine.close !== undefined) {
      closeMeasuredEngine(engine, cache);
      cleanup = { ...cleanup, close: 'closed' };
    }
  }
  return {
    cache,
    kind: 'common-tetrahedron-bounds',
    workload: 'common-tetrahedron-bounds',
    successful: report.result.status === 'passed',
    routeState: 'public-consumer-settled',
    report: consumerReportRecord(report),
    input: { format: 'mesh-buffer-v1', contentHash, bytes: mesh.byteLength },
    workCounters: { declaredWorkUnitLimit: 10_000, ...workCounters },
    cleanup,
    firstReportAcknowledgedBeforeCleanup: cleanupStartedAtFirstReport === false,
    phases,
    rssBefore,
    rssAfter: process.memoryUsage().rss,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    workerWallNs: Math.round((performance.now() - started) * 1_000_000),
  };
};

const runLegacyCommonTetrahedron = async (route: InstalledProductRoute): Promise<Record<string, unknown>> => {
  if (route.execution.kind !== 'installed-legacy-js') {
    throw new Error('The legacy tetrahedron workload requires an installed-legacy-js route.');
  }
  const loadStarted = process.hrtime.bigint();
  const module = (await import(pathToFileURL(route.execution.engine.path).href)) as {
    geoSpecEngineImplementation?: LegacyImplementation;
  };
  const implementation = module.geoSpecEngineImplementation;
  if (implementation === undefined) {
    throw new Error('Installed legacy module does not export geoSpecEngineImplementation.');
  }
  const loadNs = elapsed(loadStarted);
  const phases = emptyProductPhases();
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  const admissionStarted = process.hrtime.bigint();
  const admitted = await implementation.host.analyzeMesh({ source: commonTetrahedron(), format: 'mesh-buffer' });
  phases.admissionNs = elapsed(admissionStarted);
  if (!admitted.success) {
    throw new Error(`Installed legacy tetrahedron admission failed: ${JSON.stringify(admitted.diagnostics)}`);
  }
  let cleanupStarted = false;
  let cleanupStartedAtFirstReport: boolean | undefined;
  const claim = canonicalBytes({
    capability: 'toHaveBoundingBox',
    claimId: 'benchmark-common-tetrahedron-bounds',
    payload: commonBoundingBoxPayload(),
    subjectIds: [admitted.subject.subjectId],
    workUnitBudget: 10_000,
  });
  const evaluationStarted = process.hrtime.bigint();
  const publicReport = await observePublicConsumerResult({
    consume: async () =>
      implementation.protocol.submitClaims({
        requestId: 'benchmark-common-tetrahedron-bounds',
        registryVersion: 3,
        execution: { forensic: false, matcherWallBackstop: 600_000 },
        claims: [claim],
      }),
    acknowledge: (report) => {
      phases.evaluationNs = elapsed(evaluationStarted);
      const bytes = Buffer.from(JSON.stringify(report));
      emitFirstReport({
        workload: 'common-tetrahedron-bounds',
        boundary: 'installed-legacy-public-submitClaims-settled',
        report: {
          result: report.results[0],
          outputBytes: bytes.byteLength,
          outputSha256: sha256(bytes),
        },
        cleanupStarted,
        phases: { ...phases },
      });
      cleanupStartedAtFirstReport = cleanupStarted;
    },
  });
  acknowledgeSuiteReport(publicReport.results);
  cleanupStarted = true;
  const releaseStarted = process.hrtime.bigint();
  implementation.protocol.releaseSubject({
    requestId: 'benchmark-release:common-tetrahedron-bounds',
    subjectId: admitted.subject.subjectId,
  });
  phases.releaseNs = elapsed(releaseStarted);
  const output = Buffer.from(JSON.stringify(publicReport));
  return {
    kind: 'common-tetrahedron-bounds',
    workload: 'common-tetrahedron-bounds',
    successful: publicReport.results[0].status === 'passed',
    routeState: 'public-consumer-settled',
    report: {
      result: publicReport.results[0],
      outputBytes: output.byteLength,
      outputSha256: sha256(output),
    },
    input: { format: 'mesh-buffer', positions: 4, triangles: 4 },
    workCounters: {
      declaredWorkUnitLimit: 10_000,
      engineReportedConsumedWorkUnits: null,
      observations: null,
      unavailable: ['immutable-legacy-engine-internals'],
    },
    cleanup: { status: 'released', close: 'not-exported' },
    firstReportAcknowledgedBeforeCleanup: cleanupStartedAtFirstReport === false,
    phases: { loadNs, ...phases },
    rssBefore,
    rssAfter: process.memoryUsage().rss,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    workerWallNs: Math.round((performance.now() - started) * 1_000_000),
  };
};

const loadLegacyImplementation = async (route: InstalledProductRoute) => {
  if (route.execution.kind !== 'installed-legacy-js') {
    throw new Error('The legacy product adapter requires an installed-legacy-js route.');
  }
  const loadStarted = process.hrtime.bigint();
  const module = (await import(pathToFileURL(route.execution.engine.path).href)) as {
    geoSpecEngineImplementation?: LegacyImplementation;
  };
  const implementation = module.geoSpecEngineImplementation;
  if (implementation === undefined) {
    throw new Error('Installed legacy module does not export geoSpecEngineImplementation.');
  }
  return { implementation, loadNs: elapsed(loadStarted) };
};

const legacyClaimBytes = (claim: BroadWorkloadPlan['claims'][number], subjectId: string): Uint8Array<ArrayBuffer> => {
  const matcherPayload =
    claim.capability === 'analyzeMeshOverlap'
      ? claim.payload
      : { ...(claim.payload as Record<string, unknown>), arguments: [] };
  return canonicalBytes({
    claimId: claim.claimId,
    capability: claim.capability,
    subjectIds: [subjectId],
    payload: matcherPayload,
    workUnitBudget: claim.workUnitBudget,
  });
};

const padFour = (value: number): number => Math.ceil(value / 4) * 4;

const packSingleResourceGltf = (
  primary: Uint8Array<ArrayBuffer>,
  resource: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  const document = JSON.parse(Buffer.from(primary).toString('utf8')) as {
    buffers?: Array<{ uri?: string; byteLength?: number }>;
  };
  if (document.buffers?.length !== 1 || document.buffers[0] === undefined) {
    throw new Error('Legacy GLB adapter requires one external glTF buffer.');
  }
  if (document.buffers[0].byteLength !== resource.byteLength) {
    throw new Error('Legacy GLB adapter resource length does not match the glTF declaration.');
  }
  delete document.buffers[0].uri;
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = padFour(json.byteLength);
  const binaryLength = padFour(resource.byteLength);
  const output = Buffer.alloc(12 + 8 + jsonLength + 8 + binaryLength);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.byteLength, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.write('JSON', 16, 'ascii');
  output.fill(0x20, 20, 20 + jsonLength);
  json.copy(output, 20);
  const binaryHeader = 20 + jsonLength;
  output.writeUInt32LE(binaryLength, binaryHeader);
  output.write('BIN\0', binaryHeader + 4, 'ascii');
  Buffer.from(resource).copy(output, binaryHeader + 8);
  return output;
};

const runLegacyBroadFixture = async ({
  route,
  fixtureId,
  workload,
  state,
}: {
  config: ProductBenchmarkConfig;
  route: InstalledProductRoute;
  fixtureId: string;
  workload: BroadWorkloadPlan;
  state: WorkerState;
}): Promise<Record<string, unknown>> => {
  const { implementation, loadNs } = await loadLegacyImplementation(route);
  const initializationStarted = process.hrtime.bigint();
  const initialization = implementation.protocol.initialize({
    protocolVersion: 2,
    client: { name: 'geospec-benchmark-product-harness', version: 'a2' },
  });
  const phases = emptyProductPhases();
  phases.initializationNs = elapsed(initializationStarted);
  const advertisedCapabilities = new Set(initialization.capabilities.map(({ name }) => name));
  for (const claim of workload.claims) {
    if (!advertisedCapabilities.has(claim.capability)) {
      throw new Error(`${fixtureId}: installed legacy protocol does not advertise ${claim.capability}.`);
    }
  }
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  if (state.mode === 'warm-engine-cold-subject') {
    acknowledgeState({
      mode: state.mode,
      initialization: 'public protocol initialized; backend lazy work remains timed',
      retainedSubject: false,
    });
  }
  const admissionStarted = process.hrtime.bigint();
  let subjectId: string;
  let admissionAdapter: string;
  if (workload.subject.format === 'gltf') {
    if (workload.subject.resources.length !== 1 || workload.subject.resources[0] === undefined) {
      throw new Error(`${fixtureId}: legacy GLB adapter requires exactly one hash-verified resource.`);
    }
    const primary = Uint8Array.from(await readFile(workload.subject.primary.path));
    const resource = Uint8Array.from(await readFile(workload.subject.resources[0].path));
    const glb = packSingleResourceGltf(primary, resource);
    const admitted = await implementation.host.analyzeMesh({
      source: glb,
      format: 'glb',
      sourceUnit: 'mm',
      unit: 'mm',
    });
    if (!admitted.success) {
      throw new Error(`${fixtureId}: installed legacy mesh admission failed: ${JSON.stringify(admitted.diagnostics)}`);
    }
    subjectId = admitted.subject.subjectId;
    admissionAdapter = `hash-verified-gltf-plus-bin-packed-in-memory-as-glb:${sha256(glb)};public-host-analyzeMesh`;
  } else if (workload.subject.format === 'step') {
    const primary = Uint8Array.from(await readFile(workload.subject.primary.path));
    const contentHash = `sha256:${sha256(primary)}`;
    const admitted = await implementation.protocol.ingestSubject(
      {
        requestId: `benchmark-ingest:${fixtureId}`,
        contentHash,
        format: 'step',
        frame: { coordinateSystem: 'z-up', sourceUnit: 'mm', targetUnit: 'mm' },
        provenance: { fixtureId, source: 'hash-verified-broad-fixture' },
        options: {},
      },
      primary,
    );
    if (admitted.subject.contentHash !== contentHash) {
      throw new Error(`${fixtureId}: installed legacy protocol changed the STEP content identity.`);
    }
    subjectId = admitted.subject.subjectId;
    admissionAdapter = 'public-protocol-v2-ingestSubject-step-bytes';
  } else {
    throw new Error(`${fixtureId}: installed legacy adapter cannot ingest ${workload.subject.format}.`);
  }
  phases.admissionNs = elapsed(admissionStarted);
  const [firstClaim, ...remainingClaims] = workload.claims;
  if (firstClaim === undefined) {
    throw new Error(`${fixtureId}: broad workload has no executable claims.`);
  }
  let cleanupStarted = false;
  let cleanupStartedAtFirstReport: boolean | undefined;
  await prepareResident({
    state,
    workload,
    evaluate: async (claims) => {
      const report = await implementation.protocol.submitClaims({
        requestId: `benchmark-prefill:${fixtureId}`,
        registryVersion: 3,
        execution: { forensic: false, matcherWallBackstop: 600_000 },
        claims: claims.map((claim) => legacyClaimBytes(claim, subjectId)),
      });
      return report.results;
    },
  });
  const suiteStarted = process.hrtime.bigint();
  const firstEvaluationStarted = process.hrtime.bigint();
  const firstReport = await observePublicConsumerResult({
    consume: async () =>
      implementation.protocol.submitClaims({
        requestId: `benchmark-first:${fixtureId}`,
        registryVersion: 3,
        execution: { forensic: false, matcherWallBackstop: 600_000 },
        claims: [legacyClaimBytes(firstClaim, subjectId)],
      }),
    acknowledge: (report) => {
      phases.evaluationNs = elapsed(firstEvaluationStarted);
      const result = report.results[0];
      const bytes = Buffer.from(JSON.stringify(result));
      emitFirstReport({
        workload: fixtureId,
        boundary: 'installed-legacy-public-submitClaims-settled',
        report: { result, outputBytes: bytes.byteLength, outputSha256: sha256(bytes) },
        cleanupStarted,
        phases: { ...phases },
      });
      cleanupStartedAtFirstReport = cleanupStarted;
    },
  });
  const remainingReport =
    remainingClaims.length === 0
      ? { results: [] }
      : await implementation.protocol.submitClaims({
          requestId: `benchmark-remainder:${fixtureId}`,
          registryVersion: 3,
          execution: { forensic: false, matcherWallBackstop: 600_000 },
          claims: remainingClaims.map((claim) => legacyClaimBytes(claim, subjectId)),
        });
  const completeSuiteNs = elapsed(suiteStarted);
  const results = [...firstReport.results, ...remainingReport.results];
  acknowledgeSuiteReport(results);
  cleanupStarted = true;
  const releaseStarted = process.hrtime.bigint();
  implementation.protocol.releaseSubject({ requestId: `benchmark-release:${fixtureId}`, subjectId });
  phases.releaseNs = elapsed(releaseStarted);
  const statuses = results.map(({ status }) => status);
  const failures = results.filter(({ status }) => status !== 'passed');
  const outputIdentity = sha256(Buffer.from(JSON.stringify(results)));
  return {
    kind: 'broad-fixture',
    workload: fixtureId,
    successful: evaluationCompleted(results, workload.authoredClaims) && overlapMatches(workload, results),
    evaluationCompleted: evaluationCompleted(results, workload.authoredClaims),
    independentOverlapMatches: overlapMatches(workload, results),
    family: workload.fixture.family,
    subject: workload.subject.id,
    authoredClaims: workload.authoredClaims,
    executedClaims: statuses.length,
    unsupportedClaims: workload.unsupportedClaims,
    statusCounts: Object.fromEntries(
      [...new Set(statuses)].map((status) => [status, statuses.filter((candidate) => candidate === status).length]),
    ),
    failures: failures.slice(0, 20),
    failureCount: failures.length,
    failureEvidenceTruncated: failures.length > 20,
    publicReports: { first: firstReport.results[0], count: results.length, outputIdentity },
    protocolAdapter: {
      admission: admissionAdapter,
      claims: 'public-protocol-v2-submitClaims-canonical-bytes',
      release: 'public-protocol-v2-releaseSubject',
      analyzeMesh: workload.subject.format === 'gltf' ? 'executed-public-host-binding' : 'not-applicable-step',
      analyzeBrep:
        workload.subject.format === 'step'
          ? advertisedCapabilities.has('analyzeBrep')
            ? 'advertised-public-protocol-capability; matcher comparators use retained BRep facets'
            : 'genuine-capability-unsupported'
          : 'not-applicable-mesh',
    },
    workCounters: {
      declaredClaims: workload.claims.length,
      declaredWorkUnitLimitTotal: workload.claims.reduce((total, claim) => total + claim.workUnitBudget, 0),
      engineReportedConsumedWorkUnits: null,
      observations: null,
      unavailable: ['immutable-legacy-engine-internals'],
    },
    completeSuiteNs,
    input: {
      primary: workload.subject.primary,
      admittedResources: workload.subject.format === 'gltf' ? workload.subject.resources : [],
      evidenceOnlyResources:
        workload.subject.format === 'step' ? workload.subject.resources : workload.fixture.resources,
      independentFacts: workload.independentFacts,
    },
    cleanup: { status: 'released', close: 'not-exported' },
    firstReportAcknowledgedBeforeCleanup: cleanupStartedAtFirstReport === false,
    phases: { loadNs, ...phases },
    rssBefore,
    rssAfter: process.memoryUsage().rss,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    workerWallNs: Math.round((performance.now() - started) * 1_000_000),
  };
};

const runBroadFixture = async ({
  config,
  route,
  fixtureId,
  workload,
  state,
}: {
  config: ProductBenchmarkConfig;
  route: InstalledProductRoute;
  fixtureId: string;
  workload: BroadWorkloadPlan;
  state: WorkerState;
}): Promise<Record<string, unknown>> => {
  configureInstalledRoute(config, route);
  const binding = await loadProductBinding(route);
  const phases = instrumentProductBinding(binding);
  const assertionClient = await loadAssertionClient(route);
  const engine = new binding.Engine(cacheOptions());
  let observationStart: EngineObservation | WireNull = null;
  let workCounters: Record<string, unknown> = { engineReportedConsumedWorkUnits: null };
  const cache: Record<string, unknown> = {};
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  let handle: unknown;
  let cleanupStarted = false;
  let cleanupStartedAtFirstReport: boolean | undefined;
  let cleanup: Record<string, unknown> = { status: 'not-started' };
  try {
    engine.processRequest(
      jsonBytes({
        method: 'initialize',
        requestId: `benchmark-init:${fixtureId}`,
        protocolVersion: 3,
        registryVersion: 5,
        canonicalProfile: 'geospec-jcs-v1',
      }),
    );
    if (state.mode === 'warm-engine-cold-subject') {
      observationStart = readEngineObservation(engine);
      acknowledgeState({
        mode: state.mode,
        initialization: 'installed binding and public engine initialized',
        retainedSubject: false,
      });
    }
    const primary = Uint8Array.from(await readFile(workload.subject.primary.path));
    const admittedResources = workload.subject.format === 'gltf' ? workload.subject.resources : [];
    const resourceBytes = await Promise.all(
      admittedResources.map(async (resource) => Uint8Array.from(await readFile(resource.path))),
    );
    const admission = responseResult(
      engine.ingestSubject(
        jsonBytes({
          method: 'ingestSubject',
          requestId: `benchmark-ingest:${fixtureId}`,
          protocolVersion: 3,
          registryVersion: 5,
          canonicalProfile: 'geospec-jcs-v1',
          format: workload.subject.format,
          frame: {
            coordinateSystem: 'z-up',
            sourceUnit: workload.subject.format === 'step' ? 'auto' : 'mm',
            outputUnit: 'mm',
          },
          ingestOptions: {},
          primaryByteLength: primary.byteLength,
          resources: admittedResources.map(({ path, bytes }) => ({ name: basename(path), byteLength: bytes })),
        }),
        primary,
        resourceBytes,
      ),
    );
    const subject = admission['subject'] as Record<string, unknown> | undefined;
    const identityField = typeof subject?.['subjectHash'] === 'string' ? 'subjectHash' : 'contentHash';
    const identity = subject?.[identityField];
    if (typeof identity !== 'string') {
      throw new TypeError(`${fixtureId}: admission response omitted a product subject identity.`);
    }
    const handleResult = responseResult(
      engine.subjectHandle(
        jsonBytes({
          method: 'subjectHandle',
          requestId: `benchmark-handle:${fixtureId}`,
          protocolVersion: 3,
          registryVersion: 5,
          canonicalProfile: 'geospec-jcs-v1',
          [identityField]: identity,
        }),
      ),
    );
    handle = handleResult['subjectHandle'];
    const subjectReference = { [identityField]: identity };
    const firstClaim = workload.claims[0];
    if (firstClaim === undefined) {
      throw new Error(`${fixtureId}: broad workload has no executable claims.`);
    }
    const firstClient = createPublicClient({
      module: assertionClient,
      binding,
      engine,
      claimId: firstClaim.claimId,
      subjectSlot: 'subject',
      workUnitLimit: firstClaim.workUnitBudget,
    });
    await prepareResident({
      ready: (record) => {
        observationStart = readEngineObservation(engine);
        acknowledgeState(record);
      },
      state,
      workload,
      evaluate: async (claims) => {
        const records: Array<Record<string, unknown>> = [];
        for (const claim of claims) {
          const client = createPublicClient({
            module: assertionClient,
            binding,
            engine,
            claimId: claim.claimId,
            subjectSlot: 'subject',
            workUnitLimit: claim.workUnitBudget,
          });
          records.push(
            consumerReportRecord(
              // oxlint-disable-next-line no-await-in-loop -- Prefill one retained subject serially through the public matcher.
              await consumePublicClaim({
                client,
                subject: subjectReference,
                capability: claim.capability,
                claimId: claim.claimId,
                payload: claim.payload,
              }),
            ),
          );
        }
        return records;
      },
    });
    const suiteStarted = process.hrtime.bigint();
    const firstReport = await observePublicConsumerResult({
      consume: async () =>
        consumePublicClaim({
          client: firstClient,
          subject: subjectReference,
          capability: firstClaim.capability,
          claimId: firstClaim.claimId,
          payload: firstClaim.payload,
        }),
      acknowledge: (consumerReport) => {
        emitFirstReport({
          workload: fixtureId,
          boundary: 'installed-public-assertion-client-settled',
          report: consumerReportRecord(consumerReport),
          cleanupStarted,
          phases: { ...phases },
        });
        cleanupStartedAtFirstReport = cleanupStarted;
      },
    });
    const reports = [firstReport];
    for (const claim of workload.claims.slice(1)) {
      const client = createPublicClient({
        module: assertionClient,
        binding,
        engine,
        claimId: claim.claimId,
        subjectSlot: 'subject',
        workUnitLimit: claim.workUnitBudget,
      });
      const report =
        // oxlint-disable-next-line no-await-in-loop -- Authored broad claims execute serially through one retained subject.
        await consumePublicClaim({
          client,
          subject: subjectReference,
          capability: claim.capability,
          claimId: claim.claimId,
          payload: claim.payload,
        });
      reports.push(report);
    }
    const completeSuiteNs = elapsed(suiteStarted);
    const reportRecords = reports.map((report) => consumerReportRecord(report));
    acknowledgeSuiteReport(reportRecords);
    workCounters = observationWork(observationStart, readEngineObservation(engine));
    if (handle === undefined) {
      throw new Error(`${fixtureId}: product subject handle was not returned.`);
    }
    cleanupStarted = true;
    releaseProductSubject({
      engine,
      subjectHandle: handle,
      requestId: `benchmark-release:${fixtureId}`,
      registryVersion: 5,
    });
    cleanup = { status: 'released', close: route.backend === 'mixed' ? 'pending' : 'not-exported' };
    const statuses = reports.map(({ result }) => result.status);
    const failures = reports.filter(({ result }) => result.status !== 'passed');
    const outputIdentity = sha256(reportRecords.map((record) => JSON.stringify(record['canonicalResult'])).join('\n'));
    const successful =
      evaluationCompleted(
        reports.map(({ result }) => result),
        workload.authoredClaims,
      ) &&
      overlapMatches(
        workload,
        reports.map(({ result }) => result),
      );
    return {
      cache,
      kind: 'broad-fixture',
      workload: fixtureId,
      successful,
      family: workload.fixture.family,
      subject: workload.subject.id,
      authoredClaims: workload.authoredClaims,
      executedClaims: statuses.length,
      unsupportedClaims: workload.unsupportedClaims,
      statusCounts: Object.fromEntries(
        [...new Set(statuses)].map((status) => [status, statuses.filter((candidate) => candidate === status).length]),
      ),
      failures: failures.slice(0, 20).map((report) => consumerReportRecord(report)),
      failureCount: failures.length,
      failureEvidenceTruncated: failures.length > 20,
      publicReports: {
        first: reportRecords[0] ?? null,
        count: reportRecords.length,
        reports: reportRecords,
        outputIdentity,
      },
      workCounters: {
        declaredClaims: workload.claims.length,
        declaredWorkUnitLimitTotal: workload.claims.reduce((total, claim) => total + claim.workUnitBudget, 0),
        ...workCounters,
      },
      completeSuiteNs,
      input: {
        primary: workload.subject.primary,
        admittedResources,
        evidenceOnlyResources:
          workload.subject.format === 'step' ? workload.subject.resources : workload.fixture.resources,
        independentFacts: workload.independentFacts,
      },
      cleanup,
      firstReportAcknowledgedBeforeCleanup: cleanupStartedAtFirstReport === false,
      phases,
      rssBefore,
      rssAfter: process.memoryUsage().rss,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
      workerWallNs: Math.round((performance.now() - started) * 1_000_000),
    };
  } finally {
    if (engine.close !== undefined) {
      closeMeasuredEngine(engine, cache);
      cleanup['close'] = 'closed';
    }
  }
};

const runProductWorker = async ({
  configPath,
  routeName,
  workloadId,
  preparedPath,
}: {
  configPath: string;
  routeName: string;
  workloadId: string;
  preparedPath?: string;
}): Promise<void> => {
  const config = JSON.parse(await readFile(configPath, 'utf8')) as ProductBenchmarkConfig;
  const route = requiredProductRoute(config, routeName);
  const workload = config.workloads.find(({ id }) => id === workloadId);
  if (workload === undefined) {
    throw new Error(`Unknown product workload ${workloadId}.`);
  }
  if (
    workload.kind !== 'common-tetrahedron-bounds' &&
    workload.kind !== 'm3-row' &&
    workload.kind !== 'broad-fixture'
  ) {
    throw new Error('Aggregate workloads are orchestrated by the parent over leaf worker admissions.');
  }
  let prepared =
    preparedPath === undefined ? undefined : (JSON.parse(await readFile(preparedPath, 'utf8')) as BroadWorkloadPlan);
  if (workload.kind === 'broad-fixture' && prepared?.fixture.id !== workload.fixtureId) {
    throw new Error('Broad worker requires the parent-preflighted selected workload.');
  }
  let sourceReward: Record<string, unknown> | undefined;
  const sourceInput = process.env['GEOSPEC_SOURCE_REWARD'];
  if (sourceInput) {
    if (prepared?.subject.format !== 'step') {
      throw new Error('Source-to-reward requires a prepared STEP claim workload.');
    }
    const { input, output } = JSON.parse(sourceInput) as { input: SourceRewardInput; output: string };
    const { produceSourceReward } = await import('#bench/source-reward');
    const produced = await produceSourceReward({ input, output, workload: prepared });
    prepared = produced.workload;
    sourceReward = produced.receipt;
  }
  const engineStarted = process.hrtime.bigint();
  if (sourceReward) {
    sourceEngineStarted = engineStarted;
  }
  const state = JSON.parse(process.env['GEOSPEC_CAMPAIGN_STATE'] ?? '{"mode":"cold-process"}') as WorkerState;
  if (state.mode !== 'cold-process' && workload.kind !== 'broad-fixture') {
    throw new Error('Selected state contract requires a broad public workload.');
  }
  let result: Record<string, unknown>;
  if (workload.kind === 'common-tetrahedron-bounds') {
    result =
      route.execution.kind === 'installed-legacy-js'
        ? await runLegacyCommonTetrahedron(route)
        : await runNewCommonTetrahedron({ config, route });
  } else {
    result =
      workload.kind === 'm3-row'
        ? route.execution.kind === 'installed-js'
          ? await runInstalledCampaignRow({ config, route, rowId: workload.rowId })
          : (() => {
              throw new Error(`${workload.id} is a native-only campaign row without a legacy analogue.`);
            })()
        : route.execution.kind === 'installed-legacy-js'
          ? await runLegacyBroadFixture({ config, route, fixtureId: workload.fixtureId, workload: prepared!, state })
          : await runBroadFixture({ config, route, fixtureId: workload.fixtureId, workload: prepared!, state });
  }
  if (sourceReward) {
    result['sourceReward'] = {
      ...sourceReward,
      engineThroughCleanupNs: Number(process.hrtime.bigint() - engineStarted),
    };
  }
  process.stdout.write(`${JSON.stringify({ event: 'complete', result })}\n`);
  if (result['successful'] !== true) {
    process.exitCode = 1;
  }
};

const configPath = process.argv[2];
const routeName = process.argv[3];
const workload = process.argv[4];
if (configPath === undefined || routeName === undefined || workload === undefined) {
  throw new Error('Benchmark worker requires config, route, and workload arguments.');
}
const parsed = JSON.parse(await readFile(configPath, 'utf8')) as { schemaVersion?: number };
// oxlint-disable-next-line unicorn/prefer-ternary -- Branch statements keep both top-level awaits visible to the lifecycle rule.
if (parsed.schemaVersion === 2) {
  await runProductWorker({ configPath, routeName, workloadId: workload, preparedPath: process.argv[5] });
} else {
  await runEarlyWorker(configPath, routeName, workload);
}
