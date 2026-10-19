/**
 * Whether a code pane is open.
 *
 * Language services follow the code pane (B-16): warming Monaco on link intent
 * loads and configures the editor, but no Monaco model, language contribution
 * or language worker (TypeScript, JavaScript, JSON, editor, KCL LSP) starts
 * until a code pane mounts. Each code pane declares itself with
 * {@link useCodePanePresence}; the Monaco services read
 * {@link useIsCodePaneOpen}.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';

let openCodePanes = 0;
const presenceTopic = new Topic<void>({ name: 'code-pane-presence' });

const subscribe = (listener: () => void): (() => void) => presenceTopic.subscribe(listener);
const getSnapshot = (): boolean => openCodePanes > 0;
const getServerSnapshot = (): boolean => false;

/**
 * Declare a mounted code pane while the calling component is mounted.
 *
 * @param isCodePane - Whether the component currently shows code; defaults to `true`.
 */
export function useCodePanePresence(isCodePane = true): void {
  useEffect(() => {
    if (!isCodePane) {
      return;
    }
    openCodePanes += 1;
    presenceTopic.emit();
    return () => {
      openCodePanes -= 1;
      presenceTopic.emit();
    };
  }, [isCodePane]);
}

/**
 * Whether any code pane is mounted.
 *
 * @returns `true` while at least one code pane is mounted.
 */
export function useIsCodePaneOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
