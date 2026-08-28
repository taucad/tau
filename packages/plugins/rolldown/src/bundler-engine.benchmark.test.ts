/* oxlint-disable eslint/no-await-in-loop -- benchmark samples and engine arms are intentionally sequential */

import { commands } from 'vitest/browser';
import { expect, it } from 'vitest';

import { createEsbuildModuleVm } from '@taucad/esbuild/vm';
import { createKernelModuleShim } from '@taucad/runtime/kernel';
import type { BundlerConformanceFileSystem, BundlerConformanceVm } from '@taucad/runtime-testing';
import * as replicad from 'replicad';

import { createRolldownModuleVm } from '#rolldown-module-vm.js';

declare const tauBundlerReportPath: string;

const fixtureModules = import.meta.glob(
  '../../../../libs/tau-examples/src/kernels/replicad/{birdhouse,bundler-feature-matrix}/**/*.{ts,tsx,js,jsx,json,svg,txt,bin}',
  { eager: true, import: 'default', query: '?raw' },
) as Readonly<Record<string, string>>;

const createFileSystem = (
  initial: Readonly<Record<string, string>>,
): BundlerConformanceFileSystem & {
  set(path: string, source: string): void;
} => {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const value = files.get(path);
    if (value === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? value : encoder.encode(value);
  }
  const filesystem: BundlerConformanceFileSystem & { set(path: string, source: string): void } = {
    exists: async (path) => files.has(path),
    readFile,
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    ensureDir: async () => undefined,
    set: (path, source) => files.set(path, source),
  };
  return filesystem;
};

const fixture = (name: 'birdhouse' | 'bundler-feature-matrix', entry: string) => {
  const marker = `/replicad/${name}/`;
  const files = Object.fromEntries(
    Object.entries(fixtureModules)
      .filter(([path]) => path.includes(marker))
      .map(([path, source]) => [`/${path.slice(path.indexOf(marker) + marker.length)}`, source]),
  );
  return { files, entry: `/${entry}` };
};

const measure = async <T>(operation: () => Promise<T> | T): Promise<{ ms: number; value: T }> => {
  const started = performance.now();
  const value = await operation();
  return { ms: performance.now() - started, value };
};

const stats = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    minimum: sorted[0],
    median: sorted[Math.ceil(sorted.length / 2) - 1],
    mean,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maximum: sorted.at(-1),
    standardDeviation: Math.sqrt(variance),
    coefficientOfVariation: Math.sqrt(variance) / mean,
  };
};

const runArm = async (
  arm: 'esbuild-wasm' | 'rolldown-browser',
  input: ReturnType<typeof fixture>,
): Promise<{ initialize: number; rows: Array<Record<'detect' | 'bundle' | 'execute' | 'lifecycle', number>> }> => {
  const filesystem = createFileSystem(input.files);
  const source = input.files[input.entry];
  if (source === undefined) {
    throw new Error(`Missing benchmark entry ${input.entry}`);
  }
  const create = async (): Promise<BundlerConformanceVm> =>
    arm === 'esbuild-wasm'
      ? createEsbuildModuleVm({
          filesystem,
          autoExportNames: ['main', 'defaultParams', 'getParameterDefinitions'],
          sourceMaps: true,
        })
      : createRolldownModuleVm({
          filesystem,
          autoExportNames: ['main', 'defaultParams', 'getParameterDefinitions'],
        });
  const initialized = await measure(create);
  const vm = initialized.value;
  vm.registerModule('replicad', {
    code: createKernelModuleShim({ moduleExpression: 'globalThis.__BENCHMARK_REPLICAD__', exports: replicad }),
    version: 'benchmark',
  });
  vm.registerModule('@taucad/replicad/annotations', {
    code: [
      "export const face = (select) => ({ kind: 'face', select });",
      "export const axis = (select) => ({ kind: 'axis', select });",
      "export const frame = (value) => ({ kind: 'frame', ...value });",
      'export const datum = frame;',
      "export const group = (members) => ({ kind: 'group', members });",
    ].join('\n'),
    version: 'benchmark',
  });
  const rows: Array<Record<'detect' | 'bundle' | 'execute' | 'lifecycle', number>> = [];
  try {
    for (let index = 0; index < 35; index++) {
      filesystem.set(input.entry, `${source}\nexport const __benchmarkVariant = ${index};\n`);
      const detected = await measure(async () => vm.detectImports(input.entry, AbortSignal.timeout(60_000)));
      const bundled = await measure(async () => vm.bundle(input.entry, AbortSignal.timeout(60_000)));
      if (!bundled.value.success) {
        throw new Error(bundled.value.issues.map(({ message }) => message).join('; '));
      }
      const executed = await measure(async () => vm.execute(bundled.value.code, AbortSignal.timeout(60_000)));
      if (!executed.value.success) {
        throw new Error('Bundled module execution failed.');
      }
      if (index >= 5) {
        rows.push({
          detect: detected.ms,
          bundle: bundled.ms,
          execute: executed.ms,
          lifecycle: detected.ms + bundled.ms + executed.ms,
        });
      }
    }
  } finally {
    vm.dispose();
  }
  return { initialize: initialized.ms, rows };
};

it('records the isolated-browser compiler comparison', async () => {
  expect(globalThis.crossOriginIsolated).toBe(true);
  (globalThis as typeof globalThis & { __BENCHMARK_REPLICAD__: typeof replicad }).__BENCHMARK_REPLICAD__ = replicad;
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    environment: { userAgent: navigator.userAgent, crossOriginIsolated: globalThis.crossOriginIsolated },
    protocol: { iterations: 30, warmups: 5 },
  };
  for (const [name, input] of [
    ['birdhouse', fixture('birdhouse', 'main.ts')],
    ['feature-matrix', fixture('bundler-feature-matrix', 'main.ts')],
  ] as const) {
    const arms = {
      'esbuild-wasm': await runArm('esbuild-wasm', input),
      'rolldown-browser': await runArm('rolldown-browser', input),
    };
    report[name] = Object.fromEntries(
      Object.entries(arms).map(([arm, result]) => [
        arm,
        {
          initialize: result.initialize,
          detect: stats(result.rows.map(({ detect }) => detect)),
          bundle: stats(result.rows.map(({ bundle }) => bundle)),
          execute: stats(result.rows.map(({ execute }) => execute)),
          lifecycle: stats(result.rows.map(({ lifecycle }) => lifecycle)),
          raw: result.rows,
        },
      ]),
    );
  }
  await commands.writeFile(tauBundlerReportPath, `${JSON.stringify(report, undefined, 2)}\n`);
});

/* oxlint-enable eslint/no-await-in-loop -- end sequential benchmark */
/// <reference types="vite/client" />
