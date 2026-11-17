/**
 * The headless quiescence read of a closed project's chat logs (W30, row L7). The library loads this module only when
 * a closed project is deleted, so the lease and the log fold stay out of the interactive tier: a dynamic import of
 * `@taucad/agent-host` itself would keep its whole namespace there.
 */
import { unsettledLogRun } from '@taucad/agent-host';
import { leaseChatLogs } from '@taucad/agent-host/browser';
import type { Chat } from '@taucad/chat';

/** A chat as a refusal names it: its name, else its id. */
const chatLabelOf = (chats: readonly Chat[], chatId: string): string => {
  const name = chats.find((chat) => chat.id === chatId)?.name;
  return name === undefined || name.length === 0 ? `Chat ${chatId}` : `The chat "${name}"`;
};

/** A held lease over every chat log of one project. */
export type SettledChatLogsLease = Readonly<{ lost: () => boolean; release: () => void }>;

/**
 * Take every chat's log lease, so no tab can open a chat writer, and read each log while it is held. A chat another
 * tab still leads refuses, and so does a run that has not ended; a refusal holds nothing.
 *
 * @param input - The project, its stored chats, and the reader of one chat's log.
 * @returns The held lease: `lost` once a peer stole a chat's lock, `release` to end it.
 */
export const leaseSettledChatLogs = async (
  input: Readonly<{
    projectId: string;
    chats: readonly Chat[];
    readLog: (chatId: string) => Promise<Uint8Array<ArrayBuffer>>;
  }>,
): Promise<SettledChatLogsLease> => {
  const { projectId, chats, readLog } = input;
  const lease = await leaseChatLogs({ projectId, chatIds: chats.map((chat) => chat.id) });
  if (lease.status === 'led-elsewhere') {
    throw new Error(
      `${chatLabelOf(chats, lease.chatId)} is open in another tab or window. Close the project there before deleting it.`,
    );
  }
  try {
    for (const chat of chats) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one log at a time, so a refusal names its chat.
      const run = unsettledLogRun(await readLog(chat.id));
      if (run !== undefined) {
        throw new Error(
          `${chatLabelOf(chats, chat.id)} has a run that has not ended (${run.state}). Open the project and stop it, or wait for it to settle, before deleting.`,
        );
      }
    }
  } catch (error) {
    lease.release();
    throw error;
  }
  return lease;
};
