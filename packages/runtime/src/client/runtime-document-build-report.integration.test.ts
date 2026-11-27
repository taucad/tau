// @vitest-environment node
import { expect, it } from 'vitest';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import type { KernelBuildReport } from '#types/runtime-kernel-v2.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { admitKernelBuildReport } from '#framework/kernel-build-report.js';

/** Any number: elapsed times vary from run to run. */
const anyNumber: unknown = expect.any(Number);

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:build-report',
    $uses: ['JSONSchemaUnits'],
    name: 'BuildReportParameters',
    type: 'object',
    properties: { size: { type: 'number' } },
  },
  defaults: { size: 1 },
} as const;

/** A kernel whose evaluate reports what the next call returns, and counts its runs; `describeDelay` slows describe. */
const reportingClient = (report: () => KernelBuildReport | undefined, describeDelay = 0) => {
  const runs = { count: 0 };
  const kernel = defineKernelV2({
    id: 'build-report',
    extensions: ['part'] as const,
    name: 'Build report',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      if (describeDelay > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, describeDelay);
        });
      }
      return createKernelSuccess({ parameters });
    },
    async evaluate() {
      runs.count++;
      const build = report();
      return { handle: {}, views: ['primary'] as const, ...(build === undefined ? {} : { build }) };
    },
    async render() {
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
  })();
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime: defineRuntime({ kernels: [kernel] }), fileSystem: fromMemoryFs({}) }),
  });
  return { client, runs };
};

const evaluated = async (outcome: Promise<unknown>) => {
  const settled = (await outcome) as { superseded: boolean; evaluation?: { build?: unknown } };
  expect(settled.superseded).toBe(false);
  return settled.evaluation!;
};

it('reports a computed build with its cost and what the kernel reused inside it', async () => {
  const { client } = reportingClient(() => ({
    operations: { reused: 12, computed: 5 },
    costliest: [
      { operation: 'Shape.fillet', elapsed: 40.5, calls: 2 },
      { operation: 'Shape.cut', elapsed: 9, calls: 1 },
    ],
  }));
  const document = client.open({ source: { files: { 'model.part': 'a' } }, watch: false });
  try {
    const evaluation = await evaluated(document.evaluation());
    expect(evaluation).toMatchObject({
      success: true,
      build: {
        reused: false,
        elapsed: anyNumber,
        operations: { reused: 12, computed: 5 },
        costliest: [
          { operation: 'Shape.fillet', elapsed: 40.5, calls: 2 },
          { operation: 'Shape.cut', elapsed: 9, calls: 1 },
        ],
      },
    });
  } finally {
    document.close();
    await client.shutdown();
  }
});

it('reports a build the kernel answered from one it kept as reused', async () => {
  const { client } = reportingClient(() => ({ reused: true }));
  const document = client.open({ source: { files: { 'model.part': 'a' } }, watch: false });
  try {
    const evaluation = await evaluated(document.evaluation());
    expect(evaluation).toMatchObject({ build: { reused: true, elapsed: anyNumber } });
    expect(evaluation.build).not.toHaveProperty('operations');
  } finally {
    document.close();
    await client.shutdown();
  }
});

it('reports a build no kernel ran as reused, with no kernel counts from the earlier run', async () => {
  const { client, runs } = reportingClient(() => ({ operations: { reused: 0, computed: 7 } }));
  const document = client.open({ source: { files: { 'model.part': 'a' } }, parameters: { size: 2 }, watch: false });
  try {
    expect(await evaluated(document.evaluation())).toMatchObject({ build: { reused: false } });
    const again = await evaluated(document.update({ parameters: { size: 2 } }));
    expect(runs.count).toBe(1);
    expect(again).toMatchObject({ success: true, build: { reused: true, elapsed: anyNumber } });
    expect(again.build).not.toHaveProperty('operations');
  } finally {
    document.close();
    await client.shutdown();
  }
});

it('reports only the build and its cost when the kernel reports nothing', async () => {
  const { client } = reportingClient(() => undefined);
  const document = client.open({ source: { files: { 'model.part': 'a' } }, watch: false });
  try {
    const evaluation = await evaluated(document.evaluation());
    expect(evaluation.build).toStrictEqual({ reused: false, elapsed: anyNumber });
  } finally {
    document.close();
    await client.shutdown();
  }
});

it('keeps the first three costliest operations and drops a malformed kernel report', async () => {
  const reports: KernelBuildReport[] = [
    {
      operations: { reused: 1, computed: 3 },
      costliest: Array.from({ length: 5 }, (_, index) => ({
        operation: `Op.${String(index)}`,
        elapsed: 5 - index,
        calls: 1,
      })),
    },
    // What a kernel written in plain JavaScript can return: the type does not hold it to its contract.
    { operations: { reused: -1, computed: 3 }, costliest: [{ operation: 'x'.repeat(500), elapsed: 1, calls: 1 }] },
  ];
  const { client } = reportingClient(() => reports.shift());
  const first = client.open({ source: { files: { 'model.part': 'a' } }, watch: false });
  const second = client.open({ source: { files: { 'model.part': 'b' } }, watch: false });
  try {
    const kept = await evaluated(first.evaluation());
    const dropped = await evaluated(second.evaluation());
    expect(kept.build).toStrictEqual({
      reused: false,
      elapsed: anyNumber,
      operations: { reused: 1, computed: 3 },
      costliest: [
        { operation: 'Op.0', elapsed: 5, calls: 1 },
        { operation: 'Op.1', elapsed: 4, calls: 1 },
        { operation: 'Op.2', elapsed: 3, calls: 1 },
      ],
    });
    expect(dropped.build).toStrictEqual({ reused: false, elapsed: anyNumber });
  } finally {
    first.close();
    second.close();
    await client.shutdown();
  }
});

it('admits a report that says the kernel did not reuse the build', () => {
  const report: KernelBuildReport = { reused: false, operations: { reused: 1, computed: 2 } };
  expect(admitKernelBuildReport(report)).toStrictEqual(report);
});

it('reports no build for a failed evaluation whose build never ran', async () => {
  const { client, runs } = reportingClient(() => ({ operations: { reused: 0, computed: 1 } }));
  const document = client.open({
    source: { files: { 'model.part': 'a' } },
    parameters: { size: 'not a number' },
    watch: false,
  });
  try {
    const evaluation = await evaluated(document.evaluation());
    expect(evaluation).toMatchObject({ success: false });
    expect(runs.count).toBe(0);
    expect(evaluation).not.toHaveProperty('build');
  } finally {
    document.close();
    await client.shutdown();
  }
});

it('reports the elapsed time to a tenth of a millisecond', async () => {
  const { client } = reportingClient(() => undefined);
  const document = client.open({ source: { files: { 'model.part': 'a' } }, watch: false });
  try {
    const { build } = (await evaluated(document.evaluation())) as { build?: { elapsed: number } };
    expect(Math.round(build!.elapsed * 10) / 10).toBe(build!.elapsed);
  } finally {
    document.close();
    await client.shutdown();
  }
});

/** A report whose `property` getter throws, as a plain JavaScript kernel can return. */
const throwingReport = (property: string): KernelBuildReport => {
  const report = { operations: { reused: 1, computed: 2 } };
  Object.defineProperty(report, property, {
    enumerable: true,
    get() {
      throw new Error(`${property} getter`);
    },
  });
  return report as KernelBuildReport;
};

it('drops a kernel report whose getters throw', () => {
  expect(admitKernelBuildReport(throwingReport('costliest'))).toBeUndefined();
  expect(admitKernelBuildReport(throwingReport('reused'))).toBeUndefined();
});

it('keeps an evaluation successful when its kernel report throws on read', async () => {
  const { client } = reportingClient(() => throwingReport('costliest'));
  const document = client.open({ source: { files: { 'model.part': 'a' } }, watch: false });
  try {
    const evaluation = await evaluated(document.evaluation());
    expect(evaluation).toMatchObject({ success: true });
    expect(evaluation.build).toStrictEqual({ reused: false, elapsed: anyNumber });
  } finally {
    document.close();
    await client.shutdown();
  }
});

it('counts a slow parameter description in the elapsed time', async () => {
  const { client } = reportingClient(() => undefined, 60);
  const document = client.open({ source: { files: { 'model.part': 'a' } }, watch: false });
  try {
    const { build } = (await evaluated(document.evaluation())) as { build?: { elapsed: number } };
    expect(build!.elapsed).toBeGreaterThanOrEqual(50);
  } finally {
    document.close();
    await client.shutdown();
  }
});
