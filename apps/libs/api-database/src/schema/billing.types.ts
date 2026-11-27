/**
 * Persisted billing column shapes: the JSON the `billing` tables store. They
 * live beside the schema that types its columns; the billing domain re-exports them.
 */
export type InputCountEvidence = {
  version: 'openai-input-count-v2';
  sourceRevision: string;
  environment: BillingEnvironment;
  modelId: string;
  createRequestDigest: string;
  countRequestDigest: string;
  inputTokens: string;
  /** Liability of the count call itself: the controlled loopback stub, or the supplier's counter. */
  liability: 'controlled-local-zero' | 'openai-input-tokens-v1';
};

/** Read boundary for immutable pre-removal receipts; new admissions accept only v2. */
export type PersistedInputCountEvidence =
  | InputCountEvidence
  | (Omit<InputCountEvidence, 'version'> & {
      version: 'openai-input-count-v1';
      credentialAccount: string;
    });

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

/**
 * The conversation prefix an operation's request carried, kept so the conversation's next step is held from the
 * input tokens this one settled with (chat performance WP-15 step 6). Never part of the price.
 */
export type InputPrefix = {
  version: 'input-prefix-v1';
  /** `sha256:` hex digest of the request's non-conversation members chained over its conversation items. */
  digest: string;
  /** How many conversation items the digest covers. */
  items: number;
};

export type BillingEnvironment = 'development' | 'staging' | 'prod-us' | 'prod-eu';
