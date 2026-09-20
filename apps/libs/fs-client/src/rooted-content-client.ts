/**
 * Content through the root that owns the path (charter D5, D12).
 *
 * The addressing stays absolute — every store, module cache, React context and
 * e2e fixture in the UI names a file by its absolute path — and only the
 * *resolution* lives here: one place classifies a path's route, opens or reuses
 * that route's rooted connection, and issues the call in the root's own
 * namespace. Trusted stores are the callers: records, attachments, thumbnails,
 * the parameter sidecar, `tau.json` and the project library file. The
 * authority-global surface is topology and owns no content (D5).
 *
 * Why a rooted connection rather than the composed view the file manager
 * already holds: Home's own `.tau/**` is the reserved layout's default —
 * `class: 'records'`, `agentAccess: 'hidden'` (path registry P13) — so every
 * composed view refuses `/.tau/composers/**` before provider I/O, and a
 * project's `.tau/library.json` the same way. Host record writers read and
 * write the working copy itself (architecture V6, charter D8), which is what a
 * `'working-copy'` connection hands back.
 *
 * @module
 */

import { parseRoute } from '@taucad/filesystem';
import { resolveAuthorityPath } from '@taucad/utils/path';
import type { ComposedViewProxy } from '#composed-view-client.js';

/**
 * The rooted surface one content call reaches, in the root's own namespace.
 *
 * Structural, like the {@link ComposedViewProxy} it is picked from: the only
 * implementation is a bridge proxy, and naming that type here would drag the
 * whole bridge surface into this package.
 *
 * @public
 */
export type RootedFiles = Pick<
  ComposedViewProxy,
  | 'readFile'
  | 'writeFile'
  | 'writeFileChecked'
  | 'writeFiles'
  | 'mkdir'
  | 'readdir'
  | 'stat'
  | 'exists'
  | 'unlink'
  | 'rmdir'
  | 'move'
>;

/** One root's open connection, and the release that closes it. @public */
export type RootedConnection = Readonly<{
  files: RootedFiles;
  dispose: () => void;
}>;

/**
 * The same surface addressed absolutely.
 *
 * @public
 */
export type RootedContentClient = RootedFiles;

/**
 * Every rooted connection one session opened, keyed by the root **and** the
 * consumer that asked for it.
 *
 * The consumer is half the key because it is half the capability: a
 * `'working-copy'` connection hands back the unmasked checkout and an `'agent'`
 * one a masked view of the same root, so a table keyed by the root alone would
 * answer an executor with whichever handle a trusted store happened to open
 * first.
 *
 * @public
 */
export type RootedContentOwner<Consumer extends string> = Readonly<{
  /**
   * The absolute-path content client one consumer reaches every root through.
   *
   * Stable per consumer, so a store memoised on it is not rebuilt.
   */
  files: (consumer: Consumer) => RootedContentClient;
  /** Close every connection this owner opened. Idempotent. */
  dispose: () => void;
}>;

/**
 * The root that owns one absolute path, and the path in that root's namespace.
 *
 * A route the product grammar claims — a project, a linked checkout, a preview
 * instance — is its own root; everything else is Home's, and Home's root is `/`.
 *
 * @param absolutePath - Absolute authority path.
 * @returns The owning root and the path inside it.
 * @public
 */
export const rootedPathOf = (absolutePath: string): Readonly<{ root: string; path: string }> => {
  const canonical = resolveAuthorityPath(absolutePath);
  const { id, rest } = parseRoute(canonical);
  if (id === undefined) {
    return { root: '/', path: canonical.slice(1) };
  }
  /* The head is whatever the route's own `rest` is not, so the grammar stays
   * the only speller of `/projects/<id>` and this module reads it back. */
  const head = canonical.slice(0, canonical.length - rest.length);
  return { root: head.endsWith('/') ? head.slice(0, -1) : head, path: rest };
};

/**
 * The one owner of a session's rooted connections, one per `(root, consumer)`.
 *
 * @param input - How to open one connection; the owner owns what it opens.
 * @returns One absolute-path content client per consumer, plus the session's release.
 * @public
 *
 * @example <caption>Open trusted rooted connections through the file-manager bridge</caption>
 * ```typescript
 * import { createRootedContentClient } from '@taucad/fs-client/rooted-content-client';
 *
 * export function exampleOwner(openRooted: (root: string, consumer: 'working-copy') => RootedFiles) {
 *   const owner = createRootedContentClient({
 *     open: async (root, consumer: 'working-copy') => ({
 *       files: openRooted(root, consumer),
 *       dispose: () => undefined,
 *     }),
 *   });
 *   return owner.files('working-copy');
 * }
 * ```
 */
export const createRootedContentClient = <Consumer extends string>(input: {
  readonly open: (root: string, consumer: Consumer) => Promise<RootedConnection>;
}): RootedContentOwner<Consumer> => {
  /**
   * Keyed by consumer and root together: the consumer decides what the handle
   * serves. A consumer never carries a space, so the first one splits the key.
   */
  const connections = new Map<string, Promise<RootedConnection>>();
  /** Releases for the connections that actually opened, so `dispose` stays synchronous. */
  const releases: Array<() => void> = [];
  /**
   * Which round of connections is current; `dispose` starts the next one.
   *
   * Not a latch: the React context wires `dispose` to an effect cleanup and the
   * client entry renders in `StrictMode`, whose dev double-mount replays that
   * cleanup against the same memo value. A released client is empty, not dead.
   */
  let generation = 0;

  /** One connection per `(root, consumer)`, opened once; a failed open is not remembered. */
  const connectionFor = async (root: string, consumer: Consumer): Promise<RootedConnection> => {
    const key = `${consumer} ${root}`;
    const existing = connections.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const opened = generation;
    const opening = (async (): Promise<RootedConnection> => {
      let connection: RootedConnection;
      try {
        connection = await input.open(root, consumer);
      } catch (error) {
        /* A worker that went away must not be remembered as this root's connection. */
        connections.delete(key);
        throw error;
      }
      if (opened === generation) {
        releases.push(connection.dispose);
      } else {
        /* Released while this one was still opening; closing it here leaks no port,
         * and the caller's own call answers on a connection nobody else holds. */
        connection.dispose();
      }
      return connection;
    })();
    connections.set(key, opening);
    return opening;
  };

  /** One absolute-path client per consumer, so a store memoised on it is stable. */
  const clients = new Map<Consumer, RootedContentClient>();

  const clientFor = (consumer: Consumer): RootedContentClient => {
    /**
     * The connection all of these paths belong to, and the rewrite into its
     * namespace.
     *
     * All of them or none: a rooted connection serves one root, so an operation
     * naming two is not one operation. The cross-root copy is `transfer` on the
     * authority (charter D11) and nothing here is it.
     */
    const rooted = async (
      absolutePaths: readonly string[],
    ): Promise<Readonly<{ files: RootedFiles; relative: (absolutePath: string) => string }>> => {
      const resolved = absolutePaths.map((absolutePath) => rootedPathOf(absolutePath));
      const root = resolved[0]?.root ?? '/';
      if (resolved.some((entry) => entry.root !== root)) {
        throw new Error(`One rooted connection serves one root; ${absolutePaths.join(', ')} span several.`);
      }
      const { files } = await connectionFor(root, consumer);
      return { files, relative: (absolutePath) => rootedPathOf(absolutePath).path };
    };

    /* One cast, for the one overloaded member: `readFile` answers text or bytes. */
    const readFile = (async (absolutePath: string, options?: 'utf8') => {
      const { files, relative } = await rooted([absolutePath]);
      return options === undefined
        ? files.readFile(relative(absolutePath))
        : files.readFile(relative(absolutePath), options);
    }) as RootedFiles['readFile'];

    return {
      readFile,
      writeFile: async (absolutePath, data) => {
        const { files, relative } = await rooted([absolutePath]);
        return files.writeFile(relative(absolutePath), data);
      },
      writeFileChecked: async (write) => {
        const { files, relative } = await rooted([write.path, ...write.preconditions.map(({ path }) => path)]);
        return files.writeFileChecked({
          ...write,
          path: relative(write.path),
          preconditions: write.preconditions.map((precondition) => ({
            ...precondition,
            path: relative(precondition.path),
          })),
        });
      },
      writeFiles: async (fileMap) => {
        const entries = Object.entries(fileMap);
        if (entries.length === 0) {
          return;
        }
        const { files, relative } = await rooted(entries.map(([absolutePath]) => absolutePath));
        return files.writeFiles(
          Object.fromEntries(entries.map(([absolutePath, descriptor]) => [relative(absolutePath), descriptor])),
        );
      },
      mkdir: async (absolutePath, options) => {
        const { files, relative } = await rooted([absolutePath]);
        return files.mkdir(relative(absolutePath), options);
      },
      readdir: async (absolutePath) => {
        const { files, relative } = await rooted([absolutePath]);
        return files.readdir(relative(absolutePath));
      },
      stat: async (absolutePath) => {
        const { files, relative } = await rooted([absolutePath]);
        return files.stat(relative(absolutePath));
      },
      exists: async (absolutePath) => {
        const { files, relative } = await rooted([absolutePath]);
        return files.exists(relative(absolutePath));
      },
      unlink: async (absolutePath) => {
        const { files, relative } = await rooted([absolutePath]);
        return files.unlink(relative(absolutePath));
      },
      rmdir: async (absolutePath, options) => {
        const { files, relative } = await rooted([absolutePath]);
        return files.rmdir(relative(absolutePath), options);
      },
      move: async (source, target) => {
        const { files, relative } = await rooted([source, target]);
        return files.move(relative(source), relative(target));
      },
    };
  };

  return {
    files: (consumer) => {
      const existing = clients.get(consumer);
      if (existing !== undefined) {
        return existing;
      }
      const client = clientFor(consumer);
      clients.set(consumer, client);
      return client;
    },
    dispose: () => {
      generation += 1;
      for (const release of releases.splice(0)) {
        release();
      }
      connections.clear();
    },
  };
};
