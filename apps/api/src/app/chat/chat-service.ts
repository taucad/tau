import { Injectable, Logger } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START, Command } from '@langchain/langgraph';
import { streamText } from 'ai';
import type { CoreMessage, UIMessage } from 'ai';
import { ModelService } from '../models/model-service.js';
import { ToolService } from '../tools/tool-service.js';
import type { ToolChoiceWithCategory } from '../tools/tool-service.js';
import { nameGenerationSystemPrompt } from './prompts/chat-prompt-name.js';
import type { LangGraphAdapterCallbacks } from './utils/langgraph-adapter.js';

const chatNode = {
  start: START,
  end: END,
  agent: 'agent',
  tools: 'tools',
} as const satisfies Record<string, string>;

export type CreateChatBody = {
  messages: Array<
    UIMessage & {
      role: 'user';
      model: string;
      metadata: { toolChoice: ToolChoiceWithCategory };
    }
  >;
};

@Injectable()
export class ChatService {
  public constructor(
    private readonly modelService: ModelService,
    private readonly toolService: ToolService,
  ) {}

  public getNameGenerator(coreMessages: CoreMessage[]) {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: nameGenerationSystemPrompt,
    });
  }

  public createGraph(modelId: string, selectedToolChoice: ToolChoiceWithCategory) {
    const { tools } = this.toolService.getTools(selectedToolChoice);

    const toolNode = new ToolNode(tools);
    const { model: unboundModel, support } = this.modelService.buildModel(modelId);
    const model = support?.tools === false ? unboundModel : (unboundModel.bindTools?.(tools) ?? unboundModel);

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
