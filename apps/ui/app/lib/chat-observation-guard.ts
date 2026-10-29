import { readSessionStorage } from '#lib/session-storage.js';

/**
 * Chat id the desktop project registration attaches to prove the host.
 *
 * It is one id for every project. A build that opened the log left an empty
 * `.tau/chats/<id>` directory behind, and listing that directory as a chat makes
 * every open project observe the same id.
 */
export const registrationProbeChatId = '00000000-0000-4000-8000-000000000000';

/** This tab's chats that must not be observed again after the shell crashed on one. */
const quarantineStorageKey = 'tau.chat-observation-quarantine';

const observationConflictPattern = /^Chat (\S+) is already (?:observed|acquired) in project (\S+)\.$/u;

/**
 * The chat a cross-project observation error names.
 *
 * @param error - The route error the shell caught.
 * @returns The chat and the project that already holds it.
 */
export const chatObservationConflict = (
  error: unknown,
): { readonly chatId: string; readonly projectId: string } | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const match = observationConflictPattern.exec(error.message);
  const chatId = match?.[1];
  const projectId = match?.[2];
  if (chatId === undefined || projectId === undefined) {
    return undefined;
  }
  return { chatId, projectId };
};

const quarantinedChatIds = (): readonly string[] => {
  const raw = readSessionStorage()?.getItem(quarantineStorageKey);
  if (raw === undefined || raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id !== '') : [];
  } catch {
    return [];
  }
};

/**
 * Whether this id is not a person's chat, or this tab already crashed by observing it.
 *
 * The registration probe is never a chat, including after the app restarts. A chat
 * remembered here stays out for this tab only, so Go Back and Reload can mount the shell.
 *
 * @param chatId - The id a list or `observe` is about to use.
 * @returns `true` when observation must not claim the id for a project.
 */
export const isUnownedChatObservation = (chatId: string): boolean =>
  chatId === registrationProbeChatId || quarantinedChatIds().includes(chatId);

/**
 * Remember a chat the shell crashed on, so the next mount of this tab skips it.
 *
 * @param chatId - The chat named by the observation error.
 */
export const quarantineChatObservation = (chatId: string): void => {
  if (chatId === '') {
    return;
  }
  const storage = readSessionStorage();
  if (storage === undefined) {
    return;
  }
  const ids = new Set(quarantinedChatIds());
  ids.add(chatId);
  storage.setItem(quarantineStorageKey, JSON.stringify([...ids]));
};
