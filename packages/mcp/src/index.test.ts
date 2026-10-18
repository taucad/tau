import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ElicitRequest, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
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
  parseTauMcpLaunch,
  serveTauMcpStdio,
  tauMcpInstructions,
  tauMcpToolDefinitions,
  tauMcpToolNames,
} from '#tau-mcp.js';
import type { TauMcpConfirm, TauMcpDispatch, TauMcpRuntime, TauMcpServerOptions } from '#tau-mcp.js';
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

  it('returns the default view mesh cost in the evaluate_model result through a connected client', async () => {
    const tessellation = {
      triangles: 1308,
      vertices: 656,
      elapsed: 42,
      voxelSize: 0.5,
      activeVoxels: 2846,
      memoryBytes: 1_296_848,
    };
    const client = await connect({ dispatch: async () => ({ success: true, status: 'ready', tessellation }) });
    try {
      const result = await client.callTool({ name: toolName.evaluateModel, arguments: { targetFile: 'main.ts' } });
      expect(result.structuredContent).toEqual({ status: 'ready', tessellation });
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ status: 'ready', tessellation }) }]);
    } finally {
      await client.close();
    }
  });

  it('should return the effective tessellation resolution in the evaluate_model result (I7)', async () => {
    const tessellation = {
      triangles: 1_999_872,
      vertices: 1_000_014,
      elapsed: 812,
      requested: 'extra-high',
      linearTolerance: 0.02,
      angularTolerance: 10,
      downgraded: 1,
    };
    const client = await connect({ dispatch: async () => ({ success: true, status: 'ready', tessellation }) });
    try {
      const result = await client.callTool({ name: toolName.evaluateModel, arguments: { targetFile: 'main.ts' } });
      expect(result.structuredContent).toEqual({ status: 'ready', tessellation });
    } finally {
      await client.close();
    }
  });

  it('should pass evaluate_model default view options to the canonical RPC through a connected client', async () => {
    const dispatchMock = vi.fn<TauMcpDispatch>(async () => ({ success: true, status: 'ready' }));
    const client = await connect({ dispatch: dispatchMock });
    try {
      await client.callTool({
        name: toolName.evaluateModel,
        arguments: { targetFile: 'main.ts', options: { tessellation: 'low' } },
      });
      await client.callTool({ name: toolName.evaluateModel, arguments: { targetFile: 'main.ts' } });
    } finally {
      await client.close();
    }

    expect(dispatchMock.mock.calls.map(([call]) => call)).toEqual([
      { rpcName: rpcName.evaluateModel, args: { targetFile: 'main.ts', options: { tessellation: 'low' } } },
      { rpcName: rpcName.evaluateModel, args: { targetFile: 'main.ts' } },
    ]);
  });

  it('should refuse invalid evaluate_model options as screenshot refuses them', async () => {
    const dispatchMock = vi.fn<TauMcpDispatch>(async () => ({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'model option tessellation: Invalid input',
    }));
    const adapter = createTauMcpAdapter({ dispatch: dispatchMock });

    for (const name of [toolName.evaluateModel, toolName.screenshot]) {
      // oxlint-disable-next-line no-await-in-loop -- each tool's refusal is asserted in turn.
      await expect(
        adapter.call({ name, arguments: { targetFile: 'main.ts', options: 'low' }, toolCallId: 'tool-invalid' }),
      ).rejects.toThrow();
    }
    expect(dispatchMock).not.toHaveBeenCalled();

    await expect(
      adapter.call({
        name: toolName.evaluateModel,
        arguments: { targetFile: 'main.ts', options: { tessellation: 'coarse' } },
        toolCallId: 'tool-refused',
      }),
    ).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: 'VALIDATION_ERROR: model option tessellation: Invalid input' }],
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

  it('should name the project root in each CAD result, and in the text of an inline screenshot', async () => {
    const projectRoot = '/work/gear';
    const image = { ...screenshotImage('f'.repeat(64)), dataUrl: 'data:image/webp;base64,AQID' };
    const exported = {
      to: 'glb',
      exportId: 'glb',
      files: [
        { name: 'model.glb', artifactPath: '.tau/artifacts/x/model.glb', mimeType: 'model/gltf-binary', byteLength: 3 },
      ],
    };
    const answers: Readonly<Record<string, Record<string, unknown>>> = {
      [rpcName.evaluateModel]: { status: 'ready' },
      [rpcName.runGeoSpecTests]: { passed: 1, total: 1, failures: [], passes: [] },
      [rpcName.exportModel]: exported,
      [rpcName.captureImages]: { images: [image] },
    };
    const client = await connect({
      dispatch: async (call) => ({ success: true, ...('rpcName' in call ? answers[call.rpcName] : {}), projectRoot }),
      screenshotImages: 'inline',
    });
    try {
      const evaluated = await client.callTool({ name: toolName.evaluateModel, arguments: { targetFile: 'main.ts' } });
      const tested = await client.callTool({ name: toolName.testModel, arguments: {} });
      const exportedResult = await client.callTool({
        name: toolName.exportModel,
        arguments: { targetFile: 'main.ts', to: 'glb' },
      });
      const captured = await client.callTool({ name: toolName.screenshot, arguments: { targetFile: 'main.ts' } });

      expect(evaluated.structuredContent).toEqual({ status: 'ready', projectRoot });
      expect(tested.structuredContent).toMatchObject({ passed: 1, total: 1, projectRoot });
      expect(exportedResult.structuredContent).toEqual({ ...exported, projectRoot });
      expect(captured.content).toContainEqual({
        type: 'text',
        text: [
          'Captured 1 CAD view. The images follow in this order; each is also saved locally:',
          `isometric: ${image.absolutePath} (3 bytes)`,
          `projectRoot: ${projectRoot}`,
        ].join('\n'),
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

  it('should list only the CAD tools the host names, with their canonical descriptions', async () => {
    const client = await connect({
      dispatch: async () => ({ success: true }),
      cadTools: tauMcpToolNames.filter((name) => name !== toolName.testModel),
    });
    try {
      const { tools } = await client.listTools();
      expect(tools.map(({ name }) => name)).toEqual([
        toolName.evaluateModel,
        toolName.screenshot,
        toolName.exportModel,
      ]);
      expect(tools.find(({ name }) => name === toolName.evaluateModel)?.description).toBe(
        tauMcpToolDefinitions[toolName.evaluateModel].description,
      );
      expect(client.getInstructions()).not.toContain(toolName.testModel);
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

describe('identity and client-gated capability (INS-2)', () => {
  const installed: NonNullable<TauMcpRuntime['launch']> = {
    source: 'installed',
    path: '/opt/homebrew/bin/tau',
    cli: '0.1.0-beta.7',
    plugin: '0.1.0-beta.7',
    node: '24.20.0',
    skipped: [],
  };

  const instructionsOf = async (runtime?: TauMcpServerOptions['runtime']): Promise<string | undefined> => {
    const client = await connect({ dispatch: async () => ({ success: true }), runtime });
    try {
      return client.getInstructions();
    } finally {
      await client.close();
    }
  };

  it('should name the CLI, its rung, the plugin and Node.js after the guidance', async () => {
    const instructions = await instructionsOf({ version: '0.1.0-beta.7', launch: installed });

    expect(instructions).toMatch(/^Use your native filesystem/u);
    expect(
      instructions?.endsWith(
        ` Tau CLI 0.1.0-beta.7 (installed tau at /opt/homebrew/bin/tau) started by plugin 0.1.0-beta.7 on Node.js 24.20.0; server @taucad/mcp ${packageJson.version}.`,
      ),
    ).toBe(true);
  });

  it('should name the installed tau the launcher passed over for npx', async () => {
    const instructions = await instructionsOf({
      version: '0.1.0-beta.7',
      launch: {
        source: 'npx',
        cli: '0.1.0-beta.7',
        plugin: '0.1.0-beta.7',
        node: '24.20.0',
        skipped: [{ path: '/usr/local/bin/tau', version: '0.1.0-beta.2' }, { path: '/opt/homebrew/bin/tau' }],
      },
    });

    expect(instructions).toContain(
      'Tau CLI 0.1.0-beta.7 (npx; installed tau 0.1.0-beta.2 at /usr/local/bin/tau and 1 more skipped) started by plugin 0.1.0-beta.7 on Node.js 24.20.0;',
    );
  });

  it('should say the CLI started directly when no launcher named itself', async () => {
    const instructions = await instructionsOf({ version: '0.1.0-beta.7' });

    expect(instructions).toMatch(/ Tau CLI 0\.1\.0-beta\.7 started directly; server @taucad\/mcp \S+\.$/u);
  });

  it('should read an unparseable descriptor as none', async () => {
    for (const value of [
      undefined,
      '',
      'not json',
      '{"source":"rocket"}',
      JSON.stringify({ ...installed, node: 24 }),
    ]) {
      expect(parseTauMcpLaunch(value)).toBeUndefined();
    }
    expect(parseTauMcpLaunch(JSON.stringify(installed))).toEqual(installed);

    const instructions = await instructionsOf({ version: '0.1.0-beta.7', launch: parseTauMcpLaunch('{') });
    expect(instructions).toContain('Tau CLI 0.1.0-beta.7 started directly;');
    expect(instructions).not.toContain('plugin');
  });

  it('should drop the paths from an identity sentence that would pass 250 characters, the skipped one first', async () => {
    const deep = (name: string): string => `/home/${'nested/'.repeat(12)}${name}/tau`;
    const identityOf = async (launch: NonNullable<TauMcpRuntime['launch']>): Promise<string> => {
      const instructions = (await instructionsOf({ version: '0.1.0-beta.7', launch })) ?? '';
      return instructions.slice(instructions.indexOf('Tau CLI'));
    };

    const one = await identityOf({ ...installed, path: deep('a'), skipped: [{ path: deep('b'), version: '0.1.0' }] });
    expect(one).toMatch(
      /^Tau CLI 0\.1\.0-beta\.7 \(installed tau at \/home\/\S+\/a\/tau; installed tau 0\.1\.0 skipped\)/u,
    );
    const none = await identityOf({ ...installed, path: `/home/${'nested/'.repeat(30)}bin/tau` });
    expect(none).toMatch(/^Tau CLI 0\.1\.0-beta\.7 \(installed tau\) started by plugin/u);
    expect(Math.max(one.length, none.length)).toBeLessThanOrEqual(250);
  });

  it('should keep the sentence within 250 characters whatever a skipped tau printed', async () => {
    const instructions =
      (await instructionsOf({
        version: '0.1.0-beta.7',
        launch: {
          ...installed,
          skipped: [
            { path: '/usr/local/bin/tau', version: 'x'.repeat(120) },
            { path: '/usr/bin/tau', version: '1.0.0' },
          ],
        },
      })) ?? '';
    const identity = instructions.slice(instructions.indexOf('Tau CLI'));

    expect(identity).toContain('; installed tau of unknown version at /usr/local/bin/tau and 1 more skipped)');
    expect(identity).not.toContain('xxx');
    expect(identity.length).toBeLessThanOrEqual(250);
  });

  it('should drop clauses until the sentence fits, and read an oversized version as no descriptor', async () => {
    const long = `0.1.0-${'a'.repeat(58)}`;
    const identity = async (launch: NonNullable<TauMcpRuntime['launch']>): Promise<string> => {
      const instructions = (await instructionsOf({ version: '0.1.0-beta.7', launch })) ?? '';
      return instructions.slice(instructions.indexOf('Tau CLI'));
    };
    const crowded = await identity({
      ...installed,
      plugin: long,
      node: long,
      skipped: [{ path: '/usr/local/bin/tau', version: long }],
    });

    expect(crowded).not.toContain('skipped');
    expect(crowded.length).toBeLessThanOrEqual(250);
    expect(parseTauMcpLaunch(JSON.stringify({ ...installed, plugin: `${long}bbbbbbb` }))).toBeUndefined();
  });

  it('should leave the instructions as they were without a runtime', async () => {
    expect(await instructionsOf()).toBe(tauMcpInstructions);
  });

  /**
   * Initialize a stdio server as one client and read the capabilities it answers with.
   *
   * @param name - The client's `clientInfo.name`.
   * @returns The `initialize` result's capabilities.
   */
  const capabilitiesFor = async (name: string): Promise<Record<string, unknown>> => {
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
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name, version: '1' } },
        })}\n`,
      );
      const answer = JSON.parse(await reply) as { result: { capabilities: Record<string, unknown> } };
      return answer.result.capabilities;
    } finally {
      await server.close();
    }
  };

  it('should declare codex/sandbox-state-meta to Codex only', async () => {
    const codex = await capabilitiesFor('codex-mcp-client');
    const claude = await capabilitiesFor('claude-code');

    expect(codex).toMatchObject({ tools: {}, experimental: { 'codex/sandbox-state-meta': {} } });
    expect(claude).toMatchObject({ tools: {} });
    expect(claude).not.toHaveProperty('experimental');
  });
});

describe('approval through the client (blueprint E9, W11)', () => {
  /**
   * Call one host tool whose dispatch asks the person, with a client that declares `capabilities`.
   *
   * @param capabilities - What the client declares at `initialize`.
   * @param answer - The client's reply to the form, if it is asked.
   * @returns What the dispatch heard, and the form the client was shown.
   */
  const ask = async (capabilities: Record<string, unknown>, answer?: ElicitResult | (() => never)) => {
    let outcome: Awaited<ReturnType<TauMcpConfirm>> | 'no form' | 'failed' = 'no form';
    const shown: Array<ElicitRequest['params']> = [];
    const server = createTauMcpServer({
      hostTools: [{ name: 'request_print', description: 'Print.', inputSchema: { type: 'object' } }],
      dispatch: async (_call, options) => {
        if (options.confirm !== undefined) {
          outcome = await options
            .confirm({ message: 'Print plate.3mf on X1C?', label: 'Approve' })
            .catch((): 'failed' => 'failed');
        }
        return { success: true };
      },
    });
    const client = new Client({ name: 'tau-mcp-test', version: '1' }, { capabilities });
    if (answer !== undefined) {
      client.setRequestHandler(ElicitRequestSchema, async (request) => {
        shown.push(request.params);
        return typeof answer === 'function' ? answer() : answer;
      });
    }
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      await client.callTool({ name: 'request_print', arguments: {} });
      return { outcome, shown };
    } finally {
      await client.close();
    }
  };

  it('should ask a client that draws forms, and approve only a ticked box', async () => {
    const approved = await ask({ elicitation: { form: {} } }, { action: 'accept', content: { approve: true } });
    expect(approved.outcome).toBe('approved');
    expect(approved.shown.map(({ message }) => message)).toEqual(['Print plate.3mf on X1C?']);
    const [form] = approved.shown;
    expect(form !== undefined && 'requestedSchema' in form ? form.requestedSchema.required : undefined).toEqual([
      'approve',
    ]);
    const unticked = await ask({ elicitation: {} }, { action: 'accept', content: { approve: false } });
    const declined = await ask({ elicitation: {} }, { action: 'decline' });
    const dismissed = await ask({ elicitation: {} }, { action: 'cancel' });
    expect([unticked.outcome, declined.outcome, dismissed.outcome]).toEqual(['denied', 'denied', 'cancelled']);
  });

  it('should reject, not report the person cancelling, when the client fails to ask', async () => {
    const failed = await ask({ elicitation: { form: {} } }, () => {
      throw new Error('elicitation is broken in this client');
    });
    expect(failed.shown).toHaveLength(1);
    expect(failed.outcome).toBe('failed');
  });

  it('should not ask a client that cannot draw a form', async () => {
    const silent = await ask({});
    const urlOnly = await ask({ elicitation: { url: {} } });
    expect([silent.outcome, urlOnly.outcome]).toEqual(['no form', 'no form']);
  });
});

describe('progress on a host tool (D7)', () => {
  /**
   * Call one host tool whose dispatch reports three steps, with or without a progress listener.
   *
   * @param listen - Whether the client asks for progress.
   * @returns What the client heard, and whether the dispatch was given a reporter.
   */
  const callWithProgress = async (listen: boolean) => {
    let offered = false;
    const client = await connect({
      hostTools: [{ name: 'prepare_kernel', description: 'Prepare.', inputSchema: { type: 'object' } }],
      dispatch: async (_call, options) => {
        offered = options.progress !== undefined;
        for (const progress of [10, 20, 30]) {
          // oxlint-disable-next-line no-await-in-loop -- reports are ordered.
          await options.progress?.({ progress, total: 30, message: `step ${String(progress / 10)}` });
        }
        return { success: true, status: 'ready' };
      },
    });
    const heard: Array<{ progress: number; total?: number; message?: string }> = [];
    try {
      const result = await client.callTool(
        { name: 'prepare_kernel', arguments: { kernel: 'picogk' } },
        undefined,
        listen ? { onprogress: (report) => heard.push(report) } : {},
      );
      return { heard, offered, result };
    } finally {
      await client.close();
    }
  };

  it('should send each report as notifications/progress to a client that sent a progressToken', async () => {
    const { heard, offered, result } = await callWithProgress(true);

    expect(offered).toBe(true);
    expect(heard).toEqual([
      { progress: 10, total: 30, message: 'step 1' },
      { progress: 20, total: 30, message: 'step 2' },
      { progress: 30, total: 30, message: 'step 3' },
    ]);
    expect(result.structuredContent).toEqual({ status: 'ready' });
  });

  it('should send a CAD tool’s reports as notifications/progress too (VER-3)', async () => {
    const client = await connect({
      dispatch: async (_call, options) => {
        await options.progress?.({ progress: 0, message: 'Running 1 GeoSpec file' });
        await options.progress?.({ progress: 1, message: 'cube > is 20 mm wide (cube.geospec.ts)' });
        return { success: true, failures: [], passes: [], passed: 0, total: 0 };
      },
    });
    const heard: Array<{ progress: number; total?: number; message?: string }> = [];
    try {
      await client.callTool({ name: toolName.testModel, arguments: {} }, undefined, {
        onprogress: (report) => heard.push(report),
      });
    } finally {
      await client.close();
    }

    expect(heard).toEqual([
      { progress: 0, message: 'Running 1 GeoSpec file' },
      { progress: 1, message: 'cube > is 20 mm wide (cube.geospec.ts)' },
    ]);
  });

  it('should drop a report whose progress does not rise', async () => {
    const client = await connect({
      dispatch: async (_call, options) => {
        for (const progress of [0, 2, 2, 1, 3]) {
          // oxlint-disable-next-line no-await-in-loop -- reports go out in order.
          await options.progress?.({ progress });
        }
        return { success: true, failures: [], passes: [], passed: 0, total: 0 };
      },
    });
    const heard: number[] = [];
    try {
      await client.callTool({ name: toolName.testModel, arguments: {} }, undefined, {
        onprogress: (report) => heard.push(report.progress),
      });
    } finally {
      await client.close();
    }

    expect(heard).toEqual([0, 2, 3]);
  });

  it('should give the dispatch no reporter when the client sent no progressToken', async () => {
    const { heard, offered } = await callWithProgress(false);

    expect(offered).toBe(false);
    expect(heard).toEqual([]);
  });
});
