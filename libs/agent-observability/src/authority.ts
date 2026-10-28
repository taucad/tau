import { evidenceKeys } from '#identity.js';
import type { Evidence } from '#contract.js';

/** Values resolved by the authenticated server, never constructed from the evidence's claims. @public */
export type EvidenceAuthority = Readonly<{
  principal: string;
  project: string;
  policyEpoch: string;
  destination: 'langfuse';
  purposes: Readonly<{
    summary: boolean;
    content: boolean;
    diagnosis: boolean;
    evaluation: boolean;
    training: boolean;
  }>;
  producer: Evidence['authority'];
  sourceFacts: ReadonlyMap<string, Readonly<{ digest: string; lineage: readonly string[]; retentionProof: string }>>;
  diagnosisSources: ReadonlySet<string>;
  projectRights: 'verified' | 'denied' | 'unknown';
  sourceProofs: ReadonlyMap<
    string,
    Readonly<{
      digest: string;
      protection: 'pro' | 'free' | 'unknown';
      rights: 'verified' | 'denied' | 'unknown';
      expiresAt: number;
      proof: string;
    }>
  >;
  retentionProofs: ReadonlyMap<string, Readonly<{ originalAt: number; expiresAt: number }>>;
  now: number;
}>;
/** Purpose-specific admission; a valid wire document is not authorization. @public */
export type EvidenceAdmission =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: 'SCOPE' | 'PURPOSE' | 'RIGHTS' | 'PROVENANCE' | 'EXPIRED' | 'PROTECTED' };
/** Check current authority and original source protection at each send/reuse boundary. @public */
export const authorizeEvidence = ({
  evidence,
  authority,
  purpose,
}: {
  readonly evidence: Evidence;
  readonly authority: EvidenceAuthority;
  readonly purpose: keyof EvidenceAuthority['purposes'];
}): EvidenceAdmission => {
  if (!scopeMatches(evidence, authority)) {
    return { allowed: false, code: 'SCOPE' };
  }
  if (
    !Object.hasOwn(authority.purposes, purpose) ||
    !authority.purposes[purpose] ||
    ((purpose === 'summary' || purpose === 'content') && evidence.payload.plane !== purpose)
  ) {
    return { allowed: false, code: 'PURPOSE' };
  }
  const fact = authority.sourceFacts.get(evidenceKeys(evidence).source);
  if (
    fact?.digest !== evidence.source.digest ||
    fact.retentionProof !== evidence.retention.proof ||
    fact.lineage.length !== evidence.lineage.length ||
    !fact.lineage.every((source) => evidence.lineage.some((item) => item.source === source)) ||
    !Number.isFinite(authority.now) ||
    authority.now < evidence.retention.originalAt
  ) {
    return { allowed: false, code: 'PROVENANCE' };
  }
  if (authority.projectRights !== 'verified') {
    return { allowed: false, code: 'RIGHTS' };
  }
  const retention = authority.retentionProofs.get(evidence.retention.proof);
  if (
    !retention ||
    retention.originalAt !== evidence.retention.originalAt ||
    retention.expiresAt !== evidence.retention.expiresAt
  ) {
    return { allowed: false, code: 'PROVENANCE' };
  }
  if (authority.now >= retention.expiresAt) {
    return { allowed: false, code: 'EXPIRED' };
  }
  return authorizeLineage(evidence, authority, purpose);
};

const scopeMatches = (evidence: Evidence, authority: EvidenceAuthority): boolean =>
  evidence.scope.principal === authority.principal &&
  evidence.scope.project === authority.project &&
  evidence.scope.policyEpoch === authority.policyEpoch &&
  evidence.authority === authority.producer &&
  (evidence.semantic.kind !== 'financial' || authority.producer === 'api-reported');

const authorizeLineage = (
  evidence: Evidence,
  authority: EvidenceAuthority,
  purpose: keyof EvidenceAuthority['purposes'],
): EvidenceAdmission => {
  for (const source of evidence.lineage) {
    if (purpose === 'diagnosis' && !authority.diagnosisSources.has(source.source)) {
      return { allowed: false, code: 'PURPOSE' };
    }
    const proof = authority.sourceProofs.get(source.source);
    if (
      !proof ||
      proof.digest !== source.digest ||
      proof.proof !== source.proof ||
      proof.protection !== source.protection ||
      proof.expiresAt !== source.expiresAt ||
      proof.rights !== source.rights
    ) {
      return { allowed: false, code: 'PROVENANCE' };
    }
    if (proof.protection === 'unknown' || proof.rights !== 'verified') {
      return { allowed: false, code: 'RIGHTS' };
    }
    if (authority.now >= proof.expiresAt) {
      return { allowed: false, code: 'EXPIRED' };
    }
    if ((purpose === 'evaluation' || purpose === 'training') && proof.protection !== 'free') {
      return { allowed: false, code: 'PROTECTED' };
    }
  }
  return { allowed: true };
};
/** No rich fields or identifiers can enter this operational projection. @public */
export const operationalEvidence = (
  evidence: Evidence,
): Readonly<{
  plane: 'summary' | 'content';
  family: Evidence['semantic']['kind'];
  coverage: Evidence['coverage']['events'];
}> => ({ plane: evidence.payload.plane, family: evidence.semantic.kind, coverage: evidence.coverage.events });
/** Explicit field-class routes; no generic OTLP/client object passthrough. @public */
export const evidenceDestinations = Object.freeze({
  identity: ['langfuse'],
  content: ['langfuse'],
  lineage: ['langfuse'],
  operational: ['grafana', 'langfuse'],
  secrets: [],
} as const);
