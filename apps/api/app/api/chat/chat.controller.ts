import { Body, Controller, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { convertToCoreMessages } from 'ai';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HumanMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import type { StateSnapshot } from '@langchain/langgraph';
import type { IterableReadableStream } from '@langchain/core/utils/stream';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import type { ToolWithSelection } from '@taucad/types';
import { tryExtractLastToolResult } from '#api/chat/utils/extract-tool-result.js';
import { ToolService, toolChoiceFromToolName } from '#api/tools/tool.service.js';
import { ChatService } from '#api/chat/chat.service.js';
import { LangGraphAdapter } from '#api/chat/utils/langgraph-adapter.js';
import {
  convertAiSdkMessagesToLangchainMessages,
  sanitizeMessagesForConversion,
} from '#api/chat/utils/convert-messages.js';
import { objectToXml } from '#utils/xml.js';
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
    const sanitizedMessages = sanitizeMessagesForConversion(body.messages);
    const coreMessages = convertToCoreMessages(sanitizedMessages);
    const lastHumanMessage = body.messages.findLast((message) => message.role === 'user');

    this.logger.debug(`Last human message: ${JSON.stringify(lastHumanMessage)}`);
    let modelId: string;
    const selectedToolChoice: ToolWithSelection = 'auto';

    if (lastHumanMessage?.role === 'user') {
      modelId = lastHumanMessage.model;
      // If (lastHumanMessage.metadata.toolChoice) {
      //   selectedToolChoice = lastHumanMessage.metadata.toolChoice;
      // }
    } else {
      throw new Error('Last message is not a user message');
    }

    if (modelId === 'name-generator') {
      const result = this.chatService.getBuildNameGenerator(coreMessages);

      // Mark the response as a v1 data stream:
      void response.header('X-Vercel-AI-Data-Stream', 'v1');
      void response.header('Content-Type', 'text/plain; charset=utf-8');

      return response.send(result.toDataStream());
    }

    if (modelId === 'commit-name-generator') {
      const result = this.chatService.getCommitMessageGenerator(coreMessages);

      // Mark the response as a v1 data stream:
      void response.header('X-Vercel-AI-Data-Stream', 'v1');
      void response.header('Content-Type', 'text/plain; charset=utf-8');

      return response.send(result.toDataStream());
    }

    // Extract kernel from request body (default to openscad if not provided)
    const selectedKernel = body.kernel ?? 'openscad';

    const langchainMessages = convertAiSdkMessagesToLangchainMessages(sanitizedMessages, coreMessages);
    const graph = await this.chatService.createGraph(modelId, selectedToolChoice, selectedKernel);

    // Configuration for the graph execution
    const config = {
      streamMode: 'values',
      version: 'v2',
      configurable: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph API requires snake_case
        thread_id: body.id, // Enable persistence using conversation ID as thread ID
      },
    } as const;

    // Check if this thread is in an interrupted state
    let currentState: StateSnapshot | undefined;
    try {
      currentState = await graph.getState(config);
    } catch {
      // If we can't get state, assume it's a new conversation
      // and no-op
    }

    // Abort the request if the client disconnects
    const abortController = new AbortController();
    request.raw.socket.on('close', () => {
      if (request.raw.destroyed) {
        abortController.abort();
      }
    });

    let eventStream: IterableReadableStream<StreamEvent>;

    // Check if we're resuming from an interrupt
    if (currentState?.next && currentState.next.length > 0) {
      // Thread is interrupted, resume with the provided input
      this.logger.debug(`Resuming interrupted thread: ${body.id}`);

      // Extract the result from the last tool call to use as resume value
      const toolResult = tryExtractLastToolResult(langchainMessages);

      this.logger.debug(`Resuming with tool result: ${JSON.stringify(toolResult, null, 2)}`);

      // Resume the graph execution with the tool result
      eventStream = graph.streamEvents(new Command({ resume: toolResult }), {
        ...config,
        signal: abortController.signal,
      });
    } else {
      // Normal execution - start new conversation or continue existing one
      this.logger.debug(`Starting normal execution for thread: ${body.id}`);

      const resultMessage = new HumanMessage({
        content: [
          {
            type: 'text',
            text: `# CAD Code Generation Information
If code errors or kernel errors are present, use this information to fix the errors.

${objectToXml({
  ...(body.codeErrors.length > 0 && {
    codeErrors: body.codeErrors.map((error) => ({
      message: error.message,
      startLineNum: error.startLineNumber,
      endLineNum: error.endLineNumber,
      startCol: error.startColumn,
      endCol: error.endColumn,
    })),
  }),
  ...(body.kernelError && {
    kernelError: `${body.kernelError.message}${body.kernelError.startLineNumber ? ` (Line ${body.kernelError.startLineNumber}${body.kernelError.startColumn ? `:${body.kernelError.startColumn}` : ''})` : ''}${body.kernelError.stack ? `\n\nStack trace:\n${body.kernelError.stack}` : ''}`,
  }),
  currentCode: body.code,
  selectedKernel,
})}
`,
          },
        ],
      });
      eventStream = graph.streamEvents(
        {
          messages: [...langchainMessages, resultMessage],
        },
        {
          ...config,
          signal: abortController.signal,
        },
      );
    }

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
