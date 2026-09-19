import { describe, expect, it, vi } from 'vitest';
import { createBillableModelProviderAdapters } from '#api/billing/billable-model-provider.js';

describe('billable provider route map', () => {
  it('adds only routes backed by configured provider credentials', () => {
    const adapters = createBillableModelProviderAdapters(
      { get: (key) => (key === 'OPENAI_API_KEY' ? 'test' : undefined) },
      vi.fn(),
    );
    expect([...adapters.keys()]).toEqual(expect.arrayContaining(['openai-gpt-5.6-luna']));
    expect([...adapters.keys()].some((key) => key.startsWith('anthropic-'))).toBe(false);
  });
});
