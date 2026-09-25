/**
 * The one portable-filesystem collision rule, shared by the cut and by
 * materialization (L2-F7).
 *
 * A cut that folded case alone while materialization also normalized to NFC
 * could record a revision no checkout could write — `café` spelled two ways is
 * routine between macOS and Linux — which is exactly what refusing at the cut
 * exists to prevent.
 */
import type { ImmutableRevisionTree } from '#algorithms/index.js';

/** Two tracked paths one supported filesystem cannot hold together. @internal */
export type PortableCollision = Readonly<{
  /** The path met first, then the one that collides with it. */
  paths: readonly [string, string];
  /** `true` when the first is a file whose name the second needs as a directory. */
  asDirectory: boolean;
}>;

/* How a case-insensitive, normalizing filesystem names a path. */
const portableKey = (path: string): string => path.normalize('NFC').toLowerCase();

/**
 * Every pair of tracked paths a supported filesystem cannot materialize together.
 *
 * @param tree - The tree about to be recorded or written.
 * @returns The collisions, or an empty array.
 * @internal
 */
export const portableCollisions = (tree: ImmutableRevisionTree): readonly PortableCollision[] => {
  const seen = new Map<string, string>();
  const collisions: PortableCollision[] = [];
  for (const { path } of tree.entries()) {
    const key = portableKey(path);
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, path);
    } else {
      collisions.push({ paths: [first, path], asDirectory: false });
    }
  }
  for (const [key, path] of seen) {
    for (let index = key.indexOf('/'); index !== -1; index = key.indexOf('/', index + 1)) {
      const file = seen.get(key.slice(0, index));
      if (file !== undefined) {
        collisions.push({ paths: [file, path], asDirectory: true });
      }
    }
  }
  return collisions;
};

/**
 * The colliding paths of {@link portableCollisions}, for the cut's refusal.
 *
 * Refused at the cut rather than at the write: the tree model accepts them
 * (W3a review), and a revision nobody can check out is worse than a failed cut.
 *
 * @param tree - The captured tree.
 * @returns The colliding paths, or an empty array.
 */
export const caseCollisions = (tree: ImmutableRevisionTree): readonly string[] =>
  portableCollisions(tree).flatMap((collision) => collision.paths);
