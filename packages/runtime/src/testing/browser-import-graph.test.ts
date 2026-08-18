import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { tauRuntime } from '#vite/index.js';
import { describe, expect, it } from 'vitest';

const runtimeRoot = new URL('../', import.meta.url);
const workspaceRoot = new URL('../../../../', import.meta.url);

const readRuntime = (path: string): string => readFileSync(fileURLToPath(new URL(path, runtimeRoot)), 'utf8');
const readWorkspace = (path: string): string => readFileSync(fileURLToPath(new URL(path, workspaceRoot)), 'utf8');

const collectRuntimeSourceFiles = (directoryUrl: URL): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(directoryUrl)) {
    const entryUrl = new URL(entry, directoryUrl);
    const entryPath = fileURLToPath(entryUrl);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      files.push(...collectRuntimeSourceFiles(new URL(`${entry}/`, directoryUrl)));
      continue;
    }

    files.push(fileURLToPath(new URL(entry, directoryUrl)));
  }

  return files;
};

describe('runtime browser import graph guards', () => {
  it('keeps runtime esbuild constants on the VM constants-only subpath', () => {
    const constantsSource = readRuntime('bundler/esbuild.constants.ts');
    const vmConstantsSource = readWorkspace('libs/vm/src/constants.ts');

    expect(constantsSource).toContain("from '@taucad/vm/constants'");
    expect(constantsSource).not.toContain("from '@taucad/vm/internal'");
    expect(vmConstantsSource).toContain("from '#esbuild.constants.js'");
    expect(vmConstantsSource).not.toContain('#esbuild-core.js');
  });

  it('keeps Next and browser client entries free of host-owned runtime imports', () => {
    const clientSource = readRuntime('client/index.ts');
    const nextSource = readRuntime('nextjs/index.ts');
    const legacyRuntimeModulePrefix = ['tau-runtime-', 'module:'].join('');

    for (const source of [clientSource, nextSource]) {
      expect(source).not.toContain("from '#transport/in-process");
      expect(source).not.toContain("from '#plugins/presets");
      expect(source).not.toContain("from '#framework/kernel-runtime-worker");
      expect(source).not.toContain(legacyRuntimeModulePrefix);
      expect(source).not.toContain('static-plugins');
    }
  });

  it('keeps the Electron renderer transport free of utility-host imports', () => {
    const transportSource = readRuntime('electron/electron-utility-transport.ts');
    const rendererSource = readRuntime('electron/renderer.ts');

    expect(transportSource).not.toContain('electron-utility-host');
    expect(transportSource).not.toContain('hostOptionsSchema');
    expect(rendererSource).not.toContain('worker-internals');
    expect(rendererSource).not.toContain('KernelRuntimeWorker');
    expect(rendererSource).not.toContain('esbuild-core');
  });

  it('should exclude utility-host and esbuild code from an Electron renderer build', async () => {
    const temporaryParent = join(fileURLToPath(workspaceRoot), 'tmp');
    mkdirSync(temporaryParent, { recursive: true });
    const temporaryRoot = mkdtempSync(join(temporaryParent, 'runtime-electron-renderer-vite-'));
    const entryPath = join(temporaryRoot, 'entry.ts');
    const htmlPath = join(temporaryRoot, 'index.html');
    const outputDirectory = join(temporaryRoot, 'dist');

    writeFileSync(
      entryPath,
      [
        "import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';",
        'void createElectronClientOptions;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      htmlPath,
      '<!doctype html><html><body><script type="module" src="/entry.ts"></script></body></html>',
      'utf8',
    );

    try {
      await build({
        configFile: false,
        logLevel: 'silent',
        root: temporaryRoot,
        build: {
          emptyOutDir: true,
          minify: false,
          outDir: outputDirectory,
        },
      });

      const emittedFiles = collectRuntimeSourceFiles(pathToFileURL(`${outputDirectory}/`));
      const javascript = emittedFiles
        .filter((path) => path.endsWith('.js'))
        .map((path) => readFileSync(path, 'utf8'))
        .join('\n');

      expect(emittedFiles.some((path) => path.endsWith('esbuild.wasm'))).toBe(false);
      expect(javascript).not.toContain('KernelRuntimeWorker');
      expect(javascript).not.toContain('electronUtilityHost');
      expect(javascript).not.toContain('esbuild-core');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('marks generated browser module imports as external to bundlers', () => {
    const importerSource = readWorkspace('libs/vm/src/browser-module-import.ts');

    expect(importerSource).toContain('webpackIgnore: true');
    expect(importerSource).toContain('@vite-ignore');
  });

  it('keeps both built-in OpenCascade WASM assets visible to browser bundlers', () => {
    const opencascadeSource = readRuntime('kernels/opencascade/opencascade.kernel.ts');

    expect(opencascadeSource).toContain("import('libcascade/single/init')");
    expect(opencascadeSource).toContain("import('libcascade/multi/init')");
    expect(opencascadeSource).toContain(
      "const fullWasmUrl = new URL('wasm/opencascade_full.wasm', import.meta.url).href;",
    );
    expect(opencascadeSource).toContain(
      "const multiWasmUrl = new URL('wasm/opencascade_full_multi.wasm', import.meta.url).href;",
    );
  });

  it('keeps Replicad built-in multi WASM loader visible to browser bundlers', () => {
    const replicadSource = readRuntime('kernels/replicad/replicad.kernel.ts');
    const multiBranchStart = replicadSource.indexOf("if (variant === 'multi')");
    const singleBranchStart = replicadSource.indexOf(
      'bindingsFactory: await loadReplicadSingleWasm()',
      multiBranchStart,
    );
    const multiBranch = replicadSource.slice(multiBranchStart, singleBranchStart);

    expect(replicadSource).toContain(
      "import { loadReplicadMultiWasm } from '#kernels/replicad/replicad-wasm-multi-loader.js';",
    );
    expect(replicadSource).toContain(
      "const replicadMultiWasmUrl = new URL('wasm/replicad_multi.wasm', import.meta.url).href;",
    );
    expect(multiBranch).toContain('bindingsFactory: await loadReplicadMultiWasm()');
    expect(multiBranch).toContain('wasmUrl: replicadMultiWasmUrl');
    expect(multiBranch).not.toContain('@vite-ignore');
    expect(multiBranch).not.toContain('webpackIgnore');
  });

  it('emits Replicad multi-threaded WASM assets from a Vite browser build', async () => {
    const temporaryParent = join(fileURLToPath(workspaceRoot), 'tmp');
    mkdirSync(temporaryParent, { recursive: true });
    const temporaryRoot = mkdtempSync(join(temporaryParent, 'runtime-replicad-vite-'));
    const entryPath = join(temporaryRoot, 'entry.ts');
    const workerPath = join(temporaryRoot, 'runtime.worker.ts');
    const htmlPath = join(temporaryRoot, 'index.html');
    const outputDirectory = join(temporaryRoot, 'dist');

    writeFileSync(
      entryPath,
      "new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' });",
      'utf8',
    );
    writeFileSync(
      workerPath,
      [
        "import { replicad } from '@taucad/runtime/kernels/replicad';",
        "import { defineRuntime } from '@taucad/runtime/worker';",
        "export const runtime = defineRuntime({ kernels: [replicad({ wasm: 'multi' })] });",
        'void runtime;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      htmlPath,
      '<!doctype html><html><body><script type="module" src="/entry.ts"></script></body></html>',
      'utf8',
    );

    try {
      await build({
        configFile: false,
        logLevel: 'silent',
        root: temporaryRoot,
        plugins: tauRuntime({ crossOriginIsolation: false }),
        build: {
          emptyOutDir: true,
          target: 'esnext',
          outDir: outputDirectory,
          rollupOptions: {
            output: {
              assetFileNames: 'assets/[name]-[hash][extname]',
              chunkFileNames: 'assets/[name]-[hash].js',
            },
          },
        },
      });

      const emittedFiles = collectRuntimeSourceFiles(pathToFileURL(`${outputDirectory}/`)).map((path) =>
        path.slice(outputDirectory.length + 1),
      );

      expect(emittedFiles.some((path) => /(?:^|\/)replicad_multi-[^.]+\.js$/.test(path))).toBe(true);
      expect(emittedFiles.some((path) => /(?:^|\/)replicad_multi-[^.]+\.wasm$/.test(path))).toBe(true);
      expect(emittedFiles.some((path) => path.includes('replicad-wasm-multi-loader'))).toBe(false);
      expect(emittedFiles.some((path) => path.includes('__vite-browser-external'))).toBe(false);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('does not keep legacy runtime sidecar source files in integration source roots', () => {
    const sourceRoots = [
      'packages/runtime/src/',
      'packages/kernels/openrscad/src/',
      'examples/electron/src/',
      'examples/nextjs/app/',
      'examples/nextjs/runtime/',
      'examples/react-router/app/',
      'examples/react-router/runtime/',
    ];
    const workspacePath = fileURLToPath(workspaceRoot);
    const legacySidecars = sourceRoots
      .flatMap((path) => {
        const rootUrl = new URL(path, workspaceRoot);

        return existsSync(fileURLToPath(rootUrl)) ? collectRuntimeSourceFiles(rootUrl) : [];
      })
      .map((path) => path.slice(workspacePath.length + 1))
      .filter((path) =>
        /(?:^|\/)[^/]+\.(?:kernel|middleware|bundler|transcoder)\.js$|(?:^|\/)[^/]+\.(?:module|plugin)\.ts$/.test(path),
      );

    expect(legacySidecars).toEqual([]);
  });
});
