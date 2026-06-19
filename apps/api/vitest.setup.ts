// oxlint-disable-next-line import-x/no-unassigned-import -- reflect-metadata polyfill
import 'reflect-metadata';
import { beforeEach, afterEach, vi } from 'vitest';

// Provide a deterministic 32+ char secret so getEnvironment() can boot without apps/api/.env
const rawViewCookieSecret = Reflect.get(process.env, 'TAU_VIEW_COOKIE_SECRET');
if (typeof rawViewCookieSecret !== 'string' || rawViewCookieSecret.length < 32) {
  process.env.TAU_VIEW_COOKIE_SECRET = 'test-view-cookie-secret-min-32-chars';
}

if (!Reflect.has(globalThis, 'DOMMatrix')) {
  class TestDOMMatrix {
    public readonly is2D = true;
    public readonly isIdentity = true;
  }

  Reflect.set(globalThis, 'DOMMatrix', TestDOMMatrix);
}

if (!Reflect.has(globalThis, 'ImageData')) {
  class TestImageData {
    public constructor(
      public readonly data: Uint8ClampedArray,
      public readonly width: number,
      public readonly height: number,
    ) {}
  }

  Reflect.set(globalThis, 'ImageData', TestImageData);
}

if (!Reflect.has(globalThis, 'Path2D')) {
  class TestPath2D {}

  Reflect.set(globalThis, 'Path2D', TestPath2D);
}

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
  // oxlint-disable-next-line @typescript-eslint/no-namespace -- module augmentation
  namespace Vi {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type -- module augmentation
    interface JestAssertion<T = unknown> {
      // Add custom matchers here if needed
    }
  }
}
