import { Body, Controller, Post, Logger, Res } from '@nestjs/common';

import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import { openai } from '@ai-sdk/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START, Command } from '@langchain/langgraph';
import { ModelService } from './model.service';
import { convertToCoreMessages, pipeDataStreamToResponse, streamText, UIMessage } from 'ai';
import { nameGenerationSystemPrompt } from './chat-prompt-name';
import { generatePrefixedId, PREFIX_TYPES } from '../utils/id';
import { convertAiSdkMessagesToLangchainMessages } from '../utils/messages';
import { Response } from 'express';
import { LangGraphAdapter } from './langgraph-adapter';

enum ChatNode {
  Start = START,
  End = END,
  Agent = 'agent',
  Tools = 'tools',
}

type SearchResult = {
  title: string;
  link: string;
  snippet: string;
};

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

    // Use the LangGraphAdapter to handle the response
    LangGraphAdapter.toDataStreamResponse(eventStream, {
      response,
      modelId,
      toolTypeMap: TOOL_TYPE_FROM_TOOL_NAME,
      parseToolResults: {
        web: (content) => {
          try {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Searxng returns a JSON array of search results
            const results = JSON.parse(`[${content}]`) as SearchResult[];
            if (!Array.isArray(results)) {
              Logger.warn('Expected search results to be an array');
              return [];
            }
            return results;
          } catch (error) {
            Logger.error('Failed to parse search results', error);
            return [];
          }
        },
      },
      callbacks: {
        // onToolEnd: (dataStream, toolCallId, toolName, results) => {
        //   // Generate sources from the results
        //   const searchResults = results as SearchResult[];
        //   for (const result of searchResults) {
        //     // Type check for required properties
        //     if (!result.title || !result.link || !result.snippet) {
        //       Logger.warn('Incomplete search result detected:', result);
        //       continue;
        //     }

        //     dataStream.writePart('source', {
        //       title: result.title,
        //       url: result.link,
        //       sourceType: 'url',
        //       id: generatePrefixedId(PREFIX_TYPES.SOURCE),
        //       providerMetadata: {
        //         snippet: result.snippet,
        //       },
        //     });
        //   }
        // },
        onMessageComplete: ({ dataStream, modelId, usageTokens }) => {
          // Normalize the usage tokens
          const normalizedUsageTokens = this.modelService.normalizeUsageTokens(modelId, usageTokens);

          // Get the cost
          const usageCost = this.modelService.getModelCost(modelId, normalizedUsageTokens);

          // Write message annotations with usage and cost information
          dataStream.writePart('message_annotations', [
            {
              type: 'usage',
              usageCost,
              usageTokens: normalizedUsageTokens,
              model: modelId,
            },
          ]);
        },
        onError: (error) => {
          Logger.error('Error in chat stream:', JSON.stringify(error, undefined, 2));
          return 'An error occurred while processing the request';
        },
      },
    });
  }
}
