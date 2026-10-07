import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectManifestSchema } from '@taucad/types';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  createExampleGeoSpecRuntimeClient,
  createExampleRuntimeClient,
  exampleKernelIds,
  exampleRuntime,
} from '#scripts/runtime.js';

type ManifestEntry = {
  readonly kind: 'model' | 'test-fixture' | 'spec-fixture' | 'reference';
  readonly geometry: '2d' | '3d';
  readonly kernel: string;
  readonly name: string;
  readonly mainFile?: string;
  readonly files: readonly string[];
  readonly featured?: true;
};

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(rootDirectory, 'src');
const manifest = JSON.parse(readFileSync(join(sourceDirectory, 'manifest.json'), 'utf8')) as ManifestEntry[];
const builtinSource = readFileSync(join(sourceDirectory, 'builtin.ts'), 'utf8');
const testFixtureSource = readFileSync(join(sourceDirectory, 'test-fixtures.ts'), 'utf8');

describe('generated example artifacts', () => {
  it('enables one unit-inference middleware after parameter declarations resolve', () => {
    expect(exampleRuntime.middleware.map(({ id }) => id)).toEqual([
      'parameterFileResolver',
      'parameterUnits',
      'gltfEdgeDetection',
    ]);
  });

  it('strictly validates unique manifest-backed builtins and excludes runtime caches', () => {
    const ids = new Set<string>();
    const locators = new Set<string>();
    let count = 0;
    for (const entry of manifest) {
      if (entry.kind !== 'model') {
        continue;
      }
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
    expect(count).toBe(manifest.filter((entry) => entry.kind === 'model' && entry.files.includes('tau.json')).length);
    expect(builtinSource).toContain('replicad.birdhouse');
    for (const fixture of manifest.filter((entry) => entry.kind === 'test-fixture')) {
      const locator = `${fixture.kernel}.${fixture.name}`;
      expect(builtinSource).not.toContain(locator);
      expect(testFixtureSource).toContain(locator);
    }
    expect(builtinSource).not.toContain('/.tau/cache/');
    expect(testFixtureSource).not.toContain('/.tau/cache/');
  });

  it('discovers only real entrypoints and excludes generated/cache files', () => {
    expect(manifest.find((entry) => entry.kernel === 'openscad')?.mainFile).toBe('main.scad');
    expect(manifest.find((entry) => entry.kernel === 'occt')?.mainFile).toBe('main.cpp');
    expect(manifest.find((entry) => entry.kernel === 'build123d')?.mainFile).toBe('main.py');
    expect(manifest.find((entry) => entry.kernel === 'picogk')?.mainFile).toBe('main.cs');
    expect(manifest.find((entry) => entry.name === 'v8-engine-rev2')?.mainFile).toBeUndefined();

    // PicoVoxel adds three test fixtures, the helix-heat-x heavy reference and six implicit references (D36).
    expect(manifest.filter((entry) => entry.kind === 'test-fixture')).toHaveLength(12);
    expect(manifest.filter((entry) => entry.kind === 'spec-fixture')).toHaveLength(1);
    expect(manifest.filter((entry) => entry.kind === 'reference')).toHaveLength(10);

    for (const entry of manifest) {
      expect(entry.files.some((path) => path === 'thumbnail.webp' || path === 'thumbnail-featured.webp')).toBe(false);
      expect(
        entry.files.some((path) => path.split('/').some((part) => part.startsWith('.') || part === '__pycache__')),
      ).toBe(false);
      if (entry.mainFile) {
        expect(entry.files).toContain(entry.mainFile);
      }
    }
  });

  it('has a valid 1536×1152 WebP for every entry supported by the generator runtime', async () => {
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
        const files = entry.featured ? ['thumbnail.webp', 'thumbnail-featured.webp'] : ['thumbnail.webp'];
        for (const file of files) {
          const label = `${entry.kernel}/${entry.name}/${file}`;
          const path = join(sourceDirectory, 'kernels', entry.kernel, entry.name, file);
          expect(existsSync(path), label).toBe(true);
          const bytes = readFileSync(path);
          expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
          expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
          // oxlint-disable-next-line eslint/no-await-in-loop -- At most two files per entry.
          const metadata = await sharp(bytes).metadata();
          expect(metadata.width, label).toBe(1536);
          expect(metadata.height, label).toBe(1152);
        }
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
      const client = await createExampleRuntimeClient(join(sourceDirectory, 'kernels'));
      const document = client.open({
        source: { path: 'replicad/vase/main.ts' },
        watch: false,
      });
      try {
        const result = await document.export('glb', {
          content: { includeEdges: true },
        });
        if (!result.success) {
          throw new Error(result.issues.map((issue) => issue.message).join('; '));
        }
        return createHash('sha256').update(result.files[0].bytes).digest('hex');
      } finally {
        document.close();
        await client.shutdown();
      }
    };

    expect(await exportOnFreshClient()).toBe(await exportOnFreshClient());
  });

  it('pins GeoSpec exports to one document and rejects a closed lazy document', { timeout: 120_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-example-geospec-'));
    const sourceRoot = join(root, 'src', 'model');
    const sourcePath = join(sourceRoot, 'main.ts');
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(
      sourcePath,
      "import { makeBaseBox } from 'replicad'; export default () => makeBaseBox(10, 10, 10);",
      'utf8',
    );
    const runtime = await createExampleGeoSpecRuntimeClient(root);
    const document = runtime.open({ source: { path: 'model/main.ts' } });
    try {
      const first = await document.export('glb');
      expect(first.success).toBe(true);
      if (!first.success) {
        throw new Error('Expected the first GeoSpec model export');
      }
      await writeFile(
        sourcePath,
        "import { makeBaseBox } from 'replicad'; export default () => makeBaseBox(20, 20, 20);",
        'utf8',
      );
      const second = await document.export('glb');
      expect(second.success, JSON.stringify(second.issues)).toBe(true);
      if (!second.success) {
        throw new Error('Expected the pinned GeoSpec model export');
      }
      expect(createHash('sha256').update(second.files[0].bytes).digest('hex')).toBe(
        createHash('sha256').update(first.files[0].bytes).digest('hex'),
      );
      document.close();
      await expect(document.export('glb')).rejects.toThrow('closed');

      const lazyRuntime = await createExampleGeoSpecRuntimeClient(root);
      const lazyDocument = lazyRuntime.open({ source: { path: 'model/main.ts' } });
      const pending = lazyDocument.export('glb');
      lazyDocument.close();
      await expect(pending).rejects.toThrow('closed');
      lazyRuntime.terminate();
    } finally {
      document.close();
      runtime.terminate();
      await rm(root, { recursive: true, force: true });
    }
  });
});
