import { describe, it, expect, vi } from 'vitest';
import { createOcScope } from '#oc-scope.js';

describe('createOcScope', () => {
  it('disposes newest-first after an error and ignores repeated disposal', () => {
    const calls: string[] = [];
    const first = { delete: vi.fn(() => calls.push('first')) };
    const second = { delete: vi.fn(() => calls.push('second')) };
    const scope = createOcScope();

    expect(() => {
      try {
        scope.track(first);
        scope.track(second);
        throw new Error('boom');
      } finally {
        scope.dispose();
      }
    }).toThrow('boom');

    expect(calls).toEqual(['second', 'first']);
    scope.dispose();
    expect(first.delete).toHaveBeenCalledOnce();
    expect(second.delete).toHaveBeenCalledOnce();
  });
});
