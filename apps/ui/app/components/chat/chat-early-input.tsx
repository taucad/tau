import { useEffect, useRef, useState } from 'react';
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
 * Keep Home's native input alive until its edit can enter the existing draft owner.
 *
 * `isHostReady` is for a host that loads the rich composer on demand: adoption hands the edit over and
 * replaces this input with `children`, so a host whose children are not loaded yet passes `false`
 * and the native input stays, holding and accepting text, until they are. The default is `true`,
 * which is the arrangement where the composer is already in the bundle that rendered this.
 */
export function ChatEarlyInput({
  className,
  isHostReady = true,
  children,
}: {
  readonly className?: string;
  readonly isHostReady?: boolean;
  readonly children: (input: EarlyChatInput) => React.ReactNode;
}): React.JSX.Element {
  const inputRef = useRef<EarlyTextarea>(null);
  const [adopted, setAdopted] = useState<EarlyChatInput>();
  const { draftActorRef } = useChatComposer();

  useEffect(() => {
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
      setAdopted(snapshot);
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
  }, [draftActorRef, isHostReady]);

  if (adopted) {
    return <>{children(adopted)}</>;
  }
  return (
    <div className={cn('flex min-h-20.5 w-full flex-col rounded-2xl border bg-background shadow-md', className)}>
      <textarea
        ref={inputRef}
        aria-label='Chat message'
        placeholder='Ask Tau to build anything…'
        rows={2}
        className={cn(
          'min-h-20 resize-none rounded-2xl bg-transparent px-4 py-3 outline-none focus-visible:focus-outline',
          chatInputTextClassName,
        )}
      />
      <script
        // oxlint-disable-next-line react/no-danger -- Fixed source with no interpolated input; records native edits before hydration.
        dangerouslySetInnerHTML={{ __html: earlyInputScript }}
      />
    </div>
  );
}
