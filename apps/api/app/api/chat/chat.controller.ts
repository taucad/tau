import { Body, Controller, Logger, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import { toUIMessageStream } from '@ai-sdk/langchain';
import { convertToModelMessages, createUIMessageStreamResponse } from 'ai';
import type { UIMessageChunk } from 'ai';
import type { FastifyReply } from 'fastify';
import type { AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import type { ToolSelection, ChatSnapshot, ContextPayload } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import type { KernelProvider } from '@taucad/runtime';
import { ChatService } from '#api/chat/chat.service.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { ModelService } from '#api/models/model.service.js';
import { FileEditService } from '#api/file-edit/file-edit.service.js';
import { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { CreateChatDto } from '#api/chat/chat.dto.js';
import { sendSimpleModelStream } from '#api/chat/utils/simple-model-stream.js';
import { buildSnapshotContextText } from '#api/chat/utils/snapshot-context.js';
import { createStaticToolTransform } from '#api/chat/utils/static-tool-transform.js';
import { createErrorTransform } from '#api/chat/utils/error-transform.js';
import { createToolOutputTransform } from '#api/chat/utils/tool-output-transform.js';
import { createNewlineTrimTransform } from '#api/chat/utils/newline-trim-transform.js';
import { createReasoningTimingTransform } from '#api/chat/utils/reasoning-timing-transform.js';
import { createLatexDelimiterTransform } from '#api/chat/utils/latex-delimiter-transform.js';
import { createTauEagerToolUiTransform } from '#api/chat/utils/tau-eager-tool-ui-transform.js';
import { assertSupportedApprovalReplay } from '#api/chat/utils/assert-supported-approval-replay.js';
import { EagerToolDispatchHandler } from '#api/chat/eager-dispatch/eager-tool-dispatch.handler.js';
import { ChatExceptionFilter } from '#api/chat/chat-exception.filter.js';
import { ChatAbortError, isChatAbortError, registerChatAbort } from '#api/chat/utils/chat-abort.js';
import { MetricsService } from '#telemetry/metrics.js';
import { Span } from '#telemetry/tracer.service.js';
import { AttributeKey } from '@taucad/telemetry';
import { TtftCallbackHandler } from '#api/chat/middleware/ttft-callback.handler.js';
import { validateImageParts } from '#api/chat/utils/validate-image-parts.js';
import { logProviderStreamErrors } from '#api/chat/utils/provider-stream-error-log.js';
import { toBaseMessagesWithIds } from '#api/chat/utils/to-base-messages-with-ids.js';
import { reconcileThreadMessages } from '#api/chat/utils/reconcile-thread-messages.js';
import type { ChatGraphStateApi, LangGraphRunnableConfig } from '#api/chat/utils/reconcile-thread-messages.js';
import { ProviderRequestRecorder } from '#api/chat/utils/provider-request-recorder.js';
import { createTauInternalHumanMessage } from '#api/chat/utils/tau-internal-message.js';

type LangChainMessages = Awaited<ReturnType<typeof toBaseMessagesWithIds>>;

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
    private readonly providerRequestRecorder: ProviderRequestRecorder,
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

        return this.streamAgentResponse({
          chatId: body.id,
          uiMessages: body.messages,
          modelId: agent.model,
          kernel: agent.kernel,
          snapshot: agent.snapshot,
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
    uiMessages: CreateChatDto['messages'];
    modelId: string;
    kernel: KernelProvider;
    snapshot: ChatSnapshot | undefined;
    mode: ChatMode;
    tools: ChatRequestConfig['tools'];
    contextPayload: ContextPayload | undefined;
    response: FastifyReply;
  }): Promise<void> {
    const { chatId, uiMessages, modelId, kernel, snapshot, mode, tools, contextPayload, response } = options;

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
      const providerId = this.modelService.getProviderId(modelId);
      const runnableConfig: LangGraphRunnableConfig = {
        configurable: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph API requires snake_case
          thread_id: chatId,
          chatRpcService: this.chatRpcService,
          fileEditService: this.fileEditService,
          geometryAnalysisService: this.geometryAnalysisService,
        },
      };
      const clientMessages = await this.prepareClientMessages(uiMessages);
      const reconciled = await reconcileThreadMessages({
        graph: agent.graph as unknown as ChatGraphStateApi,
        runnableConfig,
        clientMessages,
      });
      const snapshotContextMessage = this.createSnapshotContextMessage({ chatId, snapshot });
      const streamInputMessages = snapshotContextMessage
        ? [...reconciled.streamInputMessages, snapshotContextMessage]
        : reconciled.streamInputMessages;

      const stream = await agent.graph.stream(
        { messages: streamInputMessages },
        {
          ...reconciled.runnableConfig,
          configurable: {
            ...runnableConfig.configurable,
            ...reconciled.runnableConfig.configurable,
          },
          signal: abortController.signal,
          streamMode: ['values', 'messages', 'custom'],
          callbacks: [ttftHandler, eagerHandler, this.providerRequestRecorder],
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

      const loggedStream = logProviderStreamErrors({
        abortSignal: abortController.signal,
        context: { chatId, modelId, providerId },
        logger: this.logger,
        stream,
      });
      const uiMessageStream = toUIMessageStream(loggedStream as AsyncIterable<AIMessageChunk>)
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
      // When the client disconnects, we abort with a branded, abort-shaped
      // ChatAbortError reason. The private brand identifies Tau's intentional
      // cancellation even though the public error name is the platform shape.
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
   * Converts client-visible UI messages to LangChain messages while preserving
   * stable UI ids for LangGraph's message reducer.
   */
  private async prepareClientMessages(messages: CreateChatDto['messages']): Promise<LangChainMessages> {
    validateImageParts(messages);
    assertSupportedApprovalReplay(messages);
    return toBaseMessagesWithIds(messages);
  }

  private createSnapshotContextMessage(input: {
    readonly chatId: string;
    readonly snapshot: ChatSnapshot | undefined;
  }): BaseMessage | undefined {
    const content = input.snapshot ? buildSnapshotContextText(input.snapshot) : undefined;
    if (!content) {
      return undefined;
    }

    const contextTypes = [
      input.snapshot?.fileTree ? 'fileTree' : undefined,
      input.snapshot?.activeFile ? 'activeFile' : undefined,
      input.snapshot?.openFiles ? 'openFiles' : undefined,
    ]
      .filter(Boolean)
      .join(', ');
    this.logger.debug(`Adding snapshot context message: ${contextTypes}`);

    return createTauInternalHumanMessage({
      content,
      id: `tau:snapshot-context:${input.chatId}`,
      kind: 'snapshot-context',
      metadata: { anchorId: input.chatId, pruning: 'replace-by-id' },
    });
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
