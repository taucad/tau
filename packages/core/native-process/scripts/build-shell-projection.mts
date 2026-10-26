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
const headerDigests = {
  'fuse_lowlevel.h': 'b7d139eae74cfefaf96bbdbeb9f96d1ee7042d5f098559189b59da77bd26e4fd',
  'fuse_common.h': '2ad72c676253037b866cfa3bfaba04de068f7e0d97d433afa4dd4e456666d2fc',
  'fuse_opt.h': '362b28e17d69bc5c0c5f99be6e9685c58ec46dd5de6a4342e6d514172d530bf3',
  'fuse_log.h': '8f5e2f48053727145fa697a7a1133110157e4c4bf9ea910ba9ae575ef76db89c',
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
    if (name === undefined || !['--node-headers', '--fuse-headers', '--fuse-library', '--fuse-sha256', '--compiler'].includes(name) || !value || values.has(name)) {
      throw new Error(`Invalid or duplicate build argument: ${name}`);
    }
    values.set(name, value);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  const nodeHeaders = required('--node-headers');
  const fuseHeaders = required('--fuse-headers');
  const library = required('--fuse-library');
  const libraryDigest = required('--fuse-sha256');
  if (![nodeHeaders, fuseHeaders, library].every(isAbsolute) || !/^[a-f0-9]{64}$/u.test(libraryDigest)) {
    throw new Error('Dependency paths must be absolute and the library SHA256 must be explicit.');
  }
  if (digest(library) !== libraryDigest) throw new Error('The libfuse library does not match its supplied SHA256.');
  for (const [name, expected] of Object.entries(headerDigests)) {
    if (digest(join(fuseHeaders, name)) !== expected) throw new Error(`Header does not match pinned libfuse 3.17.2: ${name}`);
  }
  const publicConfig = readFileSync(join(fuseHeaders, 'libfuse_config.h'), 'utf8');
  for (const [name, value] of [['FUSE_MAJOR_VERSION', 3], ['FUSE_MINOR_VERSION', 17], ['FUSE_HOTFIX_VERSION', 2]] as const) {
    if (!new RegExp(`^#define ${name} ${value}$`, 'mu').test(publicConfig)) throw new Error(`Unexpected libfuse configuration: ${name}`);
  }
  readFileSync(join(nodeHeaders, 'node_api.h'));
  const output = join(packageRoot, 'dist/native/linux-x64');
  mkdirSync(output, { recursive: true });
  const source = join(packageRoot, 'native/shell-projection-fuse.c');
  const binary = join(output, 'shell-projection.node');
  const compiler = values.get('--compiler') ?? 'cc';
  execFileSync(compiler, ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation', '-shared', '-fPIC', '-pthread', '-ldl',
    '-I', nodeHeaders, '-I', fuseHeaders, source, library, '-Wl,-rpath,$ORIGIN', '-o', binary], { stdio: 'inherit' });
  copyFileSync(library, join(output, 'libfuse3.so.4'));
  writeFileSync(join(output, 'provenance.json'), `${JSON.stringify({
    source: digest(source), binary: digest(binary), library: libraryDigest, headers: headerDigests,
    abi: 'linux-x64-napi8-fuse35', libfuse: '3.17.2', commit: 'db2a1652f0351162a4f39d9f15f1e8ff036f7a6a', node: process.version,
    compiler: execFileSync(compiler, ['--version'], { encoding: 'utf8' }).split('\n')[0],
    qualified: false, license: 'Dynamically linked libfuse; preserve upstream LGPL notices/source before distribution.',
  }, null, 2)}\n`);
  process.stdout.write(`Built private projection bridge: ${binary}\n`);
};
try { main(); } catch (error) { console.error('Projection bridge build failed:', error); process.exit(1); }
