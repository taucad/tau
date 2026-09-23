/**
 * Compile-time guarantees for the per-port mutation-context wrapper and
 * the simplified `createBridgeServer` primitive.
 *
 * These tests pin three architectural commitments:
 * 1. `bindMutationContextForPort` preserves the input handler shape.
 * 2. The override-map keys exhaustively match the
 *    `MutationMethodName` union — adding a new mutating method to
 *    `WorkspaceFileService` without updating the wrapper fails here.
 * 3. `createBridgeServer` is a dumb dispatcher: no `methodContextProvider`
 *    or any other context-injection hook.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { PathPolicy, WorkspaceFileService, WorkspaceMutationContext, WorkspaceScope } from '@taucad/filesystem';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { bindMutationContextForPort, exposeFileSystem, openFileSystemBridge } from '@taucad/fs-bridge';
import type {
  FileSystemBridgeHello,
  FileSystemBridgeRootedProxy,
  FileSystemBridgeWorkspaceProxy,
  FileSystemBridgeWorkspaceService,
  MutationMethodNameInternal,
  MutationOverrideMapInternal,
  RootedBridgeConsumer,
  RootedFileSystemHandlerFactory,
} from '@taucad/fs-bridge';
import type { createBridgeServer } from '@taucad/rpc/bridge';

declare const workspaceService: FileSystemBridgeWorkspaceService;

/**
 * Strict equality check: `true` only when `A` and `B` are mutually
 * assignable. Stronger than `extends` — catches both directions of
 * drift.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe('filesystem bridge hello — type guarantees', () => {
  it('requires the protocol version', () => {
    // @ts-expect-error Filesystem bridge hello producers must include the protocol version.
    const hello: FileSystemBridgeHello = {
      capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
      watchable: false,
    };
    expectTypeOf(hello).toExtend<FileSystemBridgeHello>();
  });
});

describe('bindMutationContextForPort — type guarantees', () => {
  it('preserves the input handler shape (T → T)', () => {
    const partial = { readFile: async (_: string) => new Uint8Array() };
    const wrapped = bindMutationContextForPort(partial, { originClientId: 'p' });
    expectTypeOf(wrapped).toEqualTypeOf<typeof partial>();
  });

  it('accepts a partial handler — no requirement that all mutating methods are present', () => {
    // Compile-only: this would fail if the wrapper required the full
    // `WorkspaceFileService` shape.
    bindMutationContextForPort({ readFile: async (_: string) => new Uint8Array() }, { originClientId: 'p' });
  });

  it('accepts the full WorkspaceFileService and returns the same nominal type', () => {
    type Wrapped = ReturnType<typeof bindMutationContextForPort<WorkspaceFileService>>;
    expectTypeOf<Wrapped>().toEqualTypeOf<WorkspaceFileService>();
  });

  it('requires a WorkspaceMutationContext for the second parameter', () => {
    expectTypeOf<Parameters<typeof bindMutationContextForPort>[1]>().toEqualTypeOf<WorkspaceMutationContext>();
  });

  it('override-map keys exactly match MutationMethodName (no extras, no omissions)', () => {
    expectTypeOf<Exact<keyof MutationOverrideMapInternal, MutationMethodNameInternal>>().toEqualTypeOf<true>();
  });

  it('every override-map row matches the live WorkspaceFileService signature', () => {
    // The override map type is `{ [K in MutationMethodName]: WorkspaceFileService[K] }`
    // (via Pick). This assertion pins that derivation: the override
    // type for `unlink` IS the service's `unlink` type. Any drift on
    // the live service surfaces as a TS error here.
    expectTypeOf<MutationOverrideMapInternal['unlink']>().toEqualTypeOf<WorkspaceFileService['unlink']>();
    expectTypeOf<MutationOverrideMapInternal['rmdir']>().toEqualTypeOf<WorkspaceFileService['rmdir']>();
    expectTypeOf<MutationOverrideMapInternal['writeFile']>().toEqualTypeOf<WorkspaceFileService['writeFile']>();
    expectTypeOf<MutationOverrideMapInternal['writeFileChecked']>().toEqualTypeOf<
      WorkspaceFileService['writeFileChecked']
    >();
    expectTypeOf<MutationOverrideMapInternal['appendFile']>().toEqualTypeOf<WorkspaceFileService['appendFile']>();
    expectTypeOf<MutationOverrideMapInternal['writeFiles']>().toEqualTypeOf<WorkspaceFileService['writeFiles']>();
    expectTypeOf<MutationOverrideMapInternal['mkdir']>().toEqualTypeOf<WorkspaceFileService['mkdir']>();
    expectTypeOf<MutationOverrideMapInternal['move']>().toEqualTypeOf<WorkspaceFileService['move']>();
    expectTypeOf<MutationOverrideMapInternal['commitPendingProjectDirectory']>().toEqualTypeOf<
      WorkspaceFileService['commitPendingProjectDirectory']
    >();
  });
});

/**
 * The rooted and workspace proxy types are split (gate G-A F9, G-B G5).
 *
 * One proxy type used to promise every call the wire carries, so a workspace
 * connection's type offered `search`, `statTree`, `copyTree`, `duplicate`,
 * `archive`, `contents`, `provenance` and `readdirWithStats` — none of which the
 * authority serves. W12(d) split them; these rows fail if the halves merge again.
 */
describe('bridge proxy surfaces — rooted / workspace split', () => {
  it('keeps every rooted-only call off a workspace proxy', () => {
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('search');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('statTree');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('copyTree');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('duplicate');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('archive');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('contents');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('provenance');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('readdirWithStats');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('rename');
  });

  /*
   * H3 is closed (W11, EQ3): the authority's wire is topology, the `/files`
   * browser's scoped reads and `pollExternalChanges`. Every per-path content
   * call the workspace surface used to carry — all 21 of them — is served by a
   * rooted connection, so an unmasked read or write of a project tree has no
   * spelling here at all.
   */
  it('should keep every per-path content call off the unrooted wire', () => {
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('readFile');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('writeFile');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('writeFileChecked');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('appendFile');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('writeFiles');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('mkdir');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('readdir');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('stat');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('lstat');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('move');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('canMove');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('canRename');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('canCreate');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('canDelete');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('bulkMove');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('unlink');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('rmdir');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('exists');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('getZippedDirectory');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('readShallowDirectory');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().not.toHaveProperty('readDirectory');
  });

  it('should serve the `/files` browser its scoped reads, scope required', () => {
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('readScopedFile');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('readScopedShallowDirectory');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('getScopedZippedDirectory');
    expectTypeOf<Parameters<FileSystemBridgeWorkspaceProxy['readScopedShallowDirectory']>[1]>().toEqualTypeOf<{
      readonly scope: WorkspaceScope;
    }>();
    expectTypeOf<Parameters<FileSystemBridgeWorkspaceProxy['getScopedZippedDirectory']>[1]>().toEqualTypeOf<{
      readonly scope: WorkspaceScope;
    }>();
  });

  it('should keep the per-path content calls on a rooted proxy', () => {
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('readFile');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('appendFile');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('readdir');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('stat');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('lstat');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('exists');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('bulkMove');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('canCreate');
  });

  it('keeps the authority surface and the transport on it', () => {
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('mount');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('configureProjectRoots');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('listProjectManifests');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('pollExternalChanges');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('dispose');
    expectTypeOf<FileSystemBridgeWorkspaceProxy>().toHaveProperty('listen');
  });

  it('serves both halves on a rooted proxy', () => {
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('search');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('statTree');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('copyTree');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('duplicate');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('provenance');
    expectTypeOf<FileSystemBridgeRootedProxy>().toHaveProperty('writeFile');
  });

  /* And the authority's four unmasked members are on neither half (W12d). */
  it('carries no unmasked authority walk, copy or index on the wire', () => {
    expectTypeOf<FileSystemBridgeRootedProxy>().not.toHaveProperty('duplicateFile');
    expectTypeOf<FileSystemBridgeRootedProxy>().not.toHaveProperty('copyDirectory');
    expectTypeOf<FileSystemBridgeRootedProxy>().not.toHaveProperty('searchFiles');
    expectTypeOf<FileSystemBridgeRootedProxy>().not.toHaveProperty('getDirectoryStat');
  });
});

/**
 * A rooted connection names its consumer in the type, not only on the wire
 * (blueprint W2, invariant CI2): the options are a discriminated pair —
 * unrooted carries neither member, rooted carries both.
 */
describe('rooted connect options — type guarantees', () => {
  it('requires a consumer beside a root and refuses one without a root', () => {
    const worker = { postMessage: () => undefined };
    // @ts-expect-error A rooted connection must name the surface it reads.
    openFileSystemBridge(worker, { root: '/projects/alpha' });
    // @ts-expect-error A workspace connection reads no composed view, so it names no consumer.
    openFileSystemBridge(worker, { consumer: 'user' });
    openFileSystemBridge(worker, { root: '/projects/alpha', consumer: 'working-copy' });
    openFileSystemBridge(worker);
    expectTypeOf<RootedBridgeConsumer>().toEqualTypeOf<'user' | 'agent' | 'working-copy'>();
  });

  it('hands the rooted handler the literal consumer, never an absent one', () => {
    expectTypeOf<Parameters<RootedFileSystemHandlerFactory>[2]>().toEqualTypeOf<RootedBridgeConsumer>();
  });

  /*
   * G0b-6: the policy that masks the change stream sits beside a root gate that
   * is not optional, and a host used to be able to omit it — silently serving a
   * masked consumer the stream whole (CI1). It is now required, and the bridge
   * hands the factory the root-rebased policy so the view and the stream are
   * masked by one object rather than by two spellings that may disagree.
   */
  it('requires a policy beside the rooted factory and hands it to the factory', () => {
    // @ts-expect-error A host that serves a rooted connection states the layout it masks.
    exposeFileSystem(workspaceService, { handlerForRoot: () => undefined });
    exposeFileSystem(workspaceService, { handlerForRoot: () => undefined, policy: tauPathPolicy });
    expectTypeOf<Parameters<RootedFileSystemHandlerFactory>[3]>().toEqualTypeOf<PathPolicy>();
  });
});

describe('createBridgeServer — primitive purity', () => {
  it('options bag does not carry any context-injection hook', () => {
    type Options = NonNullable<Parameters<typeof createBridgeServer>[2]>;
    expectTypeOf<'methodContextProvider'>().not.toExtend<keyof Options>();
  });
});
