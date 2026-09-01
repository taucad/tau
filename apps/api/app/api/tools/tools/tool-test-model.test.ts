// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- file-path keys (e.g. 'main.ts') aren't camelCase */
import type { KernelProvider } from '@taucad/runtime';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ToolRuntime } from '@langchain/core/tools';
import { ToolError } from '@taucad/chat/utils';
import { rpcName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';
import { createTestModelTool, createTestModelToolDefinition } from '#api/tools/tools/tool-test-model.js';

type RpcResult = Awaited<ReturnType<ChatRpcConfigurable['chatRpcService']['sendRpcRequest']>>;

const allKernels: readonly KernelProvider[] = ['openscad', 'replicad', 'jscad', 'manifold', 'opencascadejs', 'zoo'];

const callTool = async (kernel: KernelProvider, configurable: ChatRpcConfigurable, toolCallId = 'tc-1') => {
  const runtime = mock<ToolRuntime>({ toolCallId, configurable: configurable as unknown as Record<string, unknown> });
  const testModelTool = createTestModelTool(kernel) as unknown as {
    invoke(input: Record<string, never>, runtime: ToolRuntime): Promise<unknown>;
  };

  return testModelTool.invoke({}, runtime);
};

const buildConfigurable = (overrides?: Partial<ChatRpcConfigurable>): ChatRpcConfigurable => {
  const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
  const geometryAnalysisService = mock<ChatRpcConfigurable['geometryAnalysisService']>();
  const fileEditService = mock<ChatRpcConfigurable['fileEditService']>();

  return {
    chatRpcService,
    geometryAnalysisService,
    fileEditService,
    thread_id: 'chat-1',
    ...overrides,
  };
};

const buildTestFileContent = (
  entries: Record<string, Array<{ id: string; check: 'connectedComponents'; count: number }>>,
) => {
  const map: Record<string, { requirements: unknown[] }> = {};
  for (const [file, reqs] of Object.entries(entries)) {
    map[file] = {
      requirements: reqs.map((r) => ({
        id: r.id,
        type: 'measurement',
        description: `${r.id} description`,
        check: r.check,
        expected: { count: r.count },
      })),
    };
  }
  return JSON.stringify(map, null, 2);
};

describe('createTestModelToolDefinition', () => {
  describe.each(allKernels)('%s description', (kernel) => {
    const { description } = createTestModelToolDefinition(kernel);

    // Test_model is one of two tools that retains a trimmed `When NOT to use:`
    // heading (high-overuse-risk: agents may otherwise call expensive
    // measurement runs when a cheap compile-only check via get_kernel_result is
    // what's wanted). The screenshot redirect was dropped — visual-inspection
    // selection lives in <visual_inspection>.
    it('declares a "When NOT to use" section (high overuse-risk carve-out)', () => {
      expect(description).toMatch(/When NOT to use:/);
    });

    it('points to get_kernel_result for compile-only checks', () => {
      expect(description).toMatch(/get_kernel_result/);
    });

    it('does NOT instruct the agent to remove a file from test.json', () => {
      expect(description).not.toMatch(/remove .* from test\.json/i);
    });

    it('does NOT bake in OpenSCAD-only "modules / functions" phrasing for non-OpenSCAD kernels', () => {
      if (kernel === 'openscad') {
        return;
      }
      expect(description).not.toMatch(/modules?\s*\/\s*functions?/i);
    });

    it('does NOT use "compilation unit" or the "CU" acronym', () => {
      expect(description).not.toMatch(/compilation unit|\bCU\b/);
    });
  });
});

describe('createTestModelTool', () => {
  describe.each(allKernels)('%s', (kernel) => {
    describe('per-geometry-unit fan-out', () => {
      it('should fan out fetchGeometry one call per file in the parsed map', async () => {
        const cfg = buildConfigurable();

        vi.mocked(cfg.chatRpcService.sendRpcRequest).mockImplementation(async ({ rpcName: rpcNameArgument }) => {
          if (rpcNameArgument === rpcName.readFile) {
            return {
              success: true,
              content: buildTestFileContent({
                'main.ts': [{ id: 'r1', check: 'connectedComponents', count: 1 }],
                'pen.ts': [{ id: 'r2', check: 'connectedComponents', count: 2 }],
              }),
            } as unknown as RpcResult;
          }
          if (rpcNameArgument === rpcName.fetchGeometry) {
            return {
              success: true,
              glb: new Uint8Array([1, 2, 3]),
              artifactPath: '.tau/artifacts/x.glb',
            } as unknown as RpcResult;
          }
          throw new Error(`Unexpected RPC: ${rpcNameArgument}`);
        });

        vi.mocked(cfg.geometryAnalysisService.runMeasurementTests).mockResolvedValue({
          failures: [],
          passes: [],
          passed: 0,
          total: 0,
        });

        await callTool(kernel, cfg);

        const fetchCalls = vi
          .mocked(cfg.chatRpcService.sendRpcRequest)
          .mock.calls.filter((c) => c[0].rpcName === rpcName.fetchGeometry);
        expect(fetchCalls).toHaveLength(2);
        const targetFiles = fetchCalls.map((c) => (c[0].args as { targetFile: string }).targetFile);
        expect(targetFiles.sort()).toEqual(['main.ts', 'pen.ts']);
      });
    });
  });

  describe('error branches (kernel-agnostic)', () => {
    it('should return missing_test_file failure when readFile is FILE_NOT_FOUND', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: false,
        errorCode: 'FILE_NOT_FOUND',
        message: 'no test.json',
      } as unknown as RpcResult);

      const result = (await callTool('openscad', cfg)) as { failures: Array<{ id: string; suggestion: string }> };
      expect(result.failures[0]?.id).toBe('missing_test_file');
      expect(result.failures[0]?.suggestion).toMatch(/edit_tests/);
    });

    it('should return empty_test_file failure when content is empty', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: true,
        content: '',
      } as unknown as RpcResult);

      const result = (await callTool('openscad', cfg)) as { failures: Array<{ id: string }> };
      expect(result.failures[0]?.id).toBe('empty_test_file');
    });

    it('should return invalid_test_file failure when JSON.parse fails', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: true,
        content: '{ not valid json',
      } as unknown as RpcResult);

      const result = (await callTool('openscad', cfg)) as { failures: Array<{ id: string; suggestion: string }> };
      expect(result.failures[0]?.id).toBe('invalid_test_file');
      expect(result.failures[0]?.suggestion).toMatch(/per[ -]file|file path/i);
    });

    it('should return invalid_test_file failure when the top level is a flat { requirements: [] } object (no file-path keys)', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: true,
        content: JSON.stringify({ requirements: [{ id: 'x', type: 'measurement', check: 'connectedComponents' }] }),
      } as unknown as RpcResult);

      const result = (await callTool('openscad', cfg)) as { failures: Array<{ id: string }> };
      expect(result.failures[0]?.id).toBe('invalid_test_file');
    });

    it('should return no_requirements failure when every file requirements array is empty', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: true,
        content: JSON.stringify({ 'main.ts': { requirements: [] }, 'pen.ts': { requirements: [] } }),
      } as unknown as RpcResult);

      const result = (await callTool('openscad', cfg)) as { failures: Array<{ id: string }> };
      expect(result.failures[0]?.id).toBe('no_requirements');
    });
  });

  describe('structured fetchGeometry failure messages', () => {
    const mockSingleFileFetchFailure = (cfg: ChatRpcConfigurable, failure: { errorCode: string; message: string }) => {
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockImplementation(async ({ rpcName: rpcNameArgument }) => {
        if (rpcNameArgument === rpcName.readFile) {
          return {
            success: true,
            content: buildTestFileContent({
              'lib/main_rotor.scad': [{ id: 'r1', check: 'connectedComponents', count: 1 }],
            }),
          } as unknown as RpcResult;
        }
        if (rpcNameArgument === rpcName.fetchGeometry) {
          return { success: false, ...failure } as unknown as RpcResult;
        }
        throw new Error(`Unexpected RPC: ${rpcNameArgument}`);
      });
    };

    const expectToolErrorMessage = async (
      kernel: KernelProvider,
      cfg: ChatRpcConfigurable,
      ...substrings: readonly string[]
    ) => {
      try {
        await callTool(kernel, cfg);
        expect.fail('expected ToolError');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        const { message } = (error as ToolError).data;
        for (const substring of substrings) {
          expect(message).toContain(substring);
        }
      }
    };

    describe.each(allKernels)('%s', (kernel) => {
      it('FILE_NOT_FOUND surfaces a positive create_file recovery, never "bootstrap"', async () => {
        const cfg = buildConfigurable();
        mockSingleFileFetchFailure(cfg, {
          errorCode: 'FILE_NOT_FOUND',
          message: 'lib/main_rotor.scad does not exist on disk.',
        });

        try {
          await callTool(kernel, cfg);
          expect.fail('expected ToolError');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          const { message } = (error as ToolError).data;
          expect(message).toContain('lib/main_rotor.scad');
          expect(message).toMatch(/create_file/);
          expect(message).not.toMatch(/bootstrap/i);
        }
      });

      it('NO_TOP_LEVEL_GEOMETRY surfaces kernel-specific "add a top-level export" recovery and forbids removing from test.json', async () => {
        const cfg = buildConfigurable();
        mockSingleFileFetchFailure(cfg, {
          errorCode: 'NO_TOP_LEVEL_GEOMETRY',
          message: 'lib/main_rotor.scad compiled but produced no top-level geometry to render.',
        });

        try {
          await callTool(kernel, cfg);
          expect.fail('expected ToolError');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          const { message } = (error as ToolError).data;
          expect(message).toContain('lib/main_rotor.scad');
          expect(message).toMatch(/edit_file/);
          expect(message).not.toMatch(/remove .* from test\.json/i);
          expect(message).not.toMatch(/bootstrap/i);
          if (kernel !== 'openscad') {
            expect(message).not.toMatch(/openscad library/i);
          }
        }
      });

      it('UNKNOWN error preserves the underlying message', async () => {
        const cfg = buildConfigurable();
        mockSingleFileFetchFailure(cfg, {
          errorCode: 'UNKNOWN',
          message: 'No graphics view is currently mounted',
        });

        await expectToolErrorMessage(kernel, cfg, 'lib/main_rotor.scad', 'No graphics view is currently mounted');
      });

      it('IO_ERROR includes errorCode in fallback', async () => {
        const cfg = buildConfigurable();
        mockSingleFileFetchFailure(cfg, {
          errorCode: 'IO_ERROR',
          message: 'disk read failed',
        });

        await expectToolErrorMessage(kernel, cfg, '[IO_ERROR]', 'disk read failed', 'lib/main_rotor.scad');
      });
    });

    describe('kernel-specific NO_TOP_LEVEL_GEOMETRY parlance', () => {
      it('replicad mentions Shape3D', async () => {
        const cfg = buildConfigurable();
        mockSingleFileFetchFailure(cfg, {
          errorCode: 'NO_TOP_LEVEL_GEOMETRY',
          message: 'lib/main_rotor.scad compiled but produced no top-level geometry to render.',
        });
        try {
          await callTool('replicad', cfg);
          expect.fail('expected ToolError');
        } catch (error) {
          const { message } = (error as ToolError).data;
          expect(message).toMatch(/Shape3D/);
        }
      });

      it('opencascadejs mentions TopoDS_Shape', async () => {
        const cfg = buildConfigurable();
        mockSingleFileFetchFailure(cfg, {
          errorCode: 'NO_TOP_LEVEL_GEOMETRY',
          message: 'lib/main_rotor.scad compiled but produced no top-level geometry to render.',
        });
        try {
          await callTool('opencascadejs', cfg);
          expect.fail('expected ToolError');
        } catch (error) {
          const { message } = (error as ToolError).data;
          expect(message).toMatch(/TopoDS_Shape/);
        }
      });

      it('zoo mentions extrude', async () => {
        const cfg = buildConfigurable();
        mockSingleFileFetchFailure(cfg, {
          errorCode: 'NO_TOP_LEVEL_GEOMETRY',
          message: 'lib/main_rotor.scad compiled but produced no top-level geometry to render.',
        });
        try {
          await callTool('zoo', cfg);
          expect.fail('expected ToolError');
        } catch (error) {
          const { message } = (error as ToolError).data;
          expect(message).toMatch(/extrude/i);
        }
      });
    });
  });
});
