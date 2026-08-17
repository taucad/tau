import { describe, expectTypeOf, it } from 'vitest';
import type { RootedFileSystem, WorkspaceFileService } from '@taucad/filesystem';
import { createFileSystemBridgePort, createFileSystemBridgeProxy, fileSystemBridgeSchemas } from '@taucad/fs-bridge';
import type {
  FileSystemBridgeHello,
  FileSystemBridgePort,
  FileSystemBridgeProxy,
  FileSystemBridgeRuntimeService,
  FileSystemBridgeService,
  FileSystemBridgeWorkspaceService,
} from '@taucad/fs-bridge';

declare const otherProtocolBrand: unique symbol;
type OtherProtocolPort = MessagePort & { readonly [otherProtocolBrand]: true };

describe('filesystem bridge protocol contract', () => {
  it('rejects raw and differently branded ports', () => {
    // @ts-expect-error Raw ports have no filesystem protocol identity.
    const raw: FileSystemBridgePort = new MessageChannel().port1;
    // @ts-expect-error A port branded for another protocol is not a filesystem port.
    const other: FileSystemBridgePort = new MessageChannel().port1 as OtherProtocolPort;
    expectTypeOf(raw).toEqualTypeOf<FileSystemBridgePort>();
    expectTypeOf(other).toEqualTypeOf<FileSystemBridgePort>();
  });

  it('requires a complete runtime handler at the canonical port constructor', () => {
    // @ts-expect-error A partial method bag is not a complete rooted/runtime filesystem.
    createFileSystemBridgePort({ readFile: async () => new Uint8Array() });
    expectTypeOf<Parameters<typeof createFileSystemBridgePort>[0]>().toEqualTypeOf<FileSystemBridgeRuntimeService>();
  });

  it('derives the full workspace handler from WorkspaceFileService', () => {
    expectTypeOf<WorkspaceFileService>().toExtend<FileSystemBridgeWorkspaceService>();
    expectTypeOf<{
      readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    }>().not.toExtend<FileSystemBridgeWorkspaceService>();
  });

  it('preserves canonical method overloads, arguments, and results on the proxy', () => {
    expectTypeOf<FileSystemBridgeProxy['readFile']>().toEqualTypeOf<FileSystemBridgeService['readFile']>();
    expectTypeOf<FileSystemBridgeProxy['rename']>().toEqualTypeOf<RootedFileSystem['rename']>();
    expectTypeOf<FileSystemBridgeProxy['stat']>().toEqualTypeOf<FileSystemBridgeService['stat']>();
    expectTypeOf(createFileSystemBridgeProxy).returns.toEqualTypeOf<FileSystemBridgeProxy>();
  });

  it('requires every known hello field and an explicit availability state', () => {
    // @ts-expect-error The version is mandatory.
    const noVersion: FileSystemBridgeHello = {
      state: 'ready',
      capabilities: { persistent: false, writable: true, quotaBased: false },
      watchable: false,
    };
    // @ts-expect-error Availability is never inferred from missing capabilities.
    const noState: FileSystemBridgeHello = {
      v: 1,
      capabilities: { persistent: false, writable: true, quotaBased: false },
      watchable: false,
    };
    // @ts-expect-error Ready runtime peers must publish concrete capabilities.
    const noCapabilities: FileSystemBridgeHello = { v: 1, state: 'ready', watchable: false };
    expectTypeOf(noVersion).toExtend<FileSystemBridgeHello>();
    expectTypeOf(noState).toExtend<FileSystemBridgeHello>();
    expectTypeOf(noCapabilities).toExtend<FileSystemBridgeHello>();
  });

  it('exports an exact validator inventory for every bridged call and listen', () => {
    expectTypeOf(fileSystemBridgeSchemas.calls).toHaveProperty('readFile');
    expectTypeOf(fileSystemBridgeSchemas.calls).toHaveProperty('rename');
    expectTypeOf(fileSystemBridgeSchemas.listens).toHaveProperty('watch');
    expectTypeOf(fileSystemBridgeSchemas.listens).toHaveProperty('broadcast');
  });
});
