import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Emit TypeScript files referenced via `new URL('./path.js', import.meta.url)`
 * as fully-bundled Rollup chunks instead of raw asset copies.
 *
 * In dev mode Vite transpiles TypeScript on-the-fly so .ts assets work fine.
 * In production builds, however, .ts files emitted as assets are copied
 * verbatim — the server serves them with `video/mp2t` MIME type and the
 * browser rejects them ("non-JavaScript MIME type").
 *
 * This plugin fixes the production path: for every `new URL()` reference
 * whose .js path resolves to a .ts source file, it tells Rollup to emit
 * the file as a chunk (full pipeline: transpile → resolve → bundle) and
 * swaps the expression with `import.meta.ROLLUP_FILE_URL_<ref>`.
 *
 * When the .js file actually exists (pre-built package consumed by 3rd
 * parties), the fs check fails and the plugin is a no-op — Vite's default
 * asset handling takes over unchanged.
 */
export function tsModuleUrlPlugin(): Plugin {
  return {
    name: 'vite-plugin-ts-module-urls',
    enforce: 'pre',
    apply: 'build',

    transform(code, id) {
      if (!code.includes('import.meta.url')) {
        return;
      }

      const urlPattern = /new\s+URL\(\s*['"]([^'"]+\.js)['"]\s*,\s*import\.meta\.url\s*\)(\.href)?/g;
      const dir = path.dirname(id);

      type UrlMatch = { full: string; relPath: string; hasHref: boolean; idx: number };

      const matches: UrlMatch[] = [...code.matchAll(urlPattern)]
        .map((m) => ({
          full: m[0],
          relPath: m[1]!,
          hasHref: Boolean(m[2]),
          idx: m.index,
        }))
        .filter(({ relPath }) => fs.existsSync(path.resolve(dir, relPath.replace(/\.js$/, '.ts'))));

      if (matches.length === 0) {
        return;
      }

      let result = code;

      for (const match of [...matches].reverse()) {
        const tsPath = path.resolve(dir, match.relPath.replace(/\.js$/, '.ts'));
        const refId = this.emitFile({ type: 'chunk', id: tsPath });

        const replacement = match.hasHref
          ? `import.meta.ROLLUP_FILE_URL_${refId}`
          : `new URL(import.meta.ROLLUP_FILE_URL_${refId})`;

        result = result.slice(0, match.idx) + replacement + result.slice(match.idx + match.full.length);
      }

      return { code: result, map: null };
    },
  };
}
