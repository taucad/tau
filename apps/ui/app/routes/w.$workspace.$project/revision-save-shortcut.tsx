/**
 * `Mod+S` anywhere in the workbench: record what is on disk (S30, AC12).
 *
 * Buffers first, then the ask: `editorRef.flushNow`, `projectRef.flushNow`, wait
 * for both stores to become idle, then cut the tree. The wait is bounded so a
 * stuck producer cannot disable the explicit save gesture forever.
 */

import type { ReactNode } from 'react';
import { waitFor } from 'xstate';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionCommands } from '#hooks/use-revision-status.js';
import type { KeyCombination } from '#utils/keys.utils.js';

/** The workbench-wide *Save revision* gesture. @public */
export const saveRevisionKeyCombination = {
  key: 's',
  modKey: true,
} as const satisfies KeyCombination;

const saveFlushTimeoutMilliseconds = 10_000;

/**
 * Register the save shortcut for the project this subtree is rooted at.
 *
 * Every live project keeps its subtree mounted (V21), so every one of them
 * registers this global gesture; the registry fires the first registration and
 * consumes the event. Only the project the person is looking at may answer
 * `Mod+S`, so a retained, unfocused project disables its binding (P73).
 *
 * @param props - `isFocused`: whether this project is the one the person is looking at.
 * @returns Nothing rendered.
 */
export function RevisionSaveShortcut({ isFocused = true }: { readonly isFocused?: boolean }): ReactNode {
  const { projectRef, editorRef } = useProject();
  const { saveRevision } = useRevisionCommands();

  /* A save is exactly what someone means while typing in the editor, and
   * `scope: 'global'` means the same thing with a dialog open. */
  useKeybinding(
    saveRevisionKeyCombination,
    async () => {
      editorRef.send({ type: 'flushNow' });
      projectRef.send({ type: 'flushNow' });
      await Promise.allSettled([
        waitFor(editorRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
          timeout: saveFlushTimeoutMilliseconds,
        }),
        waitFor(projectRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
          timeout: saveFlushTimeoutMilliseconds,
        }),
      ]);
      saveRevision('save');
    },
    { enabled: isFocused, scope: 'global' },
  );

  return null;
}
