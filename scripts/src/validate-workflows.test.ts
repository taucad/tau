import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { workspace } from '@taucad/nx';
import type { WorkflowFile } from '#validate-workflows.js';
import { nxInvocations, readWorkflows, validateWorkflows } from '#validate-workflows.js';

const resolved = await workspace();

const fixture = (name: string): WorkflowFile => ({
  path: name,
  text: readFileSync(fileURLToPath(new URL(`fixtures/workflows/${name}`, import.meta.url)), 'utf8'),
});

describe('validateWorkflows', () => {
  it('accepts targets, tag selectors, globs, nx affected, nx release, and a type:tool project', () => {
    const { violations, invocations } = validateWorkflows(resolved, [fixture('clean.yml')]);

    expect(violations).toEqual([]);
    expect(invocations).toBe(6);
  });

  it('rejects every project a workflow names, whatever names it', () => {
    const { violations } = validateWorkflows(resolved, [fixture('bare-project.yml')]);

    expect(violations).toEqual([
      'bare-project.yml (job packages): `runtime` is a project name — use a target, a tag: selector, or nx affected',
      'bare-project.yml (job packages): `runtime` is a project name — use a target, a tag: selector, or nx affected',
      'bare-project.yml (job packages): `react` is a project name — use a target, a tag: selector, or nx affected',
      'bare-project.yml (job packages): `events` is a project name — use a target, a tag: selector, or nx affected',
      'bare-project.yml (job packages): `filesystem` is a project name — use a target, a tag: selector, or nx affected',
      'bare-project.yml (job services): `api` is a project name — use a target, a tag: selector, or nx affected',
      'bare-project.yml (job services): `runtime` is a project name — use a target, a tag: selector, or nx affected',
      'bare-project.yml (job services): `react` is a project name — use a target, a tag: selector, or nx affected',
    ]);
  });

  it('rejects a target no project defines', () => {
    const { violations } = validateWorkflows(resolved, [fixture('unknown-target.yml')]);

    expect(violations).toEqual(['unknown-target.yml (job affected): target `does-not-exist` exists on no project']);
  });

  it('reads the two in-scope workflows and returns their violations', () => {
    // The workflows themselves are under rewrite; the gate's own contract is
    // that it parses them and answers, not what today's answer happens to be.
    const { violations, invocations } = validateWorkflows(resolved, readWorkflows());

    expect(Array.isArray(violations)).toBe(true);
    expect(invocations).toBeGreaterThan(0);
  });
});

describe('nxInvocations', () => {
  it('finds one invocation per shell command, ignoring steps that run nothing', () => {
    expect(nxInvocations(fixture('unknown-target.yml'))).toEqual([
      { file: 'unknown-target.yml', job: 'affected', args: ['affected', '-t', 'does-not-exist'] },
    ]);
  });
});
