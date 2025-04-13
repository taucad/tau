import { Injectable, Logger } from '@nestjs/common';
import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import { openai } from '@ai-sdk/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START, Command } from '@langchain/langgraph';
import { streamText } from 'ai';
import type { CoreMessage, UIMessage } from 'ai';
import { ModelService } from '../models/model-service.js';
import { nameGenerationSystemPrompt } from './prompts/chat-prompt-name.js';
import type { LangGraphAdapterCallbacks } from './utils/langgraph-adapter.js';

const chatNode = {
  start: START,
  end: END,
  agent: 'agent',
  tools: 'tools',
} as const satisfies Record<string, string>;

type WebResult = {
  title: string;
  link: string;
  snippet: string;
};

export const toolChoice = {
  web: 'web',
  none: 'none',
  auto: 'auto',
  any: 'any',
} as const satisfies Record<string, string>;

export type ToolChoice = (typeof toolChoice)[keyof typeof toolChoice];

export const toolNameFromToolChoice = {
  [toolChoice.web]: SearxngSearch.prototype.name,
  [toolChoice.none]: 'none',
  [toolChoice.auto]: 'auto',
  [toolChoice.any]: 'any',
} as const satisfies Record<ToolChoice, string>;

export type CreateChatBody = {
  messages: Array<
    UIMessage & {
      role: 'user';
      model: string;
      metadata: { toolChoice: ToolChoice };
    }
  >;
};

export const toolChoiceFromToolName = {
  [SearxngSearch.name]: toolChoice.web,
} as const satisfies Record<string, ToolChoice>;

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
    const resolvedToolChoice = toolNameFromToolChoice[toolChoice];

    Logger.log({
      prototypeName: SearxngSearch.prototype.name,
      name: SearxngSearch.name,
    });

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
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses snake_case
            ...(support?.toolChoice === false ? {} : { tool_choice: resolvedToolChoice }),
          }) ?? unboundModel);

    // Define the function that calls the model
    async function agent(state: typeof MessagesAnnotation.State) {
      const message = await model.invoke(state.messages);

      // If the message has tool calls, go to the tools node
      // Otherwise go to the end node
      const gotoNode = message.tool_calls && message.tool_calls.length > 0 ? chatNode.tools : chatNode.end;

      return new Command({ update: { messages: [message] }, goto: gotoNode });
    }

    // Define a new graph
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode(chatNode.agent, agent, { ends: [chatNode.tools, chatNode.end] })
      .addNode(chatNode.tools, toolNode)
      .addEdge(chatNode.tools, chatNode.agent)
      .addEdge(chatNode.start, chatNode.agent);

    return workflow.compile();
  }

  public parseWebResults(content: string): WebResult[] {
    try {
      const results = JSON.parse(`[${content}]`) as WebResult;
      if (!Array.isArray(results)) {
        Logger.warn('Expected web results to be an array');
        return [];
      }

      return results;
    } catch (error) {
      Logger.error('Failed to parse web results', error);
      return [];
    }
  }

  public getCallbacks(): LangGraphAdapterCallbacks {
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
      onError(error) {
        Logger.error('Error in chat stream:', JSON.stringify(error, undefined, 2));
        return 'An error occurred while processing the request';
      },
    };
  }
}
