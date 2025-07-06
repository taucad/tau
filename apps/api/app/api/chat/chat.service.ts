import { Injectable, Logger } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createSupervisor } from '@langchain/langgraph-supervisor';
import { streamText } from 'ai';
import type { CoreMessage } from 'ai';
import { ModelService } from '~/api/models/model.service.js';
import type { ToolChoiceWithCategory } from '~/api/tools/tool.service.js';
import { ToolService } from '~/api/tools/tool.service.js';
import { nameGenerationSystemPrompt } from '~/api/chat/prompts/chat-prompt-name.js';
import type { LangGraphAdapterCallbacks } from '~/api/chat/utils/langgraph-adapter.js';
import { getCadSystemPrompt } from '~/api/chat/prompts/chat-prompt-cad.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
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
  public async createGraph(modelId: string, selectedToolChoice: ToolChoiceWithCategory) {
    const { tools } = this.toolService.getTools(selectedToolChoice);

    const researchTools = [tools.web_search, tools.web_browser];
    const { model: supervisorModel } = this.modelService.buildModel(modelId);
    const { model: cadModel, support: cadSupport } = this.modelService.buildModel(modelId);
    const { model: researchModel, support: researchSupport } = this.modelService.buildModel(modelId);

    // Create specialized agents for tool usage
    const researchAgent = createReactAgent({
      llm:
        researchSupport?.tools === false ? researchModel : (researchModel.bindTools?.(researchTools) ?? researchModel),
      tools: researchTools,
      name: 'research_expert',
      prompt: `You are a research expert that can use specialized tools to accomplish tasks. 
        Always use the web_search tool, and only the web_browser tool if the web_search tool does not supply enough information.`,
    });

    // Create a general agent for handling direct responses
    const cadTools = [tools.edit_file];
    const cadSystemPrompt = await getCadSystemPrompt();
    const cadAgent = createReactAgent({
      llm: cadSupport?.tools === false ? cadModel : (cadModel.bindTools?.(cadTools) ?? cadModel),
      tools: cadTools,
      name: 'cad_expert',
      prompt: cadSystemPrompt,
    });

    // Create a supervisor to orchestrate these agents
    const supervisor = createSupervisor({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO: fix types
      agents: [researchAgent, cadAgent],
      llm: supervisorModel,
      prompt: `You are an intelligent supervisor coordinating a specialized team consisting of a research expert and a CAD expert. Your primary role is to understand user requests and delegate them to the most appropriate team member based on their expertise and available tools.

# Core Delegation Philosophy
Your strength lies in thoughtful delegation rather than direct tool usage. You serve as an intelligent router, ensuring that each request reaches the team member best equipped to handle it effectively. You do not use tools directly; instead, you leverage your team's specialized capabilities through the transfer system.

# Task Routing Guidelines
When users ask questions or make requests, you should:

**For 3D modeling, CAD work, or file editing requests**: Immediately transfer to the CAD expert using the transfer_to_cad_expert tool. This includes any requests involving changes to 3D models, geometric modifications, design alterations, or file manipulation tasks. The CAD expert has specialized tools and knowledge for these technical operations.

**For research, information gathering, or web-based queries**: Use the transfer_to_research_expert tool when the request requires external information, current data, or specialized research capabilities. The research expert can access web resources and gather comprehensive information to answer complex queries.

**For error handling and iterative fixes**: When the conversation contains code errors, kernel errors, or any error feedback from previous CAD modeling attempts, ALWAYS route back to the CAD expert using transfer_to_cad_expert. The CAD expert is specifically trained to handle iterative error correction and can automatically fix compilation errors, geometric failures, and runtime issues. This ensures a seamless modeling experience where errors are resolved without user intervention.

# Error Detection and Routing
Pay special attention to messages that contain:
- Code compilation errors or JavaScript errors
- Kernel errors from the Replicad/OpenCascade system
- Geometric operation failures
- Runtime exceptions from 3D modeling operations
- Screenshots or visual feedback from rendered CAD models
- Any mention of "error", "failed", "exception", or similar error indicators
- Design iteration requests based on visual inspection of the model

When any of these error conditions are present, immediately route to the CAD expert for resolution, even if the original request might seem like a research question. The CAD expert has the specialized knowledge and tools to diagnose and fix these technical issues.

Additionally, when screenshots of rendered models are provided in the conversation, always route to the CAD expert as they can use this visual feedback to iteratively refine the design to better match the user's intended requirements.

# Communication Style
When receiving responses back from your team members, maintain efficiency by being concise and focused. Once a team member has provided their response, you should synthesize their findings briefly and conclude the interaction rather than extending the conversation unnecessarily.

Your goal is to ensure users receive expert-level assistance by connecting them with the right specialist for their specific needs, while maintaining a smooth and efficient workflow that automatically handles technical errors through iterative refinement.`,
      outputMode: 'full_history', // Include full agent message history
    }).compile();

    return supervisor;
  }

  public getCallbacks(): LangGraphAdapterCallbacks {
    const { logger } = this;
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
        logger.debug(`onEvent: ${JSON.stringify(parameters.event)}`);
      },
      onError(error) {
        if (error instanceof Error && error.message === 'Aborted') {
          logger.warn('Request aborted');
          return 'The request was aborted';
        }

        logger.error('Error in chat stream follows:');
        logger.error(error);
        const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing the request';

        return errorMessage;
      },
    };
  }
}
