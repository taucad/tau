import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LlmGatewayService } from '#llm-gateway.service.js';
import { LlmGatewayAuthGuard, LlmGatewayPrincipal } from '#llm-gateway.guard.js';
import {
  assertNoQuery,
  invocationSignal,
  readAttribution,
  readHostLabels,
  readTurnTelemetry,
  readSingleHeader,
  validateAttemptId,
} from '#llm-gateway.headers.js';

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
    assertNoQuery(request);
    await this.gateway.relay({
      provider: 'anthropic',
      body: request.body,
      principalId,
      attemptId: validateAttemptId(readSingleHeader(request, 'x-tau-attempt-id')),
      reply,
      signal: invocationSignal(request, reply),
      ...readAttribution(request),
      ...readTurnTelemetry(request),
      ...readHostLabels(request),
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
    assertNoQuery(request);
    await this.gateway.relay({
      provider: 'openai-completions',
      body: request.body,
      principalId,
      attemptId: validateAttemptId(readSingleHeader(request, 'x-tau-attempt-id')),
      reply,
      signal: invocationSignal(request, reply),
      ...readAttribution(request),
      ...readTurnTelemetry(request),
      ...readHostLabels(request),
    });
  }

  @Post('openai/v1/responses')
  public async openaiResponses(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @LlmGatewayPrincipal() principalId: string,
  ): Promise<void> {
    assertNoQuery(request);
    await this.gateway.relay({
      provider: 'openai-responses',
      body: request.body,
      principalId,
      attemptId: validateAttemptId(readSingleHeader(request, 'x-tau-attempt-id')),
      reply,
      signal: invocationSignal(request, reply),
      ...readAttribution(request),
      ...readTurnTelemetry(request),
      ...readHostLabels(request),
    });
  }
}
