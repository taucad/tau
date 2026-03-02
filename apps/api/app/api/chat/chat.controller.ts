import { Body, Controller, Logger, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { convertToModelMessages, createUIMessageStreamResponse } from 'ai';
import type { FastifyReply } from 'fastify';
import type { ReactAgent } from 'langchain';
import type { ToolSelection, ChatSnapshot } from '@taucad/chat';
import type { KernelProvider } from '@taucad/kernels';
import { ChatService } from '#api/chat/chat.service.js';
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
import { ChatExceptionFilter } from '#api/chat/chat-exception.filter.js';
import { ChatAbortError, isChatAbortError, registerChatAbort } from '#api/chat/utils/chat-abort.js';

type LangChainMessages = Awaited<ReturnType<typeof toBaseMessages>>;

type ChatRequestConfig = {
  modelId: string;
  kernel: KernelProvider;
  snapshot: ChatSnapshot | undefined;
  mode: 'agent' | 'plan';
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
  ) {}

  @Post()
  public async createChat(@Body() body: CreateChatDto, @Res() response: FastifyReply): Promise<void> {
    this.logger.debug(`Creating chat: ${body.id}`);

    const { modelId, kernel, snapshot, mode, tools } = this.extractRequestConfig(body);

    // Handle simple model streams (name generator, commit generator).
    // These use AI SDK's streamText, so they need ModelMessage[] from convertToModelMessages.
    if (modelId === 'name-generator') {
      const modelMessages = await convertToModelMessages(body.messages);
      const result = this.chatService.getBuildNameGenerator(modelMessages);
      return sendSimpleModelStream(response, result);
    }

    if (modelId === 'commit-name-generator') {
      const modelMessages = await convertToModelMessages(body.messages);
      const result = this.chatService.getCommitMessageGenerator(modelMessages);
      return sendSimpleModelStream(response, result);
    }

    const langchainMessages = await this.prepareMessages(body.messages, snapshot);
    const agent = await this.chatService.createAgent({ modelId, kernel, mode, tools });

    return this.streamAgentResponse({
      chatId: body.id,
      agent,
      messages: langchainMessages,
      modelId,
      response,
    });
  }

  /**
   * Parses and validates the last user message to extract model configuration.
   */
  private extractRequestConfig(body: CreateChatDto): ChatRequestConfig {
    const lastHumanMessage = body.messages.findLast((message) => message.role === 'user');

    if (lastHumanMessage?.role !== 'user') {
      throw new Error('Last message is not a user message');
    }

    const messageModel = lastHumanMessage.metadata?.model;

    if (!messageModel) {
      throw new Error('Message model is required');
    }

    return {
      modelId: messageModel,
      kernel: lastHumanMessage.metadata?.kernel ?? 'openscad',
      snapshot: lastHumanMessage.metadata?.snapshot,
      mode: lastHumanMessage.metadata?.mode ?? 'agent',
      tools: {
        choice: lastHumanMessage.metadata?.toolChoice ?? 'auto',
        testingEnabled: lastHumanMessage.metadata?.testingEnabled ?? true,
      },
    };
  }

  /**
   * Injects snapshot context into messages and converts to LangChain format.
   */
  private async prepareMessages(
    messages: CreateChatDto['messages'],
    snapshot: ChatSnapshot | undefined,
  ): Promise<LangChainMessages> {
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

    return toBaseMessages(messagesWithContext);
  }

  /**
   * Sets up client-disconnect abort handling, runs the LangGraph agent stream,
   * and pipes the result as an SSE response.
   */
  private async streamAgentResponse(options: {
    chatId: string;
    agent: ReactAgent;
    messages: LangChainMessages;
    modelId: string;
    response: FastifyReply;
  }): Promise<void> {
    const { chatId, agent, messages, modelId, response } = options;

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

    try {
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
          context: {
            modelId,
            modelService: this.modelService,
            logger: this.logger,
          },
          recursionLimit: 200,
        },
      );

      void response.header('content-type', 'text/event-stream');
      void response.header('x-vercel-ai-ui-message-stream', 'v1');
      void response.header('x-accel-buffering', 'no');

      const uiMessageStream = toUIMessageStream(stream)
        .pipeThrough(createStaticToolTransform())
        .pipeThrough(createToolOutputTransform())
        .pipeThrough(createErrorTransform());

      const uiMessageStreamResponse = createUIMessageStreamResponse({
        stream: uiMessageStream,
      });

      const responseBody = uiMessageStreamResponse.body;
      if (responseBody) {
        return await response.send(responseBody);
      }

      throw new Error('Failed to create UI message stream response');
    } catch (error: unknown) {
      // When the client disconnects, we abort with a branded ChatAbortError
      // reason. Check signal.reason for our brand — this is a definitive match
      // regardless of what error LangGraph/node-fetch actually throws.
      if (abortController.signal.aborted && isChatAbortError(abortController.signal.reason)) {
        this.logger.debug(`Chat ${chatId} was cancelled by client`);
        return;
      }

      throw error;
    }
  }
}
