import { describe, expect, it, vi } from 'vitest';
import {
  exportGeometryInputSchema,
  getKernelResultInputSchema,
  screenshotInputSchema,
  testModelInputSchema,
} from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import { createTauMcpAdapter, tauMcpToolDefinitions, tauMcpToolNames } from '#tau-mcp.js';
import type { TauMcpDispatch } from '#tau-mcp.js';

describe('@taucad/mcp', () => {
  it('exports only the four read-only CAD tools with canonical schemas', () => {
    expect(tauMcpToolNames).toEqual([
      toolName.getKernelResult,
      toolName.testModel,
      toolName.screenshot,
      toolName.exportGeometry,
    ]);
    expect(tauMcpToolNames).not.toContain('create_file');
    expect(tauMcpToolNames).not.toContain('edit_file');
    expect(tauMcpToolNames).not.toContain('delete_file');
    expect(tauMcpToolDefinitions[toolName.getKernelResult].inputSchema).toBe(getKernelResultInputSchema);
    expect(tauMcpToolDefinitions[toolName.testModel].inputSchema).toBe(testModelInputSchema);
    expect(tauMcpToolDefinitions[toolName.screenshot].inputSchema).toBe(screenshotInputSchema);
    expect(tauMcpToolDefinitions[toolName.exportGeometry].inputSchema).toBe(exportGeometryInputSchema);
  });

  it('runs through the transport-neutral dispatch port', async () => {
    const adapter = createTauMcpAdapter({
      dispatch: async () => ({ success: true, status: 'ready' }),
    });

    await expect(
      adapter.call({ name: toolName.getKernelResult, arguments: { targetFile: 'main.ts' }, toolCallId: 'tool-1' }),
    ).resolves.toMatchObject({
      structuredContent: { status: 'ready' },
    });
  });

  it('maps export requests to the canonical RPC and forwards cancellation metadata', async () => {
    const dispatchMock = vi.fn();
    const dispatch: TauMcpDispatch = async (call, options) => {
      dispatchMock(call, options);
      if (call.rpcName !== rpcName.exportGeometry) {
        throw new Error(`Unexpected RPC ${call.rpcName}`);
      }
      return {
        success: true,
        format: 'glb',
        files: [
          {
            name: 'model.glb',
            artifactPath: '.tau/artifacts/model.glb',
            mimeType: 'model/gltf-binary',
            byteLength: 3,
          },
        ],
      };
    };
    const { signal } = new AbortController();
    const adapter = createTauMcpAdapter({ dispatch });

    await adapter.call({
      name: toolName.exportGeometry,
      arguments: { targetFile: 'main.ts', format: 'glb' },
      toolCallId: 'tool-2',
      signal,
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      {
        rpcName: rpcName.exportGeometry,
        args: { targetFile: 'main.ts', format: 'glb', toolCallId: 'tool-2' },
      },
      { toolCallId: 'tool-2', signal },
    );
  });

  it('does not dispatch invalid input and preserves typed RPC failures', async () => {
    const dispatchMock = vi.fn();
    const dispatch: TauMcpDispatch = async (call, options) => {
      dispatchMock(call, options);
      return {
        success: false,
        errorCode: 'RENDER_TIMEOUT',
        message: 'Renderer did not settle.',
      };
    };
    const adapter = createTauMcpAdapter({ dispatch });

    await expect(
      adapter.call({ name: toolName.screenshot, arguments: { mode: 'single' }, toolCallId: 'tool-3' }),
    ).rejects.toThrow();
    expect(dispatchMock).not.toHaveBeenCalled();

    await expect(
      adapter.call({
        name: toolName.screenshot,
        arguments: { mode: 'single', targetFile: 'main.ts' },
        toolCallId: 'tool-4',
      }),
    ).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: 'RENDER_TIMEOUT: Renderer did not settle.' }],
    });
  });
});
