/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym (`apps/desktop-e2e/src/support/config.ts` says the same). */
import process from 'node:process';

/**
 * Ports and origins the git-server tier owns (charter W18).
 *
 * The same `:4014` the desktop tier owns: both are Nx targets that boot their
 * own API and refuse to start when something already holds the port, so they
 * run back to back rather than at once.
 */

/** The API this tier boots and owns. */
export const gitE2EApiUrl = process.env['TAU_E2E_API_URL'] ?? 'http://localhost:4014';

/**
 * The web origin the API derives better-auth's `trustedOrigins` and its CORS
 * allow-list from. Nothing listens on it in this tier — every caller here is
 * node-side, where CORS does not apply — but the sign-up and sign-in calls must
 * come from a trusted origin to be accepted at all.
 */
export const gitE2EFrontendUrl = 'http://localhost:3014';
