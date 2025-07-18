import '@testing-library/jest-dom';

// Mock window.ENV for testing - required since the app uses window.ENV in browser environments
Object.defineProperty(window, 'ENV', {
  writable: true,
  value: {
    TAU_API_URL: 'http://localhost:3001',
    TAU_FRONTEND_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
});

// Mock common browser APIs for testing
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver
(global as any).IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock ResizeObserver
(global as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
