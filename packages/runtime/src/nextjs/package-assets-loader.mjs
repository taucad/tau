/* oxlint-disable jsdoc-js/no-types -- Webpack loaders are JavaScript modules; JSDoc supplies their loader context types. */

import { createRequire } from 'node:module';
import { dirname, relative } from 'node:path';
import { stripLiteral } from 'strip-literal';

const packageAssetUrlPattern = /new\s+URL\(\s*import\.meta\.resolve\(\s*(["'`])(?<specifier>[^"'`]+)\1\s*\)\s*,?\s*\)/g;

/**
 * Convert exported package asset URLs into Webpack's native relative URL edge.
 *
 * @this {{ resourcePath: string }}
 * @param {string} source - Module source.
 * @returns {string} Transformed source.
 */
export default function packageAssetsLoader(source) {
  if (!source.includes('import.meta.resolve')) {
    return source;
  }

  const stripped = stripLiteral(source);
  const require_ = createRequire(this.resourcePath);
  let output = source;
  for (const match of [...source.matchAll(packageAssetUrlPattern)].reverse()) {
    const specifier = match.groups?.specifier;
    if (!stripped.startsWith('new ', match.index) || specifier === undefined) {
      continue;
    }

    const assetPath = require_.resolve(specifier);
    const relativePath = relative(dirname(this.resourcePath), assetPath).replaceAll('\\', '/');
    const assetSpecifier = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    const replacement = `new URL(${JSON.stringify(assetSpecifier)}, import.meta.url)`;
    output = output.slice(0, match.index) + replacement + output.slice(match.index + match[0].length);
  }
  return output;
}
