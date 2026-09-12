import type { InputCountCapability } from '#api/billing/billable-model-input-count.js';
import type { FinancialActivityKind } from '@taucad/billing';
import type {
  BillingEnvironment,
  MeterQuantity,
  TerminalEvidence,
  SupplierValuation,
  JointInputMaximum,
  InputCountEvidence,
} from '#api/billing/credit-ledger.types.js';

export const billableModelQualificationResolverKey = Symbol('billableModelQualificationResolver');

export type BillableInvocationSurface = 'gateway' | 'project_name' | 'commit_name' | 'code_completion';
export type BillableProviderWire = 'anthropic' | 'openai-completions' | 'openai-responses';

export type BillableInvocationIntent = {
  environment: BillingEnvironment;
  authUserId: string;
  surface: BillableInvocationSurface;
  attempt: { version: 1; key: string };
  providerWire: BillableProviderWire;
  body: unknown;
  priceHeaders: Readonly<Record<string, string>>;
  activity: FinancialActivityKind;
  projectHint?: string;
  chatHint?: string;
  signal: AbortSignal;
  /** Runs synchronously once the immutable operation identity is committed or found. */
  onAdmitted?(operationId: string): void;
};

export type InvocationMetadata = {
  contractVersion: string;
  credentialAccount: string;
  supplierRates: ReadonlyArray<{
    dimension: string;
    // oxlint-disable-next-line typescript/no-restricted-types -- financial meter tiers use explicit null
    tier: string | null;
    numeratorPicoUsd: string;
    denominatorUnits: string;
  }>;
  // oxlint-disable-next-line typescript/no-restricted-types -- null explicitly means no supplier-rate expiry
  supplierRatesValidUntil: string | null;
  /** Milliseconds. */
  executionTimeout: number;
  supplierValuation?: SupplierValuation;
  jointInputMaximum?: JointInputMaximum;
  inputCount?: InputCountEvidence;
};

export type QualifiedBillableInvocation = {
  surface: BillableInvocationSurface;
  routeId: string;
  providerWire: BillableProviderWire;
  modelId: string;
  modelDisplayName: string;
  providerId: string;
  sku: string;
  meterContractId: string;
  maximumQuantities: readonly MeterQuantity[];
  supplierMaximumPicoUsd: bigint;
  replica: { schemaVersion: number; meterContractIds: readonly string[] };
  invocation: InvocationMetadata;
  normalizedRequest: {
    body: unknown;
    headers: Readonly<Record<string, string>>;
  };
  maximumResponseBytes: number;
  adapter: BillableModelProviderAdapter;
  /** Presence selects exact counting; an absent capability refuses rather than falling back. */
  inputCount?: { capability: InputCountCapability | undefined };
};

export type BillableModelQualificationResolver = {
  resolve(intent: Omit<BillableInvocationIntent, 'authUserId' | 'signal'>): QualifiedBillableInvocation;
};

export type BillableInvocationEvidenceCollector = {
  accept(chunk: Uint8Array<ArrayBuffer>): void;
  complete(): TerminalEvidence;
  failed(
    reason: 'client_abort' | 'deadline' | 'malformed_response' | 'provider_rejected' | 'authorized_exhausted',
  ): TerminalEvidence;
};

export type SupplierFinalityClassification = {
  state: 'final' | 'preliminary' | 'unknown';
  providerRequestId?: string;
  reconcileBy?: Date;
  correctionHorizonEndsAt?: Date;
  supplierEvidence?: {
    sourceRevision: string;
    payloadDigest: string;
    currency: string;
    numerator: string;
    denominator: string;
    completeness: 'partial' | 'complete';
  };
};

export type BillableModelProviderAdapter = {
  createEvidenceCollector(qualification: QualifiedBillableInvocation): BillableInvocationEvidenceCollector;
  executeOnce(input: { qualification: QualifiedBillableInvocation; signal: AbortSignal }): Promise<Response>;
  classifyFinality(input: {
    qualification: QualifiedBillableInvocation;
    evidence: TerminalEvidence;
  }): SupplierFinalityClassification;
  createClientProjection?(qualification: QualifiedBillableInvocation): {
    accept(chunk: Uint8Array<ArrayBuffer>): ReadonlyArray<Uint8Array<ArrayBuffer>>;
    complete(): ReadonlyArray<Uint8Array<ArrayBuffer>>;
  };
  lookup?(input: {
    qualification: QualifiedBillableInvocation;
    providerRequestId: string;
    signal: AbortSignal;
  }): Promise<TerminalEvidence | undefined>;
};

export type BillableInvocationResult =
  | {
      state: 'streaming';
      operationId: string;
      response: Response;
      completion: Promise<void>;
    }
  | { state: 'pending' | 'terminal'; operationId: string };
