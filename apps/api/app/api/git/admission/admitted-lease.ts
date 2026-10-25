import type { LeaseAdmission, AdmissionRefusal } from '#api/git/admission/lease-admission.js';
import { hydratedBytes, reservationFor } from '#api/git/admission/reservation.js';
import { hydrateLease, readLeaseManifest } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';

/**
 * A read-only lease built under real-byte admission (DA3), for a process that
 * hydrates outside the request path: `retire-lfs` in tau-maintenance (DC3,
 * DC4). tau-storage admits through `GitLeaseHost`; this is the same rule for a
 * caller with no host, sized from the manifest it reads once and hands on.
 */

/** A lease admission refused: the pass records it and the next one retries. */
export class LeaseRefusedError extends Error {
  public constructor(public readonly refusal: AdmissionRefusal) {
    super(`The lease was not admitted: ${refusal}`);
    this.name = 'LeaseRefusedError';
  }
}

/** An admitted, hydrated lease. */
export type AdmittedLease = {
  readonly lease: RepositoryLease;
  /** Disposes the lease and gives its reservation back. Never rejects. */
  release(): Promise<void>;
};

/**
 * Reads the manifest, reserves a fetch's real bytes, and hydrates from that
 * same read.
 *
 * @param args - The store, the repository, whose share it counts against, the admission and the lease root.
 * @returns The lease and its release.
 * @throws LeaseRefusedError When the lease does not fit, before any pack is read.
 */
export const hydrateAdmittedLease = async (args: {
  readonly store: RepositoryStore;
  readonly locator: RepositoryLocator;
  readonly ownerId: string;
  readonly admission: LeaseAdmission;
  readonly parentDirectory?: string;
}): Promise<AdmittedLease> => {
  const preread = await readLeaseManifest(args.store, args.locator);
  const packBytes = (preread.manifest?.packs ?? []).map((pack) => pack.bytes);
  const decided = await args.admission.admit({
    ownerId: args.ownerId,
    reservationBytes: reservationFor({ kind: 'fetch', packBytes }),
  });
  if (!decided.admitted) {
    throw new LeaseRefusedError(decided.refusal);
  }
  const { ticket } = decided;
  let lease: RepositoryLease;
  try {
    lease = await hydrateLease({
      store: args.store,
      locator: args.locator,
      ...(args.parentDirectory === undefined ? {} : { parentDirectory: args.parentDirectory }),
      preread,
    });
  } catch (error) {
    ticket.release();
    throw error;
  }
  ticket.landed(hydratedBytes(packBytes));
  return {
    lease,
    release: async () => {
      try {
        await lease.dispose();
      } catch {
        /* A directory left behind is recoverable; a reservation never given back is not. */
      } finally {
        ticket.release();
      }
    },
  };
};
