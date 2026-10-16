// The global-fetch tripwire: a preparation test injects its transport, so a call to the global `fetch` means some
// path reached for the network on its own. Installing the tripwire turns that into a failing test naming the URL.
import { vi } from 'vitest';

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/**
 * A `fetch` that always rejects, naming the URL it was asked for.
 * @returns The forbidding transport.
 * @public
 */
export const forbidGlobalFetch = (): typeof fetch => async (input) => {
  throw new Error(`The global fetch was called for ${urlOf(input)}; this test is hermetic and injects its transport.`);
};

/**
 * Replace the global `fetch` with {@link forbidGlobalFetch} until the returned restore runs (or Vitest's
 * `unstubAllGlobals`). Call it in `beforeEach`, or at the top of a native integration file after capturing any
 * transport the file injects on purpose.
 * @returns Restores the previous global `fetch`.
 * @public
 */
export const installFetchTripwire = (): (() => void) => {
  const previous = globalThis.fetch;
  vi.stubGlobal('fetch', forbidGlobalFetch());
  return () => {
    vi.stubGlobal('fetch', previous);
  };
};
