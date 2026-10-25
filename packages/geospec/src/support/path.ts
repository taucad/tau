/**
 * Rooted virtual-path helpers.
 *
 * Inlined from Tau's path utilities (`assertRootedPath`, `joinRelativePath`) so that `geospec` depends on no
 * Tau package; behaviour, error name, codes, messages and metadata are identical.
 */

/** Error raised when an untrusted virtual filesystem path is invalid. */
export class VirtualPathError extends Error {
  public readonly code: 'INVALID_PATH' | 'PATH_OUTSIDE_ROOT';
  public readonly metadata: { readonly input: string };

  public constructor(code: 'INVALID_PATH' | 'PATH_OUTSIDE_ROOT', input: string) {
    super(code === 'PATH_OUTSIDE_ROOT' ? 'Virtual path escapes the filesystem root.' : 'Invalid virtual path.');
    this.name = 'VirtualPathError';
    this.code = code;
    this.metadata = { input };
  }
}

const uriSchemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/u;

const assertPortablePathCharacters = (input: string): void => {
  const invalid = (): never => {
    throw new VirtualPathError('INVALID_PATH', input);
  };

  if (input.includes('\\') || uriSchemePattern.test(input)) {
    return invalid();
  }
  for (const character of input) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))) {
      return invalid();
    }
  }
};

/**
 * Resolve an untrusted path inside an already-selected filesystem capability.
 *
 * The capability supplies the root. Its root is represented by `''`; descendants are normalized POSIX segment
 * sequences without a leading slash.
 *
 * @param input - Candidate capability-local path.
 * @returns The canonical root-relative path.
 * @throws {@link VirtualPathError} When the path is invalid or escapes the supplied root.
 */
export function resolveRootedPath(input: string): string {
  if (input.startsWith('/')) {
    throw new VirtualPathError('INVALID_PATH', input);
  }
  assertPortablePathCharacters(input);

  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.pop() === undefined) {
        throw new VirtualPathError('PATH_OUTSIDE_ROOT', input);
      }
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

/**
 * Require a capability-local path to already use the canonical rooted spelling.
 *
 * @param input - Candidate canonical rooted path.
 * @returns `input` unchanged when canonical.
 * @throws {@link VirtualPathError} When invalid, escaping, or noncanonical.
 */
export function assertRootedPath(input: string): string {
  if (resolveRootedPath(input) !== input) {
    throw new VirtualPathError('INVALID_PATH', input);
  }
  return input;
}

/**
 * Join relative path segments without introducing a leading slash.
 *
 * @param paths - Relative path segments to join.
 * @returns Joined relative path, or empty string if no non-empty segments.
 */
export function joinRelativePath(...paths: string[]): string {
  const segments: string[] = [];
  for (const path of paths) {
    if (path === '') {
      continue;
    }
    for (const segment of path.split('/')) {
      if (segment.length > 0) {
        segments.push(segment);
      }
    }
  }
  return segments.join('/');
}
