import type { PathPolicy, RootedFileSystem } from '@taucad/filesystem';
import type { ParameterRecordCodec } from '#algorithms/index.js';
import type { PublishPublicationActorInput, PublishPublicationActorOutput } from '#publish.types.js';
import type { RemoteStorageSupplier } from '#remote.types.js';
import type { RevisionActor, RevisionTrigger } from '#revision-authority.js';
import type { Checkout, RevisionPort } from '#revision-port.js';
import type { RevisionStreamHandlers } from '#revision-stream.js';

/**
 * Opens the tree of one checkout.
 *
 * A host, not this module, knows what a checkout's `root` means: an absolute
 * directory on a disk host, a `/projects/<id>` or `/checkouts/<id>` route in a
 * page. One function rather than one filesystem, because a linked checkout is a
 * different tree from the live one and capturing the wrong one is silent.
 *
 * @public
 */
export type RevisionFileSystem = Omit<RootedFileSystem, 'watch'>;

/** Open the revision read/write capability for one checkout. @public */
export type CheckoutFileSystems = (checkout: Checkout) => RevisionFileSystem | Promise<RevisionFileSystem>;

/**
 * Run one checkout filesystem operation inside its host-owned admission lifetime.
 *
 * Disk hosts use this seam to admit a linked checkout before placement is
 * published, then revoke that temporary reachability when the operation
 * settles. Browser hosts may omit it and use {@link CheckoutFileSystems}
 * directly.
 *
 * @public
 */
export type UseCheckoutFileSystem = <Result>(
  checkout: Checkout,
  operation: (filesystem: RevisionFileSystem) => Promise<Result>,
) => Promise<Result>;

/** Host clock supplied to the revision actors without coupling this contract to XState. */
type RevisionClock = Readonly<{
  now?: () => number;
  setTimeout(callback: (...args: unknown[]) => void, delay: number): unknown;
  clearTimeout(id: unknown): void;
}>;

/**
 * Where one turn was placed, that its lease is now held, or why it could not be
 * placed at all.
 *
 * `leased` matters to a host with a fast turn: a completion that arrives while
 * the turn is still `preparing` is dropped by the machine, whose wait set for
 * `turnCompleted` is `leased`. A host holds the completion until this says the
 * lease is held.
 *
 * @public
 */
export type TurnPlacement = Readonly<{ runId: string }> &
  (
    | Readonly<{
        status: 'placed';
        turnId: string;
        chatId: string;
        /** The checkout this turn attaches to; never one this call created. */
        checkout: Checkout;
        baseRevisionId: string | undefined;
      }>
    | Readonly<{ status: 'leased'; checkoutId: string }>
    | Readonly<{
        status: 'refused';
        turnId: string;
        chatId: string;
        reason: string;
      }>
  );

/** Dependencies one project's actor set is built from. @public */
export type RevisionActorsOptions = Readonly<{
  /** The content-addressed store every revision id comes from. */
  port: RevisionPort;
  filesystem: CheckoutFileSystems;
  /** Optional host-owned admission wrapper around checkout tree reads and writes. */
  useFileSystem?: UseCheckoutFileSystem;
  projectId: string;
  /**
   * Timers and time for the whole tree (MC-R4): the actors' timers run on it, and
   * its `now()` (milliseconds since the Unix epoch) stamps what this host mints,
   * falling back to `Date.now`. Each root takes its own clock.
   */
  clock?: RevisionClock;
  /** Actor recorded on every revision this host mints. */
  actorId?: string;
  /**
   * The session → actor mapping this host resolved (S37, A26).
   *
   * Read per mint rather than captured once, because signing in, signing out
   * and turning anonymity on all change the answer inside one session. The host
   * owns the mapping — a page reads it from the session, a daemon from the
   * machine's own user — and the anonymity setting is applied *here*, before
   * the revision is written, so no later change rewrites a recorded identity.
   *
   * An agent turn is resolved by `runId`, which is how the model behind a turn
   * reaches the revision at all.
   */
  actor?: (input: Readonly<{ runId: string | undefined; trigger: RevisionTrigger }>) => RevisionActor | undefined;
  /**
   * The classifier this project's layout answers with (EQ6, D6).
   *
   * Injected for the same reason the composed view's is: the mask is the
   * mechanism and the layout is data. Defaults to Tau's own, which is the one
   * place in this package that reads the registry — every site below asks this
   * value, so a project opened under another layout cannot have Tau's rows
   * quietly applied to its files.
   *
   * A non-default policy must also hand its layout to
   * `generatedIgnoreContent`, or the generated ignore block and the capture
   * disagree (PP5); `tauRevisionPolicy` keeps the pair together.
   */
  policy?: PathPolicy;
  /**
   * Called when a turn's placement settles, before its lease is written.
   *
   * Both outcomes: a host has to root the turn's agent where the placement put
   * it, and has to refuse a turn it could not place rather than run it
   * unrecorded (I-EDIT).
   */
  onPlacement?: (placement: TurnPlacement) => void;
  /**
   * Reports chat records only after a remote ref tree has been projected into
   * this checkout's protected `.tau/chats/**` files.
   */
  onChatsProjected?: (chatIds: readonly string[]) => void;
  /**
   * Whether this host's `changed` feed is complete (NS15, E1).
   *
   * A host that promises it reports every write to a checkout — its own
   * applies included — before any request that follows the write, and reports
   * a change it lost track of as the path `''`. Its cuts then re-read only the
   * paths written since the previous cut. A host that cannot promise it (a
   * watcher that coalesces, drops or is absent) leaves it unset and every
   * capture walks the checkout through the EQ7 memo.
   */
  completeChanges?: boolean;
  /**
   * Brackets tree materialization so a disk host can ignore its own watcher
   * events instead of reporting them as editor changes.
   */
  onApplyingTree?: (checkout: Checkout, paths: readonly string[]) => (() => void) | void;
  /**
   * Where this project's Tau Cloud repository is.
   *
   * Host knowledge: only the host knows which API origin it is signed in to,
   * and the URL is the whole of what *Tau Cloud* means to the port (S34).
   * Without it, connecting to Tau Cloud is refused rather than guessed.
   */
  remoteUrl?: (projectId: string) => string | undefined;
  /**
   * What Tau Cloud says this project's owner stores against the plan (S35, D18).
   *
   * Not part of the git protocol: the Tau API answers it and a third-party Git
   * remote does not, so the Sync region shows the storage row only when a host
   * can fill it in. Asked on every arrival at `connected`, for Tau Cloud only.
   */
  remoteStorage?: RemoteStorageSupplier;
  /**
   * Registers this project on Tau Cloud, at *Connect* (P51, W18 DEF-1).
   *
   * Host knowledge for the same reason {@link RevisionEffectOptions.remoteUrl}
   * is: only the host knows which API it is signed in to and how it
   * authenticates there — a cookie in the page, a bearer on a disk host. No
   * credential passes through this module.
   *
   * Connecting is the verb that makes a project exist on the remote: until it
   * runs, nothing has written the `project` row the git server authorizes
   * against, so both advertisements answer `404` and the connection can never
   * take. It must be idempotent — a retried *Connect* calls it again — and
   * without it connecting Tau Cloud proceeds unregistered, which is what every
   * host did before P51.
   */
  registerRemoteProject?: (projectId: string) => Promise<void>;
  /**
   * Records one publication on Tau Cloud (S32, A21).
   *
   * Host knowledge for the same reason `remoteUrl` is: only the host knows
   * which API it is signed in to and how it authenticates there — a cookie in
   * the page, a bearer on a disk host. No credential passes through this
   * module. Without it, publishing is refused rather than attempted.
   */
  publishPublication?: (input: PublishPublicationActorInput) => Promise<PublishPublicationActorOutput>;
  /**
   * This host's stable identity among the devices writing one chat (W13, W17).
   *
   * It gates chat refs and never leaves the host: a segment, an ops ref and a
   * conflict line are named by a record device id per actor form
   * (`.git/ops-devices.json`, EQ10(a)), so no pushed name carries it. In the
   * browser it is `apps/ui/app/lib/device-id.ts` and nothing else; on a disk
   * host the host's own machine identity. Without it this module writes **no**
   * chat refs at all.
   *
   * A reader rather than a value, because the browser's id lives in
   * `localStorage`, which a worker cannot see: the page sends it once the port
   * is open, and every read after that answers.
   *
   * @returns This device's id, or `undefined` before the host knows it.
   */
  deviceId?: () => string | undefined;
  /**
   * Whether this host can reach anything, as it changes (S41's three exits).
   *
   * Injected rather than read: the page has
   * `apps/ui/app/hooks/use-network-connectivity.tsx`, a worker has
   * `globalThis`'s own `online`/`offline`, and a daemon has neither — so the
   * scheduler is told, and a host that says nothing is a host that is online.
   *
   * @param report - Called with the new value on every change.
   * @returns The unsubscribe the actor runs when it stops.
   */
  connectivity?: (report: (online: boolean) => void) => () => void;
  /**
   * The project's `revision` entries, while its Tau Cloud remote is connected (D13).
   *
   * Host knowledge for the same reason `remoteUrl` is: only the host knows its
   * API origin and how it authenticates there. A host passes
   * `watchRevisionStream` bound to both. Without it an open project learns of
   * another device's work only at its next open or push.
   *
   * @param input - The project to watch.
   * @param handlers - Where each move, and a refusal, goes.
   * @returns The unsubscribe the scheduler runs when the remote goes or the project closes.
   */
  remoteMoves?: (input: Readonly<{ projectId: string }>, handlers: RevisionStreamHandlers) => () => void;
  /**
   * How this host reads, validates and writes `.tau/parameters/**` records, for
   * the per-key merge (D12): `@taucad/parameters`' `requireParameterRecord` and
   * `serializeParameterRecord`.
   *
   * Every merge in this module uses it — a sync, a branch merge, a turn's
   * settlement and the re-derivation of a recorded conflict — because a
   * conflict read back with a different codec would settle differently from the
   * merge that recorded it. Without it, a record both sides changed is a
   * conflict: an unvalidated record is never merged.
   */
  parameters?: ParameterRecordCodec;
  /**
   * Remember the history set's push, for a host that can re-send one (A32, S41).
   *
   * The `pagehide` keepalive offers a POST the `hidden` flush already built, and
   * D28/S41 say which POST that is: the **history-set** pack, never a chat ref's.
   * Nothing in a receive-pack request says which set it carries — every ref goes
   * to the same endpoint — so the scheduler marks the one push that is the
   * history one rather than leaving a recorder to guess from a URL (review 2 R3).
   *
   * Absent on every host that cannot re-send anything at all (Node spawns `git`;
   * there is no `pagehide`), and then this is the identity function.
   *
   * @param run - The history-set push.
   * @returns Whatever the push answered.
   */
  recordHistoryPush?: <Result>(run: () => Promise<Result>) => Promise<Result>;
}>;
