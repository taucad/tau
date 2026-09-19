import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateAgentConfig } from '#validate-agent-config.js';

const fixtures: string[] = [];
const fixture = (): string => {
  const root = mkdtempSync(resolve(tmpdir(), 'tau-relocatable-'));
  fixtures.push(root);
  execFileSync('git', ['init', '-q', root]);
  return root;
};
const write = (root: string, path: string, text: string): void => {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
};
const stage = (root: string): void => {
  execFileSync('git', ['add', '-A'], { cwd: root });
};
const privateDocumentationIssues = (root: string): string[] =>
  validateAgentConfig(root).issues.filter((issue) => issue.includes('mode-120000'));

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('private documentation symlinks', () => {
  it('should accept tracked symlinks into the optional Brain checkout', () => {
    const root = fixture();
    mkdirSync(resolve(root, 'docs'), { recursive: true });
    for (const name of ['handbooks', 'incidents', 'reference', 'research']) {
      symlinkSync(`../repos/tau-brain/${name}`, resolve(root, `docs/${name}`));
    }
    stage(root);
    expect(privateDocumentationIssues(root)).toEqual([]);
  });

  it('should reject a real directory that publishes private documentation', () => {
    const root = fixture();
    write(root, 'docs/handbooks/cloud/index.md', '# Cloud\n');
    stage(root);
    expect(privateDocumentationIssues(root)).toEqual([
      'docs/handbooks/cloud/index.md: private documentation must stay a mode-120000 symlink into repos/tau-brain',
    ]);
  });

  it('should reject a real file where the symlink belongs', () => {
    const root = fixture();
    write(root, 'docs/incidents', '# Incidents\n');
    stage(root);
    expect(privateDocumentationIssues(root)).toEqual([
      'docs/incidents: private documentation must stay a mode-120000 symlink into repos/tau-brain',
    ]);
  });
});
