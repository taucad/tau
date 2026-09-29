import { createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import type { UIMessageChunk } from 'ai';
import type { MyUIMessage } from '@taucad/chat';
import { openRunWatch } from '#chat-clients/_internal/run-watch.js';
import type { RunWatchSource } from '#chat-clients/_internal/run-watch.js';

/** Only the SDK calls a watch may make; it has no host-command port. @public */
export type SdkWatchInput = RunWatchSource &
  Readonly<{
    transport: Readonly<{
      arm: (stream: ReadableStream<UIMessageChunk>) => void;
      disarm: (stream: ReadableStream<UIMessageChunk>) => void;
    }>;
    chat: Readonly<{
      sendMessage: (message: MyUIMessage) => Promise<void> | void;
      regenerate: () => Promise<void> | void;
      resumeStream: () => Promise<void> | void;
    }>;
  }> &
  (Readonly<{ via: 'send'; message: MyUIMessage }> | Readonly<{ via: 'regenerate' | 'resume' }>);

/** Arm one projected run before the SDK enters its request queue. @public */
export const sdkWatch = createCallbackLogic<EventObject, SdkWatchInput>(({ input, sendBack }) => {
  const watch = openRunWatch(input);
  input.transport.arm(watch.stream);
  try {
    const request =
      input.via === 'send'
        ? input.chat.sendMessage(input.message)
        : input.via === 'regenerate'
          ? input.chat.regenerate()
          : input.chat.resumeStream();
    const report = async (): Promise<void> => {
      try {
        await request;
      } catch (error) {
        sendBack({ type: 'sdk.failed', error });
      }
    };
    void report();
  } catch (error) {
    sendBack({ type: 'sdk.failed', error });
  }
  return () => {
    input.transport.disarm(watch.stream);
    watch.detach();
  };
});
