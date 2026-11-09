// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import type { ExportResult } from '@taucad/runtime';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { opencascadeKernel } from '#opencascade.kernel.js';

/** The export budget the removed refusal was tested with: a radius-5 sphere exceeds it at `high`. */
const formerExportBudget = 1000;

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

const binaryStlTriangles = (bytes: Uint8Array<ArrayBuffer>): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);

afterAll(async () => {
  await Promise.all(clients.map(async (client) => client.shutdown()));
});

// D2 (kernel budget program): exports mesh at the requested tolerance with no triangle check, so nothing refuses
// an export for its size. Each case opens its own client, which initialises OpenCASCADE.
describe('OpenCascade export without a triangle budget', { timeout: 60_000 }, () => {
  it.each(['stl', 'glb'] as const)('exports a %s mesh over the former budget', async (format) => {
    const exported = await exportModel(format, {});
    expect(exported.success).toBe(true);
  });

  it('meshes an STL export at the requested tolerance, not a coarser one', async () => {
    const exported = await exportModel('stl', { tessellation: 'high', binary: true });
    expect(exported.success).toBe(true);
    if (!exported.success) {
      return;
    }
    const [file] = exported.files;
    expect(binaryStlTriangles(file.bytes)).toBeGreaterThan(formerExportBudget);
  });
});
