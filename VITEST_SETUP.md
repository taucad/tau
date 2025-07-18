# Vitest Configuration for NX Monorepo

This guide documents the complete Vitest setup for both UI (React) and API (NestJS) projects in this NX monorepo.

## Overview

Jest has been completely removed and replaced with Vitest for all testing needs. The configuration supports:

- **UI Project**: React components testing with jsdom environment
- **API Project**: NestJS services/controllers testing with Node.js environment
- **Workspace**: Unified test running across all projects
- **Coverage**: V8 coverage reports for both projects
- **UI**: Interactive test interface via `@vitest/ui`

## Dependencies

### Installed Dependencies
```json
{
  "devDependencies": {
    "@vitest/coverage-v8": "^3.0.4",
    "@vitest/ui": "^3.0.4",
    "@testing-library/react": "16.2.0",
    "@testing-library/user-event": "^14.6.1",
    "@testing-library/jest-dom": "6.6.3",
    "happy-dom": "^16.1.4",
    "jsdom": "~26.0.0",
    "vitest": "^3.0.4"
  }
}
```

### Removed Dependencies
- `@nx/jest`: Removed NX Jest integration
- `@types/jest`: Removed Jest type definitions
- `jest`: Removed Jest framework
- `jest-environment-node`: Removed Jest Node environment
- `ts-jest`: Removed TypeScript Jest transformer

## Configuration Files

### Root Workspace (`vitest.workspace.ts`)
```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // UI Project Configuration
  {
    extends: './apps/ui/vite.config.ts',
    test: {
      name: 'ui',
      root: './apps/ui',
      environment: 'jsdom',
    },
  },
  // API Project Configuration  
  {
    extends: './apps/api/vite.config.ts',
    test: {
      name: 'api',
      root: './apps/api',
      environment: 'node',
    },
  },
]);
```

### UI Project (`apps/ui/vite.config.ts`)
```typescript
// ... existing vite config ...
test: {
  setupFiles: ['./vitest.setup.ts'],
  watch: false,
  globals: true,
  environment: 'jsdom',
  include: ['./tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  reporters: ['default'],
  coverage: {
    reportsDirectory: '../../coverage/apps/ui',
    provider: 'v8',
    include: ['app/**/*'],
    exclude: [
      'app/**/*.test.{ts,tsx}',
      'app/**/*.spec.{ts,tsx}',
      'app/**/index.ts',
    ],
  },
},
```

### API Project (`apps/api/vite.config.ts`)
```typescript
// ... existing vite config ...
test: {
  globals: true,
  environment: 'node',
  include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  setupFiles: ['./vitest.setup.ts'],
  coverage: {
    provider: 'v8',
    reportsDirectory: '../../coverage/apps/api',
    include: ['app/**/*'],
    exclude: [
      'app/**/*.spec.ts',
      'app/**/*.test.ts',
      'app/**/index.ts',
      'app/main.ts',
    ],
  },
  pool: 'forks', // Use forks for better isolation in Node.js environment
  poolOptions: {
    forks: {
      singleFork: true,
    },
  },
},
```

## Setup Files

### UI Setup (`apps/ui/vitest.setup.ts`)
```typescript
import '@testing-library/jest-dom';

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
```

### API Setup (`apps/api/vitest.setup.ts`)
```typescript
import 'reflect-metadata';

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
```

## Available Scripts

### Package.json Scripts
```json
{
  "scripts": {
    "test": "nx run-many -t test",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

### Running Tests

#### All Projects
```bash
pnpm test
```

#### Specific Project
```bash
# UI project only
nx test ui

# API project only  
nx test api
```

#### Interactive UI
```bash
pnpm test:ui
```

#### Coverage Reports
```bash
pnpm test:coverage
```

#### Watch Mode
```bash
vitest --watch
```

## Writing Tests

### UI Component Tests
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MyComponent } from '../app/components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
});
```

### API Service Tests
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MyService } from '../app/services/my.service';

describe('MyService', () => {
  let service: MyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyService],
    }).compile();

    service = module.get<MyService>(MyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

## File Structure

```
.
├── vitest.workspace.ts           # Workspace configuration
├── package.json                  # Updated scripts and dependencies
├── apps/
│   ├── ui/
│   │   ├── vite.config.ts       # UI Vitest configuration
│   │   ├── vitest.setup.ts      # UI test setup
│   │   └── tests/               # UI test files
│   └── api/
│       ├── vite.config.ts       # API Vitest configuration
│       ├── vitest.setup.ts      # API test setup
│       └── **/*.{test,spec}.ts  # API test files
└── coverage/                    # Coverage reports
    ├── apps/ui/                 # UI coverage
    └── apps/api/                # API coverage
```

## Key Features

1. **Multi-Project Support**: Run tests across UI and API simultaneously
2. **Environment Isolation**: jsdom for UI, Node.js for API
3. **Comprehensive Coverage**: V8 coverage provider with detailed reports
4. **Development Experience**: Interactive UI, watch mode, fast feedback
5. **NestJS Integration**: Proper reflect-metadata and testing utilities
6. **React Integration**: Testing Library setup with DOM matchers
7. **Mock Utilities**: Built-in mocking for common browser APIs

## Migration Notes

- All Jest configuration files have been removed
- Tests should use Vitest syntax (`describe`, `it`, `expect` from 'vitest')
- NestJS tests should use `@nestjs/testing` with Vitest
- React tests should use `@testing-library/react` with Vitest
- Coverage reports are now in `coverage/` instead of individual project directories

## Troubleshooting

### TypeScript Issues
If you encounter TypeScript errors, ensure your `tsconfig.json` includes:
```json
{
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  }
}
```

### Missing Dependencies
If tests fail due to missing dependencies:
```bash
pnpm install
```

### Coverage Not Working
Ensure V8 coverage is properly configured:
```bash
pnpm test:coverage
```