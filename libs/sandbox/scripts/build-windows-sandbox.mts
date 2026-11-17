#!/usr/bin/env node

/**
 * Purpose: Build the Windows shell sandbox helper (`libs/sandbox/windows-sandbox`) as `tau-windows-sandbox.exe` and
 *   stage it with its NOTICE and manifest under `out/windows-sandbox/win32-x64`.
 * Why: The helper ships beside the Windows desktop app (`resources/windows-sandbox/win32-x64`), where the services host
 *   runs it for the sandboxed shell and Terminal and, once, elevated for its setup (desktop Bash/Terminal blueprint D15,
 *   Q15). It is built from pinned inputs (the toolchain in `rust-toolchain.toml`, the locked crates) with the C runtime
 *   linked statically (`.cargo/config.toml`), and refused unless it is an x64 console executable that imports no Visual
 *   C++ runtime DLL and answers `status`. The Windows signing step (`apps/desktop/scripts/package-windows.mts`) signs
 *   it with the rest of the app's PE files.
 * Environment: Node 24+, Windows x64, rustup (it installs the pinned toolchain and the MSVC target on first run) and the
 *   MSVC build tools.
 * Usage: node --import @oxc-node/core/register libs/sandbox/scripts/build-windows-sandbox.mts [--resources <dir>]
 *   `--resources <dir>` also copies the staged helper into `<dir>` (the desktop's
 *   `resources/windows-sandbox/win32-x64`).
 * Exit codes: 0 when the helper is staged; non-zero on another host, a missing toolchain, a build failure, or a helper
 *   that is not a static-CRT x64 console executable or does not answer `status`.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { z } from 'zod';

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
import { windowsExecutableProblem } from './windows-executable.mjs';
/* oxlint-enable no-restricted-imports -- End operational script import exception. */

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const crateRoot = resolve(workspaceRoot, 'libs/sandbox/windows-sandbox');
/* Cargo's own build tree stays in the crate (its `target`, ignored): `sandbox:build:windows-sandbox`, the WIN-X64
 * conformance row and source execution of the services host all read the release build there. */
const cargoTarget = resolve(crateRoot, 'target');
const stageRoot = resolve(workspaceRoot, 'out/windows-sandbox/win32-x64');
const target = 'x86_64-pc-windows-msvc';
const executableName = 'tau-windows-sandbox.exe';
const stagedFiles = [executableName, 'NOTICE', 'manifest.json'] as const;

const usage = 'Usage: build-windows-sandbox.mts [--resources <dir>]';

const parseArguments = (): Readonly<{ resources: string | undefined }> => {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length === 0) {
    return { resources: undefined };
  }
  const [flag, value] = arguments_;
  if (arguments_.length !== 2 || flag !== '--resources') {
    throw new TypeError(usage);
  }
  return { resources: resolve(value) };
};

/**
 * What the executable links from the toolchain itself: the Rust standard library (`std`, `core`, `alloc`, with the
 * notices the toolchain ships for it) and, statically, the Microsoft C runtime.
 */
const toolchainNotice = async (): Promise<string[]> => {
  const documents = toolchainDocuments(crateRoot);
  return [
    '',
    '===== Toolchain components linked into the executable =====',
    '',
    '- Rust standard library (std, core, alloc): Apache-2.0 OR MIT, with the exceptions listed below.',
    '- Microsoft C runtime (libcmt, libvcruntime, libucrt), linked statically from the MSVC build tools for',
    '  x86_64-pc-windows-msvc: distributable code under the Microsoft Software License Terms for those tools.',
    '',
    '===== Rust standard library: COPYRIGHT-library =====',
    '',
    await rustLibraryCopyright(documents),
    '',
    '===== MIT =====',
    '',
    await toolchainLicence(documents, 'MIT.txt'),
    '',
    '===== Apache-2.0 =====',
    '',
    await toolchainLicence(documents, 'Apache-2.0.txt'),
    '',
    '===== Unicode-3.0 =====',
    '',
    await toolchainLicence(documents, 'Unicode-3.0.txt'),
  ];
};

/** The crate's own version, from the locked metadata: the helper has no `--version`. */
const crateVersion = (): string => {
  const metadata = z
    .object({
      packages: z.array(z.object({ name: z.string(), version: z.string() })),
    })
    .parse(
      JSON.parse(
        execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps', '--locked'], {
          cwd: crateRoot,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
        }),
      ),
    );
  const root = metadata.packages.find((entry) => entry.name === 'tau-windows-sandbox');
  if (root === undefined) {
    throw new Error(`${crateRoot} is not the tau-windows-sandbox crate.`);
  }
  return `tau-windows-sandbox ${root.version}`;
};

/**
 * Run the built helper's `status`, which never elevates and always answers JSON: proof that it starts on this machine,
 * its C runtime included.
 */
const statusAnswers = (helper: string): void => {
  const printed = execFileSync(helper, ['status'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  const record: unknown = JSON.parse(printed);
  if (typeof record !== 'object' || record === null || typeof Reflect.get(record, 'installed') !== 'boolean') {
    throw new Error(`${helper} status did not answer an install record: ${printed.slice(0, 200)}`);
  }
};

const { resources } = parseArguments();
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(
    `The Windows sandbox helper is built on win32-x64 for win32-x64; this host is ${process.platform}-${process.arch}. ` +
      `Elsewhere, check it with \`cargo check --target ${target}\` in ${crateRoot}.`,
  );
}
ensureToolchain(crateRoot, 'the Windows sandbox helper');
/* The helper, and the conformance row's stand-in native worker (never staged). */
execFileSync(
  'cargo',
  ['build', '--release', '--locked', '--target', target, '--bins', '--example', 'tau-worker-probe'],
  {
    cwd: crateRoot,
    stdio: 'inherit',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
    env: { ...process.env, CARGO_TARGET_DIR: cargoTarget },
  },
);
const built = resolve(cargoTarget, target, 'release', executableName);
const image = new Uint8Array(await readFile(built));
const problem = windowsExecutableProblem(image);
if (problem !== undefined) {
  throw new Error(`${built} is ${problem}; the helper must be a static-CRT x64 console executable.`);
}
statusAnswers(built);
const version = crateVersion();
const crates = linkedCrates(crateRoot, target);
await rm(stageRoot, { recursive: true, force: true });
await mkdir(stageRoot, { recursive: true });
await copyFile(built, join(stageRoot, executableName));
await writeFile(
  join(stageRoot, 'NOTICE'),
  await crateNotice(
    [
      `tau-windows-sandbox: the shell sandbox helper for Tau's Windows desktop app (libs/sandbox/windows-sandbox in taucad/tau).`,
      `It is one executable built from the Rust crates below, each under its own licence.`,
    ],
    crates,
    await toolchainNotice(),
  ),
);
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
  for (const name of stagedFiles) {
    // oxlint-disable-next-line no-await-in-loop -- three files.
    await copyFile(join(stageRoot, name), join(resources, name));
  }
  console.log(`Copied into ${resources}`);
}
