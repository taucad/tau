import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CodeCompletionService } from '#api/code-completion/code-completion.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { User } from '#auth/decorators/auth.decorator.js';
import { assertNoQuery, invocationSignal } from '#api/llm/llm-gateway.headers.js';

@UseGuards(AuthGuard)
@Controller({ path: 'code-completion', version: '1' })
export class CodeCompletionController {
  public constructor(private readonly codeCompletionService: CodeCompletionService) {}

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest route parameters
  @Post()
  public async getCompletion(
    @Body() body: unknown,
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    assertNoQuery(request);
    const result = await this.codeCompletionService.complete(
      body,
      userId,
      invocationSignal(request, reply),
      (operationId) => {
        void reply.header('x-tau-operation-id', operationId);
      },
    );
    if (result.state !== 'streaming') {
      void reply.status(202).send(result);
      return;
    }
    void reply.status(result.response.status);
    void reply.header('content-type', result.response.headers.get('content-type') ?? 'text/event-stream');
    await reply.send(Readable.fromWeb(result.response.body! as NodeReadableStream<Uint8Array<ArrayBuffer>>));
    await result.completion;
  }
}
