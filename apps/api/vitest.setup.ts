import 'reflect-metadata';
import { beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';

// Global test setup for NestJS API
beforeEach(async () => {
  // Setup before each test
  // E.g., clear database, reset mocks
});

afterEach(async () => {
  // Cleanup after each test
  // E.g., clear database, reset mocks
});

// You can add global test utilities here
export const createMockRepository = () => ({
  find: vi.fn(),
  findOne: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
});

export const createMockService = (methods: string[]) => {
  const mock: any = {};
  methods.forEach(method => {
    mock[method] = vi.fn();
  });
  return mock;
};

// Extend Vitest matchers if needed
declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      // Add custom matchers here if needed
    }
  }
}