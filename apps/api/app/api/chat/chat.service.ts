import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { createAgent } from 'langchain';
import type { ReactAgent } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { createWriterCaptureMiddleware } from '#api/chat/eager-dispatch/writer-capture.middleware.js';
import { createEagerDispatchMiddleware } from '#api/chat/middleware/eager-dispatch.middleware.js';
import type { EagerToolDispatchHandler } from '#api/chat/eager-dispatch/eager-tool-dispatch.handler.js';
import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import type { KernelProvider } from '@taucad/runtime';
import type { ToolSelection, ContextPayload } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { ModelService } from '#api/models/model.service.js';
import { createUsageTrackingMiddleware } from '#api/chat/middleware/usage-tracking.middleware.js';
import { createTokenUsageContextMiddleware } from '#api/chat/middleware/token-usage-context.middleware.js';
import { createToolMetricsMiddleware } from '#api/chat/middleware/tool-metrics.middleware.js';
import { createLlmTimingMiddleware } from '#api/chat/middleware/llm-timing.middleware.js';
import { createAgentIterationsMiddleware } from '#api/chat/middleware/agent-iterations.middleware.js';
import { MetricsService } from '#telemetry/metrics.js';
import { AttributeKey } from '@taucad/telemetry';
import { messageLoggingMiddleware } from '#api/chat/middleware/message-logging.middleware.js';
import { toolErrorHandlerMiddleware } from '#api/chat/middleware/tool-error-handler.middleware.js';
import { createCachedSystemMessage } from '#api/chat/utils/create-cached-system-message.js';
import { ToolService } from '#api/tools/tool.service.js';
import { projectNameGenerationSystemPrompt } from '#api/chat/prompts/cad-name.prompt.js';
import { commitMessageGenerationSystemPrompt } from '#api/chat/prompts/git-commit.prompt.js';
import { getCadSystemPrompt } from '#api/chat/prompts/cad-agent.prompt.js';
import { toolResultTrimmerMiddleware } from '#api/chat/middleware/tool-result-trimmer.middleware.js';
import { createPromptCachingMiddleware } from '#api/chat/middleware/prompt-caching.middleware.js';
import { messageContentSanitizerMiddleware } from '#api/chat/middleware/message-content-sanitizer.middleware.js';
import { createCrossProviderContentNormalizerMiddleware } from '#api/chat/middleware/cross-provider-content-normalizer.middleware.js';
import { latexDelimiterMiddleware } from '#api/chat/middleware/latex-delimiter.middleware.js';
import { newlineTrimmerMiddleware } from '#api/chat/middleware/newline-trimmer.middleware.js';
import { createAgentSafeguardsMiddleware } from '#api/chat/middleware/agent-safeguards.middleware.js';
import { createInterruptRecoveryMiddleware } from '#api/chat/middleware/interrupt-recovery.middleware.js';
import { createCompactionMiddleware } from '#api/chat/middleware/compaction.middleware.js';
import { createToolOffloadingMiddleware } from '#api/chat/middleware/tool-offloading.middleware.js';
import { createToolResultBudgetMiddleware } from '#api/chat/middleware/tool-result-budget.middleware.js';
import { createTranscriptMiddleware } from '#api/chat/middleware/transcript.middleware.js';
import { createContextUsageMiddleware } from '#api/chat/middleware/context-usage.middleware.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';
import { StoreService } from '#api/chat/store.service.js';
import { CompactionService } from '#api/chat/compaction.service.js';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { createClientContextMiddleware } from '#api/chat/middleware/client-context.middleware.js';
import { Span } from '#telemetry/tracer.service.js';

@Injectable()
export class ChatService {
  public constructor(
    private readonly modelService: ModelService,
    private readonly toolService: ToolService,
    private readonly checkpointerService: CheckpointerService,
    private readonly storeService: StoreService,
    private readonly metricsService: MetricsService,
    private readonly compactionService: CompactionService,
    private readonly rpcBackendFactory: TauRpcBackendFactory,
    private readonly chatRpcService: ChatRpcService,
  ) {}

  @Span()
  public async createAgent(options: {
    chatId: string;
    modelId: string;
    kernel: KernelProvider;
    /**
     * Required. The controller resolves `mode` from the validated
     * top-level `agent` block (see `chat.dto.ts` `chatTurnRequestSchema`);
     * we do not silently default at this layer because that masks API
     * contract drift one layer downstream.
     */
    mode: ChatMode;
    tools: {
      choice: ToolSelection;
      /** Required for the same reason as `mode`. */
      testingEnabled: boolean;
    };
    contextPayload?: ContextPayload;
    eagerDispatchHandler?: EagerToolDispatchHandler;
  }): Promise<ReactAgent> {
    const { chatId, modelId, kernel, mode, contextPayload, eagerDispatchHandler } = options;
    const { choice, testingEnabled } = options.tools;
    const { tools } = this.toolService.getTools(choice, kernel);

    const checkpointer = this.checkpointerService.getCheckpointer();
    const store = this.storeService.getStore();

    const { model } = this.modelService.buildModel(modelId);

    const providerId = this.modelService.getProviderId(modelId);
    if (!providerId) {
      throw new Error(`Could not resolve provider for model ${modelId}`);
    }

    // Combine all tools into a single array for the unified agent
    const allTools = [
      // CAD tools (testing tools conditionally included)
      ...(testingEnabled ? [tools.test_model, tools.edit_tests] : []),
      tools.get_kernel_result,
      tools.export_geometry,
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
    // Prompt Caching Strategy (3 breakpoints)
    // ==========================================================================
    // Block 1 (static): Globally-cached system prompt (role, workflow, kernel config)
    //   → cache_control: { type: 'ephemeral', scope: 'global' } (Anthropic only)
    // Block 2 (workspace): Skills + memory, injected by clientContextMiddleware
    //   → cache_control: { type: 'ephemeral' }
    // Block 3 (dynamic): Per-request content (model info, transcript path)
    //   → No cache_control
    // Last message: Incremental conversation caching via promptCachingMiddleware
    //   → cache_control: { type: 'ephemeral' }
    //
    // 3 of 4 Anthropic breakpoint slots used, 1 reserved.
    // ==========================================================================
    const contextWindow = this.modelService.getContextWindow(modelId);
    const knowledgeCutoff = this.modelService.getKnowledgeCutoff(modelId);
    const { static: staticPrompt, dynamic: dynamicPrompt } = await getCadSystemPrompt(kernel, mode, testingEnabled, {
      chatId,
      modelId,
      contextWindow,
      knowledgeCutoff,
      // Per-section telemetry — record byte size of every non-empty section
      // so Grafana can show which sections dominate the static prefix and
      // which dynamic sections invalidate the cache the most.
      onSectionResolved: ({ name, cacheBreak, byteSize }) => {
        this.metricsService.genAiPromptSectionSize.record(byteSize, {
          [AttributeKey.GEN_AI_PROMPT_SECTION_NAME]: name,
          [AttributeKey.GEN_AI_PROMPT_SECTION_CACHE_BREAK]: cacheBreak ? 'true' : 'false',
          [AttributeKey.GEN_AI_REQUEST_MODEL]: modelId,
        });
      },
    });
    // Global cache scope is currently disabled: enabling it requires the
    // `prompt-caching-scope-2026-01-05` Anthropic beta on the configured API key.
    // When the beta is available switch this to `getProviderId(modelId) === 'anthropic'`.
    const useGlobalScope = false;
    const systemPrompt = createCachedSystemMessage({ staticPrompt, dynamicPrompt, useGlobalScope });

    const agent = createAgent({
      model,
      tools: allTools,
      systemPrompt,
      checkpointer,
      store,
      middleware: [
        // --- Metrics and error handling ---
        createToolMetricsMiddleware(this.metricsService),
        toolErrorHandlerMiddleware,

        ...(eagerDispatchHandler
          ? [createWriterCaptureMiddleware(eagerDispatchHandler), createEagerDispatchMiddleware(eagerDispatchHandler)]
          : []),

        // --- Context prevention (offload large tool results before trimming) ---
        createToolOffloadingMiddleware(this.rpcBackendFactory, this.metricsService),
        createToolResultBudgetMiddleware(this.rpcBackendFactory, this.metricsService),
        toolResultTrimmerMiddleware,

        // --- Context compaction ---
        createCompactionMiddleware(this.compactionService, this.rpcBackendFactory, this.chatRpcService),

        // --- Token-usage context ---
        // Inserted AFTER compaction so the reported "used" count reflects the
        // post-compaction message set, and BEFORE agent-safeguards / prompt
        // caching so the injected <system-reminder> joins the cacheable prefix
        // (see the cache-safety contract in token-usage-context.middleware.ts).
        createTokenUsageContextMiddleware(),

        // --- Agent loop safeguards (doom-loop detection) ---
        // Inserted AFTER compaction so detectors see the post-compaction message
        // tail, and BEFORE messageContentSanitizer / promptCaching so that
        // injected <system-reminder> nudges become part of the cacheable prefix
        // (see docs/research/agent-loop-safeguards.md, "Cache-Safety Contract").
        createAgentSafeguardsMiddleware(this.metricsService, this.chatRpcService),

        // --- Turn-level interrupt recovery ---
        // Detects the most recent contiguous tail of `USER_INTERRUPTED`
        // ToolMessages and injects a one-shot `<system-reminder>` so the LLM
        // verifies state before retrying. Mirrors the Claude Code / Codex
        // turn-level guidance pattern; see
        // docs/research/agent-interrupt-durability-comparison.md.
        createInterruptRecoveryMiddleware(this.metricsService),

        // --- Message processing ---
        createCrossProviderContentNormalizerMiddleware(providerId),
        messageContentSanitizerMiddleware,
        newlineTrimmerMiddleware,
        latexDelimiterMiddleware,

        // --- Prompt caching (must follow compaction) ---
        createPromptCachingMiddleware(providerId),

        // --- Logging and observability ---
        messageLoggingMiddleware,
        createLlmTimingMiddleware(this.metricsService),
        createAgentIterationsMiddleware(this.metricsService),
        createUsageTrackingMiddleware(this.metricsService),
        createContextUsageMiddleware(),

        // --- Transcript (captures final state) ---
        createTranscriptMiddleware(this.chatRpcService),

        // --- Client-side context injection (skills catalog + AGENTS.md memory) ---
        createClientContextMiddleware(contextPayload),
      ],
    });

    if (eagerDispatchHandler) {
      eagerDispatchHandler.bindTools(allTools as StructuredToolInterface[]);
    }

    return agent;
  }

  public getBuildNameGenerator(coreMessages: ModelMessage[]): ReturnType<typeof streamText> {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: projectNameGenerationSystemPrompt,
    });
  }

  public getCommitMessageGenerator(coreMessages: ModelMessage[]): ReturnType<typeof streamText> {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: commitMessageGenerationSystemPrompt,
    });
  }
}
