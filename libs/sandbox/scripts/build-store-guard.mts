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
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/* oxlint-disable no-restricted-imports -- Operational scripts are outside the library's # source alias. */
import {
  crateNotice,
  ensureToolchain,
  linkedCrates,
  payloadManifest,
  pinnedToolchain,
  rustLibraryCopyright,
  toolchainDocuments,
  toolchainLicence,
} from './rust-payload.mjs';
/* oxlint-enable no-restricted-imports -- End operational script import exception. */

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

/**
 * What the static executable links from the toolchain itself: the Rust standard library (`std`, `core`, `alloc`, with
 * the notices the toolchain ships for it), LLVM's libunwind, and musl libc with its C runtime objects.
 */
const toolchainNotice = async (): Promise<string[]> => {
  const documents = toolchainDocuments(crateRoot);
  const mit = await toolchainLicence(documents, 'MIT.txt');
  return [
    '',
    '===== Toolchain components linked into the executable =====',
    '',
    '- Rust standard library (std, core, alloc): Apache-2.0 OR MIT, with the exceptions listed below.',
    '- libunwind (LLVM), from the Rust toolchain: Apache-2.0 WITH LLVM-exception.',
    '- musl libc and its C runtime objects, from the Rust toolchain for x86_64-unknown-linux-musl: MIT.',
    '',
    '===== Rust standard library: COPYRIGHT-library =====',
    '',
    await rustLibraryCopyright(documents),
    '',
    '===== musl libc =====',
    '',
    'Copyright © 2005-2020 Rich Felker, et al.',
    '',
    mit.replace('Copyright (c) <year> <copyright holders>\n\n', ''),
    '',
    '===== Apache-2.0 =====',
    '',
    await toolchainLicence(documents, 'Apache-2.0.txt'),
    '',
    '===== LLVM-exception =====',
    '',
    await toolchainLicence(documents, 'LLVM-exception.txt'),
    '',
    '===== Unicode-3.0 =====',
    '',
    await toolchainLicence(documents, 'Unicode-3.0.txt'),
  ];
};

/** The NOTICE: every crate with its licence expression, then the licence and notice texts each crate ships. */
const notice = async (crates: Parameters<typeof crateNotice>[1]): Promise<string> =>
  crateNotice(
    [
      `tau-store-guard: the git store guard for Tau's Linux Terminal (libs/sandbox/store-guard in taucad/tau).`,
      `It is one static executable built from the Rust crates below, each under its own licence.`,
    ],
    crates,
    await toolchainNotice(),
  );

const { test, resources } = parseArguments();
/* The guard is Linux-only code: its checks run wherever `test` runs on Linux (CI's affected lanes), and a macOS or
 * Windows workstation's `nx test sandbox` says why it has none rather than failing on a crate it cannot compile. */
if (test && process.platform !== 'linux') {
  console.log(`The store guard's Rust checks run on Linux; ${process.platform} has no store guard to check.`);
  process.exit(0);
}
if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error(
    `The store guard is built on linux-x64 for linux-x64; this host is ${process.platform}-${process.arch}.`,
  );
}
ensureToolchain(crateRoot, 'the store guard');
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
  const crates = linkedCrates(crateRoot, target);
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await copyFile(built, join(stageRoot, executableName));
  await chmod(join(stageRoot, executableName), 0o755);
  await writeFile(join(stageRoot, 'NOTICE'), await notice(crates));
  await writeFile(
    join(stageRoot, 'manifest.json'),
    payloadManifest({
      version,
      target,
      rust: await pinnedToolchain(crateRoot),
      sha256: createHash('sha256').update(image).digest('hex'),
      bytes: image.byteLength,
      crates,
    }),
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
