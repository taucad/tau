/**
 * The permission selector's words (blueprint D19, RQ2, RQ4): the ratified Bypass confirmation and the Settings
 * prompt-injection disclosure, adapted from Codex's "Enable full access?". One source for the chat pill, its dialog and
 * Settings, so the person reads the same terms everywhere.
 */

import type { PermissionMode } from '#filesystem/desktop-permissions.js';

/** Each mode's name and what it does, as the pill and Settings list them. */
export const permissionModeOptions: ReadonlyArray<
  Readonly<{ value: PermissionMode; name: string; description: string }>
> = [
  {
    value: 'ask',
    name: 'Ask',
    description: 'Asks before a command gets extra folders or network access.',
  },
  {
    value: 'bypass',
    name: 'Bypass',
    description: 'Grants extra folders and websites without asking. Commands stay sandboxed.',
  },
];

/** The mode's display name. */
export const permissionModeName = (mode: PermissionMode): string =>
  permissionModeOptions.find((option) => option.value === mode)?.name ?? 'Ask';

/** The confirmation every switch to Bypass shows (RQ2). Default focus is Cancel. */
export const bypassConfirmation = {
  title: 'Bypass approvals?',
  body: "With Bypass, Tau runs commands and grants the extra folders and websites it asks for without asking you. Commands stay sandboxed, and Tau's protected files stay off-limits. Content from websites, files or tools can contain instructions that steer the agent (prompt injection). Use caution: this increases the risk of data loss, leaks or unexpected changes.",
  confirm: 'Bypass approvals',
  /** The confirm action's description, per where it applies. */
  confirmChat: 'Apply to this chat',
  confirmDefault: 'Apply to new chats',
  cancel: 'Cancel',
  cancelDescription: 'Keep Ask',
} as const;

/** Settings → Agents → Default permissions: the prompt-injection disclosure (RQ4). */
export const promptInjectionDisclosure =
  'Websites, files and tool results can contain hidden instructions (prompt injection). In Ask, Tau asks before a command gets extra folders or any network access. In Bypass it grants them without asking, so injected instructions could send project data to a site the agent names. Commands are always sandboxed.';

/** What assistive technology hears once a change lands. */
export const permissionModeAnnouncement = (mode: PermissionMode, scope: 'chat' | 'default'): string =>
  scope === 'chat'
    ? `Permissions for this chat: ${permissionModeName(mode)}`
    : `Default permissions for new chats: ${permissionModeName(mode)}`;
