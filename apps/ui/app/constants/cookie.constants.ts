import type { ConstantRecord } from '@taucad/types';

/**
 * Cookie names.
 *
 * These must be short, hyphen separated, and lowercase.
 *
 * The following conventions are in place to reduce cookie name length:
 * - resize cookies use <namespace>-rs-<subject> (e.g. chat-rs-files)
 * - open cookies use <namespace>-op-<subject> (e.g. chat-op-files)
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
  // The last selected chat console size.
  chatRsEditor: 'chat-rs-editor',
  // Whether the chat interface is full height.
  chatInterfaceFullHeight: 'chat-interface-full-height',
  // Whether the chat interface is transparent.
  chatInterfaceTransparent: 'chat-interface-transparent',

  /* CAD */
  // The last selected kernel.
  cadKernel: 'cad-kernel',

  /* Chat */
  // Whether to enable web search in the chat.
  chatWebSearch: 'chat-web-search',
  // The last selected model.
  chatModel: 'chat-model',
  // Whether to show the model cost in the chat-history.
  chatModelCost: 'chat-model-cost',

  /* Chat Context - what editor context to include in messages */
  // Whether to include filesystem snapshot in chat context.
  chatCtxFs: 'chat-ctx-fs',
  // Whether to include active file in chat context.
  chatCtxActive: 'chat-ctx-active',
  // Whether to include open files in chat context.
  chatCtxOpen: 'chat-ctx-open',

  /* Chat Tool Sections - collapse state (true = open, false = collapsed) */
  // Whether code preview section is open in file operations.
  chatToolCodePreview: 'chat-tool-code-preview',
  // Whether images section in visual analysis is open.
  chatToolAnalysisImages: 'chat-tool-analysis-images',
  // The quality of the screenshots in the chat.
  chatScreenshotQuality: 'chat-screenshot-quality',
  // Whether testing tools (test_model, edit_tests) are enabled.
  chatTestingEnabled: 'chat-testing-enabled',

  /* Builds */
  // The last selected build view mode.
  buildViewMode: 'build-view-mode',

  /* Graphics */
  // Whether the section view status is open.
  viewOpStatus: 'view-op-status',
  // The user's preferred environment lighting preset.
  viewerEnvironment: 'viewer-environment',

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

  /* Privacy */
  // The user's cookie consent choice.
  cookieConsent: 'cookie-consent',

  /* Filesystem */
  // The last selected filesystem backend.
  filesystemBackend: 'filesystem-backend',
} as const;

/**
 * Union of all cookie names.
 */
export type CookieName = ConstantRecord<typeof cookieName>;
