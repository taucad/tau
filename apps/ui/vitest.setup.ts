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
