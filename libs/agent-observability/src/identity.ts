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
