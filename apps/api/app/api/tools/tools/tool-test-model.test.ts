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

const callTool = async (options: {
  kernel: KernelProvider;
  configurable: ChatRpcConfigurable;
  input?: Record<string, unknown>;
  toolCallId?: string;
}) => {
  const runtime = mock<ToolRuntime>({
    toolCallId: options.toolCallId ?? 'tc-1',
    configurable: options.configurable as unknown as Record<string, unknown>,
  });
  const testModelTool = createTestModelTool(options.kernel) as unknown as {
    invoke(input: Record<string, unknown>, runtime: ToolRuntime): Promise<unknown>;
  };

  return testModelTool.invoke(options.input ?? {}, runtime);
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

    it('does NOT mention legacy test-file editing', () => {
      expect(description).not.toMatch(/test\.json|edit_tests/i);
    });

    it('should document the canonical GeoSpec filter input shape without bracket-key syntax', () => {
      expect(description).toContain("{ files: ['main.geospec.ts'] }");
      expect(description).toContain("{ files: ['lib'] }");
      expect(description).toContain("{ testNamePattern: '^(?!.*no meshing interference).*' }");
      expect(description).toContain("{ exclude: ['**/*.slow.geospec.ts'] }");
      expect(description).not.toContain('files[0]');
      expect(description).not.toContain('Do not use bracket-key syntax');
      expect(description).not.toContain('excludeTestNamePattern');
    });

    it('should not imply an empty zero-test result is successful', () => {
      expect(description).toContain('Empty failures with total > 0 means all selected tests passed.');
    });

    it('should stay within the context-engineering word budget', () => {
      expect(description.trim().split(/\s+/u).length).toBeLessThanOrEqual(150);
    });

    it('does NOT bake in OpenSCAD-only "modules / functions" phrasing for non-OpenSCAD-language kernels', () => {
      if (kernel === 'openscad') {
        return;
      }
      expect(description).not.toMatch(/modules?\s*\/\s*functions?/i);
    });

    it('does NOT use "compilation unit" or the "CU" acronym', () => {
      expect(description).not.toMatch(/compilation unit|\bCU\b/);
    });

    it('does NOT suggest simplifying the model when tests fail', () => {
      expect(description).not.toMatch(
        /try a simpler model|simplify the model|compare simpler mesh evidence|too complex to verify/i,
      );
    });
  });
});

describe('createTestModelTool', () => {
  it('delegates GeoSpec execution to the browser-connected Tau runner', async () => {
    const cfg = buildConfigurable();

    vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
      success: true,
      failures: [],
      passes: [
        {
          id: 'main.geospec.ts:main parameter tests > renders the explicit width',
          requirement: 'main parameter tests > renders the explicit width',
          targetFile: 'main.geospec.ts',
        },
      ],
      passed: 1,
      total: 1,
    } as unknown as RpcResult);

    const result = (await callTool({ kernel: 'replicad', configurable: cfg })) as {
      failures: unknown[];
      passes: Array<{ requirement: string; targetFile: string }>;
      passed: number;
      total: number;
      geometryArtifactPaths?: Record<string, string>;
    };

    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(1);
    expect(result.total).toBe(1);
    expect(result.passes[0]).toEqual(
      expect.objectContaining({
        requirement: 'main parameter tests > renders the explicit width',
        targetFile: 'main.geospec.ts',
      }),
    );
    expect(cfg.chatRpcService.sendRpcRequest).toHaveBeenCalledTimes(1);
    expect(cfg.chatRpcService.sendRpcRequest).toHaveBeenCalledWith({
      chatId: 'chat-1',
      toolCallId: 'tc-1',
      rpcName: rpcName.runGeoSpecTests,
      args: {},
    });
  });

  it('should pass GeoSpec filters through to the browser-connected Tau runner', async () => {
    const cfg = buildConfigurable();

    vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
      success: true,
      failures: [],
      passes: [],
      passed: 0,
      total: 0,
    } as unknown as RpcResult);

    await callTool({
      kernel: 'replicad',
      configurable: cfg,
      input: {
        files: ['main.geospec.ts'],
        include: ['**/*.geospec.ts'],
        exclude: ['**/*.slow.geospec.ts'],
        testNamePattern: 'volume|surface',
        testTimeout: 15_000,
      },
    });

    expect(cfg.chatRpcService.sendRpcRequest).toHaveBeenCalledWith({
      chatId: 'chat-1',
      toolCallId: 'tc-1',
      rpcName: rpcName.runGeoSpecTests,
      args: {
        files: ['main.geospec.ts'],
        include: ['**/*.geospec.ts'],
        exclude: ['**/*.slow.geospec.ts'],
        testNamePattern: 'volume|surface',
        testTimeout: 15_000,
      },
    });
  });

  it('should pass directory-root GeoSpec filters through to the browser-connected Tau runner', async () => {
    const cfg = buildConfigurable();

    vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
      success: true,
      failures: [],
      passes: [],
      passed: 0,
      total: 0,
    } as unknown as RpcResult);

    await callTool({
      kernel: 'openscad',
      configurable: cfg,
      input: {
        files: ['lib'],
      },
    });

    expect(cfg.chatRpcService.sendRpcRequest).toHaveBeenCalledWith({
      chatId: 'chat-1',
      toolCallId: 'tc-1',
      rpcName: rpcName.runGeoSpecTests,
      args: {
        files: ['lib'],
      },
    });
  });

  describe.each(allKernels)('%s', (kernel) => {
    describe('browser runner delegation', () => {
      it('should not fetch geometry or read project tests in the API process', async () => {
        const cfg = buildConfigurable();

        vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
          success: true,
          failures: [],
          passes: [],
          passed: 0,
          total: 0,
        } as unknown as RpcResult);

        await callTool({ kernel, configurable: cfg });

        const rpcCalls = vi.mocked(cfg.chatRpcService.sendRpcRequest).mock.calls.map((call) => call[0].rpcName);
        expect(rpcCalls).toEqual([rpcName.runGeoSpecTests]);
        expect(cfg.geometryAnalysisService.runMeasurementTests).not.toHaveBeenCalled();
      });
    });
  });

  describe('error branches (kernel-agnostic)', () => {
    it('should return compact missing-test diagnostics from the browser runner', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: true,
        failures: [
          {
            id: 'missing_geospec_file',
            requirement: 'At least one GeoSpec test file must exist',
            reason: 'No *.geospec.ts or *.geospec.js files found in the project.',
            suggestion: 'Create a *.geospec.ts test file.',
            targetFile: '*.geospec.ts',
          },
        ],
        passes: [],
        passed: 0,
        total: 0,
      } as unknown as RpcResult);

      const result = (await callTool({ kernel: 'openscad', configurable: cfg })) as {
        failures: Array<{ id: string; suggestion: string }>;
      };
      expect(result.failures[0]?.id).toBe('missing_geospec_file');
      expect(result.failures[0]?.suggestion).toMatch(/\.geospec\.ts/);
    });
  });

  describe('structured runner failure messages', () => {
    const expectToolErrorMessage = async (
      kernel: KernelProvider,
      cfg: ChatRpcConfigurable,
      ...substrings: readonly string[]
    ) => {
      try {
        await callTool({ kernel, configurable: cfg });
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
      it('propagates browser-runner client errors without falling back to API-side geometry testing', async () => {
        const cfg = buildConfigurable();
        vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
          success: false,
          errorCode: 'UNKNOWN',
          message: 'GeoSpec tests require a browser-connected Tau runner.',
        } as unknown as RpcResult);

        await expectToolErrorMessage(kernel, cfg, 'GeoSpec tests could not run', 'browser-connected Tau runner');
        expect(cfg.geometryAnalysisService.runMeasurementTests).not.toHaveBeenCalled();
      });
    });
  });
});
