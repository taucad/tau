import {
  convertMessagesToResponsesInput,
  convertResponsesDeltaToChatGenerationChunk,
  convertResponsesMessageToAIMessage,
} from '@langchain/openai';
import { ChatXAIResponses } from '@langchain/xai';
import type {
  ChatXAIResponsesCallOptions,
  ChatXAIResponsesInput,
  XAIResponse,
  XAIResponsesCreateParams,
  XAIResponsesCreateParamsNonStreaming,
  XAIResponsesCreateParamsStreaming,
  XAIResponsesStreamEvent,
  XAIResponsesTool,
} from '@langchain/xai';
import type { AIMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { convertToOpenAITool, isLangChainTool } from '@langchain/core/utils/function_calling';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { Runnable } from '@langchain/core/runnables';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs';

export type TauChatXaiResponsesInput = ChatXAIResponsesInput & {
  readonly conversationId?: string;
};

type OpenAiResponse = Parameters<typeof convertResponsesMessageToAIMessage>[0];
type OpenAiResponseStreamEvent = Parameters<typeof convertResponsesDeltaToChatGenerationChunk>[0];

const modelProviderKey = 'model_provider';

const headerSafe = (value: string): string => value.replaceAll(/[\n\r]/g, '').slice(0, 200);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isResponseFunctionTool = (tool: Record<string, unknown>): boolean =>
  tool['type'] === 'function' &&
  typeof tool['name'] === 'string' &&
  typeof tool['parameters'] === 'object' &&
  tool['parameters'] !== null;

const formatToolForXaiResponses = (tool: BindToolsInput): XAIResponsesTool => {
  if (isLangChainTool(tool) && tool.extras?.['providerToolDefinition']) {
    return tool.extras['providerToolDefinition'] as unknown as XAIResponsesTool;
  }

  if (isRecord(tool) && typeof tool['type'] === 'string' && tool['type'] !== 'function') {
    return tool as unknown as XAIResponsesTool;
  }

  if (isRecord(tool) && isResponseFunctionTool(tool)) {
    return tool as unknown as XAIResponsesTool;
  }

  const openAiTool = convertToOpenAITool(tool);
  if (!isRecord(openAiTool) || !isRecord(openAiTool.function)) {
    return openAiTool as unknown as XAIResponsesTool;
  }

  const { function: functionDefinition, ...toolOptions } = openAiTool;
  const { description, name, parameters } = functionDefinition;
  return {
    ...toolOptions,
    type: 'function',
    name,
    description,
    parameters: isRecord(parameters) ? parameters : { type: 'object', properties: {} },
  } as unknown as XAIResponsesTool;
};

const retagProvider = <T extends Record<string, unknown> | undefined>(metadata: T): T => {
  if (metadata === undefined) {
    return metadata;
  }

  const nextMetadata = { ...metadata, [modelProviderKey]: 'xai' };
  return nextMetadata as T;
};

const extractText = (message: AIMessage | AIMessageChunk): string => {
  const { content } = message;
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .flatMap((block) => {
      if (!isRecord(block)) {
        return [];
      }
      const { text, type } = block as { readonly text?: unknown; readonly type?: unknown };
      if ((type === 'text' || type === 'output_text') && typeof text === 'string') {
        return [text];
      }
      return [];
    })
    .join('');
};

const isEmptyAssistantReplay = (item: Record<string, unknown>): boolean =>
  item['type'] === 'message' &&
  item['role'] === 'assistant' &&
  !item['id'] &&
  !item['phase'] &&
  (item['content'] === '' || (Array.isArray(item['content']) && item['content'].length === 0));

const normalizeXaiInput = (input: XAIResponsesCreateParams['input']): XAIResponsesCreateParams['input'] => {
  if (!Array.isArray(input)) {
    return input;
  }

  return input.flatMap((item) => (isRecord(item) && isEmptyAssistantReplay(item) ? [] : [item]));
};

const xaiInputFromMessages = (messages: BaseMessage[], model: string): XAIResponsesCreateParams['input'] =>
  normalizeXaiInput(
    convertMessagesToResponsesInput({
      messages,
      model,
      zdrEnabled: false,
    }) as unknown as XAIResponsesCreateParams['input'],
  );

const convertResponseToXaiMessage = (response: XAIResponse): AIMessage => {
  const message = convertResponsesMessageToAIMessage(response as unknown as OpenAiResponse);
  message.response_metadata = retagProvider(message.response_metadata);
  return message;
};

const convertEventToXaiChunk = (event: XAIResponsesStreamEvent): ChatGenerationChunk | undefined => {
  const chunk = convertResponsesDeltaToChatGenerationChunk(event as unknown as OpenAiResponseStreamEvent);
  if (!chunk) {
    return undefined;
  }

  chunk.message.response_metadata = retagProvider(chunk.message.response_metadata);
  return chunk;
};

export class TauChatXaiResponses extends ChatXAIResponses {
  public readonly conversationId?: string;

  public constructor(fields?: TauChatXaiResponsesInput) {
    const { conversationId, ...chatFields } = fields ?? {};
    super(chatFields);
    this.conversationId = conversationId;
  }

  public override bindTools(
    tools: BindToolsInput[],
    kwargs?: Partial<ChatXAIResponsesCallOptions>,
  ): Runnable<BaseLanguageModelInput, AIMessageChunk, ChatXAIResponsesCallOptions> {
    return this.withConfig({
      tools: tools.map((tool) => formatToolForXaiResponses(tool)),
      ...kwargs,
    });
  }

  public override async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    options.signal?.throwIfAborted();
    const invocationParams = this.invocationParams(options);
    const input = xaiInputFromMessages(messages, this.model);

    if (invocationParams.stream) {
      let finalChunk: ChatGenerationChunk | undefined;
      for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
        chunk.message.response_metadata = {
          ...chunk.generationInfo,
          ...chunk.message.response_metadata,
        };
        // oxlint-disable-next-line unicorn/prefer-spread -- ChatGenerationChunk.concat merges streamed chunks.
        finalChunk = finalChunk?.concat(chunk) ?? chunk;
      }

      return {
        generations: finalChunk ? [finalChunk] : [],
        llmOutput: { estimatedTokenUsage: (finalChunk?.message as AIMessageChunk | undefined)?.usage_metadata },
      };
    }

    const response = await this._makeRequest({
      input,
      ...invocationParams,
      stream: false,
    });
    const message = convertResponseToXaiMessage(response);
    return {
      generations: [
        {
          text: extractText(message),
          message,
        },
      ],
      llmOutput: {
        id: response.id,
        estimatedTokenUsage: message.usage_metadata,
      },
    };
  }

  public override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const invocationParams = this.invocationParams(options);
    const input = xaiInputFromMessages(messages, this.model);
    const stream = await this._makeRequest({
      input,
      ...invocationParams,
      stream: true,
    });

    for await (const event of stream) {
      if (options.signal?.aborted) {
        return;
      }
      const chunk = convertEventToXaiChunk(event);
      if (!chunk) {
        continue;
      }

      yield chunk;
      await runManager?.handleLLMNewToken(chunk.text || '', {
        prompt: 0,
        completion: 0,
      });
    }
  }

  protected override async _makeRequest(request: XAIResponsesCreateParamsNonStreaming): Promise<XAIResponse>;
  protected override async _makeRequest(
    request: XAIResponsesCreateParamsStreaming,
  ): Promise<AsyncIterable<XAIResponsesStreamEvent>>;
  protected override async _makeRequest(
    request: XAIResponsesCreateParams,
  ): Promise<XAIResponse | AsyncIterable<XAIResponsesStreamEvent>> {
    const url = `${this.baseURL}/responses`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    headers['Authorization'] = `Bearer ${this.apiKey}`;
    if (this.conversationId) {
      headers['x-grok-conv-id'] = headerSafe(this.conversationId);
    }

    if (request.stream) {
      return this._makeStreamingRequest(url, headers, request);
    }

    return this.caller.call(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`xAI API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }
      return (await response.json()) as XAIResponse;
    });
  }
}
