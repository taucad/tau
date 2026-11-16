import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  chatComposerBarClassName,
  chatComposerBarLeftClassName,
  chatComposerBarRightClassName,
} from '@taucad/chat-ui/components/chat-input-styles';
import { ServedSendButton } from '#components/chat/chat-textarea-submit-button.js';
import { EarlyComposerField, readEarlyInput } from '#components/chat/chat-early-input-field.js';
import type { EarlyChatInput, EarlyInputHandover, EarlyTextarea } from '#components/chat/chat-early-input-field.js';

/** Nothing to subscribe to: only the hydration pass reads the server snapshot. */
const subscribeToNothing = (): (() => void) => {
  return () => undefined;
};

const isClientRender = (): boolean => true;
const isServerRender = (): boolean => false;

/** Where the served input stands: served, handed over (until a composer takes it), or gone. */
type ServedComposerState = 'served' | EarlyChatInput | 'gone';

/**
 * The chat lane's served composer (loading states UX blueprint, § Editor-route composer; F7): the native input the
 * document is served with, typeable from first paint, and its handover to the rich composer.
 *
 * It exists only in a frame the document was served with (the hydration pass): a frame first rendered by a client
 * navigation has no served script to record its edits, and the rich composer is moments away, so it draws the lane's
 * empty composer box as before. The input is handed over once two things hold, in whichever order they come: the
 * desktop workspace has revealed the lanes (`release`; the rich editor sits under `content-visibility: hidden` until
 * then and cannot take focus), and a chat composer is mounted to take it (`claim`; the chat lane can still be loading
 * its chat history after the reveal). Until both hold the served input stays on screen and keeps accepting text. The
 * input's text, caret, focus and queued send are read then, and the composer takes them in the same commit. An open
 * composition defers the handover to its end, read at `compositionend` with the input still on screen and focused
 * (Home also waits a microtask there for a browser that sends the final input after it; the frame adds no timer).
 *
 * @returns The served field to draw over the content, and the handover the composer reads.
 */
export function useServedComposer(): { field: React.ReactNode; handover: EarlyInputHandover } {
  const isOnClient = useSyncExternalStore(subscribeToNothing, isClientRender, isServerRender);
  const [state, setState] = useState<ServedComposerState>(() => (isOnClient ? 'gone' : 'served'));
  const inputRef = useRef<EarlyTextarea>(null);
  /* The two conditions of the handover, read by whichever call comes second. */
  const isRevealedRef = useRef(false);
  const claimsRef = useRef(0);
  const isServed = state === 'served';
  const [isEmpty, setIsEmpty] = useState(true);
  /* Text typed, or a draft painted, before hydration is already in the input; Send reads it once React is here. */
  useEffect(() => {
    setIsEmpty((inputRef.current?.value.trim() ?? '') === '');
  }, []);
  const handover = useMemo<EarlyInputHandover>(() => {
    const handOver = (): void => {
      const input = inputRef.current;
      if (!isServed || !isRevealedRef.current || claimsRef.current === 0) {
        return;
      }
      if (input?.tauEarlyDraft?.composing === true) {
        input.addEventListener(
          'compositionend',
          () => {
            /* Read at `compositionend`, as Chromium has delivered the composition's final input by then. */
            setState((current) => (current === 'served' ? releasedState(input) : current));
          },
          { once: true },
        );
        return;
      }
      setState(input === null ? 'gone' : releasedState(input));
    };
    return {
      pending: typeof state === 'object' ? state : undefined,
      release: () => {
        isRevealedRef.current = true;
        handOver();
      },
      claim: () => {
        claimsRef.current += 1;
        handOver();
        return () => {
          claimsRef.current -= 1;
        };
      },
      taken: () => {
        setState('gone');
      },
    };
  }, [isServed, state]);
  return {
    field: isServed ? (
      <ServedComposer
        inputRef={inputRef}
        isEmpty={isEmpty}
        onChange={(event) => {
          setIsEmpty(event.currentTarget.value.trim() === '');
        }}
      />
    ) : undefined,
    handover,
  };
}

/**
 * What the served input hands over: its snapshot when it holds anything a composer must take (an edit, a queued send,
 * or focus), otherwise nothing.
 *
 * @param input - The served input.
 * @returns The snapshot, or `'gone'`.
 */
const releasedState = (input: EarlyTextarea): ServedComposerState => {
  const snapshot = readEarlyInput(input);
  return snapshot.edited || snapshot.queuedSend || snapshot.focused ? snapshot : 'gone';
};

/**
 * The served composer, over the chat lane's composer box: the chat lane's width and open state come from the same
 * frame-hint variables and compact rule as the lane, and the composer sits at the lane's foot in the box the rich
 * composer takes (`chat-history.tsx`). It is a layer over the content, so it takes clicks; after the lanes are revealed
 * it stays over the rich composer's box, at the same place, until that composer takes its input. The lanes layer stays hidden from assistive
 * technology, so before adoption the served input is the only part of the frame exposed; the layer itself passes
 * pointer events through to it.
 *
 * @param props - The served input's ref, whether it holds nothing to send, and its change handler.
 * @returns The layer.
 */
function ServedComposer({
  inputRef,
  isEmpty,
  onChange,
}: {
  readonly inputRef: React.Ref<EarlyTextarea>;
  readonly isEmpty: boolean;
  readonly onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}): React.JSX.Element {
  return (
    <div
      data-slot='workspace-frame-composer'
      className='@container pointer-events-none absolute inset-0 flex max-md:hidden'
    >
      <div className='[display:var(--frame-chat-display,flex)] h-full w-(--frame-chat-width,320px) shrink-0 flex-col justify-end border-r border-transparent @max-[1120px]:[display:var(--frame-chat-compact-display,flex)]'>
        <div className='pointer-events-auto mx-auto mb-2 w-[calc(100%_-_1rem)] max-w-xl shrink-0'>
          <EarlyComposerField inputRef={inputRef} bar={<ServedComposerBar isEmpty={isEmpty} />} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

/**
 * The served composer's bar: Send at its resting place, inert, so a send queued by Enter shows its pending state from
 * first paint. The other controls (mode, model, attachments) arrive with the rich composer.
 *
 * @param props - Whether the input holds nothing to send.
 * @returns The bar.
 */
function ServedComposerBar({ isEmpty }: { readonly isEmpty: boolean }): React.JSX.Element {
  return (
    <div inert data-slot='composer-bar' className={chatComposerBarClassName}>
      <div data-slot='composer-left' className={chatComposerBarLeftClassName} />
      <div data-slot='composer-right' className={chatComposerBarRightClassName}>
        <ServedSendButton isEmpty={isEmpty} />
      </div>
    </div>
  );
}
