import { Topic } from '@taucad/events';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * What session replay blocks while an account's content may not be recorded: the chat transcript (marked with
 * `data-replay-content`) and every CodeMirror editor. A blocked element replays as an empty box of the same size, so
 * the layout and the interface around it still play back (session replay fidelity blueprint, 2026-11-26 ruling).
 *
 * @public
 */
export const replayContentSelector = '[data-replay-content], .cm-editor';

/**
 * The recorder's block selector for one content decision. It takes the selector the recorder holds now and returns
 * the one to record with, so applying a decision twice, or the opposite decision after it, never stacks selectors.
 *
 * @param currentSelector - The recorder's block selector: what replay always blocks, perhaps with the content added.
 * @param isContentAllowed - Whether the chat transcript and code may be recorded.
 * @returns The selector to record with.
 * @public
 */
export const replayBlockSelector = (
  currentSelector: string | null | undefined,
  isContentAllowed: boolean,
): string | undefined => {
  const contentSuffix = `, ${replayContentSelector}`;
  let base = currentSelector ?? undefined;
  if (base === replayContentSelector) {
    base = undefined;
  } else if (base?.endsWith(contentSuffix) === true) {
    base = base.slice(0, -contentSuffix.length);
  }
  if (isContentAllowed) {
    return base;
  }
  return base === undefined || base === '' ? replayContentSelector : `${base}${contentSuffix}`;
};

/* How many mounted surfaces show another account's project. Module state, because the analytics boundary sits above
   every route and the project route that knows the role sits far below it. */
let foreignContentMarks = 0;
const foreignContentChanged = new Topic<void>({ name: 'replay.foreign-content' });

const subscribe = (listener: () => void): (() => void) => foreignContentChanged.subscribe(listener);
const readIsForeign = (): boolean => foreignContentMarks > 0;
const readIsForeignOnServer = (): boolean => false;
const emit = (): void => {
  foreignContentChanged.emit();
};

/**
 * Marks the open project as another account's while `isForeign` holds, so replay blocks its chat and code whatever
 * the viewer's own switch says: a collaborator's consent does not reach the owner's material (Privacy Policy section
 * 2, "Shared material").
 *
 * @param isForeign - Whether the focused project belongs to another account.
 * @public
 */
export const useMarkReplayForeignContent = (isForeign: boolean): void => {
  useEffect(() => {
    if (!isForeign) {
      return undefined;
    }
    foreignContentMarks += 1;
    emit();
    return () => {
      foreignContentMarks -= 1;
      emit();
    };
  }, [isForeign]);
};

/**
 * Whether a mounted surface shows another account's project.
 *
 * @returns `true` while any mark is held.
 * @public
 */
export const useIsReplayForeignContent = (): boolean =>
  useSyncExternalStore(subscribe, readIsForeign, readIsForeignOnServer);
