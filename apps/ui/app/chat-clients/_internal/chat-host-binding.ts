import { fromCallback } from 'xstate';
import type { EventObject } from 'xstate';
import { Topic } from '@taucad/events';
import { registerAgentHost } from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { BrowserAgentHostRegistration } from '#chat-clients/_internal/browser-agent-host-transport.js';

/**
 * What one chat's host binding is composed from, published by its route.
 *
 * The registration itself has to be built where the project's resources are —
 * the workspace authority, the file manager's bridge, the model catalog — but
 * *owning* it there is what broke the capability: `useCadChatClient` is mounted
 * once per transcript message plus four other places, every instance registered
 * the chat's host in one module-level map, and the last instance to unmount
 * deleted the entry. A rewinding dispatch truncates the transcript, so the
 * newest message components unmounted with nothing left to re-register and the
 * turn died on "Browser agent host is not configured" after a ten-second wait.
 *
 * So the route publishes the *ingredients* through this seam and the chat's own
 * session actor is the one registrant (V6). `compose` is called by the binding
 * actor, not by React, and reads whatever the route last published — the agent
 * config a turn admits with is the live one, never the render that registered.
 */
export type ChatHostServices = Readonly<{
  /** The placement these services build for; the binding re-registers when it changes. */
  placement: string;
  /** Builds this chat's registration for {@link ChatHostServices.placement}. */
  compose: () => BrowserAgentHostRegistration | undefined;
}>;

const servicesByChat = new Map<string, ChatHostServices>();
const servicesTopic = new Topic<{ readonly chatId: string }>({ name: 'chat.host-services' });

/**
 * Publish the ingredients one chat's host binding is composed from.
 *
 * @param chatId - The chat these services belong to.
 * @param services - The placement and the composer the binding calls.
 * @returns The unpublication, for the publisher's effect cleanup.
 * @public
 */
export const publishChatHostServices = (chatId: string, services: ChatHostServices): (() => void) => {
  servicesByChat.set(chatId, services);
  servicesTopic.emit({ chatId });
  return () => {
    if (servicesByChat.get(chatId) === services) {
      servicesByChat.delete(chatId);
      servicesTopic.emit({ chatId });
    }
  };
};

/** The services last published for one chat. @public */
export const chatHostServices = (chatId: string): ChatHostServices | undefined => servicesByChat.get(chatId);

/** Test-only reset of the module registry. @internal */
export const resetChatHostServices = (): void => {
  servicesByChat.clear();
};

/**
 * One chat's host registration, held for as long as its session actor runs.
 *
 * Invoked by `chatSessionMachine`'s `host` region, which re-enters — and so
 * re-invokes this exactly once — when the turn's placement changes. Nothing
 * else may call `registerAgentHost` for a chat: one actor per chat is what
 * makes "a chat that can dispatch is configured" structural rather than a race
 * between five mount sites.
 *
 * @public
 */
export const chatHostBinding = fromCallback<EventObject, { readonly chatId: string; readonly placement: string }>(
  ({ input }) => {
    let unregister: (() => void) | undefined;
    const bind = (): void => {
      const services = chatHostServices(input.chatId);
      if (services === undefined || services.placement !== input.placement) {
        /* The route has not published for this placement yet — or has published
         * for a newer one, whose own re-invocation is already on its way. */
        return;
      }
      const registration = services.compose();
      if (registration === undefined) {
        return;
      }
      unregister?.();
      unregister = registerAgentHost(input.chatId, registration);
    };
    bind();
    const unsubscribe = servicesTopic.subscribe({
      handler: () => {
        bind();
      },
      interestedIn: (event) => event.chatId === input.chatId,
    });
    return () => {
      unsubscribe();
      unregister?.();
    };
  },
);
