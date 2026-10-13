/**
 * A minimal MCP Apps host in the shape of ext-apps' `examples/basic-host`: it
 * puts a `ui://` page in a sandboxed frame under the CSP its resource
 * declares and speaks to it through `AppBridge`. Server calls go to the test,
 * which forwards them to a real `tau mcp` (`window.tauCallTool`).
 */
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import type {
  McpUiHostCapabilities,
  McpUiHostContext,
  McpUiResourceCsp,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/* The harness page's two globals: the test's server call, and the host the test drives. */
declare global {
  // eslint-disable-next-line no-var -- a global declaration is how a page global is typed.
  var tauCallTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  // eslint-disable-next-line no-var -- ditto.
  var tauHost: TauHost;
}

/** What the test reads back from the host. */
export type HostRecord = {
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  modelContext: unknown[];
  messages: unknown[];
  displayModeRequests: string[];
  initialized: boolean;
};

/** The host the test drives from `page.evaluate`. */
export type TauHost = {
  readonly record: HostRecord;
  mount(options: {
    html: string;
    csp: McpUiResourceCsp | undefined;
    hostContext: McpUiHostContext;
    /** What the host declares; by default every route the page uses. */
    hostCapabilities?: McpUiHostCapabilities;
    toolArguments: Record<string, unknown>;
    /** The tool result that opened the view; absent for a view the person opened (a thread tab, the sidebar). */
    toolResult: CallToolResult | undefined;
    width: number;
    height: number;
  }): Promise<void>;
  setHostContext(context: McpUiHostContext): void;
};

/**
 * The CSP an MCP Apps host applies to a page (ext-apps specification
 * 2026-01-26): nothing by default, `resourceDomains` for scripts, styles,
 * images, fonts and media, `connectDomains` for connections.
 *
 * @param csp - The resource's declared CSP.
 * @returns The policy text.
 */
const cspOf = (csp: McpUiResourceCsp | undefined): string => {
  const resources = (csp?.resourceDomains ?? []).join(' ');
  const connections = (csp?.connectDomains ?? []).join(' ');
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline' ${resources}`,
    `style-src 'self' 'unsafe-inline' ${resources}`,
    `img-src 'self' ${resources}`,
    `font-src 'self' ${resources}`,
    `media-src 'self' ${resources}`,
    `connect-src ${connections || "'none'"}`,
    "frame-src 'none'",
    "base-uri 'self'",
  ].join('; ');
};

const record: HostRecord = {
  toolCalls: [],
  modelContext: [],
  messages: [],
  displayModeRequests: [],
  initialized: false,
};
const everyCapability: McpUiHostCapabilities = {
  serverTools: {},
  updateModelContext: { text: {} },
  message: { text: {} },
};
let bridge: AppBridge | undefined;
let context: McpUiHostContext = {};

globalThis.tauHost = {
  record,
  async mount({
    html,
    csp,
    hostContext,
    hostCapabilities = everyCapability,
    toolArguments,
    toolResult,
    width,
    height,
  }) {
    context = hostContext;
    const frame = document.createElement('iframe');
    frame.title = 'Tau viewer';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.cssText = `width:${String(width)}px;height:${String(height)}px;border:1px solid #ccc`;
    document.body.append(frame);
    /* The window survives the frame's navigation to the page, so the bridge listens before the page's first message:
     * a page whose script sends `ui/initialize` before the frame's load event is not missed. */
    const view = frame.contentWindow;
    if (view === null) {
      throw new Error('The frame has no window.');
    }
    bridge = new AppBridge(null, { name: 'tau-basic-host', version: '1.0.0' }, hostCapabilities, { hostContext });
    bridge.oncalltool = async (params) => {
      const args = params.arguments ?? {};
      record.toolCalls.push({ name: params.name, arguments: args });
      return globalThis.tauCallTool(params.name, args);
    };
    bridge.onupdatemodelcontext = async (params) => {
      record.modelContext.push(params);
      return {};
    };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- `ui/message` is a request the host answers, not a DOM event.
    bridge.onmessage = async (params) => {
      record.messages.push(params);
      return {};
    };
    bridge.onrequestdisplaymode = async ({ mode }) => {
      record.displayModeRequests.push(mode);
      if (mode === 'fullscreen') {
        frame.style.cssText = 'width:100vw;height:100vh;border:0;position:fixed;inset:0';
      }
      context = { ...context, displayMode: mode };
      bridge?.setHostContext(context);
      return { mode };
    };
    bridge.addEventListener('initialized', () => {
      record.initialized = true;
      if (toolResult !== undefined) {
        void bridge?.sendToolInput({ arguments: toolArguments });
        void bridge?.sendToolResult(toolResult);
      }
    });
    await bridge.connect(new PostMessageTransport(view, view));
    const loaded = new Promise<void>((resolve) => {
      frame.addEventListener('load', () => {
        resolve();
      });
    });
    frame.srcdoc = html.replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="${cspOf(csp).replaceAll('"', '&quot;')}">`,
    );
    await loaded;
  },
  setHostContext(next) {
    context = { ...context, ...next };
    bridge?.setHostContext(context);
  },
};
