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

/**
 * The model that produced a revision, and the person it produced it for.
 *
 * The shape a named version's tag reads back (S31). A capture never records
 * it: it records a {@link RevisionAgentIdentity}, whose run and person are
 * required.
 *
 * @public
 */
export type RevisionAgentActor = Readonly<{
  kind: 'agent';
  /** The model id. */
  id: string;
  runId?: string;
  onBehalfOf?: RevisionUserActor;
}>;

/** Who one revision or tag is by (S37). @public */
export type RevisionActor = RevisionUserActor | RevisionAgentActor;

/**
 * An agent as a capture records it (blueprint B1, I1): the run holding the cut,
 * and always the person it ran for, so the commit's author and Tau Cloud's push
 * check both name a person and never a model.
 *
 * @public
 */
export type RevisionAgentIdentity = Readonly<{
  kind: 'agent';
  /** The model id. */
  id: string;
  runId: string;
  onBehalfOf: RevisionUserActor;
}>;

/**
 * Who one capture is by, resolved before the capture is built (blueprint B1, I1).
 *
 * There is no fallback: no project id, host id, login name or address stands in
 * for a person a host could not resolve. A host with no account records its
 * device pseudonym, a {@link RevisionUserActor} with `anonymous: true`.
 *
 * @public
 */
export type RevisionIdentity = RevisionUserActor | RevisionAgentIdentity;

/**
 * Which Tau leg recorded a revision (blueprint B1): the browser, the desktop
 * app, the `tau` command line, `tau serve`, or a Tau Cloud agent host.
 *
 * A diagnostic, never a display fact: who a row shows comes from Tau Cloud's
 * push record (I2).
 *
 * @public
 */
export type RevisionVia = 'browser' | 'desktop' | 'cli' | 'serve' | 'cloud';

/**
 * How a host names who its captures are by (blueprint B1).
 *
 * Required wherever a capture is built. `resolve` is asked per capture, because
 * signing in, signing out and turning anonymity on all change the answer inside
 * one session, and it answers an identity, never `undefined`.
 *
 * @public
 */
export type RevisionCaptureIdentity = Readonly<{
  /** The leg every capture of this host is recorded through. */
  via: RevisionVia;
  /**
   * The identity of one capture. An agent turn is resolved by `runId`, which is
   * how the model behind a turn reaches the revision at all.
   */
  resolve: (input: Readonly<{ runId: string | undefined; trigger: RevisionTrigger }>) => RevisionIdentity;
}>;

/**
 * Immutable authorship and run provenance for a revision, as version 2 of the
 * `Tau-Metadata` trailer records it (blueprint B1).
 *
 * @public
 */
export type RevisionProvenance = Readonly<{
  source: 'user' | 'agent' | 'merge' | 'restore' | 'import';
  /** Who it is by. Required, so an unattributed capture does not type-check (I1). */
  actor: RevisionIdentity;
  /** What asked for it (S30). */
  capture: RevisionTrigger;
  /** Which Tau leg recorded it. */
  via: RevisionVia;
  /** The admitting run; absent for `save`, `idle` and `close` (RM-R9). */
  runId?: string;
  /** That run's attempt (D10). */
  attempt?: number;
  /** Whether a turn revision is the dirty base its placement found, or its result (RM-R9). */
  turnCut?: 'base' | 'result';
  /** The checkout's other leases at the cut, sorted (AC9). */
  heldRunIds?: readonly string[];
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
   * The revision a restore brought back (D1).
   *
   * Present only on the revision a restore minted; the cut that recorded the
   * checkout *before* the restore carries the same `restore` capture and no
   * `restoredFrom`, so this — never the capture — is what names a *Restored* row.
   */
  restoredFrom?: string;
  /** Milliseconds since the Unix epoch. */
  createdAt: number;
}>;

/**
 * What a stored commit says about itself, as a read returns it (blueprint B1).
 *
 * A revision Tau recorded carries its whole {@link RevisionProvenance}. A commit
 * Tau did not record (an import's upstream history, a commit made with plain
 * Git, or one whose trailer is not version 2) carries no identity, capture or
 * leg, and reads as `source: 'import'` at its author time. Nothing stands in for
 * the identity it lacks.
 *
 * @public
 */
export type RecordedProvenance = Omit<RevisionProvenance, 'actor' | 'capture' | 'via'> &
  Partial<Pick<RevisionProvenance, 'actor' | 'capture' | 'via'>>;

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
