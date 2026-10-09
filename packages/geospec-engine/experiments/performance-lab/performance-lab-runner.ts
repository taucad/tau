/** Private browser-safe ordinary performance-lab runner. Hosts inject actual engine modules. */
// eslint-disable-next-line @nx/enforce-module-boundaries, import-x/no-extraneous-dependencies -- Private bench-only adapter consumes the public matcher client without changing package runtime dependencies.
import {
  createGeoSpecAssertionClient,
  GeoSpecAssertionError,
  geoSpecMatcherDescriptors,
} from 'geospec/assertion-client';
// eslint-disable-next-line @nx/enforce-module-boundaries, import-x/no-extraneous-dependencies -- Type-only public query vocabulary for the private bench adapter.
import type { GeoSpecQueryCapability, GeoSpecCanonicalClaimReport } from 'geospec/assertion-client';
// eslint-disable-next-line @nx/enforce-module-boundaries, import-x/no-extraneous-dependencies -- Private bench-only adapter uses the public model loader; this is not packaged runtime code.
import { createGeoSpecNativeModelLoader } from 'geospec/runner/native';
// eslint-disable-next-line @nx/enforce-module-boundaries, import-x/no-extraneous-dependencies -- Private bench-only adapter uses canonical protocol helpers.
import { toGeoSpecProtocolJson } from 'geospec/engine';
import type {
  HostBytes,
  HostCacheLifecycle,
  HostClaimEvaluation,
  HostEngine,
  HostSubjectLifecycle,
} from '@taucad/geospec-engine-native/node';

/** Explicit browser WASM selection; omitted requests retain the existing ST path. @internal */
export type PerformanceLabWasmExecution =
  | { readonly variant: 'st' }
  | {
      readonly variant: 'mt';
      readonly permits: number;
      readonly receipt: string;
    };

/** One ordinary authored matcher or query call. @internal */
export type PerformanceLabCase = {
  id: string;
  kind: 'matcher' | 'query';
  matcher: string;
  arguments: readonly unknown[];
  payload?: unknown;
  claimId?: string;
  subjectSlot?: string;
  workUnitBudget?: number;
  polarity: 'positive' | 'negative';
  expectedStatus: 'passed' | 'failed' | 'refused' | 'unverified';
};

/** Byte-only input shared by the browser and desktop benchmark hosts. @internal */
export type PerformanceLabRunInput = {
  engine: 'combined-wasm' | 'native-desktop';
  execution?: PerformanceLabWasmExecution;
  fixture: {
    id: string;
    format: 'step' | 'glb' | 'rational-plate';
    sourceUnit: 'auto' | 'mm' | 'm';
    bytes: Uint8Array<ArrayBuffer>;
    sha256: string;
  };
  cases: readonly PerformanceLabCase[];
  repeats: number;
  /** Cold means a fresh module/engine; warm means module reused but subject re-admitted. */
  cache: 'cold' | 'warm' | 'host-module-cache';
};

/** Actual engine module injected by the selected host. @internal */
export type PerformanceLabEngineModule = {
  Engine: new (
    execution?: PerformanceLabWasmExecution,
  ) => HostEngine & HostSubjectLifecycle & Partial<Pick<HostCacheLifecycle, 'cacheProducerIdentity'>>;
  /** The facade's JCS codec; only {@link withTwoCallClaims} uses it. */
  canonicalize: (bytes: HostBytes) => HostBytes;
  initialize?: (input?: undefined, execution?: PerformanceLabWasmExecution) => Promise<void>;
};

/**
 * Give a product whose add-on predates `evaluateClaim` (R10) the one-call claim surface the client
 * needs, replaying the calls the client made before it: `canonicalPlan`, `canonicalize` of the plan's
 * one claim, then `evaluatePlan` of that plan. Before/after cells then run the same authored claims.
 *
 * @internal
 * @param module - Facade module over the older add-on.
 * @returns The module with an Engine whose `evaluateClaim` makes the older calls.
 */
export const withTwoCallClaims = (module: PerformanceLabEngineModule): PerformanceLabEngineModule => {
  const { canonicalize } = module;
  class Engine extends module.Engine {
    /**
     * Evaluate one claim through the older add-on's calls.
     * @param request - Exact submitClaims request bytes with one claim.
     * @returns The canonical plan, claim and result bytes those calls return.
     */
    public override evaluateClaim(request: HostBytes): HostClaimEvaluation {
      const canonicalPlan = this.canonicalPlan(request);
      const { plan } = JSON.parse(new TextDecoder().decode(canonicalPlan)) as { plan: { claims: unknown[] } };
      const canonicalClaim = canonicalize(new TextEncoder().encode(JSON.stringify(plan.claims[0])));
      return { canonicalPlan, canonicalClaim, canonicalResult: this.evaluatePlan(canonicalPlan) };
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the injected engine module contract.
  return { ...module, Engine };
};

/** Lazy imports included in startup timing. @internal */
export type PerformanceLabModules = {
  combined?: () => Promise<PerformanceLabEngineModule>;
  native?: () => Promise<PerformanceLabEngineModule>;
};

/** Raw result and evaluation duration in milliseconds for one ordinary call. @internal */
export type PerformanceLabCaseResult = {
  caseId: string;
  matcher: string;
  repeat: number;
  status: string;
  expectedStatus: PerformanceLabCase['expectedStatus'];
  diagnostics: readonly unknown[];
  result: unknown;
  evaluation: number;
  numericProfile: string | WireNull;
  canonicalClaimUtf8: string | WireNull;
  canonicalResultUtf8: string | WireNull;
  canonicalResultSha256: string | WireNull;
};

/** Complete cell evidence; all timing fields are milliseconds. @internal */
export type PerformanceLabRunResult = {
  engine: PerformanceLabRunInput['engine'];
  execution?: PerformanceLabWasmExecution;
  backend: string;
  profile: string | WireNull;
  fixtureId: string;
  cache: 'cold-module-cold-subject' | 'warm-module-cold-subject' | 'host-module-cache/subject-cold';
  buildIdentity: unknown;
  engineObservations: unknown;
  initializationTiming: 'startup';
  perCase: readonly PerformanceLabCaseResult[];
  timing: {
    firstResult?: number | WireNull;
    startup: number;
    admission: number;
    evaluation: number;
    cleanup: number;
    total: number;
  };
};

// oxlint-disable-next-line typescript/no-restricted-types -- Raw JSON evidence distinguishes explicit null from omission.
type WireNull = null;
const encoder = new TextEncoder();
const queryCapabilities = new Set<GeoSpecQueryCapability>([
  'analyzeMesh',
  'analyzeBrep',
  'inspectGeometry',
  'analyzeMeshOverlap',
  'queryPmi',
]);
const decoder = new TextDecoder();
const ms = (start: number): number => performance.now() - start;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));
const textId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 160;
const absoluteWorkerReceiptUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      (url.protocol === 'app:' && url.host === 'tau' && url.username === '' && url.password === '')
    );
  } catch {
    return false;
  }
};
const hex = (bytes: Uint8Array<ArrayBuffer>): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
const profileOf = (value: unknown): string | WireNull => {
  if (!record(value)) {
    return null;
  }
  const profile = value['numericProfile'];
  return typeof profile === 'string' ? profile : null;
};
const cacheLabel = (cache: PerformanceLabRunInput['cache']): PerformanceLabRunResult['cache'] =>
  cache === 'cold'
    ? 'cold-module-cold-subject'
    : cache === 'warm'
      ? 'warm-module-cold-subject'
      : 'host-module-cache/subject-cold';
const decode = (bytes: Uint8Array<ArrayBuffer>): unknown => JSON.parse(decoder.decode(bytes)) as unknown;
/**
 * Read the root numeric profile retained by the public evaluatePlan client.
 * @internal
 * @param bytes - Canonical result envelope bytes.
 * @returns The observed profile, or null for an unlabelled result.
 */
export const numericProfileOfCanonicalResult = (bytes: Uint8Array<ArrayBuffer>): string | WireNull =>
  profileOf(decode(bytes));
const canonicalFields = async (claim: Uint8Array<ArrayBuffer>, result: Uint8Array<ArrayBuffer>) => ({
  canonicalClaimUtf8: decoder.decode(claim),
  canonicalResultUtf8: decoder.decode(result),
  canonicalResultSha256: await digest(result),
});

const admitRationalPlate = (engine: HostEngine & HostSubjectLifecycle, input: PerformanceLabRunInput) => {
  const header = {
    canonicalProfile: 'geospec-jcs-v1',
    protocolVersion: 3,
    registryVersion: 5,
  };
  const bytes = encoder.encode(
    JSON.stringify({
      ...header,
      method: 'ingestSubject',
      requestId: `lab-ingest:${input.fixture.id}`,
      format: 'rational-plate',
      frame: { coordinateSystem: 'z-up', sourceUnit: 'mm', outputUnit: 'mm' },
      ingestOptions: {},
      primaryByteLength: input.fixture.bytes.byteLength,
      resources: [],
    }),
  );
  const admission = decode(engine.ingestSubject(bytes, input.fixture.bytes, []));
  if (
    !record(admission) ||
    !record(admission['result']) ||
    !record(admission['result']['subject']) ||
    typeof admission['result']['subject']['subjectHash'] !== 'string'
  ) {
    throw new TypeError('Rational plate admission returned no subject hash.');
  }
  const { subjectHash } = admission['result']['subject'];
  const handle = decode(
    engine.subjectHandle(
      encoder.encode(
        JSON.stringify({
          ...header,
          method: 'subjectHandle',
          requestId: `lab-handle:${input.fixture.id}`,
          subjectHash,
        }),
      ),
    ),
  );
  if (!record(handle) || !record(handle['result']) || !record(handle['result']['subjectHandle'])) {
    throw new TypeError('Rational plate admission returned no subject handle.');
  }
  const { subjectHandle } = handle['result'];
  return {
    subject: { subjectHash },
    release: () => {
      engine.releaseSubject(
        encoder.encode(
          JSON.stringify({
            ...header,
            method: 'releaseSubject',
            requestId: `lab-release:${input.fixture.id}`,
            subjectHandle,
          }),
        ),
      );
    },
  };
};

/**
 * Parse the sole byte-only worker/desktop request payload.
 * @internal
 * @param value - Untrusted host request input.
 * @returns Validated ordinary benchmark input.
 */
export const parsePerformanceLabRunInput = async (value: unknown): Promise<PerformanceLabRunInput> => {
  if (
    !record(value) ||
    !onlyKeys(value, ['engine', 'execution', 'fixture', 'cases', 'repeats', 'cache']) ||
    (value['engine'] !== 'combined-wasm' && value['engine'] !== 'native-desktop')
  ) {
    throw new TypeError('Invalid performance-lab engine.');
  }
  const { execution } = value;
  if (execution !== undefined) {
    if (
      value['engine'] !== 'combined-wasm' ||
      !record(execution) ||
      !onlyKeys(execution, ['variant', 'permits', 'receipt'])
    ) {
      throw new TypeError('WASM execution is only available for combined-wasm.');
    }
    if (execution['variant'] === 'st') {
      if (!onlyKeys(execution, ['variant'])) {
        throw new TypeError('ST execution has no permit or receipt.');
      }
    } else if (
      execution['variant'] !== 'mt' ||
      !Number.isSafeInteger(execution['permits']) ||
      (execution['permits'] as number) < 1 ||
      (execution['permits'] as number) > 4_294_967_295 ||
      !absoluteWorkerReceiptUrl(execution['receipt'])
    ) {
      throw new TypeError('MT execution requires positive permits and an absolute web or app://tau receipt URL.');
    }
  }
  const { fixture } = value;
  if (
    !record(fixture) ||
    !onlyKeys(fixture, ['id', 'format', 'sourceUnit', 'bytes', 'sha256']) ||
    !textId(fixture['id']) ||
    (fixture['format'] !== 'step' && fixture['format'] !== 'glb' && fixture['format'] !== 'rational-plate') ||
    (fixture['sourceUnit'] !== 'auto' && fixture['sourceUnit'] !== 'mm' && fixture['sourceUnit'] !== 'm') ||
    !(fixture['bytes'] instanceof Uint8Array) ||
    !(fixture['bytes'].buffer instanceof ArrayBuffer) ||
    fixture['bytes'].byteLength === 0 ||
    fixture['bytes'].byteLength > 64 * 1024 * 1024 ||
    typeof fixture['sha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(fixture['sha256'])
  ) {
    throw new TypeError('Invalid performance-lab fixture.');
  }
  if (fixture['format'] === 'rational-plate' && fixture['sourceUnit'] !== 'mm') {
    throw new TypeError('Rational plate requires millimetres.');
  }
  if (fixture['format'] === 'glb' && fixture['sourceUnit'] === 'auto') {
    throw new TypeError('GLB fixture requires a pinned source unit.');
  }
  if ((await digest(fixture['bytes'] as Uint8Array<ArrayBuffer>)) !== fixture['sha256']) {
    throw new TypeError('Performance-lab fixture SHA-256 mismatch.');
  }
  const { cases } = value;
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > 128) {
    throw new TypeError('Invalid performance-lab cases.');
  }
  for (const entry of cases as unknown[]) {
    if (
      !record(entry) ||
      !onlyKeys(entry, [
        'id',
        'kind',
        'matcher',
        'arguments',
        'payload',
        'claimId',
        'subjectSlot',
        'workUnitBudget',
        'polarity',
        'expectedStatus',
      ]) ||
      !textId(entry['id']) ||
      (entry['kind'] !== 'matcher' && entry['kind'] !== 'query') ||
      typeof entry['matcher'] !== 'string' ||
      (entry['kind'] === 'matcher'
        ? !Object.hasOwn(geoSpecMatcherDescriptors, entry['matcher'])
        : !queryCapabilities.has(entry['matcher'] as GeoSpecQueryCapability)) ||
      !Array.isArray(entry['arguments']) ||
      entry['arguments'].length > 16 ||
      (entry['claimId'] !== undefined && !textId(entry['claimId'])) ||
      (entry['subjectSlot'] !== undefined && !textId(entry['subjectSlot'])) ||
      (entry['workUnitBudget'] !== undefined &&
        (!Number.isSafeInteger(entry['workUnitBudget']) ||
          (entry['workUnitBudget'] as number) < 1 ||
          (entry['workUnitBudget'] as number) > 8_000_000)) ||
      (entry['polarity'] !== 'positive' && entry['polarity'] !== 'negative') ||
      (entry['expectedStatus'] !== 'passed' &&
        entry['expectedStatus'] !== 'failed' &&
        entry['expectedStatus'] !== 'refused' &&
        entry['expectedStatus'] !== 'unverified')
    ) {
      throw new TypeError('Invalid performance-lab matcher case.');
    }
    if (entry['kind'] === 'query' && (entry['polarity'] !== 'positive' || entry['arguments'].length > 0)) {
      throw new TypeError('GeoSpec queries accept only positive payload calls.');
    }
    toGeoSpecProtocolJson(entry['arguments']);
    if (entry['payload'] !== undefined) {
      toGeoSpecProtocolJson(entry['payload']);
    }
  }
  if (!Number.isInteger(value['repeats']) || (value['repeats'] as number) < 1 || (value['repeats'] as number) > 20) {
    throw new TypeError('Performance-lab repeats must be 1–20.');
  }
  if (value['cache'] !== 'cold' && value['cache'] !== 'warm' && value['cache'] !== 'host-module-cache') {
    throw new TypeError('Invalid performance-lab cache condition.');
  }
  return value as PerformanceLabRunInput;
};

const runNative = async (
  input: PerformanceLabRunInput,
  load: () => Promise<PerformanceLabEngineModule>,
  resultRetention: 'complete' | 'discard',
): Promise<PerformanceLabRunResult> => {
  const totalAt = performance.now();
  const startupAt = performance.now();
  const module = await load();
  const execution = input.engine === 'combined-wasm' ? (input.execution ?? { variant: 'st' }) : undefined;
  await module.initialize?.(undefined, execution);
  const engine = new module.Engine(execution);
  const startup = ms(startupAt);
  const loader = createGeoSpecNativeModelLoader({ engine });
  let admission = 0;
  let evaluation = 0;
  let cleanup = 0;
  let profile: string | WireNull = null;
  let buildIdentity: unknown = null;
  let engineObservations: unknown = null;
  const perCase: PerformanceLabCaseResult[] = [];
  let firstResult: number | WireNull = null;
  let releaseRational: (() => void) | undefined;
  try {
    const admittedAt = performance.now();
    const subject =
      input.fixture.format === 'rational-plate'
        ? (() => {
            const admitted = admitRationalPlate(engine, input);
            releaseRational = admitted.release;
            return admitted.subject;
          })()
        : await loader({
            source: input.fixture.bytes,
            format: input.fixture.format,
            ...(input.fixture.format === 'glb' ? { sourceUnit: input.fixture.sourceUnit } : {}),
          });
    admission = ms(admittedAt);
    /* oxlint-disable no-await-in-loop -- Sequential calls share one admitted subject and must not contend during measurement. */
    for (let repeat = 0; repeat < input.repeats; repeat += 1) {
      for (const current of input.cases) {
        const client = createGeoSpecAssertionClient({
          engine,
          subjectSlot: current.subjectSlot,
          ...(current.workUnitBudget === undefined ? {} : { workUnitLimit: current.workUnitBudget }),
          ...(current.claimId === undefined ? {} : { claimId: () => current.claimId! }),
        });
        const matchers = client.expectGeo(subject);
        const methods: Record<string, unknown> = current.polarity === 'negative' ? matchers.not : matchers;
        const method = current.kind === 'query' ? client.query : methods[current.matcher];
        if (typeof method !== 'function') {
          if (resultRetention === 'discard') {
            continue;
          }
          perCase.push({
            caseId: current.id,
            matcher: current.matcher,
            repeat,
            status: 'unsupported',
            expectedStatus: current.expectedStatus,
            diagnostics: ['Matcher absent from native assertion client.'],
            result: null,
            evaluation: 0,
            numericProfile: null,
            canonicalClaimUtf8: null,
            canonicalResultUtf8: null,
            canonicalResultSha256: null,
          });
          continue;
        }
        const evaluatedAt = performance.now();
        let report: GeoSpecCanonicalClaimReport;
        try {
          report =
            current.kind === 'query'
              ? await client.query({
                  capability: current.matcher as GeoSpecQueryCapability,
                  payload: current.payload,
                  subject,
                  claimId: current.claimId,
                })
              : await (method as (...args: readonly unknown[]) => Promise<GeoSpecCanonicalClaimReport>)(
                  ...current.arguments,
                );
        } catch (error) {
          if (!(error instanceof GeoSpecAssertionError)) {
            throw error;
          }
          report = error.report;
        }
        const elapsed = ms(evaluatedAt);
        evaluation += elapsed;
        if (resultRetention === 'discard') {
          firstResult ??= ms(totalAt);
          continue;
        }
        const numericProfile = numericProfileOfCanonicalResult(report.canonicalResult);
        profile ??= numericProfile;
        perCase.push({
          caseId: current.id,
          matcher: current.matcher,
          repeat,
          status: report.status,
          expectedStatus: current.expectedStatus,
          diagnostics: report.diagnostics,
          result: report.result,
          evaluation: elapsed,
          numericProfile,
          ...(await canonicalFields(report.canonicalClaim, report.canonicalResult)),
        });
        firstResult ??= ms(totalAt);
      }
    }
    /* oxlint-enable no-await-in-loop */
    if (resultRetention === 'complete') {
      engineObservations = engine.observations ? decode(engine.observations()) : null;
      buildIdentity = engine.cacheProducerIdentity ? decode(engine.cacheProducerIdentity()) : null;
    }
  } finally {
    const cleanupAt = performance.now();
    try {
      releaseRational?.();
      await loader.releaseAll();
    } finally {
      engine.close();
    }
    cleanup = ms(cleanupAt);
  }
  return {
    engine: input.engine,
    ...(execution === undefined ? {} : { execution }),
    backend: input.engine,
    profile,
    buildIdentity,
    engineObservations,
    initializationTiming: 'startup',
    fixtureId: input.fixture.id,
    cache: cacheLabel(input.cache),
    perCase,
    timing: {
      firstResult,
      startup,
      admission,
      evaluation,
      cleanup,
      total: ms(totalAt),
    },
  };
};

/**
 * Admit one fixture, then run sequential public calls on the injected engine.
 * @internal
 * @param input - Parsed ordinary benchmark input.
 * @param modules - Actual lazy modules supplied by the host.
 * @param resultRetention - Discard unused prewarm reporting only; calls and cleanup still execute.
 * @returns Raw per-case evidence and complete cell wall timing.
 */
export const runPerformanceLabCell = async (
  input: PerformanceLabRunInput,
  modules: PerformanceLabModules,
  resultRetention: 'complete' | 'discard' = 'complete',
): Promise<PerformanceLabRunResult> => {
  const load = input.engine === 'combined-wasm' ? modules.combined : modules.native;
  if (!load) {
    throw new Error(`${input.engine} GeoSpec engine module is unavailable.`);
  }
  return runNative(input, load, resultRetention);
};
