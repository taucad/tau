import { createContext, useContext } from 'react';

/**
 * The chat composer's Send, for a card in the same chat that offers to send the kept draft (the "Credits added" card's
 * Send message). Provided by the chat panel that owns the composer; absent elsewhere (a shared or read-only view), where
 * such a card asks the person to press Send instead.
 * @public
 */
export const chatComposerSubmitContext = createContext<(() => Promise<void>) | undefined>(undefined);

/**
 * The composer's Send, when this chat panel has one.
 *
 * @returns The submit function, or `undefined`.
 * @public
 */
export const useChatComposerSubmit = (): (() => Promise<void>) | undefined => useContext(chatComposerSubmitContext);
