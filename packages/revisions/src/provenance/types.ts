/**
 * The provenance module's types (cloud backup admission blueprint D1, contracts § 1).
 *
 * Every surface that decides who an entry is by reads these shapes and nothing
 * else. None of them has an address field: an address is classified inside the
 * module and only its class leaves it (I11).
 */

/**
 * What kind of address one role of a commit carries, never the address itself.
 *
 * - `tau`: `<x>@users.noreply.tau.new` or `noreply@tau.new`.
 * - `forge`: `<digits>+<login>@users.noreply.github.com` or `<login>@users.noreply.github.com`.
 * - `agent`: an exact address a recognised agent's registry entry lists (D6).
 * - `none`: no address.
 * - `foreign`: anything else.
 *
 * @public
 */
export type AddressClass = 'tau' | 'forge' | 'agent' | 'foreign' | 'none';

/**
 * A recognised external agent (D6). Closed: it grows only with commits captured
 * from that agent into the golden corpus.
 *
 * @public
 */
export type RecognisedAgentId = 'claude-code' | 'codex' | 'grok';

/**
 * Everything the module reads from one commit, with no address in it.
 *
 * @public
 */
export type CommitReading = Readonly<{
  /**
   * `tau/2` for one parsed version 2 `Tau-Metadata` record; `tau/other` for a
   * record line this build does not parse (version 1, newer, corrupt, or more
   * than one line); `git` for a commit with no record line.
   */
  shape: 'tau/2' | 'tau/other' | 'git';
  /** The committer is `Tau <noreply@tau.new>`. */
  tauWritten: boolean;
  /** The person a parsed version 2 user record names. */
  person?: Readonly<{ id: string; name?: string; anonymous?: boolean }>;
  /** The person a parsed version 2 agent record ran for. */
  onBehalfOf?: string;
  /** Present when a parsed version 2 record's source or actor is an agent. */
  tauAgent?: Readonly<{ runId?: string }>;
  /** The git author's name. */
  authorName: string;
  /** The account a Tau no-reply author address names, when its local part is account-shaped. */
  authorAccountId?: string;
  /** The same, for the committer. */
  committerAccountId?: string;
  /**
   * Some record line of any version (`Tau-Metadata`, `Tau-Actor`) or a Tau
   * no-reply local part of the author or committer carries an account-shaped
   * token. Such a commit is never claimable (I12).
   */
  namesAccount: boolean;
  /** An `anon:` identity in the parsed record or the author. */
  pseudonymous: boolean;
  /**
   * The one local identity a claim may cover: the device pseudonym, or on a
   * Tau-written commit the Tau no-reply local part (a pre-A1 OS login) or the
   * author name when the author is a mailbox. Absent when `namesAccount`.
   */
  claimable?: string;
  /** The class of each role's address; there is no address field. */
  addressClass: Readonly<Record<'author' | 'committer' | 'tagger' | 'trailers', AddressClass>>;
  /** A recognised external agent and which part of the commit matched it. */
  agent?: Readonly<{
    id: RecognisedAgentId;
    by: 'trailer' | 'author' | 'committer';
  }>;
}>;

/**
 * What the module reads from one annotated tag. Only a version 2 `Tau-Tag`
 * record is a version (Q2); everything else is `invalid`.
 *
 * @public
 */
export type TagReading = Readonly<{
  shape: 'tau/2' | 'invalid';
  versionId?: string;
  name?: string;
  /** The object the tag names, or `''` when it names none. */
  target: string;
}>;

/**
 * Per-commit facts the server fixed when it admitted the push, or that a later
 * signed claim annotation added. Members learn these bits, never the inputs.
 *
 * @public
 */
export type ServerBits = Readonly<{
  /** An effective claim of the pusher covers the commit's `claimable` identity. */
  claim?: true;
  /** The author is the pusher's verified sign-in email. */
  address?: true;
  /** The author is the pusher's linked GitHub no-reply address, matched on the numeric id. */
  forge?: true;
  /** The committer is the pusher's verified sign-in email. */
  committerAddress?: true;
  /** The committer is the pusher's linked GitHub no-reply address. */
  committerForge?: true;
  /** `address` or `forge` came from backfill or repair inputs, current at that run (R3-8). */
  currentInputs?: true;
}>;

/**
 * One push as the server's attribution read serves it to this viewer.
 *
 * @public
 */
export type PushView = Readonly<{
  generation: number;
  /** `hidden`: the push carries the anonymous mark, the viewer is not the owner, and no claim lifted it. */
  pusher: Readonly<{ kind: 'account'; accountId: string; former?: true }> | Readonly<{ kind: 'hidden' }>;
  /** The owner's read of a hidden push only. */
  backedUpBy?: string;
  /** A host device pushed it on the account's behalf. */
  viaDevice: boolean;
  /** An effective revocation exists on this push: no device files an automatic claim for it (R3-4). */
  claimRevoked?: true;
}>;

/**
 * How one commit stands against the server, as the host supplies it:
 * `local` when no remote-tracking ref reaches the commit, `pending` when one
 * does and the persisted attribution store has no entry yet, otherwise the
 * stored entry.
 *
 * @public
 */
export type Join = Readonly<{ push: PushView; bits: ServerBits }> | 'local' | 'pending';

/**
 * Who is reading.
 *
 * @public
 */
export type Viewer = Readonly<{
  accountId?: string;
  owner: boolean;
  sharedProject: boolean;
  /** This host's OS login and device pseudonym; consulted for a `local` join only. */
  deviceIdentities: readonly string[];
}>;

/**
 * The attested pusher named beside a non-account answer ("for", "backed up by"), with the marker that it is a
 * deleted account, which reads "Former member" (R2-20).
 *
 * @public
 */
export type PusherRef = Readonly<{ accountId: string; former?: true }>;

/**
 * Who an entry is shown as by. The page owns the words. `viaDevice` marks an answer that names the pusher of a push a
 * host device made on the account's behalf ("by a cloud agent", D4).
 *
 * @public
 */
export type Attribution =
  | Readonly<{
      kind: 'account';
      accountId: string;
      basis: 'record' | 'ownGit' | 'forge' | 'claim' | 'address';
      former?: true;
      viaDevice?: true;
    }>
  /** `for` is the attested pusher only, never the record's `onBehalfOf`. */
  | Readonly<{ kind: 'tauAgent'; for?: PusherRef; viaDevice?: true }>
  /** `for` and `backedUpBy` never both appear. */
  | Readonly<{
      kind: 'agent';
      agent: RecognisedAgentId;
      for?: PusherRef;
      backedUpBy?: PusherRef;
      onThisDevice?: true;
      viaDevice?: true;
    }>
  /** A hidden push's `backedUpBy` is the owner's read only, and carries no device marker. */
  | Readonly<{ kind: 'anonymous'; backedUpBy?: PusherRef }>
  | Readonly<{ kind: 'beforeSignIn'; backedUpBy?: PusherRef; viaDevice?: true }>
  /** `name` is the git author name, empty when it would show an address (I11). */
  | Readonly<{ kind: 'external'; name: string; backedUpBy?: PusherRef; viaDevice?: true }>
  | Readonly<{ kind: 'local' }>
  /** `showLine` is false in a one-person project. */
  | Readonly<{ kind: 'pending'; showLine: boolean }>;

/**
 * A repository's refs as `name → object id`. Only `refs/heads/*` and
 * `refs/tags/*` take part in "first brought".
 *
 * @public
 */
// oxlint-disable-next-line unicorn-js/prevent-abbreviations -- contracts § 1 names the type `Refs`.
export type Refs = Readonly<Record<string, string>>;

/**
 * The server-only inputs of the coverage pass, taken from the storage grant.
 *
 * @public
 */
export type CoverageInputs = Readonly<{
  /** The pushing account. */
  pusher: string;
  /** The inline claim's identities. */
  identities: readonly string[];
  /** The pusher's sign-in email, only when it is verified. */
  verifiedEmail?: string;
  /** The linked GitHub account's numeric id. */
  forgeId?: string;
}>;
