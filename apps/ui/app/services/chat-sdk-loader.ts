/**
 * The chat's one way to the AI SDK (progressive loading PL1; app state orchestration charter D5 as amended by the PL1
 * design review): a dynamic import of `services/chat-sdk.ts`, the same function form as the runtime's lazy children.
 * The app runtime composes it into the chat store beside the session loaders; the transcript materializer and the
 * composer's prewarm reach the same import, so the SDK loads once per page.
 */
import type { chatSdk } from '#services/chat-sdk.js';

/** The deferred AI SDK surface. @public */
export type ChatSdk = typeof chatSdk;

/** Loads the chat's SDK surface. @public */
export type ChatSdkLoader = () => Promise<ChatSdk>;

/** Where the chat's SDK comes from: its load, and the surface itself once that has settled. @public */
export type ChatSdkSource = Readonly<{ load: ChatSdkLoader; peek: () => ChatSdk | undefined }>;

let loaded: ChatSdk | undefined;
let pending: Promise<ChatSdk> | undefined;

const importChatSdk = async (): Promise<ChatSdk> => {
  try {
    const module = await import('#services/chat-sdk.js');
    loaded = module.chatSdk;
    return module.chatSdk;
  } catch (error) {
    pending = undefined;
    throw error;
  }
};

/**
 * Load the chat's SDK surface, once. A failed load is not kept, so the next call tries again.
 *
 * @returns The SDK surface.
 * @public
 */
export const loadChatSdk: ChatSdkLoader = async () => {
  pending ??= importChatSdk();
  return pending;
};

/**
 * The SDK surface if it has loaded, without loading it: a value the SDK made exists only once it has.
 *
 * @returns The surface, or `undefined` before its load settles.
 * @public
 */
export const peekChatSdk = (): ChatSdk | undefined => loaded;

const prewarm = async (): Promise<void> => {
  try {
    await loadChatSdk();
  } catch {
    /* The next load reports it. */
  }
};

/**
 * Start loading the SDK without waiting, so the first send is not slowed by its fetch (the composer calls it on
 * focus). A failure is left for the next load to report.
 *
 * @public
 */
export const prewarmChatSdk = (): void => {
  void prewarm();
};

/**
 * The chat's one SDK source: {@link loadChatSdk} and {@link peekChatSdk}.
 *
 * @public
 */
export const chatSdkSource: ChatSdkSource = { load: loadChatSdk, peek: peekChatSdk };
