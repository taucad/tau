import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Preserve jest-dom substring and RegExp semantics under the browser-compatible name.
expect.extend({ ...matchers, toMatchTextContent: matchers.toHaveTextContent });
afterEach(cleanup);

class ResizeObserverMock implements ResizeObserver {
  public disconnect(): void {
    // No browser layout exists in jsdom.
  }

  public observe(): void {
    // No browser layout exists in jsdom.
  }

  public unobserve(): void {
    // No browser layout exists in jsdom.
  }
}

globalThis.ResizeObserver = ResizeObserverMock;
