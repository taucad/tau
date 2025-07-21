/* eslint-disable @typescript-eslint/naming-convention -- CONSTANT_CASE is expected for environment variables */
// eslint-disable-next-line import-x/no-unassigned-import -- this is a side effect
import '@testing-library/jest-dom';

// Mock window.ENV for testing - required since the app uses window.ENV in browser environments
Object.defineProperty(globalThis, 'ENV', {
  writable: true,
  value: {
    TAU_API_URL: 'http://localhost:3001',
    TAU_FRONTEND_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
});

// Mock common browser APIs for testing
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {
      // No-op
    },
    removeListener() {
      // No-op
    },
    addEventListener() {
      // No-op
    },
    removeEventListener() {
      // No-op
    },
    dispatchEvent() {
      // No-op
    },
  }),
});

// Mock IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/root) */
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- expected mock shape
  public readonly root: Element | Document | null;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/rootMargin) */
  public readonly rootMargin: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/thresholds) */
  public readonly thresholds: readonly number[];

  public observe() {
    // No-op
  }

  public unobserve() {
    // No-op
  }

  public disconnect() {
    // No-op
  }

  public takeRecords() {
    return [];
  }
};

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  public observe() {
    // No-op
  }

  public unobserve() {
    // No-op
  }

  public disconnect() {
    // No-op
  }
};
