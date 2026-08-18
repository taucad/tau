// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { createDomVisibilityProvider, headlessVisibilityProvider } from '#visibility-provider.js';

describe('headlessVisibilityProvider', () => {
  it('is always visible and exposes a no-op unsubscribe', () => {
    expect(headlessVisibilityProvider.isVisible()).toBe(true);
    const callback = vi.fn();
    const unsub = headlessVisibilityProvider.onVisibilityChange(callback);
    unsub();
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('createDomVisibilityProvider', () => {
  it('reflects document visibility and cleans up listeners', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      writable: true,
      value: 'visible',
    });
    const provider = createDomVisibilityProvider();
    expect(provider.isVisible()).toBe(true);

    const listener = vi.fn();
    const unsub = provider.onVisibilityChange(listener);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(listener).toHaveBeenCalledOnce();

    unsub();
    listener.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(listener).not.toHaveBeenCalled();
  });
});
