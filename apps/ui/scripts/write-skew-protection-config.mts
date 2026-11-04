/**
 * Declare Netlify skew protection for this deploy (TAU-UI-S), production only.
 *
 * Writes `.netlify/v1/skew-protection.json` (Netlify Frameworks API) when
 * `TAU_SKEW_PROTECTION=true`: requests for the hashed assets, React Router's `.data` and
 * `/__manifest` that carry the deploy token cookie are answered by the deploy that issued it.
 * The server sets the cookie on documents (`app/lib/skew-protection.server.ts`). Otherwise
 * writes nothing.
 *
 * Usage: node scripts/write-skew-protection-config.mts   (from apps/ui, in the production build command)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

/** The cookie the server sets (`skewProtectionCookieName` in `app/lib/skew-protection.server.ts`). */
export const skewProtectionCookieName = 'tau_skew';

/** The Frameworks API configuration: which paths are pinned, and where the token is read from. */
export const skewProtectionConfig = {
  patterns: [String.raw`^/assets/.*`, String.raw`.*\.data$`, String.raw`^/__manifest$`],
  sources: [{ type: 'cookie', name: skewProtectionCookieName }],
} as const;

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  if (process.env['TAU_SKEW_PROTECTION'] === 'true') {
    const path = resolve(import.meta.dirname, '../.netlify/v1/skew-protection.json');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(skewProtectionConfig, undefined, 2)}\n`);
    console.log(`✓ Skew protection declared in ${path}.`);
  } else {
    console.log('→ Skew protection off (TAU_SKEW_PROTECTION is not true); no config written.');
  }
}
