/**
 * Conformance test C4 (v6 Appendix B).
 *
 * Asserts that the runtime layered model is preserved: only
 * `transport/` files (the plugin layer) and the explicit
 * `transport/_internal/` helpers may import `@taucad/rpc` directly.
 *
 * `client/`, `host/`, and `framework/` are higher layers that consume
 * RPC machinery only through the transport abstraction. Direct imports
 * leak channel/port primitives across the v6 layer boundary.
 *
 * Type-only imports (`import type { Channel } from '@taucad/rpc'`) are
 * permitted because they have no runtime cost and only carry generic
 * shape information across the seam (used e.g. by
 * `framework/runtime-worker-client.ts` to type a transport-supplied
 * channel reference).
 *
 * Companion tests:
 *
 * - C5 (`client/runtime-imports-no-wire-primitives.test.ts`) polices
 *   wire primitives (`MessagePort` / `SharedArrayBuffer` / `Worker`)
 *   on the consumer surface.
 * - C18 (`types/runtime-protocol-payload-shape.test.ts`) polices
 *   runtime payload shapes against the protocol Zod schemas.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const runtimeSource = here;

/**
 * Detects a value-level import of `@taucad/rpc`. A value import has
 * no `type` keyword on the `import` line. Side-effect imports
 * (`import '@taucad/rpc'`) are also flagged.
 */
const valueImportPattern = /^\s*import\s+(?!type\b)[^;]*?from\s+["']@taucad\/rpc["'];?/gm;

/**
 * Detects a re-export of value bindings from `@taucad/rpc`. A re-export
 * with the `type` keyword is permitted (`export type { Channel } from '...';`).
 */
const valueReExportPattern = /^\s*export\s+(?!type\b){[^}]*}\s*from\s+["']@taucad\/rpc["'];?/gm;

/**
 * Detects a require() of `@taucad/rpc` (CJS interop fallback).
 */
const requirePattern = /\brequire\s*\(\s*["']@taucad\/rpc["']\s*\)/g;

const findFiles = (root: string): string[] => {
  const out: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === '_internal') {
          continue;
        }
        walk(full);
        continue;
      }
      const relativePath = relative(root, full);
      if (!relativePath.endsWith('.ts')) {
        continue;
      }
      if (relativePath.endsWith('.test.ts') || relativePath.endsWith('.test-d.ts')) {
        continue;
      }
      out.push(full);
    }
  };
  walk(root);
  return out;
};

const scanForRpcValueImports = (filePath: string): readonly string[] => {
  const source = readFileSync(filePath, 'utf8');
  const violations: string[] = [];
  for (const pattern of [valueImportPattern, valueReExportPattern, requirePattern]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      violations.push(match[0].trim());
    }
  }
  return violations;
};

describe('C4 — runtime layers above transport do not value-import @taucad/rpc', () => {
  describe('client/ surface', () => {
    const files = findFiles(join(runtimeSource, 'client'));
    for (const path of files) {
      const relativePath = relative(runtimeSource, path);
      it(`should not value-import @taucad/rpc from ${relativePath}`, () => {
        expect(scanForRpcValueImports(path)).toEqual([]);
      });
    }
  });

  describe('host/ surface', () => {
    const files = findFiles(join(runtimeSource, 'host'));
    for (const path of files) {
      const relativePath = relative(runtimeSource, path);
      it(`should not value-import @taucad/rpc from ${relativePath}`, () => {
        expect(scanForRpcValueImports(path)).toEqual([]);
      });
    }
  });

  /**
   * `framework/` hosts the kernel-execution wrapper that consumes
   * channels and pools but never opens them; the wire-layer files
   * (`wire-transferables`,
   * `geometry-materialiser`) now live in
   * `transport/_internal/`. Type-only imports from `@taucad/rpc` (e.g.
   * `Channel<P>` shape carriers) remain permitted by the value-import
   * regex above.
   */
  describe('framework/ surface', () => {
    const files = findFiles(join(runtimeSource, 'framework'));
    for (const path of files) {
      const relativePath = relative(runtimeSource, path);
      it(`should not value-import @taucad/rpc from ${relativePath}`, () => {
        expect(scanForRpcValueImports(path)).toEqual([]);
      });
    }
  });
});
