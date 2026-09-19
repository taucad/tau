export type InputCountEvidence = {
  version: 'openai-input-count-v1';
  sourceRevision: string;
  environment: BillingEnvironment;
  credentialAccount: string;
  modelId: string;
  createRequestDigest: string;
  countRequestDigest: string;
  inputTokens: string;
  /** Liability of the count call itself: the controlled loopback stub, or the supplier's counter. */
  liability: 'controlled-local-zero' | 'openai-input-tokens-v1';
};

export type SupplierValuation = {
  version: 'supplier-valuation-v1';
  sourceRevision: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- null denotes a context-invariant schedule
  longContextMinimumInputTokens: string | null;
  baseRates: SupplierValuationRate[];
  // oxlint-disable-next-line typescript/no-restricted-types -- null denotes no long-context tariff
  longContextRates: SupplierValuationRate[] | null;
};

export type SupplierValuationRate = {
  dimension: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- untiered meters retain explicit null
  tier: string | null;
  numeratorPicoUsd: string;
  denominatorUnits: string;
};

export type JointInputMaximum = {
  version: 'joint-input-v1';
  quantity: string;
};

export type BillingEnvironment = 'development' | 'staging' | 'prod-us' | 'prod-eu';
export type CreditSource = 'promo' | 'plan' | 'purchased';
export type QualifiedCategory = 'llm' | 'zoo_engine';
export type FundedLlmCapacityPool = 'primary' | 'helper';

export type SourceAmounts = {
  promoAtoms: bigint;
  planAtoms: bigint;
  purchasedAtoms: bigint;
};

export type BudgetRequirement = {
  budgetId: string;
  maximum: bigint;
};

export type QualifiedAdmissionInput = {
  environment: BillingEnvironment;
  authUserId: string;
  surface: string;
  attemptKey: string;
  requestDigest: string;
  requestKeyVersion: number;
  category: QualifiedCategory;
  modelId: string;
  modelDisplayName?: string;
  providerId?: string;
  projectHint?: string;
  chatHint?: string;
  activity: string;
  sku: string;
  maximumQuantities: readonly MeterQuantity[];
  supplierMaximumPicoUsd: bigint;
  replica: { schemaVersion: number; meterContractIds: readonly string[] };
  executionDeadline?: Date;
  invocation?: {
    contractVersion: string;
    credentialAccount: string;
    // oxlint-disable-next-line typescript/no-restricted-types -- null explicitly denotes an undated supplier tariff
    supplierRatesValidUntil: string | null;
    supplierRates: Array<{
      dimension: string;
      // oxlint-disable-next-line typescript/no-restricted-types -- supplier tariff pins retain explicit untiered null
      tier: string | null;
      numeratorPicoUsd: string;
      denominatorUnits: string;
    }>;
    /** Milliseconds. */
    executionTimeout: number;
    supplierValuation?: SupplierValuation;
    jointInputMaximum?: JointInputMaximum;
    inputCount?: InputCountEvidence;
  };
};

export type AdmissionDenial =
  | 'account_closed'
  | 'account_restricted'
  | 'debt'
  | 'insufficient_credit'
  | 'budget_unavailable'
  | 'concurrency_unavailable'
  | 'policy_unavailable';

export type AdmissionResult =
  | {
      status: 'admitted';
      operationId: string;
      generation: bigint;
      authorized: SourceAmounts;
    }
  | {
      status: 'replay';
      operationId: string;
      generation: bigint;
      customerState: CustomerState;
    }
  | { status: 'denied'; reason: AdmissionDenial };

export type CustomerState = 'pending' | 'settled' | 'released' | 'absorbed';
export type SupplierState = 'reserved' | 'preliminary' | 'unresolved' | 'final' | 'funded_exception';
export type DispatchState = 'admitted' | 'intent_recorded' | 'accepted' | 'recovery_required';

export type NormalizedMeterItem = {
  dimension: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- normalized untiered meters use explicit null on the financial wire
  tier: string | null;
  quantity: bigint;
};

export type MeterQuantity = {
  dimension: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- normalized untiered meters use explicit null on the financial wire
  tier: string | null;
  quantity: bigint;
};

export type TerminalHistoryEvidence = {
  executionStatus?: 'succeeded' | 'cancelled' | 'failed' | 'rejected' | 'unknown';
  reasoningTokens?: bigint;
  normalizationEvidence?: {
    version: string;
    providerRequestId?: string;
    /**
     * Why the turn ended, retained on the operation and in its evidence.
     *
     * `executionStatus` alone cannot separate a client abort from an expired
     * deadline, so a terminal without a provider-reported reason carries its
     * own: `client_abort`, `deadline`, `malformed_response`,
     * `authorized_exhausted`, `recovery_expired` or `recovery_unresolvable`.
     */
    terminalReason?: string;
    fields: Record<string, string>;
  };
};

export type TerminalEvidence = TerminalHistoryEvidence &
  (
    | {
        kind: 'final_usage';
        usageOccurredAt: Date;
        meterItems: readonly NormalizedMeterItem[];
      }
    | { kind: 'provider_rejected'; usageOccurredAt?: never }
    /**
     * The stream was cut at the ceiling the authorization funds (R8).
     *
     * It is the designed outcome of an in-stream control, not a fault: the
     * operation settles at the authorized amount, clipped by the provider's own
     * usage when it reported complete usage before the cut.
     */
    | { kind: 'authorized_exhausted'; usageOccurredAt?: Date; meterItems?: readonly NormalizedMeterItem[] }
    | { kind: 'absorbed_unknown'; usageOccurredAt?: Date; meterItems?: readonly NormalizedMeterItem[] }
  );

export type TerminalizeInput = {
  operationId: string;
  accountId: string;
  requestDigest: string;
  expectedGeneration: bigint;
  evidence: TerminalEvidence;
  resolvedAt: Date;
  /**
   * Finalize the supplier spend hold as `unresolved` in the same transaction.
   *
   * Recovery sets it when an absorbed expiry proves no further supplier
   * evidence is coming, so the hold stops pinning budget. The live gateway
   * never sets it: its operations either settle or keep the hold for
   * reconciliation.
   */
  expireSpendHold?: boolean;
};

export type TerminalReceipt = {
  operationId: string;
  baseTransactionId: string;
  terminalRevision: bigint;
  customerState: Exclude<CustomerState, 'pending'>;
  authorizedAtoms: bigint;
  chargedAtoms: bigint;
  accountDeltaAtoms: bigint;
  sourceDeltas: SourceAmounts;
  resolvedAt: Date;
};

export type SupplierEvidenceInput = {
  operationId?: string;
  environment: BillingEnvironment;
  provider: string;
  credentialAccount: string;
  sourceObjectId: string;
  sourceRevision: string;
  payloadDigest: string;
  currency: string;
  numerator: bigint;
  denominator: bigint;
  completeness: 'partial' | 'complete';
  finality: 'preliminary' | 'final';
  receivedAt: Date;
};

export type AccountSnapshot = SourceAmounts & {
  accountId: string;
  debtAtoms: bigint;
  promoHeldAtoms: bigint;
  planHeldAtoms: bigint;
  purchasedHeldAtoms: bigint;
  revision: bigint;
};

export type PaidCauseInput = {
  accountId: string;
  causeId: string;
};

export type PaidCauseReceipt = {
  receiptId: string;
  grantedAtoms: bigint;
  revision: bigint;
};

export type CompensationInput = {
  accountId: string;
  originalTransactionId: string;
  compensationId: string;
  atoms: bigint;
  occurredAt: Date;
};

export type ReversalMutationInput = {
  accountId: string;
  caseId: string;
  source: 'plan' | 'purchased';
  targetReversedAtoms: bigint;
  occurredAt: Date;
};

export type PromotionIssuanceInput = {
  environment: BillingEnvironment;
  accountId: string;
  promotionProgramId: string;
  periodStart: Date;
  periodEnd: Date;
  entitlementAtoms: bigint;
  accountCeilingAtoms: bigint;
  budgetId: string;
  occurredAt: Date;
  enabled: boolean;
  replica: { schemaVersion: number; meterContractIds: readonly string[] };
};

export type OperationClaim = {
  operationId: string;
  accountId: string;
  requestDigest: string;
  generation: bigint;
};

export type LlmRecoveryResult = {
  claimed: number;
  resolved: number;
  pending: number;
  remainingDue: number;
  leasedDue: number;
  oldestDueAgeMilliseconds?: number;
  failedOperationIds: string[];
};

export type OwnerLlmRecoveryResult = LlmRecoveryResult & {
  pool: FundedLlmCapacityPool;
};

export type SupplierFinalityInput = {
  evidenceId: string;
  operationId: string;
  accountId: string;
  requestDigest: string;
  expectedGeneration: bigint;
};

/** Complete source-qualified cash loss, applied only under its canonical Charge fence. */
export type CashDispositionInput = {
  readonly accountId: string;
  readonly causeId: string;
  readonly source: 'plan' | 'purchased';
  readonly sourceClaimId: string;
  readonly sourceGeneration: bigint;
  readonly projectionDigest: string;
  readonly principalLossMinor: bigint;
  readonly taxLossMinor: bigint;
  readonly grossLossMinor: bigint;
  readonly evidence: Record<string, unknown>;
  readonly occurredAt: Date;
};
