/**
 * Runtime package metadata, resolved statically from the runtime's own
 * package.json at build/load time.
 *
 * Cross-environment: the static JSON import with `type: 'json'` attribute
 * is inlined as a JS object literal by every supported bundler
 * (Vite, Rolldown, esbuild, Webpack) and is supported natively by Node
 * 22+ ESM. No runtime fs access, no bundler defines required.
 *
 * @public
 */

// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load the runtime's own package.json across Vite, Rolldown, esbuild, Webpack, and Node ESM consumers (a `paths` alias would not exist for third-party source consumers).
import packageJson from '../../package.json' with { type: 'json' };

/** Version of `@taucad/runtime` as declared in package.json. @public */
export const packageVersion: string = packageJson.version;

/** Name of the runtime package (`"@taucad/runtime"`). @public */
export const packageName: string = packageJson.name;
