/**
 * The paths a kernel run reads before anything else, so a caller can tell whether a run over an entry waits on a large
 * object still downloading. The agent's kernel guards and the project's availability both gate on it.
 */
import { resolveRootedPath } from '@taucad/utils/path';

/*
 * A caller's path as the facet names it, checkout-relative: an agent's `targetFile` may carry a leading `/` or `./`,
 * repaired as the project-path tool inputs are. A path that cannot be made rooted stays as it was, and matches nothing.
 */
const checkoutPathOf = (path: string): string => {
  try {
    return resolveRootedPath(path.startsWith('/') && !path.startsWith('//') ? path.slice(1) : path);
  } catch {
    return path;
  }
};

/** What a kernel run reads before anything else: named paths, or the whole workspace. */
export type KernelClosure = readonly string[] | 'workspace';

/**
 * The closure of a kernel run over one entry (T6): `tau.json` and the entry, whichever kernel runs it. Any other
 * pending path the kernel opens is read through to its object and waits for it (D9), and a kernel that mirrors the
 * whole workspace lists a pending path at its object's size (`@taucad/filesystem` pending stats), so a mirror needs
 * no wider closure.
 *
 * @param entryPath - The entry the kernel runs; empty while the project names none.
 * @returns The closure.
 */
export const kernelClosure = (entryPath: string): readonly string[] => {
  const path = checkoutPathOf(entryPath);
  return path === '' ? ['tau.json'] : ['tau.json', path];
};

/**
 * Whether a closure still holds a pending large object.
 *
 * @param closure - See {@link kernelClosure}.
 * @param pendingPaths - The facet's pending paths.
 * @returns `true` while a path the run reads holds its pointer.
 */
export const closureHasPending = (closure: KernelClosure, pendingPaths: readonly string[]): boolean =>
  closure === 'workspace' ? pendingPaths.length > 0 : closure.some((path) => pendingPaths.includes(path));
