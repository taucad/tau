import { describe, expect, it, vi } from 'vitest';
import { createBillableModelProviderAdapters } from '@taucad/api-billing';

describe('billable provider transport', () => {
  it('does not expose a route without a configured credential', () => {
    expect(createBillableModelProviderAdapters({ get: () => undefined }, vi.fn())).toHaveProperty('size', 0);
  });
});
