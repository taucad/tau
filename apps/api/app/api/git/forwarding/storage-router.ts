import { membersPath } from '#api/git/forwarding/contract/grant.js';
import { rendezvousRank } from '#api/git/forwarding/rendezvous.js';

/**
 * Where tau-api sends one project's git requests (DC2): the tau-storage
 * members ranked by rendezvous over the deployed list, preferred first.
 *
 * Two shapes of `TAU_STORAGE_URL`:
 *
 * - **One address** (a deployment's Flycast name). The members are the
 *   deployed Machines, which tau-storage lists on `GET /v1/members` from its own
 *   internal DNS; a request names its preferred Machine to Fly Proxy with
 *   `fly-prefer-instance-id`, which falls back to another when that one cannot
 *   take it. With no member listed, the router answers no ranking and the
 *   forwarder sends as it did before DC2.
 * - **Several addresses** (a local stack). The addresses are the members, and
 *   each target is its own address.
 *
 * The router also remembers which members answered recently. A member that has
 * not may be stopped (Fly stops an idle Machine), and the forwarder bounds how
 * long it waits for one before it spills to the next (FR18).
 */

/** One place a request can go. */
export type StorageTarget = {
  readonly base: string;
  /** The Fly Machine to prefer at `base`; absent for an address that is itself the member. */
  readonly instance?: string;
};

/** How often the deployed member list is read again. */
export const membersRefreshMilliseconds = 30_000;

/** A member that answered within this long is taken to be started. */
export const memberWarmMilliseconds = 60_000;

export type StorageRouterOptions = {
  readonly urls: readonly string[];
  /** Reads `GET /v1/members` at a base; tests pass their own. */
  readonly readMembers?: (base: string) => Promise<readonly string[]>;
  /** Records the member count on `tau.git.members`. */
  readonly recordMembers?: (count: number) => void;
  readonly now?: () => number;
};

const fetchMembers = async (base: string): Promise<readonly string[]> => {
  const response = await fetch(new URL(membersPath, base), { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`tau-storage answered ${String(response.status)} for its members`);
  }
  const body = (await response.json()) as { members?: unknown };
  return Array.isArray(body.members) ? body.members.filter((member) => typeof member === 'string') : [];
};

export class StorageRouter {
  readonly #urls: readonly string[];
  readonly #readMembers: (base: string) => Promise<readonly string[]>;
  readonly #recordMembers: ((count: number) => void) | undefined;
  readonly #now: () => number;
  /** Members by when they last answered. */
  readonly #answered = new Map<string, number>();
  #members: readonly string[] = [];
  #readAt = Number.NEGATIVE_INFINITY;
  #reading: Promise<void> | undefined;

  public constructor(options: StorageRouterOptions) {
    this.#urls = options.urls;
    this.#readMembers = options.readMembers ?? fetchMembers;
    this.#recordMembers = options.recordMembers;
    this.#now = options.now ?? Date.now;
  }

  /**
   * The targets for one project, preferred first.
   *
   * @param project - The project id.
   * @returns The ranked targets; empty when one address lists no member (no affinity).
   */
  public async targets(project: string): Promise<readonly StorageTarget[]> {
    if (this.#urls.length > 1) {
      return rendezvousRank(project, this.#urls).map((base) => ({ base }));
    }
    const [base] = this.#urls;
    if (base === undefined) {
      return [];
    }
    await this.#refresh(base);
    return rendezvousRank(project, this.#members).map((instance) => ({ base, instance }));
  }

  /**
   * Records that a member answered.
   *
   * @param member - The id from the `tau-storage-member` response header.
   */
  public answered(member: string): void {
    this.#answered.set(member, this.#now());
  }

  /**
   * Whether a member answered recently enough to be taken as started.
   *
   * @param member - The member id.
   * @returns True when it answered within {@link memberWarmMilliseconds}.
   */
  public warm(member: string): boolean {
    const at = this.#answered.get(member);
    return at !== undefined && this.#now() - at < memberWarmMilliseconds;
  }

  /** Reads the member list when it is stale; the first read is awaited, later ones are not. */
  async #refresh(base: string): Promise<void> {
    if (this.#now() - this.#readAt < membersRefreshMilliseconds) {
      return;
    }
    this.#reading ??= (async () => {
      try {
        this.#members = [...(await this.#readMembers(base))].toSorted();
        this.#recordMembers?.(this.#members.length);
      } catch {
        /* Keep the last list: a members read that failed moves no project. */
      } finally {
        this.#readAt = this.#now();
        this.#reading = undefined;
      }
    })();
    if (this.#members.length === 0) {
      await this.#reading;
    }
  }
}
