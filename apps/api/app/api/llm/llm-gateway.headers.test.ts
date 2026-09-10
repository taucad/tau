import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assertNoQuery, invocationSignal } from '#api/llm/llm-gateway.headers.js';

describe('funded invocation HTTP boundary', () => {
  it('rejects any query component before invocation', () => {
    expect(() => {
      assertNoQuery({ query: {} } as FastifyRequest);
    }).not.toThrow();
    expect(() => {
      assertNoQuery({ query: { ignored: 'value' } } as FastifyRequest);
    }).toThrow('Query parameters are not supported');
  });

  it('aborts when the response closes before it finishes', () => {
    // oxlint-disable-next-line unicorn/prefer-event-target -- Fastify wraps Node streams with EventEmitter.once
    const requestRaw = new EventEmitter();
    // oxlint-disable-next-line unicorn/prefer-event-target -- Fastify reply.raw is a Node ServerResponse
    const replyRaw = Object.assign(new EventEmitter(), { writableFinished: false });
    const signal = invocationSignal(
      { raw: requestRaw } as unknown as FastifyRequest,
      { raw: replyRaw } as unknown as FastifyReply,
    );

    replyRaw.emit('close');

    expect(signal.aborted).toBe(true);
  });
});
