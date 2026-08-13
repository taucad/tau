import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripLiteral } from 'strip-literal';
import type { Plugin, ResolvedConfig } from 'vite';
import { runtimePackages } from '#vite/runtime-invariants.js';

const runtimePackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeAssetPackages = [...runtimePackages, '@taucad/converter', '@taucad/render', '@taucad/vm'] as const;
const urlPattern = /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*,?\s*\)(\.href)?/g;
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
    return fs.statSync(filePath).isFile() ? filePath : undefined;
  } catch {
    return undefined;
  }
};

const findPackageRoot = (entry: string): string | undefined => {
  let directory = path.dirname(cleanId(entry));
  while (directory !== path.dirname(directory)) {
    if (toExistingFile(path.join(directory, 'package.json'))) {
      return directory;
    }
    directory = path.dirname(directory);
  }
  return undefined;
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

const collectMatches = (code: string): UrlMatch[] => {
  const rawMatches = [...code.matchAll(urlPattern)];
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
      specifier: match[1]!,
      hasHref: Boolean(match[2]),
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

/**
 * Emit literal assets owned by the runtime package graph when Vite builds an
 * SSR/Electron environment. Vite intentionally leaves generic
 * `new URL(literal, import.meta.url)` expressions untouched in SSR builds.
 *
 * This is an internal invariant composed by {@link tauRuntime}; it does not
 * resolve or emit TypeScript modules and is not a consumer escape hatch.
 *
 * @internal
 * @returns A Vite plugin enforcing runtime-owned SSR asset emission.
 */
export const runtimeSsrAssetsPlugin = (): Plugin => {
  let isSsrBuild = false;
  const packageRoots = new Set([runtimePackageRoot]);
  const emittedAssets = new Map<string, string>();

  const isRuntimeModule = (id: string): boolean => {
    const filePath = path.resolve(cleanId(id));
    return [...packageRoots].some((root) => filePath === root || filePath.startsWith(`${root}${path.sep}`));
  };

  return {
    name: 'taucad-runtime:ssr-assets',
    enforce: 'pre',
    apply: 'build',
    config: () => ({ build: { ssrEmitAssets: true } }),
    configResolved(config: ResolvedConfig) {
      isSsrBuild = Boolean(config.build.ssr);
    },
    async buildStart() {
      emittedAssets.clear();
      for (const packageName of runtimeAssetPackages) {
        // oxlint-disable-next-line no-await-in-loop -- bounded first-party package inventory
        const resolved = await this.resolve(packageName, undefined, { skipSelf: true });
        const packageRoot = resolved ? findPackageRoot(resolved.id) : undefined;
        if (packageRoot) {
          packageRoots.add(packageRoot);
        }
      }
    },
    transform: {
      filter: { code: 'import.meta.url' },
      handler(code, id) {
        if (!isSsrBuild || !code.includes('import.meta.url') || !isRuntimeModule(id)) {
          return;
        }

        const matches = findAssetMatches(collectMatches(code), id);
        if (matches.length === 0) {
          return;
        }

        const replacements: Array<{ readonly match: UrlMatch; readonly replacement: string }> = [];
        for (const match of matches) {
          let referenceId = emittedAssets.get(match.assetPath);
          if (!referenceId) {
            this.addWatchFile(match.assetPath);
            referenceId = this.emitFile({
              type: 'asset',
              name: path.basename(match.assetPath),
              source: fs.readFileSync(match.assetPath),
            });
            emittedAssets.set(match.assetPath, referenceId);
          }
          replacements.push({
            match,
            replacement: match.hasHref
              ? `import.meta.ROLLUP_FILE_URL_${referenceId}`
              : `new URL(import.meta.ROLLUP_FILE_URL_${referenceId})`,
          });
        }

        let result = code;
        for (const { match, replacement } of replacements.sort((left, right) => right.match.index - left.match.index)) {
          result = result.slice(0, match.index) + replacement + result.slice(match.index + match.full.length);
        }
        return { code: result, map: null, moduleType: 'js' };
      },
    },
  };
};
