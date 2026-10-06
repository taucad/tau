import type { AuthoredAssembly, PublishedPartReference } from '@taucad/runtime/types';

/** Four supported flat rigid placements, authored in canonical GLTF metres. */
export const flatActionPlacements = [
  { id: 'flat-a', x: 0.03 },
  { id: 'flat-b', x: 0.06 },
  { id: 'flat-c', x: 0.09 },
  { id: 'flat-d', x: 0.12 },
] as const;

/** Reuse the actual captured published reference; the existing host loader readmits it without a source producer. */
export function createFlatOccurrenceActionsAssembly(
  reference: PublishedPartReference,
  order: readonly string[],
): AuthoredAssembly {
  if (new Set(order).size !== order.length || order.length < 2 || order.length > 4) {
    throw new Error('The finite actions fixture requires two to four unique existing placements.');
  }
  return {
    schemaVersion: 1,
    parts: { opaque: { publishedPart: reference } },
    occurrences: order.map((id) => {
      const placement = flatActionPlacements.find((value) => value.id === id);
      if (!placement) {
        throw new Error('An unknown placement cannot enter the finite public authored graph.');
      }
      return { id, part: 'opaque', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, placement.x, 0, 0, 1] as const };
    }),
  };
}

/** Independent source corners: maintained makeBaseBox(20,14,4) centres XY and extrudes from Z=0, once. */
export function flatActionNativeOracle(
  components: ReadonlyArray<Readonly<{ ancestry: readonly string[]; component: Readonly<{ id: string }> }>>,
): Array<{
  id: string;
  corners: Array<readonly [number, number, number]>;
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}> {
  const expected = flatActionPlacements.map(({ id, x }) => {
    const rows = components.filter(({ ancestry }) => ancestry.length === 1 && ancestry[0] === id);
    const row = rows[0];
    if (rows.length !== 1 || !row) {
      throw new Error('Exactly one actual canonical component must bind each authored flat placement.');
    }
    const corners: Array<readonly [number, number, number]> = [];
    for (const nativeX of [-10, 10]) {
      for (const nativeY of [-7, 7]) {
        for (const nativeZ of [0, 4]) {
          // Numeric AP242 bytes are Y-up millimetres: native baked S is present once; O translates X.
          corners.push([nativeX + x * 1000, nativeZ, -nativeY]);
        }
      }
    }
    return { id: row.component.id, corners, min: [x * 1000 - 10, 0, -7] as const, max: [x * 1000 + 10, 4, 7] as const };
  });
  if (new Set(expected.map(({ id }) => id)).size !== 4) {
    throw new Error('Actual canonical flat identities must be distinct.');
  }
  return expected;
}
