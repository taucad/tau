import type { ConstantRecord } from '@taucad/types';

/**
 * Cookie names.
 *
 * These must be short, hyphen separated, and lowercase.
 *
 * The following conventions are in place to reduce cookie name length:
 * - resize cookies use <namespace>-rs-<subject> (e.g. chat-resize-file-explorer)
 * - open cookies use <namespace>-op-<subject> (e.g. chat-file-explorer-open)
 */
export const cookieName = {
  /* Theme */
  // The color hue.
  colorHue: 'color-hue',
  // The theme mode.
  colorTheme: 'color-theme',

  /* Layout */
  // Whether the sidebar is open.
  sidebarOp: 'sidebar-op',
  // Whether the chat explorer is open.
  chatOpFileExplorer: 'chat-op-file-explorer',
  // Whether the chat is open.
  chatOpHistory: 'chat-op-history',
  // Whether the chat parameters are open.
  chatOpParameters: 'chat-op-parameters',
  // Whether the chat editor is open.
  chatOpEditor: 'chat-op-editor',
  // Whether the chat model explorer is open.
  chatOpModelExplorer: 'chat-op-model-explorer',
  // Whether the chat editor details are open.
  chatOpDetails: 'chat-op-details',
  // The last selected chat explorer size.
  chatRsFileExplorer: 'chat-rs-file-explorer',
  // The last selected chat console size.
  chatRsEditor: 'chat-rs-editor',
  // The last selected chat console size.
  chatRsLeft: 'chat-rs-left',
  // The last selected chat right panel size.
  chatRsRight: 'chat-rs-right',
  // The last selected chat interface tab.
  chatInterfaceTab: 'chat-interface-tab',
  // Whether the chat interface is full height.
  chatInterfaceFullHeight: 'chat-interface-full-height',
  // Whether the chat interface is transparent.
  chatInterfaceTransparent: 'chat-interface-transparent',

  /* CAD */
  // The last selected kernel.
  cadKernel: 'cad-kernel',
  // The last selected grid unit.
  cadUnit: 'cad-unit',

  /* Chat */
  // Whether to enable web search in the chat.
  chatWebSearch: 'chat-web-search',
  // The last selected model.
  chatModel: 'chat-model',

  /* Builds */
  // The last selected build view mode.
  buildViewMode: 'build-view-mode',

  /* Graphics */
  // The last selected field of view angle.
  fovAngle: 'fov-angle',
  // The last selected view settings.
  viewSettings: 'view-settings',
  // Section view settings
  sectionViewSettings: 'section-view-settings',
  // Whether the section view status is open.
  viewOpStatus: 'view-op-status',

  /* Console */
  // The last selected log level.
  consoleLogLevel: 'console-log-level',
  // The last selected display configuration.
  consoleDisplayConfig: 'console-display-config',

  /* Converter */
  // The last selected output formats.
  converterOutputFormats: 'converter-output-formats',
  // Whether to download multiple files as ZIP.
  converterMultifileZip: 'converter-multifile-zip',

  /* Docs */
  // Whether the docs sidebar is open.
  docsOpSidebar: 'docs-op-sidebar',
} as const;

/**
 * Union of all cookie names.
 */
export type CookieName = ConstantRecord<typeof cookieName>;
