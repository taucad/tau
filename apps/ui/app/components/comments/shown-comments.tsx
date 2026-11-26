import { createContext, useContext, useMemo, useState } from 'react';
import type { MessageAnnotations } from '@taucad/chat/annotations';

/** The sent message whose comments the viewer shows in place of the draft's. */
export type ShownComments = Readonly<{ messageId: string; annotations: MessageAnnotations }>;

type ShownCommentsValue = Readonly<{
  shown: ShownComments | undefined;
  show: (shown: ShownComments) => void;
  hide: () => void;
}>;

const ShownCommentsContext = createContext<ShownCommentsValue | undefined>(undefined);

/**
 * Holds which sent message's comments the chat's viewers show (charter D18: one set of numbers at a time). The
 * transcript sets it from a message's Show in viewer; a viewer reads it and ends it when the person pins again.
 *
 * @param props - The chat, and its transcript and viewers.
 * @returns The provider.
 */
export function ShownCommentsProvider({
  chatId,
  children,
}: {
  readonly chatId: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [held, setHeld] = useState<{ chatId: string; shown: ShownComments }>();
  // Another chat's sent comments are never shown over this one's model.
  const shown = held?.chatId === chatId ? held.shown : undefined;
  const value = useMemo<ShownCommentsValue>(
    () => ({
      shown,
      show(next) {
        setHeld({ chatId, shown: next });
      },
      hide() {
        setHeld(undefined);
      },
    }),
    [chatId, shown],
  );
  return <ShownCommentsContext.Provider value={value}>{children}</ShownCommentsContext.Provider>;
}

/**
 * The sent comments on show, and the verbs that change them.
 *
 * @returns `undefined` outside a chat, where no viewer shows sent comments.
 */
export function useShownComments(): ShownCommentsValue | undefined {
  return useContext(ShownCommentsContext);
}
