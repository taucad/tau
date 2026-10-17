import { readFileSync } from 'node:fs';

/**
 * The version in the `package.json` two folders above the entry, when it names the bundled package.
 *
 * @internal
 * @param entryUrl - `import.meta.url` of `dist/bin/tau.mjs`.
 * @param bundled - The manifest inlined at build time, whose version is the fallback.
 * @returns The installed version, or the bundled one.
 */
export const installedVersion = (
  entryUrl: string,
  bundled: { readonly name: string; readonly version: string },
): string => {
  try {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', entryUrl), 'utf8')) as {
      readonly name?: unknown;
      readonly version?: unknown;
    };
    if (manifest.name === bundled.name && typeof manifest.version === 'string') {
      return manifest.version;
    }
  } catch {
    // No manifest there, or one that does not parse: the bundled version stands.
  }
  return bundled.version;
};
