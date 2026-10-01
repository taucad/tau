/** Runner-independent GeoSpec assertions over the native byte protocol. @module */

import type { JSONValue } from '@taucad/runtime/types';
import {
  evaluateGeoSpecNativeClaim,
  evaluateGeoSpecNativeQuery,
  resolveGeoSpecNativeWorkUnitLimit,
  supportsGeoSpecNativeMinimumDistance,
} from '#engine/client.js';
import type {
  GeoSpecCanonicalClaimReport,
  GeoSpecClaimPolarity,
  GeoSpecNativeEngine,
  GeoSpecNativeEvidenceProfile,
  GeoSpecNativeSubject,
  GeoSpecQueryCapability,
} from '#engine/client.js';
import {
  geoSpecMatcherDescriptors,
  geoSpecNativeMatcherDescriptors,
  normalizeGeoSpecExpected,
} from '#engine/matchers.js';
import type { GeoSpecFixedNativeMatcherName, GeoSpecMatcherName, GeoSpecNativeMatcherName } from '#engine/matchers.js';
import type { GeoSpecAssertion, GeoSpecMatcher } from '#runner/types.js';

/** One authored call shared by the collector and native assertion client. @public */
export type GeoSpecAuthoringInvocation = {
  readonly arguments: readonly unknown[];
  readonly expected: unknown;
  readonly kind: GeoSpecAssertion['kind'];
  readonly matcher: GeoSpecMatcherName;
  readonly polarity: GeoSpecClaimPolarity;
  readonly subject: unknown;
};

/** Fixed-contract native authoring call with no user arguments. @public */
export type GeoSpecFixedNativeAuthoringInvocation = {
  readonly arguments: readonly never[];
  readonly expected: true;
  readonly matcher: GeoSpecFixedNativeMatcherName;
  readonly polarity: GeoSpecClaimPolarity;
  readonly subject: unknown;
};

/** One authored call accepted by a native matcher client. @public */
export type GeoSpecNativeAuthoringInvocation = GeoSpecAuthoringInvocation | GeoSpecFixedNativeAuthoringInvocation;

/** Matcher methods derived mechanically from the existing GeoSpec registry. @public */
export type GeoSpecMatcherMethods<Result> = {
  [Name in GeoSpecMatcherName]: (...arguments_: Parameters<GeoSpecMatcher[Name]>) => Result;
};

/** Native matcher methods extend the legacy surface with fixed nullary calls. @public */
export type GeoSpecNativeMatcherMethods<Result> = GeoSpecMatcherMethods<Result> &
  Record<GeoSpecFixedNativeMatcherName, () => Result>;

/** Standalone native matcher chain, including core-owned negation. @public */
export type GeoSpecAssertionMatchers = GeoSpecNativeMatcherMethods<Promise<GeoSpecCanonicalClaimReport>> & {
  readonly not: GeoSpecNativeMatcherMethods<Promise<GeoSpecCanonicalClaimReport>>;
};

/** Runner-independent native assertion client. @public */
export type GeoSpecAssertionClient = {
  expectGeo(subject: GeoSpecNativeSubject): GeoSpecAssertionMatchers;
  query(options: MinimumDistanceQuery): Promise<MinimumDistanceResult>;
  query(options: GeoSpecQueryOptions): Promise<GeoSpecCanonicalClaimReport>;
};

/** Complete AP242 minimum over two subject-bound occurrence paths. @public */
export type MinimumDistanceQuery = {
  readonly capability: 'minimumDistance';
  readonly subject: GeoSpecNativeSubject;
  readonly payload: {
    readonly pair: readonly [{ readonly occurrencePath: string }, { readonly occurrencePath: string }];
  };
};

/** Complete native minimum and ordered finite witnesses in canonical millimetres/Z-up. @public */
export type MinimumDistanceFact = {
  readonly source: 'ap242';
  readonly assurance: 'exact-brep';
  readonly unit: 'mm';
  readonly coordinateSystem: 'z-up';
  readonly subjectHash: string;
  readonly algorithmProfile: 'geospec-minimum-distance-v1';
  readonly occurrences: readonly [string, string];
  readonly distance: number;
  readonly points: readonly [readonly [number, number, number], readonly [number, number, number]];
};

/** Geometry refusal and infrastructure interruption never masquerade as facts. @public */
export type MinimumDistanceResult =
  | { readonly status: 'complete'; readonly fact: MinimumDistanceFact }
  | {
      readonly status: 'refused';
      readonly code: 'unsupported-evidence' | 'invalid-selection' | 'work-limit';
      readonly message: string;
    }
  | {
      readonly status: 'interrupted';
      readonly code: 'cancelled' | 'executor-exited' | 'deadline' | 'engine-error';
      readonly message: string;
    };

/**
 * One positive-only ancillary query. analyzeMesh/analyzeBrep use null payloads;
 * inspectGeometry accepts selectors/evidence and analyzeMeshOverlap accepts
 * pairs/tolerance as in the existing inspection and mesh APIs. queryPmi accepts
 * optional maxRecords/maxOutputBytes limits and reports inventory, not compliance.
 * Ordinary RegExp
 * selectors are serialized by the shared protocol serializer.
 *
 * An explicit claimId leaves the automatic sequence unchanged. Queries return
 * full reports, including failed/refused reports, without assertion errors.
 * @public
 */
export type GeoSpecQueryOptions = {
  readonly capability: GeoSpecQueryCapability;
  readonly claimId?: string;
  readonly payload?: unknown;
  readonly subject: GeoSpecNativeSubject;
};

/** Flat construction options for a runner-independent native assertion client. @public */
export type GeoSpecAssertionClientOptions = {
  readonly claimId?: (matcher: GeoSpecNativeMatcherName, sequence: number) => string;
  readonly engine: GeoSpecNativeEngine;
  /** Success-evidence profile of every claim and query; omitted means `complete`. */
  readonly evidenceProfile?: GeoSpecNativeEvidenceProfile;
  readonly subjectSlot?: string;
  readonly workUnitLimit?: number;
};

const minimumDistanceFact = (
  value: JSONValue | undefined,
  query: MinimumDistanceQuery,
): MinimumDistanceFact | undefined => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const { fact } = value;
  if (fact === null || typeof fact !== 'object' || Array.isArray(fact)) {
    return undefined;
  }
  const { distance, points, occurrences, subjectHash } = fact;
  const finitePoint = (point: JSONValue): point is [number, number, number] =>
    Array.isArray(point) &&
    point.length === 3 &&
    point.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));
  if (
    value['profile'] !== 'geospec-minimum-distance-v1' ||
    fact['source'] !== 'ap242' ||
    fact['assurance'] !== 'exact-brep' ||
    fact['unit'] !== 'mm' ||
    fact['coordinateSystem'] !== 'z-up' ||
    fact['algorithmProfile'] !== 'geospec-minimum-distance-v1' ||
    typeof subjectHash !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(subjectHash) ||
    subjectHash !== (query.subject.subjectHash ?? query.subject.contentHash) ||
    typeof distance !== 'number' ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Array.isArray(occurrences) ||
    occurrences.length !== 2 ||
    occurrences[0] !== query.payload.pair[0].occurrencePath ||
    occurrences[1] !== query.payload.pair[1].occurrencePath ||
    !Array.isArray(points) ||
    points.length !== 2 ||
    !finitePoint(points[0]!) ||
    !finitePoint(points[1]!)
  ) {
    return undefined;
  }
  return {
    source: 'ap242',
    assurance: 'exact-brep',
    unit: 'mm',
    coordinateSystem: 'z-up',
    subjectHash,
    algorithmProfile: 'geospec-minimum-distance-v1',
    occurrences: [occurrences[0], occurrences[1]],
    distance,
    points: [points[0], points[1]],
  };
};

const minimumDistanceOutcome = (
  report: GeoSpecCanonicalClaimReport,
  query: MinimumDistanceQuery,
): MinimumDistanceResult => {
  if (report.status === 'passed') {
    const fact = minimumDistanceFact(report.evidence, query);
    return fact === undefined
      ? { status: 'interrupted', code: 'engine-error', message: 'Native minimum returned malformed evidence.' }
      : { status: 'complete', fact };
  }
  const diagnostic = report.diagnostics.find(
    (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
  );
  const code =
    diagnostic !== null && typeof diagnostic === 'object' && !Array.isArray(diagnostic)
      ? diagnostic['code']
      : undefined;
  const message =
    diagnostic !== null &&
    typeof diagnostic === 'object' &&
    !Array.isArray(diagnostic) &&
    typeof diagnostic['message'] === 'string'
      ? diagnostic['message']
      : 'Native minimum is unavailable.';
  if (code === 'GEOSPEC_INVALID_SELECTION') {
    return { status: 'refused', code: 'invalid-selection', message };
  }
  if (code === 'MATCHER_TIMEOUT') {
    return { status: 'refused', code: 'work-limit', message };
  }
  if (code === 'GEOSPEC_UNSUPPORTED_EVIDENCE' || code === 'GEOSPEC_EVIDENCE_UNSUPPORTED') {
    return { status: 'refused', code: 'unsupported-evidence', message };
  }
  return { status: 'interrupted', code: 'engine-error', message };
};

/** A non-passed core assertion report surfaced by standalone `expectGeo`. @public */
export class GeoSpecAssertionError extends Error {
  public readonly canonicalClaim: Uint8Array<ArrayBuffer>;
  public readonly canonicalPlan: Uint8Array<ArrayBuffer>;
  public readonly canonicalResult: Uint8Array<ArrayBuffer>;
  public readonly claim: Readonly<Record<string, JSONValue>>;
  public readonly diagnostics: readonly JSONValue[];
  public readonly report: GeoSpecCanonicalClaimReport;
  public readonly result: Readonly<Record<string, JSONValue>>;

  public constructor(report: GeoSpecCanonicalClaimReport) {
    const messages = report.diagnostics.flatMap((diagnostic) => {
      if (diagnostic === null || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) {
        return [];
      }
      const { message } = diagnostic;
      return typeof message === 'string' ? [message] : [];
    });
    super(messages.join('\n') || `GeoSpec assertion '${report.claimId}' ended with status '${report.status}'.`);
    this.name = 'GeoSpecAssertionError';
    this.report = report;
    this.diagnostics = report.diagnostics;
    this.claim = report.claim;
    this.result = report.result;
    this.canonicalClaim = report.canonicalClaim;
    this.canonicalPlan = report.canonicalPlan;
    this.canonicalResult = report.canonicalResult;
  }
}

/**
 * Create the one registry-derived matcher surface used by every JavaScript host.
 *
 * @param options - Subject, polarity and host invocation function.
 * @returns All 24 matcher methods in registry order.
 * @public
 */
export const createGeoSpecMatcherMethods = <Result>(options: {
  readonly invoke: (invocation: GeoSpecAuthoringInvocation) => Result;
  readonly polarity: GeoSpecClaimPolarity;
  readonly subject: unknown;
}): GeoSpecMatcherMethods<Result> => {
  const methods: Partial<Record<GeoSpecMatcherName, unknown>> = {};
  for (const matcher of Object.keys(geoSpecMatcherDescriptors) as GeoSpecMatcherName[]) {
    const descriptor = geoSpecMatcherDescriptors[matcher];
    methods[matcher] = (...arguments_: readonly unknown[]): Result =>
      options.invoke({
        arguments: arguments_,
        expected: normalizeGeoSpecExpected(descriptor.expected, arguments_),
        kind: descriptor.kind,
        matcher,
        polarity: options.polarity,
        subject: options.subject,
      });
  }
  return methods as GeoSpecMatcherMethods<Result>;
};

/**
 * Create the native matcher surface from the legacy methods plus its
 * fixed-contract extensions.
 *
 * @param options - Subject, polarity and native invocation function.
 * @returns All native matcher methods in registry order.
 * @public
 */
export const createGeoSpecNativeMatcherMethods = <Result>(options: {
  readonly invoke: (invocation: GeoSpecNativeAuthoringInvocation) => Result;
  readonly polarity: GeoSpecClaimPolarity;
  readonly subject: unknown;
}): GeoSpecNativeMatcherMethods<Result> => {
  const methods = createGeoSpecMatcherMethods<Result>({
    ...options,
    invoke: (invocation) => options.invoke(invocation),
  });
  const fixedMethods: Partial<Record<GeoSpecFixedNativeMatcherName, () => Result>> = {};
  const fixedMatchers = (Object.keys(geoSpecNativeMatcherDescriptors) as GeoSpecNativeMatcherName[]).filter(
    (matcher): matcher is GeoSpecFixedNativeMatcherName => !(matcher in geoSpecMatcherDescriptors),
  );
  for (const matcher of fixedMatchers) {
    const descriptor = geoSpecNativeMatcherDescriptors[matcher];
    fixedMethods[matcher] = (...arguments_: readonly unknown[]): Result => {
      if (arguments_.length > 0) {
        throw new TypeError(`GeoSpec matcher ${matcher} does not accept arguments.`);
      }
      return options.invoke({
        arguments: [],
        expected: normalizeGeoSpecExpected(descriptor.expected, arguments_) as true,
        matcher,
        polarity: options.polarity,
        subject: options.subject,
      });
    };
  }
  return Object.assign(methods, fixedMethods) as GeoSpecNativeMatcherMethods<Result>;
};

/**
 * Create a standalone native GeoSpec assertion client.
 *
 * @param options - Engine, deterministic work limit and optional logical-ID controls.
 * @returns An `expectGeo`-style assertion client independent of any test runner.
 * @public
 */
export const createGeoSpecAssertionClient = (options: GeoSpecAssertionClientOptions): GeoSpecAssertionClient => {
  let sequence = 0;
  const subjectSlot = options.subjectSlot ?? 'subject';
  let workUnitLimit: number | undefined;
  const resolveWorkUnitLimit = (): number => {
    workUnitLimit ??= resolveGeoSpecNativeWorkUnitLimit(options.engine, options.workUnitLimit);
    return workUnitLimit;
  };
  const methods = (subject: GeoSpecNativeSubject, polarity: GeoSpecClaimPolarity) =>
    createGeoSpecNativeMatcherMethods<Promise<GeoSpecCanonicalClaimReport>>({
      subject,
      polarity,
      invoke: async (invocation) => {
        sequence += 1;
        const claimId = options.claimId?.(invocation.matcher, sequence) ?? `geospec-claim-${sequence}`;
        const context = {
          claimId,
          engine: options.engine,
          ...(options.evidenceProfile === undefined ? {} : { evidenceProfile: options.evidenceProfile }),
          polarity,
          subject,
          subjectSlot,
          workUnitLimit: resolveWorkUnitLimit(),
        };
        const report = evaluateGeoSpecNativeClaim(
          'kind' in invocation
            ? {
                ...context,
                arguments: invocation.arguments,
                capability: invocation.matcher,
                kind: invocation.kind,
              }
            : { ...context, arguments: invocation.arguments, capability: invocation.matcher },
        );
        if (report.status !== 'passed') {
          throw new GeoSpecAssertionError(report);
        }
        return report;
      },
    });

  async function query(query: MinimumDistanceQuery): Promise<MinimumDistanceResult>;
  async function query(query: GeoSpecQueryOptions): Promise<GeoSpecCanonicalClaimReport>;
  async function query(
    query: MinimumDistanceQuery | GeoSpecQueryOptions,
  ): Promise<MinimumDistanceResult | GeoSpecCanonicalClaimReport> {
    const claimId =
      'claimId' in query ? (query.claimId ?? `geospec-claim-${++sequence}`) : `geospec-claim-${++sequence}`;
    if (query.capability === 'minimumDistance') {
      const pair: unknown = (query as { payload?: { pair?: unknown } }).payload?.pair;
      const path = (item: unknown): string | undefined => {
        if (item === null || typeof item !== 'object' || !('occurrencePath' in item)) {
          return undefined;
        }
        return typeof item.occurrencePath === 'string' && item.occurrencePath.length > 0
          ? item.occurrencePath
          : undefined;
      };
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        path(pair[0]) === undefined ||
        path(pair[1]) === undefined ||
        path(pair[0]) === path(pair[1])
      ) {
        return {
          status: 'refused',
          code: 'invalid-selection',
          message: 'Select two distinct resolved AP242 occurrence paths.',
        };
      }
      try {
        if (!supportsGeoSpecNativeMinimumDistance(options.engine)) {
          return {
            status: 'refused',
            code: 'unsupported-evidence',
            message: 'This native engine does not advertise the complete minimum-distance profile.',
          };
        }
      } catch {
        return {
          status: 'refused',
          code: 'unsupported-evidence',
          message: 'This native engine cannot negotiate the complete minimum-distance profile.',
        };
      }
    }
    try {
      const report = evaluateGeoSpecNativeQuery({
        capability: query.capability,
        claimId,
        engine: options.engine,
        ...(options.evidenceProfile === undefined ? {} : { evidenceProfile: options.evidenceProfile }),
        payload: query.payload,
        subject: query.subject,
        subjectSlot,
        workUnitLimit: resolveWorkUnitLimit(),
      });
      return query.capability === 'minimumDistance' ? minimumDistanceOutcome(report, query) : report;
    } catch (error) {
      if (query.capability !== 'minimumDistance') {
        throw error;
      }
      return {
        status: 'interrupted',
        code: 'engine-error',
        message: error instanceof Error ? error.message : 'Native minimum query failed.',
      };
    }
  }

  return {
    query,
    expectGeo(subject) {
      const positive = methods(subject, 'positive');
      return Object.assign(positive, { not: methods(subject, 'negative') });
    },
  };
};
