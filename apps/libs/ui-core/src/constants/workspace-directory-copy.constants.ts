/**
 * Shared copy for `WorkspaceDirectoryPanel` and recovery surfaces.
 *
 * Centralised so /projects/new, Settings, /files, the FM recovery overlay,
 * and the `WorkspaceDirectoryRequiredError` toast all speak with one voice
 * (Audit R6 / R18). Keep messages short and action-led — the surrounding
 * component supplies the call-to-action buttons.
 */

/** Discriminated status used by `WorkspaceDirectoryPanel`. */
export type WorkspaceDirectoryStatus = 'connected' | 'permission' | 'disconnected' | 'missing' | 'unsupported';

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
    title: 'Folder access required',
    description: 'Grant access to this folder before continuing.',
  },
  disconnected: {
    title: 'Folder disconnected',
    description: 'Reconnect this folder before continuing.',
  },
  missing: {
    title: 'No folder connected',
    description: 'Connect a folder to create projects as files on your disk.',
  },
  unsupported: {
    title: 'Home only',
    description: 'Home is the only project location available in this browser.',
  },
} as const;

/** CTA labels used by the panel + recovery overlay. */
export const workspaceDirectoryActions = {
  connect: 'Connect Folder',
  reconnect: 'Reconnect',
  grantAccess: 'Grant access',
  change: 'Change folder',
  disconnect: 'Disconnect workspace',
} as const;
