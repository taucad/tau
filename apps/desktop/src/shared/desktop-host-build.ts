/**
 * The desktop build's id for agent observability (blueprint LW8): the 12-hex short commit of the tree the bundle was
 * built from, stamped into main and the services utility as `tauDesktopHostBuild`. The release workflow checks out the
 * release tag, so its commit is the tag's. A tree with no readable commit stamps nothing, and its facts carry no build.
 */

const commitPattern = /^[\da-f]{40}$/u;

/**
 * Resolve the build id to stamp.
 *
 * @param readCommit - Reads the checked-out commit; it may throw where there is no checkout or no git.
 * @returns The 12-hex short commit, or an empty string.
 */
export const desktopHostBuildOf = (readCommit: () => string | undefined): string => {
  let commit: string | undefined;
  try {
    commit = readCommit()?.trim().toLowerCase();
  } catch {
    return '';
  }
  return commit !== undefined && commitPattern.test(commit) ? commit.slice(0, 12) : '';
};
