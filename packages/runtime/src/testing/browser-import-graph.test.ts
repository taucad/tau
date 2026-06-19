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
import { describe, expect, it } from 'vitest';

const runtimeRoot = new URL('../', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);
const workspaceRoot = new URL('../../../../', import.meta.url);

const readRuntime = (path: string): string => readFileSync(fileURLToPath(new URL(path, runtimeRoot)), 'utf8');
const readRepo = (path: string): string => readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');

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
    const vmConstantsSource = readRepo('vm/src/constants.ts');

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

  it('marks generated browser module imports as external to bundlers', () => {
    const importerSource = readRepo('vm/src/browser-module-import.ts');

    expect(importerSource).toContain('webpackIgnore: true');
    expect(importerSource).toContain('@vite-ignore');
  });

  it('lets OpenCascade glue modules own built-in OpenCascade WASM asset URLs', () => {
    const opencascadeSource = readRuntime('kernels/opencascade/opencascade.kernel.ts');

    expect(opencascadeSource).not.toContain("new URL('wasm/");
    expect(opencascadeSource).not.toContain('new URL("wasm/');
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
    const htmlPath = join(temporaryRoot, 'index.html');
    const outputDirectory = join(temporaryRoot, 'dist');

    writeFileSync(
      entryPath,
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
        worker: {
          format: 'es',
        },
        build: {
          emptyOutDir: true,
          target: 'esnext',
          assetsInlineLimit: (filePath) => (filePath.endsWith('.wasm') ? false : undefined),
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
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('does not keep legacy runtime sidecar source files in integration source roots', () => {
    const sourceRoots = [
      'packages/runtime/src/',
      'kernels/openscad/src/',
      'packages/telemetry/src/',
      'apps/ui/app/middleware/',
      'apps/ui/app/runtime/',
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
