/**
 * The chat observer a provisioned cloud host's image carries (agent observability T11); never throws into `tau serve`.
 *
 * The CLI is published and must not depend on the private reporter, so the image names a module of its own in
 * `TAU_HOST_OBSERVER_MODULE` and the CLI only loads it. Its default export is called with each agent project host's id
 * and an observation of that host's own turns, and answers the hook the project host calls, or `undefined` to observe
 * nothing. Self-hosted `tau serve` loads nothing: only the provisioned container (`TAU_CLOUD_HOST=1`) does.
 */

import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { observeOwnTurns } from '@taucad/agent-host';
import type { OwnTurns } from '@taucad/agent-host';
import type { HostDaemonOptions } from '@taucad/host';

/** The chat hook a loaded module answers, as the project host calls it. */
type ChatObserver = ReturnType<NonNullable<HostDaemonOptions['observeChats']>>;

/** What the image's module default-exports. */
type ObserverFactory = (
  input: Readonly<{ projectId: string; observe: (chatId: string) => Promise<OwnTurns> }>,
) => ChatObserver | undefined;

/** Answered for a project the module does not observe, or once it has failed. */
const inert: ChatObserver = { onChatQuiescent: () => undefined, close: () => undefined };

/**
 * One hook that swallows what it throws: observation never affects a run.
 *
 * @param hook - The module's hook.
 * @returns The contained hook.
 */
const quietly =
  <A extends unknown[]>(hook: (...args: A) => void) =>
  (...args: A): void => {
    try {
      hook(...args);
    } catch {
      /* The observer's own failure stays its own. */
    }
  };

/**
 * Load the image's observer for {@link HostDaemonOptions.observeChats}.
 *
 * @param environment - Process environment.
 * @param load - Module loader, for tests.
 * @returns The daemon's observer, or `undefined` when none is configured or the module cannot be used.
 */
export const loadCloudHostObserver = async (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  load: (url: string) => Promise<unknown> = async (url) => import(url),
): Promise<HostDaemonOptions['observeChats']> => {
  const path = environment['TAU_HOST_OBSERVER_MODULE'];
  if (environment['TAU_CLOUD_HOST'] !== '1' || path === undefined || !isAbsolute(path)) {
    return undefined;
  }
  let factory: unknown;
  try {
    const loaded = await load(pathToFileURL(path).href);
    factory = typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : undefined;
  } catch {
    return undefined;
  }
  if (typeof factory !== 'function') {
    return undefined;
  }
  const observerOf = factory as ObserverFactory;
  return (projectId, read) => {
    try {
      const observer = observerOf({ projectId, observe: async (chatId) => observeOwnTurns(read, chatId) });
      return observer === undefined
        ? inert
        : { onChatQuiescent: quietly(observer.onChatQuiescent), close: quietly(observer.close) };
    } catch {
      return inert;
    }
  };
};
