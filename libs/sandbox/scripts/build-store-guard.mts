#!/usr/bin/env node

/**
 * Purpose: Build the Linux Terminal's git store guard (`libs/sandbox/store-guard`) as one static musl executable and
 *   stage it with its NOTICE and manifest under `out/store-guard/linux-x64`, or run its Rust checks.
 * Why: The guard ships beside Tau's bubblewrap in the APT package and the AppImage (Linux Terminal git parity blueprint,
 *   LP2 and LP8). It is built from pinned inputs: the toolchain in `rust-toolchain.toml` and the locked crates.
 * Environment: Node 24+, Linux x64, rustup (it installs the pinned toolchain and the musl target on first run) and a C
 *   linker. In CI the lockfile is pinned with `--locked`.
 * Usage: node --import @oxc-node/core/register libs/sandbox/scripts/build-store-guard.mts [--test] [--resources <dir>]
 *   `--test` runs the unit tests, clippy and rustfmt instead of building. `--resources <dir>` also copies the staged
 *   guard into `<dir>` (the desktop's `resources/store-guard/linux-x64`).
 * Exit codes: 0 when the guard is staged or the checks pass; non-zero on a missing toolchain, a build or check failure,
 *   or a binary that is not a static linux-x64 executable.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { z } from 'zod';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const crateRoot = resolve(workspaceRoot, 'libs/sandbox/store-guard');
const outputRoot = resolve(workspaceRoot, 'out/store-guard');
/* Cargo's own build tree stays in the crate (its `target`, ignored), so the script reads only its own project. */
const cargoTarget = resolve(crateRoot, 'target');
const stageRoot = resolve(outputRoot, 'linux-x64');
const target = 'x86_64-unknown-linux-musl';
const executableName = 'tau-store-guard';

const usage = 'Usage: build-store-guard.mts [--test] [--resources <dir>]';

const parseArguments = (): Readonly<{ test: boolean; resources: string | undefined }> => {
  const arguments_ = process.argv.slice(2);
  let test = false;
  let resources: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const flag = arguments_.at(index);
    const value = arguments_.at(index + 1);
    if (flag === '--test') {
      test = true;
    } else if (flag === '--resources' && value !== undefined) {
      resources = resolve(value);
      index += 1;
    } else {
      throw new TypeError(usage);
    }
  }
  return { test, resources };
};

const cargo = (args: readonly string[]): void => {
  // In CI, pin the lockfile: `--locked` is a cargo option, so it goes before any `--` that starts the tool's own options.
  const separator = args.includes('--') ? args.indexOf('--') : args.length;
  const locked = process.env.CI === undefined || process.env.CI === '' ? [] : ['--locked'];
  execFileSync('cargo', [...args.slice(0, separator), ...locked, ...args.slice(separator)], {
    cwd: crateRoot,
    stdio: 'inherit',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
    env: { ...process.env, CARGO_TARGET_DIR: cargoTarget },
  });
};

/** Install the toolchain `rust-toolchain.toml` pins, with its musl target and components; a no-op once present. */
const ensureToolchain = (): void => {
  try {
    execFileSync('rustup', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error('rustup is required to build the store guard: https://rustup.rs');
  }
  execFileSync('rustup', ['toolchain', 'install'], { cwd: crateRoot, stdio: 'inherit' });
};

/**
 * Whether an ELF image is a static linux-x64 executable: 64-bit little-endian, machine x86-64, and no `PT_INTERP`
 * program header, so it needs no dynamic loader and runs on every supported distribution.
 */
const staticElfProblem = (image: Uint8Array<ArrayBuffer>): string | undefined => {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  if (view.getUint32(0) !== 0x7f_45_4c_46 || image[4] !== 2 || image[5] !== 1) {
    return 'not a 64-bit little-endian ELF image';
  }
  if (view.getUint16(18, true) !== 62) {
    return 'not an x86-64 executable';
  }
  const programHeaders = Number(view.getBigUint64(32, true));
  const entrySize = view.getUint16(54, true);
  const count = view.getUint16(56, true);
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(programHeaders + index * entrySize, true) === 3) {
      return 'dynamically linked (it has a PT_INTERP program header)';
    }
  }
  return undefined;
};

const cargoPackage = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  license: z.string().nullish(),
  repository: z.string().nullish(),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- cargo metadata's wire name.
  manifest_path: z.string(),
});
type CargoPackage = z.infer<typeof cargoPackage>;
const cargoMetadata = z.object({
  packages: z.array(cargoPackage),
  resolve: z.object({
    root: z.string(),
    nodes: z.array(
      z.object({
        id: z.string(),
        deps: z.array(
          z.object({
            pkg: z.string(),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- cargo metadata's wire name.
            dep_kinds: z.array(z.object({ kind: z.string().nullable() })),
          }),
        ),
      }),
    ),
  }),
});

const byNameAndVersion = (left: CargoPackage, right: CargoPackage): number =>
  left.name.localeCompare(right.name) || left.version.localeCompare(right.version);

/** Every crate the guard is built from: the normal dependency closure of the crate for the musl target. */
const linkedCrates = (): readonly CargoPackage[] => {
  const metadata = cargoMetadata.parse(
    JSON.parse(
      execFileSync('cargo', ['metadata', '--format-version', '1', '--filter-platform', target, '--locked'], {
        cwd: crateRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    ),
  );
  const packages = new Map(metadata.packages.map((entry) => [entry.id, entry]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const pending = [metadata.resolve.root];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    for (const dependency of nodes.get(id)?.deps ?? []) {
      /* A normal dependency has no kind; dev and build dependencies are not linked into the guard. */
      if (dependency.dep_kinds.some(({ kind }) => kind === null)) {
        pending.push(dependency.pkg);
      }
    }
  }
  const crates = [...seen].map((id) => packages.get(id)).filter((entry) => entry !== undefined);
  // oxlint-disable-next-line no-array-sort -- sorting a fresh copy.
  return crates.sort(byNameAndVersion);
};

/** The NOTICE: every crate with its licence expression, then the licence and notice texts each crate ships. */
const notice = async (crates: readonly CargoPackage[]): Promise<string> => {
  const sections = [
    `tau-store-guard: the git store guard for Tau's Linux Terminal (libs/sandbox/store-guard in taucad/tau).`,
    `It is one static executable built from the Rust crates below, each under its own licence.`,
    '',
    ...crates.map(
      (entry) =>
        `- ${entry.name} ${entry.version}: ${entry.license ?? 'no licence expression'}${entry.repository ? ` (${entry.repository})` : ''}`,
    ),
  ];
  for (const entry of crates) {
    const directory = resolve(entry.manifest_path, '..');
    // oxlint-disable-next-line no-await-in-loop -- one listing per crate, in order, so the NOTICE is deterministic.
    const listing = await readdir(directory);
    // oxlint-disable-next-line no-array-sort -- sorting the filtered copy.
    const files = listing.filter((name) => /^(?:licen[cs]e|copying|notice)/iu.test(name)).sort();
    for (const file of files) {
      // oxlint-disable-next-line no-await-in-loop -- see above.
      const text = await readFile(join(directory, file), 'utf8').catch(() => undefined);
      if (text !== undefined) {
        sections.push('', `===== ${entry.name} ${entry.version}: ${file} =====`, '', text.trimEnd());
      }
    }
  }
  return `${sections.join('\n')}\n`;
};

const { test, resources } = parseArguments();
if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error(
    `The store guard is built on linux-x64 for linux-x64; this host is ${process.platform}-${process.arch}.`,
  );
}
ensureToolchain();
if (test) {
  cargo(['test', '--all-targets']);
  cargo(['clippy', '--all-targets', '--', '-D', 'warnings']);
  execFileSync('cargo', ['fmt', '--check'], { cwd: crateRoot, stdio: 'inherit' });
} else {
  cargo(['build', '--release', '--target', target]);
  const built = resolve(cargoTarget, target, 'release', executableName);
  const image = new Uint8Array(await readFile(built));
  const problem = staticElfProblem(image);
  if (problem !== undefined) {
    throw new Error(`${built} is ${problem}; the guard must be a static linux-x64 executable.`);
  }
  const version = execFileSync(built, ['--version'], { encoding: 'utf8' }).trim();
  const crates = linkedCrates();
  const toolchain = /channel = "([^"]+)"/u.exec(await readFile(resolve(crateRoot, 'rust-toolchain.toml'), 'utf8'))?.[1];
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await copyFile(built, join(stageRoot, executableName));
  await chmod(join(stageRoot, executableName), 0o755);
  await writeFile(join(stageRoot, 'NOTICE'), await notice(crates));
  await writeFile(
    join(stageRoot, 'manifest.json'),
    `${JSON.stringify(
      {
        version,
        target,
        rust: toolchain ?? 'unknown',
        sha256: createHash('sha256').update(image).digest('hex'),
        bytes: image.byteLength,
        crates: crates.map(({ name, version: crateVersion, license }) => ({
          name,
          version: crateVersion,
          license: license ?? null,
        })),
      },
      undefined,
      2,
    )}\n`,
  );
  console.log(`Staged ${version} (${String(image.byteLength)} bytes) at ${stageRoot}`);
  if (resources !== undefined) {
    await rm(resources, { recursive: true, force: true });
    await mkdir(resources, { recursive: true });
    for (const name of [executableName, 'NOTICE', 'manifest.json']) {
      // oxlint-disable-next-line no-await-in-loop -- three files.
      await copyFile(join(stageRoot, name), join(resources, name));
    }
    await chmod(join(resources, executableName), 0o755);
    console.log(`Copied into ${resources}`);
  }
}
