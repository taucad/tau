/**
 * The page's one view of whoever embeds it.
 *
 * An MCP Apps host (Claude Desktop, Codex desktop, Claude Code's pane) talks
 * over postMessage through the ext-apps `App` client; the loopback page that
 * `tau mcp` serves to text hosts reaches the same tools over same-origin HTTP.
 * Everything above this module sees one bridge either way (blueprint I7: one
 * bundle, one composition).
 */
import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';
import type { McpUiHostCapabilities, McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type { TauViewerShowResult } from '@taucad/mcp/viewer-protocol';
import type { ChatReference } from '#app/chat-reference.js';

/** Which composition the page draws (blueprint "Composition per presentation"). */
export type ViewerComposition = 'inline' | 'tab';

/**
 * How "Add to chat" reaches the conversation (E8), best first: into the
 * model's context (`ui/update-model-context`), as a message in the
 * conversation (`ui/message`), or onto the clipboard for the person to paste.
 */
export type ChatRoute = 'context' | 'message' | 'clipboard';

/** What the page knows about its surroundings. */
export type HostView = Readonly<{
  kind: 'mcp-app' | 'loopback';
  composition: ViewerComposition;
  /**
   * Whether the page follows `show_model`: one the person opened (a thread tab, the sidebar, the loopback page) does;
   * a card keeps the model its tool result named in every display mode, fullscreen included, so another
   * conversation's show never replaces it.
   */
  follows: boolean;
  /**
   * Whether the page opened on the model its link names (the loopback page's `?model=`): it follows only the shows
   * made after it opened, so a show from before never replaces the model the link was for.
   */
  linked: boolean;
  /** The id of the `tools/call` whose result opened the page (`toolInfo.id`), when a tool result did. */
  toolCallId: string | undefined;
  colorScheme: 'light' | 'dark';
  /** Whether the page may offer its own fullscreen action: Claude hosts want one, Codex draws its own (E3). */
  canRequestFullscreen: boolean;
  /** The route "Add to chat" takes on this host; text hosts copy. */
  chatRoute: ChatRoute;
  /** The tallest the host lets the frame grow, in CSS pixels (E5: it clips the rest). */
  maxHeight: number | undefined;
  /** Insets the host asks the page to keep clear (E5). */
  safeArea: Readonly<{ top: number; right: number; bottom: number; left: number }>;
}>;

/** Events the bridge reports. */
export type HostEvent =
  | Readonly<{ type: 'show'; result: TauViewerShowResult }>
  | Readonly<{ type: 'context'; view: HostView }>
  | Readonly<{ type: 'error'; message: string }>;

/** The page's bridge to its host. */
export type HostBridge = Readonly<{
  view(): HostView;
  subscribe(listener: (event: HostEvent) => void): () => void;
  /** Call a Tau tool and return its structured result, or throw its error text. */
  callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<unknown>;
  /**
   * Hand the person's reference to the conversation (E8) along the view's
   * {@link ChatRoute}: as model context, its text with the structured
   * references as `structuredContent`; as a message or on the clipboard, its text.
   *
   * @returns The route it took.
   */
  addToChat(reference: ChatReference): Promise<ChatRoute>;
  requestFullscreen(): Promise<void>;
}>;

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 } as const;

/** The Tau tokens switch palettes on the root's `dark` class; ext-apps sets `data-theme` and `color-scheme`. */
const applyTheme = (theme: 'light' | 'dark'): void => {
  applyDocumentTheme(theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

/**
 * Structural Tau tokens and the MCP Apps host variables that replace them.
 * Accents keep the Tau hue (E6: the brand only on accents).
 */
const hostTokenMap: ReadonlyArray<readonly [string, string]> = [
  ['--background', '--color-background-primary'],
  ['--card', '--color-background-primary'],
  ['--popover', '--color-background-primary'],
  ['--sidebar-background', '--color-background-secondary'],
  ['--muted', '--color-background-secondary'],
  ['--secondary', '--color-background-secondary'],
  ['--foreground', '--color-text-primary'],
  ['--card-foreground', '--color-text-primary'],
  ['--popover-foreground', '--color-text-primary'],
  ['--sidebar-foreground', '--color-text-primary'],
  ['--secondary-foreground', '--color-text-primary'],
  ['--muted-foreground', '--color-text-secondary'],
  ['--border', '--color-border-primary'],
  ['--input', '--color-border-primary'],
  ['--ring', '--color-ring-primary'],
];

const isShowResult = (value: unknown): value is TauViewerShowResult =>
  typeof value === 'object' && value !== null && 'model' in value && typeof value.model === 'object';

/**
 * Ask the server for a model through `show_model` and report the outcome as an
 * event: with no arguments, the model it showed last; on the loopback page,
 * the model its link names.
 *
 * @param callTool - The bridge's tool call.
 * @param args - The call's arguments.
 * @param listener - Receives the `show` or `error` event.
 */
const showModel = async (
  callTool: HostBridge['callTool'],
  args: Readonly<Record<string, unknown>>,
  listener: (event: HostEvent) => void,
): Promise<void> => {
  try {
    const result = await callTool(tauViewerToolName.showModel, args);
    if (isShowResult(result)) {
      listener({ type: 'show', result });
    }
  } catch (error) {
    listener({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

/**
 * The height the host's container allows: its fixed height, else its maximum.
 *
 * @param context - The host context.
 * @returns The cap in CSS pixels, or `undefined` when the host sets none.
 */
const heightCapOf = (context: McpUiHostContext | undefined): number | undefined => {
  const dimensions = context?.containerDimensions;
  if (dimensions === undefined) {
    return undefined;
  }
  return 'height' in dimensions ? dimensions.height : dimensions.maxHeight;
};

/**
 * Pick "Add to chat"'s route from what the host declared at `ui/initialize`.
 *
 * @param capabilities - The host's capabilities.
 * @returns The best route they offer.
 */
const chatRouteOf = (capabilities: McpUiHostCapabilities | undefined): ChatRoute =>
  capabilities?.updateModelContext === undefined
    ? capabilities?.message === undefined
      ? 'clipboard'
      : 'message'
    : 'context';

const errorText = (result: CallToolResult): string =>
  result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n') || 'The Tau tool failed.';

/**
 * The bridge for a page inside an MCP Apps host.
 *
 * @returns The connected bridge.
 */
const connectMcpApp = async (): Promise<HostBridge> => {
  const app = new App(
    { name: 'tau-viewer', version: '0.1.0' },
    { availableDisplayModes: ['inline', 'fullscreen'] },
    /* The page reports its height; the inline composition keeps it fixed (E5). */
    { autoResize: true },
  );
  const listeners = new Set<(event: HostEvent) => void>();
  /* A result can arrive before the page subscribes; the latest is replayed. */
  let latest: HostEvent | undefined;
  const emit = (event: HostEvent): void => {
    if (event.type !== 'context') {
      latest = event;
    }
    for (const listener of listeners) {
      listener(event);
    }
  };

  const viewOf = (context: McpUiHostContext | undefined): HostView => {
    const host = app.getHostVersion()?.name ?? '';
    const isCodex = /codex|openai|chatgpt/iu.test(host);
    const toolCallId = context?.toolInfo?.id;
    return {
      kind: 'mcp-app',
      composition: context?.displayMode === 'inline' ? 'inline' : 'tab',
      follows: context?.toolInfo === undefined,
      linked: false,
      toolCallId: toolCallId === undefined ? undefined : String(toolCallId),
      colorScheme: context?.theme === 'dark' ? 'dark' : 'light',
      canRequestFullscreen:
        !isCodex && context?.displayMode === 'inline' && (context.availableDisplayModes ?? []).includes('fullscreen'),
      chatRoute: chatRouteOf(app.getHostCapabilities()),
      maxHeight: heightCapOf(context),
      safeArea: context?.safeAreaInsets ?? noInsets,
    };
  };

  /* Colour and font come from the host (E6, G10): its variables land on the
   * document root, and the structural Tau tokens point at them. */
  const applyContext = (context: McpUiHostContext | undefined): void => {
    if (context?.theme !== undefined) {
      applyTheme(context.theme);
    }
    if (context?.styles?.variables !== undefined) {
      applyHostStyleVariables(context.styles.variables);
      const declared = context.styles.variables as Readonly<Record<string, string | undefined>>;
      for (const [token, hostVariable] of hostTokenMap) {
        if (declared[hostVariable] === undefined) {
          document.documentElement.style.removeProperty(token);
        } else {
          document.documentElement.style.setProperty(token, `var(${hostVariable})`);
        }
      }
    }
    if (context?.styles?.css?.fonts !== undefined) {
      applyHostFonts(context.styles.css.fonts);
    }
  };

  app.addEventListener('toolresult', (params) => {
    if (params.isError) {
      emit({ type: 'error', message: errorText(params) });
      return;
    }
    if (isShowResult(params.structuredContent)) {
      emit({ type: 'show', result: params.structuredContent });
    }
  });
  app.addEventListener('hostcontextchanged', () => {
    const context = app.getHostContext();
    applyContext(context);
    emit({ type: 'context', view: viewOf(context) });
  });

  await app.connect(new PostMessageTransport(globalThis.parent, globalThis.parent));
  applyContext(app.getHostContext());

  const callTool = async (name: string, args: Readonly<Record<string, unknown>>): Promise<unknown> => {
    const result = await app.callServerTool({ name, arguments: { ...args } });
    if (!result.isError) {
      return result.structuredContent;
    }
    throw new Error(errorText(result));
  };

  /* A thread tab or a sidebar opened by the person has no tool result to
   * show; it asks for the model shown last (or the project's main file). */
  if (app.getHostContext()?.toolInfo === undefined) {
    // async-iife: bootstrap — the page opens with nothing to show; the outcome is an event.
    void showModel(callTool, {}, emit);
  }

  return {
    view: () => viewOf(app.getHostContext()),
    subscribe(listener) {
      listeners.add(listener);
      if (latest !== undefined) {
        listener(latest);
      }
      return () => listeners.delete(listener);
    },
    callTool,
    async addToChat({ text, references }) {
      const route = chatRouteOf(app.getHostCapabilities());
      if (route === 'context') {
        await app.updateModelContext({
          content: [{ type: 'text', text }],
          ...(references.length === 0 ? {} : { structuredContent: { references } }),
        });
      } else if (route === 'message') {
        const { isError } = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
        if (isError === true) {
          throw new Error('The host did not take the message.');
        }
      } else {
        await navigator.clipboard.writeText(text);
      }
      return route;
    },
    async requestFullscreen() {
      await app.requestDisplayMode({ mode: 'fullscreen' });
    },
  };
};

/**
 * The bridge for the loopback page: tools over same-origin HTTP, the token from
 * the URL fragment the server linked to, and the model from the query.
 *
 * @returns The bridge.
 */
const connectLoopback = (): HostBridge => {
  const token = globalThis.location.hash.slice(1);
  const modelId = new URLSearchParams(globalThis.location.search).get('model');
  const listeners = new Set<(event: HostEvent) => void>();
  const prefersDark = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const view = (): HostView => ({
    kind: 'loopback',
    composition: 'tab',
    follows: true,
    linked: modelId !== null,
    toolCallId: undefined,
    colorScheme: prefersDark.matches ? 'dark' : 'light',
    canRequestFullscreen: false,
    chatRoute: 'clipboard',
    maxHeight: undefined,
    safeArea: noInsets,
  });
  applyTheme(view().colorScheme);
  prefersDark.addEventListener('change', () => {
    applyTheme(view().colorScheme);
    for (const listener of listeners) {
      listener({ type: 'context', view: view() });
    }
  });

  const callTool = async (name: string, args: Readonly<Record<string, unknown>>): Promise<unknown> => {
    const response = await fetch('/api/tools/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tau-viewer-token': token },
      body: JSON.stringify({ name, arguments: args }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? String(body.message)
          : `HTTP ${String(response.status)}`;
      throw new Error(message);
    }
    return body;
  };

  return {
    view,
    subscribe(listener) {
      listeners.add(listener);
      /* The server linked to one shown model; ask for that model by id, as
       * `show_model` handed it to the agent, without rendering it again. */
      if (modelId !== null) {
        // async-iife: bootstrap — the outcome reaches this listener as an event.
        void showModel(callTool, { modelId }, listener);
      }
      return () => listeners.delete(listener);
    },
    callTool,
    async addToChat({ text }) {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    },
    async requestFullscreen() {
      await document.documentElement.requestFullscreen();
    },
  };
};

/**
 * Connect to whoever embeds the page.
 *
 * @returns The bridge.
 */
export const connectHost = async (): Promise<HostBridge> =>
  globalThis.parent === globalThis.window ? connectLoopback() : connectMcpApp();
