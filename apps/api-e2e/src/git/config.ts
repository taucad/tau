/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym (`apps/desktop-e2e/src/support/config.ts` says the same). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
 * The second API process this tier boots, on the same PostgreSQL and the same
 * object store (charter S2).
 *
 * `:4016` rather than `:4015`, which `apps/desktop-e2e` uses for its provider
 * stub — the two tiers never run at once, but a port that is free in both is one
 * less way for a failure to be somebody else's.
 */
export const gitE2ESecondaryApiUrl = process.env['TAU_E2E_API_URL_SECONDARY'] ?? 'http://localhost:4016';

/**
 * The web origin the API derives better-auth's `trustedOrigins` and its CORS
 * allow-list from. Nothing listens on it in this tier — every caller here is
 * node-side, where CORS does not apply — but the sign-up and sign-in calls must
 * come from a trusted origin to be accepted at all.
 */
export const gitE2EFrontendUrl = 'http://localhost:3014';

/**
 * The object store the API boots with, read from the same `.env` (W10).
 *
 * The lifecycle suite drives `aws s3` directly — to stand in for the copy job
 * DG1 defers, and to rebuild a repository from its packs and a manifest alone
 * (S6) without going back through the API that just purged it.
 */
export const gitE2EStore = ((): {
  readonly endpoint: string;
  readonly privateBucket: string;
  readonly restoreBucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
} => {
  const file = readFileSync(resolve(import.meta.dirname, '../../../api/.env'), 'utf8');
  const read = (name: string, fallback: string): string =>
    process.env[name] ?? new RegExp(`^${name}=(.*)$`, 'mu').exec(file)?.[1] ?? fallback;
  return {
    endpoint: read('TAU_S3_ENDPOINT', 'http://localhost:9000'),
    privateBucket: read('TAU_S3_PRIVATE_BUCKET', 'tau-content-private'),
    restoreBucket: read('TAU_S3_RESTORE_BUCKET', 'tau-content-restore'),
    accessKeyId: read('TAU_S3_ACCESS_KEY_ID', ''),
    secretAccessKey: read('TAU_S3_SECRET_ACCESS_KEY', ''),
    region: read('TAU_S3_REGION', 'us-east-1'),
  };
})();
