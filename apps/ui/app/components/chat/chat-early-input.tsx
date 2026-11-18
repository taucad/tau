import { useEffect, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { cn } from '@taucad/ui/utils/cn';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { buildDraftMessage } from '#hooks/draft.machine.js';
import { markPageUsed } from '#components/onboarding/home-interaction.js';
import {
  captureHandOff,
  draftHintAttribute,
  handOffBoxAttribute,
  handOffScript,
  isHandOffComposing,
  queuedSendStatusSlot,
  recordInputAccepted,
} from '#components/hand-off/hand-off.js';
import type { HandOffElement, HandOffSnapshot } from '#components/hand-off/hand-off.js';
import {
  chatComposerEditorAreaClassName,
  chatComposerEditorTextClassName,
  chatComposerFrameClassName,
  chatComposerMainEditorAreaClassName,
  chatComposerPlaceholder,
  chatComposerShellClassName,
} from '@taucad/chat-ui/components/chat-input-styles';

/**
 * What the rich composer takes over from the native input: the hand-off contract's snapshot (P4). Home adds
 * `paintedSendCancelled` when an Enter queued on its painted draft is cancelled at adoption because the record holds
 * another text (ruling 2026-11-17T03:43Z): the composer shows that text and says why.
 */
export type EarlyChatInput = HandOffSnapshot & { readonly paintedSendCancelled?: { readonly recordText: string } };

/*
 * The hand-off recorder, served right after the whole box rather than beside the input: a browser may paint the
 * half-parsed document when the parser reaches a script, and here that cut can only fall after the box and its bar,
 * never between them. Enter queues a send for the adopter (A15d, H-f): the box shows it queued and says so, and an
 * edit or Escape cancels it. The box also has the recorder paint Home's stored draft (the draft hint, H-e) into the
 * input before first paint. Its CSP hash is listed in `#lib/inline-script-hashes`.
 */
export const earlyInputScript = handOffScript('within-previous-sibling', { queueSubmit: true });

/** The box's marks for the recorder: a hand-off box that paints the draft hint. */
const earlyInputBox = { [handOffBoxAttribute]: '', [draftHintAttribute]: '' };

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
 * An edit is handed to the draft owner as an adopted edit. A stored draft the served page painted (and nothing typed)
 * hydrates the draft only while the draft is still empty, as the record's own load does, so the record still wins
 * where the two differ and a draft the record already loaded is kept; an Enter pressed on a painted draft the record
 * does not hold is cancelled, and the composer shows the record's text and says why, so nothing is sent that the
 * composer will not show.
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
  const inputRef = useRef<HandOffElement>(null);
  const [adopted, setAdopted] = useState<EarlyChatInput>();
  const [isEmpty, setIsEmpty] = useState(true);
  const { draftActorRef } = useChatComposer();
  /* Read in render: a stored draft hydrates only a draft that is still empty (adoption runs in an effect below), and an
   * Enter pressed on it is kept only where the draft is that text. `undefined` is an empty draft. */
  const draftText = useSelector(draftActorRef, (state) =>
    state.context.draftText === '' && state.context.draftAttachments.length === 0 ? undefined : state.context.draftText,
  );
  const draftTextRef = useRef(draftText);
  /* An attachment in the draft is something the painted box never showed, so an Enter on it is not sent. */
  const hasDraftAttachments = useSelector(draftActorRef, (state) => state.context.draftAttachments.length > 0);
  const hasDraftAttachmentsRef = useRef(hasDraftAttachments);
  /* Declared before adoption's effect, so adoption reads this commit's value. */
  useEffect(() => {
    draftTextRef.current = draftText;
    hasDraftAttachmentsRef.current = hasDraftAttachments;
  }, [draftText, hasDraftAttachments]);

  /* Text typed before hydration is already in the input; the bar reads it once React is here. */
  useEffect(() => {
    setIsEmpty((inputRef.current?.value.trim() ?? '') === '');
  }, []);

  /* The served script left the first-input mark; the bundle turns it into `tau.load.input.accepted`. */
  useEffect(() => {
    recordInputAccepted();
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || !isHostReady) {
      return undefined;
    }
    let active = true;
    const adopt = (): void => {
      if (!active || isHandOffComposing(input)) {
        return;
      }
      const snapshot: EarlyChatInput = captureHandOff(input);
      if (snapshot.edited) {
        /* Keys typed before the bundle ran reached no listener: the edit is the only record that home was used. */
        markPageUsed();
        draftActorRef.send({ type: 'setDraftText', text: snapshot.text, adoptedEdit: true });
      } else if (snapshot.prefilled === true && draftTextRef.current === undefined) {
        draftActorRef.send({ type: 'hydrateDraft', draft: buildDraftMessage(snapshot.text, []) });
      } else if (
        snapshot.prefilled === true &&
        snapshot.submitQueued &&
        (draftTextRef.current !== snapshot.text || hasDraftAttachmentsRef.current)
      ) {
        /* The record holds another draft, which wins: the Enter was pressed on text the composer will not hold, so it
         * is cancelled, and the composer says so. */
        setAdopted({ ...snapshot, paintedSendCancelled: { recordText: draftTextRef.current ?? '' } });
        return;
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
      {/* The served recorder marks this box (a queued send, text) before React hydrates it. */}
      <div
        className={cn(chatComposerFrameClassName, 'rounded-2xl has-[textarea:focus-visible]:focus-outline', className)}
        suppressHydrationWarning
        {...earlyInputBox}
      >
        {/* Says a queued send aloud, as Send's pending state shows it; the served recorder writes it. */}
        <span
          data-slot={queuedSendStatusSlot}
          role='status'
          className='sr-only'
          suppressHydrationWarning
          // oxlint-disable-next-line react/no-danger -- Empty, so hydration leaves the text the served recorder wrote.
          dangerouslySetInnerHTML={{ __html: '' }}
        />
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
