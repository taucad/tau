import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assertNoQuery, invocationSignal, readHint } from '#api/llm/llm-gateway.headers.js';

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

describe('readHint', () => {
  it.each([
    ['proj_01J8ZK4E', 'proj_01J8ZK4E'],
    ['chat_1', 'chat_1'],
    // The admitted identity class is `[A-Za-z0-9._:-]`, so a prefixed id, a
    // dotted one and a namespaced one all survive.
    ['workspace.project:main-2', 'workspace.project:main-2'],
    ['a'.repeat(128), 'a'.repeat(128)],
  ])('should keep %s, which the ledger admits unchanged', (value, expected) => {
    expect(readHint(value)).toBe(expected);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['spaced', 'project one'],
    ['slashed', 'proj/1'],
    ['over the 128-character bound', 'a'.repeat(129)],
    ['non-ASCII', 'projekt-Ä'],
    ['newline-injected', 'proj_1\nx-tau-chat-id: other'],
  ])('should drop a %s hint rather than refuse the turn', (_name, value) => {
    expect(readHint(value)).toBeUndefined();
  });
});
