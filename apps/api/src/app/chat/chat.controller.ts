import { Body, Controller, Post, Logger, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';

import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import { AIMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START } from '@langchain/langgraph';
import { randomUUID } from 'node:crypto';
import { ModelService } from './model.service';

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
}

type CreateChatBody = {
  messages: any[];
  model: string;
};

@Controller('chat')
export class ChatController {
  constructor(private readonly modelService: ModelService) {}

  @Post()
  @Sse('sse')
  async getData(@Body() body: CreateChatBody): Promise<
    Observable<{
      data: {
        id: string;
        status: string;
        type?: 'text' | 'thinking';
        timestamp: number;
        content?: string | { input?: any; output?: any; description?: string };
      };
    }>
  > {
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
    const { model: unboundModel, support } = this.modelService.buildModel(body.model);
    const model = support?.tools === false ? unboundModel : (unboundModel.bindTools?.(tools) ?? unboundModel);

    // Define the function that det ermines whether to continue or not
    function shouldContinue({ messages }: typeof MessagesAnnotation.State) {
      const lastMessage = messages.at(-1) as AIMessage;

      // If the LLM makes a tool call, then we route to the ChatNode.Tools node
      if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        return ChatNode.Tools;
      }
      // Otherwise, we stop (reply to the user) using the special "__end__" node
      return ChatNode.End;
    }

    // Define the function that calls the model
    async function callModel(state: typeof MessagesAnnotation.State) {
      const response = await model.invoke(state.messages);

      // We return a list, because this will get added to the existing list
      return { messages: [response] };
    }

    // Define a new graph
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode(ChatNode.Agent, callModel)
      .addEdge(ChatNode.Start, ChatNode.Agent)
      .addNode(ChatNode.Tools, toolNode)
      .addEdge(ChatNode.Tools, ChatNode.Agent)
      .addConditionalEdges(ChatNode.Agent, shouldContinue);

    // Finally, we compile it into a LangChain Runnable.
    const graph = workflow.compile();

    const textFromHint = {
      search: "Search the web for information. Use the search results to answer the user's question directly.",
    };

    // Add hints to the messages
    const messagesWithHints = body.messages.map((message) => {
      if (message.metadata?.systemHints) {
        return {
          ...message,
          content: `${message.metadata.systemHints
            .map((hint: string) => textFromHint[hint as keyof typeof textFromHint])
            .join(' ')} ${message.content}`,
        };
      }
      return message;
    });

    const inputs: typeof MessagesAnnotation.State = {
      messages: messagesWithHints,
    };

    const eventStream = graph.streamEvents(inputs, {
      streamMode: 'values',
      version: 'v2',
    });

    return new Observable((observer) => {
      const id = randomUUID();

      // Keep thinking state in Observable scope (per-request)
      let thinkingBuffer = '';
      let isThinking = false;

      (async () => {
        for await (const streamEvent of eventStream) {
          switch (streamEvent.event) {
            case ChatEvent.OnChatModelStream: {
              if (streamEvent.data.chunk.content) {
                const streamedContent = streamEvent.data.chunk.content;
                let content: string | undefined;
                let type: 'text' | 'thinking' = 'text';

                if (typeof streamedContent === 'string') {
                  // Process string content to detect thinking tags
                  const processedContent = this.processThinkingTags(streamedContent, thinkingBuffer, isThinking);
                  content = processedContent.content;
                  type = processedContent.type;
                  // Update state after processing
                  thinkingBuffer = processedContent.buffer;
                  isThinking = processedContent.isThinking;
                } else {
                  // Handle anthropic streaming
                  if (streamedContent.length > 0) {
                    // TODO: handle joining multiple chunks?
                    type = streamedContent[0].type;
                    if (type === 'text') {
                      content = streamedContent[0].text;
                    } else if (type === 'thinking') {
                      content = streamedContent[0].thinking;
                    }
                  }
                }

                if (content) {
                  observer.next({
                    data: {
                      id,
                      status: streamEvent.event,
                      type,
                      timestamp: Date.now(),
                      content,
                    },
                  });
                }
              }

              break;
            }
            case ChatEvent.OnChatModelStart: {
              observer.next({ data: { id, status: streamEvent.event, timestamp: Date.now() } });

              break;
            }
            case ChatEvent.OnChatModelEnd: {
              observer.next({ data: { id, status: streamEvent.event, timestamp: Date.now() } });

              break;
            }
            case ChatEvent.OnToolStart: {
              observer.next({
                data: {
                  id,
                  status: streamEvent.event,
                  timestamp: Date.now(),
                  content: {
                    description: 'Searching the web',
                    input: streamEvent.data.input.input,
                  },
                },
              });
              break;
            }
            case ChatEvent.OnToolEnd: {
              // The searxng tool doesn't return the results in a fully structured format, so we need to wrap it in an array and parse it
              const results = JSON.parse(`[${streamEvent.data.output.content}]`);
              observer.next({
                data: {
                  id,
                  status: streamEvent.event,
                  timestamp: Date.now(),
                  content: {
                    description: `Found ${results.length} results`,
                    input: streamEvent.data.input.input,
                    output: results,
                  },
                },
              });
              break;
            }
            default:
          }
        }
        observer.complete();
      })().catch((error) => {
        Logger.error(error);
        observer.error(error);
      });
    });
  }

  /**
   * Process streaming content to detect <think> and </think> tags.
   * @param chunk Current text chunk from the stream
   * @param buffer Current buffer state
   * @param isThinking Current thinking mode state
   * @returns Processed content, type, and updated state
   */
  private processThinkingTags(
    chunk: string,
    buffer: string,
    isThinking: boolean,
  ): {
    content: string;
    type: 'text' | 'thinking';
    buffer: string;
    isThinking: boolean;
  } {
    // Add the current chunk to the buffer
    let updatedBuffer = buffer + chunk;

    // Check for opening and closing tags
    const openTagIndex = updatedBuffer.indexOf('<think>');
    const closeTagIndex = updatedBuffer.indexOf('</think>');

    let resultContent = '';
    let contentType: 'text' | 'thinking' = isThinking ? 'thinking' : 'text';

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
          contentType = 'thinking';
        }

        // Update buffer to content after the closing tag
        updatedBuffer = updatedBuffer.slice(closeTagIndex + 8);
        isThinking = false;

        // If there's remaining content, recursively process it
        if (updatedBuffer.length > 0) {
          const nextProcess = this.processThinkingTags('', updatedBuffer, isThinking);
          if (nextProcess.content) {
            // If the next chunk has content with a different type, we'll send separate chunks
            return {
              content: resultContent,
              type: contentType,
              buffer: nextProcess.buffer,
              isThinking: nextProcess.isThinking,
            };
          }
          // Update with the recursive call results
          updatedBuffer = nextProcess.buffer;
          isThinking = nextProcess.isThinking;
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
        // We're entering thinking mode
        isThinking = true;
        resultContent = updatedBuffer.slice(7); // Skip "<think>"
        updatedBuffer = '';
        contentType = 'thinking';
      }
    } else if (closeTagIndex === -1) {
      // No tags found, return current chunk with current mode
      resultContent = updatedBuffer;
      updatedBuffer = '';
    } else {
      // Only closing tag found
      resultContent = updatedBuffer.slice(0, closeTagIndex);
      updatedBuffer = updatedBuffer.slice(closeTagIndex + 8);
      isThinking = false;
      contentType = 'thinking';

      // If there's remaining content, process it
      if (updatedBuffer.length > 0) {
        const nextProcess = this.processThinkingTags('', updatedBuffer, isThinking);
        if (nextProcess.content) {
          return {
            content: resultContent,
            type: contentType,
            buffer: nextProcess.buffer,
            isThinking: nextProcess.isThinking,
          };
        }
        // Update with the recursive call results
        updatedBuffer = nextProcess.buffer;
        isThinking = nextProcess.isThinking;
      }
    }

    return {
      content: resultContent,
      type: contentType,
      buffer: updatedBuffer,
      isThinking: isThinking,
    };
  }
}
