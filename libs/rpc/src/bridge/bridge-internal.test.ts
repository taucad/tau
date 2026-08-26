import { describe, expect, it } from 'vitest';
import { serializeBridgeError } from '#bridge/bridge-internal.js';

describe('serializeBridgeError', () => {
  it('should not throw on non-object throwables and return a sane BridgeError', () => {
    for (const thrown of [null, undefined, 'boom', 42]) {
      const result = serializeBridgeError(thrown);
      expect(result.message).toBe(String(thrown));
      expect(result.name).toBe('Error');
      expect(result.code).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    }
  });

  it('should read code and metadata off an Error-like throwable', () => {
    const error = Object.assign(new Error('nope'), { code: 'E_NOPE', metadata: { detail: 1 } });
    const result = serializeBridgeError(error);
    expect(result.message).toBe('nope');
    expect(result.code).toBe('E_NOPE');
    expect(result.metadata).toEqual({ detail: 1 });
  });
});
