import { describe, it, expect } from 'vitest';
import { registerCompletions } from '#lib/monaco.lib.client.js';

describe('registerCompletions', () => {
  it('should be a no-op while AI autocomplete is disabled', () => {
    const registration = registerCompletions();

    expect(() => {
      registration.trigger();
      registration.deregister();
      registration.updateOptions(() => ({}));
    }).not.toThrow();
  });
});
