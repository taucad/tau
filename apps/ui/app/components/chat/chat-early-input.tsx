import { useEffect, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { buildDraftMessage } from '#hooks/draft.machine.js';
import { markPageUsed } from '#components/onboarding/home-interaction.js';
import { EarlyComposerField, readEarlyInput } from '#components/chat/chat-early-input-field.js';
import type { EarlyChatInput, EarlyChatInputBarState, EarlyTextarea } from '#components/chat/chat-early-input-field.js';

/**
 * Keep Home's native input alive until its edit can enter the existing draft owner.
 *
 * The input sits in the rich composer's own box — the same frame, editor inset, text metrics and focus outline — over
 * `bar`, so that when adoption swaps in the rich composer nothing on screen moves (R2, R11). Without a `bar` the bar's
 * height is reserved instead.
 *
 * An edit is handed to the draft owner as an adopted edit. A stored draft the served page painted (and nothing typed)
 * hydrates the draft only while the draft is still empty, as the record's own load does, so the record still wins
 * where the two differ and a draft the record already loaded is kept.
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
  /* Read in render: a stored draft hydrates only a draft that is still empty (adoption runs in an effect below). */
  const isDraftEmpty = useSelector(
    draftActorRef,
    (state) => state.context.draftText === '' && state.context.draftAttachments.length === 0,
  );
  const isDraftEmptyRef = useRef(isDraftEmpty);
  /* Declared before adoption's effect, so adoption reads this commit's value. */
  useEffect(() => {
    isDraftEmptyRef.current = isDraftEmpty;
  }, [isDraftEmpty]);

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
      const snapshot = readEarlyInput(input);
      if (snapshot.edited) {
        /* Keys typed before the bundle ran reached no listener: the edit is the only record that home was used. */
        markPageUsed();
        draftActorRef.send({ type: 'setDraftText', text: snapshot.text, adoptedEdit: true });
      } else if (snapshot.prefilled && isDraftEmptyRef.current) {
        draftActorRef.send({ type: 'hydrateDraft', draft: buildDraftMessage(snapshot.text, []) });
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
    <EarlyComposerField
      inputRef={inputRef}
      className={className}
      enableAutoFocus={enableAutoFocus}
      bar={bar?.({ isEmpty })}
      onChange={(event) => {
        setIsEmpty(event.currentTarget.value.trim() === '');
      }}
    />
  );
}
