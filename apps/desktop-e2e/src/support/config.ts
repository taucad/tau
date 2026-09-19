/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym. */
import process from 'node:process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/**
 * Ports and origins this suite owns (work item Z2).
 *
 * The exclusive pair is its own, not `ui-e2e`'s :3013/:4013 — the chat-vertical
 * setup throws when its API port is already taken, and both suites must be able
 * to run back to back.
 */

/** The dedicated API this suite boots and owns. */
export const desktopE2EApiUrl = process.env['TAU_E2E_API_URL'] ?? 'http://localhost:4014';

/**
 * The provider upstream this suite's API is pointed at, and the gateway fixture serves.
 *
 * Fixed rather than ephemeral because the API learns it once, at boot, from
 * `global-setup.ts` — while each spec starts and stops its own stub. Its own port,
 * next to the API's :4014, so a `ui-e2e` run can hold :3013/:4013 at the same time.
 */
export const desktopE2EProviderStubUrl = process.env['TAU_E2E_PROVIDER_STUB_URL'] ?? 'http://127.0.0.1:4015';

/**
 * The provider credential the API is given while the upstream is stubbed.
 *
 * Non-empty is the whole contract: `createBillableModelProviderAdapters` builds no
 * adapter for an empty key, so CI's `.env.example` (which ships them empty) would
 * otherwise have no anthropic route at all. The stub never reads it, and a real key
 * from `apps/api/.env` is deliberately kept out of the fixture's reach.
 */
export const desktopE2EProviderStubKey = 'desktop-e2e-provider-stub-key';

/** Whether this run must use a completed package and externally isolated services. */
export const desktopE2ECompletedArtifact = process.env['TAU_E2E_COMPLETED_ARTIFACT'] === 'true';

/** The exact packaged executable selected by a completed-artifact run. */
export const desktopE2EPackagedExecutable = (): string => {
  const configured = process.env['TAU_E2E_DESKTOP_EXECUTABLE'];
  if (!configured) {
    throw new Error('TAU_E2E_DESKTOP_EXECUTABLE is required for completed-artifact desktop E2E.');
  }
  if (!isAbsolute(configured)) {
    throw new Error('TAU_E2E_DESKTOP_EXECUTABLE must be an absolute path.');
  }
  const executable = resolve(configured);
  if (!existsSync(executable)) {
    throw new Error(`TAU_E2E_DESKTOP_EXECUTABLE does not exist: ${executable}`);
  }
  return executable;
};

/**
 * The web frontend both the API and the shell are told about.
 *
 * Nothing listens on it: the desktop app serves its own SPA from `app://tau`,
 * and the A7 seeded token replaces the system-browser sign-in this URL would
 * otherwise open. It stays a real `http` URL because the API derives
 * better-auth's `trustedOrigins`, the Socket.IO handshake origin and its email
 * links from it — `app://tau` there polluted all three. The desktop origin is
 * admitted by the API's own CORS validator (`createTauCorsOriginValidator`),
 * which is where it belongs.
 */
export const desktopE2EFrontendUrl = 'http://localhost:3014';
