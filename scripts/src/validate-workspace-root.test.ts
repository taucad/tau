import { describe, expect, it } from 'vitest';
import { unexpectedWorkspaceRootEntries, workspaceRootInventoryErrors } from '#validate-workspace-root.js';

describe('workspace-root validation', () => {
  it('should allow authored roots and stable machine boundaries while rejecting transient siblings', () => {
    expect(
      unexpectedWorkspaceRootEntries({
        actualEntries: ['.git', '.nx', 'apps', 'node_modules', 'out', 'repos', '.pkgcheck-consumer-a1', 'coverage'],
        trackedPaths: ['apps/ui/package.json', 'package.json'],
      }),
    ).toEqual(['.pkgcheck-consumer-a1', 'coverage']);
  });
});

// Representative tracked paths cover the reviewed public root and nested authored directories.
const approvedPaths = [
  '.agents/skills/create-script/SKILL.md',
  '.claude/settings.json',
  '.github/workflows/ci.yml',
  '.gitignore',
  '.nx/version-plans/.gitkeep',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  'AGENTS.md',
  'NOTICE',
  'apps/ui/package.json',
  'docs/policy/tool-output-location-policy.md',
  'eslint.config.mjs',
  'examples/react-router/package.json',
  'infra/compose.yaml',
  'libs/utils/package.json',
  'license',
  'nx.json',
  'package.json',
  'packages/runtime/package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'readme.md',
  'scripts/project.json',
  'tools/quality/knip.config.ts',
  'tsconfig.json',
];

const approvedEntries = approvedPaths.map((path) => path.split('/')[0] ?? '');

describe('authored workspace-root budget', () => {
  it('should accept the approved 25 roots and documented local output boundaries', () => {
    expect(approvedEntries).toHaveLength(25);
    expect(
      workspaceRootInventoryErrors({
        trackedPaths: [...approvedPaths, 'apps/api/package.json'],
        actualEntries: [...approvedEntries, '.git', 'node_modules', 'out', 'out-tsc', 'repos'],
      }),
    ).toEqual([]);
  });

  it.each([false, true])('should accept consumed version plans with local Nx state present: %s', (hasLocalNxState) => {
    const actualEntries = approvedEntries.filter((entry) => entry !== '.nx');
    if (hasLocalNxState) {
      actualEntries.push('.nx');
    }

    expect(
      workspaceRootInventoryErrors({
        trackedPaths: approvedPaths.filter((path) => !path.startsWith('.nx/')),
        actualEntries,
      }),
    ).toEqual([]);
  });

  it.each(['scratch.json', '.dockerignore', '.nxignore', 'CLAUDE.md', '.codex', '.vscode'])(
    'should reject an unapproved root even when Git tracks it: %s',
    (rootEntry) => {
      expect(
        workspaceRootInventoryErrors({
          trackedPaths: [...approvedPaths, rootEntry],
          actualEntries: [...approvedEntries, rootEntry],
        }),
      ).toEqual([`Unapproved authored root: ${rootEntry}`]);
    },
  );

  it('should reject a same-count substitution of an approved root', () => {
    expect(
      workspaceRootInventoryErrors({
        trackedPaths: approvedPaths.map((path) => (path === 'readme.md' ? 'scratch.json' : path)),
        actualEntries: approvedEntries.map((entry) => (entry === 'readme.md' ? 'scratch.json' : entry)),
      }),
    ).toEqual(['Unapproved authored root: scratch.json', 'Missing approved authored root: readme.md']);
  });

  it('should reject tracked content in a machine-output boundary', () => {
    expect(
      workspaceRootInventoryErrors({
        trackedPaths: [...approvedPaths, 'out/report.json'],
        actualEntries: [...approvedEntries, 'out'],
      }),
    ).toEqual(['Unapproved authored root: out']);
  });

  it('should still reject untracked transient roots after the authored inventory passes', () => {
    expect(
      workspaceRootInventoryErrors({
        trackedPaths: approvedPaths,
        actualEntries: [...approvedEntries, 'coverage', '.pkgcheck-consumer-a1'],
      }),
    ).toEqual(['Unexpected local root: .pkgcheck-consumer-a1', 'Unexpected local root: coverage']);
  });
});
