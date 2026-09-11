import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const cliBinPath = resolve(repoRoot, 'packages/cli/dist/bin/tau.mjs');
const hostRuntimeChildPath = resolve(repoRoot, 'packages/cli/dist/bin/host-runtime-child.mjs');
const computeStoreWorkerPath = resolve(repoRoot, 'packages/cli/dist/bin/compute-store-worker.mjs');
const birdhouse = resolve(repoRoot, 'libs/tau-examples/src/kernels/replicad/birdhouse/main.ts');
const openrscadKitchenSink = resolve(repoRoot, 'libs/tau-examples/src/kernels/openscad/kitchen-sink/main.scad');
const picogkSphere = resolve(repoRoot, 'libs/tau-examples/src/kernels/picogk/parameterized-sphere/main.cs');
const picogkResourceRoot = resolve(repoRoot, 'apps/desktop/resources/picogk');
const picogkResourceRootEnvironment = 'TAU_PICOGK_RESOURCE_ROOT';
const picogkManifest = resolve(picogkResourceRoot, `${process.platform}-${process.arch}`, 'tau-runtime-manifest.json');

const gltfMagicBytes = 0x46_54_6c_67;
const zipLocalFileHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

type MeshSummary = {
  primitives: number;
  triangles: number;
  modes: number[];
  bounds: { min: number[]; max: number[] };
};

/** Triangle, primitive-mode and world-bounds summary of a GLB on disk. */
const readMeshSummary = async (glbPath: string): Promise<MeshSummary> => {
  const document = await new NodeIO().read(glbPath);
  const scene = document.getRoot().getDefaultScene();
  if (!scene) {
    throw new Error(`Geometry at ${glbPath} has no scene.`);
  }
  const primitives = document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
  let triangles = 0;
  for (const primitive of primitives) {
    triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')!.getCount()) / 3;
  }
  const bounds = getBounds(scene);
  return {
    primitives: primitives.length,
    triangles,
    modes: primitives.map((primitive) => primitive.getMode()),
    bounds: { min: [...bounds.min], max: [...bounds.max] },
  };
};

/**
 * Name of a USDZ archive's first member.
 *
 * USDZ is an uncompressed ZIP whose first entry must be the root `.usdc`/
 * `.usda` layer, so reading the one local file header proves the container is
 * a USD package rather than an arbitrary archive that happens to start `PK`.
 */
const zipFirstEntryName = (bytes: Uint8Array<ArrayBuffer>): string => {
  const nameLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(26, true);
  return new TextDecoder().decode(bytes.subarray(30, 30 + nameLength));
};

const runCli = async (
  args: readonly string[],
  environment: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  /*
   * CWD is the repo root so Node can resolve `@oxc-node/core` from the
   * workspace's `node_modules`. The CLI accepts absolute paths for `--file`
   * and `--output`, so the working directory has no semantic effect on the
   * export — it only governs module resolution for the `--import` flag.
   */
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', '@oxc-node/core/register', cliBinPath, ...args],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
      { cwd: repoRoot, env: { ...process.env, ...environment, NX_PREFER_NODE_STRIP_TYPES: 'true' } },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const errno = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: errno.stdout ?? '',
      stderr: errno.stderr ?? '',
      exitCode: typeof errno.code === 'number' ? errno.code : 1,
    };
  }
};

describe('tau CLI dist (real binary)', () => {
  let workspace: string;

  beforeAll(async () => {
    await execFileAsync('pnpm', ['nx', 'build', 'cli'], { cwd: repoRoot });
    workspace = await mkdtemp(join(tmpdir(), 'tau-cli-dist-'));
  }, 180_000);

  afterAll(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('should ship a hashbang executable at dist/bin/tau.mjs', async () => {
    const head = await readFile(cliBinPath, 'utf8');

    expect(head.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('should report the version declared in its own package.json for --version', async () => {
    const manifest = JSON.parse(await readFile(resolve(repoRoot, 'packages/cli/package.json'), 'utf8')) as {
      version: string;
    };

    const result = await runCli(['--version']);

    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout.trim()).toBe(manifest.version);
  }, 60_000);

  it('should ship the serve command and its CLI-owned runtime child', async () => {
    const result = await runCli(['serve', '--help']);
    const childStat = await stat(hostRuntimeChildPath);
    const workerStat = await stat(computeStoreWorkerPath);

    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('experimental Tau Host remote-compute daemon');
    expect(childStat.isFile()).toBe(true);
    expect(workerStat.isFile()).toBe(true);
  });

  it('should require explicit trust before starting the Tau Host daemon', async () => {
    const result = await runCli(['serve']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('requires --trust-projects');
  });

  it('should exit 0 and emit a valid glTF 2.0 binary when exporting the birdhouse fixture to GLB', async () => {
    const outputPath = join(workspace, 'birdhouse-default.glb');

    const result = await runCli(['export', birdhouse, '--ext=glb', `--output=${outputPath}`]);

    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);

    const bytes = await readFile(outputPath);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(gltfMagicBytes);
  }, 120_000);

  it('should export OpenRSCAD source through the built-in plugin', async () => {
    const outputPath = join(workspace, 'openrscad.glb');

    const result = await runCli(['export', openrscadKitchenSink, '--ext=glb', `--output=${outputPath}`]);

    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
    const bytes = await readFile(outputPath);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(gltfMagicBytes);
  }, 120_000);

  it('should export OpenSCAD source to USDZ through the native engine addon', async () => {
    const usdzPath = join(workspace, 'openrscad-kitchen-sink.usdz');

    /*
     * `CONSOLA_LEVEL` restores the CLI's normal verbosity in the child. Vitest
     * exports `VITEST` into this process, `std-env` reads that as test mode in
     * anything that inherits the environment, and consola drops to the warn
     * level there — so every runtime log the CLI mirrors is invisible to a
     * suite that does not say otherwise.
     */
    const result = await runCli(['export', openrscadKitchenSink, '--ext=usdz', `--output=${usdzPath}`], {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
      CONSOLA_LEVEL: '3',
    });

    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
    /*
     * The kernel logs the engine payload its export map bound, once per kernel
     * context, and the CLI mirrors runtime logs to the console. A host that
     * silently fell back to the WebAssembly build still exports, so without
     * this the suite would certify the fallback and call it the addon.
     */
    expect(`${result.stdout}${result.stderr}`).toContain('OpenRSCAD engine backend: native');

    const bytes = await readFile(usdzPath);
    expect(bytes.subarray(0, 4)).toEqual(zipLocalFileHeader);
    /* `readFile` hands back `Buffer<ArrayBufferLike>`; the reader's own view is `ArrayBuffer`-backed by construction. */
    expect(zipFirstEntryName(Uint8Array.from(bytes))).toMatch(/\.usd[ac]?$/u);

    const roundtripPath = join(workspace, 'openrscad-kitchen-sink-usdz.glb');
    const roundtrip = await runCli(['export', usdzPath, '--ext=glb', `--output=${roundtripPath}`]);
    expect(roundtrip.exitCode, `roundtrip stderr: ${roundtrip.stderr}`).toBe(0);

    const summary = await readMeshSummary(roundtripPath);
    expect(summary.primitives).toBeGreaterThan(0);
    expect(summary.modes.every((mode) => mode === 4)).toBe(true);
    expect(summary.triangles).toBeGreaterThan(1000);
    /*
     * World units are meters and y-up: the fixture is 50 mm along OpenSCAD x
     * and 50 mm tall along OpenSCAD z, which the export convention maps to
     * glTF x and y. Surviving the USD round trip is what makes this a geometry
     * check rather than a byte-count check.
     */
    expect(summary.bounds.min[0]).toBeCloseTo(-0.025, 4);
    expect(summary.bounds.max[0]).toBeCloseTo(0.025, 4);
    expect(summary.bounds.min[1]).toBeCloseTo(0, 4);
    expect(summary.bounds.max[1]).toBeCloseTo(0.05, 4);
  }, 240_000);

  describe.runIf(existsSync(picogkManifest))('PicoGK native resources', () => {
    it.each(['3mf', 'usdz'])(
      'exports a .cs entry point to %s through the built CLI',
      async (extension) => {
        const outputPath = join(workspace, `picogk-sphere.${extension}`);

        const result = await runCli(['export', picogkSphere, `--ext=${extension}`, `--output=${outputPath}`], {
          [picogkResourceRootEnvironment]: picogkResourceRoot,
        });

        expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
        const bytes = await readFile(outputPath);
        expect(bytes.byteLength).toBeGreaterThan(0);
        expect(bytes.subarray(0, 4)).toEqual(zipLocalFileHeader);
        const roundtripPath = join(workspace, `picogk-sphere-${extension}-roundtrip.glb`);
        const roundtrip = await runCli(['export', outputPath, '--ext=glb', `--output=${roundtripPath}`]);
        expect(roundtrip.exitCode, `roundtrip stderr: ${roundtrip.stderr}`).toBe(0);
        const summary = await readMeshSummary(roundtripPath);
        expect(summary.primitives).toBeGreaterThan(0);
        expect(summary.modes.every((mode) => mode === 4)).toBe(true);
        expect(summary.triangles).toBeGreaterThan(100);
        // World units are meters: radius 20 mm, allowing one 1 mm voxel per surface.
        for (let axis = 0; axis < 3; axis++) {
          expect(Math.abs(summary.bounds.min[axis]! + 0.02)).toBeLessThanOrEqual(0.001);
          expect(Math.abs(summary.bounds.max[axis]! - 0.02)).toBeLessThanOrEqual(0.001);
        }
      },
      240_000,
    );
  });

  it('should exit non-zero with an unrecognized-extension error when --ext is invalid', async () => {
    const result = await runCli([
      'export',
      birdhouse,
      '--ext=not-a-format',
      `--output=${join(workspace, 'invalid.bin')}`,
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Unrecognized target extension: "not-a-format"/);
    expect(result.stderr).not.toMatch(/Supported:/);
  }, 60_000);

  it('should produce a different output size when parameters override the default geometry', async () => {
    const defaultOut = join(workspace, 'birdhouse-default-params.glb');
    const tweakedOut = join(workspace, 'birdhouse-tweaked.glb');

    const defaultResult = await runCli(['export', birdhouse, '--ext=glb', `--output=${defaultOut}`]);
    expect(defaultResult.exitCode, `stderr: ${defaultResult.stderr}`).toBe(0);

    const tweakedResult = await runCli([
      'export',
      birdhouse,
      '--ext=glb',
      `--output=${tweakedOut}`,
      '--params={"width":250,"height":180}',
    ]);
    expect(tweakedResult.exitCode, `stderr: ${tweakedResult.stderr}`).toBe(0);

    const [defaultStat, tweakedStat] = await Promise.all([stat(defaultOut), stat(tweakedOut)]);
    expect(tweakedStat.size).not.toBe(defaultStat.size);
  }, 240_000);
});
