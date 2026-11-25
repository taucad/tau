/**
 * Shared copy for `WorkspaceDirectoryPanel` and recovery surfaces.
 *
 * Centralised so /projects/new, Settings, /files, the FM recovery overlay,
 * and the `WorkspaceDirectoryRequiredError` toast all speak with one voice
 * (Audit R6 / R18). Keep messages short and action-led — the surrounding
 * component supplies the call-to-action buttons.
 */

/**
 * Discriminated status used by `WorkspaceDirectoryPanel`.
 *
 * A folder row's status comes from the file service's published root state
 * (desktop resilient startup blueprint D2): `connected` is the root state
 * `available`, and `notFound`, `unreachable`, `permission` and `conflict`
 * carry theirs, as does `error`, a root that failed for a reason the file service could not classify. `disconnected` is a record without a grant or handle, `none`
 * is a surface with no folder chosen yet, and `unsupported` a browser that
 * cannot connect folders. The type is not stored anywhere.
 */
export type WorkspaceDirectoryStatus =
  | 'connected'
  | 'notFound'
  | 'unreachable'
  | 'permission'
  | 'conflict'
  | 'error'
  | 'disconnected'
  | 'none'
  | 'unsupported';

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
  notFound: {
    title: 'Folder not found',
    description: 'Your files weren’t changed; Tau can’t see this folder.',
  },
  unreachable: {
    title: 'Not responding',
    description: 'Tau keeps trying to reach this folder.',
  },
  permission: {
    title: 'Access needed',
    description: 'Grant access to this folder before continuing.',
  },
  conflict: {
    title: 'Can’t use this folder',
    description: 'Locate the folder again, or remove it from Tau.',
  },
  error: {
    title: 'Couldn’t open this folder',
    description: 'Try again, or remove it from Tau. Your files weren’t changed.',
  },
  disconnected: {
    title: 'Disconnected',
    description: 'Reconnect this folder before continuing.',
  },
  none: {
    title: 'No folder connected',
    description: 'Connect a folder to create projects as files on your disk.',
  },
  unsupported: {
    title: 'Home only',
    description: 'Home is the only project location available in this browser.',
  },
} as const;

/** The label a folder row shows in place of the copy when its folder works (blueprint D2's table). */
export const workspaceDirectoryRowLabel = { connected: 'Connected' } as const;

/** CTA labels used by the panel + recovery overlay. */
export const workspaceDirectoryActions = {
  connect: 'Connect Folder',
  reconnect: 'Reconnect',
  grantAccess: 'Grant access',
  change: 'Change folder',
  disconnect: 'Disconnect workspace',
  retry: 'Try again',
  locate: 'Locate…',
  remove: 'Remove from Tau',
  removeAll: 'Remove all',
} as const;
