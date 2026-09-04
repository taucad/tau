import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import '@taucad/geospec-engine/register/node';
import { createExampleGeoSpecRuntimeClient } from '@taucad/tau-examples/runtime';
import { runnerResultToTestModelOutput } from '@taucad/agent-tools/geospec';
import type { TestModelOutput } from '@taucad/agent-tools/geospec';
import { toPiToolContent, trimToolResultContext } from '@taucad/agent-host';
import type { JsonValue } from '@taucad/agent-host';
import { assertGeoSpecJsonValue } from 'geospec/engine';
import { rpcSchemasRegistry } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import { createTauMcpAdapter } from '@taucad/mcp';
import { createGeoSpecNodePoolRunner, createGeoSpecNodeRunner, createNodeVmFileSystem } from 'geospec/runner/node';
import { createModelLoader } from 'geospec/model';
import { describe, expect, it } from 'vitest';

const normalize = (output: TestModelOutput): TestModelOutput => ({
  ...output,
  failures: output.failures.toSorted((left, right) => left.id.localeCompare(right.id)),
});

describe('GeoSpec evidence to LLM closeout', () => {
  it.each([false, true])(
    'preserves real failures through serial/pool, RPC, MCP and provider trimming (cache=%s)',
    async (cache) => {
      const root = await mkdtemp(join(tmpdir(), 'geospec-evidence-closeout-'));
      const examplesRoot = resolve(import.meta.dirname, '../../../libs/tau-examples');
      const runtimeFactory = join(root, 'runtime.mjs');
      await writeFile(
        runtimeFactory,
        `import { createExampleGeoSpecRuntimeClient } from ${JSON.stringify(pathToFileURL(join(examplesRoot, 'scripts/runtime.ts')).href)}; export const createRuntime = () => createExampleGeoSpecRuntimeClient(${JSON.stringify(examplesRoot)});`,
      );
      const step = join(root, 'assembly.step');
      await copyFile(
        resolve(import.meta.dirname, '../../../packages/geospec-engine/fixtures/xde/two-cube-assembly.step'),
        step,
      );
      const file = 'evidence.geospec.ts';
      await writeFile(
        join(root, file),
        `
      import { it, expectGeo } from 'geospec';
      import { loadModel } from 'geospec/model';
      import { analyzeMesh } from 'geospec/mesh';
      it('two spatial failures', async () => {
        const model = await loadModel({ source: ${JSON.stringify(step)}, format: 'step', mesh: false });
        await expectGeo(model).toHaveSpatialRelationships({ relationships: [
          { id: 'seated', kind: 'contact', subject: 'cubeA', target: 'cubeB', tolerance: 0.02 },
          { id: 'gap', kind: 'clearance', subject: 'cubeA', target: 'cubeB', min: 0, max: 1 }
        ] });
      });
      it('invalid open geometry', async () => {
        const model = await loadModel({ file: 'kernels/jscad/non-manifold-section-fixture/main.ts' });
        const full = await analyzeMesh({ subject: model });
        if (!full.success || full.stats.watertight) throw new Error('invalid full analysis');
        expectGeo(model).toBeWatertight();
      });
      it('real load failure', async () => {
        await loadModel({ source: ${JSON.stringify(join(root, 'missing.glb'))}, format: 'glb' });
      });
      it('repaired gear', async () => {
        const model = await loadModel({ file: 'kernels/jscad/gear/main.ts' });
        expectGeo(model).toHaveNoDiagnostics();
        expectGeo(model).toBeWatertight();
      });
      it('real runtime warning', async () => {
        const model = await loadModel({ file: 'kernels/jscad/non-manifold-section-fixture/main.ts' });
        expectGeo(model).toHaveNoDiagnostics();
      });
    `,
      );
      const serial = createGeoSpecNodeRunner({
        projectPath: root,
        filesystem: createNodeVmFileSystem(root),
        modelLoader: createModelLoader({
          projectPath: root,
          runtime: async () => createExampleGeoSpecRuntimeClient(examplesRoot),
        }),
        cache,
      });
      const pool = createGeoSpecNodePoolRunner({
        projectPath: root,
        workers: 2,
        cache,
        shardTimeout: 120_000,
        runtimeFactoryModule: { specifier: pathToFileURL(runtimeFactory).href, exportName: 'createRuntime' },
      });
      try {
        const serialResult = await serial.run({ files: [file] });
        const poolResult = await pool.run({ files: [file] });
        expect(serialResult).toMatchObject({ passed: 1, failed: 4, selectedTests: 5 });
        expect(poolResult).toMatchObject({ passed: 1, failed: 4, selectedTests: 5 });
        const output = runnerResultToTestModelOutput(serialResult, [file]);
        const pooledOutput = runnerResultToTestModelOutput(poolResult, [file]);
        // Pool scheduling changes row order as timing history warms; evidence order within each failure must not change.
        expect(normalize(runnerResultToTestModelOutput(await pool.run({ files: [file] }), [file]))).toStrictEqual(
          normalize(pooledOutput),
        );
        expect(normalize(pooledOutput)).toStrictEqual(normalize(output));
        expect(output.failures[0]?.diagnostics).toHaveLength(2);
        for (const diagnostic of output.failures[0]?.diagnostics ?? []) {
          expect(diagnostic.code).toBe('GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH');
          expect(diagnostic.spatial?.center).toHaveLength(3);
          expect(diagnostic.details).toHaveProperty('witnesses');
          expect(diagnostic.details).toHaveProperty('measured');
        }
        expect(output.failures[1]?.diagnostics?.[0]).toMatchObject({
          code: 'GEOSPEC_WATERTIGHT_MISMATCH',
          details: {
            openBoundaryEdges: 4,
            nonManifoldEdges: 0,
            irregularEdgeClusters: [
              expect.objectContaining({
                kind: 'open-boundary',
                edgeCount: 4,
                aabb: { min: [-2, -2, -2], max: [-2, 2, 2], center: [-2, 0, 0] },
              }),
            ],
          },
        });
        expect(output.failures[2]?.diagnostics?.[0]?.code).not.toBe('TEST_FAILED');
        expect(output.failures[3]?.diagnostics?.[0]?.details).toHaveProperty('diagnostics.0.code', 'GEOMETRY_INVALID');
        expect(output.failures[3]?.diagnostics?.[0]?.details).toHaveProperty('diagnostics.0.severity', 'warning');
        expect(output.failures[3]?.diagnostics?.[0]?.details).toHaveProperty(
          'diagnostics.0.details.code',
          'GEOMETRY_INVALID',
        );
        const rpc = rpcSchemasRegistry[rpcName.runGeoSpecTests].resultSchema.parse(
          // oxlint-disable-next-line unicorn/prefer-structured-clone -- Exercise RPC JSON serialization, not cloning.
          JSON.parse(JSON.stringify({ success: true, ...output })),
        );
        expect(rpc).toStrictEqual({ success: true, ...output });
        const mcp = await createTauMcpAdapter({ dispatch: async () => ({ success: true, ...output }) }).call({
          name: toolName.testModel,
          arguments: {},
          toolCallId: 'evidence-closeout',
        });
        expect(mcp.structuredContent).toStrictEqual(output);
        expect(mcp.content).toContainEqual({ type: 'text', text: JSON.stringify(output) });
        assertGeoSpecJsonValue(output);
        const [trimmed] = trimToolResultContext([
          {
            role: 'toolResult',
            toolCallId: 'evidence-closeout',
            toolName: 'test_model',
            content: toPiToolContent(output as JsonValue),
            details: { content: output },
            isError: false,
            timestamp: 0,
          },
        ]);
        if (trimmed?.role !== 'toolResult' || trimmed.content[0]?.type !== 'text') {
          throw new Error('missing provider text');
        }
        expect(JSON.parse(trimmed.content[0].text)).toStrictEqual({ failures: output.failures, total: 5 });
      } finally {
        await serial.close();
        await pool.close();
        await rm(root, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
