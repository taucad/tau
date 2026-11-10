import type { Manifest } from '@taucad/api-git-core/store/manifest';
import type { RepositoryLocator } from '@taucad/api-git-core/store/port';
import type { ProjectRole } from '#collaboration/project-access.service.js';
import type { GitChildRunner } from '#publications/publication-materializer.js';

/** A read lease the publication materializer holds through tau-storage. */
export type ReadLease = {
  /** An opaque handle the materializer's git runner ({@link PublicationRepositoryLeases.leaseGit}) resolves. */
  readonly directory: string;
  readonly locator: RepositoryLocator;
  /** The manifest the reads are pinned to. `undefined` is generation 0. */
  readonly manifest: Manifest | undefined;
};

/** Who a publication lease is taken for: the fields of the git service's request access that a lease reads. */
export type RepositoryLeaseAccess = {
  readonly projectId: string;
  /** The tenant whose repository is read. */
  readonly ownerId: string;
  readonly role: ProjectRole;
  /** Who asked: keys the hydrate budget the lease spends (D22). */
  readonly callerId: string;
  readonly remainingBytes: number;
  readonly storageLimitBytes: number;
};

/**
 * The repository leases publishing takes: the same disk admission, owner fairness and
 * hydrate budget as every git route (I11). `GitRepositoryService` in the API implements
 * it, and the API's `PublicationsModule` binds it to {@link publicationRepositoryLeasesKey},
 * so this library never imports the git service.
 */
export type PublicationRepositoryLeases = {
  /** Runs one `git-read` in a lease that {@link PublicationRepositoryLeases.withLease} holds open. */
  readonly leaseGit: GitChildRunner;
  /**
   * Holds one read lease over the project's repository while `work` runs, disposed however it ends.
   *
   * @param access - Whose repository, which project, and who asked.
   * @param work - What to do with the lease.
   * @returns Whatever `work` returned.
   */
  withLease<T>(access: RepositoryLeaseAccess, work: (lease: ReadLease) => Promise<T>): Promise<T>;
};

/** Injection token for {@link PublicationRepositoryLeases}. */
export const publicationRepositoryLeasesKey = Symbol('PublicationRepositoryLeases');
