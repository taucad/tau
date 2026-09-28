/**
 * What a host publishes from one project's revision tree, and what it feeds in.
 *
 * Both halves were the browser worker's and are host-neutral (W10.5): the Node
 * daemon had no comparator at all, so it emitted a status frame per machine
 * transition and every client repainted for each. They live beside the
 * projection rather than inside `project-revisions.machine.ts` because a
 * machine module may not import the filesystem package
 * (`machines.import-boundary.test.ts`), and a change event and a path policy
 * both come from there.
 */
import type { ChangeEvent, PathPolicy } from '@taucad/filesystem';
import type { RevisionStatusProjection } from '#project-revisions.types.js';

/**
 * The versioned paths one content-change event touches inside one project.
 *
 * One call per bus event, whatever its path count: the root mints one
 * `generation` per `changed`, and the checkout compares that counter across a
 * mint, so a seam that split an event into several would make a write that
 * landed during a mint invisible (F9, F4). Paths are returned
 * project-relative, which is the namespace the revision tree speaks.
 *
 * An event whose scope is unknown — a backend that changed wholesale, or
 * bytes landing on the project's own route or one above it — is the root, `''`,
 * which every capture reads as "walk everything" (E1).
 *
 * @param event - One authority-level change event.
 * @param projectRoot - The project's route, e.g. `/projects/p1`.
 * @param policy - The classifier this project's layout answers with (EQ6).
 * @returns Every versioned project-relative path the event touched.
 * @public
 */
export const versionedChangePaths = (
  event: ChangeEvent,
  projectRoot: string,
  policy: PathPolicy,
): readonly string[] => {
  if (event.type === 'backendChanged') {
    return [''];
  }
  const absolute =
    'path' in event
      ? [event.path]
      : 'oldPath' in event
        ? [event.oldPath, event.newPath]
        : [event.sourcePath, event.targetPath];
  /* Bytes landing on the route itself or above it (a tree moved or copied
   * over the project) name no path inside it. A delete there removes the
   * project, which is not a change to record. */
  const landed =
    'newPath' in event
      ? event.newPath
      : 'targetPath' in event
        ? event.targetPath
        : event.type.endsWith('Deleted')
          ? undefined
          : event.path;
  if (
    landed !== undefined &&
    (landed === projectRoot || projectRoot.startsWith(landed === '/' ? landed : `${landed}/`))
  ) {
    return [''];
  }
  const prefix = `${projectRoot}/`;
  return absolute
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((path) => path !== '' && policy.classify(path).versioned);
};

/**
 * Whether two projections say the same thing to a reader (P28, P52).
 *
 * Every settled field a surface renders, and nothing that ticks. A field left
 * out here is a surface that never repaints: `remote.*` was missing, so
 * *Connect Tau Cloud* moved `phase` none → connecting → connected and the Sync
 * region kept drawing the disconnected state (W18 DEF-6).
 * The projection is JSON-shaped plain data, so serializing it compares nested
 * arrays and every present field without another hand-maintained field list.
 *
 * @param left - The published projection.
 * @param right - The candidate projection.
 * @returns Whether the page would draw the same thing.
 * @public
 */
export const sameRevisionStatus = (left: RevisionStatusProjection, right: RevisionStatusProjection): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
