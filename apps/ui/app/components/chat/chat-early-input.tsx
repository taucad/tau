import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { chatInputTextClassName } from '#components/chat/chat-input-styles.js';

export type EarlyChatInput = {
  readonly text: string;
  readonly edited: boolean;
  readonly focused: boolean;
  readonly focusUnclaimed: boolean;
  readonly start: number;
  readonly end: number;
  readonly direction: 'forward' | 'backward' | 'none';
};

type EarlyTextarea = HTMLTextAreaElement & {
  tauEarlyDraft?: { edited: boolean; composing: boolean };
};

// This fixed script runs beside the server-rendered input, before the application
// bundle. DOM-local state records type-then-delete and an IME still in progress.
const earlyInputScript = `(()=>{const input=document.currentScript.previousElementSibling;const state=input.tauEarlyDraft={edited:false,composing:false};input.addEventListener('input',()=>{state.edited=true});input.addEventListener('compositionstart',()=>{state.composing=true});input.addEventListener('compositionend',()=>{state.composing=false})})()`;

/**
 * The composer's editor until the rich editor exists: a native input that is in the served document,
 * so the composer accepts text before the application bundle has run.
 *
 * It is the editor area's own loading state, not a stand-in for the composer: it sits where the editor
 * will, styled as the editor, inside the composer's real frame and bar, so nothing around it moves when
 * the editor takes over. `isHostReady` is whether the editor exists; until it does the native input
 * keeps accepting and holding text. Adoption hands the edit to the draft and reports it through
 * `onAdopt`, so the editor can take the text, the selection and the focus, and then `children` replaces
 * the native input. It happens in a layout effect, so no frame paints between the two.
 */
export function ChatEarlyInput({
  className,
  placeholder,
  isHostReady,
  onAdopt,
  children,
}: {
  readonly className?: string;
  readonly placeholder: string;
  readonly isHostReady: boolean;
  readonly onAdopt: (input: EarlyChatInput) => void;
  readonly children: React.ReactNode;
}): React.ReactNode {
  const inputRef = useRef<EarlyTextarea>(null);
  const [isAdopted, setIsAdopted] = useState(false);
  const { draftActorRef } = useChatComposer();

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || !isHostReady) {
      return undefined;
    }
    let active = true;
    const adopt = (): void => {
      if (!active || input.tauEarlyDraft?.composing) {
        return;
      }
      const snapshot: EarlyChatInput = {
        text: input.value,
        edited: input.tauEarlyDraft?.edited === true || input.value !== input.defaultValue,
        focused: document.activeElement === input,
        focusUnclaimed: document.activeElement === document.body,
        start: input.selectionStart,
        end: input.selectionEnd,
        direction: input.selectionDirection,
      };
      if (snapshot.edited) {
        draftActorRef.send({ type: 'setDraftText', text: snapshot.text, adoptedEdit: true });
      }
      onAdopt(snapshot);
      setIsAdopted(true);
    };
    // Composition's final input arrives after compositionend in some browsers.
    const finishComposition = (): void => {
      queueMicrotask(adopt);
    };
    input.addEventListener('compositionend', finishComposition);
    adopt();
    return () => {
      active = false;
      input.removeEventListener('compositionend', finishComposition);
    };
  }, [draftActorRef, isHostReady, onAdopt]);

  if (isAdopted) {
    return children;
  }
  return (
    <>
      <textarea
        ref={inputRef}
        aria-label={placeholder}
        placeholder={placeholder}
        rows={1}
        className={cn(
          // The editor's own box (`ChatEditor`): one line high, the same insets and type, growing with its text.
          'block min-h-6 w-full resize-none bg-transparent px-3 pb-3 outline-none [field-sizing:content] placeholder:text-muted-foreground',
          chatInputTextClassName,
          'pointer-coarse:text-base pointer-coarse:leading-6',
          className,
        )}
      />
      <script
        // oxlint-disable-next-line react/no-danger -- Fixed source with no interpolated input; records native edits before hydration.
        dangerouslySetInnerHTML={{ __html: earlyInputScript }}
      />
    </>
  );
}
