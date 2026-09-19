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
 *     callbacks (`mount`, `unmount`, `disposeStorageRoot`)
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

  it('exposes a topology-only client facade gated behind getReadiedProxy', () => {
    expectTypeOf<Context>().toHaveProperty('client');
    type Client = Context['client'];
    expectTypeOf<Client>().toHaveProperty('listProjectManifests');
    expectTypeOf<Client>().toHaveProperty('commitPendingProjectDirectory');
    expectTypeOf<Client>().toHaveProperty('adoptProjectDirectory');
    expectTypeOf<Client>().toHaveProperty('permanentlyDeleteProjectDirectory');
  });

  /**
   * O1.2, asserted where a consumer would take it (charter D5, D12).
   *
   * The authority-global surface is topology. A content method reappearing on
   * `useFileManager().client` — by widening the facade, or by re-adding one to
   * the `FileSystemClient` it is picked from — fails here before any consumer
   * can reach the unmasked authority through it.
   */
  it('carries no content method on the topology client', () => {
    type Client = Context['client'];
    expectTypeOf<Client>().not.toHaveProperty('readFile');
    expectTypeOf<Client>().not.toHaveProperty('writeFile');
    expectTypeOf<Client>().not.toHaveProperty('writeFileChecked');
    expectTypeOf<Client>().not.toHaveProperty('writeFiles');
    expectTypeOf<Client>().not.toHaveProperty('mkdir');
    expectTypeOf<Client>().not.toHaveProperty('readdir');
    expectTypeOf<Client>().not.toHaveProperty('stat');
    expectTypeOf<Client>().not.toHaveProperty('lstat');
    expectTypeOf<Client>().not.toHaveProperty('exists');
    expectTypeOf<Client>().not.toHaveProperty('unlink');
    expectTypeOf<Client>().not.toHaveProperty('rmdir');
    expectTypeOf<Client>().not.toHaveProperty('move');
    expectTypeOf<Client>().not.toHaveProperty('bulkMove');
    expectTypeOf<Client>().not.toHaveProperty('duplicateFile');
    expectTypeOf<Client>().not.toHaveProperty('copyDirectory');
    expectTypeOf<Client>().not.toHaveProperty('searchFiles');
    expectTypeOf<Client>().not.toHaveProperty('getDirectoryStat');
    expectTypeOf<Client>().not.toHaveProperty('readDirectory');
    expectTypeOf<Client>().not.toHaveProperty('readShallowDirectory');
    expectTypeOf<Client>().not.toHaveProperty('getZippedDirectory');
    expectTypeOf<Client>().not.toHaveProperty('overrideUnit');
    /* The preflights answer about content too. */
    expectTypeOf<Client>().not.toHaveProperty('canMove');
    expectTypeOf<Client>().not.toHaveProperty('canRename');
    expectTypeOf<Client>().not.toHaveProperty('canCreate');
    expectTypeOf<Client>().not.toHaveProperty('canDelete');
  });

  /** Content is the owning root's (W12c); the trusted stores take this one. */
  it('exposes a rooted content client beside it', () => {
    expectTypeOf<Context>().toHaveProperty('files');
    type Files = Context['files'];
    expectTypeOf<Files>().toHaveProperty('readFile');
    expectTypeOf<Files>().toHaveProperty('writeFile');
    expectTypeOf<Files>().toHaveProperty('writeFileChecked');
    expectTypeOf<Files>().toHaveProperty('rmdir');
    expectTypeOf<Parameters<Files['unlink']>>().toEqualTypeOf<[path: string]>();
    /* Absolute paths, and no `scope`: the root owns the routing. */
    expectTypeOf<{ recursive: true }>().toExtend<NonNullable<Parameters<Files['rmdir']>[1]>>();
    expectTypeOf<Files>().not.toHaveProperty('listProjectManifests');
  });

  /** The `/files` browser's physical reads: scope required, nothing routed (charter D5). */
  it('exposes a scope-required storage client for the physical browser', () => {
    expectTypeOf<Context>().toHaveProperty('scopedStorage');
    type Scoped = Context['scopedStorage'];
    expectTypeOf<Scoped>().toHaveProperty('readShallowDirectory');
    expectTypeOf<Scoped>().toHaveProperty('readFile');
    expectTypeOf<Scoped>().toHaveProperty('getZippedDirectory');
    expectTypeOf<Parameters<Scoped['readShallowDirectory']>[1]>().toEqualTypeOf<{ readonly scope: WorkspaceScope }>();
    expectTypeOf<Parameters<Scoped['getZippedDirectory']>[1]>().toEqualTypeOf<{ readonly scope: WorkspaceScope }>();
    expectTypeOf<Scoped>().not.toHaveProperty('writeFile');
  });

  it('exposes a workspace admin facade with mount/unmount/root teardown', () => {
    expectTypeOf<Context>().toHaveProperty('workspace');
    type Workspace = Context['workspace'];
    expectTypeOf<Workspace>().toHaveProperty('mount');
    expectTypeOf<Workspace>().toHaveProperty('unmount');
    expectTypeOf<Workspace>().toHaveProperty('disposeStorageRoot');
    expectTypeOf<Workspace>().toHaveProperty('replaceWorkspaceHandle');
    expectTypeOf<Workspace>().toHaveProperty('disconnectWorkspace');
    expectTypeOf<Workspace>().toHaveProperty('restoreWorkspaceHandle');

    type MountConfigArgument = Parameters<Workspace['mount']>[1];
    type WebaccessMount = Extract<MountConfigArgument, { backend: 'webaccess' }>;
    expectTypeOf<WebaccessMount>().toExtend<{
      directoryHandle: FileSystemDirectoryHandle;
      workspaceId: string;
    }>();

    type NonWebaccessMount = Exclude<MountConfigArgument, { backend: 'webaccess' }>;
    expectTypeOf<NonWebaccessMount>().toExtend<{
      backend: 'indexeddb' | 'opfs' | 'memory' | 'node';
    }>();
    // Desktop Home: a node mount is addressed by its absolute host path.
    expectTypeOf<Extract<MountConfigArgument, { backend: 'node' }>>().toExtend<{ path: string }>();
  });

  it('does not expose ambient setDirectoryHandle, scoped suffix callbacks, or top-level admin callbacks', () => {
    expectTypeOf<Context>().toHaveProperty('createDirectory');
    expectTypeOf<Context>().toHaveProperty('deleteDirectory');
    expectTypeOf<Context>().not.toHaveProperty('setDirectoryHandle');
    expectTypeOf<Context>().not.toHaveProperty('readFileScoped');
    expectTypeOf<Context>().not.toHaveProperty('deleteFileScoped');
    expectTypeOf<Context>().not.toHaveProperty('deleteDirectoryScoped');
    expectTypeOf<Context>().not.toHaveProperty('getZippedDirectoryScoped');
    expectTypeOf<Context>().not.toHaveProperty('mkdir');
    expectTypeOf<Context>().not.toHaveProperty('rmdir');
    expectTypeOf<Context>().not.toHaveProperty('mount');
    expectTypeOf<Context>().not.toHaveProperty('unmount');
    expectTypeOf<Context>().not.toHaveProperty('invalidateStandaloneProvider');
    // The hook's top-level `readShallowDirectory` callback was lifted
    // onto `client.readShallowDirectory` as part of the collapse.
    expectTypeOf<Context>().not.toHaveProperty('readShallowDirectory');
  });
});
