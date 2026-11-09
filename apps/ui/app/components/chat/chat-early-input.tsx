import { useEffect, useRef, useState } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import {
  chatComposerEditorAreaClassName,
  chatComposerEditorTextClassName,
  chatComposerFrameClassName,
  chatComposerMainEditorAreaClassName,
  chatComposerPlaceholder,
  chatComposerShellClassName,
} from '#components/chat/chat-input-styles.js';

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

// This fixed script runs right after the server-rendered composer, before the application
// bundle. DOM-local state records type-then-delete and an IME still in progress. It sits
// after the whole box rather than beside the input because a browser may paint the
// half-parsed document when the parser reaches a script: here that cut can only fall
// after the box and its bar, never between them.
const earlyInputScript = `(()=>{const input=document.currentScript.previousElementSibling.querySelector('textarea');const state=input.tauEarlyDraft={edited:false,composing:false};input.addEventListener('input',()=>{state.edited=true});input.addEventListener('compositionstart',()=>{state.composing=true});input.addEventListener('compositionend',()=>{state.composing=false})})()`;

/** What the bar under the native input is drawn from. */
export type EarlyChatInputBarState = {
  /** Whether the input holds nothing to send, as the rich composer's Send reads it. */
  readonly isEmpty: boolean;
};

/**
 * Keep Home's native input alive until its edit can enter the existing draft owner.
 *
 * The input sits in the rich composer's own box — the same frame, editor inset, text metrics and
 * focus outline — over `bar`, so that when adoption swaps in the rich composer nothing on screen
 * moves (R2, R11). Without a `bar` the bar's height is reserved instead.
 *
 * `isHostReady` is for a host that loads the rich composer on demand: adoption hands the edit over and
 * replaces this input with `children`, so a host whose children are not loaded yet passes `false`
 * and the native input stays, holding and accepting text, until they are. The default is `true`,
 * which is the arrangement where the composer is already in the bundle that rendered this.
 */
export function ChatEarlyInput({
  className,
  isHostReady = true,
  enableAutoFocus = false,
  bar,
  children,
}: {
  readonly className?: string;
  readonly isHostReady?: boolean;
  /** Take focus at first paint when nothing else holds it, as the rich composer would on mount. */
  readonly enableAutoFocus?: boolean;
  /** The composer's bar at rest, drawn under the input until the rich composer replaces both. */
  readonly bar?: (state: EarlyChatInputBarState) => React.ReactNode;
  readonly children: (input: EarlyChatInput) => React.ReactNode;
}): React.JSX.Element {
  const inputRef = useRef<EarlyTextarea>(null);
  const [adopted, setAdopted] = useState<EarlyChatInput>();
  const [isEmpty, setIsEmpty] = useState(true);
  const { draftActorRef } = useChatComposer();

  /* Text typed before hydration is already in the input; the bar reads it once React is here. */
  useEffect(() => {
    setIsEmpty((inputRef.current?.value.trim() ?? '') === '');
  }, []);

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
    <div className={chatComposerShellClassName} data-chat-composer='main'>
      <div
        className={cn(chatComposerFrameClassName, 'rounded-2xl has-[textarea:focus-visible]:focus-outline', className)}
      >
        <div className={cn(chatComposerEditorAreaClassName, chatComposerMainEditorAreaClassName)}>
          <textarea
            ref={inputRef}
            aria-label='Chat message'
            placeholder={chatComposerPlaceholder}
            rows={1}
            /* Served as `autofocus`: the browser focuses it at its first rendering update, so the first
             * paint already shows focus and the first keystroke lands without any bundle (R11). It does
             * not move focus that is already elsewhere, and hydration does not move it either. */
            autoFocus={enableAutoFocus}
            className={cn(
              chatComposerEditorTextClassName,
              'block resize-none bg-transparent outline-none field-sizing-content placeholder:text-muted-foreground',
            )}
            onChange={(event) => {
              setIsEmpty(event.currentTarget.value.trim() === '');
            }}
          />
        </div>
        {bar ? bar({ isEmpty }) : <div aria-hidden='true' className='h-7' />}
      </div>
      <script
        // oxlint-disable-next-line react/no-danger -- Fixed source with no interpolated input; records native edits before hydration.
        dangerouslySetInnerHTML={{ __html: earlyInputScript }}
      />
    </div>
  );
}
