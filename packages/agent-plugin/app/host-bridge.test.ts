import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolCallError, connectHost } from '#app/host-bridge.js';

const { callServerTool, host } = vi.hoisted(() => ({
  callServerTool: vi.fn<(params: Readonly<{ name: string }>) => Promise<CallToolResult>>(),
  /* What the frame's host declares and receives. */
  host: {
    capabilities: undefined as Readonly<Record<string, unknown>> | undefined,
    updateModelContext: vi.fn(async (_params: unknown) => ({})),
    sendMessage: vi.fn(async (_params: unknown) => ({})),
  },
}));

/* The frame's host, reduced to what the bridge asks of it; a tool result opened the page, so it shows nothing itself. */
vi.mock('@modelcontextprotocol/ext-apps', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match ext-apps' exported class name.
  App: class {
    public readonly callServerTool = callServerTool;
    public readonly updateModelContext = host.updateModelContext;
    public readonly sendMessage = host.sendMessage;
    public readonly addEventListener = vi.fn();
    public readonly connect = vi.fn(async () => undefined);
    public readonly getHostContext = () => ({ toolInfo: { id: 1 } });
    public readonly getHostVersion = () => undefined;
    public readonly getHostCapabilities = () => host.capabilities;
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match ext-apps' exported class name.
  PostMessageTransport: class {
    public readonly start = vi.fn();
    public readonly send = vi.fn();
    public readonly close = vi.fn();
  },
  applyDocumentTheme: vi.fn(),
  applyHostStyleVariables: vi.fn(),
}));

/**
 * Stand the page up as the loopback tab `tau mcp` links to, answering every tool call with one reply.
 *
 * @param status - The reply's HTTP status.
 * @param body - The reply's JSON body.
 */
const stubLoopbackPage = (status: number, body: unknown): void => {
  vi.stubGlobal('location', { hash: '#token', search: '?model=m1' });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn() }));
  vi.stubGlobal('document', { documentElement: { classList: { toggle: vi.fn() } } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, { status })),
  );
};

describe('connectHost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    callServerTool.mockReset();
    host.capabilities = undefined;
    host.updateModelContext.mockClear();
    host.sendMessage.mockClear();
  });

  describe('on the loopback page', () => {
    it.each([
      { status: 404, body: { errorCode: 'UNKNOWN_TOOL' }, code: 'UNKNOWN_TOOL', message: 'HTTP 404' },
      {
        status: 422,
        body: { errorCode: 'NO_KERNEL', message: 'No kernel exports gear.ts.' },
        code: 'NO_KERNEL',
        message: 'No kernel exports gear.ts.',
      },
    ])('should throw the code and message of a $status reply', async ({ status, body, code, message }) => {
      stubLoopbackPage(status, body);
      const bridge = await connectHost();

      const call = bridge.callTool('app_export_formats', { targetFile: 'gear.ts' });

      await expect(call).rejects.toThrow(ToolCallError);
      await expect(call).rejects.toMatchObject({ code, message });
    });
  });

  describe('in an MCP Apps host', () => {
    it.each([
      {
        label: 'a tool the server does not serve',
        text: 'MCP error -32602: Tool app_export_formats not found',
        code: 'UNKNOWN_TOOL',
        message: 'MCP error -32602: Tool app_export_formats not found',
      },
      {
        label: "the specification's unknown tool",
        text: 'Unknown tool: app_export_formats',
        code: 'UNKNOWN_TOOL',
        message: 'Unknown tool: app_export_formats',
      },
      {
        label: 'a Tau failure',
        text: 'NO_KERNEL: No kernel exports gear.ts.',
        code: 'NO_KERNEL',
        message: 'No kernel exports gear.ts.',
      },
      { label: 'an uncoded failure', text: 'The runtime stopped.', code: undefined, message: 'The runtime stopped.' },
      {
        label: 'an uncoded failure with a colon',
        text: 'Could not read gear.ts: it was removed.',
        code: undefined,
        message: 'Could not read gear.ts: it was removed.',
      },
      { label: 'a code with no message', text: 'NO_KERNEL: ', code: undefined, message: 'NO_KERNEL: ' },
    ])('should throw the code and message of $label', async ({ text, code, message }) => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('parent', {});
      callServerTool.mockResolvedValue({ isError: true, content: [{ type: 'text', text }] });
      const bridge = await connectHost();

      const call = bridge.callTool('app_export_formats', { targetFile: 'gear.ts' });

      await expect(call).rejects.toThrow(ToolCallError);
      await expect(call).rejects.toMatchObject({ code, message });
      expect(callServerTool).toHaveBeenCalledWith({
        name: 'app_export_formats',
        arguments: { targetFile: 'gear.ts' },
      });
    });

    it.each([
      {
        label: 'a tool it does not list',
        reason: 'MCP error -32602: Unknown tool: app_export_formats',
        code: 'UNKNOWN_TOOL',
      },
      {
        label: 'a tool the server does not serve',
        reason: 'MCP error -32602: Tool app_export_formats not found',
        code: 'UNKNOWN_TOOL',
      },
      { label: 'a call that timed out', reason: 'MCP error -32001: Request timed out', code: undefined },
    ])('should throw the code and message of a host that rejects $label', async ({ reason, code }) => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('parent', {});
      const rejection = new Error(reason);
      callServerTool.mockRejectedValue(rejection);
      const bridge = await connectHost();

      const call = bridge.callTool('app_export_formats', { targetFile: 'gear.ts' });

      await expect(call).rejects.toThrow(ToolCallError);
      await expect(call).rejects.toMatchObject({ code, message: reason, cause: rejection });
    });

    describe('Add to chat', () => {
      const added = { text: 'Sun gear in Gear @cad[gear.ts#component:sun]', references: [] };
      const all = {
        text: 'Sun gear, Carrier in Gear @cad[gear.ts#component:sun] @cad[gear.ts#component:carrier]',
        references: [],
      };

      it('should hand model context everything added, since each update replaces the last', async () => {
        vi.stubGlobal('window', {});
        vi.stubGlobal('parent', {});
        host.capabilities = { updateModelContext: { text: {} }, message: { text: {} } };
        const bridge = await connectHost();

        await expect(bridge.addToChat(added, all)).resolves.toBe('context');
        expect(host.updateModelContext).toHaveBeenCalledWith({ content: [{ type: 'text', text: all.text }] });
        expect(host.sendMessage).not.toHaveBeenCalled();
      });

      it('should send only the new reference as a message', async () => {
        vi.stubGlobal('window', {});
        vi.stubGlobal('parent', {});
        host.capabilities = { message: { text: {} } };
        const bridge = await connectHost();

        await expect(bridge.addToChat(added, all)).resolves.toBe('message');
        expect(host.sendMessage).toHaveBeenCalledWith({ role: 'user', content: [{ type: 'text', text: added.text }] });
      });

      it('should copy only the new reference on a frame host that declares neither route (D10)', async () => {
        vi.stubGlobal('window', {});
        vi.stubGlobal('parent', {});
        const writeText = vi.fn(async (_text: string) => undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        host.capabilities = { serverTools: {} };
        const bridge = await connectHost();

        await expect(bridge.addToChat(added, all)).resolves.toBe('clipboard');
        expect(writeText).toHaveBeenCalledWith(added.text);
        expect(host.updateModelContext).not.toHaveBeenCalled();
      });
    });
  });
});
