import { describe, it, expectTypeOf } from 'vitest';
import type { BulkMoveEdit, FileSystemClient, WorkspaceAuthorityClient } from '#file-system-client.js';
import type { StorageRootConfig, WorkspaceScope } from '@taucad/filesystem';

type AssertKeys<Expected extends keyof FileSystemClient> = Expected;

/**
 * Compile-only export: these RPC entry points must remain on {@link FileSystemClient}.
 *
 * @public
 */
export type FileSystemClientCoreRpcKeys = AssertKeys<
  | 'readFile'
  | 'writeFile'
  | 'stat'
  | 'readDirectory'
  | 'pollExternalChanges'
  | 'exists'
  | 'watch'
  | 'mount'
  | 'unmount'
  | 'unlink'
  | 'rmdir'
  | 'getZippedDirectory'
  | 'commitPendingProjectDirectory'
>;

describe('FileSystemClient explicit-workspace contract', () => {
  it('does not expose the legacy ambient setDirectoryHandle hook', () => {
    expectTypeOf<FileSystemClient>().not.toHaveProperty('setDirectoryHandle');
  });

  it('does not expose the deleted *Scoped suffix surface', () => {
    expectTypeOf<FileSystemClient>().not.toHaveProperty('readFileScoped');
    expectTypeOf<FileSystemClient>().not.toHaveProperty('deleteFileScoped');
    expectTypeOf<FileSystemClient>().not.toHaveProperty('deleteDirectoryScoped');
    expectTypeOf<FileSystemClient>().not.toHaveProperty('getZippedDirectoryScoped');
  });

  it('mount accepts a discriminated MountConfig', () => {
    expectTypeOf<Parameters<FileSystemClient['mount']>[1]>().toExtend<{
      class: 'authored' | 'derived' | 'authority-metadata';
      backend: 'webaccess' | 'indexeddb' | 'opfs' | 'memory' | 'node';
    }>();
  });

  it('webaccess mounts require an explicit directoryHandle and workspaceId', () => {
    type WebaccessMountConfig = Extract<Parameters<FileSystemClient['mount']>[1], { backend: 'webaccess' }>;
    expectTypeOf<WebaccessMountConfig>().toExtend<{
      directoryHandle: FileSystemDirectoryHandle;
      workspaceId: string;
    }>();
  });

  /*
   * Content is the view's and a physical scope is the `/files` browser's, and
   * the two never share a member any more (W11, H3): a scope is not an option on
   * a routed read, because a routed read has a root that owns it.
   */
  it('should keep every scope off the composed content surface', () => {
    type ReadFileOptions = Parameters<FileSystemClient['readFile']>[1];
    type RmdirOptions = Parameters<FileSystemClient['rmdir']>[1];
    type GetZippedDirectoryOptions = Parameters<FileSystemClient['getZippedDirectory']>[1];

    expectTypeOf<{ scope: WorkspaceScope }>().not.toExtend<NonNullable<ReadFileOptions>>();
    expectTypeOf<RmdirOptions>().toEqualTypeOf<{ recursive?: boolean } | undefined>();
    expectTypeOf<{ scope: WorkspaceScope }>().not.toExtend<NonNullable<GetZippedDirectoryOptions>>();

    expectTypeOf<undefined>().toExtend<ReadFileOptions>();
    expectTypeOf<undefined>().toExtend<RmdirOptions>();
    expectTypeOf<undefined>().toExtend<GetZippedDirectoryOptions>();
  });

  it('should carry no per-path content on the authority wire client', () => {
    expectTypeOf<WorkspaceAuthorityClient>().not.toHaveProperty('readFile');
    expectTypeOf<WorkspaceAuthorityClient>().not.toHaveProperty('writeFile');
    expectTypeOf<WorkspaceAuthorityClient>().not.toHaveProperty('readdir');
    expectTypeOf<WorkspaceAuthorityClient>().not.toHaveProperty('stat');
    expectTypeOf<WorkspaceAuthorityClient>().not.toHaveProperty('readDirectory');
    expectTypeOf<WorkspaceAuthorityClient>().not.toHaveProperty('readShallowDirectory');
    expectTypeOf<WorkspaceAuthorityClient>().not.toHaveProperty('getZippedDirectory');
    expectTypeOf<WorkspaceAuthorityClient>().toHaveProperty('readScopedFile');
    expectTypeOf<WorkspaceAuthorityClient>().toHaveProperty('pollExternalChanges');
    expectTypeOf<Parameters<WorkspaceAuthorityClient['readScopedShallowDirectory']>[1]>().toEqualTypeOf<{
      readonly scope: WorkspaceScope;
    }>();
  });

  it('exposes the journal-backed project-directory commit as one typed authority command', () => {
    type Input = Parameters<FileSystemClient['commitPendingProjectDirectory']>[0];
    expectTypeOf<Input>().toExtend<{
      providerBasePath: string;
      scope: StorageRootConfig;
      files: Readonly<Record<string, { readonly content: Uint8Array<ArrayBuffer> }>>;
      manifest: Uint8Array<ArrayBuffer>;
    }>();
    expectTypeOf<Input>().not.toHaveProperty('projectId');
  });

  it('does not expose move overwrite or bulk rollback options', () => {
    expectTypeOf<Parameters<FileSystemClient['move']>>().toEqualTypeOf<[source: string, target: string]>();
    expectTypeOf<Parameters<FileSystemClient['canMove']>>().toEqualTypeOf<[source: string, target: string]>();
    expectTypeOf<Parameters<FileSystemClient['bulkMove']>>().toEqualTypeOf<[edits: readonly BulkMoveEdit[]]>();
  });

  it('allows external polling to select one routed root', () => {
    expectTypeOf<Parameters<FileSystemClient['pollExternalChanges']>>().toEqualTypeOf<[root?: string]>();
  });

  /**
   * O1.2 at the protocol type (charter D3, D4, W12d).
   *
   * Each of these walked or indexed the raw provider with no view above it, so
   * every one handed a consumer the paths the registry hides. They are the
   * rooted surface's now — `duplicate`, `copyTree`, `search`, `statTree` — and a
   * consumer reaches them only through a composed view.
   */
  it('carries no unmasked walk, copy or index of a project tree', () => {
    expectTypeOf<FileSystemClient>().not.toHaveProperty('duplicateFile');
    expectTypeOf<FileSystemClient>().not.toHaveProperty('copyDirectory');
    expectTypeOf<FileSystemClient>().not.toHaveProperty('searchFiles');
    expectTypeOf<FileSystemClient>().not.toHaveProperty('getDirectoryStat');
  });
});
