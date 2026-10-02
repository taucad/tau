import { describe, it, expectTypeOf } from 'vitest';
import type { FileSystemClient } from '#file-system-client.js';
import type { WorkspaceScope } from '@taucad/filesystem';

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
  | 'exists'
  | 'watch'
  | 'mount'
  | 'unmount'
  | 'readShallowDirectory'
  | 'unlink'
  | 'rmdir'
  | 'getZippedDirectory'
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

  it('mount-routed methods accept an optional scope inside their options bag', () => {
    type ReadFileOptions = Parameters<FileSystemClient['readFile']>[1];
    type UnlinkOptions = Parameters<FileSystemClient['unlink']>[1];
    type RmdirOptions = Parameters<FileSystemClient['rmdir']>[1];
    type GetZippedDirectoryOptions = Parameters<FileSystemClient['getZippedDirectory']>[1];

    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<ReadFileOptions>>();
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<UnlinkOptions>>();
    expectTypeOf<{ scope: WorkspaceScope; recursive: true }>().toExtend<NonNullable<RmdirOptions>>();
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<GetZippedDirectoryOptions>>();

    expectTypeOf<undefined>().toExtend<ReadFileOptions>();
    expectTypeOf<undefined>().toExtend<UnlinkOptions>();
    expectTypeOf<undefined>().toExtend<RmdirOptions>();
    expectTypeOf<undefined>().toExtend<GetZippedDirectoryOptions>();
  });
});
