/**
 * Search-parameter names that drive UI state.
 *
 * The closed union is the point: a parameter that is read in one place and
 * written in another gets one spelling here instead of two string literals
 * that drift. Names are the literal query keys, so they keep whatever casing
 * already shipped in URLs people have bookmarked.
 */
export const searchParameterName = {
  /* Library */
  // Whether the project library also lists trashed projects.
  trash: 'trash',

  /* Dialogs */
  // The open settings dialog section, absent when the dialog is closed.
  settings: 'settings',
  // The remote-compute pairing code being redeemed.
  pair: 'pair',

  /* Project route */
  // The focused chat within the open project.
  chat: 'chat',
  // The open workbench panel, e.g. `share`.
  workbench: 'workbench',
  // The selected share provider within the share panel.
  shareProvider: 'shareProvider',
  // Consume-once marker that the project was just opened from Tau Cloud.
  cloudOpen: 'cloudOpen',

  /* Diagnostics */
  // Per-page graphics backend override, e.g. `webgl` or `webgpu`.
  graphicsBackend: 'graphicsBackend',

  /* Returns from an external flow */
  // Consume-once billing action id returned from Checkout.
  paymentAction: 'payment_action',
  // Consume-once marker that the desktop app opened the import route.
  desktopOpen: 'desktop-open',

  /* Import */
  // The git ref to import, defaulting to the repository's main branch.
  ref: 'ref',
  // The entry file to open after an import.
  main: 'main',
} as const;

/**
 * Union of all search-parameter names.
 *
 * Not `ConstantRecord`, which `cookieName` uses: that helper requires every
 * value to be the kebab-case form of its key, and these names are the query
 * keys already live in bookmarked URLs (`shareProvider`, `payment_action`).
 * Renaming them to satisfy a type helper would break those links.
 */
export type SearchParameterName = (typeof searchParameterName)[keyof typeof searchParameterName];
