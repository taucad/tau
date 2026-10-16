import { describe, expect, it } from 'vitest';

import { elicitationRequestSchema } from '#acp/elicitation-request.js';

const form = {
  mode: 'form',
  sessionId: 'session-1',
  message: 'Answer this form',
  requestedSchema: {
    type: 'object',
    properties: { secret: { type: 'string', writeOnly: true } },
    allOf: [{ required: ['secret'] }],
  },
};

describe('raw elicitation request validation', () => {
  it('preserves constraints and secret markers for the safe presentation decision', () => {
    expect(elicitationRequestSchema.parse(form)).toEqual(form);
  });

  it('preserves a request-scoped form and its schema', () => {
    const request = {
      mode: form.mode,
      message: form.message,
      requestedSchema: form.requestedSchema,
      requestId: 12,
    };
    expect(elicitationRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    { ...form, sessionId: 1 },
    { ...form, message: 42 },
    { mode: form.mode, message: form.message, requestedSchema: form.requestedSchema },
  ])('rejects invalid ACP envelopes', (request) => {
    expect(elicitationRequestSchema.safeParse(request).success).toBe(false);
  });

  it('retains URL elicitation for its existing handling', () => {
    const request = {
      mode: 'url',
      sessionId: 'session-1',
      message: 'Authenticate',
      url: 'https://example.com/login',
      elicitationId: 'login-1',
    };
    expect(elicitationRequestSchema.parse(request)).toEqual(request);
  });
});
