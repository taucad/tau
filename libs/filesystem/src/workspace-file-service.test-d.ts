/**
 * Compile-time type tests for {@link WorkspaceFileService}.
 *
 * These assertions guard the explicit-workspace-boundaries contract
 * (`docs/research/filesystem-explicit-workspace-boundaries.md`) and the
 * collapsed `*Scoped` surface (`{ scope }` options-bag) at the type
 * level so a regression that loosens `mount` / `readShallowDirectory`
 * back to positional / ambient arguments — or re-introduces the
 * deleted `*Scoped` methods — fails CI before runtime tests even
 * start.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { RootedFileSystem, WorkspaceFileService } from '#workspace-file-service.js';
import type { WorkspaceScope } from '#mount-table.js';
import type { FileStatEntry } from '@taucad/types';

describe('WorkspaceFileService explicit-workspace contract', () => {
  it('mount accepts a discriminated MountConfig requiring directoryHandle + workspaceId for webaccess', () => {
    type MountConfigArgument = Parameters<WorkspaceFileService['mount']>[1];
    type WebaccessMount = Extract<MountConfigArgument, { backend: 'webaccess' }>;
    expectTypeOf<WebaccessMount>().toExtend<{
      directoryHandle: FileSystemDirectoryHandle;
      workspaceId: string;
    }>();

    type NonWebaccessMount = Exclude<MountConfigArgument, { backend: 'webaccess' }>;
    expectTypeOf<NonWebaccessMount>().toExtend<{ backend: 'indexeddb' | 'opfs' | 'memory' | 'node' }>();
    type NodeMount = Extract<MountConfigArgument, { backend: 'node' }>;
    expectTypeOf<NodeMount>().toExtend<{ path: string }>();
  });

  it('readShallowDirectory accepts WorkspaceScope inside an options bag', () => {
    type OptionsArgument = Parameters<WorkspaceFileService['readShallowDirectory']>[1];
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<OptionsArgument>>();
    expectTypeOf<undefined>().toExtend<OptionsArgument>();
  });

  it('keeps scoped reads while mutations remain mount-routed', () => {
    type ReadFileOptions = Parameters<WorkspaceFileService['readFile']>[1];
    type RmdirOptions = Parameters<WorkspaceFileService['rmdir']>[1];
    type GetZippedDirectoryOptions = Parameters<WorkspaceFileService['getZippedDirectory']>[1];

    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<ReadFileOptions>>();
    expectTypeOf<RmdirOptions>().toEqualTypeOf<{ recursive?: boolean } | undefined>();
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<GetZippedDirectoryOptions>>();

    expectTypeOf<undefined>().toExtend<ReadFileOptions>();
    expectTypeOf<undefined>().toExtend<RmdirOptions>();
    expectTypeOf<undefined>().toExtend<GetZippedDirectoryOptions>();
  });

  it('does not expose the deleted *Scoped suffix surface', () => {
    expectTypeOf<WorkspaceFileService>().not.toHaveProperty('readFileScoped');
    expectTypeOf<WorkspaceFileService>().not.toHaveProperty('deleteFileScoped');
    expectTypeOf<WorkspaceFileService>().not.toHaveProperty('deleteDirectoryScoped');
    expectTypeOf<WorkspaceFileService>().not.toHaveProperty('getZippedDirectoryScoped');
  });

  it('does not expose the legacy ambient setDirectoryHandle hook', () => {
    expectTypeOf<WorkspaceFileService>().not.toHaveProperty('setDirectoryHandle');
  });

  it('exposes root-keyed teardown', () => {
    expectTypeOf<WorkspaceFileService['disposeStorageRoot']>().parameters.toExtend<[storageRootKey: string]>();
  });

  it('requires an explicit search root and returns results asynchronously', () => {
    type Search = WorkspaceFileService['searchFiles'];
    expectTypeOf<Search>().parameters.toExtend<
      [root: string, query: string, options?: { maxResults?: number; includeDirectories?: boolean }]
    >();
    expectTypeOf<ReturnType<Search>>().toEqualTypeOf<Promise<FileStatEntry[]>>();
  });

  it('exposes the exact identity-safe permanent-delete result union', () => {
    type InputScope = Parameters<WorkspaceFileService['permanentlyDeleteProjectDirectory']>[0]['scope'];
    type Result = Awaited<ReturnType<WorkspaceFileService['permanentlyDeleteProjectDirectory']>>;

    expectTypeOf<Extract<InputScope, { backend: 'memory' }>>().toEqualTypeOf<never>();
    expectTypeOf<Result>().toEqualTypeOf<
      | { readonly status: 'deleted' | 'absent' }
      | { readonly status: 'identity-mismatch'; readonly actualProjectId: string }
      | { readonly status: 'unidentifiable' }
    >();
  });

  it('keeps rooted filesystems to transported provider primitives plus watch', () => {
    expectTypeOf<NonNullable<RootedFileSystem['appendFile']>>().parameters.toEqualTypeOf<
      [path: string, data: Uint8Array<ArrayBuffer> | string]
    >();
    expectTypeOf<RootedFileSystem>().not.toHaveProperty('readFiles');
    expectTypeOf<RootedFileSystem>().not.toHaveProperty('readdirContents');
    expectTypeOf<RootedFileSystem>().not.toHaveProperty('readdirStat');
    expectTypeOf<RootedFileSystem>().not.toHaveProperty('ensureDir');
  });
});
