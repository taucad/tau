/**
 * `Mod+S` anywhere in the workbench: record what is on disk (S30, AC12).
 *
 * Buffers first, then the ask: `editorRef.flushNow`, `projectRef.flushNow`, wait
 * for both stores to become idle, then cut the tree. The wait is bounded so a
 * stuck producer cannot disable the explicit save gesture forever.
 */

import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { waitFor } from 'xstate';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionCommands } from '#hooks/use-revision-status.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { toast } from '#components/ui/sonner.js';

/** The workbench-wide *Save revision* gesture. @public */
export const saveRevisionKeyCombination = {
  key: 's',
  modKey: true,
} as const satisfies KeyCombination;

const saveFlushTimeoutMilliseconds = 10_000;

/**
 * The *Save revision* request for the project this subtree is rooted at.
 *
 * @returns A callback that flushes the editor and project stores, then asks for the cut.
 */
export function useSaveRevisionRequest(): () => Promise<void> {
  const { projectRef, editorRef } = useProject();
  const { saveRevision } = useRevisionCommands();
  return useCallback(async () => {
    editorRef.send({ type: 'flushNow' });
    projectRef.send({ type: 'flushNow' });
    try {
      await Promise.all([
        waitFor(editorRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
          timeout: saveFlushTimeoutMilliseconds,
        }),
        waitFor(projectRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
          timeout: saveFlushTimeoutMilliseconds,
        }),
      ]);
      /* Not awaited: the gesture is finished once the cut is asked for, and the
       * correlated answer exists for the unload registrant, not for a person
       * waiting at the keyboard (C16). */
      void saveRevision('save');
    } catch (error) {
      /* What failed here is a file flush, not a revision verb, so it carries no
         code to phrase (P4) — and its own words are a diagnostic a person
         cannot act on (E5). They get what did not happen; the console gets why. */
      console.error('[revisions]', 'save', error);
      toast.error('Revision not saved', { description: 'The editor could not finish saving its files.' });
    }
  }, [editorRef, projectRef, saveRevision]);
}

/**
 * Register the save shortcut for the project this subtree is rooted at.
 *
 * Every live project keeps its subtree mounted (V21), so every one of them
 * registers this global gesture; the registry fires the first registration and
 * consumes the event. Only the project the person is looking at may answer
 * `Mod+S`, so a retained, unfocused project disables its binding (P73).
 *
 * @returns Nothing rendered.
 */
export function RevisionSaveShortcut({ isFocused = true }: { readonly isFocused?: boolean }): ReactNode {
  const save = useSaveRevisionRequest();

  /* A save is exactly what someone means while typing in the editor, and
   * `scope: 'global'` means the same thing with a dialog open. */
  useKeybinding(saveRevisionKeyCombination, save, { enabled: isFocused, scope: 'global' });

  return null;
}
