import { describe, expect, it } from 'vitest';
import { shareEnvelopeFailureOf } from '#components/publish/share-envelope-state.js';

describe('shareEnvelopeFailureOf (#2304)', () => {
  it('should read a deleted or unknown cloud copy as absent, never as a network fault', () => {
    expect(shareEnvelopeFailureOf(410)).toBe('absent');
    expect(shareEnvelopeFailureOf(404)).toBe('absent');
  });

  it('should read a failed request or a server error as unreachable', () => {
    expect(shareEnvelopeFailureOf(undefined)).toBe('unreachable');
    expect(shareEnvelopeFailureOf(500)).toBe('unreachable');
    expect(shareEnvelopeFailureOf(503)).toBe('unreachable');
  });

  it('should ask for sign-in on 401', () => {
    expect(shareEnvelopeFailureOf(401)).toBe('sign-in');
  });
});
