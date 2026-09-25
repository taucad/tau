import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const defaultWorkspaceRoot = path.resolve(import.meta.dirname, '../../..');

/** One chat's log text, as read from a place Node cannot walk (OPFS through a page). */
export type CapturedChatLog = { readonly chatId: string; readonly text: string };

/**
 * Where a project's captured logs go: `out/test-results/chat-logs/<project>/<spec>/` (FM-R14),
 * with `spec` the test file's name so that each spec's chats stay together.
 */
export const chatLogDestination = (
  project: string,
  testPath: string | undefined,
  workspaceRoot = defaultWorkspaceRoot,
): string => path.join(workspaceRoot, 'out/test-results/chat-logs', project, path.basename(testPath ?? 'unknown'));

const chatDirectories = async (directory: string, depth: number): Promise<string[]> => {
  const chats = path.join(directory, '.tau', 'chats');
  const own = existsSync(chats) ? [chats] : [];
  if (depth === 0) {
    return own;
  }
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== '.tau' && entry.name !== 'node_modules')
      .map(async (entry) => chatDirectories(path.join(directory, entry.name), depth - 1)),
  );
  return [...own, ...nested.flat()];
};

/**
 * Copies every `.tau/chats/<chatId>/events.jsonl` under `root` (the root itself and project
 * directories up to three levels below it) verbatim to `<destination>/<chatId>.jsonl`.
 * Call it at teardown, before the root is removed. Returns the chat ids copied.
 */
export const captureChatLogs = async (root: string, destination: string): Promise<string[]> => {
  const directories = await chatDirectories(root, 3);
  const listed = await Promise.all(
    directories.map(async (chats) => {
      const ids = await readdir(chats).catch(() => []);
      return ids.map((chatId) => ({ chatId, log: path.join(chats, chatId, 'events.jsonl') }));
    }),
  );
  const logs = listed.flat().filter(({ log }) => existsSync(log));
  if (logs.length > 0) {
    await mkdir(destination, { recursive: true });
  }
  await Promise.all(logs.map(async ({ chatId, log }) => copyFile(log, path.join(destination, `${chatId}.jsonl`))));
  return logs.map(({ chatId }) => chatId).sort();
};

/** Writes logs read elsewhere (OPFS) to `<destination>/<chatId>.jsonl`. */
export const writeChatLogs = async (destination: string, logs: readonly CapturedChatLog[]): Promise<void> => {
  if (logs.length === 0) {
    return;
  }
  await mkdir(destination, { recursive: true });
  await Promise.all(
    logs.map(async ({ chatId, text }) => writeFile(path.join(destination, `${path.basename(chatId)}.jsonl`), text)),
  );
};
