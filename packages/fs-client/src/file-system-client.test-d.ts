import { describe, it, expectTypeOf } from 'vitest';
import type { BulkMoveEdit, FileSystemClient } from '#file-system-client.js';
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
  | 'getDirectoryStat'
  | 'searchFiles'
  | 'pollExternalChanges'
  | 'exists'
  | 'watch'
  | 'mount'
  | 'unmount'
  | 'readShallowDirectory'
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
      backend: 'webaccess' | 'indexeddb' | 'opfs' | 'memory';
    }>();
  });

  it('webaccess mounts require an explicit directoryHandle and workspaceId', () => {
    type WebaccessMountConfig = Extract<Parameters<FileSystemClient['mount']>[1], { backend: 'webaccess' }>;
    expectTypeOf<WebaccessMountConfig>().toExtend<{
      directoryHandle: FileSystemDirectoryHandle;
      workspaceId: string;
    }>();
  });

  it('readShallowDirectory accepts WorkspaceScope inside an options bag', () => {
    type OptionsArgument = Parameters<FileSystemClient['readShallowDirectory']>[1];
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<OptionsArgument>>();
    expectTypeOf<undefined>().toExtend<OptionsArgument>();
  });

  it('keeps scoped reads while mutations remain mount-routed', () => {
    type ReadFileOptions = Parameters<FileSystemClient['readFile']>[1];
    type RmdirOptions = Parameters<FileSystemClient['rmdir']>[1];
    type GetZippedDirectoryOptions = Parameters<FileSystemClient['getZippedDirectory']>[1];

    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<ReadFileOptions>>();
    expectTypeOf<RmdirOptions>().toEqualTypeOf<{ recursive?: boolean } | undefined>();
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<GetZippedDirectoryOptions>>();

    expectTypeOf<undefined>().toExtend<ReadFileOptions>();
    expectTypeOf<undefined>().toExtend<RmdirOptions>();
    expectTypeOf<undefined>().toExtend<GetZippedDirectoryOptions>();
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

  it('keeps search rooted and allows external polling to select one routed root', () => {
    expectTypeOf<Parameters<FileSystemClient['searchFiles']>>().toExtend<
      [root: string, query: string, options?: { maxResults?: number; includeDirectories?: boolean }]
    >();
    expectTypeOf<Parameters<FileSystemClient['pollExternalChanges']>>().toEqualTypeOf<[root?: string]>();
  });
});
