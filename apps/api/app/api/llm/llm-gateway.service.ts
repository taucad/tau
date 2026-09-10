import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import type { BillableProviderWire } from '#api/billing/billable-model-invocation.types.js';
import type { BillingEnvironment } from '#api/billing/credit-ledger.types.js';

/* oxlint-disable no-barrel-files/no-barrel-files -- retained test-facing transport utility exports */
export { consumeSseBody } from '#api/llm/llm-gateway.stream.js';
export type { SseEvent } from '#api/llm/llm-gateway.stream.js';
/* oxlint-enable no-barrel-files/no-barrel-files */

export type LlmGatewayRelayInput = {
  readonly provider: BillableProviderWire;
  readonly body: unknown;
  readonly principalId: string;
  readonly attemptId: string;
  readonly reply: FastifyReply;
  readonly signal: AbortSignal;
  readonly anthropicVersion?: string;
  readonly anthropicBeta?: string;
};

/** Relays one authenticated request through the shared funded invocation owner. */
@Injectable()
export class LlmGatewayService {
  public constructor(
    private readonly invocations: BillableModelInvocationService,
    private readonly config: ConfigService,
  ) {}

  public async relay(input: LlmGatewayRelayInput): Promise<void> {
    const environment = this.config.get<BillingEnvironment>('BILLING_ENVIRONMENT');
    if (!environment) {
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'Billing environment is unavailable.',
      );
    }
    const result = await this.invocations.invoke({
      environment,
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
    await input.reply.send(Readable.fromWeb(result.response.body! as NodeReadableStream<Uint8Array<ArrayBuffer>>));
    await result.completion;
  }
}
