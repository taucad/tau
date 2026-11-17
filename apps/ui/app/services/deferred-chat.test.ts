/**
 * A chat's SDK `Chat` behind its deferred facade (progressive loading PL1): what the store reads and sends before the
 * SDK loads reaches the real chat in order once it does, a navigation away during the load builds nothing, and a
 * failed load reads as the chat's error until it is cleared and loaded again.
 */
import { describe, expect, it, vi } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import { BrowserPlacementChatTransport } from '@taucad/chat-ui/chat-clients/_internal/browser-agent-host-transport';
import { chatSdk } from '#services/chat-sdk.js';
import type { ChatSdk } from '#services/chat-sdk-loader.js';
import { DeferredChat } from '#services/deferred-chat.js';

type SdkChat = ReturnType<ChatSdk['createChatInstance']>;

const userMessage = (id: string, text: string): MyUIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] });

/** A deferred chat over the real SDK, whose load the test settles; each built chat's requests are recorded. */
const deferredChat = () => {
  const load = Promise.withResolvers<ChatSdk>();
  const built: SdkChat[] = [];
  /* Each request records the messages the real chat held when it ran. */
  const requests: Array<Readonly<{ kind: string; messages: readonly MyUIMessage[] }>> = [];
  const createChatInstance = vi.fn((options: Parameters<ChatSdk['createChatInstance']>[0]) => {
    const chat = chatSdk.createChatInstance(options);
    vi.spyOn(chat, 'sendMessage').mockImplementation(async (message) => {
      requests.push({ kind: 'send', messages: chat.messages });
      if (message !== undefined && 'id' in message && 'role' in message && 'parts' in message) {
        chat.messages = [...chat.messages, { id: String(message.id), role: 'user', parts: message.parts }];
      }
    });
    vi.spyOn(chat, 'stop').mockImplementation(async () => {
      requests.push({ kind: 'stop', messages: chat.messages });
    });
    built.push(chat);
    return chat;
  });
  const sdk: ChatSdk = { ...chatSdk, createChatInstance };
  const chat = new DeferredChat({
    chatId: 'chat_1',
    transport: new BrowserPlacementChatTransport<MyUIMessage>(),
    sdk: { load: async () => load.promise, peek: () => undefined },
    onFinish: () => undefined,
    onError: () => undefined,
  });
  return { chat, load, sdk, built, requests, createChatInstance };
};

/** A deferred chat whose first SDK load fails and whose second lands; each built chat's sends resolve. */
const failingOnceChat = (chatId: string) => {
  const built: SdkChat[] = [];
  const loader = vi
    .fn<() => Promise<ChatSdk>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      ...chatSdk,
      createChatInstance: (options) => {
        const created = chatSdk.createChatInstance(options);
        vi.spyOn(created, 'sendMessage').mockResolvedValue(undefined);
        built.push(created);
        return created;
      },
    });
  const chat = new DeferredChat({
    chatId,
    transport: new BrowserPlacementChatTransport<MyUIMessage>(),
    sdk: { load: loader, peek: () => undefined },
    onFinish: () => undefined,
    onError: () => undefined,
  });
  return { chat, built, loader };
};

describe('DeferredChat', () => {
  describe('before the SDK loads', () => {
    it('should read as an unstarted chat and hold the messages the store writes', () => {
      const { chat } = deferredChat();
      const onMessages = vi.fn();
      chat['~registerMessagesCallback'](onMessages);

      expect(chat.status).toBe('ready');
      expect(chat.error).toBeUndefined();
      expect(chat.messages).toEqual([]);

      const transcript = [userMessage('m1', 'hello')];
      chat.messages = transcript;

      expect(chat.messages).toBe(transcript);
      expect(onMessages).toHaveBeenCalledTimes(1);
      expect(chat.phase).toBe('unloaded');
    });

    it('should do nothing for a stop or a clear when nothing is queued', async () => {
      const { chat } = deferredChat();

      await chat.stop();
      chat.clearError();

      expect(chat.phase).toBe('unloaded');
    });
  });

  describe('an early send', () => {
    it('should deliver a send made before the load once it loads, after the messages written before it', async () => {
      const { chat, load, sdk, built, requests } = deferredChat();
      const transcript = [userMessage('m1', 'earlier')];
      chat.messages = transcript;

      const sent = chat.sendMessage(userMessage('m2', 'first send'));
      expect(chat.phase).toBe('loading');
      expect(requests).toEqual([]);

      load.resolve(sdk);
      await sent;

      expect(built).toHaveLength(1);
      expect(requests).toEqual([{ kind: 'send', messages: transcript }]);
      expect(chat.messages.map((message) => message.id)).toEqual(['m1', 'm2']);
    });

    it('should keep a write made after a queued send in its place, behind the send', async () => {
      const { chat, load, sdk, requests } = deferredChat();
      chat.messages = [userMessage('m1', 'before')];

      const sent = chat.sendMessage(userMessage('m2', 'send'));
      const rewritten = [userMessage('m9', 'rewritten')];
      chat.messages = [userMessage('m8', 'superseded')];
      chat.messages = rewritten;
      const stopped = chat.stop();

      expect(chat.messages).toBe(rewritten);
      load.resolve(sdk);
      await Promise.all([sent, stopped]);

      expect(requests.map((request) => [request.kind, request.messages.map((message) => message.id)])).toEqual([
        ['send', ['m1']],
        ['stop', ['m9']],
      ]);
      expect(chat.messages).toEqual(rewritten);
    });

    it('should move the subscriptions made before the load onto the loaded chat', async () => {
      const { chat, load, sdk, built } = deferredChat();
      const onMessages = vi.fn();
      const onStatus = vi.fn();
      const dropped = vi.fn();
      chat['~registerMessagesCallback'](onMessages);
      chat['~registerStatusCallback'](onStatus);
      const unsubscribe = chat['~registerMessagesCallback'](dropped);
      unsubscribe();

      chat.load();
      load.resolve(sdk);
      await vi.waitFor(() => {
        expect(chat.phase).toBe('loaded');
      });
      onMessages.mockClear();
      built[0]!.messages = [userMessage('m3', 'streamed')];

      expect(onMessages).toHaveBeenCalledTimes(1);
      expect(dropped).not.toHaveBeenCalled();
      expect(chat.messages.map((message) => message.id)).toEqual(['m3']);
    });

    it('should send at once, as the SDK does, once loaded', async () => {
      const { chat, load, sdk, requests } = deferredChat();
      chat.load();
      load.resolve(sdk);
      await vi.waitFor(() => {
        expect(chat.phase).toBe('loaded');
      });

      const sent = chat.sendMessage(userMessage('m4', 'now'));

      expect(requests.map((request) => request.kind)).toEqual(['send']);
      await sent;
    });
  });

  describe('once the SDK has loaded for an earlier chat', () => {
    it('should build the chat at once, so subscriptions and sends reach it directly', async () => {
      const chat = new DeferredChat({
        chatId: 'chat_3',
        transport: new BrowserPlacementChatTransport<MyUIMessage>(),
        sdk: { load: async () => chatSdk, peek: () => chatSdk },
        onFinish: () => undefined,
        onError: () => undefined,
      });

      chat.load();

      expect(chat.phase).toBe('loaded');
      const onMessages = vi.fn();
      chat['~registerMessagesCallback'](onMessages);
      chat.messages = [userMessage('m10', 'direct')];
      await vi.waitFor(() => {
        expect(onMessages).toHaveBeenCalled();
      });
      expect(chat.messages.map((message) => message.id)).toEqual(['m10']);
    });
  });

  describe('a navigation during the load', () => {
    it('should build no chat when the session is disposed before the SDK lands', async () => {
      const { chat, load, sdk, createChatInstance } = deferredChat();

      const sent = chat.sendMessage(userMessage('m5', 'left behind'));
      chat.dispose();
      load.resolve(sdk);

      await expect(sent).resolves.toBeUndefined();
      await Promise.resolve();
      expect(createChatInstance).not.toHaveBeenCalled();
      expect(chat.phase).toBe('disposed');
    });
  });

  describe('a failed load', () => {
    it('should read as the chat failing and reject the queued request with the load error', async () => {
      const { chat, load } = deferredChat();
      const onStatus = vi.fn();
      const onError = vi.fn();
      chat['~registerStatusCallback'](onStatus);
      chat['~registerErrorCallback'](onError);
      const failure = new Error('Failed to fetch dynamically imported module');

      const sent = chat.sendMessage(userMessage('m6', 'unsent'));
      load.reject(failure);

      await expect(sent).rejects.toBe(failure);
      expect(chat.status).toBe('error');
      expect(chat.error).toBe(failure);
      expect(chat.error).toBe(chat.error);
      expect(chat.fault).toBe(failure);
      expect(onStatus).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('should load again after the error is cleared and deliver the next request', async () => {
      const failure = new Error('offline');
      const built: SdkChat[] = [];
      const loader = vi
        .fn<() => Promise<ChatSdk>>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({
          ...chatSdk,
          createChatInstance: (options) => {
            const created = chatSdk.createChatInstance(options);
            vi.spyOn(created, 'sendMessage').mockResolvedValue(undefined);
            built.push(created);
            return created;
          },
        });
      const chat = new DeferredChat({
        chatId: 'chat_2',
        transport: new BrowserPlacementChatTransport<MyUIMessage>(),
        sdk: { load: loader, peek: () => undefined },
        onFinish: () => undefined,
        onError: () => undefined,
      });

      await expect(chat.sendMessage(userMessage('m7', 'first'))).rejects.toBe(failure);
      chat.clearError();

      expect(chat.status).toBe('ready');
      expect(chat.error).toBeUndefined();

      const retried = userMessage('m8', 'again');
      await chat.sendMessage(retried);

      expect(loader).toHaveBeenCalledTimes(2);
      expect(built[0]!.sendMessage).toHaveBeenCalledWith(retried);
      expect(chat.fault).toBe(failure);
    });

    it('should load again on the next request when nothing cleared the error, as the SDK sends after a failure', async () => {
      const { chat, built, loader } = failingOnceChat('chat_3');

      await expect(chat.sendMessage(userMessage('m10', 'first'))).rejects.toThrow('offline');
      expect(chat.status).toBe('error');

      const retried = userMessage('m11', 'again');
      await chat.sendMessage(retried);

      expect(loader).toHaveBeenCalledTimes(2);
      expect(built[0]!.sendMessage).toHaveBeenCalledWith(retried);
      expect(chat.status).toBe('ready');
    });

    it('should give the reloaded chat the messages written last, not those before the failed request', async () => {
      const { chat, built } = failingOnceChat('chat_4');
      chat.messages = [userMessage('m12', 'before')];

      const sent = chat.sendMessage(userMessage('m13', 'send'));
      const latest = [userMessage('m14', 'latest')];
      chat.messages = latest;
      await expect(sent).rejects.toThrow('offline');
      chat.clearError();
      chat.load();

      await vi.waitFor(() => {
        expect(chat.phase).toBe('loaded');
      });
      expect(built[0]!.messages).toEqual(latest);
    });
  });
});
