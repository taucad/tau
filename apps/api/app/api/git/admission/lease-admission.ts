/**
 * Lease admission by real bytes, with owner fairness that does not depend on a
 * slot count (Hosted Remote Storage DA3; blueprint OD2, replacing D33's flat
 * reservation and redefining D22's per-owner share).
 *
 * The rule, from the reservation `reservation.ts` computed for the lease:
 *
 * - **Disk.** Admit when the reservation fits in the free bytes `statfs`
 *   reports less what admitted leases have still to write. A lease reports the
 *   bytes its hydrate put on disk ({@link LeaseTicket.landed}); `statfs`
 *   already excludes those, so they are no longer subtracted a second time
 *   (blueprint Finding 3's double count).
 * - **Owner share.** An owner that already holds a lease may hold at most
 *   half of this Machine's lease disk (free bytes plus what admitted leases
 *   have landed) in reservations. A first lease is never held to the share.
 *   Fairness is in bytes, so it no longer collapses to one lease per owner
 *   when the flat figure left two slots.
 * - **Bounded wait.** A refused request waits for a release, up to
 *   {@link defaultAdmissionWaitMilliseconds}, before it is answered: most
 *   leases are short, and a 503 costs the client a whole retry.
 *
 * The decision and the reservation are one synchronous step after the free
 * bytes are read, so no concurrent admission slips between them.
 *
 * Self-contained: no Nest, metrics, store or HTTP. It moves to `tau-storage`
 * with `git.service.ts` (north star "Straight to C2"). The per-owner in-flight
 * request cap and its `429` (DA6) are a separate step that composes in front
 * of this one, as the route guard (DW1) does: this module bounds disk, not
 * request counts.
 */

/** Why a lease was not admitted, as `tau.git.admissions` labels the outcome. */
export type AdmissionRefusal = 'disk_full' | 'owner_busy';

/**
 * How long a refused admission waits for a release before it is answered.
 * Blueprint interim item 4: "a short bounded wait (≈ 1–2 s) for a slot before
 * answering 503".
 */
export const defaultAdmissionWaitMilliseconds = 1500;

export type AdmissionInputs = {
  /** Free bytes of the lease filesystem, as `statfs` reports them now. */
  readonly freeBytes: number;
  /** Bytes every admitted lease on this Machine reserved. */
  readonly reservedBytes: number;
  /** Of those, bytes already on disk, which `freeBytes` no longer counts. */
  readonly landedBytes: number;
  /** Leases this owner holds on this Machine. */
  readonly ownerLeases: number;
  /** Bytes those leases reserved. */
  readonly ownerReservedBytes: number;
  /** What the lease asking now would reserve. */
  readonly reservationBytes: number;
};

export type AdmissionDecision =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly refusal: AdmissionRefusal };

/**
 * The admission rule on its own, with every input explicit.
 *
 * @param inputs - The disk, this Machine's reservations, the owner's share and the reservation asked for.
 * @returns Whether the lease is admitted, and why not.
 */
export const decideAdmission = (inputs: AdmissionInputs): AdmissionDecision => {
  const owed = Math.max(0, inputs.reservedBytes - inputs.landedBytes);
  if (inputs.reservationBytes > inputs.freeBytes - owed) {
    return { admitted: false, refusal: 'disk_full' };
  }
  const leaseDisk = inputs.freeBytes + inputs.landedBytes;
  if (inputs.ownerLeases > 0 && inputs.ownerReservedBytes + inputs.reservationBytes > leaseDisk / 2) {
    return { admitted: false, refusal: 'owner_busy' };
  }
  return { admitted: true };
};

/** One admitted lease's hold on this Machine's lease disk. */
export type LeaseTicket = {
  /** What this lease reserved. */
  readonly reservationBytes: number;
  /**
   * Records how many of the reserved bytes are now on disk (the hydrate's
   * packs and indexes), so admission stops counting them twice. Capped at the
   * reservation; a later call replaces an earlier one.
   */
  landed(bytes: number): void;
  /** Gives the reservation back. Idempotent; every path must call it once the lease is disposed. */
  release(): void;
};

export type AdmissionResult =
  | {
      readonly admitted: true;
      readonly ticket: LeaseTicket;
      /** Whether it waited for a release first, so what was read to size it may have moved meanwhile. */
      readonly waited: boolean;
    }
  | { readonly admitted: false; readonly refusal: AdmissionRefusal };

type OwnerHold = { leases: number; reservedBytes: number };

export class LeaseAdmission {
  readonly #readFreeBytes: () => Promise<number>;
  readonly #waitMilliseconds: number;
  readonly #owners = new Map<string, OwnerHold>();
  readonly #waiters = new Set<() => void>();
  #leases = 0;
  #reservedBytes = 0;
  #landedBytes = 0;

  /**
   * @param options - Where free bytes come from (the service passes `statfs` of the lease parent), and how
   *   long a refused request waits for a release.
   */
  public constructor(options: { readonly readFreeBytes: () => Promise<number>; readonly waitMilliseconds?: number }) {
    this.#readFreeBytes = options.readFreeBytes;
    this.#waitMilliseconds = options.waitMilliseconds ?? defaultAdmissionWaitMilliseconds;
  }

  /** Leases admitted and not yet released. */
  public get leases(): number {
    return this.#leases;
  }

  /** Bytes those leases reserved: the `tau.git.lease.reserved_bytes` gauge. */
  public get reservedBytes(): number {
    return this.#reservedBytes;
  }

  /**
   * @param ownerId - The repository owner.
   * @returns Leases that owner holds here now.
   */
  public ownerLeases(ownerId: string): number {
    return this.#owners.get(ownerId)?.leases ?? 0;
  }

  /**
   * Admits one lease, waiting a bounded time for a release when it does not fit.
   *
   * @param request - Whose lease, what it reserves, and optionally a wait other than the default.
   * @returns The ticket, or the refusal that stood when the wait ran out.
   */
  public async admit(request: {
    readonly ownerId: string;
    readonly reservationBytes: number;
    readonly waitMilliseconds?: number;
  }): Promise<AdmissionResult> {
    const deadline = performance.now() + (request.waitMilliseconds ?? this.#waitMilliseconds);
    let waited = false;
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- each attempt re-reads the disk a release changed
      const freeBytes = await this.#readFreeBytes();
      const owner = this.#owners.get(request.ownerId);
      const decision = decideAdmission({
        freeBytes,
        reservedBytes: this.#reservedBytes,
        landedBytes: this.#landedBytes,
        ownerLeases: owner?.leases ?? 0,
        ownerReservedBytes: owner?.reservedBytes ?? 0,
        reservationBytes: request.reservationBytes,
      });
      if (decision.admitted) {
        return { admitted: true, ticket: this.#reserve(request.ownerId, request.reservationBytes), waited };
      }
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        return decision;
      }
      // oxlint-disable-next-line no-await-in-loop -- waiting for a release is the point of the loop
      await this.#nextRelease(remaining);
      waited = true;
    }
  }

  #reserve(ownerId: string, reservationBytes: number): LeaseTicket {
    const hold = this.#owners.get(ownerId) ?? { leases: 0, reservedBytes: 0 };
    hold.leases += 1;
    hold.reservedBytes += reservationBytes;
    this.#owners.set(ownerId, hold);
    this.#leases += 1;
    this.#reservedBytes += reservationBytes;
    let landed = 0;
    let released = false;
    return {
      reservationBytes,
      landed: (bytes) => {
        if (released) {
          return;
        }
        const next = Math.min(reservationBytes, Math.max(0, bytes));
        this.#landedBytes += next - landed;
        landed = next;
      },
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.#landedBytes -= landed;
        this.#leases -= 1;
        this.#reservedBytes -= reservationBytes;
        hold.leases -= 1;
        hold.reservedBytes -= reservationBytes;
        if (hold.leases === 0) {
          this.#owners.delete(ownerId);
        }
        const waiters = [...this.#waiters];
        this.#waiters.clear();
        for (const wake of waiters) {
          wake();
        }
      },
    };
  }

  async #nextRelease(milliseconds: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const timer = setTimeout(resolve, milliseconds);
    this.#waiters.add(resolve);
    try {
      await promise;
    } finally {
      clearTimeout(timer);
      this.#waiters.delete(resolve);
    }
  }
}
