/**
 * Browser-safe OpenCascade kernel metadata shared by registration adapters.
 */

/**
 * Canonical regex for detecting opencascade.js usage in source code.
 * The module specifier is always 'opencascade.js' (the .js suffix is required).
 *
 * Branches: ESM import, CJS require.
 * @public
 */
export const opencascadeDetectPattern =
  /import.*from\s+["']opencascade\.js["']|require\s*\(\s*["']opencascade\.js["']\s*\)/s;
