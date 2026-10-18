/**
 * Browser-safe Replicad kernel metadata shared by registration adapters.
 */

/**
 * Canonical regex for detecting replicad usage in source code.
 *
 * Branches: ESM `from` clause, CJS require, destructured global, JSDoc typedef, CDN import. No branch spans
 * lines through an unbounded wildcard, so the test stays linear in the entry's size (D-RT-23).
 * @public
 */
export const replicadDetectPattern =
  /\bfrom\s*["']replicad["']|\bconst\s*{\s*[\s\w,]*}\s*=\s*replicad\s*;|require\s*\(\s*["']replicad["']\s*\)|@typedef[^\n]*?import\s*\(\s*["']replicad["']\s*\)|\bfrom\s*["']https?:\/\/[^"']*replicad[^"']*["']/;
