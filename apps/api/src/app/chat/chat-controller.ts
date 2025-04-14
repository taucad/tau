import { Body, Controller, Post, Res } from '@nestjs/common';
import { convertToCoreMessages, pipeDataStreamToResponse } from 'ai';
import type { UIMessage } from 'ai';
import type { Response } from 'express';
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
  public async getData(@Body() body: CreateChatBody, @Res() response: Response): Promise<void> {
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
      pipeDataStreamToResponse(response, {
        execute: async (dataStreamWriter) => {
          const result = this.chatService.getNameGenerator(coreMessages);
          result.mergeIntoDataStream(dataStreamWriter);
        },
        onError(error) {
          return error instanceof Error ? error.message : String(error);
        },
      });
      return;
    }

    const langchainMessages = convertAiSdkMessagesToLangchainMessages(body.messages, coreMessages);
    const graph = this.chatService.createGraph(modelId, selectedToolChoice);

    const eventStream = graph.streamEvents(
      {
        messages: langchainMessages,
      },
      {
        streamMode: 'values',
        version: 'v2',
        runId: generatePrefixedId(idPrefix.run),
      },
    );

    // Use the LangGraphAdapter to handle the response
    LangGraphAdapter.toDataStreamResponse(eventStream, {
      response,
      modelId,
      toolTypeMap: toolChoiceFromToolName,
      parseToolResults: this.toolService.getToolParsers(),
      callbacks: this.chatService.getCallbacks(),
    });
  }
}
