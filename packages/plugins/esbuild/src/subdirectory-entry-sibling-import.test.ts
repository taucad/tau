/**
 * Regression: an entry file in a subdirectory whose import resolves OUTSIDE
 * that subdirectory must resolve against the filesystem root, not against the
 * entry's own directory.
 *
 * This shape (`/test-exports/assembly.ts` importing `../lib/frame.js` from the
 * sibling `/lib`) broke every GeoSpec model load with
 * `Dependency path escapes the project root: /lib/frame.ts`: the dependency
 * containment root was reverse-derived from the entry file's directory
 * (`/test-exports`), so a sibling-directory import read as an escape. Runtime
 * `/` is the supplied filesystem's root (`docs/policy/runtime-architecture-policy.md`),
 * and `/lib/frame.ts` is inside it.
 *
 * ponytail: in-process only — path resolution is transport-independent
 * (`resolveFileString` is client-side and shared, and the wire carries a plain
 * `{path, filename}` locator), and real worker execution is not hostable in
 * vitest (see `worker/node-bootstrap.integration.test.ts`, skipped: tsx/esm
 * cannot resolve inside spawned `worker_threads`). Worker coverage lives in
 * the `apps/ui-e2e` and `apps/react-e2e` Vitest Browser suites.
 */

import { describe, expect, it } from 'vitest';
import type {
  GeometryResponse,
  GetDependenciesResult,
  GetDependenciesInput,
  KernelRuntime,
} from '@taucad/runtime/types';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineKernel } from '@taucad/runtime/kernel';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';

import { defineRuntime } from '@taucad/runtime/worker';
import { esbuildBundler } from '#esbuild.bundler.js';

const testGeometry = { format: 'gltf', content: new Uint8Array([1]) } satisfies GeometryResponse;

/** Entry sits in `/test-exports`; its dependency sits in the sibling `/lib`. */
const files = {
  '/test-exports/assembly.ts': [
    "import { frame } from '../lib/frame.js';",
    'export default function main() {',
    '  return frame();',
    '}',
  ].join('\n'),
  '/lib/frame.ts': 'export function frame() {\n  return 1;\n}',
};

describe('subdirectory entry importing a sibling directory', () => {
  it('resolves the sibling-directory dependency against the filesystem root', async () => {
    let dependencies: GetDependenciesResult | undefined;

    const siblingProbe = defineKernel({
      id: 'sibling-probe',
      extensions: ['ts'],
      name: 'Sibling import probe',
      version: '1.0.0',
      exportFormats: {},
      initialize: async () => ({}),
      // The real bundler resolution path — the one the regression broke.
      getDependencies: async (input: GetDependenciesInput, runtime: KernelRuntime) => {
        dependencies = await runtime.bundler.resolveDependencies(input.entryPath);
        return dependencies;
      },
      getParameters: async () => ({
        success: true,
        data: { defaultParameters: {}, jsonSchema: {} },
        issues: [],
      }),
      createGeometry: async () => ({ geometry: testGeometry, nativeHandle: {} }),
      exportGeometry: async () => ({ success: true, data: [], issues: [] }),
    });

    const runtime = defineRuntime({
      kernels: [siblingProbe()],
      bundlers: [esbuildBundler()],
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(files) }),
    });
    const errors: unknown[] = [];
    const stopErrors = client.on('error', (issues) => errors.push(issues));

    try {
      await client.connect();
      const rendered = await client.render({ source: { path: 'test-exports/assembly.ts' }, parameters: {} });

      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        return;
      }
      expect(rendered.geometry.success).toBe(true);
      expect(errors).toEqual([]);
      // The sibling file is outside the entry's own directory but inside runtime `/`.
      expect(dependencies?.resolved).toContain('/lib/frame.ts');
      expect(dependencies?.unresolved ?? []).toEqual([]);
    } finally {
      stopErrors();
      client.terminate();
    }
  });
});
