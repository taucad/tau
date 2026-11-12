#!/usr/bin/env node
/**
 * Purpose: Build the OpenSCAD language server's WebAssembly module from the Rust crate in `rust/` and stage it,
 *   with a content-identifying manifest, for the UI to serve.
 * Why: The editor runs the server in a module worker. The module is built from pinned inputs: the Rust toolchain in
 *   `rust/rust-toolchain.toml`, the locked crates and the vendored tree-sitter-openscad parser.
 * Environment: Node 24+, rustup (it installs the pinned toolchain on first run), and a C compiler with the wasm32
 *   target for the parser. TAU_WASM_CC names one (with TAU_WASM_AR for its archiver); otherwise the script uses
 *   `clang` and `llvm-ar` when clang supports wasm32 and otherwise the wasi-sdk pinned in wasi-sdk.json, from a
 *   verified archive in out/cache/wasi-sdk or downloaded from its GitHub release (wasi-sdk.mts).
 * Usage: node --import @oxc-node/core/register apps/libs/openscad-language/scripts/prepare-openscad-language-server.mts
 *   [--test | --wasi-sdk-archive]
 *   Writes out/openscad-language/stage/ (assets-manifest.json and the module). --test runs the Rust tests instead;
 *   --wasi-sdk-archive only verifies (or downloads) this host's pinned wasi-sdk archive into out/cache/wasi-sdk.
 * Exit codes: 0 when the stage is rebuilt or the tests pass; non-zero on a missing toolchain, integrity or build
 *   failure.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import process from 'node:process';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the package's # source alias.
import { ensureWasiSdk, ensureWasiSdkArchive, wasiSdkPins } from './wasi-sdk.mjs';
// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the package's # source alias.
import type { WasiSdkPin } from './wasi-sdk.mjs';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const crateRoot = resolve(import.meta.dirname, '../rust');
const outputRoot = resolve(workspaceRoot, 'out/openscad-language');
const cargoTarget = resolve(outputRoot, 'cargo');
const moduleName = 'tau_openscad_language.wasm';
/** The extracted wasi-sdk and its verified archive; CI caches the archive (ci.yml `affected-lane`). */
const wasiSdkCache = resolve(workspaceRoot, 'out/cache/wasi-sdk');
const { TAU_WASM_CC: ccOverride, TAU_WASM_AR: arOverride, CI: ci } = process.env;

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const succeeds = (command: string, args: readonly string[]): string | undefined => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
};

/** This host's pinned wasi-sdk archive. */
const hostWasiSdk = (): WasiSdkPin => {
  const host = `${process.platform}-${process.arch}`;
  const pin = wasiSdkPins.archives[host];
  if (!pin) {
    throw new Error(`No pinned wasi-sdk for ${host}; set TAU_WASM_CC to a clang with the wasm32 target.`);
  }
  return pin;
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
  const root = await ensureWasiSdk({ cacheRoot: wasiSdkCache, pins: wasiSdkPins, pin: hostWasiSdk() });
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
  if (process.argv.includes('--wasi-sdk-archive')) {
    await ensureWasiSdkArchive({ cacheRoot: wasiSdkCache, pins: wasiSdkPins, pin: hostWasiSdk() });
    console.log(`wasi-sdk archive verified in ${relative(workspaceRoot, wasiSdkCache)}`);
    return;
  }
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
