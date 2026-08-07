import { resolveVirtualPath, VirtualPathError } from '@taucad/utils/path';

const uriSchemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/u;

/**
 * Resolves an untrusted agent path to the canonical RpcFileSystem namespace.
 * Root is represented by an empty string; descendants are POSIX project-relative paths.
 *
 * @public
 */
export const resolveRpcProjectPath = (input: string): string => {
  const schemeCandidate = input.startsWith('/') ? input.slice(1) : input;
  if (uriSchemePattern.test(schemeCandidate)) {
    throw new VirtualPathError('INVALID_PATH', input);
  }

  const resolved = resolveVirtualPath(input === '' ? '/' : input.startsWith('/') ? input : `/${input}`);
  return resolved === '/' ? '' : resolved.slice(1);
};
