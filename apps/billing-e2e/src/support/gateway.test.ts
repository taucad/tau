import { describe, expect, it } from 'vitest';
import {
  attemptLookupSchema,
  describeCall,
  gatewayErrorSchema,
  insufficientCreditDetailsSchema,
} from '#support/gateway.js';

const insufficient = {
  type: 'error',
  error: {
    type: 'INSUFFICIENT_CREDIT',
    message: 'Insufficient credit',
    details: { requiredCreditAtoms: '1200', availableCreditAtoms: '0', routeId: 'anthropic-claude-haiku-4.5' },
  },
};

describe('gatewayErrorSchema', () => {
  it('should parse a typed refusal and its shortfall', () => {
    const refusal = gatewayErrorSchema.parse(insufficient);
    expect(refusal.error.type).toBe('INSUFFICIENT_CREDIT');
    expect(insufficientCreditDetailsSchema.parse(refusal.error.details)).toEqual(insufficient.error.details);
  });

  it('should refuse a code the host does not switch on, and extra fields', () => {
    expect(
      gatewayErrorSchema.safeParse({ ...insufficient, error: { ...insufficient.error, type: 'NOPE' } }).success,
    ).toBe(false);
    expect(gatewayErrorSchema.safeParse({ ...insufficient, statusCode: 402 }).success).toBe(false);
  });

  it('should refuse a shortfall with a non-integer amount', () => {
    expect(
      insufficientCreditDetailsSchema.safeParse({ ...insufficient.error.details, requiredCreditAtoms: '1.5' }).success,
    ).toBe(false);
  });
});

describe('attemptLookupSchema', () => {
  it('should accept a voided key', () => {
    expect(attemptLookupSchema.parse({ state: 'not_found', voided: true })).toEqual({
      state: 'not_found',
      voided: true,
    });
  });
});

describe('describeCall', () => {
  it('should name the status, refusal, identities and request id', () => {
    const line = describeCall({
      at: '2026-10-09T00:00:00.000Z',
      method: 'POST',
      path: '/v1/llm/anthropic/v1/messages',
      status: 402,
      requestId: 'req_9',
      attemptId: 'att_1',
      refusal: gatewayErrorSchema.parse(insufficient),
    });
    expect(line).toBe(
      '/v1/llm/anthropic/v1/messages 402 INSUFFICIENT_CREDIT "Insufficient credit" {"requiredCreditAtoms":"1200","availableCreditAtoms":"0","routeId":"anthropic-claude-haiku-4.5"} attempt att_1 (req_9)',
    );
  });
});
