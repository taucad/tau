/**
 * Git's own tree object id, computed over a captured tree without writing it.
 *
 * Moved out of `revision-effects.ts` (W10.1); the hashing itself is
 * `tree-id-memo.ts`'s, which keeps its ids across cuts (E3).
 */
import type { ImmutableRevisionTree } from '#algorithms/index.js';
import type { ObjectFormat } from '#object-hash.js';
import { createTreeIdMemo } from '#tree-id-memo.js';

/*
 * One memo for every caller in this process that has no memo of its own. Its
 * bound is the memo's: one directory listing of the last tree hashed per object
 * format, so alternating projects cost re-digests, never growth.
 */
const shared = createTreeIdMemo();

/**
 * The object id the tree would have in the store, computed without writing it.
 *
 * The I5 gate compares a cut against the head's `treeId`, and the head's comes
 * from a recorded commit — so this has to be the *git* tree id and not a digest
 * of Tau's own choosing, or the gate would never hold and every turn would mint
 * an identical revision. Every mint checks the claim: `writeRevision` compares
 * what the engine recorded against what this computed, and refuses on a
 * mismatch rather than silently re-minting forever.
 *
 * @param tree - The captured tree.
 * @param format - The store's recorded object hash.
 * @returns Lowercase hexadecimal tree object id.
 * @public
 */
export const revisionTreeId = (tree: ImmutableRevisionTree, format: ObjectFormat): string =>
  shared.treeId(tree, format);
