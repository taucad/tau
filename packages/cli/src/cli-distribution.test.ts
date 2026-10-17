import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Worker as NodeWorker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';
import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { validateGlbData } from '@taucad/runtime-testing';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import type { RuntimeWorkerData } from '#runtime.worker.js';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const cliBinPath = resolve(repoRoot, 'packages/cli/dist/bin/tau.mjs');
const hostRuntimeChildPath = resolve(repoRoot, 'packages/cli/dist/bin/host-runtime-child.mjs');
const computeStoreWorkerPath = resolve(repoRoot, 'packages/cli/dist/bin/compute-store-worker.mjs');
const runtimeWorkerPath = resolve(repoRoot, 'packages/cli/dist/bin/runtime-worker.mjs');
const birdhouse = resolve(repoRoot, 'libs/tau-examples/src/kernels/replicad/birdhouse/main.ts');
const openrscadKitchenSink = resolve(repoRoot, 'libs/tau-examples/src/kernels/openscad/kitchen-sink/main.scad');
const picovoxelHelloWorld = resolve(repoRoot, 'libs/tau-examples/src/kernels/picovoxel/hello-world/main.ts');
const picogkSphere = resolve(repoRoot, 'libs/tau-examples/src/kernels/picogk/parameterized-sphere/main.cs');
// `picogk:prepare-layer` stages Microsoft's runtime archive and the locally built layer here.
const picogkSeed = resolve(repoRoot, 'out/picogk-layer/seed');
/*
 * The engine is built for darwin-arm64 only (D13), and `tau prepare picogk` can seal a closure only once a release run
 * has pinned a published layer in place of the empty digest.
 */
/* The native-darwin job opts in (D30): a darwin-arm64 host that may download the pinned PicoGK closure. */
const nativeDarwin =
  process.env['TAU_NATIVE_DARWIN'] === '1' && process.platform === 'darwin' && process.arch === 'arm64';
const picogkNativeEngine =
  process.platform === 'darwin' &&
  process.arch === 'arm64' &&
  existsSync(picogkSeed) &&
  !readFileSync(resolve(repoRoot, 'packages/plugins/picogk/tau-plugin.json'), 'utf8').includes(
    'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
  );

/**
 * The built entry keeps `@taucad/*` external, and in this workspace those
 * packages export TypeScript source, so the thread needs a TypeScript loader
 * for its dependencies, as `runCli` gives the built binary one.
 */
class TsxWorker extends NodeWorker {
  public constructor(url: string | URL, options?: WorkerOptions) {
    super(url, { ...options, execArgv: ['--import', 'tsx'] });
  }
}

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

  /* `cli:test` depends on `cli:build`, so Nx builds the binary before this suite. A nested `nx build` here would
   * inherit the outer run's `NX_SKIP_NX_CACHE` and rebuild the CLI's whole dependency graph inside the hook. */
  beforeAll(async () => {
    if (!existsSync(cliBinPath)) {
      throw new Error(`${cliBinPath} is missing: run \`pnpm nx test cli\`, which builds the CLI first.`);
    }
    workspace = await mkdtemp(join(tmpdir(), 'tau-cli-dist-'));
  });

  afterAll(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it.each(['serve', 'mcp'])('refuses %s machine opt-in while the deployment flag is off', async (command) => {
    const environment: NodeJS.ProcessEnv = {};
    environment['TAU_MACHINES_ENABLED'] = 'false';
    environment['TAU_HOST_MACHINES'] = 'true';
    const result = await runCli([command, '--machines'], environment);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Machines are not available in this release.');
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

  it('should report the version of the package.json it is installed with, as a preview rewrites after the build', async () => {
    // A pkg.pr.new preview packs this same `dist` with its manifest rewritten to `0.0.0-preview-<sha>`.
    const installed = join(workspace, 'preview', 'node_modules', '@taucad', 'cli');
    await cp(dirname(cliBinPath), join(installed, 'dist', 'bin'), { recursive: true });
    await writeFile(
      join(installed, 'package.json'),
      JSON.stringify({ name: '@taucad/cli', version: '0.0.0-preview-test' }),
    );
    // The copy resolves `citty` from its own `node_modules`, as an installed package does.
    await symlink(resolve(repoRoot, 'packages/cli/node_modules'), join(installed, 'node_modules'), 'junction');

    const { stdout } = await execFileAsync(process.execPath, [join(installed, 'dist', 'bin', 'tau.mjs'), '--version']);

    expect(stdout).toBe('0.0.0-preview-test\n');
  }, 60_000);

  it('should ship the serve command and its CLI-owned runtime child', async () => {
    const result = await runCli(['serve', '--help']);
    const childStat = await stat(hostRuntimeChildPath);
    const workerStat = await stat(computeStoreWorkerPath);

    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Serve a project folder to the browser on this machine');
    expect(childStat.isFile()).toBe(true);
    expect(workerStat.isFile()).toBe(true);
  });

  it('should ship a runtime worker entry that hosts the CLI runtime from workerData', async () => {
    /* One realm per project (kernel-realm-shared-state blueprint, WP-B3): the
     * coming `tau mcp` worker client starts this entry once per project. Tau Host
     * does not use it; it starts one runtime child process per root instead. */
    const workerStat = await stat(runtimeWorkerPath);
    expect(workerStat.isFile()).toBe(true);
    const project = await mkdtemp(join(workspace, 'runtime-worker-'));
    await writeFile(
      join(project, 'main.ts'),
      "import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n",
    );
    const client = createRuntimeClient({
      transport: nodeWorkerTransport({
        url: pathToFileURL(runtimeWorkerPath),
        workerData: { projectRoot: project, plugin: [] } satisfies RuntimeWorkerData,
        fileSystem: fromNodeFs(project),
        workerCtor: TsxWorker,
      }),
    });
    const document = client.open({ source: { path: 'main.ts' }, watch: false });
    try {
      const outcome = await document.view().rendering();

      expect(outcome.superseded).toBe(false);
      if (outcome.superseded) {
        throw new Error('The only render in this test must not be superseded.');
      }
      expect(outcome.rendering.success, JSON.stringify(outcome.rendering.issues)).toBe(true);
    } finally {
      document.close();
      await client.shutdown();
    }
  }, 120_000);

  it('should require explicit trust before relaying projects to this machine', async () => {
    const result = await runCli(['serve', '--relay=http://127.0.0.1:1']);

    expect(result.exitCode).toBe(2);
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

  it('should export PicoVoxel source in the exact lane through the built-in plugin', async () => {
    const outputPath = join(workspace, 'picovoxel.stl');

    const result = await runCli(['export', picovoxelHelloWorld, '--ext=stl', `--output=${outputPath}`]);

    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
    const bytes = await readFile(outputPath);
    // Exact STL carries no LANE stamp; a fast-lane export would end the header with LANE=fast.
    expect(bytes.subarray(0, 80).toString('latin1').trimEnd()).toBe('PicoGK UNITS=mm');
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

  describe.runIf(picogkNativeEngine)('PicoGK prepared closure', () => {
    it.each(['3mf', 'usdz'])(
      'exports a .cs entry point to %s through the built CLI after tau prepare picogk',
      async (extension) => {
        const outputPath = join(workspace, `picogk-sphere.${extension}`);
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
        const store = { TAU_CONFIG_DIR: join(workspace, 'config'), TAU_PAYLOAD_DIR: picogkSeed };
        const prepared = await runCli(['prepare', 'picogk'], store);
        expect(prepared.exitCode, `prepare stderr: ${prepared.stderr}`).toBe(0);

        const result = await runCli(['export', picogkSphere, `--ext=${extension}`, `--output=${outputPath}`], store);

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

  /*
   * W17 tier 4b on the native-darwin job (D30): `tau export main.cs` from an empty store refuses naming
   * `tau prepare picogk`, `tau prepare picogk` downloads the pinned runtime and Tau layer from their origins, and the
   * same export then succeeds with no Tau variable in the environment at all (no `TAU_PICOGK_RESOURCE_ROOT`, no
   * payload directory or mirror): the kernel composes from the store's receipts alone.
   */
  describe.runIf(nativeDarwin)('tau export main.cs with no environment (W17 tier 4b, native-darwin)', () => {
    it('should refuse, prepare from the pinned origins, then export the sphere to GLB', async () => {
      const home = await mkdtemp(join(tmpdir(), 'tau-cli-picogk-home-'));
      /* Every TAU_* variable is dropped; only the store location rides HOME, as on a fresh machine. */
      const environment = Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith('TAU_')),
      ) as NodeJS.ProcessEnv;
      environment['HOME'] = home;
      environment['NX_PREFER_NODE_STRIP_TYPES'] = 'true';
      const run = async (args: readonly string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        try {
          const { stdout, stderr } = await execFileAsync(
            process.execPath,
            ['--import', '@oxc-node/core/register', cliBinPath, ...args],
            { cwd: repoRoot, env: environment, maxBuffer: 64 * 1024 * 1024 },
          );
          return { stdout, stderr, exitCode: 0 };
        } catch (error) {
          const failure = error as { stdout?: string; stderr?: string; code?: number };
          return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', exitCode: failure.code ?? 1 };
        }
      };
      try {
        const output = join(home, 'sphere.glb');
        const refused = await run(['export', picogkSphere, '--ext=glb', `--output=${output}`]);
        expect(refused.exitCode, refused.stderr).toBe(3);
        expect(refused.stderr).toContain('tau prepare picogk');

        const prepared = await run(['prepare', 'picogk', '--json']);
        expect(prepared.exitCode, prepared.stderr).toBe(0);

        const exported = await run(['export', picogkSphere, '--ext=glb', `--output=${output}`]);
        expect(exported.exitCode, exported.stderr).toBe(0);
        validateGlbData(new Uint8Array(await readFile(output)));
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    }, 900_000);
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
