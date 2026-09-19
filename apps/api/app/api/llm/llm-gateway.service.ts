import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ModelInvocationService, ModelProviderWire } from '#api/llm/model-invocation.types.js';
import { modelInvocationServiceKey } from '#api/llm/model-invocation.types.js';

export type LlmGatewayRelayInput = {
  readonly provider: ModelProviderWire;
  readonly body: unknown;
  readonly principalId: string;
  readonly attemptId: string;
  readonly reply: FastifyReply;
  readonly signal: AbortSignal;
  readonly anthropicVersion?: string;
  readonly anthropicBeta?: string;
  /** Best-effort attribution for the receipt; absent when the caller sent none. */
  readonly projectHint?: string;
  readonly chatHint?: string;
};

/** Relays one authenticated request through the shared funded invocation owner. */
@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);

  public constructor(@Inject(modelInvocationServiceKey) private readonly invocations: ModelInvocationService) {}

  public async relay(input: LlmGatewayRelayInput): Promise<void> {
    const result = await this.invocations.invoke({
      authUserId: input.principalId,
      surface: 'gateway',
      attempt: { version: 1, key: input.attemptId },
      providerWire: input.provider,
      body: input.body,
      priceHeaders: {
        ...(input.anthropicVersion === undefined ? {} : { 'anthropic-version': input.anthropicVersion }),
        ...(input.anthropicBeta === undefined ? {} : { 'anthropic-beta': input.anthropicBeta }),
      },
      activity: 'agent',
      ...(input.projectHint === undefined ? {} : { projectHint: input.projectHint }),
      ...(input.chatHint === undefined ? {} : { chatHint: input.chatHint }),
      signal: input.signal,
      onAdmitted: (operationId) => {
        void input.reply.header('x-tau-operation-id', operationId);
      },
    });
    if (result.state !== 'streaming') {
      void input.reply.status(HttpStatus.ACCEPTED).send({ state: result.state, operationId: result.operationId });
      return;
    }
    void input.reply.status(result.response.status);
    const contentType = result.response.headers.get('content-type');
    if (contentType) {
      void input.reply.header('content-type', contentType);
    }
    try {
      // Both the stream itself and its settlement can fail after the headers are
      // sent; neither may reach an exception filter that would reply a second time.
      await input.reply.send(Readable.fromWeb(result.response.body! as NodeReadableStream<Uint8Array<ArrayBuffer>>));
      await result.completion;
    } catch (error) {
      this.logger.error(
        { err: error, operationId: result.operationId },
        'Model invocation settlement failed after the response stream was sent',
      );
    }
  }
}
