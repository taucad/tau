/**
 * Revision vocabulary: what a revision *is*, who made it, and what a branch is
 * called.
 *
 * These are the value types the whole package speaks in — `Revision`, its
 * provenance and actors, the branded branch name. The in-memory
 * `RevisionAuthority` that used to live beside them is gone (P65): S10 landed,
 * and the graph every reader wants is the store's own, read through
 * `RevisionPort.log` in `revision-verbs.ts` and `revision-log-order.ts`. A
 * second projection of it in this process was a copy nothing constructed.
 */

import type { ImmutableRevisionTree, RevisionId } from '#algorithms/index.js';

declare const branchNameBrand: unique symbol;

/** Opaque branch-head name owned by one revision authority. @public */
export type RevisionBranchName = string & { readonly [branchNameBrand]: true };

/**
 * What asked for a revision, as the checkpoint policy names it.
 *
 * The same union `checkoutMachine` accepts as `CheckoutCutTrigger`; it is
 * declared here because it is provenance vocabulary — a fact recorded *about a
 * revision* — and `checkout.machine` imports nothing but XState, so it cannot
 * import it back. `checkout.machine.test-d.ts` asserts the two are identical,
 * which is what keeps the one union from becoming two.
 *
 * @public
 */
export type RevisionTrigger = 'turn' | 'save' | 'idle' | 'hidden' | 'close' | 'merge' | 'restore' | 'switch';

/**
 * A signed-in (or deliberately anonymous) person (S37, A26).
 *
 * `anonymous` is a property of the *recorded* identity, never of the setting
 * that produced it: the anonymity choice is applied when the revision is
 * written, and switching it later rewrites nothing.
 *
 * @public
 */
export type RevisionUserActor = Readonly<{
  kind: 'user';
  /** Stable id. `anon:<per-workspace hash>` when the person chose anonymity. */
  id: string;
  name?: string;
  /** Omitted for an anonymous actor: it is the identifying half. */
  email?: string;
  anonymous?: boolean;
}>;

/** The model that produced a revision, and the person it produced it for. @public */
export type RevisionAgentActor = Readonly<{
  kind: 'agent';
  /** The model id. */
  id: string;
  runId?: string;
  onBehalfOf?: RevisionUserActor;
}>;

/** Who one revision is by (S37). @public */
export type RevisionActor = RevisionUserActor | RevisionAgentActor;

/** Immutable authorship and run provenance for a revision. @public */
export type RevisionProvenance = Readonly<{
  source: 'user' | 'agent' | 'merge' | 'restore' | 'import';
  actorId: string;
  runId?: string;
  /**
   * Stable user-message id of the turn this revision recorded, when a turn did.
   *
   * The graph is the durable record (I3), so the link between a turn on screen
   * and the revision it minted is a fact *about the revision* rather than a
   * second store the client has to keep: a chat card is recovered from
   * `log(branch)` alone, on every host and after every reload. Absent for a
   * `save`, `idle`, `close`, `restore` or `merge` cut, which no turn owns.
   */
  turnId?: string;
  /**
   * Who this revision is by (S37).
   *
   * `actorId` stays the stable id every consumer already reads; this carries the
   * rest of the identity — the name and email stock `git log` shows, the model
   * behind an agent turn, and the person it ran for. Optional because a store
   * written before S37, and a caller that has no session to map, still records a
   * valid revision; the adapters fall back to `actorId` for the git author.
   */
  actor?: RevisionActor;
  /** What asked for this revision (S30). Absent in a store written before S30. */
  trigger?: RevisionTrigger;
  /** Milliseconds since the Unix epoch. */
  createdAt: number;
}>;

/** Generated summary plus an optional user-edited replacement. @public */
export type RevisionSummary = Readonly<{
  generated: string;
  edited?: string;
}>;

/** One immutable revision-graph node. @public */
export type Revision = Readonly<{
  id: RevisionId;
  parents: readonly RevisionId[];
  tree: ImmutableRevisionTree;
  provenance: RevisionProvenance;
  summary: RevisionSummary;
}>;

/**
 * Result of the native adapter's expected-old branch-head publication.
 *
 * The conflict shape is inline rather than a named export: `StaleBranchHeadConflict`
 * was that name, and it went with the retired in-memory authority (P65). The
 * shape itself is still what a refused publication has to say.
 *
 * @public
 */
export type BranchHeadUpdateResult =
  | Readonly<{
      status: 'updated';
      branch: RevisionBranchName;
      previousHead: RevisionId | undefined;
      /** `undefined` when the publication deleted the branch. */
      head: RevisionId | undefined;
    }>
  | Readonly<{
      status: 'conflicted';
      conflict: Readonly<{
        type: 'stale-head';
        branch: RevisionBranchName;
        expectedHead: RevisionId | undefined;
        actualHead: RevisionId | undefined;
        /** `undefined` when the refused publication was a branch deletion. */
        proposedHead: RevisionId | undefined;
      }>;
    }>;

/** Validate and brand an externally supplied branch name. @public */
export const revisionBranchName = (value: string): RevisionBranchName => {
  const components = value.split('/');
  if (
    value.length === 0 ||
    value.length > 256 ||
    value.startsWith('-') ||
    value.endsWith('.') ||
    value.includes('..') ||
    value.includes('@{') ||
    // eslint-disable-next-line no-control-regex, no-useless-escape -- Git forbids this exact control/punctuation set.
    /[\u0000-\u0020~^:?*\[\\\u007F]/u.test(value) ||
    components.some((component) => component === '' || component.startsWith('.') || component.endsWith('.lock'))
  ) {
    throw new TypeError('Revision branch name is invalid.');
  }
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- runtime validation establishes the opaque brand.
  return value as RevisionBranchName;
};
