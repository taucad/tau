import { safeDispose } from '@taucad/utils/dispose';
import { createFileSystemBridgePort, createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileSystemBridgeConnection, FileSystemBridgeRuntimeService } from '@taucad/fs-bridge';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import { assertRootedPath } from '@taucad/utils/path';
import { flattenAdmittedAssemblyGlb, validateAdmittedAssemblyGlb } from '@taucad/geometry-core';
import type { AssemblyDisplayProjector } from '@taucad/runtime/types';

/** Host-owned display projection gate for rooted assembly publication. */
export const admitAssemblyDisplay: AssemblyDisplayProjector = async ({ purpose, records, occurrences, readAsset }) => {
  if (purpose === 'admission') {
    await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
    return;
  }
  const flattened = await flattenAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
  return flattened.geometry.content;
};

/** Private host binding for durable reusable-part publication; evaluator authority stays separate. */
export const createAssemblyPublicationAuthority = async (
  openUserBridge: () => FileSystemBridgeConnection,
  signal: AbortSignal,
): Promise<{ fileSystem?: RuntimeFileSystem; dispose(): void }> => {
  signal.throwIfAborted();
  const bridge = createFileSystemBridgeProxy(openUserBridge());
  const connections = new Set<FileSystemBridgeConnection>();
  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const connection of connections) {
      safeDispose(connection.dispose);
    }
    connections.clear();
    safeDispose(bridge.dispose);
  };
  const prefix = '.tau/artifacts/reusable-parts';
  const scoped = (path: string): string => {
    if (disposed) {
      throw new Error('Captured host publication authority was disposed.');
    }
    const canonical = assertRootedPath(path);
    if (canonical !== prefix && !canonical.startsWith(`${prefix}/`)) {
      throw new Error('Host publication operation escapes the managed reusable-parts subtree.');
    }
    return canonical;
  };
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<Uint8Array<ArrayBuffer> | string> {
    return encoding === 'utf8' ? bridge.readFile(scoped(path), encoding) : bridge.readFile(scoped(path));
  }
  signal.addEventListener('abort', dispose, { once: true });
  try {
    signal.throwIfAborted();
    await bridge.ready;
    signal.throwIfAborted();
    const hello = bridge.hello.payload;
    if (hello.state !== 'ready') {
      throw new Error('Rooted host publication authority is unavailable.');
    }
    if (!hello.capabilities.writable) {
      signal.removeEventListener('abort', dispose);
      dispose();
      return { dispose };
    }
    const denied = async (): Promise<never> => {
      throw new Error('Host publication authority only permits checked publication writes.');
    };
    const provider: FileSystemBridgeRuntimeService = {
      id: 'ui:reusable-parts-publication',
      capabilities: { ...hello.capabilities, writable: true },
      readFile,
      stat: async (path) => bridge.stat(scoped(path)),
      lstat: async (path) => bridge.lstat(scoped(path)),
      exists: async (path) => bridge.exists(scoped(path)),
      readdir: async (path) => bridge.readdir(scoped(path)),
      mkdir: async (path, options) => bridge.mkdir(scoped(path), options),
      writeFileChecked: async (input) =>
        bridge.writeFileChecked({
          ...input,
          path: scoped(input.path),
          preconditions: input.preconditions.map((condition) => ({ ...condition, path: scoped(condition.path) })),
        }),
      writeFile: async (path) => {
        scoped(path);
        return denied();
      },
      unlink: async (path) => {
        scoped(path);
        return denied();
      },
      rmdir: async (path) => {
        scoped(path);
        return denied();
      },
      rename: async (from, to) => {
        scoped(from);
        scoped(to);
        return denied();
      },
      // The captured user proxy belongs to the host, not any one runtime binding port.
      // oxlint-disable-next-line eslint/no-empty-function -- The captured host proxy, not this per-port decorator, owns resources.
      dispose() {},
    };
    const fileSystem = fromFileSystemBridge(() => {
      if (disposed) {
        throw new Error('Host publication authority was disposed.');
      }
      const connection = createFileSystemBridgePort(provider);
      const owned: FileSystemBridgeConnection = {
        port: connection.port,
        dispose: () => {
          try {
            connection.dispose();
          } finally {
            connections.delete(owned);
          }
        },
      };
      connections.add(owned);
      return owned;
    });
    signal.removeEventListener('abort', dispose);
    return { fileSystem, dispose };
  } catch (error) {
    signal.removeEventListener('abort', dispose);
    dispose();
    throw error;
  }
};
