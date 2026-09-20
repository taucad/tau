import type { BrowserContext } from 'playwright';

/**
 * The Playwright provider ships its own `vitest/node` augmentation, but it is written
 * against the `vitest` copy pnpm installs for `@vitest/browser-playwright`'s peer
 * context rather than the one this project resolves, so the two interfaces never merge
 * and `context` types as `any` — which is what made every command callback unsafe.
 * Declaring it here binds the provider context to the Playwright types already installed.
 */
declare module 'vitest/node' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Module augmentation must merge Vitest's interface.
  interface BrowserCommandContext {
    readonly context: BrowserContext;
  }
}
