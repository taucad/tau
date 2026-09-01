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
import type { WorkspaceFileService } from '#workspace-file-service.js';
import type { WorkspaceScope } from '#mount-table.js';

describe('WorkspaceFileService explicit-workspace contract', () => {
  it('mount accepts a discriminated MountConfig requiring directoryHandle + workspaceId for webaccess', () => {
    type MountConfigArgument = Parameters<WorkspaceFileService['mount']>[1];
    type WebaccessMount = Extract<MountConfigArgument, { backend: 'webaccess' }>;
    expectTypeOf<WebaccessMount>().toExtend<{
      directoryHandle: FileSystemDirectoryHandle;
      workspaceId: string;
    }>();

    type NonWebaccessMount = Exclude<MountConfigArgument, { backend: 'webaccess' }>;
    expectTypeOf<NonWebaccessMount>().toExtend<{ backend: 'indexeddb' | 'opfs' | 'memory' }>();
  });

  it('readShallowDirectory accepts WorkspaceScope inside an options bag', () => {
    type OptionsArgument = Parameters<WorkspaceFileService['readShallowDirectory']>[1];
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<OptionsArgument>>();
    expectTypeOf<undefined>().toExtend<OptionsArgument>();
  });

  it('mount-routed methods accept an optional scope inside their options bag', () => {
    type ReadFileOptions = Parameters<WorkspaceFileService['readFile']>[1];
    type UnlinkOptions = Parameters<WorkspaceFileService['unlink']>[1];
    type RmdirOptions = Parameters<WorkspaceFileService['rmdir']>[1];
    type GetZippedDirectoryOptions = Parameters<WorkspaceFileService['getZippedDirectory']>[1];

    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<ReadFileOptions>>();
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<UnlinkOptions>>();
    expectTypeOf<{ scope: WorkspaceScope; recursive: true }>().toExtend<NonNullable<RmdirOptions>>();
    expectTypeOf<{ scope: WorkspaceScope }>().toExtend<NonNullable<GetZippedDirectoryOptions>>();

    expectTypeOf<undefined>().toExtend<ReadFileOptions>();
    expectTypeOf<undefined>().toExtend<UnlinkOptions>();
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

  it('exposes a workspaceId-scoped invalidator', () => {
    expectTypeOf<WorkspaceFileService['invalidateStandaloneProvider']>().parameters.toExtend<
      [backend: 'webaccess' | 'indexeddb' | 'opfs' | 'memory', workspaceId?: string]
    >();
  });
});
