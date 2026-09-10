import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Span } from '#telemetry/tracer.service.js';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import type { BillingEnvironment } from '#api/billing/credit-ledger.types.js';
import { codeCompletionRequestSchema } from '#api/code-completion/code-completion.dto.js';
import type { BillableInvocationResult } from '#api/billing/billable-model-invocation.types.js';

/** Runs bounded hosted code completion through the shared funded invocation owner. */
@Injectable()
export class CodeCompletionService {
  public constructor(
    private readonly invocations: BillableModelInvocationService,
    private readonly config: ConfigService,
  ) {}

  /* eslint-disable max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity */
  @Span()
  public async complete(
    body: unknown,
    authUserId: string,
    signal: AbortSignal,
    onAdmitted?: (operationId: string) => void,
  ): Promise<BillableInvocationResult> {
    const parsed = codeCompletionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Code completion request is invalid');
    }
    const request = parsed.data;
    const environment = this.config.get<BillingEnvironment>('BILLING_ENVIRONMENT');
    if (!environment) {
      throw new ServiceUnavailableException('Billing environment is unavailable');
    }
    const metadata = request.completionMetadata;
    return this.invocations.invoke({
      environment,
      authUserId,
      surface: 'code_completion',
      attempt: { version: 1, key: request.admission.idempotencyKey },
      providerWire: 'openai-responses',
      body: {
        model: 'openai-gpt-5.6-luna',
        stream: true,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI Responses wire field
        max_output_tokens: 256,
        input: [
          { role: 'system', content: 'Return only the exact code to insert at the cursor.' },
          { role: 'user', content: `${metadata.textBeforeCursor}{{CURSOR}}${metadata.textAfterCursor}` },
        ],
      },
      priceHeaders: {},
      activity: 'completion',
      signal,
      onAdmitted,
    });
  }
  /* eslint-enable max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity ends */
}
