import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);
// Testing Library only unmounts on its own when Vitest globals are on; this suite keeps them off.
afterEach(cleanup);

// Suites run in node; the few that render opt into jsdom with a `@vitest-environment jsdom` docblock.
// Jsdom can mix Node's TextEncoder with its own typed-array constructors, so byte comparisons fail across realms.
// Same realm-safe encoder as apps/ui.
if (typeof globalThis.TextEncoder === 'function' && !(new globalThis.TextEncoder().encode('') instanceof Uint8Array)) {
  class RealmSafeTextEncoder extends globalThis.TextEncoder {
    public override encode(input?: string): Uint8Array<ArrayBuffer> {
      return new Uint8Array(super.encode(input));
    }
  }

  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    writable: true,
    value: RealmSafeTextEncoder,
  });
}
