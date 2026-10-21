/**
 * The standalone-project oracle (native dependency charter W23, D34, I14; go-live row PRJ-1): every project Tau
 * creates runs outside Tau with its ecosystem's own toolchain, from the files in the project folder, and produces the
 * geometry Tau exports for the same project.
 *
 * For each template (kernel) of the requested ecosystem:
 * 1. Create the project as the UI does (`createInitialProject` with the kernel's npm libraries or project template),
 *    with its `tau.json`, then replace the empty main file with the kernel's fixture from
 *    `libs/tau-examples/src/standalone/<kernel>/` (a model with real geometry, plus the outside-Tau runner where the
 *    ecosystem needs one).
 * 2. npm projects: `tau install` writes `package-lock.json`, as the app's Install does.
 * 3. Copy the project, without `node_modules`, to a bare directory outside the repository.
 * 4. Tau's export of the original: `tau prepare <kernel>` for a native kernel, then `tau export … --ext=<glb|json>`.
 * 5. The bare copy with the native toolchain only: npm (`npm ci --ignore-scripts`, then the runner), build123d and
 *    SMLibPy (`uv sync --locked`, `uv run main.py`), PicoGK (`dotnet restore --locked-mode`, `dotnet run`), OpenSCAD
 *    (`openscad -o`) or KCL (`zoo kcl export`).
 * 6. Compare: the enclosed volume of both meshes within 1e-6 (relative), or identical Circuit JSON (tscircuit).
 *
 * Every row runs; the step summary and stdout carry each row's verdict and, for a failure, the step that failed with
 * its output or both measurements.
 *
 * Usage: node scripts/src/check-standalone-project.ts --ecosystem <npm|pypi|nuget|none|kcl> [--kernel <id>] [--work <dir>]
 * Environment: the ecosystem's tools on PATH (node and npm; uv; the .NET 10 SDK; openscad; zoo). KCL needs
 *   ZOO_TOKEN (the Zoo CLI) and TAU_AUTH_TOKEN (Tau's export through its Zoo proxy).
 * Exit codes: 0 when every row matches Tau's export; 1 when a row fails; 2 on a usage error.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

/* oxlint-disable no-restricted-imports -- the oracle creates projects with the UI's own factory and catalog by path. */
/* eslint-disable @nx/enforce-module-boundaries -- the UI's project factory and kernel libraries are not package exports. */
import { createInitialProject } from '../../apps/ui/app/constants/project.constants.ts';
import { kernelLibraries } from '../../apps/ui/app/utils/kernel-libraries.ts';
import { kernelConfigurations } from '../../libs/types/src/constants/kernel.constants.ts';
import type { KernelEcosystem } from '../../libs/types/src/constants/kernel.constants.ts';
/* eslint-enable @nx/enforce-module-boundaries -- relative project imports end. */
/* oxlint-enable no-restricted-imports */
import { compareVolumes, measureMesh } from '#standalone-geometry.js';
import type { VolumeComparison } from '#standalone-geometry.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** Where each template's fixture lives. */
export const fixturesDirectory = join(repoRoot, 'libs/tau-examples/src/standalone');

type Command = readonly [string, ...string[]];

/** How one template runs outside Tau and how Tau exports it. */
export type StandaloneRow = {
  /** `tau prepare <kernel>` before Tau's export, for a native kernel. */
  readonly prepare?: string;
  /** Tau's export: a GLB, or Circuit JSON for tscircuit. */
  readonly tauExtension: 'glb' | 'json';
  /** The native toolchain's install, in the bare copy. */
  readonly install: readonly Command[];
  /** The native run, in the bare copy; it writes {@link StandaloneRow.output}. */
  readonly run: Command;
  /** The file the native run writes, relative to the bare copy; a directory (`/`) holds exactly one mesh. */
  readonly output: string;
  /** Environment variables the row cannot run without. */
  readonly credentials?: readonly string[];
};

const npmInstall: readonly Command[] = [['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund']];
const nodeRunner = (output: string): Command => ['node', 'run.mjs', output];

/** One row per template Tau creates, keyed by kernel id. */
export const standaloneRows: Readonly<Record<string, StandaloneRow>> = {
  replicad: { tauExtension: 'glb', install: npmInstall, run: nodeRunner('native.stl'), output: 'native.stl' },
  manifold: {
    tauExtension: 'glb',
    install: npmInstall,
    // The manifold-3d package's own CLI, which the package installs as a bin.
    run: ['npm', 'exec', '--offline', '--', 'manifold-cad', 'main.ts', 'native.glb'],
    output: 'native.glb',
  },
  jscad: { tauExtension: 'glb', install: npmInstall, run: nodeRunner('native.stl'), output: 'native.stl' },
  opencascadejs: { tauExtension: 'glb', install: npmInstall, run: nodeRunner('native.stl'), output: 'native.stl' },
  picovoxel: { tauExtension: 'glb', install: npmInstall, run: nodeRunner('native.stl'), output: 'native.stl' },
  smlib: { tauExtension: 'glb', install: npmInstall, run: nodeRunner('native.stl'), output: 'native.stl' },
  tscircuit: { tauExtension: 'json', install: npmInstall, run: nodeRunner('circuit.json'), output: 'circuit.json' },
  build123d: {
    prepare: 'build123d',
    tauExtension: 'glb',
    install: [['uv', 'sync', '--locked']],
    run: ['uv', 'run', '--locked', 'main.py', 'native.stl'],
    output: 'native.stl',
  },
  smlibpy: {
    prepare: 'smlibpy',
    tauExtension: 'glb',
    install: [['uv', 'sync', '--locked']],
    run: ['uv', 'run', '--locked', 'main.py', 'native.stl'],
    output: 'native.stl',
  },
  picogk: {
    prepare: 'picogk',
    tauExtension: 'glb',
    install: [['dotnet', 'restore', '--locked-mode']],
    run: ['dotnet', 'run', '--no-restore', '--', 'native.stl'],
    output: 'native.stl',
  },
  openscad: {
    tauExtension: 'glb',
    install: [],
    run: ['openscad', '-o', 'native.stl', 'main.scad'],
    output: 'native.stl',
  },
  zoo: {
    tauExtension: 'glb',
    install: [],
    run: ['zoo', 'kcl', 'export', '--output-format=stl', 'main.kcl', 'native'],
    // The Zoo CLI names the file it writes into the output directory.
    output: 'native/',
    credentials: ['ZOO_TOKEN', 'TAU_AUTH_TOKEN'],
  },
};

/** A row's outcome: the step it reached, and the comparison or the failure's evidence. */
export type RowVerdict = {
  readonly kernel: string;
  readonly pass: boolean;
  readonly step: 'create' | 'tau install' | 'tau prepare' | 'tau export' | 'native install' | 'native run' | 'compare';
  readonly detail: string;
  readonly comparison?: VolumeComparison;
};

class StepFailure extends Error {
  public readonly step: RowVerdict['step'];

  public constructor(step: RowVerdict['step'], detail: string) {
    super(detail);
    this.step = step;
  }
}

/** The last lines of a command's output, enough to read why it failed. */
const tail = (text: string, lines = 40): string => text.trimEnd().split('\n').slice(-lines).join('\n');

/**
 * Run a command, failing the step with its output when it exits non-zero.
 * @param step - The row step this command belongs to.
 * @param command - The command and its arguments.
 * @param options - The working directory, and the environment (the inherited one by default).
 * @returns The command's combined output.
 */
const run = (
  step: RowVerdict['step'],
  command: Command,
  { cwd, environment = process.env }: { readonly cwd: string; readonly environment?: NodeJS.ProcessEnv },
): string => {
  const [file, ...args] = command;
  console.log(`  $ ${command.join(' ')}   (in ${cwd})`);
  const result = spawnSync(file, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const output = `${result.stdout}${result.stderr}`;
  if (result.error !== undefined) {
    throw new StepFailure(step, `${command.join(' ')}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new StepFailure(step, `${command.join(' ')} exited ${result.status ?? result.signal}:\n${tail(output)}`);
  }
  return output;
};

/** The environment of a native step: the runner's own, without anything the workspace's tools set. */
const nativeEnvironment = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(?:npm_|pnpm_|NODE_OPTIONS$|NODE_PATH$|NX_|INIT_CWD$)/iu.test(name),
    ),
  );

/** Tau's CLI from this checkout's source, as the integration suites run it. */
const tau = (step: RowVerdict['step'], args: readonly string[]): string =>
  run(step, [process.execPath, '--import', '@oxc-node/core/register', 'packages/cli/src/bin.ts', ...args], {
    cwd: repoRoot,
  });

/**
 * The project template files a kernel's plugin publishes (`@taucad/<kernel>/project/*`), which the UI's
 * `getKernelProjectTemplate` imports; undefined for a kernel whose files Tau writes itself.
 * @param kernel - The kernel id.
 * @returns The template, keyed by template path.
 */
const projectTemplate = (kernel: string): Record<string, string> | undefined => {
  const directory = join(repoRoot, 'packages/plugins', kernel, 'project');
  if (!existsSync(directory)) {
    return undefined;
  }
  return Object.fromEntries(readdirSync(directory).map((file) => [file, readFileSync(join(directory, file), 'utf8')]));
};

/**
 * Write the project Tau creates for a kernel, with its fixture in place of the empty main file.
 * @param kernel - The kernel id.
 * @param directory - The project directory, created empty.
 * @returns The main file's name.
 */
export const createProject = (kernel: string, directory: string): string => {
  const configuration = kernelConfigurations.find(({ id }) => id === kernel);
  if (configuration === undefined) {
    throw new StepFailure('create', `No kernel ${kernel} in the catalog.`);
  }
  const { projectData, files } = createInitialProject({
    projectName: `Standalone ${configuration.name}`,
    mainFileName: configuration.mainFile,
    emptyCodeContent: new TextEncoder().encode(configuration.emptyCode),
    ecosystem: configuration.ecosystem,
    dependencies: kernelLibraries[kernel as keyof typeof kernelLibraries] ?? {},
    template: projectTemplate(kernel),
  });
  mkdirSync(directory, { recursive: true });
  for (const [path, { content }] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  }
  // Tau's own file, which the native toolchain must ignore (I14: Tau-only files are additive).
  writeFileSync(
    join(directory, 'tau.json'),
    `${JSON.stringify({ id: 'proj_standalone', ...projectData }, undefined, 2)}\n`,
  );
  const fixture = join(fixturesDirectory, kernel);
  if (!existsSync(join(fixture, configuration.mainFile))) {
    throw new StepFailure('create', `The fixture ${relative(repoRoot, fixture)} has no ${configuration.mainFile}.`);
  }
  cpSync(fixture, directory, { recursive: true });
  return configuration.mainFile;
};

/**
 * The native run's output file: the path itself, or the one STL or GLB inside a directory path.
 * @param path - The row's output path, absolute.
 * @returns The file to measure.
 */
const resolveOutput = (path: string): string => {
  if (!path.endsWith('/') || !existsSync(path)) {
    return path;
  }
  const meshes = readdirSync(path).filter((file) => /\.(?:stl|glb)$/u.test(file));
  return meshes.length === 1 ? join(path, meshes[0] ?? '') : path;
};

/** Canonical JSON: object keys sorted, so two documents compare by content. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
        )
      : inner,
  );

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/**
 * Run one template end to end.
 * @param kernel - The kernel id.
 * @param work - The row's work directory, outside the repository.
 * @returns The row's verdict.
 */
const checkRow = (kernel: string, work: string): RowVerdict => {
  const row = standaloneRows[kernel];
  if (row === undefined) {
    return { kernel, pass: false, step: 'create', detail: `No standalone row for ${kernel}.` };
  }
  const missing = (row.credentials ?? []).filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return {
      kernel,
      pass: false,
      step: 'tau export',
      detail: `${missing.join(' and ')} not set: the KCL row needs a Zoo API token for the Zoo CLI and a Tau session for Tau's export through its Zoo proxy.`,
    };
  }
  const project = join(work, 'project');
  const standalone = join(work, 'standalone');
  rmSync(work, { recursive: true, force: true });
  try {
    const main = createProject(kernel, project);
    const configuration = kernelConfigurations.find(({ id }) => id === kernel);
    if (configuration?.ecosystem === 'npm') {
      tau('tau install', ['install', project]);
    }
    cpSync(project, standalone, { recursive: true, filter: (source) => !source.includes(`${project}/node_modules`) });

    if (row.prepare !== undefined) {
      tau('tau prepare', ['prepare', row.prepare]);
    }
    const tauOutput = join(work, `tau.${row.tauExtension}`);
    tau('tau export', ['export', join(project, main), `--ext=${row.tauExtension}`, `--output=${tauOutput}`]);

    const environment = nativeEnvironment();
    for (const command of row.install) {
      run('native install', command, { cwd: standalone, environment });
    }
    run('native run', row.run, { cwd: standalone, environment });
    const nativeOutput = resolveOutput(join(standalone, row.output));
    if (!existsSync(nativeOutput)) {
      throw new StepFailure('native run', `${row.run.join(' ')} exited 0 but wrote no ${row.output}.`);
    }

    if (row.tauExtension === 'json') {
      const tauHash = sha256(canonical(JSON.parse(readFileSync(tauOutput, 'utf8'))));
      const nativeHash = sha256(canonical(JSON.parse(readFileSync(nativeOutput, 'utf8'))));
      return {
        kernel,
        pass: tauHash === nativeHash,
        step: 'compare',
        detail: `Circuit JSON sha256: Tau ${tauHash}, native ${nativeHash}`,
      };
    }
    const comparison = compareVolumes(
      measureMesh(tauOutput, readFileSync(tauOutput)),
      measureMesh(nativeOutput, readFileSync(nativeOutput)),
    );
    return {
      kernel,
      pass: comparison.pass,
      step: 'compare',
      detail: `volume Tau ${comparison.tau.volume} mm³, native ${comparison.native.volume} mm³, relative difference ${comparison.relativeDifference.toExponential(3)}`,
      comparison,
    };
  } catch (error) {
    if (error instanceof StepFailure) {
      return { kernel, pass: false, step: error.step, detail: error.message };
    }
    throw error;
  }
};

/**
 * The kernels of one ecosystem, in catalog order.
 * @param ecosystem - The ecosystem.
 * @returns Their ids.
 */
export const ecosystemKernels = (ecosystem: KernelEcosystem): string[] =>
  kernelConfigurations.filter((configuration) => configuration.ecosystem === ecosystem).map(({ id }) => id);

const ecosystems: readonly KernelEcosystem[] = ['npm', 'pypi', 'nuget', 'none', 'kcl'];

const summarize = (ecosystem: string, verdicts: readonly RowVerdict[]): string =>
  [
    `### Standalone projects (${ecosystem})`,
    '',
    '| Template | Result | Step | Detail |',
    '| --- | --- | --- | --- |',
    ...verdicts.map(
      ({ kernel, pass, step, detail }) =>
        `| ${kernel} | ${pass ? 'pass' : '**FAIL**'} | ${step} | ${detail.split('\n')[0]?.replaceAll('|', String.raw`\|`) ?? ''} |`,
    ),
    '',
    ...verdicts
      .filter(({ pass }) => !pass)
      .flatMap(({ kernel, detail, comparison }) => [
        `<details><summary>${kernel}</summary>`,
        '',
        '```',
        comparison === undefined ? detail : JSON.stringify(comparison, undefined, 2),
        '```',
        '</details>',
        '',
      ]),
  ].join('\n');

const main = (): number => {
  const { values } = parseArgs({
    options: { ecosystem: { type: 'string' }, kernel: { type: 'string', multiple: true }, work: { type: 'string' } },
  });
  const ecosystem = values.ecosystem as KernelEcosystem | undefined;
  if (ecosystem === undefined || !ecosystems.includes(ecosystem)) {
    console.error(`--ecosystem must be one of ${ecosystems.join(', ')}.`);
    return 2;
  }
  const kernels = values.kernel ?? ecosystemKernels(ecosystem);
  const work = resolve(values.work ?? join(tmpdir(), 'tau-standalone'));
  const outside = relative(repoRoot, work);
  if (!outside.startsWith('..') && !isAbsolute(outside)) {
    console.error(
      `--work ${work} is inside the repository; the oracle copies each project to a bare directory outside it.`,
    );
    return 2;
  }
  const verdicts: RowVerdict[] = [];
  for (const kernel of kernels) {
    console.log(`→ ${kernel}`);
    const verdict = checkRow(kernel, join(work, kernel));
    verdicts.push(verdict);
    console.log(`${verdict.pass ? '✓' : '✗'} ${kernel} (${verdict.step}): ${verdict.detail}`);
    if (process.env['GITHUB_ACTIONS'] === 'true') {
      // One annotation per row, so the verdict and its evidence show on the run without opening the log.
      const message = verdict.comparison === undefined ? verdict.detail : JSON.stringify(verdict.comparison);
      const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
      console.log(`::${verdict.pass ? 'notice' : 'error'} title=${kernel} (${verdict.step})::${escaped}`);
    }
    if (verdict.comparison !== undefined && !verdict.pass) {
      console.log(JSON.stringify(verdict.comparison, undefined, 2));
    }
  }
  const summary = summarize(ecosystem, verdicts);
  console.log(`\n${summary}`);
  if (process.env['GITHUB_STEP_SUMMARY']) {
    appendFileSync(process.env['GITHUB_STEP_SUMMARY'], `${summary}\n`);
  }
  return verdicts.every(({ pass }) => pass) ? 0 : 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error('check-standalone-project failed:', error);
    process.exitCode = 1;
  }
}
