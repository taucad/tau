/**
 * Prepare the pinned native OpenCascade addon for local tests and packaging.
 *
 * OCCT 8.0.1 is the native parity baseline documented in this package's README.
 * The source checkout and build outputs are reproducible ignored artifacts.
 *
 * Usage: node prepare-native.mjs
 * Exit code: 0 on success; 1 if source verification or a build step fails.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const sourceCommit = 'b8f597c677811d1f9f4d8a97f5ae2825c0353a42';
const sourceUrl = 'https://github.com/Open-Cascade-SAS/OCCT.git';
const packageRoot = import.meta.dirname;
const outputRoot = resolve(packageRoot, '../../../out/artifacts/opencascade-native');
const sourceRoot = resolve(outputRoot, 'source');
const buildRoot = resolve(outputRoot, 'build');
const prefixRoot = resolve(outputRoot, 'prefix');
const cargoTargetRoot = resolve(outputRoot, 'cargo-target');
const addonPath = resolve(packageRoot, 'src/native/opencascade-native.node');

/** @type {(command: string, args: string[], options?: import('node:child_process').ExecFileSyncOptions) => void} */
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

/** @type {(command: string, args: string[]) => string} */
const read = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();

const prepareSource = () => {
  mkdirSync(sourceRoot, { recursive: true });
  if (!existsSync(resolve(sourceRoot, '.git'))) {
    run('git', ['init', '-q', sourceRoot]);
  }
  let head;
  try {
    head = read('git', ['-C', sourceRoot, 'rev-parse', '-q', '--verify', 'HEAD']);
  } catch {
    head = undefined;
  }
  if (head !== sourceCommit) {
    if (read('git', ['-C', sourceRoot, 'status', '--porcelain'])) {
      throw new Error('OCCT source cache has local changes; refusing to replace it.');
    }
    run('git', ['-C', sourceRoot, 'fetch', '--depth', '1', sourceUrl, sourceCommit]);
    run('git', ['-C', sourceRoot, 'checkout', '-q', '--detach', 'FETCH_HEAD']);
  }
  if (
    read('git', ['-C', sourceRoot, 'rev-parse', 'HEAD']) !== sourceCommit ||
    read('git', ['-C', sourceRoot, 'status', '--porcelain'])
  ) {
    throw new Error('OCCT source is not the clean, pinned V8_0_1 commit.');
  }
};

const preparePrefix = () => {
  const cmakeOptions = [
    '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_LIBRARY_TYPE=Static',
    `-DCMAKE_INSTALL_PREFIX=${prefixRoot}`,
    ...(process.platform === 'linux' ? ['-DCMAKE_POSITION_INDEPENDENT_CODE=ON'] : []),
    '-DUSE_FREETYPE=OFF',
    '-DUSE_FREEIMAGE=OFF',
    '-DUSE_OPENVR=OFF',
    '-DUSE_FFMPEG=OFF',
    '-DUSE_TBB=OFF',
    '-DUSE_VTK=OFF',
    '-DUSE_RAPIDJSON=OFF',
    '-DUSE_DRACO=OFF',
    '-DUSE_TK=OFF',
    '-DUSE_TCL=OFF',
    '-DUSE_XLIB=OFF',
    '-DUSE_OPENGL=OFF',
    '-DUSE_GLES2=OFF',
    '-DUSE_EGL=OFF',
    '-DUSE_D3D=OFF',
    '-DBUILD_MODULE_FoundationClasses=ON',
    '-DBUILD_MODULE_ModelingData=ON',
    '-DBUILD_MODULE_ModelingAlgorithms=ON',
    '-DBUILD_MODULE_DataExchange=ON',
    '-DBUILD_MODULE_Visualization=OFF',
    '-DBUILD_MODULE_ApplicationFramework=OFF',
    '-DBUILD_MODULE_Draw=OFF',
    '-DBUILD_DOC_Overview=OFF',
    '-DBUILD_DOC_RefMan=OFF',
    '-DBUILD_YACCLEX=OFF',
    '-DBUILD_RESOURCES=OFF',
    '-DBUILD_Inspector=OFF',
    '-DBUILD_ENABLE_FPE_SIGNAL_HANDLER=OFF',
  ];
  run('cmake', ['-G', 'Ninja', '-S', sourceRoot, '-B', buildRoot, ...cmakeOptions]);
  run('cmake', ['--build', buildRoot, '--parallel', '4']);
  run('cmake', ['--install', buildRoot]);
  const versionHeader = resolve(prefixRoot, 'include/opencascade/Standard_Version.hxx');
  const staticLibrary = process.platform === 'win32' ? 'TKernel.lib' : 'libTKernel.a';
  if (
    !existsSync(versionHeader) ||
    !existsSync(resolve(prefixRoot, 'lib', staticLibrary)) ||
    !/^#define OCC_VERSION_COMPLETE "8\.0\.1"$/mu.test(readFileSync(versionHeader, 'utf8'))
  ) {
    throw new Error('OCCT 8.0.1 static install is incomplete or has the wrong version.');
  }
};

const prepareAddon = () => {
  const environment = { ...process.env, OCCT_ROOT: prefixRoot, CARGO_TARGET_DIR: cargoTargetRoot };
  run('cargo', ['build', '--locked', '--release', '--manifest-path', resolve(packageRoot, 'rust/Cargo.toml')], {
    env: environment,
  });
  const extension = process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
  const library = resolve(
    cargoTargetRoot,
    'release',
    `${process.platform === 'win32' ? '' : 'lib'}taucad_opencascade_native${extension}`,
  );
  if (!existsSync(library)) {
    throw new Error(`Cargo did not produce the native addon: ${library}`);
  }
  mkdirSync(resolve(packageRoot, 'src/native'), { recursive: true });
  const candidatePath = resolve(packageRoot, 'src/native/opencascade-native.candidate.node');
  try {
    copyFileSync(library, candidatePath);
    // Probe in a child so Windows can rename the candidate after its loader releases it.
    run(process.execPath, [
      '--input-type=commonjs',
      '--eval',
      "const version = require(process.argv[1]).version(); if (version.backend !== 'native' || version.occt !== '8.0.1') throw new Error('Unexpected native addon version: ' + JSON.stringify(version));",
      candidatePath,
    ]);
    renameSync(candidatePath, addonPath);
  } finally {
    rmSync(candidatePath, { force: true });
  }
};

try {
  prepareSource();
  preparePrefix();
  prepareAddon();
  process.stdout.write('Prepared OpenCascade native addon against pinned OCCT 8.0.1.\n');
} catch (error) {
  process.stderr.write(`OpenCascade native preparation failed: ${String(error)}\n`);
  process.exitCode = 1;
}
