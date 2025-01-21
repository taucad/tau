import { Body, Controller, Get, Post, Logger, Sse, Req } from '@nestjs/common';
import { Observable } from 'rxjs';

import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START } from '@langchain/langgraph';
import { CreateChatInput } from './usecases/create-chat.usecase';

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
}

const STREAMED_EVENTS = [ChatEvent.OnChatModelStream, ChatEvent.OnChatModelEnd, ChatEvent.OnChatModelStart];

@Controller('chat')
export class ChatController {
  @Post()
  @Sse('sse')
  async getData(
    @Body() body: any,
  ): Promise<Observable<{ data: { status: string; timestamp: number; content?: string } }>> {
    console.log(body);
    // Define the tools for the agent to use
    const tools = [
      // new TavilySearchResults({ maxResults: 3 }),
      new SearxngSearch({
        params: {
          format: 'json', // Do not change this, format other than "json" is will throw error
          engines: 'google',
        },
        apiBase: 'http://localhost:42114',
        // Custom Headers to support rapidAPI authentication Or any instance that requires custom headers
        headers: {},
      }),
    ];
    const toolNode = new ToolNode(tools);

    // Create a model and give it access to the tools
    // const model = new ChatOllama({
    //   model: "llama3.2:latest",
    //   temperature: 0,
    // }).bindTools(tools);
    // const model = new ChatOllama({
    //   model: "llama3.2:latest",
    //   temperature: 0,
    // }).bindTools(tools,{tools});
    const model = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
    }).bindTools(tools);

    // Define the function that determines whether to continue or not
    function shouldContinue({ messages }: typeof MessagesAnnotation.State) {
      const lastMessage = messages.at(-1);

      // If the LLM makes a tool call, then we route to the ChatNode.Tools node
      if (lastMessage.additional_kwargs.tool_calls) {
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

    const inputs = {
      messages: body.messages,
    };

    const eventStream = graph.streamEvents(inputs, {
      streamMode: 'values',
      version: 'v2',
    });

    return new Observable((observer) => {
      (async () => {
        for await (const event of eventStream) {
          switch (event.event) {
            case ChatEvent.OnChatModelStream: {
              observer.next({
                data: { status: event.event, timestamp: Date.now(), content: event.data.chunk.content },
              });

              break;
            }
            case ChatEvent.OnChatModelStart: {
              Logger.log('Starting chat model');
              Logger.log(event);
              observer.next({ data: { status: event.event, timestamp: Date.now() } });

              break;
            }
            case ChatEvent.OnChatModelEnd: {
              observer.next({ data: { status: event.event, timestamp: Date.now() } });

              break;
            }
            default: {
              Logger.log(event.event);
            }
          }
        }
        observer.complete();
      })().catch((error) => observer.error(error));
    });
  }
}
