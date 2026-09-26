/**
 * One key function derives both cross-tab names of a chat (W6 RH-R6, W0.17's O3 fix): `KeysAgree` by construction.
 * The lock keeps today's name, so builds before and after this change still exclude each other during the deploy that
 * ships it; the channel drops the checkout and the version, so a tab on another build or checkout hears the holder.
 */

/** The Web Lock and `BroadcastChannel` names of one chat. @internal */
export type ChatLeadershipNames = Readonly<{ lock: string; channel: string }>;

/**
 * Derive a chat's leadership names.
 *
 * @param projectId - The project.
 * @param chatId - The chat.
 * @returns The lock name and the channel name.
 * @internal
 */
export const chatLeadershipNames = (projectId: string, chatId: string): ChatLeadershipNames => {
  const key = [projectId, chatId].map((part) => encodeURIComponent(part)).join(':');
  return { lock: `agent-host-log:${key}`, channel: `agent-host:${key}` };
};
