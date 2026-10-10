import { createOpenAI } from '@ai-sdk/openai';
import { createUIMessageStream, createUIMessageStreamResponse, streamText } from 'ai';
import { Inject, Injectable } from '@nestjs/common';
import type { ModelMessage } from 'ai';
import { commitMessageGenerationSystemPrompt, projectNameGenerationSystemPrompt } from '@taucad/chat/prompts';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import type { LlmGatewayErrorType } from '#api/llm/llm-gateway.error.js';
import type {
  ModelInvocationResult,
  ModelInvocationService,
  ModelInvocationSurface,
} from '#api/llm/model-invocation.types.js';
import { modelInvocationServiceKey } from '#api/llm/model-invocation.types.js';

/**
 * Refusals a helper absorbs instead of surfacing (W6, W11a): an operator-paused route and a restricted account. Both
 * hold for the helper's one fixed route or for the whole account, so nothing the client can do changes them, and a
 * name is a courtesy rather than a prerequisite. Every other refusal still reaches the client as before.
 */
const absorbedHelperRefusals: ReadonlySet<LlmGatewayErrorType> = new Set<LlmGatewayErrorType>([
  'MODEL_ROUTE_PAUSED',
  'BILLING_ACCOUNT_RESTRICTED',
]);

const isAbsorbedHelperRefusal = (error: unknown): boolean => {
  if (!(error instanceof LlmGatewayError)) {
    return false;
  }
  const body = error.getResponse();
  const envelope = typeof body === 'object' && 'error' in body ? body.error : undefined;
  const type = typeof envelope === 'object' && envelope !== null && 'type' in envelope ? envelope.type : undefined;
  return typeof type === 'string' && absorbedHelperRefusals.has(type as LlmGatewayErrorType);
};

/**
 * A finished UI message with no text: the client reads an empty suggestion and keeps its default name, with no
 * error to show. Nothing was admitted, so there is no operation and nothing to settle.
 *
 * @returns The helper's unnamed result.
 */
const unnamedResult = (): ModelInvocationResult => ({
  state: 'streaming',
  response: createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'start' });
        writer.write({ type: 'finish' });
      },
    }),
  }),
  completion: Promise.resolve(),
});

/**
 * Best-effort receipt attribution for a helper turn: which project it was
 * generated for and which chat asked for it. Both are optional — a hint the
 * billing identity contract refuses is dropped at the boundary rather than
 * refusing a turn — and they travel as one parameter so adding the second did
 * not widen three already-long signatures.
 */
export type ChatGenerationHints = {
  readonly projectHint?: string | undefined;
  readonly chatHint?: string | undefined;
};

/** Runs the two API-hosted secondary generators through funded admission. */
@Injectable()
export class ChatService {
  public constructor(@Inject(modelInvocationServiceKey) private readonly invocations: ModelInvocationService) {}

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity
  public async getBuildNameGenerator(
    messages: ModelMessage[],
    userId: string,
    attemptKey: string,
    hints: ChatGenerationHints,
    signal: AbortSignal,
    onAdmitted?: (operationId: string) => void,
  ): Promise<ModelInvocationResult> {
    return this.generate(
      'project_name',
      projectNameGenerationSystemPrompt,
      messages,
      userId,
      attemptKey,
      hints,
      signal,
      onAdmitted,
    );
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity
  public async getCommitMessageGenerator(
    messages: ModelMessage[],
    userId: string,
    attemptKey: string,
    hints: ChatGenerationHints,
    signal: AbortSignal,
    onAdmitted?: (operationId: string) => void,
  ): Promise<ModelInvocationResult> {
    return this.generate(
      'commit_name',
      commitMessageGenerationSystemPrompt,
      messages,
      userId,
      attemptKey,
      hints,
      signal,
      onAdmitted,
    );
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- authenticated invocation identity
  private async generate(
    surface: ModelInvocationSurface,
    system: string,
    messages: ModelMessage[],
    authUserId: string,
    attemptKey: string,
    hints: ChatGenerationHints,
    signal: AbortSignal,
    onAdmitted?: (operationId: string) => void,
  ): Promise<ModelInvocationResult> {
    signal.throwIfAborted();
    const outcome = Promise.withResolvers<ModelInvocationResult>();
    const replayAbort = new AbortController();
    const sdkSignal = AbortSignal.any([signal, replayAbort.signal]);
    const abortBeforeAdmission = (): void => {
      outcome.reject(signal.reason);
    };
    signal.addEventListener('abort', abortBeforeAdmission, { once: true });
    let absorbed: ModelInvocationResult | undefined;
    const model = createOpenAI({
      // Credentials belong to the billed owner; SDK authorization never leaves this local fetch boundary.
      apiKey: 'billing-owned',
      fetch: async (_url, init) => {
        if (typeof init?.body !== 'string') {
          throw new TypeError('Expected a native Responses JSON request');
        }
        let result: ModelInvocationResult;
        try {
          result = await this.invocations.invoke({
            authUserId,
            surface,
            attempt: { version: 1, key: attemptKey },
            providerWire: 'openai-responses',
            body: JSON.parse(init.body) as unknown,
            priceHeaders: {},
            activity: surface === 'project_name' ? 'title' : 'commit',
            ...(hints.projectHint === undefined ? {} : { projectHint: hints.projectHint }),
            ...(hints.chatHint === undefined ? {} : { chatHint: hints.chatHint }),
            directPrompt: { system, messages, maximumOutputTokens: 64 },
            signal: sdkSignal,
            onAdmitted,
          });
        } catch (error) {
          if (isAbsorbedHelperRefusal(error)) {
            // Settle with no name before the SDK sees the refusal; stopping it is then only cleanup.
            absorbed = unnamedResult();
            outcome.resolve(absorbed);
            replayAbort.abort(error);
          }
          throw error;
        }
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
      if (admitted === absorbed || admitted.state !== 'streaming') {
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
