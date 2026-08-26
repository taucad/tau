/**
 * Browser-safe OpenCascade kernel metadata shared by registration adapters.
 */

/**
 * Canonical regex for detecting libcascade usage in source code.
 * The module specifier is always 'libcascade'.
 *
 * Branches: ESM import, CJS require.
 * @public
 */
export const opencascadeDetectPattern = /import.*from\s+["']libcascade["']|require\s*\(\s*["']libcascade["']\s*\)/s;
