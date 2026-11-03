#!/usr/bin/env node
/**
 * Purpose: Build the browser apps the geometry parity gate runs, one per measured mode.
 * Why: I1 compares a browser against the matched native comparator, so the browser side needs an
 *   app built from the same verified archive, the same composed library and the same pinned author
 *   sources, with nothing of the gate's own in the measured program.
 * Environment: Node 24+, the matched .NET 11 workload, a restored PicoVoxel.PicoGK payload and a
 *   PicoVoxel checkout for the fixture and the pinned-source fetcher.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/prepare-parity-apps.mts <config.json>
 * Exit codes: 0 when every requested mode is built; non-zero on an invalid input or a failed build.
 */
/* oxlint-disable no-await-in-loop -- Build and hash one mode at a time, bounding preparation memory. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
/* oxlint-disable-next-line no-restricted-imports -- The preparation script's sibling module; scripts have no `#` alias. */
import { emscriptenEnvironment } from './browser-emscripten.mjs';
/* oxlint-disable-next-line no-restricted-imports -- The preparation script's sibling module; scripts have no `#` alias. */
import { browserThreadModuleNames, patchBrowserThreadRuntime } from './browser-thread-startup.mjs';

const absolute = z.string().refine(isAbsolute, 'Preparation paths must be absolute.');
const configSchema = z.object({
  dotnet: absolute,
  /** A restored, manifest-verified PicoVoxel.PicoGK payload, as `stage-picogk-package.mts` leaves it. */
  packageRoot: absolute,
  /** The managed base composed from that payload at Tau's patch order. */
  picoGkProject: absolute,
  /** A PicoVoxel checkout at the reviewed commit: the fixture source and the pinned-source fetcher. */
  picovoxelRoot: absolute,
  /** The admitted authoring reference assemblies, which dynamic mode compiles the sources against. */
  referencesRoot: absolute,
  outputRoot: absolute,
  modes: z.array(z.enum(['aot', 'dynamic'])).nonempty(),
  /*
   * Which engine archive and runtime the measured apps are built from. `threaded` is the execution
   * the product ships in a browser, so it is the one a qualifying figure has to describe; `serial`
   * stays measurable because it is the fallback and because it is what every earlier figure in this
   * program was taken on.
   */
  execution: z.enum(['serial', 'threaded']).default('serial'),
});
const sha256 = (bytes: BinaryLike): string => createHash('sha256').update(bytes).digest('hex');
const archiveNames = ['float-trig.o', 'libblosc.a', 'libopenvdb.a', 'libtbb.a', 'libz.a', 'picogk.26.2.a'];
/** The author trees the fixture names, with the pin keys `inputs.json` records them under. */
const authorRepositories = ['ShapeKernel', 'HelixHeatX'] as const;

const config = configSchema.parse(JSON.parse(await readFile(resolve(process.argv[2] ?? ''), 'utf8')) as unknown);
const projectRoot = resolve(import.meta.dirname, '../dotnet/Tau.PicoGK.Parity');
const engineRoot = join(config.packageRoot, 'engine', config.execution);
const archiveRoot = join(engineRoot, 'native');

/*
 * The payload was verified when it was staged, so this only refuses a payload edited since: the
 * measured app must link the archive the receipts describe, not whatever is on disk now.
 */
for (const name of archiveNames) {
  const metadata = z
    .object({ sha256: z.string() })
    .parse(JSON.parse(await readFile(join(engineRoot, `${name}.metadata.json`), 'utf8')) as unknown);
  if (sha256(await readFile(join(archiveRoot, name))) !== metadata.sha256) {
    throw new Error(`The browser archive bytes changed: ${name}.`);
  }
}

/*
 * The author sources come from PicoVoxel's own fetcher, which checks each tree against the pins'
 * recorded Git blobs and throws on any difference. That is I2's evidence for the browser side, and
 * it is the same route the native driver takes, so neither side can compile a different program.
 */
const fetcher = z
  .object({ fetchPinnedSource: z.function({ input: z.tuple([z.string(), z.string()]), output: z.string() }) })
  .parse(await import(pathToFileURL(join(config.picovoxelRoot, 'dotnet/fetch-pinned-source.mjs')).href));
await mkdir(config.outputRoot, { recursive: true });
const authorRoot = join(config.outputRoot, 'author');
const authored: Record<string, string> = {};
for (const name of authorRepositories) {
  authored[name] = fetcher.fetchPinnedSource(name, join(authorRoot, name));
}

const fixture = join(config.picovoxelRoot, 'dotnet/tests/parity/GeometryParityFixture.cs');

/** Every `.cs` file under one root, as paths relative to it. */
const sourceFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.cs'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort((left, right) => left.localeCompare(right));
};

/**
 * Stage what dynamic mode compiles in the browser: the fixture, the author trees at their pins, one
 * entry per subject, and the admitted authoring references with this build's own PicoGK beside them.
 *
 * The page writes these into the runtime's file system before the program runs, which is how the
 * shipped worker's owner supplies a project and a verified reference set. Only the compile path
 * differs from the ahead-of-time app; the sources are the same bytes.
 */
const stageProject = async (app: string, builtLibrary: string): Promise<void> => {
  const staged = join(app, 'staged');
  const project = join(staged, 'project');
  const sources: string[] = [];
  const place = async (name: string, from: string): Promise<void> => {
    await mkdir(dirname(join(project, name)), { recursive: true });
    await cp(from, join(project, name));
    sources.push(name);
  };
  const shapeKernel = authored['ShapeKernel'] ?? '';
  const heatX = authored['HelixHeatX'] ?? '';
  await place('fixture/GeometryParityFixture.cs', fixture);
  for (const name of await sourceFiles(join(shapeKernel, 'ShapeKernel'))) {
    await place(join('ShapeKernel', name), join(shapeKernel, 'ShapeKernel', name));
  }
  await place(
    'ShapeKernel/Examples/Ex_ImplicitGyroidSphere.cs',
    join(shapeKernel, 'Examples/Ex_ImplicitGyroidSphere.cs'),
  );
  for (const name of await sourceFiles(join(heatX, 'src'))) {
    await place(join('HelixHeatX', name), join(heatX, 'src', name));
  }
  /*
   * One entry per subject, each a program of its own: the compilation service picks the entry the
   * run names and treats every other file as a helper, so the subjects never collide.
   */
  for (const subject of ['gyroid', 'heatx']) {
    const name = `${subject}.cs`;
    await mkdir(project, { recursive: true });
    await writeFile(
      join(project, name),
      `// Entry point only; the fixture and every author source beside it are compiled unchanged.\nGeometryParityFixture.Run(["/captures", "${subject}"]);\n`,
    );
    sources.push(name);
  }
  const references = join(staged, 'refs');
  await mkdir(references, { recursive: true });
  const names: string[] = [];
  for (const entry of await readdir(config.referencesRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.dll')) {
      continue;
    }
    await cp(join(config.referencesRoot, entry.name), join(references, entry.name));
    names.push(entry.name);
  }
  // This build's own library, not the one the reference set shipped with: author code compiles
  // against the same assembly the app runs.
  await cp(builtLibrary, join(references, 'PicoGK.dll'));
  if (!names.includes('PicoGK.dll')) {
    names.push('PicoGK.dll');
  }
  await writeFile(
    join(staged, 'manifest.json'),
    `${JSON.stringify(
      {
        references: names.sort((left, right) => left.localeCompare(right)),
        sources: sources.sort((left, right) => left.localeCompare(right)),
      },
      null,
      2,
    )}\n`,
  );
};
const built: Record<string, { app: string; files: number; bytes: number }> = {};
for (const mode of config.modes) {
  const artifacts = join(config.outputRoot, `artifacts-${mode}`);
  execFileSync(
    config.dotnet,
    [
      'publish',
      'Tau.PicoGK.Parity.csproj',
      '-c',
      'Release',
      '--artifacts-path',
      artifacts,
      `-p:TauParityMode=${mode}`,
      `-p:WasmEnableThreads=${String(config.execution === 'threaded')}`,
      `-p:PicoGKProject=${config.picoGkProject}`,
      `-p:TauPicoGKArchiveRoot=${archiveRoot}`,
      `-p:TauPicoGKRetentionProps=${join(config.packageRoot, 'browser/AuthoringRetention.props')}`,
      `-p:TauPicoGKGeneratorPath=${join(config.packageRoot, 'generator/PicoVoxel.Sdf.Generator.dll')}`,
      `-p:TauPicoGKRoslynRoot=${join(config.packageRoot, 'roslyn')}`,
      `-p:TauParityFixture=${fixture}`,
      `-p:TauParityShapeKernel=${authored['ShapeKernel']}`,
      `-p:TauParityHeatX=${authored['HelixHeatX']}`,
    ],
    { cwd: projectRoot, stdio: 'inherit', env: await emscriptenEnvironment(config.outputRoot) },
  );
  const published = join(artifacts, 'publish', 'Tau.PicoGK.Parity', 'release', 'wwwroot');
  const app = join(config.outputRoot, mode);
  await cp(published, app, { recursive: true });
  if (config.execution === 'threaded') {
    /*
     * The same corrections the shipped bundle is staged with, from the same module: an unpatched
     * threaded runtime starts, runs the geometry and reports its time, and then its idle owner
     * stalls on the first awaited interop call, so the run hands back no captures and no verdict.
     * A measured app that skipped them would not be the runtime the product ships.
     */
    const framework = join(app, '_framework');
    const bootstrap = await readFile(join(framework, 'dotnet.js'), 'utf8');
    const names = browserThreadModuleNames(bootstrap);
    const patched = patchBrowserThreadRuntime({
      bootstrap,
      native: await readFile(join(framework, names.native), 'utf8'),
      runtime: await readFile(join(framework, names.runtime), 'utf8'),
    });
    for (const [name, module] of patched.modules) {
      await writeFile(join(framework, name), module);
    }
    // The originals are no longer named by the configuration, and an app serves only what it loads.
    await rm(join(framework, names.native));
    await rm(join(framework, names.runtime));
    await writeFile(join(framework, 'dotnet.js'), patched.bootstrap);
  }
  await writeFile(join(app, 'parity-mode.json'), `${JSON.stringify({ mode })}\n`);
  if (mode === 'dynamic') {
    await stageProject(app, join(artifacts, 'bin/PicoGK/release/PicoGK.dll'));
  }
  const entries = await readdir(app, { recursive: true, withFileTypes: true });
  let bytes = 0;
  let files = 0;
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    files += 1;
    const contents = await readFile(join(entry.parentPath, entry.name));
    bytes += contents.byteLength;
  }
  built[mode] = { app, files, bytes };
  console.log(`Prepared the ${mode} parity app: ${app} (${String(files)} files, ${String(bytes)} bytes)`);
}

await writeFile(
  join(config.outputRoot, 'parity-apps.json'),
  `${JSON.stringify(
    {
      schemaVersion: 2,
      execution: config.execution,
      // The fixture and the author trees are what a reader needs to tell two runs apart.
      fixtureSha256: sha256(await readFile(fixture)),
      author: Object.fromEntries(
        Object.entries(authored).map(([name, root]) => [name, relative(config.outputRoot, root)]),
      ),
      archive: Object.fromEntries(
        await Promise.all(
          archiveNames.map(
            async (name): Promise<[string, string]> => [name, sha256(await readFile(join(archiveRoot, name)))],
          ),
        ),
      ),
      modes: built,
    },
    null,
    2,
  )}\n`,
  { flag: 'wx' },
);
