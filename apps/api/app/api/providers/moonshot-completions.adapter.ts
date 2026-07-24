/* eslint-disable @typescript-eslint/naming-convention -- Moonshot/OpenAI and LangChain wire contracts use snake_case. */
import {
  ChatOpenAICompletions,
  convertCompletionsDeltaToBaseMessageChunk,
  convertCompletionsMessageToBaseMessage,
  convertMessagesToCompletionsMessageParams,
  convertOpenAICompletionsStream,
} from '@langchain/openai';
import type { BaseChatOpenAIFields, OpenAIClient } from '@langchain/openai';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { BaseMessage, UsageMetadata } from '@langchain/core/messages';
import type { ChatModelStreamEvent } from '@langchain/core/language_models/event';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ChatGeneration, ChatResult } from '@langchain/core/outputs';

export type TauChatMoonshotCompletionsInput = BaseChatOpenAIFields;

type MoonshotUsage = OpenAIClient.Completions.CompletionUsage & {
  readonly cached_tokens?: number;
};

type MoonshotCompletion = Omit<OpenAIClient.Chat.Completions.ChatCompletion, 'usage'> & {
  readonly usage?: MoonshotUsage;
};

type MoonshotCompletionChunk = Omit<OpenAIClient.Chat.Completions.ChatCompletionChunk, 'usage'> & {
  readonly usage?: MoonshotUsage;
};

type MoonshotAssistantMessage = OpenAIClient.Chat.Completions.ChatCompletionAssistantMessageParam & {
  readonly reasoning_content?: string;
};

type MoonshotResponseMessage = OpenAIClient.Chat.Completions.ChatCompletionMessage & {
  readonly reasoning_content?: string;
};

const validateTokenCount = (name: string, value: number | undefined): void => {
  if (value === undefined) {
    return;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Moonshot usage ${name} must be a non-negative safe integer`);
  }
};

const normalizeMoonshotUsage = (usage: MoonshotUsage | undefined): MoonshotUsage | undefined => {
  if (!usage) {
    return undefined;
  }

  validateTokenCount('prompt_tokens', usage.prompt_tokens);
  validateTokenCount('completion_tokens', usage.completion_tokens);
  validateTokenCount('total_tokens', usage.total_tokens);
  const cachedTokens = usage.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens;
  validateTokenCount('cached_tokens', cachedTokens);
  return {
    ...usage,
    ...(cachedTokens === undefined
      ? {}
      : {
          prompt_tokens_details: {
            ...usage.prompt_tokens_details,
            cached_tokens: cachedTokens,
          },
        }),
  };
};

const usageMetadataFromMoonshot = (usage: MoonshotUsage | undefined): UsageMetadata | undefined => {
  if (!usage) {
    return undefined;
  }

  const cachedTokens = usage.prompt_tokens_details?.cached_tokens;
  return {
    input_tokens: usage.prompt_tokens,
    output_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
    ...(cachedTokens === undefined ? {} : { input_token_details: { cache_read: cachedTokens } }),
    ...(usage.completion_tokens_details?.reasoning_tokens === undefined
      ? {}
      : { output_token_details: { reasoning: usage.completion_tokens_details.reasoning_tokens } }),
  };
};

const reasoningFromMessage = (message: BaseMessage): string | undefined => {
  if (!AIMessage.isInstance(message)) {
    return undefined;
  }

  if (message.response_metadata.output_version === 'v1' && Array.isArray(message.content)) {
    const reasoning = message.content
      .flatMap((block) => (block.type === 'reasoning' && 'reasoning' in block ? [block['reasoning']] : []))
      .filter((value): value is string => typeof value === 'string')
      .join('');
    if (reasoning.length > 0) {
      return reasoning;
    }
  }

  const legacyReasoning = message.additional_kwargs['reasoning_content'];
  return typeof legacyReasoning === 'string' && legacyReasoning.length > 0 ? legacyReasoning : undefined;
};

const serializeMoonshotMessages = (
  messages: BaseMessage[],
  model: string,
): OpenAIClient.Chat.Completions.ChatCompletionMessageParam[] =>
  messages.flatMap((message) => {
    const converted = convertMessagesToCompletionsMessageParams({ messages: [message], model });
    const reasoningContent = reasoningFromMessage(message);
    if (reasoningContent === undefined) {
      return converted;
    }

    return converted.map((parameter) =>
      parameter.role === 'assistant'
        ? ({ ...parameter, reasoning_content: reasoningContent } satisfies MoonshotAssistantMessage)
        : parameter,
    );
  });

const convertMoonshotMessage = (
  message: MoonshotResponseMessage,
  rawResponse: MoonshotCompletion,
  usage: MoonshotUsage | undefined,
): AIMessage => {
  const converted = convertCompletionsMessageToBaseMessage({
    message,
    rawResponse: rawResponse as OpenAIClient.Chat.Completions.ChatCompletion,
  });
  if (!AIMessage.isInstance(converted)) {
    throw new TypeError(`Moonshot returned unsupported message role: ${message.role}`);
  }

  const content: Array<{ type: 'reasoning'; reasoning: string } | { type: 'text'; text: string }> = [];
  if (message.reasoning_content) {
    content.push({ type: 'reasoning', reasoning: message.reasoning_content });
  }
  if (typeof message.content === 'string' && message.content.length > 0) {
    content.push({ type: 'text', text: message.content });
  }

  return new AIMessage({
    id: rawResponse.id,
    content,
    tool_calls: converted.tool_calls,
    invalid_tool_calls: converted.invalid_tool_calls,
    additional_kwargs: converted.additional_kwargs,
    usage_metadata: usageMetadataFromMoonshot(usage),
    response_metadata: {
      ...converted.response_metadata,
      model_provider: 'moonshot',
      model_name: rawResponse.model,
      output_version: 'v1',
      ...(rawResponse.usage === undefined ? {} : { usage: rawResponse.usage }),
    },
  });
};

const convertMoonshotDelta = (
  delta: Record<string, unknown>,
  rawResponse: MoonshotCompletionChunk,
  defaultRole?: OpenAIClient.Chat.ChatCompletionRole,
): AIMessageChunk => {
  const converted = convertCompletionsDeltaToBaseMessageChunk({
    delta,
    rawResponse: rawResponse as OpenAIClient.Chat.Completions.ChatCompletionChunk,
    defaultRole,
  });
  if (!AIMessageChunk.isInstance(converted)) {
    const role = typeof delta['role'] === 'string' ? delta['role'] : (defaultRole ?? 'unknown');
    throw new TypeError(`Moonshot returned unsupported stream role: ${role}`);
  }

  const content: Array<{ type: 'reasoning'; reasoning: string; index: 0 } | { type: 'text'; text: string; index: 1 }> =
    [];
  if (typeof delta['reasoning_content'] === 'string' && delta['reasoning_content'].length > 0) {
    content.push({ type: 'reasoning', reasoning: delta['reasoning_content'], index: 0 });
  }
  if (typeof delta['content'] === 'string' && delta['content'].length > 0) {
    content.push({ type: 'text', text: delta['content'], index: 1 });
  }

  return new AIMessageChunk({
    id: converted.id,
    content,
    tool_call_chunks: converted.tool_call_chunks,
    additional_kwargs: converted.additional_kwargs,
    response_metadata: {
      ...converted.response_metadata,
      model_provider: 'moonshot',
      output_version: 'v1',
    },
  });
};

/** OpenAI-compatible Kimi transport with Moonshot's reasoning replay and usage deltas. */
export class TauChatMoonshotCompletions extends ChatOpenAICompletions {
  public constructor(fields?: TauChatMoonshotCompletionsInput) {
    super(fields);
  }

  public override invocationParams(
    options?: this['ParsedCallOptions'],
    extra?: { streaming?: boolean },
  ): ReturnType<ChatOpenAICompletions['invocationParams']> {
    const parameters = super.invocationParams(options, extra);
    for (const name of [
      'temperature',
      'top_p',
      'frequency_penalty',
      'presence_penalty',
      'n',
      'max_tokens',
      'max_completion_tokens',
    ]) {
      Reflect.deleteProperty(parameters, name);
    }
    const reasoningEffort = options?.reasoning?.effort ?? this.reasoning?.effort;
    return {
      ...parameters,
      ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
    };
  }

  public override async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    options.signal?.throwIfAborted();
    const parameters = this.invocationParams(options);

    if (parameters.stream) {
      const chunksByIndex = new Map<number, ChatGenerationChunk>();
      for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
        const index = (chunk.generationInfo?.['completion'] as number | undefined) ?? 0;
        const previous = chunksByIndex.get(index);
        // oxlint-disable-next-line unicorn/prefer-spread -- ChatGenerationChunk.concat merges message and generation metadata.
        chunksByIndex.set(index, previous?.concat(chunk) ?? chunk);
      }
      return {
        generations: [...chunksByIndex.entries()].sort(([left], [right]) => left - right).map(([, chunk]) => chunk),
      };
    }

    const response = (await this.completionWithRetry(
      {
        ...parameters,
        messages: serializeMoonshotMessages(messages, this.model),
        stream: false,
      },
      { signal: options.signal, ...options.options },
    )) as MoonshotCompletion;
    const usage = normalizeMoonshotUsage(response.usage);
    const generations: ChatGeneration[] = response.choices.map((choice) => {
      const message = convertMoonshotMessage(choice.message as MoonshotResponseMessage, response, usage);
      return {
        text: typeof choice.message.content === 'string' ? choice.message.content : '',
        message,
        generationInfo: {
          finish_reason: choice.finish_reason,
          ...(choice.logprobs === null ? {} : { logprobs: choice.logprobs }),
        },
      };
    });
    return {
      generations,
      llmOutput: {
        tokenUsage: usageMetadataFromMoonshot(usage),
      },
    };
  }

  public override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const stream = (await this.completionWithRetry(
      {
        ...this.invocationParams(options, { streaming: true }),
        messages: serializeMoonshotMessages(messages, this.model),
        stream: true,
      },
      options,
    )) as AsyncIterable<MoonshotCompletionChunk>;
    let defaultRole: OpenAIClient.Chat.ChatCompletionRole | undefined;
    let rawUsage: MoonshotUsage | undefined;

    for await (const data of stream) {
      if (options.signal?.aborted) {
        return;
      }
      if (data.usage) {
        rawUsage = data.usage;
      }
      const choice = data.choices[0];
      if (!choice?.delta) {
        continue;
      }

      const chunk = convertMoonshotDelta(choice.delta as unknown as Record<string, unknown>, data, defaultRole);
      defaultRole = choice.delta.role ?? defaultRole;
      const indices = { prompt: options.promptIndex ?? 0, completion: choice.index };
      const generation = new ChatGenerationChunk({
        message: chunk,
        text: typeof choice.delta.content === 'string' ? choice.delta.content : '',
        generationInfo: {
          ...indices,
          ...(choice.finish_reason === null ? {} : { finish_reason: choice.finish_reason }),
        },
      });
      yield generation;
      await runManager?.handleLLMNewToken(generation.text, indices, undefined, undefined, undefined, {
        chunk: generation,
      });
    }

    const usage = normalizeMoonshotUsage(rawUsage);
    if (usage && rawUsage) {
      const generation = new ChatGenerationChunk({
        message: new AIMessageChunk({
          content: [],
          usage_metadata: usageMetadataFromMoonshot(usage),
          response_metadata: {
            model_provider: 'moonshot',
            output_version: 'v1',
            usage: rawUsage,
          },
        }),
        text: '',
      });
      yield generation;
      await runManager?.handleLLMNewToken('', { prompt: 0, completion: 0 }, undefined, undefined, undefined, {
        chunk: generation,
      });
    }
    if (options.signal?.aborted) {
      throw new Error('AbortError');
    }
  }

  public override async *_streamChatModelEvents(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatModelStreamEvent> {
    const stream = (await this.completionWithRetry(
      {
        ...this.invocationParams(options, { streaming: true }),
        messages: serializeMoonshotMessages(messages, this.model),
        stream: true,
      },
      options,
    )) as AsyncIterable<MoonshotCompletionChunk>;

    const abortable = async function* (): AsyncGenerator<MoonshotCompletionChunk> {
      for await (const chunk of stream) {
        if (options.signal?.aborted) {
          return;
        }
        const usage = normalizeMoonshotUsage(chunk.usage);
        yield usage === undefined ? chunk : { ...chunk, usage };
      }
    };

    yield* convertOpenAICompletionsStream(abortable(), {
      provider: 'moonshot',
      streamUsage: this.streamUsage,
    });
  }
}
/* eslint-enable @typescript-eslint/naming-convention -- end Moonshot/OpenAI and LangChain wire contracts. */
