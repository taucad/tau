import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveProjectRoot } from '#project-root.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** A temporary tree with a `tau.json` at `<root>/nested/project`. */
const nestedProject = async (): Promise<{ root: string; project: string }> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-project-root-'));
  roots.push(root);
  const project = join(root, 'nested', 'project');
  await mkdir(join(project, 'parts', 'gear'), { recursive: true });
  await writeFile(join(project, 'tau.json'), '{}');
  return { root, project };
};

describe('resolveProjectRoot', () => {
  it('should root a model at the nearest folder holding a tau.json', async () => {
    const { root, project } = await nestedProject();

    expect(resolveProjectRoot({ file: join(project, 'parts', 'gear', 'main.ts'), cwd: root })).toEqual({
      root: project,
      source: 'tau.json',
    });
  });

  it("should fall back to the model's own folder outside every project", async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-project-loose-'));
    roots.push(root);

    expect(resolveProjectRoot({ file: 'main.ts', cwd: root })).toEqual({ root, source: "model's folder" });
  });

  it('should let --project win over the tau.json above a model', async () => {
    const { root, project } = await nestedProject();

    expect(resolveProjectRoot({ project: '.', file: join(project, 'main.ts'), cwd: root })).toEqual({
      root,
      source: '--project',
    });
  });

  it('should keep a named folder as the root even with a tau.json below it', async () => {
    const { root } = await nestedProject();

    expect(resolveProjectRoot({ project: root, claudeProjectDir: '/elsewhere', cwd: '/' })).toEqual({
      root,
      source: '--project',
    });
  });

  it('should prefer CLAUDE_PROJECT_DIR to the working directory and never widen it to a tau.json above', async () => {
    const { project } = await nestedProject();
    const parts = join(project, 'parts');

    expect(resolveProjectRoot({ claudeProjectDir: parts, cwd: '/' })).toEqual({
      root: parts,
      source: 'CLAUDE_PROJECT_DIR',
    });
    expect(resolveProjectRoot({ cwd: parts })).toEqual({ root: parts, source: 'working directory' });
  });
});
