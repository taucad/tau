import { Body, Controller, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { convertToCoreMessages } from 'ai';
import type { UIMessage } from 'ai';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HumanMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import { tryExtractLastToolResult } from '~/api/chat/utils/extract-tool-result.js';
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

export type KernelStackFrame = {
  fileName?: string;
  functionName?: string;
  lineNumber?: number;
  columnNumber?: number;
  source?: string;
};

export type KernelError = {
  message: string;
  startLineNumber?: number;
  endLineNumber?: number;
  startColumn?: number;
  endColumn?: number;
  stack?: string;
  stackFrames?: KernelStackFrame[];
  type?: 'compilation' | 'runtime' | 'kernel' | 'unknown';
};

export type FileInfo = {
  content: string;
  language: string;
};

export type FilesContext = {
  currentFile: string;
  files: Record<string, FileInfo>;
};

export type CreateChatBody = {
  code: string;
  codeErrors: CodeError[];
  kernelError?: KernelError;
  screenshot: string;
  kernel?: 'replicad' | 'openscad';
  files?: FilesContext;
  /* The ID of the chat. */
  id: string;
  messages: Array<
    UIMessage & {
      model: string;
      metadata: { toolChoice: ToolChoiceWithCategory; kernel?: 'replicad' | 'openscad' };
    }
  >;
};

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
    @Body() body: CreateChatBody,
    @Res() response: FastifyReply,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    this.logger.debug(`Creating chat: ${body.id}`);
    // Sanitize messages to handle partial tool calls before conversion
    const sanitizedMessages = sanitizeMessagesForConversion(body.messages);
    const coreMessages = convertToCoreMessages(sanitizedMessages);
    const lastHumanMessage = body.messages.findLast((message) => message.role === 'user');

    this.logger.debug(`Last human message: ${JSON.stringify(lastHumanMessage, null, 2)}`);
    let modelId: string;
    const selectedToolChoice: ToolChoiceWithCategory = 'auto';
    let selectedKernel: 'replicad' | 'openscad' = 'replicad';

    if (lastHumanMessage?.role === 'user') {
      modelId = lastHumanMessage.model;
      // Extract kernel from message metadata or use the one from body
      selectedKernel = lastHumanMessage.metadata.kernel ?? body.kernel ?? 'replicad';
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
    const graph = await this.chatService.createGraph(modelId, selectedToolChoice, selectedKernel);

    // Configuration for the graph execution
    const config = {
      streamMode: 'values' as const,
      version: 'v2' as const,
      configurable: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph API requires snake_case
        thread_id: body.id, // Enable persistence using conversation ID as thread ID
      },
    };

    // Check if this thread is in an interrupted state
    let currentState;
    try {
      currentState = await graph.getState(config);
    } catch {
      // If we can't get state, assume it's a new conversation
      currentState = null;
    }

    // Abort the request if the client disconnects
    const abortController = new AbortController();
    request.raw.socket.on('close', () => {
      if (request.raw.destroyed) {
        abortController.abort();
      }
    });

    // Prepare files context for the system prompt
    const filesContextXml = body.files
      ? objectToXml({
          currentFile: body.files.currentFile,
          files: Object.entries(body.files.files).map(([filename, file]) => ({
            filename,
            content: file.content,
            language: file.language,
          })),
        })
      : '';

    const resultMessage = new HumanMessage({
      content: [
        {
          type: 'text',
          text: `# CAD Code Generation Information
If code errors or kernel errors are present, use this information to fix the errors.

${objectToXml({
  codeErrors: body.codeErrors.map((error) => ({
    message: error.message,
    startLineNum: error.startLineNumber,
    endLineNum: error.endLineNumber,
    startCol: error.startColumn,
    endCol: error.endColumn,
  })),
  ...(body.kernelError
    ? {
        kernelError: `${body.kernelError.message}${body.kernelError.startLineNumber ? ` (Line ${body.kernelError.startLineNumber}${body.kernelError.startColumn ? `:${body.kernelError.startColumn}` : ''})` : ''}${body.kernelError.stack ? `\n\nStack trace:\n${body.kernelError.stack}` : ''}`,
      }
    : {}),
  currentCode: body.code,
  selectedKernel,
  ...(filesContextXml ? { filesContext: filesContextXml } : {}),
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

    let eventStream;

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
