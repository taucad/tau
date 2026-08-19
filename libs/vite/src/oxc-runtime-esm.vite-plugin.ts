import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

const helperPrefix = '@oxc-project/runtime/helpers/';

/**
 * Vite 8's built-in `vite:oxc` plugin transforms TypeScript decorators into
 * imports from `@oxc-project/runtime/helpers/*`. Its internal resolveId hook
 * resolves these from a CJS-first conditional export. The ESM-only SSR module
 * runner then crashes with `module is not defined`.
 *
 * This plugin intercepts those imports before `vite:oxc` and resolves them
 * directly to the ESM file on disk, bypassing the conditional export map.
 *
 * Resolution is anchored at this package's `node_modules` via
 * `createRequire(import.meta.url)` — Vite 8 no longer ships
 * `@oxc-project/runtime` next to `vite/package.json`, so we depend on
 * `@oxc-project/runtime` explicitly on `@taucad/vite`.
 *
 * @public
 */
export function oxcRuntimeEsm(): Plugin {
  const esmRequire = createRequire(import.meta.url);
  let runtimeDirectory: string;
  return {
    name: 'vite:oxc-runtime-esm',
    enforce: 'pre',
    apply: 'serve',
    configResolved() {
      runtimeDirectory = path.dirname(esmRequire.resolve('@oxc-project/runtime/package.json'));
    },
    resolveId: {
      filter: { id: /^@oxc-project\/runtime\/helpers\// },
      handler(id) {
        if (id.includes('/esm/')) {
          return;
        }
        const helperName = id.slice(helperPrefix.length);
        return path.join(runtimeDirectory, 'src/helpers/esm', helperName + '.js');
      },
    },
  };
}
