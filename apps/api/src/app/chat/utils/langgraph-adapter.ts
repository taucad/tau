/* eslint-disable max-depth -- TODO: fix this */
import type { ServerResponse } from 'node:http';
import type { IterableReadableStream } from '@langchain/core/dist/utils/stream';
import { formatDataStreamPart, pipeDataStreamToResponse } from 'ai';
import type { DataStreamWriter } from 'ai';
import type { StreamEvent } from '@langchain/core/tracers/log_stream.js';
import { generatePrefixedId, idPrefix } from '../../utils/id.js';
import type { ChatUsageTokens } from '../chat-schema.js';
import { processContent } from './process-content.js';
import type {
  LangGraphEventName,
  TypedStreamEvent,
  ChatModelStreamEvent,
  ChatModelEndEvent,
  ToolStartEvent,
  ToolEndEvent,
} from './langgraph-types.js';

/**
 * Enhanced DataStream with a convenient write method for streaming content.
 */
export type EnhancedDataStreamWriter = DataStreamWriter & {
  /**
   * Formats and writes a part to the data stream.
   * @param arguments_ - The arguments to pass to formatDataStreamPart.
   * @returns The formatted data stream part.
   */
  writePart: typeof formatDataStreamPart;
};

/**
 * Callbacks for the LangGraphAdapter to handle different events.
 */
export type LangGraphAdapterCallbacks = {
  /**
   * Called when a chat model streams content.
   * @param parameters - The parameters for the callback.
   * @param parameters.dataStream - The enhanced data stream writer.
   * @param parameters.content - The content being streamed.
   * @param parameters.type - The type of content being streamed.
   */
  onChatModelStream?: (parameters: {
    dataStream: EnhancedDataStreamWriter;
    content: string | unknown[];
    type: string;
  }) => void;

  /**
   * Called when a chat model starts generating content.
   * @param parameters - The parameters for the callback.
   * @param parameters.dataStream - The enhanced data stream writer.
   * @param parameters.messageId - The ID of the message being generated.
   */
  onChatModelStart?: (parameters: { dataStream: EnhancedDataStreamWriter; messageId: string }) => void;

  /**
   * Called when a chat model finishes generating content.
   * @param parameters - The parameters for the callback.
   * @param parameters.dataStream - The enhanced data stream writer.
   * @param parameters.modelId - The ID of the model that generated the content.
   * @param parameters.usageTokens - Token usage information.
   */
  onChatModelEnd?: (parameters: {
    dataStream: EnhancedDataStreamWriter;
    modelId: string;
    usageTokens: ChatUsageTokens;
  }) => void;

  /**
   * Called when a tool starts executing.
   * @param parameters - The parameters for the callback.
   * @param parameters.dataStream - The enhanced data stream writer.
   * @param parameters.toolCallId - The ID of the tool call.
   * @param parameters.toolName - The name of the tool being called.
   * @param parameters.args - The arguments passed to the tool.
   */
  onToolStart?: (parameters: {
    dataStream: EnhancedDataStreamWriter;
    toolCallId: string;
    toolName: string;
    args: unknown;
  }) => void;

  /**
   * Called when a tool finishes executing.
   * @param parameters - The parameters for the callback.
   * @param parameters.dataStream - The enhanced data stream writer.
   * @param parameters.toolCallId - The ID of the tool call.
   * @param parameters.toolName - The name of the tool that was called.
   * @param parameters.result - The result returned by the tool.
   */
  onToolEnd?: (parameters: {
    dataStream: EnhancedDataStreamWriter;
    toolCallId: string;
    toolName: string;
    result: unknown;
  }) => void;

  /**
   * Called when token usage is updated.
   * @param parameters - The parameters for the callback.
   * @param parameters.modelId - The ID of the model.
   * @param parameters.usageTokens - Token usage information.
   */
  onUsageUpdate?: (parameters: { modelId: string; usageTokens: ChatUsageTokens }) => void;

  /**
   * Called when a message is completed.
   * @param parameters - The parameters for the callback.
   * @param parameters.dataStream - The enhanced data stream writer.
   * @param parameters.modelId - The ID of the model.
   * @param parameters.usageTokens - Token usage information.
   */
  onMessageComplete?: (parameters: {
    dataStream: EnhancedDataStreamWriter;
    modelId: string;
    usageTokens: ChatUsageTokens;
  }) => void;

  /**
   * Called when an error occurs.
   * @param parameters - The parameters for the callback.
   * @param parameters.error - The error that occurred.
   * @returns An error message to send to the client.
   */
  onError?: (parameters: { error: unknown }) => string;

  /**
   * Called for any event.
   * @param parameters - The parameters for the callback.
   * @param parameters.event - The event that occurred.
   * @param parameters.data - The data associated with the event.
   */
  onEvent?: (parameters: { event: LangGraphEventName; data: unknown }) => void;
};

/**
 * Options for the LangGraphAdapter.
 */
export type LangGraphAdapterOptions = {
  /**
   * The server response object to write to.
   */
  response: ServerResponse;
  /** The ID of the model being used. */
  modelId: string;
  /**
   * Optional callbacks for different events.
   *
   * The callbacks are called when the corresponding event is emitted by LangGraph.
   */
  callbacks?: LangGraphAdapterCallbacks;
  /**
   * Optional mapping of LangChain tool names to display names.
   *
   * The display names are shown in the UI instead of the tool names.
   */
  toolTypeMap?: Record<string, string>;
  /**
   * Optional parsers for tool results by tool name. This can be helpful
   * when the tool results are not in the expected format.
   */
  parseToolResults?: Partial<Record<string, (content: string) => unknown[]>>;
};

/**
 * Adapter for LangGraph to handle streaming responses.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- acceptable to keep the class contained.
export class LangGraphAdapter {
  /**
   * Pipes a LangGraph stream to a data stream response.
   * @param stream - The LangGraph stream.
   * @param options - Options for the adapter.
   */
  public static toDataStreamResponse(
    untypedStream: IterableReadableStream<StreamEvent>,
    options: LangGraphAdapterOptions,
  ): void {
    const stream = untypedStream as IterableReadableStream<TypedStreamEvent>;
    const { response, modelId, callbacks = {}, toolTypeMap = {}, parseToolResults } = options;

    response.setHeader('x-vercel-ai-data-stream', 'v1');
    pipeDataStreamToResponse(response, {
      // eslint-disable-next-line complexity -- acceptable to keep the function contained.
      execute: async (rawDataStream) => {
        // Create enhanced data stream
        const dataStream = this.createDataStreamWriter(rawDataStream);

        const id = generatePrefixedId(idPrefix.message);

        // Keep reasoning state in a mutable object to avoid closure issues
        const reasoningState = {
          thinkingBuffer: '',
          isReasoning: false,
        };

        const totalUsageTokens = {
          inputTokens: 0,
          outputTokens: 0,
          cachedReadTokens: 0,
          cachedWriteTokens: 0,
        } satisfies ChatUsageTokens;

        for await (const streamEvent of stream) {
          if (callbacks.onEvent) {
            callbacks.onEvent({ event: streamEvent.event, data: streamEvent.data });
          }

          // Since we're using TypedStreamEvent, we can directly check the event type
          switch (streamEvent.event) {
            case 'on_chat_model_stream': {
              this.handleChatModelStream({
                streamEvent,
                dataStream,
                callbacks,
                reasoningState,
              });
              break;
            }

            case 'on_chat_model_start': {
              this.handleChatModelStart({
                messageId: id,
                dataStream,
                callbacks,
              });
              break;
            }

            case 'on_chat_model_end': {
              this.handleChatModelEnd({
                streamEvent,
                dataStream,
                callbacks,
                modelId,
                totalUsageTokens,
              });
              break;
            }

            case 'on_tool_start': {
              this.handleToolStart({
                streamEvent,
                dataStream,
                callbacks,
                toolTypeMap,
              });
              break;
            }

            case 'on_tool_end': {
              this.handleToolEnd({
                streamEvent,
                dataStream,
                callbacks,
                toolTypeMap,
                parseToolResults,
              });
              break;
            }

            case 'on_tool_stream': {
              // TODO: Implement tool streaming
              break;
            }

            case 'on_chain_start':
            case 'on_chain_stream':
            case 'on_chain_end': {
              // No-op: These events are not supported by the AI SDK
              break;
            }

            case 'on_llm_start':
            case 'on_llm_stream':
            case 'on_llm_end': {
              // No-op: These events are not supported by the AI SDK
              break;
            }

            case 'on_prompt_start':
            case 'on_prompt_stream':
            case 'on_prompt_end': {
              // No-op: These events are not supported by the AI SDK
              break;
            }

            case 'on_parser_start':
            case 'on_parser_stream':
            case 'on_parser_end': {
              // No-op: These events are not supported by the AI SDK
              break;
            }

            // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check for all event types
            default: {
              const unknownEvent: never = streamEvent;
              throw new Error(`Unknown event: ${JSON.stringify(unknownEvent)}`);
            }
          }
        }

        callbacks.onMessageComplete?.({ dataStream, modelId, usageTokens: totalUsageTokens });

        // Write finish message
        dataStream.writePart('finish_message', {
          finishReason: 'stop',
          usage: {
            promptTokens: totalUsageTokens.inputTokens,
            completionTokens: totalUsageTokens.outputTokens,
          },
        });
      },
      onError(error) {
        return callbacks.onError ? callbacks.onError({ error }) : 'An error occurred while processing the request';
      },
    });
  }

  /**
   * Handles the 'onChatModelStream' event from LangGraph.
   */

  // eslint-disable-next-line complexity -- acceptable to keep the function contained.
  private static handleChatModelStream(parameters: {
    streamEvent: ChatModelStreamEvent;
    dataStream: EnhancedDataStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
    reasoningState: { thinkingBuffer: string; isReasoning: boolean };
  }): void {
    const { streamEvent, dataStream, callbacks, reasoningState } = parameters;

    if (streamEvent.data.chunk.content) {
      const streamedContent = streamEvent.data.chunk.content;

      if (typeof streamedContent === 'string') {
        // Process string content to detect reasoning tags
        const processedContent = processContent(
          streamedContent,
          reasoningState.thinkingBuffer,
          reasoningState.isReasoning,
        );
        const { content } = processedContent;
        const { type } = processedContent;

        // Update state after processing
        reasoningState.thinkingBuffer = processedContent.buffer;
        reasoningState.isReasoning = processedContent.isReasoning;

        // Empty content can sometimes be present, so we check for it and only write if it's present
        // to avoid writing empty parts to the data stream.
        if (content) {
          // Write to data stream
          dataStream.writePart(type, content);

          // Call callback if provided
          callbacks.onChatModelStream?.({ dataStream, content, type });
        }
      } else if (Array.isArray(streamedContent) && streamedContent.length > 0) {
        // Handle streaming for "complex" content types, such as Anthropic
        for (const part of streamedContent) {
          const complexType = part.type;

          switch (complexType) {
            case 'text': {
              const textPart = part;
              if (textPart.text === undefined) {
                throw new Error('Text not found in part: ' + JSON.stringify(part));
              } else if (textPart.text === '') {
                // No-op: Sometimes empty strings are present
                // We don't need to write them to the data stream.
              } else {
                dataStream.writePart('text', textPart.text);
                callbacks.onChatModelStream?.({ dataStream, content: textPart.text, type: 'text' });
              }

              break;
            }

            case 'thinking': {
              if (part.thinking === '') {
                // No-op: Sometimes empty strings are present
                // We don't need to write them to the data stream.
              } else if (part.thinking !== undefined) {
                dataStream.writePart('reasoning', part.thinking);
                callbacks.onChatModelStream?.({ dataStream, content: part.thinking, type: 'reasoning' });
              } else if (part.signature === undefined) {
                throw new Error('Thinking not found in part: ' + JSON.stringify(part));
              } else {
                dataStream.writePart('reasoning_signature', { signature: part.signature });
                callbacks.onChatModelStream?.({
                  dataStream,
                  content: [{ signature: part.signature }],
                  type: 'reasoning_signature',
                });
              }

              break;
            }

            case 'redacted_thinking': {
              if (part.data === undefined) {
                throw new Error('Redacted thinking not found in part: ' + JSON.stringify(part));
              } else {
                dataStream.writePart('redacted_reasoning', { data: part.data });
                callbacks.onChatModelStream?.({
                  dataStream,
                  content: [{ data: part.data }],
                  type: 'redacted_reasoning',
                });
              }

              break;
            }

            case 'input_json_delta':
            case 'tool_use': {
              // No-op
              break;
            }

            // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check for all part types
            default: {
              const unknownPart: never = part;
              throw new Error(`Unknown part type: ${String(unknownPart)}`);
            }
          }
        }
      } else if (Array.isArray(streamedContent) && streamedContent.length === 0) {
        // No-op, sometimes empty arrays are present
      } else {
        throw new Error('Unknown content type: ' + JSON.stringify(streamedContent));
      }
    }
  }

  /**
   * Handles the 'onChatModelStart' event from LangGraph.
   */
  private static handleChatModelStart(parameters: {
    messageId: string;
    dataStream: EnhancedDataStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
  }): void {
    const { messageId, dataStream, callbacks } = parameters;

    dataStream.writePart('start_step', {
      messageId,
    });

    callbacks.onChatModelStart?.({ dataStream, messageId });
  }

  /**
   * Handles the 'onChatModelEnd' event from LangGraph.
   */
  private static handleChatModelEnd(parameters: {
    streamEvent: ChatModelEndEvent;
    dataStream: EnhancedDataStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
    modelId: string;
    totalUsageTokens: ChatUsageTokens;
  }): void {
    const { streamEvent, dataStream, callbacks, modelId, totalUsageTokens } = parameters;

    const usageTokens = {
      inputTokens: streamEvent.data.output.usage_metadata.input_tokens ?? 0,
      outputTokens: streamEvent.data.output.usage_metadata.output_tokens ?? 0,
      cachedReadTokens: streamEvent.data.output.usage_metadata.input_token_details?.cache_read ?? 0,
      cachedWriteTokens: streamEvent.data.output.usage_metadata.input_token_details?.cache_creation ?? 0,
    } satisfies ChatUsageTokens;

    // Update totals
    totalUsageTokens.inputTokens += usageTokens.inputTokens;
    totalUsageTokens.outputTokens += usageTokens.outputTokens;
    totalUsageTokens.cachedReadTokens += usageTokens.cachedReadTokens;
    totalUsageTokens.cachedWriteTokens += usageTokens.cachedWriteTokens;

    dataStream.writePart('finish_step', {
      finishReason: 'stop',
      usage: { promptTokens: usageTokens.inputTokens, completionTokens: usageTokens.outputTokens },
      isContinued: false,
    });

    callbacks.onChatModelEnd?.({ dataStream, modelId, usageTokens });
    callbacks.onUsageUpdate?.({ modelId, usageTokens });
  }

  /**
   * Handles the 'onToolStart' event from LangGraph.
   */
  private static handleToolStart(parameters: {
    streamEvent: ToolStartEvent;
    dataStream: EnhancedDataStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
    toolTypeMap: Record<string, string>;
  }): void {
    const { streamEvent, dataStream, callbacks, toolTypeMap } = parameters;

    const toolCallId = this.extractToolCallId(streamEvent);

    // Get tool name from map or use raw name
    const toolName = toolTypeMap[streamEvent.name] ?? streamEvent.name;
    const { input } = streamEvent.data.input;

    let args: unknown;
    try {
      // Langchain always outputs the `input` as an object containing a string under the `input` key.
      // Attempt to parse the args as JSON if they're a string.
      // This ensures the AI SDK client can always access the input as a JSON object.
      args = JSON.parse(input as string);
    } catch {
      // The args were a non-complex JSON value.
      // AI SDK requires the args to be a JSON object, so we add a simple wrapper.
      args = { input };
    }

    dataStream.writePart('tool_call', {
      toolCallId,
      toolName,
      args,
    });

    callbacks.onToolStart?.({ dataStream, toolCallId, toolName, args });
  }

  /**
   * Handles the 'onToolEnd' event from LangGraph.
   */
  private static handleToolEnd(parameters: {
    streamEvent: ToolEndEvent;
    dataStream: EnhancedDataStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
    toolTypeMap: Record<string, string>;
    parseToolResults?: Partial<Record<string, (content: string) => unknown[]>>;
  }): void {
    const { streamEvent, dataStream, callbacks, toolTypeMap, parseToolResults } = parameters;

    // Get tool name from map or use raw name
    const toolName = toolTypeMap[streamEvent.name] ?? streamEvent.name;
    const { content } = streamEvent.data.output;

    // Parse tool results using the configurable parser with tool name.
    // If no parser is configured, use the content as is.
    const toolParser = parseToolResults?.[toolName];
    const results = toolParser ? toolParser(content) : content;

    const toolCallId = this.extractToolCallId(streamEvent);

    // Convert any result to a serializable value
    // If it's null, undefined, or an empty object, convert to empty string
    let result: unknown = results;
    if (result === null || result === undefined) {
      result = '';
    } else if (typeof result === 'object' && Object.keys(result).length === 0) {
      result = '';
    }

    dataStream.writePart('tool_result', {
      toolCallId,
      result,
    });

    callbacks.onToolEnd?.({ dataStream, toolCallId, toolName, result });
  }

  /**
   * Extracts a tool call ID from a stream event.
   */
  private static extractToolCallId(streamEvent: ToolStartEvent | ToolEndEvent): string {
    // A LangGraph UUID for the tool call.
    // Can take the following format:
    // - 'tools:900ad182-0310-5937-82e6-c927691bcd81'
    // - 'research_expert:5cd6c905-9671-5bb3-8581-227ef80bbb48|tools:900ad182-0310-5937-82e6-c927691bcd81'
    // The unique part that joins the tool call and result is the last part after the final colon, so we extract that.
    // We remove redundant dashes and use it as the seed for a new ID, preserving entropy.
    const checkpointNs = streamEvent.metadata.langgraph_checkpoint_ns;
    const rawId = checkpointNs.split(':').at(-1)?.replaceAll('-', '');
    if (rawId === undefined) {
      throw new Error('Tool call ID not found in stream event: ' + JSON.stringify(streamEvent));
    }

    return generatePrefixedId(idPrefix.toolCall, rawId);
  }

  /**
   * Creates an enhanced data stream writer.
   */
  private static createDataStreamWriter(dataStream: DataStreamWriter): EnhancedDataStreamWriter {
    return Object.assign(dataStream, {
      writePart(...arguments_: Parameters<typeof formatDataStreamPart>) {
        const part = formatDataStreamPart(...arguments_);
        dataStream.write(part);

        return part;
      },
    });
  }
}
