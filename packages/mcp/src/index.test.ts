import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  exportModelInputSchema,
  evaluateModelInputSchema,
  screenshotInputSchema,
  testModelInputSchema,
} from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import { createTauMcpAdapter, createTauMcpServer, tauMcpToolDefinitions, tauMcpToolNames } from '#tau-mcp.js';
import type { TauMcpDispatch } from '#tau-mcp.js';

describe('@taucad/mcp', () => {
  it('exports only the four CAD tools with canonical schemas', () => {
    expect(tauMcpToolNames).toEqual([
      toolName.evaluateModel,
      toolName.testModel,
      toolName.screenshot,
      toolName.exportModel,
    ]);
    expect(tauMcpToolNames).not.toContain('create_file');
    expect(tauMcpToolNames).not.toContain('edit_file');
    expect(tauMcpToolNames).not.toContain('delete_file');
    expect(tauMcpToolDefinitions[toolName.evaluateModel].inputSchema).toBe(evaluateModelInputSchema);
    expect(tauMcpToolDefinitions[toolName.testModel].inputSchema).toBe(testModelInputSchema);
    expect(tauMcpToolDefinitions[toolName.screenshot].inputSchema).toBe(screenshotInputSchema);
    expect(tauMcpToolDefinitions[toolName.exportModel].inputSchema).toBe(exportModelInputSchema);
  });

  it('runs through the transport-neutral dispatch port', async () => {
    const adapter = createTauMcpAdapter({
      dispatch: async () => ({ success: true, status: 'ready' }),
    });

    await expect(
      adapter.call({ name: toolName.evaluateModel, arguments: { targetFile: 'main.ts' }, toolCallId: 'tool-1' }),
    ).resolves.toMatchObject({
      structuredContent: { status: 'ready' },
    });
  });

  it('should preserve structured failure details from the dispatch authority', async () => {
    const failure = {
      errorCode: 'TOOL_OUTPUT_VALIDATION_FAILED',
      message: 'Invalid export output',
      toolName: 'export_model',
      toolCallId: 'tool-2',
      validationErrors: [{ path: 'files', message: 'Required' }],
      rawOutput: { unexpected: true },
    };
    const adapter = createTauMcpAdapter({ dispatch: async () => failure });
    const result = await adapter.call({
      name: toolName.exportModel,
      arguments: { targetFile: 'main.tsx', to: 'netlist' },
      toolCallId: 'tool-2',
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(failure);
    expect(result.content).toEqual([{ type: 'text', text: 'TOOL_OUTPUT_VALIDATION_FAILED: Invalid export output' }]);
  });

  it('assigns independent MCP requests distinct host tool identities', async () => {
    const ids: string[] = [];
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        const server = createTauMcpServer({
          dispatch: async (_call, options) => {
            ids.push(options.toolCallId);
            return { success: true, status: 'ready' };
          },
        });
        const client = new Client({ name: 'tau-mcp-test', version: '1' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        try {
          await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
          await client.callTool({ name: toolName.evaluateModel, arguments: { targetFile: 'main.ts' } });
        } finally {
          await client.close();
          await server.close();
        }
      }),
    );

    expect(new Set(ids).size).toBe(2);
  });

  it('captures a single isometric image when an MCP client omits screenshot mode', async () => {
    const calls: unknown[] = [];
    const server = createTauMcpServer({
      dispatch: async (call) => {
        calls.push(call);
        return { success: false, errorCode: 'RENDER_TIMEOUT', message: 'Renderer did not settle.' };
      },
    });
    const client = new Client({ name: 'tau-mcp-test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      await client.callTool({ name: toolName.screenshot, arguments: { targetFile: 'main.ts', view: 'model' } });
    } finally {
      await client.close();
      await server.close();
    }

    expect(calls).toMatchObject([{ args: { targetFile: 'main.ts', mode: 'single' } }]);
  });

  it('maps export requests to the canonical RPC and forwards cancellation metadata', async () => {
    const dispatchMock = vi.fn();
    const dispatch: TauMcpDispatch = async (call, options) => {
      dispatchMock(call, options);
      if (!('rpcName' in call) || call.rpcName !== rpcName.exportModel) {
        throw new Error(`Unexpected call ${JSON.stringify(call)}`);
      }
      return {
        success: true,
        to: 'glb',
        exportId: 'board',
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
      name: toolName.exportModel,
      arguments: { targetFile: 'main.ts', to: 'glb' },
      toolCallId: 'tool-2',
      signal,
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      {
        rpcName: rpcName.exportModel,
        args: { targetFile: 'main.ts', to: 'glb', toolCallId: 'tool-2' },
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
      structuredContent: { success: false, errorCode: 'RENDER_TIMEOUT', message: 'Renderer did not settle.' },
    });
  });

  it('returns screenshot artifact links without inline image bytes', async () => {
    const sha256 = 'a'.repeat(64);
    const image = {
      view: 'isometric',
      path: `attachments/${sha256}.webp`,
      absolutePath: `/tmp/tau-capture/${sha256}.webp`,
      mimeType: 'image/webp',
      byteLength: 3,
      sha256,
    };
    const adapter = createTauMcpAdapter({
      dispatch: async () => ({ success: true, images: [image] }),
    });

    const result = await adapter.call({
      name: toolName.screenshot,
      arguments: { mode: 'single', targetFile: 'main.ts' },
      toolCallId: 'tool-image',
    });

    expect(result.content).toEqual([
      {
        type: 'text',
        text: `Captured 1 CAD view. Open each local image with your image-viewing tool:\nisometric: /tmp/tau-capture/${sha256}.webp`,
      },
      {
        type: 'resource_link',
        uri: `file:///tmp/tau-capture/${sha256}.webp`,
        name: 'isometric screenshot',
        mimeType: 'image/webp',
      },
    ]);
    expect(result.structuredContent).toEqual({ images: [image] });
    expect(JSON.stringify(result)).not.toContain('AQID');
  });

  it('should say in the text line what the images leave out of the viewer', async () => {
    const message = 'Section cutaways narrower than 180° are not shown in captures.';
    const sha256 = 'b'.repeat(64);
    const image = {
      view: 'isometric',
      path: `attachments/${sha256}.webp`,
      absolutePath: `/tmp/tau-capture/${sha256}.webp`,
      mimeType: 'image/webp',
      byteLength: 3,
      sha256,
    };
    const adapter = createTauMcpAdapter({
      dispatch: async () => ({ success: true, images: [image], message }),
    });

    const result = await adapter.call({
      name: toolName.screenshot,
      arguments: { mode: 'single', targetFile: 'main.ts' },
      toolCallId: 'tool-omitted',
    });

    expect(result.content[0]).toEqual({
      type: 'text',
      text: `Captured 1 CAD view. ${message} Open each local image with your image-viewing tool:\nisometric: /tmp/tau-capture/${sha256}.webp`,
    });
    expect(result.structuredContent).toMatchObject({ message });
  });
});
