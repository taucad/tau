import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { createTauMcpServer } from '#tau-mcp.js';
import type { TauMcpViewer } from '#tau-mcp-viewer.js';
import { resolveTauViewerPresentation, tauViewerResourceUri, tauViewerToolName } from '#viewer-protocol.js';
import type { TauViewerModel, TauViewerViewState } from '#viewer-protocol.js';

const uiExtension = { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } };

/** The `initialize` shapes the hosts send (Claude Code and Codex CLI from the host probes; the UI hosts from their sources). */
const clients = {
  claudeCode: {
    info: { name: 'claude-code', version: '2.1.296' },
    capabilities: { roots: { listChanged: true }, elicitation: { form: {}, url: {} } },
  },
  codexCli: {
    info: { name: 'codex-mcp-client', version: '0.157.1' },
    capabilities: { experimental: { 'codex/auth-change': {} }, elicitation: { form: {}, url: {} } },
  },
  codexDesktop: {
    info: { name: 'codex-mcp-client', version: '0.157.1' },
    capabilities: { elicitation: { form: {}, url: {} }, extensions: uiExtension },
  },
  claudeDesktop: {
    info: { name: 'claude-ai', version: '2.31226.1' },
    capabilities: { extensions: uiExtension },
  },
} as const satisfies Record<string, { info: { name: string; version: string }; capabilities: ClientCapabilities }>;

const page = { html: '<!doctype html><title>Tau viewer</title>', sha256: 'a'.repeat(64) };
const resourceUri = tauViewerResourceUri(page.sha256);

const model: TauViewerModel = {
  id: 'model-1',
  title: 'bracket',
  path: '.tau/artifacts/bracket.glb',
  sourceFile: 'src/bracket.ts',
  mimeType: 'model/gltf-binary',
  byteLength: 6,
  sha256: 'b'.repeat(64),
};

const view: TauViewerViewState = {
  model: { id: 'model-1', title: 'bracket', path: '.tau/artifacts/bracket.glb', sourceFile: 'src/bracket.ts' },
  selected: [{ componentId: 'component:arm', label: 'Arm', kind: 'part', selector: 'node/2' }],
  hidden: ['component:bolt'],
  isolated: [],
  camera: { target: [0, 0, 0], direction: [1, 1, 1], up: [0, 0, 1], verticalSpan: 0.12 },
  sectionActive: false,
  measurementCount: 1,
  composition: 'tab',
  interactedAt: 1_700_000_000_000,
};

const createViewer = (): TauMcpViewer => ({
  page,
  show: vi.fn<TauMcpViewer['show']>(async (_input, options) => ({
    model,
    ...(options.presentation === 'text' ? { viewerUrl: 'http://127.0.0.1:4100/?model=model-1' } : {}),
  })),
  open: vi.fn<TauMcpViewer['open']>(async () => ({ model })),
  browse: vi.fn<TauMcpViewer['browse']>(async () => ({ files: [{ path: 'src/bracket.ts', title: 'bracket' }] })),
  read: vi.fn<TauMcpViewer['read']>(async (input) => ({
    offset: input.offset,
    byteLength: 2,
    totalBytes: 6,
    data: Buffer.from('gl').toString('base64'),
  })),
  sync: vi.fn<TauMcpViewer['sync']>(async () => ({ version: 1 })),
  viewState: vi.fn<TauMcpViewer['viewState']>(async (input) => ({
    view,
    ...(input.capture === true ? ({ image: { mimeType: 'image/png', data: 'cG5n' } } as const) : {}),
  })),
  captureReply: vi.fn<TauMcpViewer['captureReply']>(async () => ({ accepted: true })),
});

const connect = async (
  client: (typeof clients)[keyof typeof clients],
  viewer: TauMcpViewer = createViewer(),
): Promise<Client> => {
  const server = createTauMcpServer({
    dispatch: async () => ({ errorCode: 'UNUSED', message: 'unused' }),
    viewer,
  });
  const mcpClient = new Client(client.info, { capabilities: client.capabilities });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  return mcpClient;
};

const viewerTools = async (client: Client) => {
  const { tools } = await client.listTools();
  return Object.fromEntries(
    tools
      .filter((tool) =>
        [
          'show_model',
          'open_model_file',
          'browse_models',
          'app_read',
          'view_state',
          'app_sync',
          'app_capture_reply',
        ].includes(tool.name),
      )
      .map((tool) => [tool.name, tool._meta]),
  );
};

describe('resolveTauViewerPresentation', () => {
  it('should choose by the UI extension first and the Codex client name second', () => {
    expect(
      resolveTauViewerPresentation({
        capabilities: clients.claudeCode.capabilities,
        clientInfo: clients.claudeCode.info,
      }),
    ).toBe('text');
    expect(
      resolveTauViewerPresentation({ capabilities: clients.codexCli.capabilities, clientInfo: clients.codexCli.info }),
    ).toBe('text');
    expect(
      resolveTauViewerPresentation({
        capabilities: clients.codexDesktop.capabilities,
        clientInfo: clients.codexDesktop.info,
      }),
    ).toBe('openai');
    expect(
      resolveTauViewerPresentation({
        capabilities: clients.claudeDesktop.capabilities,
        clientInfo: clients.claudeDesktop.info,
      }),
    ).toBe('inline');
  });

  it('should present text when the extension lacks the page media type', () => {
    expect(
      resolveTauViewerPresentation({
        capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html'] } } },
      }),
    ).toBe('text');
  });
});

describe('Tau MCP viewer', () => {
  it('should give a text host show_model and view_state, returning a loopback link', async () => {
    const client = await connect(clients.claudeCode);

    expect(await viewerTools(client)).toEqual({
      [tauViewerToolName.showModel]: { 'anthropic/alwaysLoad': true },
      [tauViewerToolName.viewState]: { 'anthropic/alwaysLoad': true },
    });
    const result = await client.callTool({ name: 'show_model', arguments: { targetFile: 'src/bracket.ts' } });
    expect(result.content).toEqual([
      { type: 'text', text: 'Open src/bracket.ts in the Tau viewer: http://127.0.0.1:4100/?model=model-1' },
    ]);
    await client.close();
  });

  it('should treat the Codex CLI as a text host', async () => {
    const client = await connect(clients.codexCli);

    expect(Object.keys(await viewerTools(client))).toEqual(['show_model', 'view_state']);
    await client.close();
  });

  it('should name the page on an MCP Apps host and hide the read tool from the model', async () => {
    const client = await connect(clients.claudeDesktop);

    expect(await viewerTools(client)).toEqual({
      [tauViewerToolName.showModel]: {
        'anthropic/alwaysLoad': true,
        ui: { resourceUri },
        'ui/resourceUri': resourceUri,
      },
      [tauViewerToolName.appRead]: { 'anthropic/alwaysLoad': true, ui: { resourceUri, visibility: ['app'] } },
      [tauViewerToolName.viewState]: { 'anthropic/alwaysLoad': true },
      [tauViewerToolName.appSync]: { 'anthropic/alwaysLoad': true, ui: { resourceUri, visibility: ['app'] } },
      [tauViewerToolName.appCaptureReply]: { 'anthropic/alwaysLoad': true, ui: { resourceUri, visibility: ['app'] } },
    });
    /* The live link's tools are classified, so a host neither prompts for nor treats them as open-world calls. */
    const { tools } = await client.listTools();
    for (const name of [tauViewerToolName.appSync, tauViewerToolName.appCaptureReply]) {
      expect(tools.find((tool) => tool.name === name)?.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
    }
    const result = await client.callTool({ name: 'show_model', arguments: {} });
    expect(result.structuredContent).toEqual({ model });
    expect(result.content).toEqual([{ type: 'text', text: 'Showing src/bracket.ts in the Tau viewer.' }]);
    await client.close();
  });

  it('should declare the three OpenAI entrypoints for Codex desktop', async () => {
    const client = await connect(clients.codexDesktop);
    const openai = { ui: { resourceUri }, 'ui/resourceUri': resourceUri, 'openai/outputTemplate': resourceUri };

    expect(await viewerTools(client)).toEqual({
      [tauViewerToolName.showModel]: {
        'anthropic/alwaysLoad': true,
        ...openai,
        'openai/ui': { entrypoints: [{ type: 'thread' }] },
      },
      [tauViewerToolName.openModelFile]: {
        'anthropic/alwaysLoad': true,
        ...openai,
        'openai/ui': {
          entrypoints: [{ type: 'file', extensions: ['glb', 'svg', 'step', 'stp', 'stl', '3mf', 'obj'] }],
        },
      },
      [tauViewerToolName.browseModels]: {
        'anthropic/alwaysLoad': true,
        ...openai,
        'openai/ui': { entrypoints: [{ type: 'global' }] },
      },
      [tauViewerToolName.appRead]: { 'anthropic/alwaysLoad': true, ui: { resourceUri, visibility: ['app'] } },
      [tauViewerToolName.viewState]: { 'anthropic/alwaysLoad': true },
      [tauViewerToolName.appSync]: { 'anthropic/alwaysLoad': true, ui: { resourceUri, visibility: ['app'] } },
      [tauViewerToolName.appCaptureReply]: { 'anthropic/alwaysLoad': true, ui: { resourceUri, visibility: ['app'] } },
    });
    await client.close();
  });

  it('should serve the page with a CSP that allows no origin', async () => {
    const client = await connect(clients.claudeDesktop);

    const { resources } = await client.listResources();
    expect(resources).toContainEqual(
      expect.objectContaining({ uri: resourceUri, mimeType: 'text/html;profile=mcp-app' }),
    );
    const read = await client.readResource({ uri: resourceUri });
    expect(read.contents).toEqual([
      {
        uri: resourceUri,
        mimeType: 'text/html;profile=mcp-app',
        text: page.html,
        _meta: {
          ui: {
            csp: { connectDomains: ['data:', 'blob:'], resourceDomains: ['data:', 'blob:'] },
            permissions: { clipboardWrite: {} },
            prefersBorder: true,
          },
        },
      },
    ]);
    await client.close();
  });

  it('should take the opened file from a Codex file entrypoint', async () => {
    const viewer = createViewer();
    const client = await connect(clients.codexDesktop, viewer);

    await client.callTool({
      name: 'open_model_file',
      arguments: {},
      _meta: { 'openai/resource': { path: '/work/models/part.glb' } },
    });
    expect(viewer.open).toHaveBeenCalledWith(
      { path: '/work/models/part.glb' },
      expect.objectContaining({ presentation: 'openai' }),
    );
    await client.close();
  });

  it('should return ranged bytes and refuse a range over the reply limit', async () => {
    const client = await connect(clients.claudeDesktop);

    const read = await client.callTool({ name: 'app_read', arguments: { modelId: 'model-1', offset: 2, length: 2 } });
    expect(read.structuredContent).toEqual({ offset: 2, byteLength: 2, totalBytes: 6, data: 'Z2w=' });
    const tooLong = await client.callTool({
      name: 'app_read',
      arguments: { modelId: 'model-1', offset: 0, length: 4 * 1024 * 1024 + 1 },
    });
    expect(tooLong.isError).toBe(true);
    await client.close();
  });

  it('should pass the components to select through show_model', async () => {
    const viewer = createViewer();
    const client = await connect(clients.claudeDesktop, viewer);

    await client.callTool({
      name: 'show_model',
      arguments: { targetFile: 'src/bracket.ts', select: ['component:arm'] },
    });
    expect(viewer.show).toHaveBeenCalledWith(
      { targetFile: 'src/bracket.ts', select: ['component:arm'] },
      expect.objectContaining({ presentation: 'inline' }),
    );
    await client.close();
  });

  it('should describe the view and return a capture as an image block', async () => {
    const client = await connect(clients.claudeDesktop);

    const plain = await client.callTool({ name: 'view_state', arguments: {} });
    expect(plain.structuredContent).toEqual({ view });
    expect(plain.content).toEqual([
      {
        type: 'text',
        text: [
          'The Tau viewer (a tab) shows src/bracket.ts.',
          'Selected: Arm (component:arm).',
          'Hidden: component:bolt. Isolated: none.',
          'Camera looks at (0.00, 0.00, 0.00) from direction (1.00, 1.00, 1.00), spanning 0.120 m.',
          'Section view off; 1 measurements.',
        ].join('\n'),
      },
    ]);
    const captured = await client.callTool({ name: 'view_state', arguments: { capture: true } });
    expect(captured.content).toContainEqual({ type: 'image', data: 'cG5n', mimeType: 'image/png' });
    await client.close();
  });

  it('should check what the page sends to app_sync and app_capture_reply', async () => {
    const viewer = createViewer();
    const client = await connect(clients.claudeDesktop, viewer);

    const synced = await client.callTool({
      name: 'app_sync',
      arguments: { pageId: 'page-0001', version: 0, follow: true, wait: false, view },
    });
    expect(synced.structuredContent).toEqual({ version: 1 });
    const malformed = await client.callTool({ name: 'app_sync', arguments: { pageId: 'p', version: -1 } });
    expect(malformed.isError).toBe(true);
    const reply = await client.callTool({
      name: 'app_capture_reply',
      arguments: { requestId: 'r1', pageId: 'page-0001', image: { mimeType: 'image/png', data: 'cG5n' } },
    });
    expect(reply.structuredContent).toEqual({ accepted: true });
    await client.close();
  });

  it('should report a host failure as an error result', async () => {
    const viewer = { ...createViewer(), show: async () => ({ errorCode: 'NOT_FOUND', message: 'No such file.' }) };
    const client = await connect(clients.claudeDesktop, viewer);

    const result = await client.callTool({ name: 'show_model', arguments: { targetFile: 'missing.ts' } });
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'NOT_FOUND: No such file.' }] });
    await client.close();
  });
});
