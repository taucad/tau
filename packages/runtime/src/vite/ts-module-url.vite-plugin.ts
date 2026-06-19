import fs from 'node:fs';
import path from 'node:path';
import { stripLiteral } from 'strip-literal';
import type { Plugin } from 'vite';

/**
 * Optional debug channel for the chunk-emit pipeline. Enable by setting
 * `VITE_TS_MODULE_URL_DEBUG=1` in the env when reproducing build-stall or
 * chunk-graph regressions. Quiet by default — production builds and CI
 * never emit through this writer.
 *
 * @internal
 */
const debugEnabled = process.env['VITE_TS_MODULE_URL_DEBUG'] === '1';
let seqCounter = 0;
const log = (message: string): void => {
  if (debugEnabled) {
    process.stderr.write(`[ts-mod-url] ${message}\n`);
  }
};

/**
 * Shared regex for `new URL('<spec>', import.meta.url)` patterns.
 * Captures the specifier (group 1) and optional `.href` suffix (group 2).
 *
 * The specifier is intentionally not pinned to `.js` — bare module
 * specifiers (e.g. `@taucad/runtime/worker`) and extension-less paths
 * also need processing because Vite/Rollup will emit the resolved
 * `.ts` file as a verbatim asset (`/assets/<chunk>-<hash>.ts`) which
 * the browser refuses to load as a Worker module. Filtering for
 * `.ts`-resolving specifiers happens in {@link findTsSourceMatches}.
 */
const urlPattern = /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*,?\s*\)(\.href)?/g;

type UrlMatch = {
  full: string;
  specifier: string;
  hasHref: boolean;
  index: number;
};

type UrlMatchWithTsPath = UrlMatch & { tsPath: string };

/**
 * Specifiers we never try to resolve as modules. Anything with a URL
 * scheme (`http://`, `file://`, `data:`) or starting with `/` (absolute
 * filesystem path) is left to Vite's default asset handling.
 */
const isExternalLikeSpec = (spec: string): boolean => /^[a-z][\d+.a-z-]*:/i.test(spec) || spec.startsWith('/');

/** Tokens above this size skip whole-file stripping and use {@link isRealCallSite} per match instead. */
const stripLimit = 256 * 1024;

/** Bytes of source before each match boundary for scoped stripping (see heuristic in {@link isRealCallSite}). */
const windowLookback = 4096;

/** Bytes of source kept after each match for scoped stripping. */
const windowLookAhead = 256;

/**
 * True when regex match index lies on a **real** `new URL(...)` expression (not prose in a comment or string).
 *
 * @remarks
 * Only used when {@link stripLimit} is exceeded — full-file {@link stripLiteral} can overflow V8's regex
 * stack on multi-megabyte string literals (e.g. Emscripten `SINGLE_FILE` base64 WASM). We tokenize a small
 * window only. {@link windowLookback} is a heuristic: a real `new URL` call more than 4 KB inside a single
 * block comment could be misclassified as real (failure mode: one extra chunk emit, not build crash).
 */
const isRealCallSite = (code: string, match: RegExpExecArray): boolean => {
  const matchStart = match.index;
  let windowStart = Math.max(0, matchStart - windowLookback);
  const lastNewline = code.lastIndexOf('\n', windowStart);
  if (lastNewline !== -1 && lastNewline + 1 >= matchStart - windowLookback * 2) {
    windowStart = lastNewline + 1;
  }
  const windowEnd = Math.min(code.length, matchStart + match[0].length + windowLookAhead);
  const stripped = stripLiteral(code.slice(windowStart, windowEnd));
  return stripped.startsWith('new ', matchStart - windowStart);
};

/**
 * Collect every real `new URL(spec, import.meta.url)` call site in `code`.
 *
 * @remarks
 * The regex alone treats source as flat text, so any `new URL(...)`
 * appearing inside a JSDoc block, `//` comment, or string literal would
 * historically materialise as a real `emitFile()` edge in Rolldown's
 * chunk graph. When the same spec resolved to a chunk that statically
 * imported the file containing the prose, the resulting cycle deadlocked
 * Rolldown's chunk planner during `pnpm nx build ui` — see
 * `docs/research/runtime-transport-authoring-simplification.md`.
 *
 * `strip-literal` replaces comment / string-literal interiors with
 * **same-length spaces**, preserving every character index. We keep a
 * regex match only when the same position in the stripped view still
 * starts with `new ` — i.e., the call site survived stripping (was real
 * code), not just text inside a comment or string.
 *
 * **Cheap-first invariant:** run `urlPattern` before any `stripLiteral` call. Zero matches means we never
 * tokenize (dependency files that only mention `import.meta.url` for Emscripten glue are free). For sources
 * larger than {@link stripLimit}, strip only per-match windows via {@link isRealCallSite}. Same pattern as
 * Vite upstream's transform-filter hardening ([`vitejs/vite#21800`](https://github.com/vitejs/vite/pull/21800)).
 * Root cause: `docs/research/vite-plugin-large-string-literal-overflow.md`.
 *
 * @internal
 */
const collectMatches = (code: string): UrlMatch[] => {
  const rawMatches = [...code.matchAll(urlPattern)];
  if (rawMatches.length === 0) {
    return [];
  }

  const strippedWhole = code.length <= stripLimit ? stripLiteral(code) : undefined;
  const keepMatch = (m: RegExpExecArray): boolean => {
    if (strippedWhole !== undefined) {
      return strippedWhole.startsWith('new ', m.index);
    }
    return isRealCallSite(code, m);
  };

  return rawMatches
    .filter((m) => keepMatch(m))
    .map((m) => ({
      full: m[0],
      specifier: m[1]!,
      hasHref: Boolean(m[2]),
      index: m.index,
    }));
};

type RollupLikeContext = {
  resolve?: (specifier: string, importer?: string) => Promise<{ id: string } | undefined> | { id: string } | undefined;
};

/**
 * Resolve every `new URL(...)` reference in `code` whose target is a
 * TypeScript source file:
 *
 * 1. Relative `.js` paths whose sibling `.ts` exists on disk (fast
 *    path — no async resolution needed; matches the original plugin's
 *    behavior for the in-package case).
 * 2. Any other specifier (relative without `.js`, or bare module
 *    specifier like `@taucad/runtime/worker`) is dispatched through
 *    Rollup's `this.resolve()` so package-export maps are honoured.
 *    The match is kept only when the resolved id ends in `.ts`.
 */
// oxlint-disable-next-line max-params -- refactor
const findTsSourceMatches = async (
  matches: UrlMatch[],
  directory: string,
  importer: string,
  context: RollupLikeContext,
  seq: number,
): Promise<UrlMatchWithTsPath[]> => {
  const out: UrlMatchWithTsPath[] = [];
  let subSeq = 0;

  for (const match of matches) {
    if (isExternalLikeSpec(match.specifier)) {
      continue;
    }

    if (match.specifier.endsWith('.js')) {
      const tsPath = path.resolve(directory, match.specifier.replace(/\.js$/, '.ts'));
      if (fs.existsSync(tsPath)) {
        log(`fast     seq=${seq} spec=${match.specifier} -> ${tsPath}`);
        out.push({ ...match, tsPath });
        continue;
      }
    }

    if (typeof context.resolve === 'function') {
      subSeq += 1;
      const tag = `${seq}.${subSeq}`;
      log(`resolve> seq=${tag} spec=${match.specifier} importer=${importer}`);
      const t0 = Date.now();
      // oxlint-disable-next-line no-await-in-loop -- sequential resolve calls
      const resolved = await context.resolve(match.specifier, importer);
      log(`resolve< seq=${tag} elapsed=${Date.now() - t0}ms id=${resolved?.id ?? '<none>'}`);
      if (resolved && typeof resolved.id === 'string' && resolved.id.endsWith('.ts')) {
        out.push({ ...match, tsPath: resolved.id });
      }
    }
  }

  return out;
};

/**
 * Build-time plugin: emit TypeScript files referenced via
 * `new URL(<spec>, import.meta.url)` as fully-bundled Rollup chunks
 * instead of raw asset copies.
 *
 * In dev mode Vite transpiles TypeScript on-the-fly so .ts assets work fine.
 * In production builds, however, .ts files emitted as assets are copied
 * verbatim — the server serves them with `video/mp2t` MIME type and the
 * browser rejects them ("non-JavaScript MIME type").
 *
 * This plugin fixes the production path: for every `new URL()` reference
 * whose specifier resolves to a .ts source file (either via the relative
 * `.js → .ts` heuristic or via Rollup's package-export resolver for bare
 * specifiers), it tells Rollup to emit the file as a chunk (full pipeline:
 * transpile → resolve → bundle) and swaps the expression with
 * `import.meta.ROLLUP_FILE_URL_<ref>`.
 *
 * When neither path resolves to a .ts file (pre-built JS package consumed
 * by 3rd parties, or a non-module asset like `.wasm`), the plugin is a
 * no-op for that match — Vite's default asset handling takes over unchanged.
 *
 * @public
 */
export function tsModuleUrlBuildPlugin(): Plugin {
  return {
    name: 'vite:ts-module-url-build',
    enforce: 'pre',
    apply: 'build',

    transform: {
      filter: { code: 'import.meta.url' },
      async handler(code, id) {
        if (!code.includes('import.meta.url')) {
          return;
        }

        seqCounter += 1;
        const seq = seqCounter;
        const t0 = Date.now();
        log(`start    seq=${seq} id=${id}`);

        const directory = path.dirname(id);
        const rawMatches = collectMatches(code);
        log(
          `matches  seq=${seq} count=${rawMatches.length} specs=${JSON.stringify(rawMatches.map((m) => m.specifier))}`,
        );

        if (rawMatches.length === 0) {
          log(`end      seq=${seq} elapsed=${Date.now() - t0}ms (no real matches)`);
          return;
        }

        let matches: UrlMatchWithTsPath[];
        try {
          matches = await findTsSourceMatches(rawMatches, directory, id, this as unknown as RollupLikeContext, seq);
        } catch (error) {
          log(`THROW    seq=${seq} elapsed=${Date.now() - t0}ms err=${(error as Error).message}`);
          throw error;
        }
        log(`resolved seq=${seq} elapsed=${Date.now() - t0}ms ts-matches=${matches.length}`);

        if (matches.length === 0) {
          log(`end      seq=${seq} elapsed=${Date.now() - t0}ms (no-op)`);
          return;
        }

        let result = code;

        for (const match of [...matches].reverse()) {
          /* `preserveSignature: 'strict'` keeps the chunk's `export` statements
           * intact even when no static `import` consumes them. The chunk is
           * referenced via `new URL(...)` (asset pattern) and dynamic
           * `import(moduleUrl)` at runtime; without this option Rollup
           * (in app-build mode under regular Vite, e.g. electron-vite's
           * bundled Vite 5) tree-shakes the exports because the static
           * graph never imports them, leaving the chunk's `default` export
           * unreachable and breaking the runtime worker dispatcher's
           * `import(moduleUrl).then(m => m.default)` flow.
           * (Rolldown-vite preserves signatures by default; vanilla Rollup
           * does not.) */
          log(`emitFile seq=${seq} ts=${match.tsPath}`);
          const refId = this.emitFile({
            type: 'chunk',
            id: match.tsPath,
            preserveSignature: 'strict',
          });
          log(`emitted  seq=${seq} ref=${refId}`);

          const replacement = match.hasHref
            ? `import.meta.ROLLUP_FILE_URL_${refId}`
            : `new URL(import.meta.ROLLUP_FILE_URL_${refId})`;

          result = result.slice(0, match.index) + replacement + result.slice(match.index + match.full.length);
        }

        log(`end      seq=${seq} elapsed=${Date.now() - t0}ms`);
        return { code: result, map: null, moduleType: 'js' };
      },
    },
  };
}

/**
 * Serve-time plugin: rewrite `new URL('./path.js', import.meta.url)`
 * references to `.ts` sources. In standard Vite, the SSR module runner
 * resolved `.js` → `.ts` transparently; rolldown-vite does not, so dynamic
 * imports of the resulting `file://` URLs fail. This plugin rewrites the URL
 * at transform time so the resolved URL points to the existing `.ts` file.
 *
 * Bare module specifiers (`@scope/pkg/sub`) are NOT rewritten here — Vite's
 * dev module resolver consumes them directly via the package's `exports`
 * map and serves the underlying `.ts` source on the fly.
 *
 * @public
 */
export function tsModuleUrlServePlugin(): Plugin {
  return {
    name: 'vite:ts-module-url-serve',
    enforce: 'pre',
    apply: 'serve',

    transform: {
      filter: { code: 'import.meta.url' },
      handler(code, id) {
        if (!code.includes('import.meta.url')) {
          return;
        }

        const directory = path.dirname(id);
        const matches = collectMatches(code).filter(({ specifier }) => {
          if (isExternalLikeSpec(specifier)) {
            return false;
          }
          if (!specifier.endsWith('.js')) {
            return false;
          }
          const tsPath = path.resolve(directory, specifier.replace(/\.js$/, '.ts'));
          return fs.existsSync(tsPath);
        });

        if (matches.length === 0) {
          return;
        }

        let result = code;

        for (const { full, specifier } of [...matches].reverse()) {
          const tsSpecifier = specifier.replace(/\.js$/, '.ts');
          result = result.replace(full, full.replace(specifier, tsSpecifier));
        }

        return { code: result, map: null, moduleType: 'js' };
      },
    },
  };
}

/**
 * Convenience: returns both the build and serve plugins.
 * Use this when you need both (most apps do).
 *
 * @public
 */
export function tsModuleUrlPlugin(): Plugin[] {
  return [tsModuleUrlBuildPlugin(), tsModuleUrlServePlugin()];
}
