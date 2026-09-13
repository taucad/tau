/**
 * `Mod+S` anywhere in the workbench: record what is on disk (S30, AC12).
 *
 * Buffers first, then the ask: `editorRef.flushNow`, `projectRef.flushNow`, then
 * the cut. The two flushes *start* the pending writes rather than waiting them
 * out — the editor's own write settles in its `storing` region — so this is a
 * best-effort ordering, not a guarantee that the last keystroke is on disk when
 * the tree is hashed. It does not need to be: the checkout's I5 gate means a
 * save on an unchanged tree costs one tree hash and records nothing, and a
 * keystroke that lands just after is recorded by the idle window five minutes
 * later. (A person who wants the guarantee has the stronger form already:
 * `project-route.tsx` awaits `{ ready: { storing: 'idle' } }` before it lets a
 * project go.)
 */

import type { ReactNode } from 'react';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionCommands } from '#hooks/use-revision-status.js';
import type { KeyCombination } from '#utils/keys.utils.js';

/** The workbench-wide *Save revision* gesture. @public */
export const saveRevisionKeyCombination = {
  key: 's',
  modKey: true,
} as const satisfies KeyCombination;

/**
 * Register the save shortcut for the project this subtree is rooted at.
 *
 * @returns Nothing rendered.
 */
export function RevisionSaveShortcut(): ReactNode {
  const { projectRef, editorRef } = useProject();
  const { saveRevision } = useRevisionCommands();

  /* `ignoreInputs` because a save is exactly what someone means while they are
   * typing in the editor, and `scope: 'global'` because it means the same thing
   * with a dialog open. */
  useKeybinding(
    saveRevisionKeyCombination,
    () => {
      editorRef.send({ type: 'flushNow' });
      projectRef.send({ type: 'flushNow' });
      saveRevision('save');
    },
    { ignoreInputs: true, scope: 'global' },
  );

  return null;
}
