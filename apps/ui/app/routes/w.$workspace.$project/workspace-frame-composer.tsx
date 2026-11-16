import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';
import {
  chatComposerAddTriggerClassName,
  chatComposerBarClassName,
  chatComposerBarLeftClassName,
  chatComposerBarRightClassName,
  chatComposerCollapsibleControlsClassName,
  chatComposerGhostPillClassName,
  chatComposerModelTriggerClassName,
} from '@taucad/chat-ui/components/chat-input-styles';
import { ServedSendButton } from '#components/chat/chat-textarea-submit-button.js';
import {
  EarlyComposerField,
  EarlyInputHandoverContext,
  readEarlyInput,
} from '#components/chat/chat-early-input-field.js';
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
export function useServedComposer(isDrawn: boolean): { field: React.ReactNode; handover: EarlyInputHandover } {
  const isOnClient = useSyncExternalStore(subscribeToNothing, isClientRender, isServerRender);
  const [state, setState] = useState<ServedComposerState>(() => (isOnClient ? 'gone' : 'served'));
  /* A navigation off the project route ends the served input: a frame drawn again later was not served with it. */
  if (!isDrawn && state !== 'gone') {
    setState('gone');
  }
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
      decline: () => {
        setState((current) => (current === 'served' ? 'gone' : current));
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
  const read = readEarlyInput(input);
  /* An Enter on a painted draft nobody edited is dropped here: the chat's record, which wins, may not hold that text,
   * and it is not read yet (Home checks it, as its record is loaded before adoption). */
  const snapshot = read.queuedSend && !read.edited ? { ...read, queuedSend: false } : read;
  return snapshot.edited || snapshot.queuedSend || snapshot.focused ? snapshot : 'gone';
};

/**
 * A chat lane that stays without a composer (chat sync off, chats failed to load, a focused chat that cannot open)
 * declines the served input, so it is not left on screen taking text nothing will adopt.
 *
 * @returns Nothing.
 */
export function DeclineServedComposer(): undefined {
  const decline = useContext(EarlyInputHandoverContext)?.decline;
  useLayoutEffect(() => {
    decline?.();
  }, [decline]);
  return undefined;
}

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
 * The served composer's bar (programme control's ruling, 2026-11-16T13:30Z): each control the rich bar draws at rest
 * has its final box here, so adoption moves nothing. The add trigger and Send are drawn as themselves, inert. The mode
 * and model controls follow the chat's agent and model, which the frame cannot read before the route chunk, so they
 * are skeleton shapes in their slots: the mode at its icon face, the model at its pending face, as Home's static bar
 * draws a model whose name is not known yet. Their widths then follow their labels (label parity is A10's).
 *
 * @param props - Whether the input holds nothing to send.
 * @returns The bar.
 */
function ServedComposerBar({ isEmpty }: { readonly isEmpty: boolean }): React.JSX.Element {
  return (
    <div inert data-slot='composer-bar' className={chatComposerBarClassName}>
      <div data-slot='composer-left' className={chatComposerBarLeftClassName}>
        <Button variant='ghost' size='sm' aria-label='Add' className={chatComposerAddTriggerClassName}>
          <Plus className='size-4' aria-hidden='true' />
        </Button>
        <div
          data-slot='composer-collapsible'
          className={cn(chatComposerCollapsibleControlsClassName, 'gap-0.5 pointer-coarse:gap-3')}
        >
          <span
            data-slot='mode-placeholder'
            aria-hidden='true'
            className={cn(chatComposerGhostPillClassName, 'flex w-7 items-center justify-center px-0')}
          >
            <Skeleton className='size-4 rounded-full' />
          </span>
        </div>
      </div>
      <div data-slot='composer-right' className={chatComposerBarRightClassName}>
        <div
          data-slot='composer-collapsible'
          className={cn(chatComposerCollapsibleControlsClassName, 'gap-1 pointer-coarse:gap-3')}
        >
          <span
            data-slot='agent-trigger-placeholder'
            aria-hidden='true'
            className={cn(chatComposerModelTriggerClassName, 'flex items-center')}
          >
            <Skeleton className='h-3 w-20 shrink-0 rounded-sm' />
          </span>
        </div>
        <ServedSendButton isEmpty={isEmpty} />
      </div>
    </div>
  );
}
