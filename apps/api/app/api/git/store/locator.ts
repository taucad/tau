import { isProjectRepositoryId } from '#api/git/git.constants.js';
import type { RepositoryLocator } from '#api/git/store/port.js';

/**
 * The one function that turns an owner and a project into the locator every
 * store call takes (NI14). Both ids land verbatim in an object key, so both
 * are checked here rather than at each call site: `isProjectRepositoryId` is
 * the same predicate that keeps a repository name off the filesystem today,
 * and it refuses a separator, a traversal and an over-long name, so no key can
 * leave its tenant prefix (NI15).
 */
export const repositoryLocator = (args: {
  ownerId: string;
  projectId: string;
  accountId?: string;
}): RepositoryLocator => {
  for (const [field, value] of [
    ['ownerId', args.ownerId],
    ['projectId', args.projectId],
  ] as const) {
    if (!isProjectRepositoryId(value)) {
      throw new RangeError(`${field} '${value}' is not a storable identifier`);
    }
  }

  return {
    ownerId: args.ownerId,
    projectId: args.projectId,
    ...(args.accountId === undefined ? {} : { accountId: args.accountId }),
  };
};
