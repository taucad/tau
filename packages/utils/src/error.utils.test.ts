import { describe, it, expect } from 'vitest';
import { isAbortError } from '#error.utils.js';

describe('isAbortError', () => {
  it('should return true for a DOMException with name AbortError', () => {
    const error = new DOMException('The operation was aborted', 'AbortError');
    expect(isAbortError(error)).toBe(true);
  });

  it('should return true for an Error with name set to AbortError', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    expect(isAbortError(error)).toBe(true);
  });

  it('should return false for a generic Error', () => {
    expect(isAbortError(new Error('something went wrong'))).toBe(false);
  });

  it('should return false for a DOMException with a different name', () => {
    expect(isAbortError(new DOMException('bad', 'NotFoundError'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(42)).toBe(false);
    expect(isAbortError({ name: 'AbortError' })).toBe(false);
  });

  it('should return true for the default signal.reason from AbortController', () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(controller.signal.reason)).toBe(true);
  });

  it('should return false when AbortController is given a non-abort reason', () => {
    const controller = new AbortController();
    controller.abort(new Error('custom reason'));
    expect(isAbortError(controller.signal.reason)).toBe(false);
  });
});
