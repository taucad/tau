import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  formatTsgoRuntimeReferenceDiagnostics,
  validateTsgoRuntimeReferences,
} from '#validate-tsgo-runtime-references.js';

let workspaceRoot = '';

const writeFixtureFile = (relativePath: string, content: string): void => {
  const absolutePath = join(workspaceRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
};

const writeProject = (projectRoot: string): void => {
  writeFixtureFile(
    join(projectRoot, 'project.json'),
    JSON.stringify({
      name: projectRoot.split('/').at(-1),
      projectType: 'library',
    }),
  );
};

describe('validateTsgoRuntimeReferences', () => {
  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'tau-tsgo-runtime-refs-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    workspaceRoot = '';
  });

  it('should allow local runtime references inside the same project root', () => {
    writeProject('packages/local');
    writeFixtureFile(
      'packages/local/tsconfig.lib.json',
      JSON.stringify({
        extends: './tsconfig.json',
        references: [{ path: './tsconfig.spec.json' }],
      }),
    );
    writeFixtureFile('packages/local/tsconfig.spec.json', JSON.stringify({ extends: './tsconfig.json' }));

    const diagnostics = validateTsgoRuntimeReferences({ workspaceRoot });

    expect(diagnostics).toEqual([]);
  });

  it('should reject cross-project references from runtime configs', () => {
    writeProject('packages/source');
    writeProject('packages/dependency');
    writeFixtureFile(
      'packages/source/tsconfig.lib.json',
      JSON.stringify({
        extends: './tsconfig.json',
        references: [{ path: '../dependency/tsconfig.lib.json' }],
      }),
    );
    writeFixtureFile('packages/dependency/tsconfig.lib.json', JSON.stringify({ extends: './tsconfig.json' }));

    const diagnostics = validateTsgoRuntimeReferences({ workspaceRoot });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      kind: 'forbidden-reference',
      configPath: 'packages/source/tsconfig.lib.json',
      projectRoot: 'packages/source',
      referencePath: '../dependency/tsconfig.lib.json',
      resolvedPath: 'packages/dependency/tsconfig.lib.json',
    });
    expect(diagnostics[0]?.message).toContain('source exports');
    expect(diagnostics[0]?.message).toContain('out-tsc declarations');
    expect(diagnostics[0]?.message).toContain('docs/research/tsgo-nx-project-reference-guardrails.md');
  });

  it('should reject cross-project references from project tsconfig files used by framework typecheck targets', () => {
    writeProject('examples/react-router');
    writeProject('packages/runtime');
    writeFixtureFile(
      'examples/react-router/tsconfig.json',
      JSON.stringify({
        extends: '../../tsconfig.base.json',
        references: [{ path: '../../packages/runtime' }],
      }),
    );
    writeFixtureFile(
      'packages/runtime/tsconfig.json',
      JSON.stringify({
        references: [{ path: './tsconfig.lib.json' }],
      }),
    );

    const diagnostics = validateTsgoRuntimeReferences({ workspaceRoot });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      kind: 'forbidden-reference',
      configPath: 'examples/react-router/tsconfig.json',
      projectRoot: 'examples/react-router',
      referencePath: '../../packages/runtime',
      resolvedPath: 'packages/runtime',
    });
  });

  it('should ignore root solution references and non-runtime build configs', () => {
    writeProject('packages/source');
    writeProject('packages/dependency');
    writeFixtureFile(
      'tsconfig.json',
      JSON.stringify({
        references: [{ path: './packages/source' }, { path: './packages/dependency' }],
      }),
    );
    writeFixtureFile(
      'packages/source/tsconfig.build.json',
      JSON.stringify({
        extends: './tsconfig.lib.json',
        references: [{ path: '../dependency/tsconfig.lib.json' }],
      }),
    );
    writeFixtureFile('packages/source/tsconfig.lib.json', JSON.stringify({ extends: './tsconfig.json' }));
    writeFixtureFile('packages/dependency/tsconfig.lib.json', JSON.stringify({ extends: './tsconfig.json' }));

    const diagnostics = validateTsgoRuntimeReferences({ workspaceRoot });

    expect(diagnostics).toEqual([]);
  });

  it('should parse JSONC comments before checking references', () => {
    writeProject('packages/commented');
    writeFixtureFile(
      'packages/commented/tsconfig.lib.json',
      [
        '{',
        '  // Local references are allowed because they do not consume workspace out-tsc declarations.',
        '  "references": [{ "path": "./tsconfig.spec.json" }]',
        '}',
      ].join('\n'),
    );
    writeFixtureFile('packages/commented/tsconfig.spec.json', JSON.stringify({ extends: './tsconfig.json' }));

    const diagnostics = validateTsgoRuntimeReferences({ workspaceRoot });

    expect(diagnostics).toEqual([]);
  });

  it('should format diagnostics with the offending config path and reference', () => {
    writeProject('packages/source');
    writeProject('packages/dependency');
    writeFixtureFile(
      'packages/source/tsconfig.app.json',
      JSON.stringify({
        references: [{ path: '../dependency/tsconfig.lib.json' }],
      }),
    );
    writeFixtureFile('packages/dependency/tsconfig.lib.json', JSON.stringify({}));

    const diagnostics = validateTsgoRuntimeReferences({ workspaceRoot });
    const formatted = formatTsgoRuntimeReferenceDiagnostics(diagnostics);

    expect(formatted).toContain('packages/source/tsconfig.app.json');
    expect(formatted).toContain('../dependency/tsconfig.lib.json');
    expect(formatted).toContain('forbidden cross-project reference');
  });
});
