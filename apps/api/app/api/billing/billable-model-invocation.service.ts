import { countBillableModelInput } from '#api/billing/billable-model-input-count.js';
import { maximumMeterCharge } from '#api/billing/billable-model-bound.js';
import { routeSkuFamily } from '#api/billing/billable-model-qualification.js';
import { createHmac } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  assertMatchingRequestDigest,
  classifyFundedLlmCapacity,
  CreditLedgerService,
} from '#api/billing/credit-ledger.service.js';
import { and, eq, inArray } from 'drizzle-orm';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { cloudProviderAccountMessage, recognizeProviderAccountRefusal } from '#api/llm/provider-account-refusal.js';
import type { ProviderAccountRefusal } from '#api/llm/provider-account-refusal.js';
import { classifyUpstreamRefusal, readUpstreamRefusal, upstreamRetryAfterSeconds } from '#api/llm/upstream-refusal.js';
import { createProviderAccountFrameFilter } from '#api/llm/provider-account-stream.js';
import { isGatewayProviderId } from '#api/providers/provider-gateway.js';
import type { GatewayProviderId } from '#api/providers/provider-gateway.js';
import { supplierBlockingFinancialCaseKinds } from '#api/billing/billing-supplier-reconciliation.service.js';
import { billingFinancialCase, creditOperation } from '#database/schema.js';
import { DatabaseService } from '#database/database.service.js';
import { billableModelQualificationResolverKey } from '#api/billing/billable-model-invocation.types.js';
import type {
  BillableInvocationEvidenceCollector,
  BillableInvocationIntent,
  BillableInvocationResult,
  BillableModelQualificationResolver,
  QualifiedBillableInvocation,
  SupplierFinalityClassification,
} from '#api/billing/billable-model-invocation.types.js';
import type { AdmissionDenied } from '#api/billing/credit-ledger.service.js';
import type {
  BillingEnvironment,
  QualifiedAdmissionInput,
  TerminalEvidence,
} from '#api/billing/credit-ledger.types.js';
import { MetricsService } from '#telemetry/metrics.js';

type InvocationRow = NonNullable<Awaited<ReturnType<CreditLedgerService['getOperationForAttempt']>>>;
const requestKeyVersion = 1;
const environment = (value: string): BillingEnvironment => {
  if (value === 'development' || value === 'staging' || value === 'prod-us' || value === 'prod-eu') {
    return value;
  }
  throw new Error('Stored billing environment is invalid');
};
const assertDigestBoundary = (value: unknown): void => {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  // oxlint-disable-next-line typescript/no-restricted-types -- WeakSet accepts arrays and records
  const seen = new WeakSet<object>();
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || current.value === null || typeof current.value !== 'object') {
      continue;
    }
    if (current.depth > 64 || ++nodes > 100_000 || seen.has(current.value)) {
      throw new Error('Model request exceeds its digest boundary');
    }
    seen.add(current.value);
    for (const child of Object.values(current.value)) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
};
/** A provider-account refusal in the body, with its provider narrowed to the gateway's own set. */
const providerAccountRefusal = (
  providerId: string,
  body: unknown,
): { readonly providerId: GatewayProviderId; readonly refusal: ProviderAccountRefusal } | undefined => {
  if (!isGatewayProviderId(providerId)) {
    return undefined;
  }
  const refusal = recognizeProviderAccountRefusal({ providerId, body });
  return refusal === undefined ? undefined : { providerId, refusal };
};

const canonicalize = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map((item) => canonicalize(item))
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, child]) => [key, canonicalize(child)]),
        )
      : typeof value === 'bigint'
        ? value.toString()
        : value;

/** Owns one funded model invocation from qualified admission through one terminal mutation. */
@Injectable()
export class BillableModelInvocationService {
  private readonly logger = new Logger(BillableModelInvocationService.name);

  public constructor(
    @Inject(CreditLedgerService) private readonly ledger: CreditLedgerService,
    @Inject(billableModelQualificationResolverKey)
    private readonly resolver: BillableModelQualificationResolver,
    private readonly config: ConfigService,
    // oxlint-disable-next-line new-cap -- NestJS parameter decorators are invoked without new
    @Optional() private readonly metrics?: MetricsService,
    /* Ponytail: optional so the C05 child harness keeps its three-argument
     * construction; Nest always supplies it, and the route pause is skipped
     * only where no database is wired at all. */
    // oxlint-disable-next-line new-cap -- NestJS parameter decorators are invoked without new
    @Optional()
    @Inject(DatabaseService)
    private readonly database?: Pick<DatabaseService, 'database'>,
  ) {}

  public async invoke(suppliedIntent: BillableInvocationIntent): Promise<BillableInvocationResult> {
    assertDigestBoundary(suppliedIntent.body);
    if (Buffer.byteLength(JSON.stringify(suppliedIntent.body), 'utf8') > 4_000_000) {
      throw new Error('Model request exceeds its digest boundary');
    }
    const intent = {
      ...suppliedIntent,
      body: structuredClone(suppliedIntent.body),
      priceHeaders: { ...suppliedIntent.priceHeaders },
    };
    const existing = await this.operation(intent);
    if (existing) {
      const requestDigest = this.requestDigest(intent, existing);
      assertMatchingRequestDigest(existing.requestDigest, requestDigest);
      intent.onAdmitted?.(existing.id);
      return {
        state: existing.customerState === 'pending' ? 'pending' : 'terminal',
        operationId: existing.id,
      };
    }
    let qualification = this.resolver.resolve({
      environment: intent.environment,
      surface: intent.surface,
      attempt: intent.attempt,
      providerWire: intent.providerWire,
      body: intent.body,
      priceHeaders: intent.priceHeaders,
      activity: intent.activity,
      ...(intent.projectHint === undefined ? {} : { projectHint: intent.projectHint }),
      ...(intent.chatHint === undefined ? {} : { chatHint: intent.chatHint }),
    });
    await this.assertRouteNotPaused(intent, qualification);
    const selectedCount = qualification.inputCount;
    let countSignal: AbortSignal | undefined;
    if (selectedCount !== undefined && !selectedCount.capability) {
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'Exact input count is not qualified.',
      );
    }
    await this.ledger.issueCurrentPromotion({
      environment: intent.environment,
      authUserId: intent.authUserId,
      replica: qualification.replica,
    });
    let recoveryAttempted = false;
    let executionDeadline: Date | undefined;
    if (selectedCount !== undefined) {
      try {
        intent.signal.throwIfAborted();
        const eligibilityInput = {
          environment: intent.environment,
          authUserId: intent.authUserId,
          activity: intent.activity,
          sku: qualification.sku,
          replica: qualification.replica,
          executionTimeout: qualification.invocation.executionTimeout,
          minimumOutput: qualification.maximumQuantities.find((meter) => meter.dimension === 'output')!.quantity,
          minimumSupplierPicoUsd: maximumMeterCharge(
            qualification.invocation.supplierRates.map((rate) => ({
              dimension: rate.dimension,
              quantity:
                rate.dimension === 'output'
                  ? qualification.maximumQuantities.find((meter) => meter.dimension === 'output')!.quantity
                  : 0n,
              numerator: BigInt(rate.numeratorPicoUsd),
              denominator: BigInt(rate.denominatorUnits),
            })),
          ),
        };
        let eligible = await this.ledger.inputCountEligibility(eligibilityInput);
        if (eligible.status === 'denied' && eligible.reason === 'concurrency_unavailable') {
          recoveryAttempted = true;
          await this.recoverCapacity(intent);
          eligible = await this.ledger.inputCountEligibility(eligibilityInput);
        }
        if (eligible.status === 'denied') {
          if (eligible.reason === 'insufficient_credit') {
            await this.ledger.recordFundedWorkDenial({
              environment: intent.environment,
              authUserId: intent.authUserId,
              attemptKey: intent.attempt.key,
              requestDigest: this.requestDigest(intent, qualification),
            });
          }
          throw this.denial(eligible, intent, qualification.routeId);
        }
        executionDeadline = eligible.executionDeadline;
        countSignal = AbortSignal.any([intent.signal, AbortSignal.timeout(eligible.remaining)]);
        const maximumInput = qualification.invocation.jointInputMaximum;
        if (!maximumInput || !selectedCount.capability) {
          throw new Error('Counted input partition is unqualified');
        }
        const inputCount = await countBillableModelInput({
          body: qualification.normalizedRequest.body,
          maximumInput: BigInt(maximumInput.quantity),
          capability: selectedCount.capability,
          environment: intent.environment,
          credentialAccount: qualification.invocation.credentialAccount,
          signal: countSignal,
        });
        countSignal.throwIfAborted();
        const jointInputMaximum = {
          ...maximumInput,
          quantity: inputCount.inputTokens,
        };
        const maximumQuantities = qualification.maximumQuantities.map((meter) => ({
          ...meter,
          quantity: meter.dimension === 'output' ? meter.quantity : BigInt(inputCount.inputTokens),
        }));
        qualification = {
          ...qualification,
          maximumQuantities,
          supplierMaximumPicoUsd: maximumMeterCharge(
            qualification.invocation.supplierRates.map((rate) => ({
              dimension: rate.dimension,
              quantity: maximumQuantities.find(
                (meter) => meter.dimension === rate.dimension && meter.tier === rate.tier,
              )!.quantity,
              numerator: BigInt(rate.numeratorPicoUsd),
              denominator: BigInt(rate.denominatorUnits),
            })),
            jointInputMaximum,
          ),
          invocation: {
            ...qualification.invocation,
            jointInputMaximum,
            inputCount,
          },
        };
      } catch (error) {
        if (error instanceof LlmGatewayError) {
          throw error;
        }
        /* The count is a refinement, not a precondition: the byte bound is already a proved finite
         * bound, so a counter timeout, rate limit or schema drift proceeds on the un-counted
         * qualification rather than taking every route that selected counting off the air. The
         * ruling it must not break is the other direction — never a larger bound after a count
         * succeeded — and `qualification` is still the byte-bound one here. */
        this.logger.warn(
          `Exact input count unavailable for ${qualification.routeId}; admitting at the byte bound: ${error instanceof Error ? error.message : String(error)}`,
        );
        countSignal = undefined;
        executionDeadline = undefined;
      }
    }
    const requestDigest = this.requestDigest(intent, qualification);
    const admissionInput: QualifiedAdmissionInput = {
      environment: intent.environment,
      authUserId: intent.authUserId,
      surface: intent.surface,
      attemptKey: intent.attempt.key,
      requestDigest,
      requestKeyVersion,
      category: 'llm',
      ...(executionDeadline === undefined ? {} : { executionDeadline }),
      modelId: qualification.modelId,
      modelDisplayName: qualification.modelDisplayName,
      providerId: qualification.providerId,
      ...(intent.projectHint === undefined ? {} : { projectHint: intent.projectHint }),
      ...(intent.chatHint === undefined ? {} : { chatHint: intent.chatHint }),
      activity: intent.activity,
      sku: qualification.sku,
      maximumQuantities: qualification.maximumQuantities,
      supplierMaximumPicoUsd: qualification.supplierMaximumPicoUsd,
      replica: qualification.replica,
      invocation: {
        ...qualification.invocation,
        supplierRates: qualification.invocation.supplierRates.map((rate) => ({
          ...rate,
        })),
      },
    };
    // A caller that already left must not place a hold that only the recovery sweep releases.
    intent.signal.throwIfAborted();
    let admission = await this.ledger.admitOperation(admissionInput);
    if (admission.status === 'denied' && admission.reason === 'concurrency_unavailable' && !recoveryAttempted) {
      await this.recoverCapacity(intent);
      intent.signal.throwIfAborted();
      admission = await this.ledger.admitOperation(admissionInput);
    }
    if (admission.status === 'denied') {
      throw this.denial(admission, intent, qualification.routeId);
    }
    if (admission.status === 'replay') {
      intent.onAdmitted?.(admission.operationId);
      return {
        state: admission.customerState === 'pending' ? 'pending' : 'terminal',
        operationId: admission.operationId,
      };
    }
    const row = await this.operation(intent);
    if (!row || row.id !== admission.operationId || row.requestDigest !== requestDigest) {
      throw new Error('Admitted model invocation identity is unavailable');
    }
    intent.onAdmitted?.(row.id);
    if (intent.signal.aborted || countSignal?.aborted) {
      if (intent.signal.aborted) {
        await this.ledger.recordCancellation({
          operationId: row.id,
          accountId: row.accountId,
          requestDigest,
        });
      }
      return { state: 'pending', operationId: row.id };
    }
    if (!(await this.ledger.markDispatchIntent(row.id, admission.generation))) {
      return { state: 'pending', operationId: row.id };
    }
    return this.dispatch(intent, qualification, row, admission.generation, countSignal);
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- one immutable invocation checkpoint
  private async dispatch(
    intent: BillableInvocationIntent,
    qualification: QualifiedBillableInvocation,
    row: InvocationRow,
    generation: bigint,
    countSignal?: AbortSignal,
  ): Promise<BillableInvocationResult> {
    const remaining = await this.ledger.getDispatchTimeRemaining(row.id, generation);
    if (remaining <= 0) {
      return { state: 'pending', operationId: row.id };
    }
    const deadline = AbortSignal.timeout(
      Math.max(1, Math.min(2_147_483_647, qualification.invocation.executionTimeout, remaining)),
    );
    const signal = AbortSignal.any([intent.signal, deadline, ...(countSignal === undefined ? [] : [countSignal])]);
    const collector = qualification.adapter.createEvidenceCollector(qualification);
    const recordCancellation = async (): Promise<void> => {
      try {
        await this.ledger.recordCancellation({
          operationId: row.id,
          accountId: row.accountId,
          requestDigest: row.requestDigest,
        });
      } catch (error) {
        this.logger.error('Failed to retain invocation cancellation', error);
      }
    };
    intent.signal.addEventListener('abort', recordCancellation, { once: true });
    let response: Response;
    try {
      response = await qualification.adapter.executeOnce({
        qualification,
        signal,
      });
    } catch (error) {
      this.logger.warn({ err: error, operationId: row.id }, 'The model provider request failed before any response');
      intent.signal.removeEventListener('abort', recordCancellation);
      await this.finish(
        qualification,
        row,
        generation,
        collector.failed(signal.aborted ? (intent.signal.aborted ? 'client_abort' : 'deadline') : 'malformed_response'),
      );
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'The model provider is unavailable.',
      );
    }
    if (!response.ok || !response.body) {
      intent.signal.removeEventListener('abort', recordCancellation);
      const evidence = collector.failed(response.ok ? 'malformed_response' : 'provider_rejected');
      // One bounded read of the refused body: enough to classify it and to log it, never forwarded.
      const { body, loggedBody } = response.ok
        ? { body: undefined, loggedBody: undefined }
        : await readUpstreamRefusal(response);
      this.logger.warn(
        {
          providerId: qualification.providerId,
          routeId: qualification.routeId,
          modelId: qualification.modelId,
          upstreamStatus: response.status,
          upstreamBody: loggedBody,
          operationId: row.id,
        },
        'Upstream model provider refused the request',
      );
      if (response.ok && response.body) {
        await response.body.cancel();
      }
      await this.finish(qualification, row, generation, evidence);
      const recognized = providerAccountRefusal(qualification.providerId, body);
      if (recognized) {
        // Settled as provider_rejected above: the customer is charged nothing for it.
        throw this.providerAccountExhausted(intent, recognized.providerId, recognized.refusal);
      }
      const retryAfterSeconds = upstreamRetryAfterSeconds(response.headers);
      const classification = classifyUpstreamRefusal({
        status: response.status,
        accountOwner: 'tau',
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      });
      // Tau owns the key here, so the supplier's own sentence never leaves the API.
      const message =
        classification.type === 'UPSTREAM_REJECTED'
          ? `The model provider rejected the request (HTTP ${response.status}).`
          : classification.type === 'RATE_LIMITED'
            ? 'The model provider is rate limiting this request.'
            : 'The model provider is unavailable.';
      throw new LlmGatewayError(classification.status, classification.type, message, classification.details);
    }
    // The supplier answered: the operation is in flight, not abandoned. Losing this
    // transition to recovery never abandons a response that is already being charged.
    await this.ledger.markDispatchAccepted(row.id, generation);
    const observed = this.observedBody(
      response.body,
      collector,
      qualification,
      row,
      generation,
      intent,
      recordCancellation,
      signal,
    );
    const relayed = isGatewayProviderId(qualification.providerId)
      ? observed.body.pipeThrough(
          createProviderAccountFrameFilter({
            providerId: qualification.providerId,
            accountOwner: 'tau',
            onRefusal: (refusal) => {
              this.recordProviderAccountExhausted(intent, qualification.providerId, refusal);
            },
          }),
        )
      : observed.body;
    return {
      state: 'streaming',
      operationId: row.id,
      response: new Response(relayed, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      completion: observed.completion,
    };
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- one immutable invocation checkpoint
  private observedBody(
    upstream: ReadableStream<Uint8Array<ArrayBuffer>>,
    collector: BillableInvocationEvidenceCollector,
    qualification: QualifiedBillableInvocation,
    row: InvocationRow,
    generation: bigint,
    intent: BillableInvocationIntent,
    recordCancellation: () => void,
    signal: AbortSignal,
  ): {
    body: ReadableStream<Uint8Array<ArrayBuffer>>;
    completion: Promise<void>;
  } {
    const reader = upstream.getReader();
    const projection = qualification.adapter.createClientProjection?.(qualification);
    let bytes = 0;
    let projectedBytes = 0;
    let done = false;
    let resolveCompletion!: () => void;
    let rejectCompletion!: (reason: unknown) => void;
    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    const finish = async (evidence: TerminalEvidence): Promise<void> => {
      if (done) {
        return;
      }
      done = true;
      intent.signal.removeEventListener('abort', recordCancellation);
      try {
        await this.finish(qualification, row, generation, evidence);
        resolveCompletion();
      } catch (error) {
        rejectCompletion(error);
      }
    };
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: async (controller) => {
        try {
          const part = await reader.read();
          if (part.done) {
            for (const projected of projection?.complete() ?? []) {
              projectedBytes += projected.byteLength;
              if (projectedBytes > qualification.maximumResponseBytes) {
                throw new Error('Projected response exceeded its qualified byte limit');
              }
              controller.enqueue(projected);
            }
            controller.close();
            await finish(collector.complete());
            return;
          }
          bytes += part.value.byteLength;
          if (bytes > qualification.maximumResponseBytes) {
            /* The authorized ceiling, measured in response bytes (R8). An output token can never
             * be carried in fewer bytes than it costs, and the qualification sizes this limit from
             * the same authorized output maximum the supplier tariff is priced over, so a stream
             * past it can no longer be priced inside its authorization: cut it upstream and settle
             * at the authorization rather than absorbing a real supplier spend at zero charge.
             * Ponytail: one integer compare per chunk. A per-chunk cost projection over the pinned
             * rates is the same test — the input term is identical on both sides and cancels — and
             * no byte-derived token bound is tighter without decoding every chunk. */
            await reader.cancel('authorized_exhausted');
            controller.error(new Error('Provider response reached its authorized ceiling'));
            // The bytes the cut observed are the only measurement of the ceiling's own
            // bytes-per-output-token constant; the ledger reads them onto the operator's case.
            const exhausted = collector.failed('authorized_exhausted');
            await finish(
              exhausted.normalizationEvidence === undefined
                ? exhausted
                : {
                    ...exhausted,
                    normalizationEvidence: {
                      ...exhausted.normalizationEvidence,
                      fields: { ...exhausted.normalizationEvidence.fields, responseBytes: bytes.toString() },
                    },
                  },
            );
            return;
          }
          collector.accept(part.value);
          for (const projected of projection?.accept(part.value) ?? [part.value]) {
            projectedBytes += projected.byteLength;
            if (projectedBytes > qualification.maximumResponseBytes) {
              throw new Error('Projected response exceeded its qualified byte limit');
            }
            controller.enqueue(projected);
          }
        } catch (error) {
          controller.error(error);
          await finish(
            collector.failed(
              intent.signal.aborted ? 'client_abort' : signal.aborted ? 'deadline' : 'malformed_response',
            ),
          );
        }
      },
      cancel: async () => {
        await reader.cancel('client_abort');
        await this.ledger.recordCancellation({
          operationId: row.id,
          accountId: row.accountId,
          requestDigest: row.requestDigest,
        });
        await finish(collector.failed('client_abort'));
      },
    });
    return { body, completion };
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- one immutable invocation checkpoint
  private async finish(
    qualification: QualifiedBillableInvocation,
    row: InvocationRow,
    generation: bigint,
    evidence: TerminalEvidence,
  ): Promise<void> {
    await this.ledger.recordInvocationEvidence({
      operationId: row.id,
      accountId: row.accountId,
      requestDigest: row.requestDigest,
      evidence,
    });
    const terminalReason = evidence.normalizationEvidence?.terminalReason;
    this.metrics?.billingFundedOperationTerminals.add(1, {
      'deployment.environment': row.environment,
      'tau.billing.capacity_pool': classifyFundedLlmCapacity(row.activity).pool,
      'tau.billing.terminal.kind': evidence.kind,
      'tau.billing.terminal.incomplete_reason':
        terminalReason === 'max_output_tokens' || terminalReason === 'content_filter'
          ? terminalReason
          : terminalReason === undefined
            ? 'none'
            : 'other',
    });
    const finality = qualification.adapter.classifyFinality({
      qualification,
      evidence,
    });
    await this.recordSupplierEvidence(row, qualification, finality);
    if (finality.state === 'final' && finality.supplierEvidence?.completeness === 'complete') {
      await this.ledger.finalizeRecordedSupplierEvidence({
        operationId: row.id,
        accountId: row.accountId,
        requestDigest: row.requestDigest,
        expectedGeneration: generation,
        payloadDigest: finality.supplierEvidence.payloadDigest,
        sourceRevision: finality.supplierEvidence.sourceRevision,
      });
    }
    if (evidence.kind === 'absorbed_unknown') {
      return;
    }
    await this.ledger.terminalizeOperation({
      operationId: row.id,
      accountId: row.accountId,
      requestDigest: row.requestDigest,
      expectedGeneration: generation,
      evidence,
      resolvedAt: new Date(),
    });
  }

  private async recordSupplierEvidence(
    row: InvocationRow,
    qualification: QualifiedBillableInvocation,
    finality: SupplierFinalityClassification,
  ): Promise<void> {
    if (!finality.supplierEvidence) {
      return;
    }
    const evidence = finality.supplierEvidence;
    const outcome = await this.ledger.appendSupplierEvidence({
      operationId: row.id,
      environment: environment(row.environment),
      provider: qualification.providerId,
      credentialAccount: qualification.invocation.credentialAccount,
      sourceObjectId: row.id,
      sourceRevision: evidence.sourceRevision,
      payloadDigest: evidence.payloadDigest,
      currency: evidence.currency,
      numerator: BigInt(evidence.numerator),
      denominator: BigInt(evidence.denominator),
      completeness: evidence.completeness,
      finality: finality.state === 'final' ? 'final' : 'preliminary',
      receivedAt: new Date(),
    });
    if (outcome === 'conflict') {
      throw new Error('Conflicting supplier evidence');
    }
  }

  private async operation(intent: BillableInvocationIntent): ReturnType<CreditLedgerService['getOperationForAttempt']> {
    return this.ledger.getOperationForAttempt({
      environment: intent.environment,
      authUserId: intent.authUserId,
      surface: intent.surface,
      attemptKey: intent.attempt.key,
    });
  }

  private requestDigest(intent: BillableInvocationIntent, pins: QualifiedBillableInvocation | InvocationRow): string {
    const secret = this.config.get<string>('BILLING_REQUEST_DIGEST_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error('BILLING_REQUEST_DIGEST_SECRET is required');
    }
    assertDigestBoundary(intent.body);
    const bounded = JSON.stringify(intent.body);
    if (bounded.length > 4_000_000) {
      throw new Error('Model request exceeds its digest boundary');
    }
    const canonical = canonicalize({
      owner: intent.authUserId,
      surface: intent.surface,
      attempt: intent.attempt,
      providerWire: intent.providerWire,
      body: intent.body,
      priceHeaders: intent.priceHeaders,
      activity: intent.activity,
      projectHint: intent.projectHint,
      chatHint: intent.chatHint,
      modelId: pins.modelId,
      sku: pins.sku,
      meterContractId: pins.meterContractId,
      maximumQuantities: pins.maximumQuantities,
      invocation: pins.invocation,
    });
    return `hmac-sha256:${createHmac('sha256', secret).update(JSON.stringify(canonical)).digest('hex')}`;
  }

  private async recoverCapacity(intent: BillableInvocationIntent): Promise<void> {
    const capacity = classifyFundedLlmCapacity(intent.activity);
    const attributes = {
      'deployment.environment': intent.environment,
      'tau.billing.capacity_pool': capacity.pool,
    } as const;
    this.metrics?.billingFundedOperationRecoveries.add(1, {
      ...attributes,
      'tau.billing.recovery.outcome': 'attempted',
    });
    let result;
    try {
      result = await this.ledger.recoverDueLlmOperationsForOwner({
        environment: intent.environment,
        authUserId: intent.authUserId,
        activity: intent.activity,
      });
    } catch {
      this.metrics?.billingFundedOperationRecoveries.add(1, {
        ...attributes,
        'tau.billing.recovery.outcome': 'failed',
      });
      this.metrics?.billingFundedOperationDenials.add(1, {
        ...attributes,
        'tau.billing.denial.reason': 'recovery_failed',
      });
      throw this.recoveryUnavailable();
    }
    if (result.claimed > 0) {
      this.metrics?.billingFundedOperationRecoveries.add(result.claimed, {
        ...attributes,
        'tau.billing.recovery.outcome': 'claimed',
      });
    }
    if (result.resolved > 0) {
      this.metrics?.billingFundedOperationRecoveries.add(result.resolved, {
        ...attributes,
        'tau.billing.recovery.outcome': 'resolved',
      });
    }
    if (result.failedOperationIds.length > 0) {
      this.metrics?.billingFundedOperationRecoveries.add(result.failedOperationIds.length, {
        ...attributes,
        'tau.billing.recovery.outcome': 'failed',
      });
      this.metrics?.billingFundedOperationDenials.add(1, {
        ...attributes,
        'tau.billing.denial.reason': 'recovery_failed',
      });
      throw this.recoveryUnavailable();
    }
    if (result.remainingDue > 0) {
      this.metrics?.billingFundedOperationDenials.add(1, {
        ...attributes,
        'tau.billing.denial.reason': 'recovery_in_progress',
      });
      throw this.recoveryUnavailable();
    }
  }

  /**
   * Refuses a route whose supplier evidence an operator still owns (B7 R7, S3).
   *
   * Only the three operation-scoped supplier case kinds name a route, and they
   * name it through the case's own source operation rather than its evidence
   * JSON, so `source_type = 'credit_operation'` is what separates them from the
   * aggregate `supplier_charge_unmatched` and the environment-level
   * `supplier_invoice_total_mismatch` — neither of which is a route fault.
   *
   * @param intent - The invocation being admitted.
   * @param qualification - Its resolved route.
   */
  private async assertRouteNotPaused(
    intent: BillableInvocationIntent,
    qualification: QualifiedBillableInvocation,
  ): Promise<void> {
    if (!this.database) {
      return;
    }
    const [paused] = await this.database.database
      .select({ id: billingFinancialCase.id })
      .from(billingFinancialCase)
      .innerJoin(creditOperation, eq(creditOperation.id, billingFinancialCase.sourceId))
      .where(
        and(
          eq(billingFinancialCase.environment, intent.environment),
          eq(billingFinancialCase.sourceType, 'credit_operation'),
          inArray(billingFinancialCase.kind, supplierBlockingFinancialCaseKinds),
          inArray(billingFinancialCase.state, ['open', 'attention']),
          eq(creditOperation.environment, intent.environment),
          // A pause covers the whole route: its base sku and its `:long-context` sibling.
          inArray(creditOperation.sku, routeSkuFamily(qualification.sku)),
        ),
      )
      .limit(1);
    if (!paused) {
      return;
    }
    const { pool } = classifyFundedLlmCapacity(intent.activity);
    this.metrics?.billingFundedOperationDenials.add(1, {
      'deployment.environment': intent.environment,
      'tau.billing.capacity_pool': pool,
      'tau.billing.denial.reason': 'supplier_route_paused',
    });
    this.logger.warn(`Funded admission denied: supplier_route_paused for ${qualification.sku} by case ${paused.id}`);
    throw new LlmGatewayError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PROVIDER_UNAVAILABLE',
      'This model route is paused while Tau reconciles its supplier evidence.',
    );
  }

  /**
   * Records a recognised supplier-account refusal for Tau's operators. The
   * supplier's own sentence stays in the log, where only Tau reads it; the
   * customer only ever gets the opaque message.
   *
   * @param intent - The invocation whose supplier account refused.
   * @param providerId - The refusing supplier.
   * @param refusal - The provider's own code and sentence.
   */
  private recordProviderAccountExhausted(
    intent: BillableInvocationIntent,
    providerId: string,
    refusal: ProviderAccountRefusal,
  ): void {
    this.metrics?.billingProviderAccountRefusals.add(1, {
      'deployment.environment': intent.environment,
      providerId,
    });
    this.logger.warn(
      `Supplier account exhausted on ${providerId} (${refusal.providerCode ?? 'no code'}) in ${intent.environment}: ${refusal.message}`,
    );
  }

  private providerAccountExhausted(
    intent: BillableInvocationIntent,
    providerId: GatewayProviderId,
    refusal: ProviderAccountRefusal,
  ): LlmGatewayError {
    this.recordProviderAccountExhausted(intent, providerId, refusal);
    return new LlmGatewayError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PROVIDER_ACCOUNT_EXHAUSTED',
      cloudProviderAccountMessage,
      {
        providerId,
        ...(refusal.providerCode === undefined ? {} : { providerCode: refusal.providerCode }),
        accountOwner: 'tau',
      },
    );
  }

  private recoveryUnavailable(): LlmGatewayError {
    return new LlmGatewayError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'BILLING_RECOVERY_UNAVAILABLE',
      'Tau is finalizing earlier funded work. Try again shortly.',
    );
  }

  /**
   * Turns a ledger refusal into the gateway error its clients parse.
   *
   * A credit refusal carries the shortfall the ledger measured so the client can
   * say how much is missing on which route, rather than a bare 402.
   *
   * @param denied - The ledger's refusal, with its shortfall when it has one.
   * @param intent - The refused invocation intent.
   * @param routeId - Catalog route the refusal applies to.
   * @returns The typed gateway error to throw.
   */
  private denial(denied: AdmissionDenied, intent: BillableInvocationIntent, routeId: string): LlmGatewayError {
    const { reason } = denied;
    if (reason === 'insufficient_credit' || reason === 'debt') {
      return new LlmGatewayError(
        HttpStatus.PAYMENT_REQUIRED,
        'INSUFFICIENT_CREDIT',
        'Insufficient Tau credit for this model request.',
        {
          requiredCreditAtoms: (denied.requiredCreditAtoms ?? 0n).toString(),
          availableCreditAtoms: (denied.availableCreditAtoms ?? 0n).toString(),
          routeId,
        },
      );
    }
    if (reason === 'concurrency_unavailable') {
      const { pool } = classifyFundedLlmCapacity(intent.activity);
      this.metrics?.billingFundedOperationDenials.add(1, {
        'deployment.environment': intent.environment,
        'tau.billing.capacity_pool': pool,
        'tau.billing.denial.reason': 'genuine_saturation',
      });
      const helper = pool === 'helper';
      return new LlmGatewayError(
        HttpStatus.TOO_MANY_REQUESTS,
        helper ? 'FUNDED_HELPER_LIMIT' : 'FUNDED_OPERATION_LIMIT',
        helper ? 'Too many funded helper operations are active.' : 'Too many funded model operations are active.',
      );
    }
    return new LlmGatewayError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PROVIDER_UNAVAILABLE',
      `Model admission failed: ${reason}.`,
    );
  }
}
