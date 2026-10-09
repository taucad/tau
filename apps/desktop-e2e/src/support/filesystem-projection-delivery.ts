import type { Page } from 'playwright';

/** Evidence from the actual agent worker connection whose delivery the control holds. */
export type ProjectionDeliveryEvidence = {
  readonly held: number;
  readonly restored: number;
  readonly ports: readonly number[];
  readonly chats: readonly string[];
  readonly frames: ReadonlyArray<{
    readonly port: number;
    readonly id: string;
    readonly kind: string;
    readonly chatId: string;
  }>;
  readonly keepalives: number;
  readonly unrelatedResponses: number;
};

type DeliveryControl = {
  hold(chatId: string): void;
  restore(): void;
  evidence(): ProjectionDeliveryEvidence;
};

/** Install a reversible control on actual agent read/live frames before the document starts. */
export const installProjectionDeliveryControl = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    type Frame = { o?: number; k?: string; n?: string; i?: string; a?: { chatId?: string }; d?: { chatId?: string } };
    type Pending = { readonly deliver: () => void };
    const calls = new WeakMap<MessagePort, Map<string, string>>();
    const identities = new WeakMap<MessagePort, number>();
    const listeners = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
    const held: Pending[] = [];
    const frames: Array<{ port: number; id: string; kind: string; chatId: string }> = [];
    const matchedPorts = new Set<number>();
    const matchedChats = new Set<string>();
    let nextPort = 0;
    let heldCount = 0;
    let restored = 0;
    let keepalives = 0;
    let unrelatedResponses = 0;
    let mutedChat: string | undefined;
    const originalPost = MessagePort.prototype.postMessage;
    const originalAdd = MessagePort.prototype.addEventListener;
    const originalRemove = MessagePort.prototype.removeEventListener;
    MessagePort.prototype.postMessage = function (
      this: MessagePort,
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ): void {
      const frame = message as Frame | undefined;
      if (frame?.i && (frame.n === 'read' || frame.n === 'liveEvents' || frame.n === 'catchUp') && frame.a?.chatId) {
        let requests = calls.get(this);
        if (!requests) {
          requests = new Map();
          calls.set(this, requests);
          identities.set(this, ++nextPort);
        }
        requests.set(frame.i, frame.a.chatId);
      }
      originalPost.call(this, message, Array.isArray(options) ? { transfer: options } : options);
    };
    MessagePort.prototype.addEventListener = function (
      this: MessagePort,
      ...args: Parameters<MessagePort['addEventListener']>
    ): void {
      const [type, listener, options] = args;
      if (Object.is(listener, null)) {
        return;
      }
      if (type !== 'message') {
        originalAdd.call(this, type, listener, options);
        return;
      }
      const wrapped: EventListener = (event) => {
        const frame = (event as MessageEvent<Frame>).data;
        const chat = frame.i ? calls.get(this)?.get(frame.i) : undefined;
        const deliver = (): void => {
          if (typeof listener === 'function') {
            listener.call(this, event);
          } else {
            listener.handleEvent(event);
          }
        };
        if (frame.k === 'rs' && frame.o === 1 && chat === undefined && calls.has(this)) {
          unrelatedResponses += 1;
        }
        if (frame.k === 'lk' && calls.has(this)) {
          keepalives += 1;
        }
        if (
          mutedChat !== undefined &&
          chat === mutedChat &&
          (frame.k === 'rs' || frame.k === 'sn' || frame.k === 'sc' || frame.k === 'se')
        ) {
          held.push({ deliver });
          heldCount += 1;
          matchedPorts.add(identities.get(this)!);
          matchedChats.add(chat);
          frames.push({ port: identities.get(this)!, id: frame.i!, kind: frame.k, chatId: chat });
          return;
        }
        deliver();
      };
      listeners.set(listener, wrapped);
      originalAdd.call(this, type, wrapped, options);
    };
    MessagePort.prototype.removeEventListener = function (
      this: MessagePort,
      ...args: Parameters<MessagePort['removeEventListener']>
    ): void {
      const [type, listener, options] = args;
      if (Object.is(listener, null)) {
        return;
      }
      originalRemove.call(this, type, listeners.get(listener) ?? listener, options);
    };
    const control: DeliveryControl = {
      hold: (chatId) => {
        mutedChat = chatId;
      },
      restore: () => {
        mutedChat = undefined;
        for (const pending of held.splice(0)) {
          pending.deliver();
          restored += 1;
        }
      },
      evidence: () => ({
        held: heldCount,
        restored,
        ports: [...matchedPorts],
        chats: [...matchedChats],
        frames: [...frames],
        keepalives,
        unrelatedResponses,
      }),
    };
    Object.assign(globalThis, { __tauProjectionDeliveryControl: control });
  }, undefined);
};

/** Hold actual read/live delivery for exactly one chat. */
export const holdProjectionDelivery = async (page: Page, chatId: string): Promise<void> => {
  await page.evaluate((id) => {
    (globalThis as unknown as { __tauProjectionDeliveryControl: DeliveryControl }).__tauProjectionDeliveryControl.hold(
      id,
    );
  }, chatId);
};

/** Restore the original matching frames in arrival order. */
export const restoreProjectionDelivery = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    (
      globalThis as unknown as { __tauProjectionDeliveryControl: DeliveryControl }
    ).__tauProjectionDeliveryControl.restore();
  });
};

/** Inspect proof that the negative control intercepted a real connection. */
export const projectionDeliveryEvidence = async (page: Page): Promise<ProjectionDeliveryEvidence> =>
  page.evaluate(() =>
    (
      globalThis as unknown as { __tauProjectionDeliveryControl: DeliveryControl }
    ).__tauProjectionDeliveryControl.evidence(),
  );
