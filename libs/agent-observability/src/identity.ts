import type { Evidence } from '#contract.js';

/** Deterministic JSON for the bounded, JSON-only evidence schema. @public */
export const canonicalEvidence = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalEvidence(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalEvidence(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);

  return encoded;
};
/** Stable source and semantic keys exclude uploader, cursor, projection and digest. @public */
export const evidenceKeys = (
  evidence: Evidence,
): Readonly<{ source: string; semantic: string; projection: string }> => {
  const fact = evidence.source;
  const source = canonicalEvidence([
    evidence.scope.project,
    fact.kind === 'row'
      ? [fact.kind, fact.chat, fact.leaderEpoch, fact.sequence]
      : fact.kind === 'invocation'
        ? [fact.kind, fact.invocation]
        : [fact.kind, fact.interaction],
  ]);
  return {
    source,
    semantic: canonicalEvidence([evidence.scope.project, evidence.semantic.kind, evidence.semantic.id]),
    projection: canonicalEvidence([
      source,
      evidence.projection.version,
      evidence.projection.redactor,
      evidence.payload.plane,
    ]),
  };
};
/** Digest immutable semantic content, excluding delivery, grant refresh and observation timestamps. @public */
export const evidenceDigest = async (evidence: Evidence): Promise<string> => {
  const bytes = new TextEncoder().encode(
    canonicalEvidence({
      principal: evidence.scope.principal,
      project: evidence.scope.project,
      source: evidence.source,
      semantic: evidence.semantic,
      run: evidence.run,
      execution: evidence.execution,
      versions: evidence.versions,
      task: evidence.task,
      clocks: evidence.clocks,
      retention: evidence.retention,
      lineage: evidence.lineage,
      coverage: evidence.coverage,
      payload: evidence.payload,
    }),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
/** Compare immutable identities without treating changed bytes as another fact. @public */
export const compareEvidence = (
  left: Evidence,
  right: Evidence,
): 'distinct' | 'duplicate' | 'projection' | 'conflict' => {
  const a = evidenceKeys(left);
  const b = evidenceKeys(right);
  if (a.source !== b.source) {
    return 'distinct';
  }
  if (left.source.digest !== right.source.digest || a.semantic !== b.semantic) {
    return 'conflict';
  }
  if (a.projection !== b.projection) {
    return 'projection';
  }
  return left.projection.digest === right.projection.digest ? 'duplicate' : 'conflict';
};

/** Verify claimed projection bytes before deduplication; callers still require current authority. @public */
export const verifyEvidenceDigest = async (evidence: Evidence): Promise<boolean> =>
  evidence.projection.digest === (await evidenceDigest(evidence));

const contractIdPattern = /^[\w:.-]{1,128}$/u;

/** Hex SHA-256 of UTF-8 text, the same in browsers and Node. @public */
export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * An id the contract accepts: the value itself when it already is one, else
 * `<prefix>-` and 48 hex digits of its digest. Host and API producers derive
 * shared ids (a chat's run, an attempt) this one way, so their facts join.
 *
 * @public
 */
export const contractId = async (prefix: string, value: string): Promise<string> => {
  if (contractIdPattern.test(value)) {
    return value;
  }
  const digest = await sha256Hex(value);
  return `${prefix}-${digest.slice(0, 48)}`;
};
