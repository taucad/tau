// eslint-disable-next-line import-x/no-unassigned-import -- reflect-metadata polyfill
import 'reflect-metadata';
import { beforeEach, afterEach, vi } from 'vitest';

// Global test setup for NestJS API
beforeEach(async () => {
  // Setup before each test
  // E.g., clear database, reset mocks
});

afterEach(async () => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  // Cleanup after each test
  // E.g., clear database, reset mocks
});

// Extend Vitest matchers if needed
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- module augmentation
  namespace Vi {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type -- module augmentation
    interface JestAssertion<T = unknown> {
      // Add custom matchers here if needed
    }
  }
}
