import type { Evidence } from '@taucad/agent-observability/contract';
import {
  canonicalEvidence,
  contractId,
  evidenceDigest,
  evidenceKeys,
  sha256Hex,
} from '@taucad/agent-observability/identity';
import type { ObservedSettlement } from '@taucad/api-billing';
import type { SourceProtection } from '#evidence-admission.js';
import { evidenceRetentionMilliseconds } from '#evidence-admission.js';
import type { AttemptAuthority } from '#model-invocation-evidence.js';
import { apiVersions, executionOfAttempt } from '#model-invocation-evidence.js';

/**
 * Bumped whenever the facts written for the same settlement change. v3 names the settled call as the semantic id, so
 * delivery joins a settlement and its generation by key (LW4).
 */
export const apiSettlementMapper = 'api-settlement-v3';

type FinancialFact = Extract<Evidence['payload'], { plane: 'summary' }>['fact'] & { kind: 'financial' };

/** One credit atom is one micro-USD; supplier cost is in pico-USD. */
const atomsPerUsd = 1_000_000;
const picoPerUsd = 1_000_000_000_000;

/**
 * The credits a settlement fact reports for what the ledger charged.
 *
 * @param atoms - Charged credit atoms.
 * @returns Credits, in USD.
 */
export const creditsOfAtoms = (atoms: bigint): number => Number(atoms) / atomsPerUsd;

/**
 * The API-reported financial fact of one settled funded operation (blueprint
 * T07). It carries what the ledger charged and what the supplier is estimated
 * to have cost, never request or output text, and joins the provider attempt
 * through the same call and operation ids. The ledger stays the financial
 * truth: an unpriced supplier cost stays null, never zero, and this fact is a
 * copy for analysis, not a record anything settles against.
 *
 * @param settlement - What the ledger terminalized.
 * @param principal - The Tau user the funded account belongs to.
 * @param authority - The policy epoch and protection the fact is admitted under.
 * @returns Evidence ready for admission.
 */
export const settlementEvidence = async (
  settlement: ObservedSettlement,
  principal: string,
  authority: AttemptAuthority & Readonly<{ project: string }>,
): Promise<Evidence> => {
  const { operation, receipt } = settlement;
  const [invocation, execution, chat, ledger, attempt, tariff, normalization] = await Promise.all([
    contractId('inv', operation.attemptKey),
    executionOfAttempt(operation.attemptKey),
    operation.chatHint === null ? undefined : contractId('chat', operation.chatHint),
    contractId('ledger', `${operation.id}:${receipt.terminalRevision}`),
    contractId('op', operation.id),
    contractId('tariff', operation.activationId),
    contractId('norm', settlement.normalization ?? 'none'),
  ]);
  const run = chat ?? invocation;
  const fact: FinancialFact = {
    kind: 'financial',
    ledger,
    attempt,
    credits: creditsOfAtoms(receipt.chargedAtoms),
    tariff,
    supplierCost: receipt.supplierCostPicoUsd === null ? null : Number(receipt.supplierCostPicoUsd) / picoPerUsd,
    currency: 'USD',
    normalization,
    // A terminal settlement; later ledger corrections are separate adjustment facts.
    adjustment: false,
  };
  const sourceDigest = await sha256Hex(canonicalEvidence(['api-settlement', principal, ledger, fact]));
  const originalAt = (operation.admittedAt ?? receipt.resolvedAt).getTime();
  const expiresAt = originalAt + evidenceRetentionMilliseconds;
  const evidence: Evidence = {
    version: 1,
    source: { kind: 'invocation', invocation: ledger, digest: sourceDigest },
    /* The call it settled, as the provider attempt names it, so the two facts find each other (LW4). */
    semantic: { kind: 'financial', id: invocation },
    projection: { version: apiSettlementMapper, redactor: 'summary-only', digest: '0'.repeat(64) },
    delivery: { uploader: 'api', attempt: 'api-1', cursor: { view: 'own', origin: 'api', position: ledger } },
    scope: { principal, project: authority.project, policyEpoch: authority.policyEpoch, destination: 'langfuse' },
    run,
    execution: { attempt: execution, resumedFrom: null, branchedFrom: null },
    versions: apiVersions(apiSettlementMapper),
    task: null,
    clocks: { occurredAt: receipt.resolvedAt.getTime(), sourceOrder: ledger, intervals: [] },
    authority: 'api-reported',
    retention: { originalAt, expiresAt, proof: 'api-retention-v1' },
    lineage: [
      {
        source: ledger,
        digest: sourceDigest,
        protection: authority.protection satisfies SourceProtection,
        rights: 'unknown',
        expiresAt,
        proof: null,
      },
    ],
    coverage: {
      events: 'complete',
      input: 'omitted',
      output: 'omitted',
      usage: 'unsupported',
      artifacts: 'unsupported',
      permission: 'complete',
    },
    payload: { plane: 'summary', fact },
  };
  return { ...evidence, projection: { ...evidence.projection, digest: await evidenceDigest(evidence) } };
};

/**
 * The semantic key of the generation a settlement settled: the provider attempt of the same call in the same project.
 *
 * @param settlement - A settlement's evidence.
 * @returns The key its generation's receipts are admitted under.
 */
export const settledGenerationKey = (settlement: Evidence): string =>
  canonicalEvidence([settlement.scope.project, 'provider', settlement.semantic.id]);

/**
 * The semantic key of the settlement a generation's call would have: the financial fact of the same call.
 *
 * @param generation - A provider attempt's evidence.
 * @returns The key its settlement's receipt is admitted under.
 */
export const generationSettlementKey = (generation: Evidence): string =>
  canonicalEvidence([generation.scope.project, 'financial', generation.semantic.id]);

/**
 * Whether a settlement settled this generation: the same account and call by key, and the same funded operation, which
 * the provider fact names as `billing` and the settlement as `attempt` (rule 8).
 *
 * @param settlement - A settlement's evidence.
 * @param generation - A provider attempt's evidence.
 * @returns True when the settlement's values belong on the generation.
 */
export const settles = (settlement: Evidence, generation: Evidence): boolean => {
  const settled = settlement.payload.fact;
  const call = generation.payload.fact;
  return (
    settled.kind === 'financial' &&
    call.kind === 'provider' &&
    call.billing !== null &&
    call.billing === settled.attempt &&
    settlement.scope.principal === generation.scope.principal &&
    settledGenerationKey(settlement) === evidenceKeys(generation).semantic
  );
};
