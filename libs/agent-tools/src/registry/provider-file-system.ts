/**
 * The chat RPC filesystem over any `@taucad/filesystem` provider.
 *
 * Typed against the abstract `FileSystemProvider` rather than a concrete
 * backend, because the two hosts that need it differ only in which provider
 * they construct: `tau serve` roots a `NodeFsProvider` at its workspace, and
 * the Electron services utility roots one at the opened project. Both mutate
 * through the same per-path {@link ResourceQueue}, so two tool calls editing one
 * file serialize rather than racing.
 *
 * The import is type-only, so this module stays browser-safe and the registry
 * entry point does not drag a filesystem backend into a bundle.
 *
 * @module
 */

import type { FileSystemProvider, ResourceQueue } from '@taucad/filesystem';
import { applyClientTextMutation, createExactReplacementPlan } from '@taucad/chat/rpc';
import type { RpcDirectoryEntry, RpcFileStat, RpcFileSystem } from '@taucad/chat/rpc';
import { getErrno } from '@taucad/utils/error';
import { assertRootedPath } from '@taucad/utils/path';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');

const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw abortError(signal);
  }
};

/** Options for {@link createProviderRpcFileSystem}. @public */
export type ProviderRpcFileSystemOptions = {
  /** The rooted provider every path is resolved against. */
  readonly provider: FileSystemProvider;
  /** Per-path mutation queue shared across every tool call on this host. */
  readonly mutations: ResourceQueue;
  /** Cancels the invocation this filesystem was built for. */
  readonly signal?: AbortSignal | undefined;
};

/**
 * Adapt a filesystem provider to the chat RPC filesystem.
 *
 * @param options - Rooted provider, per-path mutation queue, and cancellation.
 * @returns The chat RPC filesystem the tool dispatcher consumes.
 * @public
 *
 * @example <caption>A daemon's file tools over its workspace root</caption>
 * ```typescript
 * import { ResourceQueue } from '@taucad/filesystem';
 * import { NodeFsProvider } from '@taucad/filesystem/backend/node';
 * import { createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
 *
 * const provider = new NodeFsProvider(process.cwd());
 * const mutations = new ResourceQueue();
 * const fileSystem = createProviderRpcFileSystem({ provider, mutations });
 * ```
 */
export const createProviderRpcFileSystem = (options: ProviderRpcFileSystemOptions): RpcFileSystem => {
  const { provider, mutations, signal } = options;
  const bytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> =>
    new Uint8Array(await provider.readFile(assertRootedPath(path)));
  const stat = async (path: string): Promise<RpcFileStat> => {
    const value = await provider.stat(assertRootedPath(path));
    const date = new Date(value.mtimeMs).toISOString();
    if (value.type === 'dir') {
      return { size: value.size, isDirectory: true, createdAt: date, modifiedAt: date };
    }
    return value.contentKind === 'text'
      ? {
          size: value.size,
          isDirectory: false,
          createdAt: date,
          modifiedAt: date,
          contentKind: 'text',
          lineCount: value.lineCount,
        }
      : { size: value.size, isDirectory: false, createdAt: date, modifiedAt: date, contentKind: 'binary' };
  };
  const writeIfUnchanged = async (
    path: string,
    expected: Uint8Array<ArrayBuffer>,
    replacement: Uint8Array<ArrayBuffer>,
  ) =>
    mutations.queueFor(path, async () => {
      const currentBytes = await bytes(path);
      const unchanged =
        currentBytes.byteLength === expected.byteLength &&
        currentBytes.every((byte, index) => byte === expected[index]);
      if (!unchanged) {
        return { status: 'conflict', currentBytes } as const;
      }
      assertNotAborted(signal);
      await provider.writeFile(path, new Uint8Array(replacement));
      return { status: 'committed', committedBytes: await bytes(path) } as const;
    });
  const directoryEntry = async (parent: string, name: string): Promise<RpcDirectoryEntry> => {
    const value = await provider.stat(assertRootedPath(parent ? `${parent}/${name}` : name));
    const modifiedAt = value.mtimeMs > 0 ? new Date(value.mtimeMs).toISOString() : undefined;
    if (value.type === 'dir') {
      return { name, type: 'dir', size: value.size, ...(modifiedAt ? { modifiedAt } : {}) };
    }
    return {
      name,
      type: 'file',
      size: value.size,
      ...(value.contentKind === 'text'
        ? { contentKind: 'text', lineCount: value.lineCount }
        : { contentKind: 'binary' }),
      ...(modifiedAt ? { modifiedAt } : {}),
    };
  };

  return {
    async readFile(path) {
      return textDecoder.decode(await bytes(path));
    },
    async writeFile(path, content) {
      await mutations.queueFor(path, async () => {
        assertNotAborted(signal);
        await provider.writeFile(assertRootedPath(path), textEncoder.encode(content));
      });
    },
    async writeBinaryFile(path, data) {
      await mutations.queueFor(path, async () => {
        assertNotAborted(signal);
        await provider.writeFile(assertRootedPath(path), new Uint8Array(data));
      });
    },
    async deleteFile(path) {
      await mutations.queueFor(path, async () => {
        const target = assertRootedPath(path);
        const value = await provider.stat(target);
        assertNotAborted(signal);
        // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
        /* ponytail: non-recursive rmdir, so a non-empty directory surfaces
         * ENOTEMPTY rather than silently deleting a subtree. Walk it here only
         * if an agent-facing recursive delete is ever actually wanted. */
        await (value.type === 'dir' ? provider.rmdir(target) : provider.unlink(target));
      });
    },
    async readdir(path) {
      const parent = assertRootedPath(path);
      const names = await provider.readdir(parent);
      return Promise.all(names.map(async (name) => directoryEntry(parent, name)));
    },
    async exists(path) {
      return provider.exists(assertRootedPath(path));
    },
    async appendFile(path, content) {
      await mutations.queueFor(path, async () => {
        let existing = '';
        try {
          existing = textDecoder.decode(await bytes(path));
        } catch (error) {
          if (getErrno(error) !== 'ENOENT') {
            throw error;
          }
        }
        assertNotAborted(signal);
        await provider.writeFile(assertRootedPath(path), textEncoder.encode(existing + content));
      });
    },
    // oxlint-disable-next-line max-params -- RpcFileSystem owns this four-argument compatibility signature.
    async editFile(path, oldString, newString, replaceAll) {
      const result = await applyClientTextMutation({
        targetFile: path,
        fileSystem: { stat, readFileBytes: bytes, writeFileIfUnchanged: writeIfUnchanged },
        plan: createExactReplacementPlan({ oldString, newString, replaceAll }),
      });
      if (!result.ok) {
        throw Object.assign(new Error(result.message), { code: result.errorCode });
      }
      return {
        occurrences: result.occurrences,
        ...(result.staleRecovered ? { staleRecovered: true } : {}),
        diffStats: result.diffStats,
      };
    },
    stat,
  };
};
