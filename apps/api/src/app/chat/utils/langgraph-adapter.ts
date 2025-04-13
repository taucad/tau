import type { ServerResponse } from 'node:http';
import type { StreamEvent } from '@langchain/core/dist/tracers/event_stream';
import type { IterableReadableStream } from '@langchain/core/dist/utils/stream';
import { formatDataStreamPart, pipeDataStreamToResponse } from 'ai';
import type { DataStreamWriter } from 'ai';
import { generatePrefixedId, idPrefix } from '../../utils/id.js';
import type { ChatUsageTokens } from '../chat-schema.js';
import { processContent } from './process-content.js';

/**
 * Events emitted during a chat session with LangGraph.
 */
export const chatEvent = {
  /** Emitted when a chat model starts generating content */
  onChatModelStart: 'on_chat_model_start',
  /** Emitted when a chat model finishes generating content */
  onChatModelEnd: 'on_chat_model_end',
  /** Emitted when a chat model streams a chunk of content */
  onChatModelStream: 'on_chat_model_stream',
  /** Emitted when a tool starts executing */
  onToolStart: 'on_tool_start',
  /** Emitted when a tool finishes executing */
  onToolEnd: 'on_tool_end',
  /** Emitted when a chain starts executing */
  onChainStart: 'on_chain_start',
  /** Emitted when a chain finishes executing */
  onChainEnd: 'on_chain_end',
  /** Emitted when a chain streams content */
  onChainStream: 'on_chain_stream',
} as const satisfies Record<string, string>;

type ChatEvent = (typeof chatEvent)[keyof typeof chatEvent];

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
   * @param parameters.results - The results returned by the tool.
   */
  onToolEnd?: (parameters: {
    dataStream: EnhancedDataStreamWriter;
    toolCallId: string;
    toolName: string;
    results: unknown[];
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
  onEvent?: (parameters: { event: ChatEvent; data: unknown }) => void;
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
export class LangGraphAdapter {
  /**
   * Pipes a LangGraph stream to a data stream response.
   * @param stream - The LangGraph stream.
   * @param options - Options for the adapter.
   */
  public static toDataStreamResponse(
    stream: IterableReadableStream<StreamEvent>,
    options: LangGraphAdapterOptions,
  ): void {
    const { response, modelId, callbacks = {}, toolTypeMap = {}, parseToolResults } = options;

    response.setHeader('x-vercel-ai-data-stream', 'v1');
    pipeDataStreamToResponse(response, {
      // eslint-disable-next-line complexity -- acceptable to keep the function contained.
      execute: async (rawDataStream) => {
        // Create enhanced data stream
        const dataStream = this.createDataStreamWriter(rawDataStream);

        const id = generatePrefixedId(idPrefix.message);

        // Keep reasoning state internally
        let thinkingBuffer = '';
        let isReasoning = false;

        const totalUsageTokens = {
          inputTokens: 0,
          outputTokens: 0,
          cachedReadTokens: 0,
          cachedWriteTokens: 0,
        } satisfies ChatUsageTokens;

        for await (const streamEvent of stream) {
          if (callbacks.onEvent) {
            callbacks.onEvent({ event: streamEvent.event as ChatEvent, data: streamEvent.data });
          }

          switch (streamEvent.event) {
            case chatEvent.onChatModelStream: {
              if (streamEvent.data.chunk.content) {
                const streamedContent = streamEvent.data.chunk.content;

                if (typeof streamedContent === 'string') {
                  // Process string content to detect reasoning tags
                  const processedContent = processContent(streamedContent, thinkingBuffer, isReasoning);
                  const { content } = processedContent;
                  const { type } = processedContent;

                  // Update state after processing
                  thinkingBuffer = processedContent.buffer;
                  isReasoning = processedContent.isReasoning;

                  if (content) {
                    // Write to data stream
                    dataStream.writePart(type, content);

                    // Call callback if provided
                    if (callbacks.onChatModelStream) {
                      callbacks.onChatModelStream({ dataStream, content, type });
                    }
                  }
                } else {
                  // Handle streaming for "complex" content types, such as Anthropic
                  if (streamedContent.length > 0) {
                    for (const part of streamedContent) {
                      const complexType = part.type;
                      switch (complexType) {
                        case 'text': {
                          if (part.text === undefined) {
                            throw new Error('Text not found in part: ' + JSON.stringify(part));
                          } else {
                            dataStream.writePart('text', part.text);
                            if (callbacks.onChatModelStream) {
                              callbacks.onChatModelStream({ dataStream, content: part.text, type: 'text' });
                            }
                          }

                          break;
                        }

                        case 'thinking': {
                          if (part.thinking !== undefined) {
                            dataStream.writePart('reasoning', part.thinking);
                            if (callbacks.onChatModelStream) {
                              callbacks.onChatModelStream({ dataStream, content: part.thinking, type: 'reasoning' });
                            }
                          } else if (part.signature === undefined) {
                            throw new Error('Thinking not found in part: ' + JSON.stringify(part));
                          } else {
                            dataStream.writePart('reasoning_signature', { signature: part.signature });
                            if (callbacks.onChatModelStream) {
                              callbacks.onChatModelStream({
                                dataStream,
                                content: [{ signature: part.signature }],
                                type: 'reasoning_signature',
                              });
                            }
                          }

                          break;
                        }

                        case 'redacted_thinking': {
                          if (part.data === undefined) {
                            throw new Error('Redacted thinking not found in part: ' + JSON.stringify(part));
                          } else {
                            dataStream.writePart('redacted_reasoning', { data: part.data });
                            if (callbacks.onChatModelStream) {
                              callbacks.onChatModelStream({
                                dataStream,
                                content: [{ data: part.data }],
                                type: 'redacted_reasoning',
                              });
                            }
                          }

                          break;
                        }

                        case 'input_json_delta':
                        case 'tool_use': {
                          // No-op
                          break;
                        }

                        default: {
                          throw new Error(`Unknown part type: ${complexType}`);
                        }
                      }
                    }
                  }
                }
              }

              break;
            }

            case chatEvent.onChatModelStart: {
              dataStream.writePart('start_step', {
                messageId: id,
              });

              if (callbacks.onChatModelStart) {
                callbacks.onChatModelStart({ dataStream, messageId: id });
              }

              break;
            }

            case chatEvent.onChatModelEnd: {
              const usageTokens = {
                inputTokens: streamEvent.data.output.usage_metadata.input_tokens || 0,
                outputTokens: streamEvent.data.output.usage_metadata.output_tokens || 0,
                cachedReadTokens: streamEvent.data.output.usage_metadata.input_token_details?.cache_read || 0,
                cachedWriteTokens: streamEvent.data.output.usage_metadata.input_token_details?.cache_creation || 0,
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

              if (callbacks.onChatModelEnd) {
                callbacks.onChatModelEnd({ dataStream, modelId, usageTokens });
              }

              if (callbacks.onUsageUpdate) {
                callbacks.onUsageUpdate({ modelId, usageTokens });
              }

              break;
            }

            case chatEvent.onToolStart: {
              // An ID unique to the tool call node. Replace `tools:` with known prefix to create a valid tool call ID.
              const rawId = streamEvent.metadata.langgraph_checkpoint_ns
                .replace('tools:', '')
                // Remove redundant dashes
                .replaceAll('-', '');

              const toolCallId = generatePrefixedId(idPrefix.toolCall, rawId);

              // Get tool name from map or use raw name
              const toolName = toolTypeMap[streamEvent.name] || streamEvent.name;

              dataStream.writePart('tool_call', {
                toolCallId,
                toolName,
                args: streamEvent.data.input,
              });

              if (callbacks.onToolStart) {
                callbacks.onToolStart({ dataStream, toolCallId, toolName, args: streamEvent.data.input });
              }

              break;
            }

            case chatEvent.onToolEnd: {
              // Get tool name from map or use raw name
              const toolName = toolTypeMap[streamEvent.name] || streamEvent.name;

              // Parse tool results using the configurable parser with tool name.
              // If no parser is configured, use the content as is.
              const toolParser = parseToolResults?.[toolName];
              const results = toolParser
                ? toolParser(streamEvent.data.output.content)
                : streamEvent.data.output.content;

              // A LangGraph UUID for the tool call, of shape:
              // `tools:00000000-0000-0000-0000-000000000000`
              // We replace `tools:` with a known prefix to create a consistent tool call ID,
              // remove redundant dashes, and convert the UUID characters to base64.
              const rawId = streamEvent.metadata.langgraph_checkpoint_ns
                .replace('tools:', '')
                // Remove redundant dashes
                .replaceAll('-', '');
              const toolCallId = generatePrefixedId(idPrefix.toolCall, rawId);

              dataStream.writePart('tool_result', {
                toolCallId,
                result: results,
              });

              if (callbacks.onToolEnd) {
                callbacks.onToolEnd({ dataStream, toolCallId, toolName, results });
              }

              break;
            }

            case chatEvent.onChainStart:
            case chatEvent.onChainStream:
            case chatEvent.onChainEnd: {
              // These events are not supported by the AI SDK, so we just ignore them
              break;
            }

            default: {
              throw new Error(`Unknown event: ${streamEvent.event}`);
            }
          }
        }

        // Call onMessageComplete for final annotations and cleanup
        if (callbacks.onMessageComplete) {
          callbacks.onMessageComplete({ dataStream, modelId, usageTokens: totalUsageTokens });
        }

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
   * Creates an enhanced data stream writer.
   * @param dataStream - The data stream to enhance.
   * @returns An enhanced data stream writer.
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
