/**
 * Declare Netlify skew protection for this deploy (TAU-UI-S), production only.
 *
 * Writes `.netlify/v1/skew-protection.json` (Netlify Frameworks API): requests for the hashed
 * assets, React Router's `.data` and `/__manifest` that carry the deploy token cookie are
 * answered by the deploy that issued it. The server sets the cookie on documents
 * (`app/lib/skew-protection.server.ts`). Netlify honours it on production deploys only; an
 * alias deploy (staging) or a preview ignores it.
 *
 * Usage: node scripts/write-skew-protection-config.mts   (from apps/ui, in the production build command)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
// oxlint-disable-next-line no-restricted-imports -- Native Node build step reads the server's cookie name without bundler aliases.
import { skewProtectionCookieName } from '../app/lib/skew-protection.server.ts';

/** The Frameworks API configuration: which paths are pinned, and where the token is read from. */
export const skewProtectionConfig = {
  // The runtime bundle (the C# service) a page starts later is pinned like its chunks: the address a
  // page's build named must answer from that deploy (`retain-previous-assets.mts` also keeps it). PicoGK
  // loads by digest from the dependency hosts, which no deploy pins.
  patterns: [
    String.raw`^/assets/.*`,
    String.raw`^/csharp-language/.*`,
    String.raw`.*\.data$`,
    String.raw`^/__manifest$`,
  ],
  sources: [{ type: 'cookie', name: skewProtectionCookieName }],
} as const;

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const path = resolve(import.meta.dirname, '../.netlify/v1/skew-protection.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(skewProtectionConfig, undefined, 2)}\n`);
  console.log(`✓ Skew protection declared in ${path}.`);
}
