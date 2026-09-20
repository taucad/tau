import { playwright } from '@vitest/browser-playwright';
import type { BrowserProviderOption } from 'vitest/node';

/**
 * `@vitest/browser-playwright` is built against the `vitest` copy pnpm installs
 * for its own peer context, so its provider option is structurally identical to
 * but nominally distinct from the one this project resolves. The cast is the
 * same one `apps/ui-e2e/vitest.config.ts` uses for the same duplicate-copy
 * reason, kept here because both Vitest configs in this project need it.
 *
 * @param options - Playwright provider options, forwarded verbatim.
 * @returns The provider option typed against this project's `vitest` copy.
 */
export const playwrightProvider = (options?: Parameters<typeof playwright>[0]): BrowserProviderOption =>
  playwright(options) as unknown as BrowserProviderOption;
