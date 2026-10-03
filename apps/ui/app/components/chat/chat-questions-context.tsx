import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type { Ask } from '@taucad/chat';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { useChatContext } from '#hooks/use-chat.js';
import { useChatQuestions } from '#hooks/use-chat-questions.js';
import type { ChatQuestions } from '#hooks/use-chat-questions.js';

/** Which asks have a card on screen now; the tray shows the rest (agent questions blueprint D8). */
type OnScreenStore = {
  readonly add: (askId: string) => () => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => ReadonlySet<string>;
};

const createOnScreenStore = (): OnScreenStore => {
  const counts = new Map<string, number>();
  const changed = new Topic<void>({ name: 'questions-on-screen' });
  let current: ReadonlySet<string> = new Set();
  const publish = (): void => {
    current = new Set(counts.keys());
    changed.emit();
  };
  return {
    add: (askId) => {
      counts.set(askId, (counts.get(askId) ?? 0) + 1);
      publish();
      return () => {
        const next = (counts.get(askId) ?? 1) - 1;
        if (next === 0) {
          counts.delete(askId);
        } else {
          counts.set(askId, next);
        }
        publish();
      };
    },
    subscribe: (listener) => changed.subscribe(listener),
    snapshot: () => current,
  };
};

type ChatQuestionsContextValue = ChatQuestions & { readonly onScreen: OnScreenStore };

const ChatQuestionsContext = createContext<ChatQuestionsContextValue | undefined>(undefined);

/**
 * Provide one live question record per chat view: the transcript cards and the
 * composer tray read and answer the same asks.
 *
 * @param props - The chat view.
 * @param props.children - Everything that renders questions.
 * @returns The provider.
 * @public
 */
export function ChatQuestionsProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { activeChatId } = useChatContext();
  const { steerOrSubmit } = useCadChatClient();
  const questions = useChatQuestions(activeChatId, steerOrSubmit);
  const [onScreen] = useState(createOnScreenStore);
  const value = useMemo(() => ({ ...questions, onScreen }), [questions, onScreen]);
  return <ChatQuestionsContext value={value}>{children}</ChatQuestionsContext>;
}

/**
 * The chat's questions, when a provider is mounted.
 *
 * @returns The record and actions, or `undefined` outside a chat view.
 * @public
 */
export const useOptionalChatQuestions = (): ChatQuestionsContextValue | undefined => use(ChatQuestionsContext);

/**
 * Report a card as on screen while it intersects the viewport.
 *
 * @param askId - The ask the card shows.
 * @param element - The card's element.
 * @public
 */
export const useReportAskOnScreen = (askId: string | undefined, element: HTMLElement | undefined): void => {
  const store = use(ChatQuestionsContext)?.onScreen;
  useEffect(() => {
    if (store === undefined || askId === undefined || element === undefined) {
      return undefined;
    }
    if (typeof IntersectionObserver === 'undefined') {
      return store.add(askId);
    }
    // A mounted card counts as on screen until the observer's first report says otherwise,
    // so the tray does not flash in for the frame before it.
    let remove: (() => void) | undefined = store.add(askId);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && remove === undefined) {
        remove = store.add(askId);
      } else if (!entry?.isIntersecting && remove !== undefined) {
        remove();
        remove = undefined;
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      remove?.();
    };
  }, [askId, element, store]);
};

const noAsks: ReadonlySet<string> = new Set();
const noopSubscribe = (): (() => void) => () => undefined;

/**
 * The ids of asks whose card is on screen now.
 *
 * @returns A set that changes identity whenever a card enters or leaves.
 * @public
 */
export const useOnScreenAskIds = (): ReadonlySet<string> => {
  const store = use(ChatQuestionsContext)?.onScreen;
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.snapshot ?? (() => noAsks), () => noAsks);
};

/**
 * The ask a transcript tool call created: by call id, else the newest ask with the same questions.
 *
 * External calls through Tau's MCP endpoint get a fresh host call id, so their
 * card finds its ask by content.
 *
 * @param asks - The chat's asks.
 * @param call - The call's id and, when known, its questions.
 * @returns The ask, if recorded.
 * @public
 */
export const findAskForCall = (
  asks: readonly Ask[],
  call: {
    readonly callId: string;
    readonly questions?: ReadonlyArray<{ readonly id: string; readonly question: string }>;
  },
): Ask | undefined => {
  const byId = asks.find((ask) => ask.callId === call.callId);
  const wanted = call.questions;
  if (byId !== undefined || wanted === undefined) {
    return byId;
  }
  return asks.findLast(
    (ask) =>
      ask.questions.length === wanted.length &&
      ask.questions.every((question, index) => {
        const expected = wanted[index];
        return expected !== undefined && expected.id === question.id && expected.question === question.question;
      }),
  );
};
