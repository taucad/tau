import { Body, Controller, Post, Logger, Res } from '@nestjs/common';

import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import { openai } from '@ai-sdk/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START, Command } from '@langchain/langgraph';
import { ModelService } from './model.service';
import { ChatUsageCost, ChatUsageTokens } from './chat.schema';
import { convertToCoreMessages, formatDataStreamPart, pipeDataStreamToResponse, streamText, UIMessage } from 'ai';
import { nameGenerationSystemPrompt } from './chat-prompt-name';
import { generatePrefixedId, PREFIX_TYPES } from '../utils/id';
import { convertAiSdkMessagesToLangchainMessages } from '../utils/messages';
import { Response } from 'express';

enum ChatNode {
  Start = START,
  End = END,
  Agent = 'agent',
  Tools = 'tools',
}

enum ChatEvent {
  OnChatModelStart = 'on_chat_model_start',
  OnChatModelEnd = 'on_chat_model_end',
  OnChatModelStream = 'on_chat_model_stream',
  OnToolStart = 'on_tool_start',
  OnToolEnd = 'on_tool_end',
  OnChainStart = 'on_chain_start',
  OnChainEnd = 'on_chain_end',
  OnChainStream = 'on_chain_stream',
}

type ToolChoice = 'web' | 'none' | 'auto' | 'any';

type CreateChatBody = {
  messages: (UIMessage & {
    role: 'user';
    model: string;
    metadata: { toolChoice: ToolChoice };
  })[];
};

const TEXT_FROM_HINT = {
  web: SearxngSearch.prototype.name,
  none: 'none',
  auto: 'auto',
  any: 'any',
} as const;

const TOOL_TYPE_FROM_TOOL_NAME = {
  [SearxngSearch.name]: 'web',
} as const;

@Controller('chat')
export class ChatController {
  constructor(private readonly modelService: ModelService) {}

  @Post()
  async getData(@Body() body: CreateChatBody, @Res() response: Response) {
    // Logger.log(JSON.stringify(body.messages, null, 2));
    const coreMessages = convertToCoreMessages(body.messages);
    const lastBodyMessage = body.messages.at(-1);

    let modelId: string;
    let toolChoice: ToolChoice = 'auto';
    if (lastBodyMessage?.role === 'user') {
      modelId = lastBodyMessage.model;
      if (lastBodyMessage.metadata.toolChoice) {
        toolChoice = lastBodyMessage.metadata.toolChoice;
      }
    } else {
      throw new Error('Last message is not a user message');
    }
    const resolvedToolChoice = TEXT_FROM_HINT[toolChoice];

    if (modelId === 'name-generator') {
      return pipeDataStreamToResponse(response, {
        execute: async (dataStreamWriter) => {
          const result = streamText({
            model: openai('gpt-4o-mini'),
            messages: coreMessages,
            system: nameGenerationSystemPrompt,
            // TODO: fix tool choice provision for AI SDK.
            // toolChoice: resolvedToolChoice,
          });

          result.mergeIntoDataStream(dataStreamWriter);
        },
        onError: (error) => {
          // Error messages are masked by default for security reasons.
          // If you want to expose the error message to the client, you can do so here:
          return error instanceof Error ? error.message : String(error);
        },
      });
    }

    const langchainMessages = convertAiSdkMessagesToLangchainMessages(body.messages, coreMessages);

    // Define the tools for the agent to use
    const tools = [
      // new TavilySearchResults({ maxResults: 3 }),
      new SearxngSearch({
        params: {
          format: 'json', // Do not change this, format other than "json" is will throw error
          engines: 'google,bing,duckduckgo,wikipedia,youtube',
          numResults: 10,
        },
        apiBase: 'http://localhost:42114',
        // Custom Headers to support rapidAPI authentication Or any instance that requires custom headers
        headers: {},
      }),
    ];
    const toolNode = new ToolNode(tools);
    const { model: unboundModel, support } = this.modelService.buildModel(modelId);
    const model =
      support?.tools === false
        ? unboundModel
        : (unboundModel.bindTools?.(tools, {
            ...(support?.toolChoice === false ? {} : { tool_choice: resolvedToolChoice }),
          }) ?? unboundModel);

    // Define the function that calls the model
    async function agent(state: typeof MessagesAnnotation.State) {
      const message = await model.invoke(state.messages);

      let gotoNode: ChatNode;

      // If the LLM makes a tool call, then we route to the Tools node
      // eslint-disable-next-line unicorn/prefer-ternary -- easier to read this way.
      if (message.tool_calls && message.tool_calls.length > 0) {
        gotoNode = ChatNode.Tools;
      } else {
        gotoNode = ChatNode.End;
      }

      // Add the message to the state and go to the next node
      return new Command({ update: { messages: [message] }, goto: gotoNode });
    }

    // Define a new graph
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode(ChatNode.Agent, agent, { ends: [ChatNode.Tools, ChatNode.End] })
      .addNode(ChatNode.Tools, toolNode)
      .addEdge(ChatNode.Tools, ChatNode.Agent)
      .addEdge(ChatNode.Start, ChatNode.Agent);

    // Finally, we compile it into a LangChain Runnable.
    const graph = workflow.compile();

    const eventStream = graph.streamEvents(
      {
        messages: langchainMessages,
      },
      {
        streamMode: 'values',
        version: 'v2',
        runId: generatePrefixedId(PREFIX_TYPES.RUN),
      },
    );

    response.setHeader('x-vercel-ai-data-stream', 'v1');
    pipeDataStreamToResponse(response, {
      execute: async (dataStream) => {
        const id = generatePrefixedId(PREFIX_TYPES.MESSAGE);

        // Keep reasoning state in per-request scope
        let thinkingBuffer = '';
        let isReasoning = false;
        const totalUsageTokens = {
          inputTokens: 0,
          outputTokens: 0,
          cachedReadTokens: 0,
          cachedWriteTokens: 0,
        } satisfies ChatUsageTokens;
        const totalUsageCost = {
          inputTokensCost: 0,
          outputTokensCost: 0,
          cachedReadTokensCost: 0,
          cachedWriteTokensCost: 0,
          totalCost: 0,
        } satisfies ChatUsageCost;

        for await (const streamEvent of eventStream) {
          Logger.log(`processing event: ${streamEvent.event}`);
          switch (streamEvent.event) {
            case ChatEvent.OnChatModelStream: {
              if (streamEvent.data.chunk.content) {
                const streamedContent = streamEvent.data.chunk.content;

                if (typeof streamedContent === 'string') {
                  // Process string content to detect reasoning tags
                  const processedContent = this.processContent(streamedContent, thinkingBuffer, isReasoning);
                  const content = processedContent.content;
                  const type = processedContent.type;
                  // Update state after processing
                  thinkingBuffer = processedContent.buffer;
                  isReasoning = processedContent.isReasoning;

                  if (content) {
                    dataStream.write(formatDataStreamPart(type, content));
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
                            dataStream.write(formatDataStreamPart('text', part.text));
                          }

                          break;
                        }
                        case 'thinking': {
                          if (part.thinking !== undefined) {
                            dataStream.write(formatDataStreamPart('reasoning', part.thinking));
                          } else if (part.signature === undefined) {
                            throw new Error('Thinking not found in part: ' + JSON.stringify(part));
                          } else {
                            dataStream.write(
                              formatDataStreamPart('reasoning_signature', { signature: part.signature }),
                            );
                          }

                          break;
                        }
                        case 'redacted_thinking': {
                          if (part.data === undefined) {
                            throw new Error('Redacted thinking not found in part: ' + JSON.stringify(part));
                          } else {
                            dataStream.write(formatDataStreamPart('redacted_reasoning', { data: part.data }));
                          }

                          break;
                        }
                        case 'input_json_delta':
                        case 'tool_use': {
                          // no-op
                          break;
                        }
                        default: {
                          throw new Error(`Unknown part: ${JSON.stringify(part)}`);
                        }
                      }
                    }
                  }
                }
              }

              break;
            }
            case ChatEvent.OnChatModelStart: {
              dataStream.write(
                formatDataStreamPart('start_step', {
                  messageId: id,
                }),
              );

              break;
            }
            case ChatEvent.OnChatModelEnd: {
              const usageTokens = this.modelService.normalizeUsageTokens(modelId, {
                inputTokens: streamEvent.data.output.usage_metadata.input_tokens,
                outputTokens: streamEvent.data.output.usage_metadata.output_tokens,
                cachedReadTokens: streamEvent.data.output.usage_metadata.input_token_details?.cache_read,
                cachedWriteTokens: streamEvent.data.output.usage_metadata.input_token_details?.cache_creation,
              });

              totalUsageTokens.inputTokens += usageTokens.inputTokens;
              totalUsageTokens.outputTokens += usageTokens.outputTokens;
              totalUsageTokens.cachedReadTokens += usageTokens.cachedReadTokens;
              totalUsageTokens.cachedWriteTokens += usageTokens.cachedWriteTokens;

              const usageCost = this.modelService.getModelCost(modelId, usageTokens);

              totalUsageCost.inputTokensCost += usageCost.inputTokensCost;
              totalUsageCost.outputTokensCost += usageCost.outputTokensCost;
              totalUsageCost.cachedReadTokensCost += usageCost.cachedReadTokensCost;
              totalUsageCost.cachedWriteTokensCost += usageCost.cachedWriteTokensCost;
              totalUsageCost.totalCost += usageCost.totalCost;
              dataStream.write(
                formatDataStreamPart('finish_step', {
                  finishReason: 'stop',
                  usage: { promptTokens: usageTokens.inputTokens, completionTokens: usageTokens.outputTokens },
                  isContinued: false,
                }),
              );

              break;
            }
            case ChatEvent.OnToolStart: {
              // an ID unique to the tool call node. Replace `tools:` with known prefix to create a valid tool call ID.
              const toolCallId = streamEvent.metadata.langgraph_checkpoint_ns
                .replace('tools:', `${PREFIX_TYPES.TOOL_CALL}_`)
                // Remove redundant dashes
                .replaceAll('-', '');
              dataStream.write(
                formatDataStreamPart('tool_call', {
                  toolCallId,
                  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- all tools are defined in the TOOL_TYPE_FROM_TOOL_NAME object
                  toolName: TOOL_TYPE_FROM_TOOL_NAME[streamEvent.name as keyof typeof TOOL_TYPE_FROM_TOOL_NAME],
                  args: streamEvent.data.input,
                }),
              );
              break;
            }
            case ChatEvent.OnToolEnd: {
              // The searxng tool doesn't return the results in a fully structured format, so we need to wrap it in an array and parse it
              const results = JSON.parse(`[${streamEvent.data.output.content}]`);

              // an ID unique to the tool call node. Replace `tools:` with known prefix to create a valid tool call ID.
              const toolCallId = streamEvent.metadata.langgraph_checkpoint_ns
                .replace('tools:', `${PREFIX_TYPES.TOOL_CALL}_`)
                // Remove redundant dashes
                .replaceAll('-', '');

              dataStream.write(
                formatDataStreamPart('tool_result', {
                  toolCallId,
                  result: results,
                }),
              );
              for (const result of results) {
                dataStream.write(
                  formatDataStreamPart('source', {
                    title: result.title,
                    url: result.link,
                    sourceType: 'url',
                    id: generatePrefixedId(PREFIX_TYPES.SOURCE),
                    providerMetadata: {
                      snippet: result.snippet,
                    },
                  }),
                );
              }
              break;
            }
            case ChatEvent.OnChainStart:
            case ChatEvent.OnChainStream:
            case ChatEvent.OnChainEnd: {
              // These events are not supported by the AI SDK, so we don't need to handle them
              break;
            }
            default: {
              Logger.error(`Unknown event: ${streamEvent.event}`);
            }
          }
        }
        dataStream.write(
          formatDataStreamPart('message_annotations', [
            {
              type: 'usage',
              usageCost: totalUsageCost,
              usageTokens: totalUsageTokens,
              model: modelId,
            },
          ]),
        );

        dataStream.write(
          formatDataStreamPart('finish_message', {
            finishReason: 'stop',
            usage: { promptTokens: totalUsageTokens.inputTokens, completionTokens: totalUsageTokens.outputTokens },
          }),
        );
      },
      onError(error) {
        // TODO: log request id
        Logger.error(error);
        return 'An error occurred while processing the request';
      },
    });
  }

  /**
   * Process streaming content to detect <think> and </think> tags.
   * @param chunk Current text chunk from the stream
   * @param buffer Current buffer state
   * @param isReasoning Current reasoning mode state
   * @returns Processed content, type, and updated state
   */
  private processContent(
    chunk: string,
    buffer: string,
    isReasoning: boolean,
  ): {
    content: string;
    type: 'text' | 'reasoning';
    buffer: string;
    isReasoning: boolean;
  } {
    // Add the current chunk to the buffer
    let updatedBuffer = buffer + chunk;

    // Check for opening and closing tags
    const openTagIndex = updatedBuffer.indexOf('<think>');
    const closeTagIndex = updatedBuffer.indexOf('</think>');

    let resultContent = '';
    let contentType: 'text' | 'reasoning' = isReasoning ? 'reasoning' : 'text';

    // Process the buffer based on tag positions
    if (openTagIndex !== -1 && closeTagIndex !== -1) {
      // Both tags are present in the buffer
      if (openTagIndex < closeTagIndex) {
        // Normal case: <think>...</think>
        if (openTagIndex > 0) {
          // Text before the opening tag
          resultContent = updatedBuffer.slice(0, openTagIndex);
          contentType = 'text';
        } else {
          // Extract content between tags
          resultContent = updatedBuffer.slice(openTagIndex + 7, closeTagIndex);
          contentType = 'reasoning';
        }

        // Update buffer to content after the closing tag
        updatedBuffer = updatedBuffer.slice(closeTagIndex + 8);
        isReasoning = false;

        // If there's remaining content, recursively process it
        if (updatedBuffer.length > 0) {
          const nextProcess = this.processContent('', updatedBuffer, isReasoning);
          if (nextProcess.content) {
            // If the next chunk has content with a different type, we'll send separate chunks
            return {
              content: resultContent,
              type: contentType,
              buffer: nextProcess.buffer,
              isReasoning: nextProcess.isReasoning,
            };
          }
          // Update with the recursive call results
          updatedBuffer = nextProcess.buffer;
          isReasoning = nextProcess.isReasoning;
        }
      }
    } else if (openTagIndex !== -1) {
      // Only opening tag found
      if (openTagIndex > 0) {
        // Return content before the tag
        resultContent = updatedBuffer.slice(0, openTagIndex);
        updatedBuffer = updatedBuffer.slice(openTagIndex);
        contentType = 'text';
      } else {
        // We're entering reasoning mode
        isReasoning = true;
        resultContent = updatedBuffer.slice(7); // Skip "<think>"
        updatedBuffer = '';
        contentType = 'reasoning';
      }
    } else if (closeTagIndex === -1) {
      // No tags found, return current chunk with current mode
      resultContent = updatedBuffer;
      updatedBuffer = '';
    } else {
      // Only closing tag found
      resultContent = updatedBuffer.slice(0, closeTagIndex);
      updatedBuffer = updatedBuffer.slice(closeTagIndex + 8);
      isReasoning = false;
      contentType = 'reasoning';

      // If there's remaining content, process it
      if (updatedBuffer.length > 0) {
        const nextProcess = this.processContent('', updatedBuffer, isReasoning);
        if (nextProcess.content) {
          return {
            content: resultContent,
            type: contentType,
            buffer: nextProcess.buffer,
            isReasoning: nextProcess.isReasoning,
          };
        }
        // Update with the recursive call results
        updatedBuffer = nextProcess.buffer;
        isReasoning = nextProcess.isReasoning;
      }
    }

    return {
      content: resultContent,
      type: contentType,
      buffer: updatedBuffer,
      isReasoning: isReasoning,
    };
  }
}
