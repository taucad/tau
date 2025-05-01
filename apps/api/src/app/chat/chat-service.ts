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
import { replicadSystemPrompt } from './prompts/chat-prompt-replicad.js';

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
        'You are a research expert that can use specialized tools to accomplish tasks. Always use the web_search tool, and only the web_browser tool if the web_search tool does not supply enough information.',
    });

    // Create a general agent for handling direct responses
    const cadAgent = createReactAgent({
      llm: unboundModel,
      tools: [], // No tools for direct responses
      name: 'cad_agent',
      prompt: replicadSystemPrompt,
    });

    // Create a supervisor to orchestrate these agents
    const supervisor = createSupervisor({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO: fix types
      agents: [researchAgent, cadAgent],
      llm: unboundModel,
      prompt:
        'You are a team supervisor managing a research expert and a CAD agent. ' +
        'For queries that need external information or specific tool operations, use research_expert. ' +
        'For queries that list a 3D object, use cad_agent.' +
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
        console.log('onEvent', parameters.event);
      },
      onError(error) {
        if (error instanceof Error && error.message === 'Aborted') {
          Logger.warn('Request aborted');
          return 'The request was aborted';
        }

        Logger.error('Error in chat stream follows:');
        Logger.error(error);
        return 'An error occurred while processing the request';
      },
    };
  }
}
