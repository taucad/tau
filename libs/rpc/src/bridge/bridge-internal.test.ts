import { describe, expect, it } from 'vitest';
import { isBridgeErrorWire, serializeBridgeError } from '#bridge/bridge-internal.js';

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

  it('drops malformed optional fields instead of emitting an ill-typed peer error', () => {
    const error = Object.assign(new Error('nope'), { code: 42, metadata: [] });
    const result = serializeBridgeError(error);

    expect(result.code).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });

  it('rejects malformed bridge errors before reconstruction reads their fields', () => {
    expect(isBridgeErrorWire({ __bridgeError: null })).toBe(false);
    expect(isBridgeErrorWire({ __bridgeError: { message: 42, name: 'Error' } })).toBe(false);
    expect(isBridgeErrorWire({ __bridgeError: { message: 'boom', name: 'Error', stack: 42 } })).toBe(false);
    expect(isBridgeErrorWire({ __bridgeError: { message: 'boom', name: 'Error' } })).toBe(true);
  });
});
