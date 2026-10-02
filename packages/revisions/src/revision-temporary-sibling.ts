/** Tau-owned staging and backup paths, shared by capture and recovery. */
const temporarySiblingPattern =
  /^\.(.+)\.tau-(staged|backup)\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp$/u;
/**
 * Recognize a reserved sibling created by revision apply or watcher fencing.
 *
 * @internal
 * @param path - A project-relative path.
 * @returns Its original file and staging role, or undefined for authored paths.
 */
export const parseTemporarySibling = (
  path: string,
): Readonly<{ originalPath: string; role: 'staged' | 'backup' }> | undefined => {
  const separator = path.lastIndexOf('/');
  const directory = separator === -1 ? '' : path.slice(0, separator + 1);
  const match = temporarySiblingPattern.exec(path.slice(separator + 1));
  const role = match?.[2];
  return match === null || (role !== 'staged' && role !== 'backup')
    ? undefined
    : { originalPath: `${directory}${match[1]!}`, role };
};
