/**
 * Legacy runtime protocol deletion contract.
 *
 * The document protocol is the current worker wire contract. The older
 * preview protocol types and their predecessor command unions must not
 * regain a public or source-level foothold.
 *
 * Asserts that:
 *
 *   1. `RuntimeCommand`, `RuntimeResponse`, `ConfigureMemoryRequest`
 *      are NOT named exports of `@taucad/runtime` (`#index.js`) or
 *      `@taucad/runtime/types`.
 *   2. The old preview protocol module and its type test do not exist.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import * as runtimePublic from '#index.js';
import * as typesPublic from '#types/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('legacy RuntimeCommand/RuntimeResponse/ConfigureMemoryRequest removal (R8)', () => {
  for (const name of ['RuntimeCommand', 'RuntimeResponse', 'ConfigureMemoryRequest'] as const) {
    it(`@taucad/runtime does not value-export ${name}`, () => {
      const surface = runtimePublic as unknown as Record<string, unknown>;
      expect(surface[name]).toBeUndefined();
    });
    it(`@taucad/runtime/types does not value-export ${name}`, () => {
      const surface = typesPublic as unknown as Record<string, unknown>;
      expect(surface[name]).toBeUndefined();
    });
  }

  it.each(['runtime-protocol.types.ts', 'runtime-protocol.test-d.ts'])('the legacy `%s` no longer exists', (name) => {
    expect(existsSync(resolve(packageRoot, 'types', name))).toBe(false);
  });
});
