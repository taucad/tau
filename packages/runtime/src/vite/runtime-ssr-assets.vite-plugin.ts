import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { stripLiteral } from 'strip-literal';
import type { Environment, Plugin, ResolvedConfig } from 'vite';

const urlPattern = /new\s+URL\(\s*(["'`])(?<specifier>[^"'`]+)\1\s*,\s*import\.meta\.url\s*,?\s*\)(?<href>\.href)?/g;
const packageUrlPattern =
  /new\s+URL\(\s*import\.meta\.resolve\(\s*(["'`])(?<specifier>[^"'`]+)\1\s*\)\s*,?\s*\)(?<href>\.href)?/g;
const stripLimit = 256 * 1024;
const windowLookback = 4096;
const windowLookAhead = 256;

type UrlMatch = {
  readonly full: string;
  readonly specifier: string;
  readonly hasHref: boolean;
  readonly index: number;
};

type AssetMatch = UrlMatch & { readonly assetPath: string };

const cleanId = (id: string): string => (id.startsWith('\u0000') ? id.slice(1) : id).replace(/[#?].*$/, '');

const isExternalLikeSpecifier = (specifier: string): boolean =>
  /^[a-z][\d+.a-z-]*:/i.test(specifier) || specifier.startsWith('/') || specifier.endsWith('/');

const isTypeScriptPath = (filePath: string): boolean => /\.(?:[cm]?ts|tsx)$/.test(filePath);

const toExistingFile = (filePath: string): string | undefined => {
  try {
    return fs.statSync(filePath).isFile() ? fs.realpathSync(filePath) : undefined;
  } catch {
    return undefined;
  }
};

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

const collectMatches = (code: string, pattern: RegExp): UrlMatch[] => {
  const rawMatches = [...code.matchAll(pattern)];
  if (rawMatches.length === 0) {
    return [];
  }

  const strippedWhole = code.length <= stripLimit ? stripLiteral(code) : undefined;
  return rawMatches
    .filter((match) =>
      strippedWhole === undefined ? isRealCallSite(code, match) : strippedWhole.startsWith('new ', match.index),
    )
    .map((match) => ({
      full: match[0],
      specifier: match.groups?.['specifier'] ?? '',
      hasHref: Boolean(match.groups?.['href']),
      index: match.index,
    }));
};

const findAssetMatches = (matches: readonly UrlMatch[], importer: string): AssetMatch[] => {
  const directory = path.dirname(cleanId(importer));
  return matches.flatMap((match): AssetMatch[] => {
    if (isExternalLikeSpecifier(match.specifier)) {
      return [];
    }
    const assetPath = toExistingFile(path.resolve(directory, match.specifier));
    if (!assetPath || isTypeScriptPath(assetPath)) {
      return [];
    }
    return [{ ...match, assetPath }];
  });
};

const findPackageAssetMatches = (matches: readonly UrlMatch[], importer: string): AssetMatch[] => {
  const require_ = createRequire(cleanId(importer));
  return matches.map((match) => {
    let resolved: string;
    try {
      resolved = require_.resolve(match.specifier);
    } catch (error) {
      throw new Error(`Cannot resolve package asset ${JSON.stringify(match.specifier)} from ${cleanId(importer)}`, {
        cause: error,
      });
    }
    const assetPath = toExistingFile(resolved);
    if (!assetPath || isTypeScriptPath(assetPath)) {
      throw new Error(`Package asset ${JSON.stringify(match.specifier)} did not resolve to a file`);
    }
    return { ...match, assetPath };
  });
};

/**
 * A node or jsdom Vitest run never fetches a served URL, so the rewrite is
 * skipped there. Vitest's browser mode *is* served by Vite and needs the same
 * `/@fs/` rewrite a dev server gets. `test` is read structurally because
 * `vite`'s own `ResolvedConfig` does not declare it.
 *
 * @param config - The resolved Vite config, possibly carrying Vitest's options.
 * @returns Whether this config belongs to a headless (unserved) test run.
 */
const isUnservedTestRun = (config: {
  readonly mode: string;
  readonly test?: { readonly browser?: { readonly enabled?: boolean } };
}): boolean => config.mode === 'test' && config.test?.browser?.enabled !== true;

/**
 * Emit literal assets reached through the consumer's runtime plugin graph.
 * Vite intentionally leaves generic `new URL(literal, import.meta.url)`
 * expressions untouched in SSR builds and does not resolve package subpaths in
 * `new URL(import.meta.resolve(literal))` browser code.
 *
 * This is an internal invariant composed by {@link tauRuntime}; it does not
 * resolve or emit TypeScript modules and is not a consumer escape hatch.
 *
 * @internal
 * @returns A Vite plugin enforcing runtime-owned asset emission.
 */
export const runtimeAssetsPlugin = (): Plugin => {
  let isSsrBuild = false;
  let isServe = false;
  let isServerEnvironment = false;
  let isTest = false;
  const emittedAssets = new WeakMap<Environment, Map<string, string>>();
  // Reference id → whether a rendered chunk resolved its placeholder.
  const emittedReferences = new WeakMap<Environment, Map<string, boolean>>();

  return {
    name: 'taucad-runtime:assets',
    enforce: 'pre',
    // Dev calls buildStart only for the client environment unless a plugin opts in, which would
    // leave every other environment without the per-environment asset state this plugin keys on.
    perEnvironmentStartEndDuringDev: true,
    config: () => ({ build: { ssrEmitAssets: true } }),
    configResolved(config: ResolvedConfig) {
      const consumer = 'consumer' in config ? config.consumer : undefined;
      isServe = config.command === 'serve';
      isServerEnvironment = consumer === 'server' || Boolean(config.build.ssr);
      isSsrBuild = Boolean(config.build.ssr) && consumer !== 'client';
      isTest = isUnservedTestRun(config);
    },
    buildStart() {
      emittedAssets.set(this.environment, new Map());
      emittedReferences.set(this.environment, new Map());
    },
    // Rollup's rebuild cache skips transform for an unchanged module and replays its emissions, but
    // buildStart dropped the references its placeholders name, so re-transform it. Undefined leaves
    // every other module to later plugins. Rolldown does not implement this hook.
    // ponytail: asset owners re-read and re-hash their assets on every rebuild; cache per module if slow.
    shouldTransformCachedModule: ({ code }) => code.includes('__TAUCAD_RUNTIME_ASSET__') || undefined,
    transform: {
      filter: { code: 'import.meta' },
      handler(code, id) {
        if (isTest || !code.includes('import.meta')) {
          return;
        }

        const packageMatches = code.includes('import.meta.resolve')
          ? findPackageAssetMatches(collectMatches(code, packageUrlPattern), id)
          : [];
        const relativeMatches = isSsrBuild ? findAssetMatches(collectMatches(code, urlPattern), id) : [];
        const matches = [...packageMatches, ...relativeMatches];
        if (matches.length === 0) {
          return;
        }
        const environmentAssets = emittedAssets.get(this.environment);
        const environmentReferences = emittedReferences.get(this.environment);
        if (!environmentAssets || !environmentReferences) {
          throw new Error('Runtime asset state was not initialized for this build environment');
        }

        const replacements: Array<{ readonly match: UrlMatch; readonly replacement: string }> = [];
        for (const match of matches) {
          if (isServe) {
            if (!isServerEnvironment) {
              const url = `/@fs/${match.assetPath.replaceAll('\\', '/')}`;
              replacements.push({
                match,
                replacement: match.hasHref
                  ? `new URL(${JSON.stringify(url)}, import.meta.url).href`
                  : `new URL(${JSON.stringify(url)}, import.meta.url)`,
              });
            }
            continue;
          }

          const source = fs.readFileSync(match.assetPath);
          const assetKey = `${path.basename(match.assetPath)}\0${createHash('sha256').update(source).digest('hex')}`;
          this.addWatchFile(match.assetPath);
          let referenceId = environmentAssets.get(assetKey);
          if (!referenceId) {
            referenceId = this.emitFile({
              type: 'asset',
              name: path.basename(match.assetPath),
              source,
            });
            environmentAssets.set(assetKey, referenceId);
            environmentReferences.set(referenceId, false);
          }
          const assetReference = `__TAUCAD_RUNTIME_ASSET__${referenceId}__`;
          replacements.push({
            match,
            replacement: match.hasHref
              ? `new URL(${JSON.stringify(assetReference)}, import.meta.url).href`
              : `new URL(${JSON.stringify(assetReference)}, import.meta.url)`,
          });
        }

        let result = code;
        for (const { match, replacement } of replacements.sort((left, right) => right.match.index - left.match.index)) {
          result = result.slice(0, match.index) + replacement + result.slice(match.index + match.full.length);
        }
        return { code: result, map: null, moduleType: 'js' };
      },
    },
    renderChunk(code, chunk) {
      const environmentReferences = emittedReferences.get(this.environment);
      if (!environmentReferences) {
        throw new Error('Runtime asset state was not initialized for this build environment');
      }
      let result = code;
      for (const referenceId of environmentReferences.keys()) {
        const assetReference = `__TAUCAD_RUNTIME_ASSET__${referenceId}__`;
        if (!result.includes(assetReference)) {
          continue;
        }
        const relativePath = path.posix.relative(path.posix.dirname(chunk.fileName), this.getFileName(referenceId));
        const runtimePath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
        const encodedRuntimePath = runtimePath
          .split('/')
          .map((segment) => encodeURIComponent(segment).replaceAll("'", '%27'))
          .join('/');
        result = result.replaceAll(assetReference, encodedRuntimePath);
        if (result.includes(assetReference)) {
          throw new Error(`Runtime asset reference ${referenceId} was not resolved in ${chunk.fileName}`);
        }
        environmentReferences.set(referenceId, true);
      }
      return result === code ? undefined : { code: result, map: null };
    },
    // Transform emits before tree-shaking, so a dropped importer leaves its asset behind. This runs
    // before Vite's manifest, which lists every named asset, so the manifest omits pruned files.
    generateBundle(_, bundle) {
      const environmentReferences = emittedReferences.get(this.environment);
      if (!environmentReferences) {
        throw new Error('Runtime asset state was not initialized for this build environment');
      }
      const resolvedFiles = new Set<string>();
      const unresolvedFiles = new Set<string>();
      for (const [referenceId, isResolved] of environmentReferences) {
        (isResolved ? resolvedFiles : unresolvedFiles).add(this.getFileName(referenceId));
      }
      // ponytail: bundlers merge identical sources, so another emitter may use the same file. A
      // base-name match in the chunks and text assets present now finds that use; one written only
      // URL-encoded, or by a later generateBundle hook, is missed (Vite's worker plugin re-emits).
      const outputTexts = Object.values(bundle)
        .map((output) => (output.type === 'chunk' ? output.code : output.source))
        .filter((text): text is string => typeof text === 'string');
      for (const fileName of unresolvedFiles) {
        const baseName = path.posix.basename(fileName);
        if (!resolvedFiles.has(fileName) && !outputTexts.some((text) => text.includes(baseName))) {
          // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- the bundle is keyed by output file name
          delete bundle[fileName];
        }
      }
    },
  };
};
