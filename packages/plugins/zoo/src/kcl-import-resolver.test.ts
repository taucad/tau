import { describe, it, expect, vi } from 'vitest';
import { discoverKclDependencies } from '#kcl-import-resolver.js';
import type { ParseKclFunction, ReadFileFunction } from '#kcl-import-resolver.js';

import type { Node } from '@taucad/kcl-wasm-lib/bindings/Node';
import type { Program } from '@taucad/kcl-wasm-lib/bindings/Program';

// =============================================================================
// Test Helpers
// =============================================================================

type ImportStatement = {
  type: 'ImportStatement';
  path: { filename: string };
};

function createMockProgram(imports: string[]): { program: Node<Program>; errors: unknown[]; warnings: unknown[] } {
  const body = imports.map(
    (filename): ImportStatement => ({
      type: 'ImportStatement',
      path: { filename },
    }),
  );

  return {
    program: { body } as unknown as Node<Program>,
    errors: [],
    warnings: [],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('discoverKclDependencies', () => {
  it('should return resolved files and exclude unresolvable imports from result', async () => {
    const files: Record<string, string> = {
      'main.kcl': 'import "parts/base.kcl"\nimport "parts/top.kcl"',
      'parts/base.kcl': 'fn base = () => { box([10, 10, 10]) }',
    };

    const readFile: ReadFileFunction = vi.fn(async (path: string) => {
      const content = files[path];
      if (!content) {
        throw Object.assign(new Error(`ENOENT: no such file ${path}`), { code: 'ENOENT' });
      }
      return content;
    });

    const parseKcl: ParseKclFunction = vi.fn(async (code: string) => {
      if (code === files['main.kcl']) {
        return createMockProgram(['parts/base.kcl', 'parts/top.kcl']);
      }
      return createMockProgram([]);
    });

    const result = await discoverKclDependencies('main.kcl', readFile, parseKcl);

    expect(result.resolved).toContain('main.kcl');
    expect(result.resolved).toContain('parts/base.kcl');
    expect(result.resolved).not.toContain('parts/top.kcl');
    expect(result.unresolved).toContain('parts/top.kcl');
  });

  it('should return unresolved paths for missing imports', async () => {
    const files: Record<string, string> = {
      'main.kcl': 'import "lib/utils.kcl"\nimport "lib/helpers.kcl"',
    };

    const readFile: ReadFileFunction = vi.fn(async (path: string) => {
      const content = files[path];
      if (!content) {
        throw Object.assign(new Error(`ENOENT: no such file ${path}`), { code: 'ENOENT' });
      }
      return content;
    });

    const parseKcl: ParseKclFunction = vi.fn(async (code: string) => {
      if (code === files['main.kcl']) {
        return createMockProgram(['lib/utils.kcl', 'lib/helpers.kcl']);
      }
      return createMockProgram([]);
    });

    const result = await discoverKclDependencies('main.kcl', readFile, parseKcl);

    // Currently, missing imports are silently discarded.
    // After the fix, the result should include unresolved paths.
    // For now, this test asserts the NEW expected behavior:
    expect(result).toEqual(
      expect.objectContaining({
        resolved: expect.arrayContaining(['main.kcl']) as unknown,
        unresolved: expect.arrayContaining(['lib/utils.kcl', 'lib/helpers.kcl']) as unknown,
      }),
    );
  });
});
