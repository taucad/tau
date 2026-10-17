import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findProjectRoot } from '#project-root.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('findProjectRoot', () => {
  it('should root a model at the nearest folder holding a tau.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-check-root-'));
    roots.push(root);
    await mkdir(join(root, 'parts', 'gear'), { recursive: true });
    await writeFile(join(root, 'tau.json'), '{}');

    expect(findProjectRoot(join(root, 'parts', 'gear', 'main.ts'))).toBe(root);
  });

  it("should fall back to the model's own folder outside every project", async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-check-loose-'));
    roots.push(root);

    expect(findProjectRoot(join(root, 'main.ts'))).toBe(root);
  });
});
