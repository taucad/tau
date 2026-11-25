/**
 * A chat's AI SDK `Chat`, behind a deferred child's facade (progressive loading PL1).
 *
 * The store creates one per session at acquire and starts the SDK's load at once, so the chat on screen is usually
 * the real one by the time anyone sends. Until it is, the facade answers as an unstarted `Chat` would (no messages
 * but those the store sets, status `ready`, no error) and holds every send, regenerate, resume, stop and later
 * message write in one ordered queue that replays on load (`runtime/deferred-child.ts`). The messages written before
 * any event was queued become the loaded chat's first messages. A failed load turns the facade to status `error`
 * with the load's failure as its error, the way an SDK request failure reads; each queued request is rejected with
 * it. The next request loads again, as an SDK chat's next request starts afresh after a failed one, and `clearError`
 * returns the facade to `ready` without one.
 */
import type { Chat } from '@ai-sdk/react';
import type { MyUIMessage } from '@taucad/chat';
import type { BrowserPlacementChatTransport } from '@taucad/chat-ui/chat-clients/_internal/browser-agent-host-transport';
import { createDeferredChild } from '#runtime/deferred-child.js';
import type { DeferredChild, DeferredChildPhase } from '#runtime/deferred-child.js';
import type { ChatSdk, ChatSdkSource } from '@taucad/chat-ui/services/chat-sdk-loader';

type SdkChat = Chat<MyUIMessage>;

/** What the store and its readers use of an SDK `Chat`. @public */
export type ChatView = Pick<
  SdkChat,
  | 'id'
  | 'messages'
  | 'status'
  | 'error'
  | 'sendMessage'
  | 'regenerate'
  | 'resumeStream'
  | 'stop'
  | 'clearError'
  | '~registerMessagesCallback'
  | '~registerStatusCallback'
  | '~registerErrorCallback'
>;

/** What a deferred chat is built from. @public */
export type DeferredChatOptions = Readonly<{
  chatId: string;
  transport: BrowserPlacementChatTransport<MyUIMessage>;
  /** The SDK's load, and the surface once loaded, so a chat acquired after the first is built at once. */
  sdk: ChatSdkSource;
  onFinish: NonNullable<ConstructorParameters<typeof Chat<MyUIMessage>>[0]['onFinish']>;
  onError: NonNullable<ConstructorParameters<typeof Chat<MyUIMessage>>[0]['onError']>;
  /** The queue's bound; the deferred child's default otherwise. */
  bound?: number;
}>;

type Registration = { off: (() => void) | undefined };

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * A chat's SDK `Chat`, loaded on demand behind an ordered event queue.
 *
 * @public
 */
export class DeferredChat implements ChatView {
  public readonly id: string;
  readonly #child: DeferredChild<SdkChat>;
  /* What `messages` reads before the SDK loads: the last write. */
  #messages: MyUIMessage[] = [];
  /* The last write made while no event was queued: the loaded chat's first messages. */
  #base: MyUIMessage[] | undefined;
  /* The message write that ends the queue, which a later write before the load replaces. */
  #queuedWrite: { messages: MyUIMessage[] } | undefined;
  /* The failed load as the chat's error, one object for every read. */
  #loadError: Error | undefined;
  readonly #messagesCallbacks = new Map<() => void, Registration & { messagesThrottle: number | undefined }>();
  readonly #statusCallbacks = new Map<() => void, Registration>();
  readonly #errorCallbacks = new Map<() => void, Registration>();

  public constructor(options: DeferredChatOptions) {
    this.id = options.chatId;
    this.#child = createDeferredChild({
      load: options.sdk.load,
      peek: options.sdk.peek,
      ...(options.bound === undefined ? {} : { bound: options.bound }),
      create: (sdk: ChatSdk) =>
        sdk.createChatInstance({
          chatId: options.chatId,
          transport: options.transport,
          onFinish: options.onFinish,
          onError: options.onError,
        }),
      onLoaded: (chat) => {
        const base = this.#base;
        if (base !== undefined) {
          chat.messages = base;
        }
        for (const [listener, registration] of this.#messagesCallbacks) {
          registration.off = chat['~registerMessagesCallback'](listener, registration.messagesThrottle);
        }
        for (const [listener, registration] of this.#statusCallbacks) {
          registration.off = chat['~registerStatusCallback'](listener);
        }
        for (const [listener, registration] of this.#errorCallbacks) {
          registration.off = chat['~registerErrorCallback'](listener);
        }
        /* The readers re-read once when they read written messages: those are now the chat's own. */
        if (base !== undefined) {
          this.#notify(this.#messagesCallbacks);
        }
      },
      onFault: (error) => {
        this.#queuedWrite = undefined;
        /* The queue is gone: the messages written last are what a later load starts from. */
        this.#base = this.#messages;
        this.#loadError = asError(error);
        this.#notify(this.#statusCallbacks);
        this.#notify(this.#errorCallbacks);
      },
    });
  }

  /** Start loading the SDK, if nothing has. */
  public load(): void {
    this.#child.load();
  }

  /** The facade's state, for tests and diagnostics. */
  public get phase(): DeferredChildPhase {
    return this.#child.phase();
  }

  /** The first load failure, if any: the child's first fault. */
  public get fault(): unknown {
    return this.#child.fault();
  }

  public get messages(): MyUIMessage[] {
    return this.#child.current()?.messages ?? this.#messages;
  }

  public set messages(messages: MyUIMessage[]) {
    const chat = this.#child.current();
    if (chat !== undefined) {
      chat.messages = messages;
      return;
    }
    this.#messages = messages;
    if (this.#child.pending() === 0) {
      this.#base = messages;
    } else if (this.#queuedWrite === undefined) {
      /* After a queued event, a write keeps its place: consecutive writes are one, the last. */
      const write = { messages };
      this.#queuedWrite = write;
      void this.#deliver((loaded) => {
        if (this.#queuedWrite === write) {
          this.#queuedWrite = undefined;
        }
        loaded.messages = write.messages;
      });
    } else {
      this.#queuedWrite.messages = messages;
    }
    this.#notify(this.#messagesCallbacks);
  }

  public get status(): SdkChat['status'] {
    return this.#child.current()?.status ?? (this.#child.phase() === 'failed' ? 'error' : 'ready');
  }

  public get error(): Error | undefined {
    const chat = this.#child.current();
    if (chat !== undefined) {
      return chat.error;
    }
    return this.#child.phase() === 'failed' ? this.#loadError : undefined;
  }

  public sendMessage: SdkChat['sendMessage'] = async (...args) => {
    this.#reopen();
    this.#endWrite();
    return this.#child.send(async (chat) => chat.sendMessage(...args));
  };

  public regenerate: SdkChat['regenerate'] = async (...args) => {
    this.#reopen();
    this.#endWrite();
    return this.#child.send(async (chat) => chat.regenerate(...args));
  };

  public resumeStream: SdkChat['resumeStream'] = async (...args) => {
    this.#reopen();
    this.#endWrite();
    return this.#child.send(async (chat) => chat.resumeStream(...args));
  };

  /** Stop: the loaded chat's, or a queued request's after it replays; nothing runs to stop otherwise. */
  public stop: SdkChat['stop'] = async () => {
    if (this.#child.current() === undefined && this.#child.pending() === 0) {
      return;
    }
    this.#endWrite();
    await this.#deliver(async (chat) => chat.stop());
  };

  /** Clear the error: the loaded chat's, a failed load's (so the next request loads again), or a queued one's. */
  public clearError: SdkChat['clearError'] = () => {
    const chat = this.#child.current();
    if (chat !== undefined) {
      chat.clearError();
      return;
    }
    if (this.#reopen()) {
      return;
    }
    if (this.#child.pending() > 0) {
      this.#endWrite();
      void this.#deliver((loaded) => {
        loaded.clearError();
      });
    }
  };

  /** The SDK's messages subscription, held across the load; `messagesThrottle` is its wait in milliseconds. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the SDK Chat member this stands in for
  public '~registerMessagesCallback': SdkChat['~registerMessagesCallback'] = (onChange, messagesThrottle) =>
    this.#register(
      { callbacks: this.#messagesCallbacks, onChange, registration: { off: undefined, messagesThrottle } },
      (chat) => chat['~registerMessagesCallback'](onChange, messagesThrottle),
    );

  // eslint-disable-next-line @typescript-eslint/naming-convention -- the SDK Chat member this stands in for
  public '~registerStatusCallback': SdkChat['~registerStatusCallback'] = (onChange) =>
    this.#register({ callbacks: this.#statusCallbacks, onChange, registration: { off: undefined } }, (chat) =>
      chat['~registerStatusCallback'](onChange),
    );

  // eslint-disable-next-line @typescript-eslint/naming-convention -- the SDK Chat member this stands in for
  public '~registerErrorCallback': SdkChat['~registerErrorCallback'] = (onChange) =>
    this.#register({ callbacks: this.#errorCallbacks, onChange, registration: { off: undefined } }, (chat) =>
      chat['~registerErrorCallback'](onChange),
    );

  /** Release the SDK: a load still running creates no chat, and queued events settle without running. */
  public dispose(): void {
    this.#child.dispose();
    this.#queuedWrite = undefined;
  }

  /* A failed load cleared, so the next request loads again: an SDK chat's next request also starts afresh. */
  #reopen(): boolean {
    if (this.#child.phase() !== 'failed') {
      return false;
    }
    this.#child.retry();
    this.#loadError = undefined;
    this.#notify(this.#statusCallbacks);
    this.#notify(this.#errorCallbacks);
    return true;
  }

  /* A queued event after a write ends the write's run of coalescing. */
  #endWrite(): void {
    this.#queuedWrite = undefined;
  }

  /* An event whose failure the facade has already reported: a stop or clear that never ran has nothing to answer. */
  async #deliver(event: (chat: SdkChat) => unknown): Promise<void> {
    try {
      await this.#child.send(event);
    } catch {
      /* The load's failure is the chat's error; the request that needed the SDK reports it. */
    }
  }

  #register<R extends Registration>(
    input: Readonly<{ callbacks: Map<() => void, R>; onChange: () => void; registration: R }>,
    onChat: (chat: SdkChat) => () => void,
  ): () => void {
    const { callbacks, onChange, registration } = input;
    const chat = this.#child.current();
    registration.off = chat === undefined ? undefined : onChat(chat);
    callbacks.set(onChange, registration);
    return () => {
      registration.off?.();
      if (callbacks.get(onChange) === registration) {
        callbacks.delete(onChange);
      }
    };
  }

  #notify(callbacks: ReadonlyMap<() => void, Registration>): void {
    for (const listener of callbacks.keys()) {
      listener();
    }
  }
}
