import { Injectable, Logger } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { createSupervisor } from '@langchain/langgraph-supervisor';
import { streamText } from 'ai';
import type { CoreMessage } from 'ai';
import { ModelService } from '../models/model-service.js';
import type { ToolChoiceWithCategory } from '../tools/tool-service.js';
import { ToolService } from '../tools/tool-service.js';
import { nameGenerationSystemPrompt } from './prompts/chat-prompt-name.js';
import type { LangGraphAdapterCallbacks } from './utils/langgraph-adapter.js';

@Injectable()
export class ChatService {
  public constructor(
    private readonly modelService: ModelService,
    private readonly toolService: ToolService,
  ) {}

  public getNameGenerator(coreMessages: CoreMessage[]): ReturnType<typeof streamText> {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: nameGenerationSystemPrompt,
    });
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- This is a complex generic that can be left inferred.
  public createGraph(modelId: string, selectedToolChoice: ToolChoiceWithCategory) {
    const { tools } = this.toolService.getTools(selectedToolChoice);

    const toolNode = new ToolNode(tools);
    const { model: unboundModel, support } = this.modelService.buildModel(modelId);
    const model = support?.tools === false ? unboundModel : (unboundModel.bindTools?.(tools) ?? unboundModel);

    // Create specialized agents for tool usage
    const researchAgent = createReactAgent({
      llm: model,
      tools: toolNode,
      name: 'research_expert',
      prompt:
        'You are a research expert that can use specialized tools to accomplish tasks. Always use tools when appropriate.',
    });

    // Create a general agent for handling direct responses
    const directResponseAgent = createReactAgent({
      llm: unboundModel,
      tools: [], // No tools for direct responses
      name: 'conversational_expert',
      prompt:
        'You are a conversational expert who responds directly to user queries. You provide thoughtful, helpful responses without using tools.',
    });

    // Create a supervisor to orchestrate these agents
    const supervisor = createSupervisor({
      agents: [researchAgent, directResponseAgent],
      llm: unboundModel,
      prompt:
        'You are a team supervisor managing a research expert and a conversational expert. ' +
        'For queries that need external information or specific tool operations, use research_expert. ' +
        "For general questions and conversations that don't require tools, use conversational_expert." +
        'When you receive a transfer back, be concise and end the conversation.',
      outputMode: 'full_history', // Include full agent message history
    }).compile();

    return supervisor;
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
      onEvent(parameters) {
        console.log('onEvent', parameters);
      },
      onError(error) {
        Logger.error('Error in chat stream follows:');
        Logger.error(error);
        return 'An error occurred while processing the request';
      },
    };
  }
}
