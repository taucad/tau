import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openrscad } from '@taucad/openrscad';
import { presets } from '@taucad/runtime/presets';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

type ManifestEntry = {
  readonly kernel: string;
  readonly name: string;
  readonly mainFile?: string;
  readonly files: readonly string[];
};

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(rootDirectory, 'src');
const manifest = JSON.parse(readFileSync(join(sourceDirectory, 'manifest.json'), 'utf8')) as ManifestEntry[];

describe('generated example artifacts', () => {
  it('discovers only real entrypoints and excludes generated/cache files', () => {
    expect(manifest.find((entry) => entry.kernel === 'openscad')?.mainFile).toBe('main.scad');
    expect(manifest.find((entry) => entry.kernel === 'occt')?.mainFile).toBe('main.cpp');
    expect(manifest.find((entry) => entry.kernel === 'build123d')?.mainFile).toBe('main.py');
    expect(manifest.find((entry) => entry.name === 'v8-engine-rev2')?.mainFile).toBeUndefined();

    for (const entry of manifest) {
      expect(entry.files.some((path) => path === 'thumbnail.webp')).toBe(false);
      expect(
        entry.files.some((path) => path.split('/').some((part) => part.startsWith('.') || part === '__pycache__')),
      ).toBe(false);
      if (entry.mainFile) {
        expect(entry.files).toContain(entry.mainFile);
      }
    }
  });

  it('has a valid 768×576 WebP for every entry supported by the generator runtime', async () => {
    const preset = presets.all();
    const supportedKernels: ReadonlySet<string> = new Set([
      ...preset.kernels.map((kernel) => kernel.id),
      openrscad().id,
    ]);
    const renderable = manifest.filter(
      (entry) => entry.mainFile && supportedKernels.has(entry.kernel === 'openscad' ? 'openrscad' : entry.kernel),
    );

    expect(renderable).toHaveLength(41);
    await Promise.all(
      renderable.map(async (entry) => {
        const path = join(sourceDirectory, 'kernels', entry.kernel, entry.name, 'thumbnail.webp');
        expect(existsSync(path), `${entry.kernel}/${entry.name}`).toBe(true);
        const bytes = readFileSync(path);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
        const metadata = await sharp(bytes).metadata();
        expect(metadata.width, `${entry.kernel}/${entry.name}`).toBe(768);
        expect(metadata.height, `${entry.kernel}/${entry.name}`).toBe(576);
      }),
    );
  });
});
