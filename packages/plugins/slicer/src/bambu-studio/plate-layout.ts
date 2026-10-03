/**
 * Where a multi-colour assembly goes when Bambu Studio's own arrangement collides with its prime tower.
 *
 * The command line arranges objects against an estimate of the tower that is up to about 2 mm smaller
 * than the tower it then prints, and leaves only 1 mm between them. On a crowded plate the assembly ends
 * up flush against the tower and the slice fails its own path-conflict check. The engine measures the
 * tower the slicer prints and moves the assembly the shortest way clear of it, inside the bed and away
 * from any excluded area; Bambu Studio's conflict check still judges the result.
 *
 * @module
 */

/** An axis-aligned rectangle on the plate, in millimetres. @internal */
export type PlateRect = Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;

const triangleBytes = 50;
const headerBytes = 84;

/**
 * Bound a preset polygon written as Bambu Studio's `"XxY"` points, such as `printable_area` or
 * `bed_exclude_area`.
 *
 * @internal
 * @param points - The preset value.
 * @returns Its bounds, or nothing for a value with no area.
 */
export const presetRect = (points: unknown): PlateRect | undefined => {
  if (!Array.isArray(points)) {
    return undefined;
  }
  const coordinates = points
    .map((point) => (typeof point === 'string' ? point.split('x').map(Number) : []))
    .filter((pair): pair is [number, number] => pair.length === 2 && pair.every((value) => Number.isFinite(value)));
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  const rect = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  return coordinates.length > 0 && rect.maxX > rect.minX && rect.maxY > rect.minY ? rect : undefined;
};

const corners = function* (stl: Uint8Array<ArrayBuffer>): Generator<number> {
  const count = new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);
  for (let triangle = 0; triangle < count; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      yield stl.byteOffset + headerBytes + triangle * triangleBytes + 12 + corner * 12;
    }
  }
};

/**
 * The XY bounds of a binary STL.
 *
 * @internal
 * @param stl - Binary STL bytes.
 * @returns Its footprint.
 */
export const stlFootprint = (stl: Uint8Array<ArrayBuffer>): PlateRect => {
  const view = new DataView(stl.buffer);
  let rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const offset of corners(stl)) {
    const x = view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    rect = {
      minX: Math.min(rect.minX, x),
      minY: Math.min(rect.minY, y),
      maxX: Math.max(rect.maxX, x),
      maxY: Math.max(rect.maxY, y),
    };
  }
  return rect;
};

/**
 * A copy of a binary STL moved in XY.
 *
 * @internal
 * @param stl - Binary STL bytes, left untouched.
 * @param dx - Millimetres along X.
 * @param dy - Millimetres along Y.
 * @returns The moved copy.
 */
export const moveStl = (stl: Uint8Array<ArrayBuffer>, dx: number, dy: number): Uint8Array<ArrayBuffer> => {
  const moved = Uint8Array.from(stl);
  const view = new DataView(moved.buffer);
  for (const offset of corners(stl)) {
    const at = offset - stl.byteOffset;
    view.setFloat32(at, view.getFloat32(at, true) + dx, true);
    view.setFloat32(at + 4, view.getFloat32(at + 4, true) + dy, true);
  }
  return moved;
};

/**
 * The bounds of several rectangles.
 *
 * @internal
 * @param rects - At least one rectangle.
 * @returns Their union.
 */
export const unionRect = (rects: readonly PlateRect[]): PlateRect => ({
  minX: Math.min(...rects.map(({ minX }) => minX)),
  minY: Math.min(...rects.map(({ minY }) => minY)),
  maxX: Math.max(...rects.map(({ maxX }) => maxX)),
  maxY: Math.max(...rects.map(({ maxY }) => maxY)),
});

const overlaps = (a: PlateRect, b: PlateRect, gap: number): boolean =>
  a.minX < b.maxX + gap && b.minX < a.maxX + gap && a.minY < b.maxY + gap && b.minY < a.maxY + gap;

/**
 * The shortest move that puts an assembly clear of the printed prime tower.
 *
 * The assembly starts where Bambu Studio arranged it, unrotated and centred on its arranged bounds, and
 * moves left, right, forward or back just far enough to clear the tower by `clearance`. A move that
 * leaves the bed or comes within `clearance` of an excluded area is not taken.
 *
 * @internal
 * @param input - The bed, its excluded areas, the printed tower, the arranged bounds, the assembly's own
 * footprint in model coordinates and the gap to keep.
 * @returns The translation from model coordinates, or nothing when no side has room.
 */
export const placeClearOfTower = ({
  bed,
  exclusions,
  tower,
  arranged,
  footprint,
  clearance,
}: Readonly<{
  bed: PlateRect;
  exclusions: readonly PlateRect[];
  tower: PlateRect;
  arranged: PlateRect;
  footprint: PlateRect;
  clearance: number;
}>): Readonly<{ dx: number; dy: number }> | undefined => {
  const width = footprint.maxX - footprint.minX;
  const depth = footprint.maxY - footprint.minY;
  const startX = (arranged.minX + arranged.maxX - width) / 2;
  const startY = (arranged.minY + arranged.maxY - depth) / 2;
  const candidates = [
    { x: tower.maxX + clearance, y: startY },
    { x: tower.minX - clearance - width, y: startY },
    { x: startX, y: tower.maxY + clearance },
    { x: startX, y: tower.minY - clearance - depth },
  ]
    .map(({ x, y }) => ({ x, y, rect: { minX: x, minY: y, maxX: x + width, maxY: y + depth } }))
    .filter(
      ({ rect }) =>
        rect.minX >= bed.minX &&
        rect.minY >= bed.minY &&
        rect.maxX <= bed.maxX &&
        rect.maxY <= bed.maxY &&
        !overlaps(rect, tower, clearance) &&
        exclusions.every((excluded) => !overlaps(rect, excluded, clearance)),
    )
    .toSorted((a, b) => Math.hypot(a.x - startX, a.y - startY) - Math.hypot(b.x - startX, b.y - startY));
  const [best] = candidates;
  return best === undefined ? undefined : { dx: best.x - footprint.minX, dy: best.y - footprint.minY };
};
