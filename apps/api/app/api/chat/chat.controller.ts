import { BadRequestException, Body, Controller, Logger, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import { convertToModelMessages } from 'ai';
import type { FastifyReply } from 'fastify';
import type { ChatTurnRequest } from '@taucad/chat/schemas';
import { ChatService } from '#api/chat/chat.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { User } from '#auth/decorators/auth.decorator.js';
import { ChatMessagesValidationPipe } from '#api/chat/chat.dto.js';
import { sendSimpleModelStream } from '#api/chat/utils/simple-model-stream.js';
import { ChatExceptionFilter } from '#api/chat/chat-exception.filter.js';
import { Span } from '#telemetry/tracer.service.js';
import { validateImageParts } from '#api/chat/utils/validate-image-parts.js';

/**
 * The two secondary generators are all that remain of `POST /v1/chat`.
 *
 * The Tau agent plane left with W3-CUT-2 and the external-agent (Paseo) plane
 * with W4-PASEO: a CAD turn is executed by the host that owns the run — the
 * browser agent host, a `tau serve` daemon, or the Paseo daemon the page talks
 * to directly — and its canonical record is `.tau/chats/<chatId>/events.jsonl`
 * in that host's workspace (PH19). No CAD turn reaches the API, so the run
 * directory, the chunk stream and their tables are gone; a `cad` profile is a
 * typed refusal rather than a route that silently loses a turn.
 */
@UseFilters(ChatExceptionFilter)
@UseGuards(AuthGuard)
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  public constructor(private readonly chatService: ChatService) {}

  @Post()
  @Span()
  public async createChat(
    @Body(new ChatMessagesValidationPipe()) body: ChatTurnRequest,
    @User('id') userId: string,
    @Res() response: FastifyReply,
  ): Promise<void> {
    this.logger.debug(`Creating chat: ${body.id}`);

    switch (body.agent.profile) {
      case 'project_name': {
        validateImageParts(body.messages);
        const modelMessages = await convertToModelMessages(body.messages);
        const result = this.chatService.getBuildNameGenerator(modelMessages, userId);
        return sendSimpleModelStream(response, result);
      }
      case 'commit_name': {
        const modelMessages = await convertToModelMessages(body.messages);
        const result = this.chatService.getCommitMessageGenerator(modelMessages, userId);
        return sendSimpleModelStream(response, result);
      }
      case 'cad': {
        throw new BadRequestException({
          code: 'CHAT_CAD_NOT_API_PLACED',
          message: 'CAD turns run on the host that owns the chat, not on the Tau API.',
        });
      }
    }
  }
}
