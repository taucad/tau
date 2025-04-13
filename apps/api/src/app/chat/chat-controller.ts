import { Body, Controller, Post, Res } from '@nestjs/common';
import { convertToCoreMessages, pipeDataStreamToResponse } from 'ai';
import type { Response } from 'express';
import { generatePrefixedId, idPrefix } from '../utils/id.js';
import { LangGraphAdapter } from './utils/langgraph-adapter.js';
import { ChatService, toolChoiceFromToolName, toolChoice } from './chat-service.js';
import type { CreateChatBody, ToolChoice } from './chat-service.js';
import { convertAiSdkMessagesToLangchainMessages } from './utils/convert-messages.js';

@Controller('chat')
export class ChatController {
  public constructor(private readonly chatService: ChatService) {}

  @Post()
  public async getData(@Body() body: CreateChatBody, @Res() response: Response) {
    const coreMessages = convertToCoreMessages(body.messages);
    const lastBodyMessage = body.messages.at(-1);

    let modelId: string;
    let selectedToolChoice: ToolChoice = 'auto';
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
      parseToolResults: {
        [toolChoice.web]: (content) => this.chatService.parseWebResults(content),
      },
      callbacks: this.chatService.getCallbacks(),
    });
  }
}
