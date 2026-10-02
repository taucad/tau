import { Body, Controller, Logger, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { convertToModelMessages, createUIMessageStreamResponse } from 'ai';
import type { UIMessageChunk } from 'ai';
import type { FastifyReply } from 'fastify';
import type { MyUIMessage, ToolSelection, ChatSnapshot, ContextPayload } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import type { KernelProvider } from '@taucad/runtime';
import { ChatService } from '#api/chat/chat.service.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { ModelService } from '#api/models/model.service.js';
import { FileEditService } from '#api/file-edit/file-edit.service.js';
import { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { CreateChatDto } from '#api/chat/chat.dto.js';
import { sendSimpleModelStream } from '#api/chat/utils/simple-model-stream.js';
import { injectSnapshotContext } from '#api/chat/utils/inject-snapshot-context.js';
import { createStaticToolTransform } from '#api/chat/utils/static-tool-transform.js';
import { createErrorTransform } from '#api/chat/utils/error-transform.js';
import { createToolOutputTransform } from '#api/chat/utils/tool-output-transform.js';
import { createNewlineTrimTransform } from '#api/chat/utils/newline-trim-transform.js';
import { createReasoningTimingTransform } from '#api/chat/utils/reasoning-timing-transform.js';
import { createLatexDelimiterTransform } from '#api/chat/utils/latex-delimiter-transform.js';
import { createTauEagerToolUiTransform } from '#api/chat/utils/tau-eager-tool-ui-transform.js';
import { EagerToolDispatchHandler } from '#api/chat/eager-dispatch/eager-tool-dispatch.handler.js';
import { ChatExceptionFilter } from '#api/chat/chat-exception.filter.js';
import { ChatAbortError, isChatAbortError, registerChatAbort } from '#api/chat/utils/chat-abort.js';
import { MetricsService } from '#telemetry/metrics.js';
import { Span } from '#telemetry/tracer.service.js';
import { AttributeKey } from '@taucad/telemetry';
import { TtftCallbackHandler } from '#api/chat/middleware/ttft-callback.handler.js';
import { validateImageParts } from '#api/chat/utils/validate-image-parts.js';
import { mergeCheckpointTail } from '#api/chat/utils/merge-checkpoint-tail.js';

type LangChainMessages = Awaited<ReturnType<typeof toBaseMessages>>;

type ChatRequestConfig = {
  modelId: string;
  kernel: KernelProvider;
  snapshot: ChatSnapshot | undefined;
  contextPayload: ContextPayload | undefined;
  mode: ChatMode;
  tools: {
    choice: ToolSelection;
    testingEnabled: boolean;
  };
};

@UseFilters(ChatExceptionFilter)
@UseGuards(AuthGuard)
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  public constructor(
    private readonly chatService: ChatService,
    private readonly chatRpcService: ChatRpcService,
    private readonly modelService: ModelService,
    private readonly fileEditService: FileEditService,
    private readonly geometryAnalysisService: GeometryAnalysisService,
    private readonly metricsService: MetricsService,
    private readonly checkpointerService: CheckpointerService,
  ) {}

  @Post()
  @Span()
  public async createChat(@Body() body: CreateChatDto, @Res() response: FastifyReply): Promise<void> {
    this.logger.debug(`Creating chat: ${body.id}`);

    switch (body.agent.profile) {
      case 'project_name': {
        const modelMessages = await convertToModelMessages(body.messages);
        const result = this.chatService.getBuildNameGenerator(modelMessages);
        return sendSimpleModelStream(response, result);
      }
      case 'commit_name': {
        const modelMessages = await convertToModelMessages(body.messages);
        const result = this.chatService.getCommitMessageGenerator(modelMessages);
        return sendSimpleModelStream(response, result);
      }
      case 'cad': {
        const { agent } = body;
        const langchainMessages = await this.prepareMessages(body.id, body.messages, agent.snapshot);

        return this.streamAgentResponse({
          chatId: body.id,
          messages: langchainMessages,
          modelId: agent.model,
          kernel: agent.kernel,
          mode: agent.mode,
          tools: { choice: agent.toolChoice, testingEnabled: agent.testingEnabled },
          contextPayload: agent.contextPayload,
          response,
        });
      }
    }
  }

  /**
   * Sets up client-disconnect abort handling, runs the LangGraph agent stream,
   * and pipes the result as an SSE response.
   */
  @Span()
  private async streamAgentResponse(options: {
    chatId: string;
    messages: LangChainMessages;
    modelId: string;
    kernel: KernelProvider;
    mode: ChatMode;
    tools: ChatRequestConfig['tools'];
    contextPayload: ContextPayload | undefined;
    response: FastifyReply;
  }): Promise<void> {
    const { chatId, messages, modelId, kernel, mode, tools, contextPayload, response } = options;

    // Abort the request if the client disconnects.
    // Listen on response.raw (ServerResponse) — for SSE, the response stream
    // stays open and its 'close' event fires when the client disconnects.
    // request.raw (IncomingMessage) fires 'close' when the POST body is consumed,
    // which is too early to detect SSE disconnects.
    const abortController = new AbortController();

    response.raw.on('close', () => {
      if (!response.raw.writableFinished) {
        registerChatAbort(chatId);
        abortController.abort(new ChatAbortError(chatId));
      }
    });

    // Register the abort signal on the RPC service so in-flight RPC calls
    // are rejected immediately when the client aborts, rather than waiting
    // for the 60s timeout
    this.chatRpcService.registerAbortSignal(chatId, abortController.signal);

    this.logger.debug(`Starting execution for thread: ${chatId}`);

    this.metricsService.sseActiveConnections.add(1);

    try {
      const eagerHandler = new EagerToolDispatchHandler({
        runnableConfigBaseline: {
          configurable: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph API requires snake_case
            thread_id: chatId,
            chatRpcService: this.chatRpcService,
            fileEditService: this.fileEditService,
            geometryAnalysisService: this.geometryAnalysisService,
          },
          signal: abortController.signal,
        },
      });

      const agent = await this.chatService.createAgent({
        chatId,
        modelId,
        kernel,
        mode,
        tools,
        contextPayload,
        eagerDispatchHandler: eagerHandler,
      });

      const ttftHandler = new TtftCallbackHandler(this.metricsService, this.modelService, modelId);

      const stream = await agent.graph.stream(
        { messages },
        {
          configurable: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph API requires snake_case
            thread_id: chatId,
            chatRpcService: this.chatRpcService,
            fileEditService: this.fileEditService,
            geometryAnalysisService: this.geometryAnalysisService,
          },
          signal: abortController.signal,
          streamMode: ['values', 'messages', 'custom'],
          callbacks: [ttftHandler, eagerHandler],
          context: {
            chatId,
            modelId,
            modelService: this.modelService,
            logger: this.logger,
          },
          recursionLimit: 2000,
        },
      );

      void response.header('content-type', 'text/event-stream');
      void response.header('cache-control', 'no-cache, no-store');
      void response.header('connection', 'keep-alive');
      void response.header('x-vercel-ai-ui-message-stream', 'v1');
      void response.header('x-accel-buffering', 'no');

      const uiMessageStream = toUIMessageStream(stream)
        // Stamp reasoning-start / reasoning-end with server-side timestamps
        // BEFORE any other transform that could mutate or wrap chunks. The
        // hot path (reasoning-delta) is a synchronous identity pass-through
        // so streaming throughput is unaffected.
        .pipeThrough(createReasoningTimingTransform())
        .pipeThrough(createTauEagerToolUiTransform())
        .pipeThrough(createStaticToolTransform())
        .pipeThrough(createToolOutputTransform())
        .pipeThrough(createNewlineTrimTransform())
        .pipeThrough(createLatexDelimiterTransform())
        .pipeThrough(createErrorTransform())
        .pipeThrough(this.createSseEventCountTransform());

      const uiMessageStreamResponse = createUIMessageStreamResponse({
        stream: uiMessageStream,
      });

      const responseBody = uiMessageStreamResponse.body;
      if (responseBody) {
        return await response.send(responseBody);
      }

      throw new Error('Failed to create UI message stream response');
    } catch (error) {
      // When the client disconnects, we abort with a branded ChatAbortError
      // reason. Check signal.reason for our brand — this is a definitive match
      // regardless of what error LangGraph/node-fetch actually throws.
      if (abortController.signal.aborted && isChatAbortError(abortController.signal.reason)) {
        this.logger.debug(`Chat ${chatId} was cancelled by client`);
        return;
      }

      throw error;
    } finally {
      this.metricsService.sseActiveConnections.add(-1);
    }
  }

  /**
   * Injects snapshot context into messages and converts to LangChain format.
   */
  private async prepareMessages(
    chatId: string,
    messages: CreateChatDto['messages'],
    snapshot: ChatSnapshot | undefined,
  ): Promise<LangChainMessages> {
    validateImageParts(messages);

    const messagesWithContext = snapshot ? injectSnapshotContext(messages, snapshot) : messages;

    if (snapshot) {
      const contextTypes = [
        snapshot.fileTree ? 'fileTree' : undefined,
        snapshot.activeFile ? 'activeFile' : undefined,
        snapshot.openFiles ? 'openFiles' : undefined,
      ]
        .filter(Boolean)
        .join(', ');
      this.logger.debug(`Injecting snapshot context into last message: ${contextTypes}`);
    }

    let mergedMessages = messagesWithContext as unknown as MyUIMessage[];

    try {
      const tuple = await this.checkpointerService.getCheckpointer().getTuple({
        configurable: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph API requires snake_case
          thread_id: chatId,
        },
      });

      if (tuple) {
        const channelValues = tuple.checkpoint.channel_values as { messages?: unknown[] } | undefined;
        mergedMessages = mergeCheckpointTail({
          requestMessages: mergedMessages,
          checkpointMessages: channelValues?.messages,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Checkpoint merge skipped for thread ${chatId}: ${reason}`);
    }

    return toBaseMessages(mergedMessages);
  }

  private createSseEventCountTransform(): TransformStream<UIMessageChunk, UIMessageChunk> {
    return new TransformStream({
      transform: (chunk, controller) => {
        this.metricsService.sseEvents.add(1, { [AttributeKey.SSE_EVENT_TYPE]: 'message' });
        controller.enqueue(chunk);
      },
    });
  }
}
