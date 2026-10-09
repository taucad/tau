import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createNodeVmFileSystem } from '@taucad/geospec-engine/node-filesystem';
import { Engine } from '@taucad/geospec-engine-native/node';
import { createExampleGeoSpecRuntimeClient } from '@taucad/tau-examples/runtime';
import { runnerResultToTestModelOutput } from '@taucad/agent-tools/geospec';
import { trimToolResultContext } from '@taucad/agent-host';
import { assertGeoSpecJsonValue } from 'geospec/engine';
import { rpcSchemasRegistry } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import { createTauMcpAdapter } from '@taucad/mcp';
import { createNativeGeoSpecRunner } from 'geospec/runner/native';
import { describe, expect, it } from 'vitest';

describe('GeoSpec evidence to LLM closeout', () => {
  it('preserves real failures through the runner, RPC, MCP and provider trimming', async () => {
    const root = await mkdtemp(join(tmpdir(), 'geospec-evidence-closeout-'));
    const examplesRoot = resolve(import.meta.dirname, '../../../libs/tau-examples');
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
      it('two spatial failures', async () => {
        const model = await loadModel({ source: ${JSON.stringify(step)}, format: 'step', mesh: false });
        await expectGeo(model).toHaveSpatialRelationships({ relationships: [
          { id: 'seated', kind: 'contact', subject: 'cubeA', target: 'cubeB', tolerance: 0.02 },
          { id: 'gap', kind: 'clearance', subject: 'cubeA', target: 'cubeB', min: 0, max: 1 }
        ] });
      });
      it('invalid open geometry', async () => {
        const model = await loadModel({ file: 'kernels/jscad/non-manifold-section-fixture/main.ts' });
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
    const engine = new Engine();
    const serial = createNativeGeoSpecRunner({
      filesystem: createNodeVmFileSystem(root),
      nativeAssertions: { engine },
      model: {
        projectPath: root,
        runtime: async () => createExampleGeoSpecRuntimeClient(examplesRoot),
        readSource: async (source) => {
          if (typeof source !== 'string') {
            throw new TypeError('Closeout sources are absolute file paths.');
          }
          return new Uint8Array(await readFile(source));
        },
      },
    });
    try {
      const serialResult = await serial.run({ files: [file] });
      expect(serialResult).toMatchObject({ passed: 1, failed: 4, selectedTests: 5 });
      const output = runnerResultToTestModelOutput(serialResult, [file]);
      expect(output.failures[0]?.diagnostics).toHaveLength(2);
      for (const diagnostic of output.failures[0]?.diagnostics ?? []) {
        expect(diagnostic.code).toBe('GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH');
        expect(diagnostic.spatial?.center).toHaveLength(3);
        expect(diagnostic.details).toHaveProperty('witnesses');
        expect(diagnostic.details).toHaveProperty('measured');
      }
      expect(output.failures[1]?.diagnostics?.map(({ code }) => code)).toStrictEqual([
        'GEOMETRY_INVALID',
        'GEOSPEC_WATERTIGHT_MISMATCH',
      ]);
      expect(output.failures[1]?.diagnostics?.[1]).toMatchObject({
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
      // The host source reader's own error is the load failure; native admission adds no wrapper code.
      expect(output.failures[2]?.diagnostics?.[0]?.code).toBe('TEST_FAILED');
      expect(output.failures[2]?.diagnostics?.[0]?.message).toContain('ENOENT');
      expect(output.failures[3]?.diagnostics?.[0]?.details).toHaveProperty('diagnostics.0.code', 'GEOMETRY_INVALID');
      expect(output.failures[3]?.diagnostics?.[0]?.details).toHaveProperty('diagnostics.0.severity', 'warning');
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
      expect(mcp.content).toHaveLength(1);
      const [summary] = mcp.content;
      if (summary?.type !== 'text') {
        throw new Error('missing MCP summary text');
      }
      expect(summary.text).toContain('GeoSpec passed 1 of 5 requirements.');
      for (const failure of output.failures) {
        expect(summary.text).toContain(failure.id);
      }
      assertGeoSpecJsonValue(output);
      const [trimmed] = trimToolResultContext([
        {
          role: 'toolResult',
          toolCallId: 'evidence-closeout',
          toolName: 'test_model',
          content: [{ type: 'text', text: summary.text }],
          details: { content: output },
          isError: false,
          timestamp: 0,
        },
      ]);
      if (trimmed?.role !== 'toolResult' || trimmed.content[0]?.type !== 'text') {
        throw new Error('missing provider text');
      }
      // Replay keeps every field but the passing rows.
      const replayed = Object.fromEntries(Object.entries(output).filter(([key]) => key !== 'passes'));
      expect(JSON.parse(trimmed.content[0].text)).toStrictEqual(replayed);
      expect(replayed).toMatchObject({ total: 5, failures: output.failures });
      expect(trimmed.details).toMatchObject({ content: trimmed.content });
    } finally {
      await serial.close();
      engine.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});
