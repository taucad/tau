import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolCallError, connectHost } from '#app/host-bridge.js';

const { callServerTool } = vi.hoisted(() => ({
  callServerTool: vi.fn<(params: Readonly<{ name: string }>) => Promise<CallToolResult>>(),
}));

/* The frame's host, reduced to what the bridge asks of it; a tool result opened the page, so it shows nothing itself. */
vi.mock('@modelcontextprotocol/ext-apps', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match ext-apps' exported class name.
  App: class {
    public readonly callServerTool = callServerTool;
    public readonly addEventListener = vi.fn();
    public readonly connect = vi.fn(async () => undefined);
    public readonly getHostContext = () => ({ toolInfo: { id: 1 } });
    public readonly getHostVersion = () => undefined;
    public readonly getHostCapabilities = () => undefined;
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
  });
});
