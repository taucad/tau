import type { ConstantRecord } from '~/types/constant.types.js';

/**
 * Cookie names.
 *
 * These must be short, hyphen separated, and lowercase.
 */
export const cookieName = {
  /* Theme */
  // The color hue.
  colorHue: 'color-hue',

  /* Layout */
  // Whether the sidebar is open.
  sidebarOpen: 'sidebar-open',
  // The last selected chat explorer size.
  chatResizeExplorer: 'chat-resize-explorer',
  // Whether the chat explorer is open.
  chatExplorerOpen: 'chat-explorer-open',
  // The last selected chat view mode.
  chatViewMode: 'chat-view-mode',
  // Whether the chat is open.
  chatHistoryOpen: 'chat-history-open',
  // Whether the chat parameters are open.
  chatParametersOpen: 'chat-parameters-open',
  // The last selected chat console size.
  chatResizeEditor: 'chat-resize-editor',
  // The last selected chat viewer size.
  chatResizeViewer: 'chat-resize-viewer',
  // The last selected chat main size.
  chatResizeMain: 'chat-resize-main',

  /* CAD */
  // The last selected kernel.
  kernel: 'kernel',

  /* Chat */
  // Whether to enable web search in the chat.
  chatWebSearch: 'chat-web-search',
  // The last selected model.
  chatModel: 'chat-model',

  /* Console */
  // The last selected log level.
  consoleLogLevel: 'console-log-level',
  // The last selected display configuration.
  consoleDisplayConfig: 'console-display-config',
} as const;

/**
 * Union of all cookie names.
 */
export type CookieName = ConstantRecord<typeof cookieName>;
