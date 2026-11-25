/**
 * GitHub repository address parsing for the import flow: pure string handling with no I/O, shared by the import
 * route and the GitHub import machine.
 */

/**
 * Normalize a repository folder to `a/b` form: no leading, trailing or repeated
 * slashes. A folder with a `.` or `..` segment names nothing importable and
 * becomes the whole repository.
 *
 * @param path - The folder as typed or taken from a URL.
 * @returns The normalized folder, or `''` for the repository root.
 */
export function normalizeRepositoryFolder(path: string): string {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments.some((segment) => segment === '.' || segment === '..') ? '' : segments.join('/');
}

const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * Parse a GitHub URL into owner and repository, plus the ref and folder of a
 * `https://github.com/<owner>/<repo>/tree/<ref>/<folder>` address. The first
 * segment after `tree` is taken as the ref; a ref containing `/` is chosen with
 * `?ref=` or the branch selector instead.
 *
 * @param url - A github.com repository or folder URL.
 * @returns The parsed target, or `undefined` when the URL names no GitHub repository.
 */
export function parseGitHubUrl(
  url: string,
): { owner: string; repo: string; ref: string | undefined; path: string } | undefined {
  try {
    const parsed = new URL(url);

    // Only allow github.com
    if (parsed.hostname !== 'github.com') {
      return undefined;
    }

    // Parse /owner/repo, /owner/repo.git or /owner/repo/tree/ref/folder
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return undefined;
    }

    const [owner, repoRaw, kind, ref, ...folder] = pathParts;
    if (!owner || !repoRaw) {
      return undefined;
    }

    const repo = repoRaw.replace(/\.git$/, '');
    if (kind !== 'tree' || ref === undefined) {
      return { owner, repo, ref: undefined, path: '' };
    }

    return {
      owner,
      repo,
      ref: decodeSegment(ref),
      path: normalizeRepositoryFolder(folder.map((segment) => decodeSegment(segment)).join('/')),
    };
  } catch {
    return undefined;
  }
}
