import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupGeoSpecVitestProject } from '#vitest/node/index.js';

// The non-Tau exporter fixture `geospec run` runs end to end: its config declares a command exporter for `.box`.
const project = join(import.meta.dirname, '../../../host-tests/installed-cli/box-project');
const geo = await setupGeoSpecVitestProject({ projectPath: project });

describe('setupGeoSpecVitestProject', () => {
  it("should read the project's config and create this process's engine", async () => {
    expect(geo.configPath).toBe(await realpath(join(project, 'geospec.config.mjs')));
    expect(['napi', 'wasm']).toContain(geo.binding);
  });

  it("should pass a true claim on a model the config's exporter loads", async () => {
    const box = await geo.loadModel({ file: 'part.box', format: 'step', parameters: { size: 20 } });

    await expect(box).toHaveBoundingBox({ size: { x: 20, y: 20, z: 20 }, tolerance: 1e-6 });
  }, 60_000);

  it('should fail a false claim', async () => {
    const box = await geo.loadModel({ file: 'part.box', format: 'step' });

    await expect(expect(box).toHaveBoundingBox({ size: { x: 12, y: 12, z: 12 }, tolerance: 1e-6 })).rejects.toThrow();
  }, 60_000);

  it('should refuse a format the exporter does not declare', async () => {
    await expect(geo.loadModel({ file: 'part.box', format: 'glb' })).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_EXPORTER_UNSUPPORTED' })],
    });
  });
});
