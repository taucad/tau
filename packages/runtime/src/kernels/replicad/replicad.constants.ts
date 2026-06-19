/**
 * Browser-safe Replicad kernel metadata shared by registration adapters.
 */

/**
 * Canonical regex for detecting replicad usage in source code.
 *
 * Branches: ESM import, CJS require, destructured global, JSDoc typedef, CDN import.
 * @public
 */
export const replicadDetectPattern =
  /import.*from\s+["']replicad["']|\bconst\s*{\s*[\s\w,]*}\s*=\s*replicad\s*;|require\s*\(\s*["']replicad["']\s*\)|@typedef.*import\s*\(\s*["']replicad["']\s*\)|import.*from\s+["']https?:\/\/[^"']*replicad[^"']*["']/s;
