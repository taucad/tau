/**
 * Shared copy for `WorkspaceDirectoryPanel` and recovery surfaces.
 *
 * Centralised so /projects/new, Settings, /files, the FM recovery overlay,
 * and the `WorkspaceDirectoryRequiredError` toast all speak with one voice
 * (Audit R6 / R18). Keep messages short and action-led — the surrounding
 * component supplies the call-to-action buttons.
 */

/** Discriminated status used by `WorkspaceDirectoryPanel`. */
export type WorkspaceDirectoryStatus = 'connected' | 'permission' | 'missing' | 'unsupported';

/**
 * Title + description copy keyed by status. Components pick the right
 * pair and supply variant-specific framing (banner / inline / row) around
 * the text.
 */
export const workspaceDirectoryCopy: Record<
  WorkspaceDirectoryStatus,
  { readonly title: string; readonly description: string }
> = {
  connected: {
    title: 'Workspace connected',
    description: 'Projects in this workspace are stored as folders on your computer.',
  },
  permission: {
    title: 'Workspace access revoked',
    description: 'The browser revoked permission for this folder. Grant access again to continue.',
  },
  missing: {
    title: 'No workspace connected',
    description: 'Pick a folder on your computer to store File System projects as native files.',
  },
  unsupported: {
    title: 'File System Access not available',
    description: 'This browser cannot open local folders. Use IndexedDB or OPFS storage instead.',
  },
} as const;

/** CTA labels used by the panel + recovery overlay. */
export const workspaceDirectoryActions = {
  connect: 'Connect Folder',
  reconnect: 'Grant Access',
  change: 'Change Folder',
  forget: 'Forget Workspace',
} as const;
