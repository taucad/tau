/**
 * Browser-safe OpenCascade kernel metadata shared by registration adapters.
 */

/**
 * Canonical regex for detecting libcascade usage in source code.
 * The module specifier is always 'libcascade'.
 *
 * Branches: ESM `from` clause (import or re-export), CJS require. No branch has an unbounded wildcard, so
 * the test stays linear in the entry's size (D-RT-23).
 * @public
 */
export const opencascadeDetectPattern = /\bfrom\s*["']libcascade["']|require\s*\(\s*["']libcascade["']\s*\)/;
