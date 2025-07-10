/* eslint-disable max-depth -- TODO: fix this */
import type { IterableReadableStream } from '@langchain/core/utils/stream';
import { formatDataStreamPart, createDataStream } from 'ai';
import type { DataStreamWriter } from 'ai';
import type { StreamEvent as LangchainStreamEvent } from '@langchain/core/tracers/log_stream';
import { generatePrefixedId } from '~/utils/id.utils.js';
import type { ChatUsageTokens } from '~/api/chat/chat.schema.js';
import { processContent } from '~/api/chat/utils/process-content.js';
import type {
  StreamEvent,
  ChatModelStreamEvent,
  ChatModelEndEvent,
  ToolStartEvent,
  ToolEndEvent,
} from '~/api/chat/utils/langgraph-types.js';
import { idPrefix } from '~/constants/id.constants.js';

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
   * @param error - The error that occurred.
   * @returns An error message to send to the client.
   */
  onError?: (error: unknown) => string;

  /**
   * Called for any event.
   * @param streamEvent - The event that occurred.
   */
  onEvent?: (streamEvent: StreamEvent) => void;
};

/**
 * Options for the LangGraphAdapter.
 */
export type LangGraphAdapterOptions = {
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
   * Pipes a LangGraph stream to a data stream.
   * @param stream - The LangGraph stream.
   * @param options - Options for the adapter.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- the response is a complex type so we'll just infer it.
  public static toDataStream(stream: IterableReadableStream<LangchainStreamEvent>, options: LangGraphAdapterOptions) {
    const typedStream = stream as IterableReadableStream<StreamEvent>;
    const { modelId, callbacks = {}, toolTypeMap = {}, parseToolResults } = options;

    const dataStream = createDataStream({
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

        const toolCallState = {
          currentToolCallId: '',
          currentToolName: '',
        };

        const totalUsageTokens = {
          inputTokens: 0,
          outputTokens: 0,
          cachedReadTokens: 0,
          cachedWriteTokens: 0,
        } satisfies ChatUsageTokens;

        for await (const streamEvent of typedStream) {
          if (callbacks.onEvent) {
            callbacks.onEvent(streamEvent);
          }

          // Since we're using TypedStreamEvent, we can directly check the event type
          switch (streamEvent.event) {
            case 'on_chat_model_stream': {
              this.handleChatModelStream({
                streamEvent,
                dataStream,
                callbacks,
                reasoningState,
                toolCallState,
                toolTypeMap,
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
                toolCallState,
              });
              break;
            }

            case 'on_tool_end': {
              this.handleToolEnd({
                streamEvent,
                dataStream,
                callbacks,
                parseToolResults,
                toolCallState,
              });
              break;
            }

            case 'on_tool_stream': {
              /** No-op - this event was removed in v0.2, on_tool_end is used instead.
               * @see https://js.langchain.com/docs/versions/v0_2/migrating_astream_events/#removed-on_tool_stream
               */
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

            case 'on_custom_event': {
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
        return callbacks.onError ? callbacks.onError(error) : 'An error occurred while processing the request';
      },
    });

    return dataStream;
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
    toolCallState: { currentToolCallId: string; currentToolName: string };
    toolTypeMap: Record<string, string>;
  }): void {
    const { streamEvent, dataStream, callbacks, reasoningState, toolCallState, toolTypeMap } = parameters;

    if (streamEvent.data.chunk.tool_calls.length > 0) {
      const toolCall = streamEvent.data.chunk.tool_calls[0]!;
      const originalToolCallId = toolCall.id;
      if (originalToolCallId) {
        const toolCallId = generatePrefixedId(idPrefix.toolCall);
        toolCallState.currentToolCallId = toolCallId;
        const toolName = toolTypeMap[toolCall.name] ?? toolCall.name;
        if (!toolName) {
          throw new Error('Tool name not found in event: ' + JSON.stringify(streamEvent));
        }

        toolCallState.currentToolName = toolName;
        dataStream.writePart('tool_call_streaming_start', {
          toolCallId,
          toolName,
        });
      }
    } else if (streamEvent.data.chunk.tool_call_chunks.length > 0) {
      // If tool call chunks are present, we need to handle them separately.
      const toolCallChunk = streamEvent.data.chunk.tool_call_chunks[0]!;
      if (toolCallState.currentToolCallId) {
        dataStream.writePart('tool_call_delta', {
          toolCallId: toolCallState.currentToolCallId,
          argsTextDelta: toolCallChunk.args,
        });
      } else {
        throw new Error('Attempted to write tool call delta without a current tool call ID');
      }
    } else if (streamEvent.data.chunk.content) {
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
      inputTokens: streamEvent.data.output.usage_metadata.input_tokens,
      outputTokens: streamEvent.data.output.usage_metadata.output_tokens,
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
    toolCallState: { currentToolCallId: string; currentToolName: string };
  }): void {
    const { streamEvent, dataStream, callbacks, toolCallState } = parameters;

    const toolCallId = toolCallState.currentToolCallId;
    const toolName = toolCallState.currentToolName;

    // Get tool name from map or use raw name
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
    parseToolResults?: Partial<Record<string, (content: string) => unknown[]>>;
    toolCallState: { currentToolCallId: string; currentToolName: string };
  }): void {
    const { streamEvent, dataStream, callbacks, parseToolResults, toolCallState } = parameters;

    // Get tool name from map or use raw name
    const toolName = toolCallState.currentToolName;
    const { content } = streamEvent.data.output;
    const toolCallId = toolCallState.currentToolCallId;
    toolCallState.currentToolCallId = ''; // Reset the current tool call ID
    toolCallState.currentToolName = ''; // Reset the current tool name

    // Parse tool results using the configurable parser with tool name.
    // If no parser is configured, use the content as is.
    const toolParser = parseToolResults?.[toolName];
    const results = toolParser ? toolParser(content) : content;

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
