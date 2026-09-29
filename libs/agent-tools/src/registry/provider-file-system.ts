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
 * One content rule lives here because every agent write funnels through it:
 * `tau.json` must stay a valid manifest with its identity. A broken manifest
 * cost the project its reachability before any reader could object, so the
 * model gets the defects as a tool error and retries instead (manifest
 * recovery blueprint R8).
 *
 * The filesystem imports are type-only, so this module stays browser-safe and
 * the registry entry point does not drag a filesystem backend into a bundle.
 *
 * @module
 */

import type { ResourceQueue } from '@taucad/filesystem';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import type { CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';
import { applyClientTextMutation, createExactReplacementPlan } from '@taucad/chat/rpc';
import type { RpcDirectoryEntry, RpcFileStat, RpcFileSystem } from '@taucad/chat/rpc';
import { rpcClientErrorCode } from '@taucad/chat/schemas/rpc';
import { checkProjectManifestReplacement } from '@taucad/types';
import { getErrno } from '@taucad/utils/error';
import { assertRootedPath } from '@taucad/utils/path';

const textEncoder = new TextEncoder();
// eslint-disable-next-line @typescript-eslint/naming-convention -- `ignoreBOM` is the native TextDecoder option name.
const textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The project manifest: the one path whose content an agent may edit but never break. */
const manifestPath = 'tau.json';
const maximumCheckedPreconditions = 32;
const maximumCheckedBytes = 8 * 1024 * 1024;

const manifestRefusal = (message: string): Error =>
  Object.assign(new Error(message), { code: rpcClientErrorCode.validationError });

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');

const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw abortError(signal);
  }
};

const asBytes = (value: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  typeof value === 'string' ? textEncoder.encode(value) : new Uint8Array(value);

const equalBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const unsupported = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'CHECKED_WRITE_UNSUPPORTED' &&
  (!('applicationState' in error) || error.applicationState === 'known-not-applied');

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
 * import { tauPathPolicy } from '@taucad/filesystem/path-registry';
 * import { createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
 *
 * const view = composeView(
 *   { filesystem: new NodeFsProvider(process.cwd()) },
 *   { consumer: 'agent', policy: tauPathPolicy },
 * );
 * const fileSystem = createProviderRpcFileSystem({ provider: view, mutations: new ResourceQueue() });
 * ```
 */
export const createProviderRpcFileSystem = (options: ProviderRpcFileSystemOptions): RpcFileSystem => {
  const { mutations, provider, signal } = options;
  const bytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> =>
    new Uint8Array(await provider.readFile(assertRootedPath(path)));
  // oxlint-disable-next-line typescript/no-restricted-types -- null is the checked-write absence sentinel.
  const currentOrAbsent = async (path: string): Promise<Uint8Array<ArrayBuffer> | null> => {
    try {
      return await bytes(path);
    } catch (error) {
      if (getErrno(error) === 'ENOENT') {
        return null;
      }
      throw error;
    }
  };
  const canonicalPreconditions = (preconditions: readonly FileWritePrecondition[]): FileWritePrecondition[] =>
    preconditions.map(({ path, expected }) => ({
      path: assertRootedPath(path),
      expected: expected === null ? null : asBytes(expected),
    }));
  const assertCheckedBounds = (preconditions: readonly FileWritePrecondition[], dataBytes = 0): void => {
    if (preconditions.length === 0 || preconditions.length > maximumCheckedPreconditions) {
      throw new TypeError(`Checked mutations require 1-${String(maximumCheckedPreconditions)} preconditions.`);
    }
    if (
      preconditions.reduce(
        (total, { expected }) => total + (expected === null ? 0 : asBytes(expected).byteLength),
        dataBytes,
      ) > maximumCheckedBytes
    ) {
      throw new TypeError(`Checked mutation request exceeds ${String(maximumCheckedBytes)} bytes.`);
    }
  };
  const compare = async (
    preconditions: readonly FileWritePrecondition[],
  ): Promise<CheckedFileWriteResult | undefined> => {
    const compared = await Promise.all(
      preconditions.map(async ({ path, expected }) => {
        const actual = await currentOrAbsent(path);
        return actual === null
          ? expected === null
            ? undefined
            : { path, actual }
          : expected !== null && equalBytes(actual, asBytes(expected))
            ? undefined
            : { path, actual };
      }),
    );
    const conflicts = compared.filter((conflict) => conflict !== undefined);
    return conflicts.length > 0 ? { status: 'conflict', conflicts } : undefined;
  };
  /** Refuse bytes that would leave `tau.json` invalid or re-identify the project. */
  const assertManifestReplacement = async (
    path: string,
    next: Uint8Array<ArrayBuffer>,
    current?: Uint8Array<ArrayBuffer>,
  ): Promise<void> => {
    if (assertRootedPath(path) !== manifestPath) {
      return;
    }
    let existing = current;
    if (existing === undefined) {
      try {
        existing = await bytes(path);
      } catch (error) {
        if (getErrno(error) !== 'ENOENT') {
          throw error;
        }
      }
    }
    const refusal = checkProjectManifestReplacement(next, existing);
    if (refusal !== undefined) {
      throw manifestRefusal(refusal);
    }
  };
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
      /* The queue fences this host's own tool calls only; a person's edit
       * reaches the checkout by another route (L4 D-103). Where the view can
       * compare and write in one step, it must, or an edit landing between
       * the read below and the write is overwritten. */
      if (provider.writeFileChecked !== undefined) {
        assertNotAborted(signal);
        const result = await provider
          .writeFileChecked({ path, data: replacement, preconditions: [{ path, expected }] })
          .catch((error: unknown) => {
            // A direct `NodeFsProvider` declares the method but owns no authority to run it.
            if (getErrno(error) === 'CHECKED_WRITE_UNSUPPORTED') {
              return undefined;
            }
            throw error;
          });
        if (result?.status === 'conflict') {
          // `null` is an absent file: read it so the caller sees the same ENOENT a read would give.
          const actual = result.conflicts[0]?.actual;
          return { status: 'conflict', currentBytes: actual ? new Uint8Array(actual) : await bytes(path) } as const;
        }
        if (result !== undefined) {
          return { status: 'committed', committedBytes: new Uint8Array(result.content) } as const;
        }
      }
      const currentBytes = await bytes(path);
      const unchanged =
        currentBytes.byteLength === expected.byteLength &&
        currentBytes.every((byte, index) => byte === expected[index]);
      if (!unchanged) {
        return { status: 'conflict', currentBytes } as const;
      }
      await assertManifestReplacement(path, replacement, currentBytes);
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
      const content = await bytes(path);
      try {
        return textDecoder.decode(content);
      } catch {
        throw Object.assign(new Error(`File '${path}' is not valid UTF-8 text.`), {
          code: rpcClientErrorCode.invalidTextEncoding,
        });
      }
    },
    async writeFile(path, content) {
      await mutations.queueFor(path, async () => {
        const next = textEncoder.encode(content);
        await assertManifestReplacement(path, next);
        assertNotAborted(signal);
        await provider.writeFile(assertRootedPath(path), next);
      });
    },
    async writeFileChecked(input) {
      const path = assertRootedPath(input.path);
      const preconditions = canonicalPreconditions(input.preconditions);
      const data = asBytes(input.data);
      assertCheckedBounds(preconditions, data.byteLength);
      if (!preconditions.some((precondition) => precondition.path === path)) {
        throw new TypeError('Checked writes require a destination precondition.');
      }
      return mutations.queueFor(path, async () => {
        await assertManifestReplacement(path, data);
        assertNotAborted(signal);
        if (provider.writeFileChecked !== undefined) {
          try {
            return await provider.writeFileChecked({ path, data, preconditions });
          } catch (error) {
            if (!unsupported(error)) {
              throw error;
            }
          }
        }
        const conflict = await compare(preconditions);
        if (conflict) {
          return conflict;
        }
        const current = await currentOrAbsent(path);
        if (current !== null && equalBytes(current, data)) {
          return { status: 'unchanged', content: current };
        }
        assertNotAborted(signal);
        await provider.writeFile(path, data);
        return { status: 'applied', content: await bytes(path) };
      });
    },
    async deleteFileChecked(input) {
      const path = assertRootedPath(input.path);
      const preconditions = canonicalPreconditions(input.preconditions);
      assertCheckedBounds(preconditions);
      if (path === manifestPath) {
        throw manifestRefusal('tau.json is the project manifest and cannot be deleted; edit it instead.');
      }
      if (!preconditions.some((precondition) => precondition.path === path)) {
        throw new TypeError('Checked deletes require a destination precondition.');
      }
      return mutations.queueFor(path, async () => {
        assertNotAborted(signal);
        if (provider.deleteFileChecked !== undefined) {
          try {
            return await provider.deleteFileChecked({ path, preconditions });
          } catch (error) {
            if (!unsupported(error)) {
              throw error;
            }
          }
        }
        const conflict = await compare(preconditions);
        if (conflict) {
          return conflict;
        }
        const current = await currentOrAbsent(path);
        if (current === null) {
          return { status: 'unchanged', content: new Uint8Array() };
        }
        assertNotAborted(signal);
        await provider.unlink(path);
        return { status: 'applied', content: new Uint8Array() };
      });
    },
    async writeBinaryFile(path, data) {
      await mutations.queueFor(path, async () => {
        const next = new Uint8Array(data);
        await assertManifestReplacement(path, next);
        assertNotAborted(signal);
        await provider.writeFile(assertRootedPath(path), next);
      });
    },
    async deleteFile(path) {
      await mutations.queueFor(path, async () => {
        const target = assertRootedPath(path);
        if (target === manifestPath) {
          throw manifestRefusal('tau.json is the project manifest and cannot be deleted; edit it instead.');
        }
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
      const rows = await provider.readdirWithStats(assertRootedPath(path));
      return rows.map((row) => directoryEntry(row));
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
        const next = textEncoder.encode(existing + content);
        await assertManifestReplacement(path, next);
        assertNotAborted(signal);
        await provider.writeFile(assertRootedPath(path), next);
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
        digest: result.digest,
      };
    },
    stat,
  };
};
