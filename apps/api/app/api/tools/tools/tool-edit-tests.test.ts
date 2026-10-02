// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- file-path keys (e.g. 'main.ts') aren't camelCase */
import type { KernelProvider } from '@taucad/runtime';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ToolRuntime } from '@langchain/core/tools';
import { ToolError } from '@taucad/chat/utils';
import { rpcName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';
import { createEditTestsTool, createEditTestsToolDefinition } from '#api/tools/tools/tool-edit-tests.js';
import { getKernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.js';

type RpcResult = Awaited<ReturnType<ChatRpcConfigurable['chatRpcService']['sendRpcRequest']>>;
type EditResult = Awaited<ReturnType<ChatRpcConfigurable['fileEditService']['applyFileEdit']>>;

/** Mirrors on-disk test.json formatting; RPC readFile returns raw bytes (no cat-n gutter). */
const realisticEmptyTestJson = JSON.stringify({}, null, 2);

const allKernels: readonly KernelProvider[] = ['openscad', 'replicad', 'jscad', 'manifold', 'opencascadejs', 'zoo'];

const callTool = async (kernel: KernelProvider, configurable: ChatRpcConfigurable, codeEdit = '// edit') => {
  const runtime = mock<ToolRuntime>({
    toolCallId: 'tc-edit',
    configurable: configurable as unknown as Record<string, unknown>,
  });
  const tool = createEditTestsTool(kernel) as unknown as {
    invoke(input: { codeEdit: string }, runtime: ToolRuntime): Promise<unknown>;
  };
  return tool.invoke({ codeEdit }, runtime);
};

const buildConfigurable = (): ChatRpcConfigurable => ({
  chatRpcService: mock<ChatRpcConfigurable['chatRpcService']>(),
  fileEditService: mock<ChatRpcConfigurable['fileEditService']>(),
  geometryAnalysisService: mock<ChatRpcConfigurable['geometryAnalysisService']>(),
  thread_id: 'chat-1',
});

describe('createEditTestsToolDefinition', () => {
  describe.each(allKernels)('%s description', (kernel) => {
    const { description } = createEditTestsToolDefinition(kernel);
    const config = getKernelConfig(kernel);

    // Edit_tests is one of two tools that retains a trimmed `When NOT to use:`
    // heading (high-overuse-risk: agent could otherwise route arbitrary JSON
    // edits through edit_tests rather than create_file / edit_file).
    it('declares a "When NOT to use" section (high overuse-risk carve-out)', () => {
      expect(description).toMatch(/When NOT to use:/);
    });

    it('points to edit_file as the alternative for non-test.json edits', () => {
      expect(description).toMatch(/edit_file/);
    });

    it('uses the kernel-native file extension in the example map keys', () => {
      const exampleKeyPattern = new RegExp(`"[^"]+\\${config.fileExtension}"\\s*:\\s*\\{`);
      expect(description).toMatch(exampleKeyPattern);
    });

    it('does NOT bake in TypeScript-only file extensions when the kernel is not TS-based', () => {
      if (config.fileExtension === '.ts') {
        return;
      }
      expect(description).not.toMatch(/"main\.ts"\s*:/);
      expect(description).not.toMatch(/"lib\/pen\.ts"\s*:/);
    });

    it('does NOT use the abstract "compilation unit" or "CU" acronym', () => {
      expect(description).not.toMatch(/compilation unit|\bCU\b/);
    });

    it('encourages adding tests to every file rather than removing entries', () => {
      expect(description).not.toMatch(/remove .* from test\.json/i);
    });

    it('mentions exactly the 3-check vocabulary (boundingBox, connectedComponents, watertight)', () => {
      expect(description).toContain('boundingBox');
      expect(description).toContain('connectedComponents');
      expect(description).toContain('watertight');
    });

    it('does NOT advertise the deprecated meshCount or vertexCount checks', () => {
      expect(description).not.toContain('meshCount');
      expect(description).not.toContain('vertexCount');
    });

    it('explicitly mentions the connectedComponents tolerance knob (mm) and its default', () => {
      expect(description).toContain('tolerance');
      expect(description).toContain('default 0.1');
    });
  });
});

describe('createEditTestsTool', () => {
  describe.each(allKernels)('%s', (kernel) => {
    it('should write the Morph result back when it parses against testFileSchema', async () => {
      const cfg = buildConfigurable();
      const config = getKernelConfig(kernel);
      const validContent = JSON.stringify({
        [`main${config.fileExtension}`]: {
          requirements: [
            { id: 'r1', type: 'measurement', description: 'd', check: 'connectedComponents', expected: { count: 1 } },
          ],
        },
      });

      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockImplementation(async ({ rpcName: r }) => {
        if (r === rpcName.readFile) {
          return {
            success: true,
            content: realisticEmptyTestJson,
            totalLines: 3,
            startLine: 1,
          } as unknown as RpcResult;
        }
        if (r === rpcName.createFile) {
          return { success: true } as unknown as RpcResult;
        }
        throw new Error(`Unexpected RPC: ${r}`);
      });

      vi.mocked(cfg.fileEditService.applyFileEdit).mockResolvedValue({
        success: true,
        editedContent: validContent,
        diffStats: { linesAdded: 1, linesRemoved: 0 },
      } as unknown as EditResult);

      await callTool(kernel, cfg);

      const writeCall = vi
        .mocked(cfg.chatRpcService.sendRpcRequest)
        .mock.calls.find((c) => c[0].rpcName === rpcName.createFile);
      expect(writeCall).toBeDefined();
      expect((writeCall![0].args as { content: string }).content).toBe(validContent);
    });

    it('should throw ToolError listing Zod issues when Morph result fails schema validation', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: true,
        content: realisticEmptyTestJson,
        totalLines: 3,
        startLine: 1,
      } as unknown as RpcResult);

      vi.mocked(cfg.fileEditService.applyFileEdit).mockResolvedValue({
        success: true,
        editedContent: JSON.stringify({ requirements: [] }),
        diffStats: { linesAdded: 0, linesRemoved: 0 },
      } as unknown as EditResult);

      try {
        await callTool(kernel, cfg);
        expect.fail('expected ToolError');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        const { message } = (error as ToolError).data;
        expect(message).toMatch(/per[ -]file|invalid/i);
      }

      const writeCalls = vi
        .mocked(cfg.chatRpcService.sendRpcRequest)
        .mock.calls.filter((c) => c[0].rpcName === rpcName.createFile);
      expect(writeCalls).toHaveLength(0);
    });

    it('should use the multi-file default content when readFile returns FILE_NOT_FOUND', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockImplementation(async ({ rpcName: r }) => {
        if (r === rpcName.readFile) {
          return { success: false, errorCode: 'FILE_NOT_FOUND', message: 'no file' } as unknown as RpcResult;
        }
        if (r === rpcName.createFile) {
          return { success: true } as unknown as RpcResult;
        }
        throw new Error(`Unexpected RPC: ${r}`);
      });

      vi.mocked(cfg.fileEditService.applyFileEdit).mockResolvedValue({
        success: true,
        editedContent: JSON.stringify({}),
        diffStats: { linesAdded: 0, linesRemoved: 0 },
      } as unknown as EditResult);

      await callTool(kernel, cfg);

      const editCall = vi.mocked(cfg.fileEditService.applyFileEdit).mock.calls[0]?.[0];
      expect(editCall?.originalContent).toBeDefined();
      const parsed = JSON.parse(editCall!.originalContent) as Record<string, unknown>;
      expect(parsed).toEqual({});
      expect(Array.isArray(parsed['requirements'])).toBe(false);
    });

    it('should propagate ToolError when readFile returns a non-FILE_NOT_FOUND client error', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: false,
        errorCode: 'PERMISSION_DENIED',
        message: 'denied',
      } as unknown as RpcResult);

      try {
        await callTool(kernel, cfg);
        expect.fail('expected ToolError');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        expect((error as ToolError).data.message).toMatch(/denied|cannot read/i);
      }
    });

    it('should propagate ToolError with edit failure message when Morph apply fails', async () => {
      const cfg = buildConfigurable();
      vi.mocked(cfg.chatRpcService.sendRpcRequest).mockResolvedValue({
        success: true,
        content: realisticEmptyTestJson,
        totalLines: 3,
        startLine: 1,
      } as unknown as RpcResult);
      vi.mocked(cfg.fileEditService.applyFileEdit).mockResolvedValue({
        success: false,
        error: 'morph blew up',
      } as unknown as EditResult);

      try {
        await callTool(kernel, cfg);
        expect.fail('expected ToolError');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        expect((error as ToolError).data.message).toMatch(/morph blew up/);
      }
    });
  });
});
