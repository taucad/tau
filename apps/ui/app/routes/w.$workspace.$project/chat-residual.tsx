import { useCallback, useSyncExternalStore } from 'react';
import type React from 'react';
import { useSelector } from '@xstate/react';
import { CircleAlert, CloudOff, MonitorSmartphone, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { withoutHostId } from '@taucad/chat-ui/utils/chat-execution';
import type { ChatMessageQueueActor } from '@taucad/chat-ui/machines/chat-message-queue.machine';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { useChatContext, useChatSelector } from '#hooks/use-chat.js';
import { cardOf } from '@taucad/chat-ui/utils/chat-error-card';
import { errorCategory } from '@taucad/types/constants';
import { selectVisibleChatErrorEntry } from '#utils/run-auto-resume-plan.js';
import { useChatSessionStore, useOptionalChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useAgentHostPlacements } from '#hooks/use-cad-agent-config.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { isDesktopTarget } from '#lib/build-target.js';

/**
 * One physical residual (blueprint "Residuals and their treatment"): what the person sees, and its action. R2 (another
 * device runs the turn) and R5 (Chat paused, with Resume) keep their existing cards. R3 is the browser's line; the
 * desktop's R3 and R7 are deferred (blueprint rev 11), since nothing produces them yet.
 *
 * @public
 */
export type ChatResidualFact =
  | Readonly<{
      kind: 'R1';
      computer: React.ReactNode;
      /** The queued message the line offers to remove or send here; `reached` when its command was already sent. */
      queued?: Readonly<{ reached: boolean; onRemove: () => void; onSendHere: () => void }>;
    }>
  | Readonly<{ kind: 'R3' }>
  | Readonly<{ kind: 'R4' }>
  | Readonly<{ kind: 'R6'; computer: React.ReactNode; readable: boolean; onPair: () => void }>
  | Readonly<{ kind: 'R8'; desktop: boolean; onNewChat: () => void; canOpenNewChat: boolean }>
  | Readonly<{ kind: 'R9'; cause: 'load' }>
  | Readonly<{ kind: 'R9'; cause: 'placement'; onChooseThisComputer: () => void }>;

const reload = (): void => {
  globalThis.location.reload();
};

const reloadButton = (
  <Button variant='outline' size='xs' onClick={reload}>
    <RefreshCcw className='size-3.5' />
    Reload
  </Button>
);

/**
 * A residual's line and its action, as the copy tables word them (HA-I8: words only for physical residuals). It says
 * where the turns are and what the person can do, never how the page reaches the computer.
 *
 * @param properties - The residual and the card's class.
 * @returns The card.
 * @public
 */
export function ChatResidualLine({
  residual,
  className,
}: {
  readonly residual: ChatResidualFact;
  readonly className?: string;
}): React.JSX.Element {
  switch (residual.kind) {
    case 'R1': {
      const { computer, queued } = residual;
      return (
        <ChatErrorCard
          className={className}
          role='status'
          tone='neutral'
          icon={CloudOff}
          title={
            <>
              The latest turns are on <strong>{computer}</strong>. They’ll appear here when it’s back online.
            </>
          }
          description={
            queued?.reached === true ? (
              <>
                Your message may already have reached <strong>{computer}</strong>.
              </>
            ) : undefined
          }
          actions={
            queued === undefined ? undefined : (
              <>
                <Button variant='outline' size='xs' onClick={queued.onRemove}>
                  Remove
                </Button>
                <Button variant='outline' size='xs' onClick={queued.onSendHere}>
                  Send here instead
                </Button>
              </>
            )
          }
        />
      );
    }
    case 'R3': {
      return (
        <ChatErrorCard
          className={className}
          tone='warning'
          icon={CircleAlert}
          title='Tau can’t save chats in this browser.'
          description='Use another browser or the Tau desktop app.'
        />
      );
    }
    case 'R4': {
      return (
        <ChatErrorCard
          className={className}
          tone='warning'
          icon={CircleAlert}
          title='Part of this chat was written by a newer version of Tau.'
          description='Reload to see the rest.'
          actions={reloadButton}
        />
      );
    }
    case 'R6': {
      return (
        <ChatErrorCard
          className={className}
          role='status'
          tone='warning'
          icon={MonitorSmartphone}
          title={
            <>
              Pair <strong>{residual.computer}</strong> to keep working with it.
            </>
          }
          description={residual.readable ? 'Reading this chat still works.' : undefined}
          actions={
            <Button variant='outline' size='xs' onClick={residual.onPair}>
              Pair
            </Button>
          }
        />
      );
    }
    case 'R8': {
      return (
        <ChatErrorCard
          className={className}
          role='status'
          tone='warning'
          icon={CircleAlert}
          title='This chat’s saved turns are missing on this device.'
          description={residual.desktop ? 'Check the project folder.' : undefined}
          actions={
            <Button variant='outline' size='xs' disabled={!residual.canOpenNewChat} onClick={residual.onNewChat}>
              New chat
            </Button>
          }
        />
      );
    }
    case 'R9': {
      return residual.cause === 'load' ? (
        <ChatErrorCard
          className={className}
          tone='warning'
          icon={CircleAlert}
          title='Part of Tau did not finish loading'
          description='Reload the page to continue.'
          actions={reloadButton}
        />
      ) : (
        <ChatErrorCard
          className={className}
          tone='warning'
          icon={MonitorSmartphone}
          title='In the desktop app, turns run on this computer.'
          description={
            <>
              Choose <strong>This computer</strong> to continue.
            </>
          }
          actions={
            <Button variant='outline' size='xs' onClick={residual.onChooseThisComputer}>
              Choose This computer
            </Button>
          }
        />
      );
    }
  }
}

/**
 * The name a computer goes by in the placement list, for a residual's line. ponytail: a computer the list does not
 * hold (yet, or any more) reads "that computer"; a name cache arrives with a caller that needs one.
 *
 * @param hostId - The computer's host id.
 * @returns Its name.
 * @public
 */
export const useComputerName = (hostId: string | undefined): string => {
  const { targets } = useAgentHostPlacements();
  return targets.find((target) => target.hostId === hostId)?.label ?? 'that computer';
};

const noSubscription = (): void => undefined;

type QueueHead = Readonly<{ id: string; reached: boolean }> | undefined;

const headOf = (snapshot: ReturnType<ChatMessageQueueActor['getSnapshot']>): QueueHead => {
  const head = snapshot.context.items[0];
  return head === undefined ? undefined : { id: head.id, reached: head.command !== undefined };
};

function QueueHeadOf({
  actor,
  children,
}: {
  readonly actor: ChatMessageQueueActor;
  readonly children: (head: QueueHead) => React.JSX.Element;
}): React.JSX.Element {
  return children(useSelector(actor, headOf));
}

type ResidualFacts = Readonly<{
  residual: 'R1' | 'R4' | 'R6' | 'R8';
  hostId: string | undefined;
  local: boolean;
  /** The queued entry prepared for that computer (HA-I4): it, not the queue's head, is the one R1 offers. */
  pinnedId: string | undefined;
}>;

/** The residual with the computer's name, mounted only while there is one, so a healthy chat lists no computers. */
function NamedResidual({
  chatId,
  facts,
  className,
}: {
  readonly chatId: string;
  readonly facts: ResidualFacts;
  readonly className: string | undefined;
}): React.JSX.Element {
  const store = useChatSessionStore();
  const actor = useChatSessionSnapshot(chatId, (session) => session?.messageQueueRef);
  const {
    execution: { execution },
  } = useChatComposer();
  const { open: openSettings } = useSettingsDialog();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();
  const computer = useComputerName(facts.hostId ?? (execution.kind === 'tau' ? execution.hostId : undefined));
  if (facts.residual === 'R4') {
    return <ChatResidualLine className={className} residual={{ kind: 'R4' }} />;
  }
  if (facts.residual === 'R6') {
    return (
      <ChatResidualLine
        className={className}
        residual={{
          kind: 'R6',
          computer,
          readable: facts.local,
          onPair: () => {
            openSettings('compute');
          },
        }}
      />
    );
  }
  if (facts.residual === 'R8') {
    return (
      <ChatResidualLine
        className={className}
        residual={{
          kind: 'R8',
          desktop: isDesktopTarget(),
          canOpenNewChat,
          onNewChat: () => {
            void openNewChat();
          },
        }}
      />
    );
  }
  const line = (head: QueueHead): React.JSX.Element => (
    <ChatResidualLine
      className={className}
      residual={{
        kind: 'R1',
        computer,
        ...(head === undefined || execution.kind !== 'tau'
          ? {}
          : {
              queued: {
                reached: head.reached,
                onRemove: () => {
                  void store.discardQueuedMessage(chatId, head.id);
                },
                onSendHere: () => {
                  void store.sendQueuedMessageHere(chatId, head.id, withoutHostId(execution));
                },
              },
            }),
      }}
    />
  );
  if (facts.pinnedId !== undefined) {
    return line({ id: facts.pinnedId, reached: true });
  }
  return actor === undefined ? line(undefined) : <QueueHeadOf actor={actor}>{line}</QueueHeadOf>;
}

/**
 * The chat's residual above the composer, from the store's facts: R6 for a computer that must be paired again; R1 for
 * a remote computer this device cannot read, or a queued message prepared for one, with Remove and *Send here
 * instead*; R8 for a saved log that went missing; R4 for rows a newer Tau wrote. A residual a coded failure names is
 * the chat error card's.
 *
 * @param properties - The card's class.
 * @returns The line, or nothing.
 * @public
 */
export function ChatResidual({ className }: { readonly className?: string }): React.JSX.Element | undefined {
  const { activeChatId: chatId } = useChatContext();
  const store = useOptionalChatSessionStore();
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribeProjection(chatId, listener) ?? noSubscription,
    [chatId, store],
  );
  const read = useCallback((): string => {
    if (store === undefined) {
      return '';
    }
    const unreachable = store.getUnreachableComputer(chatId);
    const pinned = store.pinnedElsewhereOf(chatId);
    const residual =
      store.getRemoteResidual(chatId) ??
      (unreachable === undefined && pinned === undefined ? undefined : 'R1') ??
      store.getOwnResidual(chatId) ??
      /* R4: the ledger read rows a newer Tau wrote (`chat-ledger.ts`); the prefix shows, and Reload reads the rest. */
      (store.getProjection(chatId)?.ledger.newerHistory === true ? 'R4' : undefined);
    return residual === undefined
      ? ''
      : [
          residual,
          unreachable?.hostId ?? pinned?.hostId ?? '',
          String(store.readsLocally(chatId)),
          pinned?.queueId ?? '',
        ].join('|');
  }, [chatId, store]);
  const key = useSyncExternalStore(subscribe, read, read);
  /* N1: a chat whose card already asks for pairing shows one Pair, the card's. */
  const pairCardShown = useChatSelector(
    (state) => cardOf(selectVisibleChatErrorEntry(state)?.error.code, errorCategory.generic).category === 'pair',
  );
  if (key === '') {
    return undefined;
  }
  const [residual, hostId, local, pinnedId] = key.split('|') as ['R1' | 'R4' | 'R6' | 'R8', string, string, string];
  if (residual === 'R6' && pairCardShown) {
    return undefined;
  }
  return (
    <NamedResidual
      chatId={chatId}
      facts={{
        residual,
        hostId: hostId === '' ? undefined : hostId,
        local: local === 'true',
        pinnedId: residual === 'R1' && pinnedId !== '' ? pinnedId : undefined,
      }}
      className={className}
    />
  );
}
