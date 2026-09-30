/**
 * Conformance tests C4 + C5 (v6 Appendix B).
 *
 * Asserts that the consumer-facing surface of `@taucad/runtime` does
 * not surface wire primitives (`MessagePort`, `SharedArrayBuffer`,
 * `Worker`) in its production type signatures. The wire is owned by
 * the `transport/` plugins and the `framework/` dispatcher; everything
 * else (`client/**`, `host/**`) stays wire-agnostic.
 *
 * - C4 polices the public surface across `client/**` and `host/**`.
 * - C5 polices the v6 transport-public surface explicitly so the
 *   transport contract types do not leak wire primitives into the
 *   consumer-callable boundary.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const runtimeSource = join(here, '..');

const transportPublicSurfaceFiles = [
  'transport/runtime-transport.types.ts',
  'transport/transport-projections.ts',
  'transport/define-runtime-transport.ts',
  'transport/index.ts',
];

// `Transferable[]` is intentional on the host-binding contract
// (`HostGeometryDeliveryBinding.encode -> { transferables }`) — that
// is the transport <-> dispatcher protocol, not the consumer-facing
// client surface. The sentinel polices the consumer wire primitives
// only: raw `MessagePort` (bridge port), `SharedArrayBuffer` (caller
// allocations), and `Worker` (DOM worker class).
const bannedTokens = ['MessagePort', 'SharedArrayBuffer', 'Worker'] as const;

const stripComments = (source: string): string =>
  source
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
    .join('\n')
    .replaceAll(/\/\*[\S\s]*?\*\//g, '')
    /* Strip string and template literals so log messages, error
     * strings, and runtime warnings do not trip the wire-primitive
     * sentinel — only live type/value identifiers are policed. */
    .replaceAll(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
    .replaceAll(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
    .replaceAll(/`[^\\`]*(?:\\.[^\\`]*)*`/g, '``');

const findFiles = (root: string, predicate: (relativePath: string) => boolean): string[] => {
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
      if (predicate(relativePath)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
};

describe('C5 — runtime transport surface keeps wire primitives off the consumer-callable boundary', () => {
  for (const relativePath of transportPublicSurfaceFiles) {
    it(`${relativePath} does not reference wire primitives in production type signatures`, () => {
      const path = join(runtimeSource, relativePath);
      const source = readFileSync(path, 'utf8');
      const stripped = stripComments(source);
      const violations: string[] = [];
      for (const token of bannedTokens) {
        const pattern = new RegExp(`\\b${token}\\b`);
        if (pattern.test(stripped)) {
          violations.push(`${relativePath}: contains banned token \`${token}\` outside comments`);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe('C4 — runtime consumer-facing surface (client/host/orchestrator) is wire-agnostic', () => {
  const consumerSurfaceFiles = [
    ...findFiles(join(runtimeSource, 'client'), () => true),
    ...findFiles(join(runtimeSource, 'host'), () => true),
  ];

  for (const path of consumerSurfaceFiles) {
    const relativePath = relative(runtimeSource, path);
    it(`${relativePath} does not reference wire primitives in production type signatures`, () => {
      const source = readFileSync(path, 'utf8');
      const stripped = stripComments(source);
      const violations: string[] = [];
      for (const token of bannedTokens) {
        const pattern = new RegExp(`\\b${token}\\b`);
        if (pattern.test(stripped)) {
          violations.push(`${relativePath}: contains banned token \`${token}\` outside comments`);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
