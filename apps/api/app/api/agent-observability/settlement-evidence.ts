import type { Evidence } from '@taucad/agent-observability/contract';
import { canonicalEvidence, contractId, evidenceDigest, sha256Hex } from '@taucad/agent-observability/identity';
import type { creditOperation } from '#database/schema.js';
import type { TerminalReceipt } from '#api/billing/credit-ledger.types.js';
import type { SourceProtection } from '#api/agent-observability/evidence-admission.js';
import { evidenceRetentionMilliseconds } from '#api/agent-observability/evidence-admission.js';
import type { AttemptAuthority } from '#api/agent-observability/model-invocation-evidence.js';

/** Bumped whenever the facts written for the same settlement change. */
export const apiSettlementMapper = 'api-settlement-v1';

type FinancialFact = Extract<Evidence['payload'], { plane: 'summary' }>['fact'] & { kind: 'financial' };

/** One funded operation the ledger has just terminalized, live or by recovery. */
export type ObservedSettlement = Readonly<{
  operation: Pick<
    typeof creditOperation.$inferSelect,
    'id' | 'accountId' | 'environment' | 'attemptKey' | 'projectHint' | 'chatHint' | 'admittedAt' | 'activationId'
  >;
  receipt: Pick<TerminalReceipt, 'terminalRevision' | 'chargedAtoms' | 'supplierCostPicoUsd' | 'resolvedAt'>;
  /** The terminal evidence's normalization version, when it carries one. */
  normalization: string | undefined;
}>;

/** One credit atom is one micro-USD; supplier cost is in pico-USD. */
const atomsPerUsd = 1_000_000;
const picoPerUsd = 1_000_000_000_000;

/**
 * The API-reported financial fact of one settled funded operation (blueprint
 * T07). It carries what the ledger charged and what the supplier is estimated
 * to have cost, never request or output text, and joins the provider attempt
 * through the same run and operation ids. The ledger stays the financial
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
  const [invocation, chat, ledger, attempt, tariff, normalization] = await Promise.all([
    contractId('inv', operation.attemptKey),
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
    credits: Number(receipt.chargedAtoms) / atomsPerUsd,
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
    semantic: { kind: 'financial', id: ledger },
    projection: { version: apiSettlementMapper, redactor: 'summary-only', digest: '0'.repeat(64) },
    delivery: { uploader: 'api', attempt: 'api-1', cursor: { view: 'own', origin: 'api', position: ledger } },
    scope: { principal, project: authority.project, policyEpoch: authority.policyEpoch, destination: 'langfuse' },
    run,
    execution: { attempt: invocation, resumedFrom: null, branchedFrom: null },
    versions: {
      hostBuild: null,
      apiBuild: null,
      harness: null,
      compaction: null,
      prompts: [],
      skills: [],
      tools: [],
      kernels: [],
      mapper: apiSettlementMapper,
      policy: 'purposes-v1',
    },
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
