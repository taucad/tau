import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '#auth/auth.type.js';
import { readOptionalUser } from '#auth/decorators/auth.decorator.js';

function mockExecutionContext(request: unknown): ExecutionContext {
  const stub = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };

  return stub as ExecutionContext;
}

describe('readOptionalUser', () => {
  const sessionUser: AuthUser = {
    id: 'user_1',
    name: 'N',
    email: 'n@test.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('returns undefined when user is absent', () => {
    expect(readOptionalUser('id', mockExecutionContext({}))).toBeUndefined();
    expect(readOptionalUser(undefined, mockExecutionContext({ user: null }))).toBeUndefined();
  });

  it('returns keyed property when user is present', () => {
    expect(readOptionalUser('id', mockExecutionContext({ user: sessionUser }))).toBe('user_1');
  });

  it('returns full user when property is omitted', () => {
    expect(readOptionalUser(undefined, mockExecutionContext({ user: sessionUser }))).toEqual(sessionUser);
  });
});
