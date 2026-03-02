import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { createAgent } from 'langchain';
import type { ReactAgent } from 'langchain';
import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import type { KernelProvider } from '@taucad/kernels';
import type { ToolSelection } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { ModelService } from '#api/models/model.service.js';
import { usageTrackingMiddleware } from '#api/chat/middleware/usage-tracking.middleware.js';
import { messageLoggingMiddleware } from '#api/chat/middleware/message-logging.middleware.js';
import { toolErrorHandlerMiddleware } from '#api/chat/middleware/tool-error-handler.middleware.js';
import { createCachedSystemMessage } from '#api/chat/utils/create-cached-system-message.js';
import { ToolService } from '#api/tools/tool.service.js';
import { buildNameGenerationSystemPrompt } from '#api/chat/prompts/cad-name.prompt.js';
import { commitMessageGenerationSystemPrompt } from '#api/chat/prompts/git-commit.prompt.js';
import { getCadSystemPrompt } from '#api/chat/prompts/cad-agent.prompt.js';
import { toolResultTrimmerMiddleware } from '#api/chat/middleware/tool-result-trimmer.middleware.js';
import { promptCachingMiddleware } from '#api/chat/middleware/prompt-caching.middleware.js';
import { messageContentSanitizerMiddleware } from '#api/chat/middleware/message-content-sanitizer.middleware.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';

@Injectable()
export class ChatService {
  public constructor(
    private readonly modelService: ModelService,
    private readonly toolService: ToolService,
    private readonly checkpointerService: CheckpointerService,
  ) {}

  public getBuildNameGenerator(coreMessages: ModelMessage[]): ReturnType<typeof streamText> {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: buildNameGenerationSystemPrompt,
    });
  }

  public getCommitMessageGenerator(coreMessages: ModelMessage[]): ReturnType<typeof streamText> {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: commitMessageGenerationSystemPrompt,
    });
  }

  public async createAgent(options: {
    modelId: string;
    kernel: KernelProvider;
    mode?: ChatMode;
    tools: {
      choice: ToolSelection;
      testingEnabled?: boolean;
    };
  }): Promise<ReactAgent> {
    const { modelId, kernel, mode = 'agent' } = options;
    const { choice, testingEnabled = true } = options.tools;
    const { tools } = this.toolService.getTools(choice);

    const checkpointer = this.checkpointerService.getCheckpointer();

    const { model } = this.modelService.buildModel(modelId);

    // Combine all tools into a single array for the unified agent
    const allTools = [
      // CAD tools (testing tools conditionally included)
      ...(testingEnabled ? [tools.test_model, tools.edit_tests] : []),
      tools.get_kernel_result,
      tools.screenshot,
      // Filesystem tools
      tools.edit_file,
      tools.read_file,
      tools.list_directory,
      tools.create_file,
      tools.delete_file,
      tools.grep,
      tools.glob_search,
      // Research tools
      tools.web_search,
      tools.web_browser,
    ].filter((tool) => tool !== undefined);

    // ==========================================================================
    // Prompt Caching Strategy (2 breakpoints)
    // ==========================================================================
    // We use TWO cache breakpoints for optimal caching:
    //
    // 1. SYSTEM MESSAGE (here): Large (~15K+ tokens), stable content.
    //    - Cached via createCachedSystemMessage
    //    - Written once, read on every subsequent model call
    //    - Cannot be moved to middleware because systemPrompt is passed
    //      separately to createAgent, not in the messages array
    //
    // 2. LAST MESSAGE (middleware): Dynamic, growing conversation.
    //    - Cached via promptCachingMiddleware on every model call
    //    - Incrementally caches as conversation grows
    //    - Handles HumanMessage, AIMessage, and ToolMessage
    //
    // Anthropic allows up to 4 breakpoints per request. This 2-breakpoint
    // strategy ensures the stable system prompt is cached separately from
    // the dynamic conversation, maximizing cache hits.
    // ==========================================================================
    const systemPromptText = await getCadSystemPrompt(kernel, mode);
    const systemPrompt = createCachedSystemMessage(systemPromptText);

    const agent = createAgent({
      model,
      tools: allTools,
      systemPrompt,
      checkpointer,
      middleware: [
        // Handle tool errors and convert to structured JSON (must wrap tool calls)
        toolErrorHandlerMiddleware,
        // Trim tool results (e.g., remove base64 images) before sending to the LLM
        toolResultTrimmerMiddleware,
        // Ensure all AIMessages have text content (fixes interrupted thinking blocks)
        messageContentSanitizerMiddleware,
        // Add cache_control to last message for incremental caching (breakpoint 2)
        promptCachingMiddleware,
        // Log messages before each model call (for debugging)
        messageLoggingMiddleware,
        // Track token usage and costs after each model call
        usageTrackingMiddleware,
      ],
    });

    return agent;
  }
}
