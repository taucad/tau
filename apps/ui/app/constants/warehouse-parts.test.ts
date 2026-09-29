import { describe, expect, it } from 'vitest';
import { warehouseParts } from '@taucad/warehouse/builtin';
import { warehouseProjects } from '#constants/warehouse-parts.js';
import { loadBuiltinProjectFiles } from '#constants/project-examples.js';
import { findBuiltinProject } from '#lib/builtin-projects.js';

describe('warehouse projects', () => {
  it('should expose every catalog part without requiring a thumbnail', () => {
    expect(warehouseProjects.map(({ locator }) => locator)).toEqual(warehouseParts.map(({ locator }) => locator));
    expect(new Set(warehouseProjects.map(({ id }) => id)).size).toBe(warehouseParts.length);
  });

  it('should load the complete, byte-exact source assets used by preview and Remix', async () => {
    const project = warehouseProjects[0];
    if (!project) {
      throw new Error('Expected a warehouse part');
    }
    const builtin = findBuiltinProject(project.locator);
    expect(builtin?.manifest.assets.main.entryPath).toBe(project.assets.main.entryPath);
    const files = await loadBuiltinProjectFiles({ project });
    expect(Object.keys(files)).toEqual(project.fileAssets.map(({ path }) => path));
    expect(Object.keys(files)).toContain(project.assets.main.entryPath);
    expect(JSON.parse(new TextDecoder().decode(files['tau.json']?.content))).toEqual(builtin?.manifest);
    await Promise.all(
      project.fileAssets.map(async (asset) => {
        expect(files[asset.path]?.content).toEqual(await asset.load());
      }),
    );
  });
});
