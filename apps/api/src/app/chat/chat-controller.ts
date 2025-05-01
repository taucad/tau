import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { convertToCoreMessages } from 'ai';
import type { UIMessage } from 'ai';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { generatePrefixedId, idPrefix } from '../utils/id.js';
import { ToolService, toolChoiceFromToolName } from '../tools/tool-service.js';
import type { ToolChoiceWithCategory } from '../tools/tool-service.js';
import { ChatService } from './chat-service.js';
import { LangGraphAdapter } from './utils/langgraph-adapter.js';
import { convertAiSdkMessagesToLangchainMessages } from './utils/convert-messages.js';

export type CreateChatBody = {
  messages: Array<
    UIMessage & {
      role: 'user';
      model: string;
      metadata: { toolChoice: ToolChoiceWithCategory };
    }
  >;
};

@Controller('chat')
export class ChatController {
  public constructor(
    private readonly chatService: ChatService,
    private readonly toolService: ToolService,
  ) {}

  @Post()
  public async getData(
    @Body() body: CreateChatBody,
    @Res() response: FastifyReply,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const coreMessages = convertToCoreMessages(body.messages);
    const lastBodyMessage = body.messages.at(-1);

    let modelId: string;
    let selectedToolChoice: ToolChoiceWithCategory = 'auto';
    if (lastBodyMessage?.role === 'user') {
      modelId = lastBodyMessage.model;
      if (lastBodyMessage.metadata.toolChoice) {
        selectedToolChoice = lastBodyMessage.metadata.toolChoice;
      }
    } else {
      throw new Error('Last message is not a user message');
    }

    if (modelId === 'name-generator') {
      const result = this.chatService.getNameGenerator(coreMessages);

      // Mark the response as a v1 data stream:
      void response.header('X-Vercel-AI-Data-Stream', 'v1');
      void response.header('Content-Type', 'text/plain; charset=utf-8');

      return response.send(result.toDataStream());
    }

    const langchainMessages = convertAiSdkMessagesToLangchainMessages(body.messages, coreMessages);
    const graph = this.chatService.createGraph(modelId, selectedToolChoice);

    // Abort the request if the client disconnects
    const abortController = new AbortController();
    request.raw.socket.on('close', () => {
      if (request.raw.destroyed) {
        abortController.abort();
      }
    });

    const eventStream = graph.streamEvents(
      {
        messages: langchainMessages,
      },
      {
        streamMode: 'values',
        version: 'v2',
        runId: generatePrefixedId(idPrefix.run),
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

    void response.header('X-Vercel-AI-Data-Stream', 'v1');
    void response.header('Content-Type', 'text/plain; charset=utf-8');

    return response.send(result);
  }
}
