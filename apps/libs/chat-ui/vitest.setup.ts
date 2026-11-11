import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);
// Testing Library only unmounts on its own when Vitest globals are on; this suite keeps them off.
afterEach(cleanup);

// Jsdom has no ResizeObserver; tooltips and the virtualised queue observe their anchors. Same no-op as apps/ui.
globalThis.ResizeObserver = class ResizeObserver {
  public observe(): void {
    // No-op
  }

  public unobserve(): void {
    // No-op
  }

  public disconnect(): void {
    // No-op
  }
};
