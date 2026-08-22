import { expect, test } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The standalone Node preflight runs outside the browser alias config.
import { resolveTestServerAction } from './support/server-readiness.ts';

test('the E2E preflight starts, reuses, or rejects a server from debug readiness', () => {
  const baseUrl = 'http://localhost:3011';
  expect(resolveTestServerAction({ baseUrl, rootReady: false, debugReady: false })).toBe('start');
  expect(resolveTestServerAction({ baseUrl, rootReady: true, debugReady: true })).toBe('reuse');
  expect(() => resolveTestServerAction({ baseUrl, rootReady: true, debugReady: false })).toThrow(
    `A server is already responding at ${baseUrl}, but its TAU_DEBUG route is unavailable. Stop that server and rerun ui-e2e.`,
  );
});
