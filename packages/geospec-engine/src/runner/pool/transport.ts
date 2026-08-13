/**
 * What is allowed to cross a worker boundary.
 *
 * Two rules, both of them from the register's pool row, and both of them
 * enforced here rather than trusted to callers:
 *
 * 1. **Live subjects never cross.** `GeoSpecAssertion.subject` is the value the
 *    spec author handed `expectGeo(...)` — a loaded `GeometrySubject` holding
 *    an Emscripten handle and megabytes of typed arrays. Posting one would
 *    either throw (a handle is not structured-cloneable) or, worse, deep-copy
 *    an entire assembly per assertion. The content-addressed evidence cache is
 *    the channel between workers; the wire carries the subject's *identity*.
 * 2. **Code strings are elided.** A bundle's `code` and `sourceMap` are the
 *    whole compiled spec module, posted once per shard for nothing: the host
 *    reports diagnostics, never source.
 *
 * Both are lossy on purpose, and neither touches a verdict: `status`,
 * `diagnostics`, `passed`, `expected` — everything a reporter or a reward
 * function reads — is carried verbatim, so a sharded result is comparable to a
 * serial one outside durations.
 *
 * @module
 */

import type { GeoSpecAssertion, GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';

/**
 * How a subject appears on the wire: what it was, not what it holds.
 *
 * @public
 */
export type SanitizedSubject = {
  kind: 'geometry-subject-ref';
  /** The subject's content hash — the evidence cache's own address for it. */
  contentHash?: string;
  /** Declared source format, when the subject recorded one. */
  format?: string;
};

const subjectReference = (subject: unknown): unknown => {
  const value = subject as
    | { kind?: unknown; provenance?: { contentHash?: unknown; source?: { format?: unknown } } }
    | undefined;
  if (value?.kind !== 'geometry-subject') {
    // Not a subject: a spec author may assert on anything, and a matcher's
    // refusal diagnostic quotes it. Plain values cross as themselves.
    return subject;
  }
  const contentHash = value.provenance?.contentHash;
  const format = value.provenance?.source?.format;
  return {
    kind: 'geometry-subject-ref',
    ...(typeof contentHash === 'string' ? { contentHash } : {}),
    ...(typeof format === 'string' ? { format } : {}),
  } satisfies SanitizedSubject;
};

const sanitizeAssertion = (assertion: GeoSpecAssertion): GeoSpecAssertion => ({
  ...assertion,
  subject: subjectReference(assertion.subject),
});

const sanitizeTest = (test: GeoSpecTestCase): GeoSpecTestCase => ({
  ...test,
  assertions: test.assertions.map((assertion) => sanitizeAssertion(assertion)),
});

/**
 * Make one module result safe to post to the pool host.
 *
 * @param result - The worker's module result.
 * @returns A structured-clone-safe result with subjects and code elided.
 * @public
 */
export const sanitizePoolResult = (result: GeoSpecRunResult): GeoSpecRunResult => {
  const elide = <Bundle extends { code: string; sourceMap?: string }>(bundle: Bundle): Bundle => ({
    ...bundle,
    code: '',
    ...(bundle.sourceMap === undefined ? {} : { sourceMap: '' }),
  });
  if (result.success) {
    return { ...result, tests: result.tests.map((test) => sanitizeTest(test)), bundle: elide(result.bundle) };
  }
  return { ...result, ...(result.bundle === undefined ? {} : { bundle: elide(result.bundle) }) };
};
