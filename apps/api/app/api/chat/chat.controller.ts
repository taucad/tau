import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { BadRequestException, Body, Controller, Logger, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { convertToModelMessages } from 'ai';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ChatTurnRequest } from '@taucad/chat/schemas';
import { ChatService } from '#api/chat/chat.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { User } from '#auth/decorators/auth.decorator.js';
import { ChatMessagesValidationPipe } from '#api/chat/chat.dto.js';
import { ChatExceptionFilter } from '#api/chat/chat-exception.filter.js';
import { Span } from '#telemetry/tracer.service.js';
import { validateImageParts } from '#api/chat/utils/validate-image-parts.js';
import { assertNoQuery, invocationSignal } from '#api/llm/llm-gateway.headers.js';

/**
 * The two secondary generators are all that remain of `POST /v1/chat`.
 *
 * The Tau agent plane left with W3-CUT-2 and the external-agent plane with it:
 * a CAD turn is executed by the host that owns the run — the browser agent
 * host, or a `tau serve` daemon — and its canonical record is
 * `.tau/chats/<chatId>/events.jsonl` in that host's workspace (PH19). No CAD
 * turn reaches the API, so the run directory, the chunk stream and their tables
 * are gone; a `cad` profile is a typed refusal rather than a route that
 * silently loses a turn.
 */
@UseFilters(ChatExceptionFilter)
@UseGuards(AuthGuard)
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  public constructor(private readonly chatService: ChatService) {}

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest route parameters
  @Post()
  @Span()
  public async createChat(
    @Body(new ChatMessagesValidationPipe()) body: ChatTurnRequest,
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
  ): Promise<void> {
    assertNoQuery(request);
    this.logger.debug(`Creating chat: ${body.id}`);
    const signal = invocationSignal(request, response);
    const onAdmitted = (operationId: string): void => {
      void response.header('x-tau-operation-id', operationId);
    };

    switch (body.agent.profile) {
      case 'project_name': {
        validateImageParts(body.messages);
        const modelMessages = await convertToModelMessages(body.messages);
        const result = await this.chatService.getBuildNameGenerator(
          modelMessages,
          userId,
          body.admission.idempotencyKey,
          body.projectId,
          signal,
          onAdmitted,
        );
        return this.send(response, result);
      }
      case 'commit_name': {
        const modelMessages = await convertToModelMessages(body.messages);
        const result = await this.chatService.getCommitMessageGenerator(
          modelMessages,
          userId,
          body.admission.idempotencyKey,
          body.projectId,
          signal,
          onAdmitted,
        );
        return this.send(response, result);
      }
      case 'cad': {
        throw new BadRequestException({
          code: 'CHAT_CAD_NOT_API_PLACED',
          message: 'CAD turns run on the host that owns the chat, not on the Tau API.',
        });
      }
    }
  }

  private async send(
    response: FastifyReply,
    result: Awaited<ReturnType<ChatService['getBuildNameGenerator']>>,
  ): Promise<void> {
    if (result.state !== 'streaming') {
      void response.status(202).send(result);
      return;
    }
    void response.status(result.response.status);
    void response.header('content-type', 'text/event-stream');
    void response.header('x-vercel-ai-ui-message-stream', 'v1');
    await Promise.all([
      response.send(Readable.fromWeb(result.response.body! as NodeReadableStream<Uint8Array<ArrayBuffer>>)),
      result.completion,
    ]);
  }
}
