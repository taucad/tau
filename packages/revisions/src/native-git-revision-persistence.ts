import type { Revision } from '#revision-authority.js';
import type {
  RevisionPersistencePort,
  RevisionPersistenceReceipt,
  RevisionPersistenceSnapshot,
} from '#revision-persistence.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package import map resolves this internal source file.
import { createNativeGitAdapter } from '#native-git-adapter.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package import map resolves this internal source file.
import type { NativeGitAdapterOptions, NativeGitCapabilities } from '#native-git.types.js';

/**
 * Adapt Tau's native Git object/ref store to the durable revision-authority port.
 *
 * @param options - Native repository and managed-worktree locations.
 * @returns Revision persistence backed by `createNativeGitAdapter`.
 * @public
 */
export const createNativeGitRevisionPersistence = (options: NativeGitAdapterOptions): RevisionPersistencePort => {
  const adapter = createNativeGitAdapter(options);
  let capabilities: Promise<NativeGitCapabilities> | undefined;
  const inspect = async (): Promise<NativeGitCapabilities> => {
    capabilities ??= adapter.inspect();
    return capabilities;
  };
  const receipt = async (commitId: string): Promise<RevisionPersistenceReceipt> => {
    const nativeCapabilities = await inspect();
    return {
      engine: 'native-git',
      commitId,
      // The native adapter records no Jujutsu change id of its own.
      changeId: '',
      objectFormat: nativeCapabilities.objectFormat,
      conflicted: false,
    };
  };

  const load = async (): Promise<RevisionPersistenceSnapshot> => {
    const graph = await adapter.readRevisionGraph();
    return {
      revisions: await Promise.all(
        graph.revisions.map(async ({ revision, commit }) => ({
          revision,
          persistence: await receipt(commit),
        })),
      ),
      branchHeads: graph.branchHeads,
    };
  };

  const storeRevision = async (revision: Revision): Promise<RevisionPersistenceReceipt> => {
    const stored = await adapter.storeRevision(revision);
    return receipt(stored.commit);
  };

  return Object.freeze({
    load,
    storeRevision,
    updateBranchHead: adapter.updateBranchHead,
    deleteBranchHead: adapter.deleteBranchHead,
  });
};
