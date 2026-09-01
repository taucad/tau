import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeClient } from '@taucad/runtime/node';
import { projectManifestSchema } from '@taucad/types';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { exampleKernelIds, exampleRuntime } from '#scripts/runtime.js';

type ManifestEntry = {
  readonly kernel: string;
  readonly name: string;
  readonly mainFile?: string;
  readonly files: readonly string[];
};

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(rootDirectory, 'src');
const manifest = JSON.parse(readFileSync(join(sourceDirectory, 'manifest.json'), 'utf8')) as ManifestEntry[];
const builtinSource = readFileSync(join(sourceDirectory, 'builtin.ts'), 'utf8');

describe('generated example artifacts', () => {
  it('strictly validates unique manifest-backed builtins and excludes runtime caches', () => {
    const ids = new Set<string>();
    const locators = new Set<string>();
    let count = 0;
    for (const entry of manifest) {
      const path = join(sourceDirectory, 'kernels', entry.kernel, entry.name, 'tau.json');
      if (!existsSync(path)) {
        continue;
      }
      const parsed = projectManifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
      const locator = `${entry.kernel}.${entry.name}`;
      expect(ids.has(parsed.id)).toBe(false);
      expect(locators.has(locator)).toBe(false);
      expect(existsSync(join(sourceDirectory, 'kernels', entry.kernel, entry.name, parsed.assets.main.entryPath))).toBe(
        true,
      );
      if (parsed.assets.main.thumbnail) {
        expect(
          existsSync(join(sourceDirectory, 'kernels', entry.kernel, entry.name, parsed.assets.main.thumbnail)),
        ).toBe(true);
      }
      ids.add(parsed.id);
      locators.add(locator);
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(34);
    expect(builtinSource).toContain('replicad.birdhouse');
    expect(builtinSource).not.toContain('/.tau/cache/');
  });

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
    const supportedKernels: ReadonlySet<string> = exampleKernelIds;
    const renderable = manifest.filter(
      (entry) => entry.mainFile && supportedKernels.has(entry.kernel === 'openscad' ? 'openrscad' : entry.kernel),
    );

    // Not an exact count — that only drifts as examples come and go. This
    // guards the one failure the per-entry assertions can't catch: an empty
    // set passing vacuously.
    expect(renderable.length).toBeGreaterThan(0);
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

  // OCCT's shell/offset results depend on accumulated WASM heap state, so the
  // generator gives every fixture a fresh client; this pins the property that
  // makes those checked-in bytes meaningful — a susceptible (shell + fillet)
  // fixture is bit-reproducible on a clean instance. If this starts failing,
  // determinism broke below the generator and check-thumbnails will flake.
  // See docs/research/tau-examples-thumbnail-nondeterminism.md.
  it('exports a shell+fillet fixture byte-identically on fresh kernel instances', { timeout: 120_000 }, async () => {
    const exportOnFreshClient = async (): Promise<string> => {
      const client = await createNodeClient({ runtime: exampleRuntime, projectPath: join(sourceDirectory, 'kernels') });
      try {
        const result = await client.export('glb', {
          source: { path: 'replicad/vase/main.ts' },
          content: { includeEdges: true },
        });
        if (!result.success) {
          throw new Error(result.issues.map((issue) => issue.message).join('; '));
        }
        return createHash('sha256').update(result.data[0]!.bytes).digest('hex');
      } finally {
        client.terminate();
      }
    };

    expect(await exportOnFreshClient()).toBe(await exportOnFreshClient());
  });
});
