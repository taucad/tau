import { createContext } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { draftHintReaderSource } from '#lib/frame-hint-draft.js';
import {
  chatComposerEditorAreaClassName,
  chatComposerEditorTextClassName,
  chatComposerFrameClassName,
  chatComposerMainEditorAreaClassName,
  chatComposerPlaceholder,
  chatComposerShellClassName,
} from '@taucad/chat-ui/components/chat-input-styles';

/*
 * The served composer: the native input that accepts text from first paint, its inline script and the snapshot a rich
 * composer adopts. Kept apart from `ChatEarlyInput` (Home's adoption, which needs the draft owner) so the project
 * route's workspace frame can serve it without the composer providers in its bundle.
 */

export type EarlyChatInput = {
  readonly text: string;
  readonly edited: boolean;
  readonly focused: boolean;
  readonly focusUnclaimed: boolean;
  readonly start: number;
  readonly end: number;
  readonly direction: 'forward' | 'backward' | 'none';
  /**
   * Enter was pressed before the rich composer was here, and no edit or Escape has cancelled it since: the send it
   * asked for is owed, and goes through the composer's own path (and its guards) once the composer has the text.
   */
  readonly queuedSend: boolean;
  /** The text is the stored draft the served page painted (the draft hint), not an edit. */
  readonly prefilled: boolean;
  /** The chat a painted draft belongs to, where the hint names one. */
  readonly prefilledChatId?: string;
};

/** What the served input's inline script records on the element, before any bundle runs. */
export type EarlyInputState = {
  edited: boolean;
  composing: boolean;
  /** A queued send (Enter before adoption). */
  queued: boolean;
  /** The stored draft the script painted into the input, or `''`. */
  prefill: string;
  /** The chat the painted draft belongs to, or `''`. */
  prefillChat?: string;
};

export type EarlyTextarea = HTMLTextAreaElement & { tauEarlyDraft?: EarlyInputState };

/** The attribute the served composer carries while a send is queued; the send button shows its pending state. */
export const queuedSendAttribute = 'data-queued-send';

/** The attribute the served composer carries while its input holds text (typed or painted), so Send is not drawn as
 * refusing in the first frame of a painted draft and then changed at hydration. */
export const earlyTextAttribute = 'data-early-text';

/** The attribute a host sets on the served composer when it drops an Enter on a painted draft nobody edited: the script
 * then does not queue it, so no send is shown or announced as queued. */
export const dropsPaintedSendAttribute = 'data-drops-painted-send';

/** What a queued send's status says, before and after adoption. */
export const queuedSendStatus = 'Send queued. Press Escape to cancel.';

// This fixed script runs right after the server-rendered composer, before the application bundle. DOM-local state
// records type-then-delete, an IME still in progress and a queued send. It also paints the stored draft (the draft
// hint) into an input nothing has been typed into, so the first painted frame holds it. It sits after the whole box
// rather than beside the input because a browser may paint the half-parsed document when the parser reaches a script:
// here that cut can only fall after the box and its bar, never between them.
//
// Enter (no modifier, no composition, including Safari's IME commit with keyCode 229; not a touch keyboard's return,
// which breaks the line as the rich composer's does) queues a send instead of breaking the line, and marks the box so the send
// button shows its pending state at once; any edit or Escape cancels it. Shift+Enter still breaks the line.
export const earlyInputScript =
  `(()=>{const box=document.currentScript.previousElementSibling;const input=box.querySelector('textarea');` +
  `const state=input.tauEarlyDraft={edited:false,composing:false,queued:false,prefill:''};` +
  `if(input.value===''){const h=(${draftHintReaderSource})(location);if(h.text!==''){input.value=h.text;state.prefill=h.text;state.prefillChat=h.chatId}}` +
  `const st=box.querySelector('[data-slot=queued-send-status]');const q=(v)=>{state.queued=v;if(st)st.textContent=v?${JSON.stringify(queuedSendStatus)}:'';if(v){box.setAttribute(${JSON.stringify(queuedSendAttribute)},'')}else{box.removeAttribute(${JSON.stringify(queuedSendAttribute)})}};` +
  `const tx=()=>{if(input.value.trim()===''){box.removeAttribute(${JSON.stringify(earlyTextAttribute)})}else{box.setAttribute(${JSON.stringify(earlyTextAttribute)},'')}};tx();` +
  `input.addEventListener('input',()=>{state.edited=true;tx();if(state.queued)q(false)});` +
  `input.addEventListener('keydown',(e)=>{if(e.key==='Escape'){if(state.queued)q(false);return}` +
  `if(e.key!=='Enter'||e.shiftKey||e.altKey||e.ctrlKey||e.metaKey||e.isComposing||e.keyCode===229||state.composing)return;` +
  /* A touch keyboard's return starts a new line, as in the rich composer (Q15): only Send sends there. */
  `if(window.matchMedia?.('(pointer: coarse)').matches)return;` +
  /* Where the host drops an Enter on a painted draft nobody edited (the project route), it is not queued or announced. */
  `e.preventDefault();if(box.hasAttribute(${JSON.stringify(dropsPaintedSendAttribute)})&&!state.edited&&state.prefill!==''&&input.value===state.prefill)return;` +
  `if(input.value.trim()!=='')q(true)});` +
  `input.addEventListener('compositionstart',()=>{state.composing=true});` +
  `input.addEventListener('compositionend',()=>{state.composing=false})})()`;

/**
 * What the served input holds now, as the rich composer takes it over.
 *
 * @param input - The served native input.
 * @returns Its text, caret, focus and the script's records.
 */
export const readEarlyInput = (input: EarlyTextarea): EarlyChatInput => {
  const state = input.tauEarlyDraft;
  const prefill = state?.prefill ?? '';
  const isPrefilled = prefill !== '' && input.value === prefill && state?.edited !== true;
  return {
    text: input.value,
    edited: state?.edited === true || (input.value !== input.defaultValue && !isPrefilled),
    focused: document.activeElement === input,
    focusUnclaimed: document.activeElement === document.body,
    start: input.selectionStart,
    end: input.selectionEnd,
    direction: input.selectionDirection,
    queuedSend: state?.queued === true && input.value.trim() !== '',
    prefilled: isPrefilled,
    ...(isPrefilled && state?.prefillChat !== undefined && state.prefillChat !== ''
      ? { prefilledChatId: state.prefillChat }
      : {}),
  };
};

/** What the bar under the native input is drawn from. */
export type EarlyChatInputBarState = {
  /** Whether the input holds nothing to send, as the rich composer's Send reads it. */
  readonly isEmpty: boolean;
};

/**
 * The served native input in the rich composer's own box — the same frame, editor inset, text metrics and focus
 * outline — over `bar`, with the inline script after it. Without a `bar` the bar's height is reserved instead. It holds
 * no state of its own: a host adopts it (`readEarlyInput`) and replaces it.
 *
 * @param props - The input's ref, the bar, the box's classes, focus at first paint, whether a painted Enter is dropped
 *   and the input's change handler.
 * @returns The served composer.
 */
export function EarlyComposerField({
  inputRef,
  className,
  enableAutoFocus = false,
  bar,
  shouldDropPaintedSend = false,
  onChange,
}: {
  readonly inputRef: React.Ref<EarlyTextarea>;
  readonly className?: string;
  readonly enableAutoFocus?: boolean;
  readonly bar?: React.ReactNode;
  /** The host drops an Enter on a painted draft nobody edited: the script does not queue it. */
  readonly shouldDropPaintedSend?: boolean;
  readonly onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}): React.JSX.Element {
  return (
    <div className={chatComposerShellClassName} data-chat-composer='main'>
      {/* The served script marks this box with a queued send before React hydrates it. */}
      <div
        className={cn(chatComposerFrameClassName, 'rounded-2xl has-[textarea:focus-visible]:focus-outline', className)}
        suppressHydrationWarning
        {...(shouldDropPaintedSend ? { [dropsPaintedSendAttribute]: '' } : {})}
      >
        {/* Says a queued send aloud, as Send's pending state shows it; the served script writes it. */}
        <span
          data-slot='queued-send-status'
          role='status'
          className='sr-only'
          suppressHydrationWarning
          // oxlint-disable-next-line react/no-danger -- Empty, so hydration leaves the text the served script wrote.
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
            onChange={onChange}
          />
        </div>
        {bar ?? <div aria-hidden='true' className='h-7' />}
      </div>
      <script
        // oxlint-disable-next-line react/no-danger -- Fixed source with no interpolated input; records native edits before hydration.
        dangerouslySetInnerHTML={{ __html: earlyInputScript }}
      />
    </div>
  );
}

/**
 * The project route's handover: the workspace frame serves the native input in the chat lane, and the rich composer
 * takes it over once the lane is revealed (the rich editor cannot take focus before).
 *
 * @public
 */
export type EarlyInputHandover = Readonly<{
  /** What the served input held when it was handed over, until a composer has taken it; `undefined` otherwise. */
  pending: EarlyChatInput | undefined;
  /** The lane is revealed, so a composer in it can take focus. Called in the commit that reveals the lane. */
  release: (projectId: string) => void;
  /**
   * A composer is mounted to take the input, for its chat where it has one. The input is handed over once the lane is
   * revealed too. A call from another project than the first to call ends the input instead. A painted draft of
   * another chat than the claim's is not handed over as that chat's draft.
   *
   * @returns The release of the claim, on unmount.
   */
  claim: (projectId: string, chatId?: string) => () => void;
  /** The composer has taken `pending`: it is not applied again, by this composer or a later one. */
  taken: () => void;
  /** The lane will hold no composer: the served input is removed, with whatever it holds. */
  decline: () => void;
}>;

/** The frame's handover, for the composer below it; absent off the project route. */
export const EarlyInputHandoverContext = createContext<EarlyInputHandover | undefined>(undefined);
