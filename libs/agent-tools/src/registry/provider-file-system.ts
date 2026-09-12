/**
 * The chat RPC filesystem over one composed view.
 *
 * This is an adapter and nothing else: the view already decides what the agent
 * may see and write and where each entry comes from (charter D1), so the only
 * work left here is the RPC shape — canonical project-relative keys, the
 * per-path {@link ResourceQueue} that keeps two tool calls on one file from
 * racing, and the stale-read recovery `editFile` needs.
 *
 * It takes a {@link ComposedView} rather than a bare provider on purpose. The
 * registry mask used to live in this factory, which meant every future caller
 * had to remember to build it; now a caller cannot construct an unfenced tool
 * filesystem at all, because an unfenced provider does not answer
 * `provenance`.
 *
 * The imports are type-only, so this module stays browser-safe and the registry
 * entry point does not drag a filesystem backend into a bundle.
 *
 * @module
 */

import type { ResourceQueue } from '@taucad/filesystem';
import type { ComposedView } from '@taucad/filesystem/composed-view';
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
  /** The composed view every path is resolved against. */
  readonly provider: ComposedView;
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
 * @example <caption>A daemon's file tools over its checkout</caption>
 * ```typescript
 * import { ResourceQueue } from '@taucad/filesystem';
 * import { composeView } from '@taucad/filesystem/composed-view';
 * import { NodeFsProvider } from '@taucad/filesystem/backend/node';
 * import { createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
 *
 * const view = composeView({ filesystem: new NodeFsProvider(process.cwd()) }, { consumer: 'agent' });
 * const fileSystem = createProviderRpcFileSystem({ provider: view, mutations: new ResourceQueue() });
 * ```
 */
export const createProviderRpcFileSystem = (options: ProviderRpcFileSystemOptions): RpcFileSystem => {
  const { mutations, provider, signal } = options;
  const bytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> =>
    new Uint8Array(await provider.readFile(assertRootedPath(path)));
  const stat = async (path: string): Promise<RpcFileStat> => {
    const target = assertRootedPath(path);
    const value = await provider.stat(target);
    const { provenance } = value;
    const date = new Date(value.mtimeMs).toISOString();
    if (value.type === 'dir') {
      return { size: value.size, isDirectory: true, createdAt: date, modifiedAt: date, provenance };
    }
    return value.contentKind === 'text'
      ? {
          size: value.size,
          isDirectory: false,
          createdAt: date,
          modifiedAt: date,
          contentKind: 'text',
          lineCount: value.lineCount,
          provenance,
        }
      : {
          size: value.size,
          isDirectory: false,
          createdAt: date,
          modifiedAt: date,
          contentKind: 'binary',
          provenance,
        };
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
  const directoryEntry = (row: Awaited<ReturnType<ComposedView['readdirWithStats']>>[number]): RpcDirectoryEntry => {
    const { name, provenance } = row;
    const modifiedAt = row.mtimeMs > 0 ? new Date(row.mtimeMs).toISOString() : undefined;
    if (row.type === 'dir') {
      return {
        name,
        type: 'dir',
        size: row.size,
        /* N9: an unscoped `grep` or `glob_search` walks the project, never a
         * source composed above it. The view's own answer replaces the
         * hand-set flag the skill overlay used to carry. */
        ...(provenance !== undefined && provenance.source !== 'project' ? { traverseOnImplicitSearch: false } : {}),
        ...(modifiedAt ? { modifiedAt } : {}),
        ...(provenance ? { provenance } : {}),
      };
    }
    return {
      name,
      type: 'file',
      size: row.size,
      ...(row.contentKind === 'text' ? { contentKind: 'text', lineCount: row.lineCount } : { contentKind: 'binary' }),
      ...(modifiedAt ? { modifiedAt } : {}),
      ...(provenance ? { provenance } : {}),
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
      return (await provider.readdirWithStats(assertRootedPath(path))).map((row) => directoryEntry(row));
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
