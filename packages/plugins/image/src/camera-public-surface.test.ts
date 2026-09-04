import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as camera from '@taucad/image/camera';
import type { NanorasterCameraOptions } from '@taucad/image/camera';

type PackageJson = {
  exports?: Record<string, unknown>;
  publishConfig?: { exports?: Record<string, unknown> };
};

describe('@taucad/image/camera public surface', () => {
  it('exports only the camera adapter contract', () => {
    expect(Object.keys(camera)).toEqual(['toNanorasterCamera']);
    expect(camera.toNanorasterCamera).toBeTypeOf('function');
    expectTypeOf<NanorasterCameraOptions>().not.toBeNever();
  });

  it('maps the development and published subpath to an explicit build entry', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageJson;
    const tsdownConfig = readFileSync(new URL('../tsdown.config.ts', import.meta.url), 'utf8');

    expect(packageJson.exports?.['./camera']).toBe('./src/nanoraster-camera.ts');
    expect(packageJson.publishConfig?.exports?.['./camera']).toEqual({
      types: './dist/nanoraster-camera.d.mts',
      import: './dist/nanoraster-camera.mjs',
      default: './dist/nanoraster-camera.mjs',
    });
    expect(tsdownConfig).toContain("'src/nanoraster-camera.ts'");
  });
});
