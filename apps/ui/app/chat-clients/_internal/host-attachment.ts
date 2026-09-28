import { createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { selectPosition } from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionEvent } from '#machines/chat-projection.logic.js';

/** A read-only connection into one chat's projection. @public */
export type HostAttachmentInput = Readonly<{
  chatId: string;
  connect: () => Promise<Pick<AgentHostClient, 'read' | 'subscribe' | 'close'>>;
  projection: Readonly<{
    getSnapshot: () => Readonly<{ context: ChatProjection }>;
    send: (event: ChatProjectionEvent) => void;
  }>;
}>;

/** Read the log from its cursor; subscriber loss only detaches. @public */
export const hostAttachment = createCallbackLogic<EventObject, HostAttachmentInput>(({ input, sendBack }) => {
  let closed = false;
  let reading = false;
  let pending = false;
  let unsubscribe: (() => void) | undefined;
  let client: Pick<AgentHostClient, 'read' | 'subscribe' | 'close'> | undefined;
  const isClosed = (): boolean => closed;
  const hasPending = (): boolean => pending;

  const readAll = async (): Promise<boolean> => {
    if (reading) {
      pending = true;
      return true;
    }
    reading = true;
    try {
      for (;;) {
        pending = false;
        let caughtUp = false;
        /* A finite page bound catches a host that never lets its end cursor be reached. */
        for (let page = 0; page < 10_000; page++) {
          if (isClosed()) {
            return false;
          }
          const position = selectPosition(input.projection.getSnapshot().context);
          // oxlint-disable-next-line eslint/no-await-in-loop -- log pages must be read in cursor order.
          if (client === undefined) return false;
          const answer = await client.read({
            chatId: input.chatId,
            cursor: position.cursor,
            last: position.last,
          });
          if (isClosed()) {
            return false;
          }
          input.projection.send({ type: 'batch', answer });
          if (
            answer.status === 'refused' &&
            (answer.reason === 'cursor-ahead' || answer.reason === 'identity-mismatch')
          ) {
            continue;
          }
          if (answer.status === 'refused') {
            sendBack({
              type: answer.reason === 'unreadable' ? 'attachment.refused' : 'attachment.lost',
              reason: answer.reason,
            });
            return false;
          }
          const next = selectPosition(input.projection.getSnapshot().context).cursor;
          if (next === answer.endCursor) {
            caughtUp = true;
            break;
          }
          if (next <= position.cursor) {
            sendBack({ type: 'attachment.lost', reason: 'read made no progress' });
            return false;
          }
        }
        if (!caughtUp) {
          sendBack({ type: 'attachment.lost', reason: 'read page limit' });
          return false;
        }
        if (!hasPending()) {
          return !isClosed();
        }
      }
    } catch (error) {
      sendBack({ type: 'attachment.lost', reason: error instanceof Error ? error.message : String(error) });
      return false;
    } finally {
      reading = false;
    }
  };

  const begin = async (): Promise<void> => {
    try {
      client = await input.connect();
    } catch (error) {
      if (!closed)
        sendBack({ type: 'attachment.lost', reason: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (closed) {
      void client.close();
      return;
    }
    if (!(await readAll()) || closed) {
      return;
    }
    unsubscribe = client.subscribe(
      { chatId: input.chatId, cursor: selectPosition(input.projection.getSnapshot().context).cursor },
      () => {
        void readAll();
      },
      () => {
        sendBack({ type: 'attachment.lost', reason: 'subscriber ended' });
      },
    );
    sendBack({ type: 'attachment.attached' });
  };
  void begin();
  return () => {
    closed = true;
    unsubscribe?.();
    if (client !== undefined) void client.close();
  };
});
