/**
 * Adopting a newly authored large file into the store (D9).
 *
 * A file `.gitattributes` tracks as a large object is copied into the store
 * once, and the checkout then keeps only its pointer. That is one copy of every
 * large object. Each step leaves something whole behind it, so a crash at any
 * point leaves either the full file, or the pointer with the verified object
 * in the store:
 *
 * 1. the bytes are hashed, written to a `.partial` beside the store's name
 *    for them, and renamed into place (the port's `storeLargeObject`);
 * 2. the stored object is read back and hashed again, so it is verified once,
 *    where it lives;
 * 3. only then is the file replaced by its pointer, as one changeset whose
 *    precondition is the file as captured. A file someone wrote meanwhile is
 *    theirs, and is left whole for the next adoption.
 *
 * A path that already holds a pointer, or that the attributes do not track, is
 * never touched: a pointer with no attribute behind it is a file a person can
 * never read again.
 */
import { generatedGitattributesPath, isTrackedLargeObjectPath } from '#workspace-config.js';
import { ImmutableRevisionTree } from '#algorithms/index.js';
import type { RevisionTreeInput } from '#algorithms/index.js';
import { lfsPointerFor, readLfsPointer } from '#lfs.js';
import type { LfsPointer } from '#lfs.js';
import { RevisionPortError } from '#revision-port.js';
import type { Checkout } from '#revision-port.js';

const decoder = new TextDecoder();

/** What adoption is built over. */
export type LargeObjectAdoptionDependencies = Readonly<{
  capture: (place: Checkout) => Promise<ImmutableRevisionTree>;
  withCheckoutFence: <Result>(checkoutId: string, operation: () => Promise<Result>) => Promise<Result>;
  /** Write `target` over the checkout, refusing with `CHECKOUT_CONFLICT` when it no longer holds `before`. */
  materializeTree: (
    place: Checkout,
    target: ImmutableRevisionTree,
    materialization: Readonly<{ before: ImmutableRevisionTree; purpose: 'fill' }>,
  ) => Promise<unknown>;
  /** Store one object under its pointer: `.partial`, then a rename. */
  storeObject: (pointer: LfsPointer, content: Uint8Array<ArrayBuffer>) => Promise<void>;
  /** One object from the store alone. */
  readStoredObject: (pointer: LfsPointer) => Promise<Uint8Array<ArrayBuffer> | undefined>;
}>;

/** What one adoption did. @public */
export type LargeObjectAdoption = Readonly<{
  /** Paths that now hold their pointer, with the object verified in the store. */
  adopted: readonly string[];
  /** Paths left whole: the store copy did not verify, or a writer moved the checkout. */
  left: readonly string[];
}>;

/**
 * Build the adoption over one project's checkout seams.
 *
 * @param dependencies - Capture, fence, materialization and the store.
 * @returns `adopt`, which adopts every tracked large file a checkout holds whole.
 */
export const createLargeObjectAdoption = (
  dependencies: LargeObjectAdoptionDependencies,
): Readonly<{ adopt: (place: Checkout) => Promise<LargeObjectAdoption> }> => {
  const { capture, withCheckoutFence, materializeTree, storeObject, readStoredObject } = dependencies;

  /* The store's copy, read back and hashed: written once, verified once. */
  const verified = async (pointer: LfsPointer): Promise<boolean> => {
    const stored = await readStoredObject(pointer);
    return stored !== undefined && lfsPointerFor(stored).pointer.oid === pointer.oid;
  };

  const adopt = async (place: Checkout): Promise<LargeObjectAdoption> =>
    withCheckoutFence(place.id, async () => {
      const before = await capture(place);
      const attributesFile = before.get(generatedGitattributesPath);
      const attributes = attributesFile === undefined ? undefined : decoder.decode(attributesFile);
      const candidates = before
        .entries()
        .filter(
          ({ path, content }) =>
            path !== generatedGitattributesPath &&
            isTrackedLargeObjectPath(path, attributes) &&
            readLfsPointer(content) === undefined,
        );
      if (candidates.length === 0) {
        return { adopted: [], left: [] };
      }
      const pointers = new Map<string, Readonly<{ pointer: LfsPointer; bytes: Uint8Array<ArrayBuffer> }>>();
      const left: string[] = [];
      for (const { path, content } of candidates) {
        const { pointer, bytes } = lfsPointerFor(content);
        // oxlint-disable-next-line no-await-in-loop -- one object at a time, so only one large file is resident beside the capture.
        await storeObject(pointer, content);
        // oxlint-disable-next-line no-await-in-loop -- verified as it is stored.
        if (await verified(pointer)) {
          pointers.set(path, { pointer, bytes });
        } else {
          left.push(path);
        }
      }
      if (pointers.size === 0) {
        return { adopted: [], left };
      }
      const entries: RevisionTreeInput[] = before
        .entries()
        .map(({ path, content, mode }) => [path, pointers.get(path)?.bytes ?? content, mode]);
      try {
        await materializeTree(place, new ImmutableRevisionTree(entries), { before, purpose: 'fill' });
      } catch (error) {
        if (error instanceof RevisionPortError && error.code === 'CHECKOUT_CONFLICT') {
          /* Someone wrote meanwhile: their files stay whole, and the objects stay stored for the next adoption. */
          return { adopted: [], left: [...left, ...pointers.keys()] };
        }
        throw error;
      }
      return { adopted: [...pointers.keys()], left };
    });

  return { adopt };
};
