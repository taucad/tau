/**
 * What one account reads of one project's Tau Cloud push records, as the
 * who-resolver sees it (blueprint A3, client half; I2 step 2).
 *
 * The store that reads `GET /v1/projects/:projectId/git/pushes` and joins it to
 * the rows the page holds is `lib/revision-pushes`. These are the shapes it
 * hands out, so the resolver here reads them without reaching that store.
 */

/**
 * Who pushed, as this viewer may see it: an account, or `anonymous` for a member who is not the owner (Q3).
 *
 * @public
 */
export type PushPusher =
  | Readonly<{ kind: 'account'; accountId: string; name?: string }>
  | Readonly<{ kind: 'anonymous' }>;

/** One push record, as a member reads it. @public */
export type PushEntry = Readonly<{
  generation: number;
  pusher: PushPusher;
  /** The owner's read of a push that brought an anonymous commit: the account is shown, marked as recorded anonymously. */
  anonymous?: true;
  /** A host device pushed it on the account's behalf ("by a cloud agent"). */
  viaDevice: boolean;
  /** The commits the branches it moved now hold. */
  tips: readonly string[];
}>;

/** What the resolver reads for one project. @public */
export type PushRecordSnapshot = Readonly<{
  /** The push an entry belongs to, or `undefined` for an entry no held push reaches. */
  pushOf: (revisionId: string) => PushEntry | undefined;
  /** Directory names by account id. */
  nameOf: (accountId: string) => string | undefined;
  /** Whether the account is in the directory at all. */
  isNamed: (accountId: string) => boolean;
  /** Current members of the project. */
  memberCount: number;
}>;
