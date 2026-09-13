/**
 * Compile-time type tests for {@link FileManagerProvider} and
 * {@link useFileManager}.
 *
 * Guards the explicit-workspace-boundaries contract at the type level
 * (Audit R4 / R15 / `docs/research/filesystem-explicit-workspace-boundaries.md`)
 * plus the collapsed `client` / `workspace` facade surface introduced
 * by the typed-client refactor:
 *   - `initialBackend` is required on `FileManagerProvider`.
 *   - `webaccess` requires `projectId` (compile-time-rejected without).
 *   - `client` is a typed proxy facade; `workspace` carries lifecycle.
 *   - The legacy `setDirectoryHandle` ambient-state hook is gone.
 *   - The deleted `*Scoped` suffix surface and top-level admin
 *     callbacks (`mount`, `unmount`, `invalidateStandaloneProvider`)
 *     are no longer reachable on the context value.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { FileManagerProviderProps, useFileManager } from '#hooks/use-file-manager.js';
import type { WorkspaceScope } from '@taucad/filesystem';

describe('FileManagerProvider props discriminated union', () => {
  it('accepts indexeddb / opfs / memory without a projectId', () => {
    expectTypeOf<{
      readonly children: React.ReactNode;
      readonly rootDirectory: string;
      readonly initialBackend: 'indexeddb';
    }>().toExtend<FileManagerProviderProps>();

    expectTypeOf<{
      readonly children: React.ReactNode;
      readonly rootDirectory: string;
      readonly initialBackend: 'opfs';
    }>().toExtend<FileManagerProviderProps>();

    expectTypeOf<{
      readonly children: React.ReactNode;
      readonly rootDirectory: string;
      readonly initialBackend: 'memory';
    }>().toExtend<FileManagerProviderProps>();
  });

  it('requires projectId when initialBackend is webaccess', () => {
    expectTypeOf<{
      readonly children: React.ReactNode;
      readonly rootDirectory: string;
      readonly initialBackend: 'webaccess';
      readonly projectId: string;
    }>().toExtend<FileManagerProviderProps>();

    // Webaccess without projectId is structurally invalid — it must NOT
    // be assignable to FileManagerProviderProps.
    expectTypeOf<{
      readonly children: React.ReactNode;
      readonly rootDirectory: string;
      readonly initialBackend: 'webaccess';
    }>().not.toExtend<FileManagerProviderProps>();
  });

  it('rejects providers that omit initialBackend', () => {
    expectTypeOf<{
      readonly children: React.ReactNode;
      readonly rootDirectory: string;
    }>().not.toExtend<FileManagerProviderProps>();
  });
});

describe('useFileManager surface', () => {
  type Context = NonNullable<ReturnType<typeof useFileManager>>;

  it('exposes a typed client facade gated behind getReadiedProxy', () => {
    expectTypeOf<Context>().toHaveProperty('client');
    type Client = Context['client'];
    expectTypeOf<Client>().toHaveProperty('readFile');
    expectTypeOf<Client>().toHaveProperty('unlink');
    expectTypeOf<Client>().toHaveProperty('rmdir');
    expectTypeOf<Client>().toHaveProperty('getZippedDirectory');
    expectTypeOf<Client>().toHaveProperty('readShallowDirectory');

    // Each migrated method accepts an options-bag with optional `scope`.
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<Parameters<Client['unlink']>[1]>>();
    expectTypeOf<{ scope: WorkspaceScope; recursive: true }>().toExtend<NonNullable<Parameters<Client['rmdir']>[1]>>();
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<Parameters<Client['getZippedDirectory']>[1]>>();
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<Parameters<Client['readShallowDirectory']>[1]>>();
  });

  it('exposes a workspace admin facade with mount/unmount/invalidateStandaloneProvider', () => {
    expectTypeOf<Context>().toHaveProperty('workspace');
    type Workspace = Context['workspace'];
    expectTypeOf<Workspace>().toHaveProperty('mount');
    expectTypeOf<Workspace>().toHaveProperty('unmount');
    expectTypeOf<Workspace>().toHaveProperty('invalidateStandaloneProvider');

    type MountConfigArgument = Parameters<Workspace['mount']>[1];
    type WebaccessMount = Extract<MountConfigArgument, { backend: 'webaccess' }>;
    expectTypeOf<WebaccessMount>().toExtend<{
      directoryHandle: FileSystemDirectoryHandle;
      workspaceId: string;
    }>();

    type NonWebaccessMount = Exclude<MountConfigArgument, { backend: 'webaccess' }>;
    expectTypeOf<NonWebaccessMount>().toExtend<{
      backend: 'indexeddb' | 'opfs' | 'memory';
    }>();
  });

  it('does not expose ambient setDirectoryHandle, scoped suffix callbacks, or top-level admin callbacks', () => {
    expectTypeOf<Context>().not.toHaveProperty('setDirectoryHandle');
    expectTypeOf<Context>().not.toHaveProperty('readFileScoped');
    expectTypeOf<Context>().not.toHaveProperty('deleteFileScoped');
    expectTypeOf<Context>().not.toHaveProperty('deleteDirectoryScoped');
    expectTypeOf<Context>().not.toHaveProperty('getZippedDirectoryScoped');
    expectTypeOf<Context>().not.toHaveProperty('mount');
    expectTypeOf<Context>().not.toHaveProperty('unmount');
    expectTypeOf<Context>().not.toHaveProperty('invalidateStandaloneProvider');
    // The hook's top-level `readShallowDirectory` callback was lifted
    // onto `client.readShallowDirectory` as part of the collapse.
    expectTypeOf<Context>().not.toHaveProperty('readShallowDirectory');
  });
});
