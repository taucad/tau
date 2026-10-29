/** Immutable SDK code cache; no session, draft or run state is stored here. */
import type * as Ai from 'ai';
import type * as ReactAi from '@ai-sdk/react';

type ChatSdk = { readonly ai: typeof Ai; readonly react: typeof ReactAi };
let loaded: ChatSdk | undefined;
let pending: Promise<ChatSdk> | undefined;

/** Load SDK code when a composer is mounted. Concurrent callers share the import. */
const importChatSdk = async (): Promise<ChatSdk> => {
  try {
    const [ai, react] = await Promise.all([import('ai'), import('@ai-sdk/react')]);
    loaded = { ai, react };
    return loaded;
  } catch (error) {
    pending = undefined;
    throw error;
  }
};

export async function loadChatSdk(): Promise<ChatSdk> {
  pending ??= importChatSdk();
  return pending;
}

/** Acquisition is synchronous after the composer has admitted the SDK. */
export function requireChatSdk(): ChatSdk {
  if (loaded === undefined) {
    throw new Error('Chat SDK must finish loading before acquiring a chat.');
  }
  return loaded;
}
