import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Span } from '#telemetry/tracer.service.js';
import { codeCompletionRequestSchema } from '#api/code-completion/code-completion.dto.js';
import type { ModelInvocationResult, ModelInvocationService } from '#api/llm/model-invocation.types.js';
import { modelInvocationServiceKey } from '#api/llm/model-invocation.types.js';

/** Runs bounded hosted code completion through the shared funded invocation owner. */
@Injectable()
export class CodeCompletionService {
  public constructor(@Inject(modelInvocationServiceKey) private readonly invocations: ModelInvocationService) {}

  /* eslint-disable max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity */
  @Span()
  public async complete(
    body: unknown,
    authUserId: string,
    signal: AbortSignal,
    onAdmitted?: (operationId: string) => void,
  ): Promise<ModelInvocationResult> {
    const parsed = codeCompletionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Code completion request is invalid');
    }
    const request = parsed.data;
    const metadata = request.completionMetadata;
    return this.invocations.invoke({
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
      directPrompt: {
        system: 'Return only the exact code to insert at the cursor.',
        messages: [{ role: 'user', content: `${metadata.textBeforeCursor}{{CURSOR}}${metadata.textAfterCursor}` }],
        maximumOutputTokens: 256,
      },
      signal,
      onAdmitted,
    });
  }
  /* eslint-enable max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity ends */
}
