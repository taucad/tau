// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest';
import type * as OcctCore from '@taucad/occt-core';
import type { ExportResult } from '@taucad/runtime';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { opencascadeKernel } from '#opencascade.kernel.js';

/** An export budget a radius-5 sphere exceeds at `high` and fits at a coarse explicit tolerance. */
const { exportBudget } = vi.hoisted(() => ({ exportBudget: 1000 }));

vi.mock('@taucad/occt-core', async (importOriginal) => {
  const actual = await importOriginal<typeof OcctCore>();
  return { ...actual, occtTriangleBudgets: { ...actual.occtTriangleBudgets, export: exportBudget } };
});

const sphere = `import { BRepPrimAPI_MakeSphere } from 'libcascade';
export default function main() { return new BRepPrimAPI_MakeSphere(5).Shape(); }`;

const clients: Array<{ shutdown: () => Promise<void> }> = [];

const exportModel = async (format: 'stl' | 'glb', options: Record<string, unknown>): Promise<ExportResult> => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [opencascadeKernel()], bundlers: [esbuildBundler()] }),
    files: { 'main.ts': sphere },
  });
  clients.push(client);
  return client.open({ source: { path: 'main.ts' }, parameters: {} }).export(format, { options });
};

afterAll(async () => {
  await Promise.all(clients.map(async (client) => client.shutdown()));
});

// Each case opens its own client, which initialises OpenCASCADE.
describe('OpenCascade export budget (P4)', { timeout: 60_000 }, () => {
  it.each(['stl', 'glb'] as const)('refuses an over-budget %s export with a suggested tessellation', async (format) => {
    const exported = await exportModel(format, {});
    expect(exported.success).toBe(false);
    if (exported.success) {
      return;
    }
    // The kernel throws a `RESOURCE_LIMIT` issue; the runtime's export boundary keeps only its message.
    const [issue] = exported.issues;
    expect(issue).toMatchObject({ severity: 'error' });
    expect(issue?.message).toContain('Exports are never coarsened silently');
    expect(issue?.message).toContain(`over the ${String(exportBudget)}-triangle export budget`);
    expect(issue?.message).toContain('request a coarser preset or tessellation { linearTolerance: ');
  });

  it.each(['stl', 'glb'] as const)('exports a %s mesh that fits the budget unchanged', async (format) => {
    const exported = await exportModel(format, { tessellation: { linearTolerance: 1, angularTolerance: 60 } });
    expect(exported.success).toBe(true);
  });
});
