import { describe, expect, it, vi } from 'vitest';
import { createBillableModelProviderAdapters } from '#api/billing/billable-model-provider.js';

describe('billable provider transport', () => {
  it('does not expose a route without a configured credential', () => {
    expect(createBillableModelProviderAdapters({ get: () => undefined }, vi.fn())).toHaveProperty('size', 0);
  });
});
