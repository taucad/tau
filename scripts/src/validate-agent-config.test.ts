import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateAgentConfig } from '#validate-agent-config.js';

const fixtures: string[] = [];
const write = (root: string, path: string, text: string): void => {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
};
const fixture = (): string => {
  const root = mkdtempSync(resolve(tmpdir(), 'tau-agent-config-'));
  fixtures.push(root);
  execFileSync('git', ['init', '-q', root]);
  write(root, '.gitignore', 'node_modules/\n');
  write(root, 'AGENTS.md', '# Root\n');
  write(root, 'CLAUDE.md', '@AGENTS.md\n');
  write(
    root,
    '.agents/skills/helper/SKILL.md',
    '---\nname: helper\ndescription: Evaluate a bounded input.\n---\n\n# Helper\n',
  );
  mkdirSync(resolve(root, '.claude'));
  symlinkSync('../.agents/skills', resolve(root, '.claude/skills'));
  return root;
};

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('agent substrate validation', () => {
  it('should discover new authored boundaries while excluding templates, dependencies and worktrees', () => {
    const root = fixture();
    write(root, 'packages/new-project/AGENTS.md', '# New project\n\n[Root](../../AGENTS.md)\n');
    write(root, 'packages/new-project/CLAUDE.md', '@AGENTS.md\n');
    for (const directory of [
      'repos/external',
      'node_modules/package',
      '.claude/worktrees/copy',
      '.agents/skills/create-repo/templates',
    ]) {
      write(root, `${directory}/AGENTS.md`, '# Deliberately lacks adapter\n');
    }
    expect(validateAgentConfig(root)).toEqual({ issues: [], boundaries: 2, skills: 1, maximumChainBytes: 46 });
  });

  it('should reject missing imports, duplicate native bodies, broken routes and excessive context', () => {
    const root = fixture();
    write(root, 'nested/AGENTS.md', `# Nested\n\n[Missing](missing.md)\n${'x'.repeat(4100)}\n`);
    write(root, 'CLAUDE.md', '@AGENTS.md\nDuplicated instructions\n');
    const { issues } = validateAgentConfig(root);
    expect(issues).toEqual(
      expect.arrayContaining([
        'CLAUDE.md: expected only @AGENTS.md and a newline',
        'nested/CLAUDE.md: expected only @AGENTS.md and a newline',
        'nested/AGENTS.md: broken local link: missing.md',
      ]),
    );
    expect(issues.some((issue) => issue.includes('4096-byte instruction budget'))).toBe(true);
  });

  it('should discover authored reserved-name paths and reject native-visible raw skill templates', () => {
    const root = fixture();
    write(root, 'packages/build/AGENTS.md', '# Build project\n');
    write(root, 'packages/build/CLAUDE.md', '@AGENTS.md\n');
    write(root, '.agents/skills/repos/SKILL.md', '---\nname: repos\ndescription: Inspect source repos.\n---\n');
    write(root, '.agents/skills/create-repo/templates/release-skill/SKILL.md', '---\nname: unresolved\n---\n');
    const result = validateAgentConfig(root);
    expect(result.boundaries).toBe(2);
    expect(result.skills).toBe(2);
    expect(result.issues).toEqual([
      '.agents/skills/create-repo/templates/release-skill/SKILL.md: raw skill template is discoverable; use a template suffix until rendering',
    ]);
  });

  it('should parse YAML delimiters correctly and keep model invocation enabled by default', () => {
    const root = fixture();
    write(
      root,
      '.agents/skills/helper/SKILL.md',
      '---\nname: helper\ndescription: Evaluate inputs --- with a precise scope.\n---\n\n```yaml\ndisable-model-invocation: true\n```\n',
    );
    expect(validateAgentConfig(root).issues).toEqual([]);
  });

  it('should reject native invocation mismatches and manual-only required helpers', () => {
    const root = fixture();
    write(
      root,
      '.agents/skills/parent/SKILL.md',
      '---\nname: parent\ndescription: Evaluate a composed request.\n---\nInvoke [helper](../helper/SKILL.md).\n',
    );
    write(
      root,
      '.agents/skills/helper/SKILL.md',
      '---\nname: helper\ndescription: Manually evaluate a bounded input.\ndisable-model-invocation: true\n---\n\n## Manual initiation\nThe fixture deliberately requires user initiation.\n',
    );
    expect(validateAgentConfig(root).issues).toEqual(
      expect.arrayContaining([
        '.agents/skills/helper/SKILL.md: Claude and Codex invocation intent differs',
        '.agents/skills/parent/SKILL.md: model-composed skill link targets a manual-only helper: ../helper/SKILL.md',
      ]),
    );
    write(root, '.agents/skills/helper/agents/openai.yaml', 'policy:\n  allow_implicit_invocation: false\n');
    expect(validateAgentConfig(root).issues).toEqual([
      '.agents/skills/parent/SKILL.md: model-composed skill link targets a manual-only helper: ../helper/SKILL.md',
    ]);
  });

  it('should work without optional Brain while rejecting operative legacy writers', () => {
    const root = fixture();
    write(root, 'AGENTS.md', '# Root\n\n[Research](docs/research/optional.md)\n');
    write(
      root,
      '.agents/skills/helper/SKILL.md',
      '---\nname: helper\ndescription: Evaluate inputs.\n---\nWrite .cursor/rules/output.mdc.\n',
    );
    write(root, 'docs/architecture/history.md', '# Historical Cursor migration\n');
    const before = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
    const { issues } = validateAgentConfig(root);
    expect(issues).toEqual([
      '.agents/skills/helper/SKILL.md: operative reference to retired Cursor/Nx agent provisioning',
    ]);
    expect(readFileSync(resolve(root, 'AGENTS.md'), 'utf8')).toBe(before);
  });
});
