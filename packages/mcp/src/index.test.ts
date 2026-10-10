import { PassThrough } from 'node:stream';
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
import {
  createTauMcpAdapter,
  createTauMcpServer,
  serveTauMcpStdio,
  tauMcpToolDefinitions,
  tauMcpToolNames,
} from '#tau-mcp.js';
import type { TauMcpDispatch, TauMcpServerOptions } from '#tau-mcp.js';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load this package's own package.json.
import packageJson from '../package.json' with { type: 'json' };

/**
 * Connect the SDK client — the one Claude Code embeds — to a fresh server.
 *
 * @param options - Server options.
 * @returns The connected client; closing it closes the server too.
 */
const connect = async (options: TauMcpServerOptions): Promise<Client> => {
  const server = createTauMcpServer(options);
  const client = new Client({ name: 'tau-mcp-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
};

const screenshotImage = (sha256: string) => ({
  view: 'isometric',
  path: `attachments/${sha256}.webp`,
  absolutePath: `/tmp/tau-capture/${sha256}.webp`,
  mimeType: 'image/webp',
  byteLength: 3,
  sha256,
});

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

  it('should carry failure details as text the SDK client delivers instead of rejecting', async () => {
    const failure = {
      errorCode: 'TOOL_OUTPUT_VALIDATION_FAILED',
      message: 'Invalid export output',
      toolName: 'export_model',
      toolCallId: 'tool-2',
      validationErrors: [{ path: 'files', message: 'Required' }],
      rawOutput: { unexpected: true },
    };
    const client = await connect({ dispatch: async () => failure });
    try {
      // `export_model` declares an output schema; a failure that carried structured content would fail it.
      const result = await client.callTool({
        name: toolName.exportModel,
        arguments: { targetFile: 'main.tsx', to: 'netlist' },
      });
      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: 'TOOL_OUTPUT_VALIDATION_FAILED: Invalid export output\n{"validationErrors":[{"path":"files","message":"Required"}],"rawOutput":{"unexpected":true}}',
          },
        ],
      });
    } finally {
      await client.close();
    }
  });

  it('should clip a failure detail line that would flood the agent context', async () => {
    const adapter = createTauMcpAdapter({
      dispatch: async () => ({
        errorCode: 'TOOL_OUTPUT_VALIDATION_FAILED',
        message: 'Bad',
        rawOutput: 'A'.repeat(10_000),
      }),
    });
    const result = await adapter.call({
      name: toolName.evaluateModel,
      arguments: { targetFile: 'main.ts' },
      toolCallId: 'x',
    });
    const [block] = result.content;
    if (block?.type !== 'text') {
      throw new Error('missing failure text');
    }
    const [summary, details] = block.text.split('\n');
    expect(summary).toBe('TOOL_OUTPUT_VALIDATION_FAILED: Bad');
    expect(details).toHaveLength(2001);
    expect(details?.endsWith('…')).toBe(true);
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
    });
  });

  it('returns screenshot artifact links without inline image bytes', async () => {
    const sha256 = 'a'.repeat(64);
    const image = screenshotImage(sha256);
    const adapter = createTauMcpAdapter({
      // A dispatcher that also fills the bytes must not leak them into an attachments result.
      dispatch: async () => ({ success: true, images: [{ ...image, dataUrl: 'data:image/webp;base64,AQID' }] }),
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
    const image = screenshotImage('b'.repeat(64));
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
      text: `Captured 1 CAD view. ${message} Open each local image with your image-viewing tool:\nisometric: ${image.absolutePath}`,
    });
    expect(result.structuredContent).toMatchObject({ message });
  });

  it('should return inline screenshots as image blocks under a tool with no output schema', async () => {
    const sourceRevision = { entry: 'main.ts', files: { 'main.ts': `sha256:${'c'.repeat(64)}` } };
    const front = { ...screenshotImage('d'.repeat(64)), angle: 'front', dataUrl: 'data:image/webp;base64,AQID' };
    const top = { ...screenshotImage('e'.repeat(64)), angle: 'top', dataUrl: 'data:image/webp;base64,BAUG' };
    const client = await connect({
      dispatch: async () => ({ success: true, images: [front, top], sourceRevision }),
      screenshotImages: 'inline',
    });
    try {
      const { tools } = await client.listTools();
      expect(tools.find(({ name }) => name === toolName.screenshot)?.outputSchema).toBeUndefined();
      expect(tools.find(({ name }) => name === toolName.evaluateModel)?.outputSchema).toBeDefined();

      const result = await client.callTool({
        name: toolName.screenshot,
        arguments: { mode: 'multi_angle', targetFile: 'main.ts' },
      });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: [
              'Captured 2 CAD views. The images follow in this order; each is also saved locally:',
              `isometric front: ${front.absolutePath} (3 bytes)`,
              `isometric top: ${top.absolutePath} (3 bytes)`,
              `sourceRevision: ${JSON.stringify(sourceRevision)}`,
            ].join('\n'),
          },
          { type: 'image', data: 'AQID', mimeType: 'image/webp' },
          { type: 'image', data: 'BAUG', mimeType: 'image/webp' },
        ],
      });
    } finally {
      await client.close();
    }
  });

  it('should ask Claude Code to load every tool upfront', async () => {
    const client = await connect({
      dispatch: async () => ({ success: true }),
      hostTools: [{ name: 'arrange_workbench', description: 'Arrange panes.', inputSchema: { type: 'object' } }],
    });
    try {
      const { tools } = await client.listTools();
      expect(tools.map(({ name, _meta }) => ({ name, _meta }))).toEqual(
        [...tauMcpToolNames, 'arrange_workbench'].map((name) => ({ name, _meta: { 'anthropic/alwaysLoad': true } })),
      );
    } finally {
      await client.close();
    }
  });

  it('should report its own package name and version as server info', async () => {
    const client = await connect({ dispatch: async () => ({ success: true }) });
    try {
      expect(client.getServerVersion()).toEqual({ name: '@taucad/mcp', version: packageJson.version });
    } finally {
      await client.close();
    }
  });

  it('should speak stdio over the streams it is given', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const server = await serveTauMcpStdio({ dispatch: async () => ({ success: true }) }, { stdin, stdout });
    try {
      stdout.setEncoding('utf8');
      const reply = new Promise<string>((resolve) => {
        stdout.once('data', resolve);
      });
      stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stdio-test', version: '1' } },
        })}\n`,
      );
      expect(JSON.parse(await reply)).toMatchObject({
        id: 1,
        result: { serverInfo: { name: '@taucad/mcp', version: packageJson.version } },
      });
    } finally {
      await server.close();
    }
  });
});
