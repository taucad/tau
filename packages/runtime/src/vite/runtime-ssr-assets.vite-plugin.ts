import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { stripLiteral } from 'strip-literal';
import type { Plugin, ResolvedConfig } from 'vite';

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
  const emittedAssets = new Map<string, string>();

  return {
    name: 'taucad-runtime:assets',
    enforce: 'pre',
    config: () => ({ build: { ssrEmitAssets: true } }),
    configResolved(config: ResolvedConfig) {
      const consumer = 'consumer' in config ? config.consumer : undefined;
      isServe = config.command === 'serve';
      isServerEnvironment = consumer === 'server' || Boolean(config.build.ssr);
      isSsrBuild = Boolean(config.build.ssr) && consumer !== 'client';
    },
    buildStart() {
      emittedAssets.clear();
    },
    transform: {
      filter: { code: 'import.meta' },
      handler(code, id) {
        if (!code.includes('import.meta')) {
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
          let referenceId = emittedAssets.get(assetKey);
          if (!referenceId) {
            referenceId = this.emitFile({
              type: 'asset',
              name: path.basename(match.assetPath),
              source,
            });
            emittedAssets.set(assetKey, referenceId);
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
