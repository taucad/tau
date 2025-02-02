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
      (async () => {
        for await (const streamEvent of eventStream) {
          switch (streamEvent.event) {
            case ChatEvent.OnChatModelStream: {
              if (streamEvent.data.chunk.content) {
                observer.next({
                  data: {
                    id,
                    status: streamEvent.event,
                    timestamp: Date.now(),
                    content: streamEvent.data.chunk.content,
                  },
                });
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
              // The tool doesn't return the results in a fully structured format, so we need to wrap it in an array and parse it
              const results = JSON.parse(`[${streamEvent.data.output.content}]`);
              console.log({ results, data: streamEvent.data });
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
}
