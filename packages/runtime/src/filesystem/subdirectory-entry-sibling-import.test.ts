/* eslint-disable @typescript-eslint/naming-convention -- file-system path keys are not camelCase identifiers. */
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
 * `apps/ui-e2e` / `examples/electron` Playwright.
 */

import { describe, expect, it } from 'vitest';
import type { GeometryResponse } from '@taucad/types';
import { esbuild } from '#bundler/esbuild.bundler.js';
import { createRuntimeClient } from '#client/runtime-client.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { GetDependenciesInput, KernelRuntime } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

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

    const definition = {
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
    };

    const runtime = defineRuntime({
      kernels: [attachRuntimePluginDefinition({ id: 'sibling-probe', extensions: ['ts'] }, () => definition)],
      bundlers: [esbuild()],
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
