/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym. */
import process from 'node:process';

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
