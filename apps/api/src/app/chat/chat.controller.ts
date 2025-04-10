import { Body, Controller, Post, Res } from '@nestjs/common';
import { convertToCoreMessages, pipeDataStreamToResponse } from 'ai';
import { Response } from 'express';
import { generatePrefixedId, PREFIX_TYPES } from '../utils/id';
import { convertAiSdkMessagesToLangchainMessages } from './utils/convert-messages';
import { LangGraphAdapter } from './utils/langgraph-adapter';
import { ChatService, CreateChatBody, ToolChoice, TOOL_TYPE_FROM_TOOL_NAME } from './chat.service';

@Controller('chat')
export class ChatController {
  public constructor(private readonly chatService: ChatService) {}

  @Post()
  public async getData(@Body() body: CreateChatBody, @Res() response: Response) {
    const coreMessages = convertToCoreMessages(body.messages);
    const lastBodyMessage = body.messages.at(-1);

    let modelId: string;
    let toolChoice: ToolChoice = 'auto';
    if (lastBodyMessage?.role === 'user') {
      modelId = lastBodyMessage.model;
      if (lastBodyMessage.metadata.toolChoice) {
        toolChoice = lastBodyMessage.metadata.toolChoice;
      }
    } else {
      throw new Error('Last message is not a user message');
    }

    if (modelId === 'name-generator') {
      return pipeDataStreamToResponse(response, {
        execute: async (dataStreamWriter) => {
          const result = this.chatService.getNameGenerator(coreMessages);
          result.mergeIntoDataStream(dataStreamWriter);
        },
        onError: (error) => {
          return error instanceof Error ? error.message : String(error);
        },
      });
    }

    const langchainMessages = convertAiSdkMessagesToLangchainMessages(body.messages, coreMessages);
    const graph = this.chatService.createGraph(modelId, toolChoice);

    const eventStream = graph.streamEvents(
      {
        messages: langchainMessages,
      },
      {
        streamMode: 'values',
        version: 'v2',
        runId: generatePrefixedId(PREFIX_TYPES.RUN),
      },
    );

    // Use the LangGraphAdapter to handle the response
    LangGraphAdapter.toDataStreamResponse(eventStream, {
      response,
      modelId,
      toolTypeMap: TOOL_TYPE_FROM_TOOL_NAME,
      parseToolResults: {
        web: (content) => this.chatService.parseSearchResults(content),
      },
      callbacks: this.chatService.getCallbacks(modelId),
    });
  }
}
