import { Injectable, Logger } from '@nestjs/common';
import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import { openai } from '@ai-sdk/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START, Command } from '@langchain/langgraph';
import { CoreMessage, streamText, UIMessage } from 'ai';
import { ModelService } from '../models/model.service';
import { nameGenerationSystemPrompt } from './prompts/chat-prompt-name';
import { LangGraphAdapterCallbacks } from './utils/langgraph-adapter';

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

const TEXT_FROM_HINT = {
  web: SearxngSearch.prototype.name,
  none: 'none',
  auto: 'auto',
  any: 'any',
} as const;

export type ToolChoice = 'web' | 'none' | 'auto' | 'any';

export type CreateChatBody = {
  messages: (UIMessage & {
    role: 'user';
    model: string;
    metadata: { toolChoice: ToolChoice };
  })[];
};

export const TOOL_TYPE_FROM_TOOL_NAME = {
  [SearxngSearch.name]: 'web',
} as const;

@Injectable()
export class ChatService {
  public constructor(private readonly modelService: ModelService) {}

  public getNameGenerator(coreMessages: CoreMessage[]) {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: nameGenerationSystemPrompt,
    });
  }

  public createGraph(modelId: string, toolChoice: ToolChoice) {
    const resolvedToolChoice = TEXT_FROM_HINT[toolChoice];

    // Define the tools for the agent to use
    const tools = [
      new SearxngSearch({
        params: {
          format: 'json',
          engines: 'google,bing,duckduckgo,wikipedia,youtube',
          numResults: 10,
        },
        apiBase: 'http://localhost:42114',
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

      const gotoNode = message.tool_calls && message.tool_calls.length > 0 ? ChatNode.Tools : ChatNode.End;

      return new Command({ update: { messages: [message] }, goto: gotoNode });
    }

    // Define a new graph
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode(ChatNode.Agent, agent, { ends: [ChatNode.Tools, ChatNode.End] })
      .addNode(ChatNode.Tools, toolNode)
      .addEdge(ChatNode.Tools, ChatNode.Agent)
      .addEdge(ChatNode.Start, ChatNode.Agent);

    return workflow.compile();
  }

  public parseSearchResults(content: string): SearchResult[] {
    try {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- safe to assert
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
  }

  public getCallbacks(modelId: string): LangGraphAdapterCallbacks {
    return {
      onMessageComplete: ({ dataStream, modelId: id, usageTokens }) => {
        const normalizedUsageTokens = this.modelService.normalizeUsageTokens(id, usageTokens);
        const usageCost = this.modelService.getModelCost(id, normalizedUsageTokens);

        dataStream.writePart('message_annotations', [
          {
            type: 'usage',
            usageCost,
            usageTokens: normalizedUsageTokens,
            model: id,
          },
        ]);
      },
      onError: (error) => {
        Logger.error('Error in chat stream:', JSON.stringify(error, undefined, 2));
        return 'An error occurred while processing the request';
      },
    };
  }
}
