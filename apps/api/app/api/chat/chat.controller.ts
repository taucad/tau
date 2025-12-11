import { Body, Controller, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { convertToModelMessages, JsonToSseTransformStream } from 'ai';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IterableReadableStream } from '@langchain/core/utils/stream';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import type { ToolSelection } from '@taucad/chat';
import { ToolService, toolChoiceFromToolName } from '#api/tools/tool.service.js';
import { ChatService } from '#api/chat/chat.service.js';
import { LangGraphAdapter } from '#api/chat/utils/langgraph-adapter.js';
import {
  convertAiSdkMessagesToLangchainMessages,
  sanitizeMessagesForConversion,
} from '#api/chat/utils/convert-messages.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { CreateChatDto } from '#api/chat/chat.dto.js';

@UseGuards(AuthGuard)
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  public constructor(
    private readonly chatService: ChatService,
    private readonly toolService: ToolService,
  ) {}

  @Post()
  public async createChat(
    @Body() body: CreateChatDto,
    @Res() response: FastifyReply,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    this.logger.debug(`Creating chat: ${body.id}`);
    // Sanitize messages to handle partial tool calls before conversion
    const sanitizedMessages = sanitizeMessagesForConversion(body.messages, this.logger);
    const coreMessages = convertToModelMessages(sanitizedMessages);
    const lastHumanMessage = body.messages.findLast((message) => message.role === 'user');

    this.logger.debug(lastHumanMessage, `Last human message:`);
    let modelId: string;
    let selectedToolChoice: ToolSelection = 'auto';

    if (lastHumanMessage?.role === 'user') {
      const messageModel = lastHumanMessage.metadata?.model;

      if (!messageModel) {
        throw new Error('Message model is required');
      }

      modelId = messageModel;

      const messageToolChoice = lastHumanMessage.metadata?.toolChoice;

      if (messageToolChoice) {
        selectedToolChoice = messageToolChoice;
      }
    } else {
      throw new Error('Last message is not a user message');
    }

    if (modelId === 'name-generator') {
      const result = this.chatService.getBuildNameGenerator(coreMessages);

      // Mark the response as a v1 data stream:
      void response.header('content-type', 'text/event-stream');
      void response.header('x-vercel-ai-ui-message-stream', 'v1');
      void response.header('x-accel-buffering', 'no');

      const sseStream = result.toUIMessageStream().pipeThrough(new JsonToSseTransformStream());

      return response.send(sseStream.pipeThrough(new TextEncoderStream()));
    }

    if (modelId === 'commit-name-generator') {
      const result = this.chatService.getCommitMessageGenerator(coreMessages);

      // Mark the response as a v1 data stream:
      void response.header('content-type', 'text/event-stream');
      void response.header('x-vercel-ai-ui-message-stream', 'v1');
      void response.header('x-accel-buffering', 'no');

      const sseStream = result.toUIMessageStream().pipeThrough(new JsonToSseTransformStream());

      return response.send(sseStream.pipeThrough(new TextEncoderStream()));
    }

    // Extract kernel from request body (default to openscad if not provided)
    const selectedKernel = lastHumanMessage.metadata?.kernel ?? 'openscad';

    const langchainMessages = convertAiSdkMessagesToLangchainMessages(sanitizedMessages, coreMessages);
    const graph = await this.chatService.createGraph(modelId, selectedToolChoice, selectedKernel);

    // Configuration for the graph execution
    const config = {
      streamMode: 'values',
      version: 'v2',
    } as const;

    // Abort the request if the client disconnects
    const abortController = new AbortController();
    request.raw.socket.on('close', () => {
      if (request.raw.destroyed) {
        abortController.abort();
      }
    });

    const eventStream: IterableReadableStream<StreamEvent> = graph.streamEvents(
      {
        messages: langchainMessages,
      },
      {
        ...config,
        signal: abortController.signal,
      },
    );

    // Use the LangGraphAdapter to handle the response
    const result = LangGraphAdapter.toDataStream(eventStream, {
      modelId,
      toolTypeMap: toolChoiceFromToolName,
      parseToolResults: this.toolService.getToolParsers(),
      callbacks: this.chatService.getCallbacks(),
    });

    const sseStream = result.pipeThrough(new JsonToSseTransformStream());

    void response.header('content-type', 'text/event-stream');
    void response.header('x-vercel-ai-ui-message-stream', 'v1');
    void response.header('x-accel-buffering', 'no');

    return response.send(sseStream.pipeThrough(new TextEncoderStream()));
  }
}
