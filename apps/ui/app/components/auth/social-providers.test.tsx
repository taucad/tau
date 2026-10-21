// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { getSocialProviderDisplay, getSocialProviders } from '#components/auth/social-providers.js';

vi.mock('@better-auth-ui/react', () => ({
  providerIcons: { github: () => null },
}));

describe('getSocialProviders', () => {
  it('offers ChatGPT only where the deployment has an OpenAI client', () => {
    expect(getSocialProviders(false)).toEqual(['github', 'google']);
    expect(getSocialProviders(true)).toEqual(['github', 'google', { id: 'chatgpt', label: 'ChatGPT' }]);
  });
});

describe('getSocialProviderDisplay', () => {
  it('names and draws ChatGPT, which better-auth-ui does not know', () => {
    const display = getSocialProviderDisplay('chatgpt');

    expect(display.name).toBe('ChatGPT');
    expect(display.Icon).toBeDefined();
  });

  it('keeps better-auth-ui names and marks for built-in providers', () => {
    expect(getSocialProviderDisplay('github')).toMatchObject({
      name: 'GitHub',
    });
    expect(getSocialProviderDisplay('github').Icon).toBeDefined();
  });

  it('names a provider with no known mark and leaves its icon to the caller', () => {
    expect(getSocialProviderDisplay('company-sso').Icon).toBeUndefined();
  });
});
