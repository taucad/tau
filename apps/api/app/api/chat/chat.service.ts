import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ModelMessage } from 'ai';
import { commitMessageGenerationSystemPrompt, projectNameGenerationSystemPrompt } from '@taucad/chat/prompts';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import type {
  BillableInvocationResult,
  BillableInvocationSurface,
} from '#api/billing/billable-model-invocation.types.js';
import type { BillingEnvironment } from '#api/billing/credit-ledger.types.js';

/** Runs the two API-hosted secondary generators through funded admission. */
@Injectable()
export class ChatService {
  public constructor(
    private readonly invocations: BillableModelInvocationService,
    private readonly config: ConfigService,
  ) {}

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity
  public async getBuildNameGenerator(
    messages: ModelMessage[],
    userId: string,
    attemptKey: string,
    projectHint: string,
    signal: AbortSignal,
    onAdmitted?: (operationId: string) => void,
  ): Promise<BillableInvocationResult> {
    return this.generate(
      'project_name',
      projectNameGenerationSystemPrompt,
      messages,
      userId,
      attemptKey,
      projectHint,
      signal,
      onAdmitted,
    );
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity
  public async getCommitMessageGenerator(
    messages: ModelMessage[],
    userId: string,
    attemptKey: string,
    projectHint: string,
    signal: AbortSignal,
    onAdmitted?: (operationId: string) => void,
  ): Promise<BillableInvocationResult> {
    return this.generate(
      'commit_name',
      commitMessageGenerationSystemPrompt,
      messages,
      userId,
      attemptKey,
      projectHint,
      signal,
      onAdmitted,
    );
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity
  private async generate(
    surface: BillableInvocationSurface,
    system: string,
    messages: ModelMessage[],
    authUserId: string,
    attemptKey: string,
    projectHint: string,
    signal: AbortSignal,
    onAdmitted?: (operationId: string) => void,
  ): Promise<BillableInvocationResult> {
    const environment = this.config.get<BillingEnvironment>('BILLING_ENVIRONMENT');
    if (!environment) {
      throw new ServiceUnavailableException('Billing environment is unavailable');
    }
    signal.throwIfAborted();
    const outcome = Promise.withResolvers<BillableInvocationResult>();
    const replayAbort = new AbortController();
    const sdkSignal = AbortSignal.any([signal, replayAbort.signal]);
    const abortBeforeAdmission = (): void => {
      outcome.reject(signal.reason);
    };
    signal.addEventListener('abort', abortBeforeAdmission, { once: true });
    const model = createOpenAI({
      // Credentials belong to the billed owner; SDK authorization never leaves this local fetch boundary.
      apiKey: 'billing-owned',
      fetch: async (_url, init) => {
        if (typeof init?.body !== 'string') {
          throw new TypeError('Expected a native Responses JSON request');
        }
        const result = await this.invocations.invoke({
          environment,
          authUserId,
          surface,
          attempt: { version: 1, key: attemptKey },
          providerWire: 'openai-responses',
          body: JSON.parse(init.body) as unknown,
          priceHeaders: {},
          activity: surface === 'project_name' ? 'title' : 'commit',
          projectHint,
          signal: sdkSignal,
          onAdmitted,
        });
        outcome.resolve(result);
        if (result.state !== 'streaming') {
          const error = new Error('Billable invocation has no new stream');
          replayAbort.abort(error);
          throw error;
        }
        return result.response;
      },
    }).responses('openai-gpt-5.6-luna');
    try {
      const streamed = streamText({
        model,
        system,
        messages,
        maxOutputTokens: 64,
        maxRetries: 0,
        abortSignal: sdkSignal,
        providerOptions: {
          openai: { store: false, forceReasoning: true, reasoningEffort: 'none' },
        },
        // Leave self-contained URLs to the provider codec and funded validator; no pre-admission downloads.
        // eslint-disable-next-line @typescript-eslint/naming-convention -- installed SDK option name
        experimental_download: async (downloads) => downloads.map(() => null),
        onError: ({ error }) => {
          outcome.reject(error);
        },
        onAbort: () => {
          outcome.reject(sdkSignal.reason);
        },
      });
      const consumeSdk = async (): Promise<Error | undefined> => {
        try {
          await streamed.text;
          return undefined;
        } catch (error) {
          outcome.reject(error);
          return error instanceof Error ? error : new Error('SDK stream failed', { cause: error });
        }
      };
      const sdkCompletion = consumeSdk();
      const response = streamed.toUIMessageStreamResponse();
      const admitted = await outcome.promise;
      if (admitted.state !== 'streaming') {
        await response.body?.cancel();
        return admitted;
      }
      const complete = async (): Promise<void> => {
        const [, sdkError] = await Promise.all([admitted.completion, sdkCompletion]);
        if (sdkError) {
          throw sdkError;
        }
      };
      return {
        ...admitted,
        response,
        completion: complete(),
      };
    } finally {
      signal.removeEventListener('abort', abortBeforeAdmission);
    }
  }
}
