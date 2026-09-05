import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';
import { LlmGatewayAuthGuard, LlmGatewayPrincipal } from '#api/llm/llm-gateway.guard.js';
import { readSingleHeader } from '#api/llm/llm-gateway.headers.js';

@Controller({ path: 'llm', version: '1' })
@UseGuards(LlmGatewayAuthGuard)
export class LlmGatewayController {
  public constructor(private readonly gateway: LlmGatewayService) {}

  @Post('anthropic/v1/messages')
  public async anthropic(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @LlmGatewayPrincipal() principalId: string,
  ): Promise<void> {
    await this.gateway.relay({
      provider: 'anthropic',
      body: request.body,
      principalId,
      reply,
      anthropicVersion: readSingleHeader(request, 'anthropic-version'),
      anthropicBeta: readSingleHeader(request, 'anthropic-beta'),
    });
  }

  @Post('openai/v1/chat/completions')
  public async openai(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @LlmGatewayPrincipal() principalId: string,
  ): Promise<void> {
    await this.gateway.relay({ provider: 'openai', body: request.body, principalId, reply });
  }

  // Direct-OpenAI catalog rows only: gpt-5.6-luna answers 400 on
  // /v1/chat/completions for any request carrying function tools.
  @Post('openai/v1/responses')
  public async openaiResponses(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @LlmGatewayPrincipal() principalId: string,
  ): Promise<void> {
    await this.gateway.relay({ provider: 'openai-responses', body: request.body, principalId, reply });
  }
}
