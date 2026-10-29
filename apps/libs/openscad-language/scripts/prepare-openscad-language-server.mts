#!/usr/bin/env node
/**
 * Purpose: Build the OpenSCAD language server's WebAssembly module from the Rust crate in `rust/` and stage it,
 *   with a content-identifying manifest, for the UI to serve.
 * Why: The editor runs the server in a module worker. The module is built from pinned inputs: the Rust toolchain in
 *   `rust/rust-toolchain.toml`, the locked crates and the vendored tree-sitter-openscad parser.
 * Environment: Node 24+, rustup (it installs the pinned toolchain on first run), and a C compiler with the wasm32
 *   target for the parser. TAU_WASM_CC names one (with TAU_WASM_AR for its archiver); otherwise the script uses
 *   `clang` and `llvm-ar` when clang supports wasm32 and downloads a pinned wasi-sdk when it does not.
 * Usage: node --import @oxc-node/core/register apps/libs/openscad-language/scripts/prepare-openscad-language-server.mts
 *   [--test]
 *   Writes out/openscad-language/stage/ (assets-manifest.json and the module). --test runs the Rust tests instead.
 * Exit codes: 0 when the stage is rebuilt or the tests pass; non-zero on a missing toolchain, integrity or build
 *   failure.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const wasiSdkVersion = '27';
const wasiSdks: Readonly<Partial<Record<string, { readonly archive: string; readonly sha256: string }>>> = {
  'linux-x64': {
    archive: `wasi-sdk-${wasiSdkVersion}.0-x86_64-linux.tar.gz`,
    sha256: 'b7d4d944c88503e4f21d84af07ac293e3440b1b6210bfd7fe78e0afd92c23bc2',
  },
  'linux-arm64': {
    archive: `wasi-sdk-${wasiSdkVersion}.0-arm64-linux.tar.gz`,
    sha256: '4cf4c553c4640e63e780442146f87d83fdff5737f988c06a6e3b2f0228e37665',
  },
  'darwin-x64': {
    archive: `wasi-sdk-${wasiSdkVersion}.0-x86_64-macos.tar.gz`,
    sha256: '163dfd47f989b1a682744c1ae1f0e09a83ff5c4bbac9dcd8546909ab54cda5a1',
  },
  'darwin-arm64': {
    archive: `wasi-sdk-${wasiSdkVersion}.0-arm64-macos.tar.gz`,
    sha256: '055c3dc2766772c38e71a05d353e35c322c7b2c6458a36a26a836f9808a550f8',
  },
  'win32-x64': {
    archive: `wasi-sdk-${wasiSdkVersion}.0-x86_64-windows.tar.gz`,
    sha256: '4a576c13125c91996d8cc3b70b7ea0612c2044598d2795c9be100d15f874adf6',
  },
};

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const crateRoot = resolve(import.meta.dirname, '../rust');
const outputRoot = resolve(workspaceRoot, 'out/openscad-language');
const cargoTarget = resolve(outputRoot, 'cargo');
const moduleName = 'tau_openscad_language.wasm';
const { TAU_WASM_CC: ccOverride, TAU_WASM_AR: arOverride, CI: ci } = process.env;

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const succeeds = (command: string, args: readonly string[]): string | undefined => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
};

/** A C compiler and archiver for wasm32-unknown-unknown: the override, a capable system clang, or wasi-sdk. */
const ensureWasmCompiler = async (): Promise<{ cc: string; ar: string }> => {
  if (ccOverride) {
    return { cc: ccOverride, ar: arOverride ?? 'llvm-ar' };
  }
  const targets = succeeds('clang', ['--print-targets']);
  if (targets?.includes('wasm32') && succeeds('llvm-ar', ['--version']) !== undefined) {
    return { cc: 'clang', ar: 'llvm-ar' };
  }
  const host = `${process.platform}-${process.arch}`;
  const sdk = wasiSdks[host];
  if (!sdk) {
    throw new Error(`No pinned wasi-sdk for ${host}; set TAU_WASM_CC to a clang with the wasm32 target.`);
  }
  const cacheRoot = resolve(workspaceRoot, 'out/cache/wasi-sdk');
  const root = resolve(cacheRoot, sdk.archive.replace(/\.tar\.gz$/u, ''));
  const marker = resolve(root, '.tau-wasi-sdk-sha256');
  const recorded = (await exists(marker)) ? await readFile(marker, 'utf8') : undefined;
  if (recorded?.trim() !== sdk.sha256) {
    console.log(`Downloading ${sdk.archive}`);
    const response = await fetch(
      `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${wasiSdkVersion}/${sdk.archive}`,
    );
    if (!response.ok) {
      throw new Error(`wasi-sdk download failed with HTTP ${String(response.status)}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256(bytes) !== sdk.sha256) {
      throw new Error('wasi-sdk integrity mismatch');
    }
    await mkdir(cacheRoot, { recursive: true });
    const archive = resolve(cacheRoot, sdk.archive);
    await writeFile(archive, bytes);
    const temporary = `${root}.${String(process.pid)}.tmp`;
    await rm(temporary, { recursive: true, force: true });
    await mkdir(temporary, { recursive: true });
    execFileSync('tar', ['-xzf', archive, '-C', temporary, '--strip-components=1']);
    await writeFile(resolve(temporary, '.tau-wasi-sdk-sha256'), `${sdk.sha256}\n`);
    await rm(root, { recursive: true, force: true });
    await rename(temporary, root);
    await rm(archive, { force: true });
  }
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return { cc: resolve(root, `bin/clang${suffix}`), ar: resolve(root, `bin/llvm-ar${suffix}`) };
};

const cargo = (args: readonly string[], environment: Readonly<Record<string, string>> = {}): void => {
  // In CI, pin the lockfile: `--locked` is a cargo option, so it goes before any `--` that starts the tool's own options.
  const separator = args.includes('--') ? args.indexOf('--') : args.length;
  const locked = ci === 'true' && args[0] !== 'fmt' ? ['--locked'] : [];
  execFileSync('cargo', [...args.slice(0, separator), ...locked, ...args.slice(separator)], {
    cwd: crateRoot,
    stdio: 'inherit',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
    env: { ...process.env, CARGO_TARGET_DIR: cargoTarget, ...environment },
  });
};

/** Install the toolchain rust-toolchain.toml pins, with its wasm32 target and components; a no-op once present. */
const ensureToolchain = (): void => {
  if (succeeds('rustup', ['--version']) === undefined) {
    throw new Error('rustup is required to build the OpenSCAD language server: https://rustup.rs');
  }
  execFileSync('rustup', ['toolchain', 'install'], { cwd: crateRoot, stdio: 'inherit' });
};

const toolchainVersion = (): string => {
  const manifest = execFileSync('cargo', ['metadata', '--format-version', '1', '--locked'], {
    cwd: crateRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const { packages } = JSON.parse(manifest) as { packages: Array<{ name: string; version: string }> };
  return packages.find((entry) => entry.name === 'tree-sitter')?.version ?? 'unknown';
};

const main = async (): Promise<void> => {
  ensureToolchain();
  if (process.argv.includes('--test')) {
    cargo(['test', '--all-targets']);
    cargo(['clippy', '--all-targets', '--', '-D', 'warnings']);
    cargo(['fmt', '--check']);
    return;
  }
  const compiler = await ensureWasmCompiler();
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables are not camelCase */
  cargo(['build', '--release', '--target', 'wasm32-unknown-unknown'], {
    CC_wasm32_unknown_unknown: compiler.cc,
    AR_wasm32_unknown_unknown: compiler.ar,
  });
  /* eslint-enable @typescript-eslint/naming-convention -- End of the environment names. */
  const toolchainFile = await readFile(resolve(crateRoot, 'rust-toolchain.toml'), 'utf8');
  const vendorReadme = await readFile(resolve(crateRoot, 'vendor/tree-sitter-openscad/README.md'), 'utf8');
  const rust = /channel = "([^"]+)"/u.exec(toolchainFile)?.[1];
  const grammar = /tree-sitter-openscad-ng` (\S+) crate/u.exec(vendorReadme)?.[1];
  const module = new Uint8Array(await readFile(resolve(cargoTarget, 'wasm32-unknown-unknown/release', moduleName)));
  const stage = resolve(outputRoot, 'stage');
  const temporary = `${stage}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  await copyFile(resolve(cargoTarget, 'wasm32-unknown-unknown/release', moduleName), resolve(temporary, moduleName));
  const manifest = {
    format: 'tau-openscad-language-v1',
    toolchain: { rust: rust ?? 'unknown', treeSitter: toolchainVersion(), grammar: grammar ?? 'unknown' },
    module: { path: moduleName, sha256: sha256(module), byteLength: module.length },
  };
  await writeFile(resolve(temporary, 'assets-manifest.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);
  await rm(stage, { recursive: true, force: true });
  await rename(temporary, stage);
  console.log(
    `OpenSCAD language stage: ${String(module.length)} byte module, sha256 ${manifest.module.sha256} at ${relative(workspaceRoot, stage)}`,
  );
};

await main();
