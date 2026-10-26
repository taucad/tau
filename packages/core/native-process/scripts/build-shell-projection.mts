#!/usr/bin/env node
/**
 * Build the private Linux projection bridge from explicitly verified local dependencies.
 * Required arguments: --node-headers, --fuse-headers, --fuse-library, --fuse-sha256.
 * Optional argument: --compiler (default cc). No network or dependency installation occurs.
 * Usage: node scripts/build-shell-projection.mts --node-headers <include/node> --fuse-headers <include/fuse3>
 *        --fuse-library <libfuse3.so.4> --fuse-sha256 <sha256>
 * Exit: 0 built; 1 invalid input/build failure. Outputs are unqualified until native/package gates pass.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// SHA256 of the exact blobs at libfuse tag fuse-3.17.2 (commit db2a1652f0351162a4f39d9f15f1e8ff036f7a6a).
const headerDigests = {
  'fuse_lowlevel.h': 'bf24bf529be38f6024126ea9787d2155baf2029f1ccee2bbfcf2a85ff3d6cff6',
  'fuse_common.h': 'e87b240a3bd1c6e0a4e6f76b511748f479511aadf437c6dce69a8af43a84789a',
  'fuse_opt.h': '472c9ee7a84bb9c20e58957a3ff47f34c18b4a159ad63b4db7f90aad1e8ff4ce',
  'fuse_log.h': 'e475189634542134d6500a663a2bab2f1f577cd27c431725d522530f8154f2c7',
};
const digest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const main = (): void => {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('This projection bridge build currently requires Linux x64.');
  }
  const values = new Map<string, string>();
  const arguments_ = process.argv.slice(2);
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (
      name === undefined ||
      !['--node-headers', '--fuse-headers', '--fuse-library', '--fuse-sha256', '--compiler'].includes(name) ||
      !value ||
      values.has(name)
    ) {
      throw new Error(`Invalid or duplicate build argument: ${name}`);
    }
    values.set(name, value);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) {
      throw new Error(`Missing ${name}`);
    }
    return value;
  };
  const nodeHeaders = required('--node-headers');
  const fuseHeaders = required('--fuse-headers');
  const library = required('--fuse-library');
  const libraryDigest = required('--fuse-sha256');
  if (
    ![nodeHeaders, fuseHeaders, library].every((path) => isAbsolute(path)) ||
    !/^[a-f0-9]{64}$/u.test(libraryDigest)
  ) {
    throw new Error('Dependency paths must be absolute and the library SHA256 must be explicit.');
  }
  if (digest(library) !== libraryDigest) {
    throw new Error('The libfuse library does not match its supplied SHA256.');
  }
  for (const [name, expected] of Object.entries(headerDigests)) {
    if (digest(join(fuseHeaders, name)) !== expected) {
      throw new Error(`Header does not match pinned libfuse 3.17.2: ${name}`);
    }
  }
  const publicConfig = readFileSync(join(fuseHeaders, 'libfuse_config.h'), 'utf8');
  for (const [name, value] of [
    ['FUSE_MAJOR_VERSION', 3],
    ['FUSE_MINOR_VERSION', 17],
    ['FUSE_HOTFIX_VERSION', 2],
  ] as const) {
    if (!new RegExp(`^#define ${name} ${value}$`, 'mu').test(publicConfig)) {
      throw new Error(`Unexpected libfuse configuration: ${name}`);
    }
  }
  readFileSync(join(nodeHeaders, 'node_api.h'));
  const output = join(packageRoot, 'dist/native/linux-x64');
  mkdirSync(output, { recursive: true });
  const source = join(packageRoot, 'native/shell-projection-fuse.c');
  const binary = join(output, 'shell-projection.node');
  const compiler = values.get('--compiler') ?? 'cc';
  execFileSync(
    compiler,
    [
      '-std=c11',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-Wno-misleading-indentation',
      '-shared',
      '-fPIC',
      '-pthread',
      '-ldl',
      '-I',
      nodeHeaders,
      '-I',
      fuseHeaders,
      source,
      library,
      '-Wl,-rpath,$ORIGIN',
      '-o',
      binary,
    ],
    { stdio: 'inherit' },
  );
  copyFileSync(library, join(output, 'libfuse3.so.4'));
  writeFileSync(
    join(output, 'provenance.json'),
    `${JSON.stringify(
      {
        source: digest(source),
        binary: digest(binary),
        library: libraryDigest,
        headers: headerDigests,
        abi: 'linux-x64-napi8-fuse35',
        libfuse: '3.17.2',
        commit: 'db2a1652f0351162a4f39d9f15f1e8ff036f7a6a',
        node: process.version,
        compiler: execFileSync(compiler, ['--version'], { encoding: 'utf8' }).split('\n')[0],
        qualified: false,
        license: 'Dynamically linked libfuse; preserve upstream LGPL notices/source before distribution.',
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`Built private projection bridge: ${binary}\n`);
};
try {
  main();
} catch (error) {
  console.error('Projection bridge build failed:', error);
  process.exit(1);
}
