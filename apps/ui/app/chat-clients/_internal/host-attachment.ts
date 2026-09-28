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
  onStatus?: (event: {
    type: 'attachment.attached' | 'attachment.lost' | 'attachment.refused';
    reason?: string;
  }) => void;
}>;

/** Follow the host's one log reader; an idle chat attaches without waiting on an empty read. @public */
export const hostAttachment = createCallbackLogic<EventObject, HostAttachmentInput>(({ input, sendBack }) => {
  let closed = false;
  let terminalRefusal = false;
  let unsubscribe: (() => void) | undefined;
  let client: Pick<AgentHostClient, 'read' | 'subscribe' | 'close'> | undefined;
  const report = (event: {
    type: 'attachment.attached' | 'attachment.lost' | 'attachment.refused';
    reason?: string;
  }): void => {
    if (!closed) {
      sendBack(event);
      input.onStatus?.(event);
    }
  };

  const begin = async (): Promise<void> => {
    try {
      client = await input.connect();
      if (closed) {
        await client.close();
        return;
      }
      unsubscribe = client.subscribe(
        { chatId: input.chatId, ...selectPosition(input.projection.getSnapshot().context) },
        () => undefined,
        () => {
          if (!terminalRefusal) {
            report({ type: 'attachment.lost', reason: 'subscriber ended' });
          }
        },
        (answer) => {
          if (closed) {
            return;
          }
          input.projection.send({ type: 'batch', answer });
          if (answer.status === 'refused') {
            if (answer.reason === 'unreadable') {
              terminalRefusal = true;
              report({ type: 'attachment.refused', reason: answer.reason });
            } else if (answer.reason === 'owner-fenced') {
              report({ type: 'attachment.lost', reason: answer.reason });
            }
          } else if (
            answer.events.length > 0 &&
            selectPosition(input.projection.getSnapshot().context).cursor < answer.nextCursor
          ) {
            report({ type: 'attachment.lost', reason: 'read made no progress' });
          }
          return selectPosition(input.projection.getSnapshot().context).last;
        },
      );
      report({ type: 'attachment.attached' });
    } catch (error) {
      report({ type: 'attachment.lost', reason: error instanceof Error ? error.message : String(error) });
    }
  };
  void begin();
  return () => {
    closed = true;
    unsubscribe?.();
    if (client !== undefined) {
      void client.close();
    }
  };
});
