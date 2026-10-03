import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RequestIdMiddleware, resolveRequestId } from '#middlewares/request-id.middleware.js';

const generatedId = 'req_generated123';

/** Runs the middleware against a raw request carrying `headerValue` and returns the echoed header. */
const echoedRequestId = (headerValue: string | string[] | undefined): unknown => {
  const setHeader = vi.fn();
  const request = { id: generatedId, headers: headerValue === undefined ? {} : { 'request-id': headerValue } };
  const next = vi.fn();

  new RequestIdMiddleware().use(
    request as unknown as FastifyRequest['raw'],
    { setHeader } as unknown as FastifyReply['raw'],
    next,
  );

  expect(next).toHaveBeenCalledOnce();
  expect(setHeader).toHaveBeenCalledOnce();
  return setHeader.mock.calls[0]?.[1];
};

describe('RequestIdMiddleware', () => {
  it('uses the generated id when the caller sends none', () => {
    expect(echoedRequestId(undefined)).toBe(generatedId);
  });

  it.each(['req_01HZY8C2', '0b9c6f1e-2a4d-4f7b-9e8a-3c5d7e9f1a2b', 'a'.repeat(64)])(
    'propagates a well-formed caller id %s',
    (id) => {
      expect(echoedRequestId(id)).toBe(id);
    },
  );

  it.each([
    ['too long', 'a'.repeat(65)],
    ['empty', ''],
    ['whitespace', 'req 1'],
    ['separators', 'req_1;admin=true'],
    ['non-ASCII', 'req_é'],
    ['repeated header', ['req_one', 'req_two']],
  ])('replaces a %s caller id with the generated one', (_label, value) => {
    expect(echoedRequestId(value)).toBe(generatedId);
  });
});

describe('resolveRequestId', () => {
  it('falls back to an undefined generated id for a malformed header', () => {
    expect(resolveRequestId('bad id', undefined)).toBeUndefined();
  });
});
