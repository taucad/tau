import { constants, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const defaultWorkspaceRoot = path.resolve(import.meta.dirname, '../../..');

/**
 * One chat's log text, as read from a place Node cannot walk (OPFS through a page).
 *
 * @public
 */
export type CapturedChatLog = { readonly chatId: string; readonly text: string };

/**
 * Where a project's captured logs go: `out/test-results/chat-logs/<project>/<spec>/` (FM-R14),
 * with `spec` the test file's name so that each spec's chats stay together.
 *
 * @public
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
 * Writes one log as `<destination>/<chatId>.<n>.jsonl` with the first free `n`: tests of one spec
 * reuse chat ids, and each capture must keep its own copy. The exclusive create makes concurrent
 * captures into one destination take distinct indexes.
 */
const writeIndexed = async (
  destination: string,
  chatId: string,
  write: (file: string) => Promise<void>,
): Promise<void> => {
  for (let index = 0; ; index += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the next index is tried only when this one is taken.
      await write(path.join(destination, `${path.basename(chatId)}.${index}.jsonl`));
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }
};

/**
 * Copies every `.tau/chats/<chatId>/events.jsonl` under `root` (the root itself and project
 * directories up to three levels below it) verbatim to `<destination>/<chatId>.<n>.jsonl`.
 * Call it at teardown, before the root is removed. Returns the chat ids copied.
 *
 * @public
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
  await Promise.all(
    logs.map(async ({ chatId, log }) =>
      writeIndexed(destination, chatId, async (file) => copyFile(log, file, constants.COPYFILE_EXCL)),
    ),
  );
  return logs.map(({ chatId }) => chatId).sort();
};

/**
 * Writes logs read elsewhere (OPFS) to `<destination>/<chatId>.<n>.jsonl`.
 *
 * @public
 */
export const writeChatLogs = async (destination: string, logs: readonly CapturedChatLog[]): Promise<void> => {
  if (logs.length === 0) {
    return;
  }
  await mkdir(destination, { recursive: true });
  await Promise.all(
    logs.map(async ({ chatId, text }) =>
      writeIndexed(destination, chatId, async (file) => writeFile(file, text, { flag: 'wx' })),
    ),
  );
};
