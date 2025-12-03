/* eslint-disable max-depth -- TODO: fix this */
import type { IterableReadableStream } from '@langchain/core/utils/stream';
import { createUIMessageStream } from 'ai';
import type { UIMessageStreamWriter } from 'ai';
import type { StreamEvent as LangchainStreamEvent } from '@langchain/core/tracers/log_stream';
import { idPrefix } from '@taucad/types/constants';
import type { MyUIMessage } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import type { ChatUsageTokens } from '#api/chat/chat.schema.js';
import { processContent } from '#api/chat/utils/process-content.js';
import type {
  StreamEvent,
  ChatModelStreamEvent,
  ChatModelEndEvent,
  ToolStartEvent,
  ToolEndEvent,
} from '#api/chat/utils/langgraph-types.js';

type TypedUiMessageStreamWriter = UIMessageStreamWriter<MyUIMessage>;

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
    dataStream: TypedUiMessageStreamWriter;
    content: string | unknown[];
    type: string;
  }) => void;

  /**
   * Called when a chat model starts generating content.
   * @param parameters - The parameters for the callback.
   * @param parameters.dataStream - The enhanced data stream writer.
   * @param parameters.messageId - The ID of the message being generated.
   */
  onChatModelStart?: (parameters: { dataStream: TypedUiMessageStreamWriter; messageId: string }) => void;

  /**
   * Called when a chat model finishes generating content.
   * @param parameters - The parameters for the callback.
   * @param parameters.dataStream - The enhanced data stream writer.
   * @param parameters.modelId - The ID of the model that generated the content.
   * @param parameters.usageTokens - Token usage information.
   */
  onChatModelEnd?: (parameters: {
    dataStream: TypedUiMessageStreamWriter;
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
    dataStream: TypedUiMessageStreamWriter;
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
    dataStream: TypedUiMessageStreamWriter;
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
    dataStream: TypedUiMessageStreamWriter;
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

    const dataStream = createUIMessageStream({
      // eslint-disable-next-line complexity -- acceptable to keep the function contained.
      execute: async (dataStream) => {
        const id = generatePrefixedId(idPrefix.message);

        // Keep reasoning state in a mutable object to avoid closure issues
        const reasoningState = {
          thinkingBuffer: '',
          isReasoning: false,
        };

        const toolCallState = {
          currentToolCallId: '',
          currentToolName: '',
          toolInputStartSent: false,
          pendingFinishStep: false, // Tracks if finish-step was deferred due to pending tool call
        };

        // Track whether start events have been sent to ensure proper event sequencing
        const streamStartState = {
          textStartSent: false,
          reasoningStartSent: false,
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
                dataStream: dataStream.writer,
                callbacks,
                reasoningState,
                toolCallState,
                streamStartState,
                toolTypeMap,
                messageId: id,
              });
              break;
            }

            case 'on_chat_model_start': {
              this.handleChatModelStart({
                messageId: id,
                dataStream: dataStream.writer,
                callbacks,
              });
              break;
            }

            case 'on_chat_model_end': {
              this.handleChatModelEnd({
                streamEvent,
                dataStream: dataStream.writer,
                callbacks,
                modelId,
                totalUsageTokens,
                streamStartState,
                toolCallState,
                messageId: id,
              });
              break;
            }

            case 'on_tool_start': {
              this.handleToolStart({
                streamEvent,
                dataStream: dataStream.writer,
                callbacks,
                toolCallState,
                streamStartState,
                messageId: id,
              });
              break;
            }

            case 'on_tool_end': {
              this.handleToolEnd({
                streamEvent,
                dataStream: dataStream.writer,
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

            default: {
              const unknownEvent: never = streamEvent;
              throw new Error(`Unknown event: ${JSON.stringify(unknownEvent)}`);
            }
          }
        }

        callbacks.onMessageComplete?.({ dataStream: dataStream.writer, modelId, usageTokens: totalUsageTokens });

        // Write finish message
        dataStream.writer.write({
          type: 'finish',
          finishReason: 'stop',
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
    dataStream: TypedUiMessageStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
    reasoningState: { thinkingBuffer: string; isReasoning: boolean };
    toolCallState: {
      currentToolCallId: string;
      currentToolName: string;
      toolInputStartSent: boolean;
      pendingFinishStep: boolean;
    };
    streamStartState: { textStartSent: boolean; reasoningStartSent: boolean };
    toolTypeMap: Record<string, string>;
    messageId: string;
  }): void {
    const {
      streamEvent,
      dataStream,
      callbacks,
      reasoningState,
      toolCallState,
      streamStartState,
      toolTypeMap,
      messageId,
    } = parameters;

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
        toolCallState.toolInputStartSent = true;
        dataStream.write({
          type: 'tool-input-start',
          toolCallId,
          toolName,
        });
      }
    } else if (streamEvent.data.chunk.tool_call_chunks.length > 0) {
      // If tool call chunks are present, we need to handle them separately.
      const toolCallChunk = streamEvent.data.chunk.tool_call_chunks[0]!;
      if (toolCallState.currentToolCallId) {
        dataStream.write({
          type: 'tool-input-delta',
          toolCallId: toolCallState.currentToolCallId,
          inputTextDelta: toolCallChunk.args,
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
          if (type === 'reasoning') {
            // Ensure reasoning-start is sent before the first reasoning-delta
            if (!streamStartState.reasoningStartSent) {
              dataStream.write({
                type: 'reasoning-start',
                id: messageId,
              });
              streamStartState.reasoningStartSent = true;
            }

            // Write to data stream
            dataStream.write({
              type: 'reasoning-delta',
              id: messageId,
              delta: content,
            });
          } else {
            // Ensure text-start is sent before the first text-delta
            if (!streamStartState.textStartSent) {
              dataStream.write({
                type: 'text-start',
                id: messageId,
              });
              streamStartState.textStartSent = true;
            }

            dataStream.write({
              type: 'text-delta',
              id: messageId,
              delta: content,
            });
          }

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
              if (textPart.text === '') {
                // No-op: Sometimes empty strings are present
                // We don't need to write them to the data stream.
              } else {
                // Ensure text-start is sent before the first text-delta
                if (!streamStartState.textStartSent) {
                  dataStream.write({
                    type: 'text-start',
                    id: messageId,
                  });
                  streamStartState.textStartSent = true;
                }

                dataStream.write({
                  type: 'text-delta',
                  id: messageId,
                  delta: textPart.text,
                });
                callbacks.onChatModelStream?.({ dataStream, content: textPart.text, type: 'text' });
              }

              break;
            }

            case 'thinking': {
              if ('thinking' in part) {
                if (part.thinking === '') {
                  // No-op: Sometimes empty strings are present
                  // We don't need to write them to the data stream.
                } else {
                  // Ensure reasoning-start is sent before the first reasoning-delta
                  if (!streamStartState.reasoningStartSent) {
                    dataStream.write({
                      type: 'reasoning-start',
                      id: messageId,
                    });
                    streamStartState.reasoningStartSent = true;
                  }

                  dataStream.write({
                    type: 'reasoning-delta',
                    id: messageId,
                    delta: part.thinking,
                  });
                  callbacks.onChatModelStream?.({ dataStream, content: part.thinking, type: 'reasoning' });
                }
              } else if ('signature' in part) {
                dataStream.write({
                  type: 'reasoning-end',
                  id: messageId,
                });
                callbacks.onChatModelStream?.({
                  dataStream,
                  content: [{ signature: part.signature }],
                  type: 'reasoning_signature',
                });
                // Reset reasoning start state after reasoning-end
                streamStartState.reasoningStartSent = false;
              } else {
                throw new Error('Unknown part type: ' + JSON.stringify(part));
              }

              break;
            }

            case 'redacted_thinking': {
              // Ensure reasoning-start is sent before the first reasoning-delta
              if (!streamStartState.reasoningStartSent) {
                dataStream.write({
                  type: 'reasoning-start',
                  id: messageId,
                });
                streamStartState.reasoningStartSent = true;
              }

              dataStream.write({
                type: 'reasoning-delta',
                id: messageId,
                delta: part.data,
              });
              callbacks.onChatModelStream?.({
                dataStream,
                content: [{ data: part.data }],
                type: 'redacted_reasoning',
              });

              break;
            }

            case 'input_json_delta':
            case 'tool_use': {
              // No-op
              break;
            }

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
    dataStream: TypedUiMessageStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
  }): void {
    const { messageId, dataStream, callbacks } = parameters;

    dataStream.write({
      type: 'start-step',
    });

    callbacks.onChatModelStart?.({ dataStream, messageId });
  }

  /**
   * Handles the 'onChatModelEnd' event from LangGraph.
   */
  private static handleChatModelEnd(parameters: {
    streamEvent: ChatModelEndEvent;
    dataStream: TypedUiMessageStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
    modelId: string;
    totalUsageTokens: ChatUsageTokens;
    streamStartState: { textStartSent: boolean; reasoningStartSent: boolean };
    toolCallState: {
      currentToolCallId: string;
      currentToolName: string;
      toolInputStartSent: boolean;
      pendingFinishStep: boolean;
    };
    messageId: string;
  }): void {
    const {
      streamEvent,
      dataStream,
      callbacks,
      modelId,
      totalUsageTokens,
      streamStartState,
      toolCallState,
      messageId,
    } = parameters;

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

    // Check if there's a pending tool call - if so, defer finish-step until tool completes
    // AI SDK v5 expects: tool-input-available → text-end → tool-output-available → finish-step
    const hasPendingToolCall = Boolean(toolCallState.currentToolCallId);

    if (hasPendingToolCall) {
      // Defer finish-step and text-end/reasoning-end until after tool completes
      toolCallState.pendingFinishStep = true;
    } else {
      // No pending tool call - send end events and finish-step normally
      if (streamStartState.textStartSent) {
        dataStream.write({
          type: 'text-end',
          id: messageId,
        });
      }

      if (streamStartState.reasoningStartSent) {
        dataStream.write({
          type: 'reasoning-end',
          id: messageId,
        });
      }

      dataStream.write({
        type: 'finish-step',
      });

      // Reset start state flags after step finishes so new steps can send start events
      streamStartState.textStartSent = false;
      streamStartState.reasoningStartSent = false;
    }

    callbacks.onChatModelEnd?.({ dataStream, modelId, usageTokens });
    callbacks.onUsageUpdate?.({ modelId, usageTokens });
  }

  /**
   * Handles the 'onToolStart' event from LangGraph.
   */
  private static handleToolStart(parameters: {
    streamEvent: ToolStartEvent;
    dataStream: TypedUiMessageStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
    toolCallState: {
      currentToolCallId: string;
      currentToolName: string;
      toolInputStartSent: boolean;
      pendingFinishStep: boolean;
    };
    streamStartState: { textStartSent: boolean; reasoningStartSent: boolean };
    messageId: string;
  }): void {
    const { streamEvent, dataStream, callbacks, toolCallState, streamStartState, messageId } = parameters;

    const toolCallId = toolCallState.currentToolCallId;
    const toolName = toolCallState.currentToolName;

    // Check if this is a resume operation (replaying tool execution from checkpoint)
    const isResuming = streamEvent.metadata['__pregel_resuming'] === true;

    // When resuming, tool events are replayed but chat model stream events are not,
    // so toolCallState will be empty. Skip writing the tool call since it was already
    // sent to the client in the original execution.
    if (isResuming && (!toolCallId || !toolName)) {
      // No-op: Skip writing duplicate tool call during resume
      return;
    }

    // Validate that tool call ID and name are not empty for non-resume cases
    if (!toolCallId || !toolName) {
      throw new Error(
        `Tool start event received with empty tool call ID or name. ` +
          `toolCallId: "${toolCallId}", toolName: "${toolName}", event: ${JSON.stringify(streamEvent)}`,
      );
    }

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

    // Only write tool-input-start and tool-input-delta if they haven't been sent yet.
    // handleChatModelStream already sends these events when streaming tool calls,
    // so we skip them here to avoid duplicates. AI SDK v5 expects exactly one
    // tool-input-start event per tool call.
    if (!toolCallState.toolInputStartSent) {
      dataStream.write({
        type: 'tool-input-start',
        toolCallId,
        toolName,
      });
      dataStream.write({
        type: 'tool-input-delta',
        toolCallId,
        inputTextDelta: String(input),
      });
      toolCallState.toolInputStartSent = true;
    }

    // AI SDK v5 requires tool-input-available to signal that tool input is complete
    // This must be sent before tool-output-available
    dataStream.write({
      type: 'tool-input-available',
      toolCallId,
      toolName,
      input: args,
    });

    // AI SDK v5 expects: tool-input-available → text-end → tool-output-available → finish-step
    // Send text-end/reasoning-end that were deferred from handleChatModelEnd
    if (toolCallState.pendingFinishStep) {
      if (streamStartState.textStartSent) {
        dataStream.write({
          type: 'text-end',
          id: messageId,
        });
        streamStartState.textStartSent = false;
      }

      if (streamStartState.reasoningStartSent) {
        dataStream.write({
          type: 'reasoning-end',
          id: messageId,
        });
        streamStartState.reasoningStartSent = false;
      }
    }

    callbacks.onToolStart?.({ dataStream, toolCallId, toolName, args });
  }

  /**
   * Handles the 'onToolEnd' event from LangGraph.
   */
  private static handleToolEnd(parameters: {
    streamEvent: ToolEndEvent;
    dataStream: TypedUiMessageStreamWriter;
    callbacks: LangGraphAdapterCallbacks;
    parseToolResults?: Partial<Record<string, (content: string) => unknown[]>>;
    toolCallState: {
      currentToolCallId: string;
      currentToolName: string;
      toolInputStartSent: boolean;
      pendingFinishStep: boolean;
    };
  }): void {
    const { streamEvent, dataStream, callbacks, parseToolResults, toolCallState } = parameters;

    // Get tool name from map or use raw name
    const toolName = toolCallState.currentToolName;
    const { content } = streamEvent.data.output;
    const toolCallId = toolCallState.currentToolCallId;

    // Check if this is a resume operation (replaying tool execution from checkpoint)
    const isResuming = streamEvent.metadata['__pregel_resuming'] === true;

    // When resuming, tool events are replayed but chat model stream events are not,
    // so toolCallState will be empty. Skip writing the tool result since it was already
    // sent to the client in the original execution.
    if (isResuming && (!toolCallId || !toolName)) {
      // No-op: Skip writing duplicate tool result during resume
      return;
    }

    // Validate that tool call ID and name are not empty for non-resume cases
    if (!toolCallId || !toolName) {
      throw new Error(
        `Tool end event received with empty tool call ID or name. ` +
          `toolCallId: "${toolCallId}", toolName: "${toolName}", event: ${JSON.stringify(streamEvent)}`,
      );
    }

    toolCallState.currentToolCallId = ''; // Reset the current tool call ID
    toolCallState.currentToolName = ''; // Reset the current tool name
    toolCallState.toolInputStartSent = false; // Reset the tool input start flag

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

    dataStream.write({
      type: 'tool-output-available',
      toolCallId,
      output: result,
    });

    // If finish-step was deferred due to pending tool call, send it now
    // AI SDK v5 expects: tool-input-available → text-end → tool-output-available → finish-step
    // Note: text-end/reasoning-end were already sent in handleToolStart
    if (toolCallState.pendingFinishStep) {
      dataStream.write({
        type: 'finish-step',
      });

      toolCallState.pendingFinishStep = false;
    }

    callbacks.onToolEnd?.({ dataStream, toolCallId, toolName, result });
  }
}
