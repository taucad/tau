/** Runner-independent GeoSpec assertions over the native byte protocol. @module */

import type { JSONValue } from '@taucad/runtime/types';
import {
  assertGeoSpecAuthoredWorkUnitLimit,
  resolveGeoSpecMaximumWorkUnitLimit,
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
import { geoSpecMatcherDescriptors, normalizeGeoSpecExpected } from '#engine/matchers.js';
import type { GeoSpecMatcherName } from '#engine/matchers.js';
import type { GeoSpecAssertion, GeoSpecExpectOptions, GeoSpecMatcher } from '#runner/types.js';
import { resolveGeoSpecSubject } from '#model/subject.js';
import type { GeoSpecSubject } from '#model/subject.js';

/** One authored call shared by the collector and native assertion client. @public */
export type GeoSpecAuthoringInvocation = {
  readonly arguments: readonly unknown[];
  readonly expected: unknown;
  readonly kind: GeoSpecAssertion['kind'];
  readonly matcher: GeoSpecMatcherName;
  readonly polarity: GeoSpecClaimPolarity;
  readonly subject: unknown;
};

/** Matcher methods derived mechanically from the existing GeoSpec registry. @public */
export type GeoSpecMatcherMethods<Result> = {
  [Name in GeoSpecMatcherName]: (...arguments_: Parameters<GeoSpecMatcher[Name]>) => Result;
};

/** Standalone native matcher chain, including core-owned negation. @public */
export type GeoSpecAssertionMatchers = GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport> & {
  readonly not: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>;
};

/** Runner-independent native assertion client. @public */
export type GeoSpecAssertionClient = {
  /**
   * Start a chain; `options.workUnitLimit` overrides the client budget for its claims.
   * Without one, a loaded subject's `loadModel` budget applies, then the client's.
   */
  expectGeo(subject: GeoSpecNativeSubject | GeoSpecSubject, options?: GeoSpecExpectOptions): GeoSpecAssertionMatchers;
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
  readonly claimId?: (matcher: GeoSpecMatcherName, sequence: number) => string;
  readonly engine: GeoSpecNativeEngine;
  /** Success-evidence profile of every claim and query; omitted means `complete`. */
  readonly evidenceProfile?: GeoSpecNativeEvidenceProfile;
  readonly subjectSlot?: string;
  readonly workUnitLimit?: number;
  /**
   * The largest `workUnitLimit` a spec may author in `loadModel` or `expectGeo` options. Host
   * policy: omitted uses `geoSpecMaximumWorkUnitLimit`, and a host provisioned for larger claims
   * raises it. Must be a positive safe integer.
   */
  readonly maximumWorkUnitLimit?: number;
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

const centerOfMassAxes = ['x', 'y', 'z'] as const;

/**
 * Reject a center-of-mass point the engine cannot read before it becomes a claim.
 *
 * The engine evaluates an exact point within `tolerance`; it has no per-axis range form for center of
 * mass, so `{ y: { greaterThan: 1 } }` would otherwise reach it and fail as a bare coordinate error.
 *
 * @param expected - The authored `toHaveCenterOfMass` expectation.
 * @throws TypeError naming the matcher, the axis and the supported form.
 */
const assertCenterOfMassPoint = (expected: unknown): void => {
  if (expected === null || typeof expected !== 'object' || !('point' in expected)) {
    return;
  }
  const { point } = expected;
  const entries: ReadonlyArray<readonly [string, unknown]> = Array.isArray(point)
    ? point.map((value: unknown, index) => [centerOfMassAxes[index] ?? String(index), value] as const)
    : point !== null && typeof point === 'object'
      ? Object.entries(point)
      : [];
  if (entries.length === 0 && !(point !== null && typeof point === 'object')) {
    throw new TypeError(
      'GeoSpec matcher toHaveCenterOfMass needs point as [x, y, z] or { x, y, z } in millimetres, with an optional tolerance.',
    );
  }
  for (const [axis, value] of entries) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      continue;
    }
    const range = value !== null && typeof value === 'object' && !Array.isArray(value);
    throw new TypeError(
      range
        ? `GeoSpec matcher toHaveCenterOfMass point.${axis} must be a finite number in millimetres: per-axis ranges such as { greaterThan } are not supported for center of mass. Assert the expected point with a tolerance instead.`
        : `GeoSpec matcher toHaveCenterOfMass point.${axis} must be a finite number in millimetres.`,
    );
  }
};

/**
 * Create the one registry-derived matcher surface used by every JavaScript host.
 *
 * @param options - Subject, polarity and host invocation function.
 * @returns All 26 matcher methods in registry order.
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
    methods[matcher] = (...arguments_: readonly unknown[]): Result => {
      if (descriptor.expected === 'true' && arguments_.length > 0) {
        throw new TypeError(`GeoSpec matcher ${matcher} does not accept arguments.`);
      }
      if (matcher === 'toHaveCenterOfMass') {
        assertCenterOfMassPoint(arguments_[0]);
      }
      return options.invoke({
        arguments: arguments_,
        expected: normalizeGeoSpecExpected(descriptor.expected, arguments_),
        kind: descriptor.kind,
        matcher,
        polarity: options.polarity,
        subject: options.subject,
      });
    };
  }
  return methods as GeoSpecMatcherMethods<Result>;
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
  let maximumWorkUnitLimit: number | undefined;
  // Resolved on first use, like the default budget, so a client never constructed for claims never validates.
  const resolveMaximumWorkUnitLimit = (): number => {
    maximumWorkUnitLimit ??= resolveGeoSpecMaximumWorkUnitLimit(options.maximumWorkUnitLimit);
    return maximumWorkUnitLimit;
  };
  let workUnitLimit: number | undefined;
  const resolveWorkUnitLimit = (): number => {
    workUnitLimit ??= resolveGeoSpecNativeWorkUnitLimit(options.engine, options.workUnitLimit);
    return workUnitLimit;
  };
  const methods = (
    subject: GeoSpecNativeSubject,
    polarity: GeoSpecClaimPolarity,
    chain: { readonly validate: () => void; readonly workUnitLimit: number | undefined },
  ) =>
    createGeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>({
      subject,
      polarity,
      invoke: (invocation) => {
        chain.validate();
        sequence += 1;
        const claimId = options.claimId?.(invocation.matcher, sequence) ?? `geospec-claim-${sequence}`;
        const context = {
          claimId,
          engine: options.engine,
          ...(options.evidenceProfile === undefined ? {} : { evidenceProfile: options.evidenceProfile }),
          polarity,
          subject,
          subjectSlot,
          workUnitLimit: chain.workUnitLimit ?? resolveWorkUnitLimit(),
          maximumWorkUnitLimit: resolveMaximumWorkUnitLimit(),
        };
        const report = evaluateGeoSpecNativeClaim({
          ...context,
          arguments: invocation.arguments,
          capability: invocation.matcher,
          kind: invocation.kind,
        });
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
    expectGeo(subject, expectOptions) {
      assertGeoSpecAuthoredWorkUnitLimit(
        expectOptions?.workUnitLimit,
        'expectGeo workUnitLimit',
        resolveMaximumWorkUnitLimit(),
      );
      const raw = 'subjectHash' in subject || 'contentHash' in subject;
      const admission = raw ? undefined : resolveGeoSpecSubject(subject, options.engine);
      const identity = raw ? subject : admission!.identity;
      const chain = {
        validate: (): void => {
          if (!raw) {
            resolveGeoSpecSubject(subject, options.engine);
          }
        },
        workUnitLimit: expectOptions?.workUnitLimit ?? admission?.load?.workUnitLimit,
      };
      const positive = methods(identity, 'positive', chain);
      return Object.assign(positive, { not: methods(identity, 'negative', chain) });
    },
  };
};
