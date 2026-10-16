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
  machinePageSize: 'machine-page-size',
  /* Theme */
  // The color hue.
  colorHue: 'color-hue',
  // Whether code editors show parameter-name inlay hints.
  codeInlayHints: 'code-inlay-hints',
  // Whether actions use pointer cursors instead of the platform default.
  pointerCursors: 'pointer-cursors',

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
  // The last execution used — any agent, with its model, level and config — carried onto new chats.
  chatExecution: 'chat-execution',
  // The last chosen Tau model.
  chatModel: 'chat-model',
  // The last chosen Tau reasoning level.
  chatEffort: 'chat-effort',
  // Per-user model availability overrides: every explicit toggle; absence follows model.recommended.
  chatModelOverrides: 'chat-model-overrides',
  // Pinned Tau model ids, in pin order.
  chatModelPinned: 'chat-model-pinned',
  // Whether to show the model cost in the chat-history.
  chatModelCost: 'chat-model-cost',

  /* Chat Context - what editor context to include in messages */
  // Whether to include filesystem snapshot in chat context.
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ctx is conventional for context
  chatCtxFs: 'chat-ctx-fs',
  // Whether to include active file in chat context.
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ctx is conventional for context
  chatCtxActive: 'chat-ctx-active',
  // Whether to include open files in chat context.
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ctx is conventional for context
  chatCtxOpen: 'chat-ctx-open',

  /* Chat Tools */
  // Whether GeoSpec testing tools are enabled.
  chatTestingEnabled: 'chat-testing-enabled',

  /* Projects */
  // The last selected project view mode.
  projectViewMode: 'project-view-mode',
  // The last selected project list page size.
  projectPageSize: 'project-page-size',

  /* Community */
  // The last selected Community example page size.
  examplePageSize: 'example-page-size',
  // The last selected Parts page size.
  partPageSize: 'part-page-size',

  /* Share */
  // The last chosen sharing method in the workbench Share panel.
  shareProvider: 'share-provider',

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
