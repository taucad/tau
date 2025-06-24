import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { convertToCoreMessages } from 'ai';
import type { UIMessage } from 'ai';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HumanMessage } from '@langchain/core/messages';
import { ToolService, toolChoiceFromToolName } from '~/api/tools/tool.service.js';
import type { ToolChoiceWithCategory } from '~/api/tools/tool.service.js';
import { ChatService } from '~/api/chat/chat.service.js';
import { LangGraphAdapter } from '~/api/chat/utils/langgraph-adapter.js';
import {
  convertAiSdkMessagesToLangchainMessages,
  sanitizeMessagesForConversion,
} from '~/api/chat/utils/convert-messages.js';
import { objectToXml } from '~/utils/xml.js';
import { AuthGuard } from '~/auth/auth.guard.js';

export type CodeError = {
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
};

export type CreateChatBody = {
  code: string;
  codeErrors: CodeError[];
  kernelError: string;
  screenshot: string;
  messages: Array<
    UIMessage & {
      role: 'user';
      model: string;
      metadata: { toolChoice: ToolChoiceWithCategory };
    }
  >;
};

@UseGuards(AuthGuard)
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
    // Sanitize messages to handle partial tool calls before conversion
    const sanitizedMessages = sanitizeMessagesForConversion(body.messages);
    const coreMessages = convertToCoreMessages(sanitizedMessages);
    const lastHumanMessage = body.messages.findLast((message) => message.role === 'user');

    let modelId: string;
    const selectedToolChoice: ToolChoiceWithCategory = 'auto';
    if (lastHumanMessage?.role === 'user') {
      modelId = lastHumanMessage.model;
      // If (lastHumanMessage.metadata.toolChoice) {
      //   selectedToolChoice = lastHumanMessage.metadata.toolChoice;
      // }
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

    const langchainMessages = convertAiSdkMessagesToLangchainMessages(sanitizedMessages, coreMessages);
    const graph = await this.chatService.createGraph(modelId, selectedToolChoice);

    // Abort the request if the client disconnects
    const abortController = new AbortController();
    request.raw.socket.on('close', () => {
      if (request.raw.destroyed) {
        abortController.abort();
      }
    });

    const resultMessage = new HumanMessage({
      content: [
        {
          type: 'text',
          text: `# CAD Code Generation Information
If code errors or kernel errors are present, use this information to fix the errors.

${objectToXml({
  codeErrors: (body.codeErrors || []).map((error) => ({
    message: error.message,
    startLineNum: error.startLineNumber,
    endLineNum: error.endLineNumber,
    startCol: error.startColumn,
    endCol: error.endColumn,
  })),
  ...(body.kernelError ? { kernelError: body.kernelError } : {}),
  currentCode: body.code,
})}
`,
        },
        ...(body.screenshot
          ? [
              {
                type: 'image_url',
                // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses snake_case.
                image_url: {
                  url: body.screenshot,
                },
              },
            ]
          : []),
      ],
    });

    const eventStream = graph.streamEvents(
      {
        messages: [...langchainMessages, resultMessage],
      },
      {
        streamMode: 'values',
        version: 'v2',
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
