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
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';

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

  /**
   * H8 / EQ4, asserted where a component would take it (W6).
   *
   * Content is the owning root's (W12c), but the whole rooted surface is the
   * unmasked working copy: a member carrying all of it would hand any component
   * that reads the context the checkout, `.git/**` mask aside. Each trusted
   * store takes the slice it is composed with instead, so this fails the moment
   * one of them is widened back into the full client.
   */
  it('carries no unmasked rooted content client', () => {
    expectTypeOf<Context>().not.toHaveProperty('files');
    type FullContentMembers = {
      [Member in keyof Context]-?: Context[Member] extends RootedContentClient ? Member : never;
    }[keyof Context];
    expectTypeOf<FullContentMembers>().toEqualTypeOf<never>();
  });

  /** One `Pick` per trusted-store family, named for the family (W6). */
  it('hands each trusted store the slice it is composed with', () => {
    expectTypeOf<Context>().toHaveProperty('recordFiles');
    type Records = Context['recordFiles'];
    expectTypeOf<Records>().toHaveProperty('readFile');
    expectTypeOf<Records>().toHaveProperty('writeFile');
    expectTypeOf<Records>().toHaveProperty('rmdir');
    expectTypeOf<Parameters<Records['unlink']>>().toEqualTypeOf<[path: string]>();
    /* Absolute paths, and no `scope`: the root owns the routing. */
    expectTypeOf<{ recursive: true }>().toExtend<NonNullable<Parameters<Records['rmdir']>[1]>>();
    expectTypeOf<Records>().not.toHaveProperty('listProjectManifests');
    /* A record store never relocates a path nor writes one under a precondition. */
    expectTypeOf<Records>().not.toHaveProperty('move');
    expectTypeOf<Records>().not.toHaveProperty('mkdir');
    expectTypeOf<Records>().not.toHaveProperty('writeFileChecked');

    expectTypeOf<Context>().toHaveProperty('parameterFiles');
    type ParameterSlice = Context['parameterFiles'];
    expectTypeOf<ParameterSlice>().toHaveProperty('writeFileChecked');
    expectTypeOf<ParameterSlice>().toHaveProperty('move');
    /* The sidecar writes one file at a time, under its own precondition. */
    expectTypeOf<ParameterSlice>().not.toHaveProperty('writeFile');
    expectTypeOf<ParameterSlice>().not.toHaveProperty('writeFiles');
    expectTypeOf<ParameterSlice>().not.toHaveProperty('readdir');

    expectTypeOf<Context>().toHaveProperty('previewFiles');
    type Preview = Context['previewFiles'];
    expectTypeOf<Preview>().toHaveProperty('writeFiles');
    /* An ephemeral preview mount is written whole and never read back. */
    expectTypeOf<Preview>().not.toHaveProperty('readFile');
    expectTypeOf<Preview>().not.toHaveProperty('writeFile');
    expectTypeOf<Preview>().not.toHaveProperty('unlink');
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

  /**
   * The same guard, one level lower (W11, H3): `fileManagerRef`'s own snapshot.
   *
   * The context's slices are the intended doors, and the machine's `proxy` is the
   * only other one — it is the unrooted connection itself, so a caller that
   * reached it could read or write any project tree unmasked. Since W11 it
   * carries topology, the change stream and the `/files` browser's scoped reads,
   * and nothing per-path at all.
   */
  it('should keep per-path content off the file-manager snapshot proxy', () => {
    type Proxy = NonNullable<ReturnType<Context['fileManagerRef']['getSnapshot']>['context']['proxy']>;
    expectTypeOf<Proxy>().not.toHaveProperty('readFile');
    expectTypeOf<Proxy>().not.toHaveProperty('writeFile');
    expectTypeOf<Proxy>().not.toHaveProperty('writeFileChecked');
    expectTypeOf<Proxy>().not.toHaveProperty('appendFile');
    expectTypeOf<Proxy>().not.toHaveProperty('writeFiles');
    expectTypeOf<Proxy>().not.toHaveProperty('mkdir');
    expectTypeOf<Proxy>().not.toHaveProperty('readdir');
    expectTypeOf<Proxy>().not.toHaveProperty('stat');
    expectTypeOf<Proxy>().not.toHaveProperty('lstat');
    expectTypeOf<Proxy>().not.toHaveProperty('move');
    expectTypeOf<Proxy>().not.toHaveProperty('canMove');
    expectTypeOf<Proxy>().not.toHaveProperty('canRename');
    expectTypeOf<Proxy>().not.toHaveProperty('canCreate');
    expectTypeOf<Proxy>().not.toHaveProperty('canDelete');
    expectTypeOf<Proxy>().not.toHaveProperty('bulkMove');
    expectTypeOf<Proxy>().not.toHaveProperty('unlink');
    expectTypeOf<Proxy>().not.toHaveProperty('rmdir');
    expectTypeOf<Proxy>().not.toHaveProperty('exists');
    expectTypeOf<Proxy>().not.toHaveProperty('getZippedDirectory');
    expectTypeOf<Proxy>().not.toHaveProperty('readShallowDirectory');
    expectTypeOf<Proxy>().not.toHaveProperty('readDirectory');
    /* What it does carry. */
    expectTypeOf<Proxy>().toHaveProperty('mount');
    expectTypeOf<Proxy>().toHaveProperty('pollExternalChanges');
    expectTypeOf<Proxy>().toHaveProperty('readScopedFile');
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
