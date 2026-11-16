/**
 * How one change fact reads on a connection rooted below the authority's root
 * (STO-25 SP2g): the fs bridge scopes every fact it fans out with this.
 */

import type { LossSignal } from '#event-coalescer.js';
import type { PathChangeEvent } from '#types.js';

/**
 * The port's whole-root reset, `directoryChanged ''`, when a fact removes or
 * moves an ancestor of the root: everything the port can see changed (I5). A
 * summary of an ancestor says only that its listing changed, so it is no such
 * fact.
 *
 * @param event - A fact in the authority's namespace.
 * @param root - The port's absolute root.
 * @returns The reset, or `undefined` when the fact is scoped as usual.
 */
const rootResetAbove = (event: PathChangeEvent, root: string): PathChangeEvent | undefined => {
  const above = (path: string): boolean => path !== root && (path === '/' || root.startsWith(`${path}/`));
  return (event.type === 'directoryDeleted' && above(event.path)) ||
    (event.type === 'directoryRenamed' && (above(event.oldPath) || above(event.newPath)))
    ? { type: 'directoryChanged', path: '', backend: event.backend }
    : undefined;
};

/** One authority path in a scoped port's own namespace, or `undefined` when it is outside that root. */
const relativeToRoot = (root: string, path: string): string | undefined => {
  if (root === '/') {
    return path === '/' ? '' : path.startsWith('/') ? path.slice(1) : undefined;
  }
  if (path === root) {
    return '';
  }
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
};

/**
 * One authority path as a scoped port's own view spells it, or `undefined` when
 * that view does not serve it.
 *
 * A path the view hides is as absent from it as one outside the root, which is
 * what makes the degradations below the view's own answer rather than a second
 * policy: hidden is inherited, so a hidden ancestor hides its descendants (PP2).
 */
const visibleRelativeToRoot = (
  root: string,
  path: string,
  hidden?: (relativePath: string) => boolean,
): string | undefined => {
  const relative = relativeToRoot(root, path);
  return relative === undefined || hidden?.(relative) === true ? undefined : relative;
};

/**
 * One change event as a scoped port sees it, or `undefined` when nothing in it
 * touches that port's root.
 *
 * A move with one end outside the root — or hidden from it — is not a move to
 * that port: it is a disappearance or an arrival, exactly as a rooted view's own
 * watch reports it (`WorkspaceFileService.createRootedFileSystem`). A
 * removal or move of a directory above the root is the port's whole-root
 * reset, `directoryChanged` at `''`; a summary of one is not the port's.
 *
 * @param event - A fact in the authority's namespace.
 * @param root - The port's absolute root.
 * @param hidden - Whether the port's view hides a root-relative path.
 * @returns The fact in the port's namespace, or `undefined`.
 * @public
 */
export const scopeEventToRoot = (
  event: LossSignal,
  root: string,
  hidden?: (relativePath: string) => boolean,
): PathChangeEvent | undefined => {
  if (event.type === 'subtreeReset') {
    /* A netted removal: the whole root beneath it, or a re-list of the directory within it. */
    const reset = rootResetAbove({ ...event, type: 'directoryDeleted' }, root);
    const path = reset === undefined ? visibleRelativeToRoot(root, event.path, hidden) : undefined;
    return reset ?? (path === undefined ? undefined : { type: 'directoryChanged', path, backend: event.backend });
  }
  if (event.type === 'backendChanged') {
    return event;
  }
  /* A removal or move of an ancestor (I5); an ancestor's summary falls outside the root below. */
  const reset = rootResetAbove(event, root);
  if (reset !== undefined) {
    return reset;
  }
  if ('path' in event) {
    const path = visibleRelativeToRoot(root, event.path, hidden);
    return path === undefined ? undefined : { ...event, path };
  }
  const directory = event.type === 'directoryRenamed' || event.type === 'directoryCopied';
  const [fromPath, toPath] =
    'oldPath' in event ? ([event.oldPath, event.newPath] as const) : ([event.sourcePath, event.targetPath] as const);
  const from = visibleRelativeToRoot(root, fromPath, hidden);
  const to = visibleRelativeToRoot(root, toPath, hidden);
  if (from !== undefined && to !== undefined) {
    return 'oldPath' in event
      ? { ...event, oldPath: from, newPath: to }
      : { ...event, sourcePath: from, targetPath: to };
  }
  if (to !== undefined) {
    return directory
      ? {
          type: 'directoryCreated',
          path: to,
          backend: event.backend,
          ...(event.target ? { target: event.target } : {}),
        }
      : { type: 'fileWritten', path: to, backend: event.backend, ...(event.target ? { target: event.target } : {}) };
  }
  if (from !== undefined && 'oldPath' in event) {
    return directory
      ? { type: 'directoryDeleted', path: from, backend: event.backend }
      : { type: 'fileDeleted', path: from, backend: event.backend };
  }
  /* A copy whose target left the root changed nothing inside it. */
  return undefined;
};
