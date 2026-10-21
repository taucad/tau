import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { createTauMcpServer } from '#tau-mcp.js';
import type { TauMcpViewer } from '#tau-mcp-viewer.js';
import {
  resolveTauViewerPresentation,
  tauViewerAcceptedViewFields,
  tauViewerResourceUri,
  tauViewerToolName,
} from '#viewer-protocol.js';
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
  it('should keep the instructions under 2,048 characters with the viewer and the identity sentence', async () => {
    const server = createTauMcpServer({
      dispatch: async () => ({ errorCode: 'UNUSED', message: 'unused' }),
      viewer: createViewer(),
      runtime: {
        version: '0.1.0-beta.7',
        launch: {
          source: 'npx',
          cli: '0.1.0-beta.7',
          plugin: '0.1.0-beta.7',
          node: '24.20.0',
          skipped: [{ path: '/Users/someone/.nvm/versions/node/v24.20.0/bin/tau', version: '0.1.0-beta.6' }],
        },
      },
    });
    const client = new Client(clients.claudeCode.info, { capabilities: clients.claudeCode.capabilities });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const instructions = client.getInstructions() ?? '';
    await client.close();

    expect(instructions).toMatch(/^Use your native filesystem/u);
    expect(instructions.slice(instructions.indexOf('Tau CLI 0.1.0-')).length).toBeLessThanOrEqual(250);
    expect(instructions.length).toBeLessThan(2048);
    expect(instructions.slice(0, instructions.indexOf(' Tau CLI 0.1.0-'))).toMatchInlineSnapshot(
      `"Use your native filesystem and shell tools to inspect and edit the current Tau project. Use your native skill loader for the Tau skills available in this session. For Tau CAD state, prefer this session's Tau MCP tools over generic computer-use, UI-automation, or operating-system tools. Before editing geometry, create or update executable GeoSpec tests for the requested requirements. After edits, call evaluate_model for build diagnostics and offered views/exports, test_model for GeoSpec requirements, and screenshot for each needed view. A static part is done when evaluate_model is ready, its summary bounds and componentCount fit the brief, and the whole test_model suite reports runStatus passed; inconclusive, unsupported and not-run requirements are undecided, not passed. A moving assembly also needs evaluate_model mechanism declared and admitted, and a file the person asked for its export_model validation (a watertight mesh, the expected STEP solids); name the case you met when reporting done. For a design question, export_model may write text/JSON evidence only when both its declaration and every output file qualify; read and compare its pinned sourceRevision. Binary or mixed deliverables require an explicit user export request. When the person should look at a model, call show_model on its source after evaluate_model succeeds: the Tau viewer shows the source with its parameters and mechanism, or returns a link to share; showing an exported file shows that file only. A reference like @cad[main.ts#component:node-1] names a part: the model file before # and the component id after it; when no reference reaches you, view_state lists the parts the person selected and added to chat with those ids, which show_model select and arrange_workbench also take."`,
    );
  });

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

  it('should say in the text what the shown GLB carries of a mechanism', async () => {
    const viewer = createViewer();
    vi.mocked(viewer.show)
      .mockResolvedValueOnce({ model, mechanism: { preserved: true, joints: 5, animations: ['four-sun-turns'] } })
      .mockResolvedValueOnce({ model, mechanism: { preserved: false, joints: 0, animations: [] } });
    const client = await connect(clients.claudeDesktop, viewer);

    const kept = await client.callTool({ name: 'show_model', arguments: {} });
    const lost = await client.callTool({ name: 'show_model', arguments: {} });

    expect(kept.content).toEqual([
      {
        type: 'text',
        text: 'Showing src/bracket.ts in the Tau viewer.\nMechanism: 5 joints, animations four-sun-turns.',
      },
    ]);
    expect(lost.content).toEqual([
      { type: 'text', text: 'Showing src/bracket.ts in the Tau viewer.\nThis GLB carries no mechanism.' },
    ]);
    await client.close();
  });

  it('should end the text with the hint naming the source of a shown export', async () => {
    const viewer = createViewer();
    const hint =
      'a.step is an export of main.ts, drawn as exported. Call show_model with targetFile main.ts to show the source with its parameters and mechanism.';
    vi.mocked(viewer.show).mockResolvedValueOnce({
      model,
      mechanism: { preserved: false, joints: 0, animations: [] },
      hint,
    });
    const client = await connect(clients.claudeDesktop, viewer);

    const result = await client.callTool({ name: 'show_model', arguments: { targetFile: 'a.step' } });

    expect(result.content).toEqual([
      { type: 'text', text: `Showing src/bracket.ts in the Tau viewer.\nThis GLB carries no mechanism.\n${hint}` },
    ]);
    expect(result.structuredContent).toMatchObject({ hint });
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

  it('should list the parts the person added to chat, by name and component id', async () => {
    const added: TauViewerViewState = {
      ...view,
      references: [
        { componentId: 'component:arm', label: 'Arm', kind: 'part' },
        { componentId: 'component:bolt', label: 'Bolt', kind: 'part' },
      ],
    };
    let reported = added;
    const viewer = { ...createViewer(), viewState: async () => ({ view: reported }) };
    const client = await connect(clients.claudeDesktop, viewer);

    const result = await client.callTool({ name: 'view_state', arguments: {} });
    const [block] = result.content as Array<{ type: 'text'; text: string }>;
    expect(block?.text.split('\n').slice(1, 3)).toEqual([
      'Selected: Arm (component:arm).',
      'Added to chat: Arm (component:arm), Bolt (component:bolt).',
    ]);
    expect(result.structuredContent).toEqual({ view: added });

    reported = { ...view, references: [] };
    const none = await client.callTool({ name: 'view_state', arguments: {} });
    expect((none.content as Array<{ text: string }>)[0]?.text).toContain('Added to chat: none.');
    await client.close();
  });

  it('should take every view field it lists as accepted, and reject any other', async () => {
    const client = await connect(clients.claudeDesktop);
    const sync = async (extra: Readonly<Record<string, unknown>>) =>
      client.callTool({
        name: 'app_sync',
        arguments: { pageId: 'page-0001', version: 0, follow: true, wait: false, view: { ...view, ...extra } },
      });

    const values: Readonly<Record<(typeof tauViewerAcceptedViewFields)[number], unknown>> = {
      references: [{ componentId: 'component:arm', label: 'Arm', kind: 'part' }],
    };
    for (const field of tauViewerAcceptedViewFields) {
      // oxlint-disable-next-line no-await-in-loop -- one field at a time.
      const taken = await sync({ [field]: values[field] });
      expect(taken.isError).toBeFalsy();
    }
    /* What an older server does with a field it does not take: the whole sync fails, hence the guard. */
    const rejected = await sync({ playback: { playing: true } });
    expect(rejected.isError).toBe(true);
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
