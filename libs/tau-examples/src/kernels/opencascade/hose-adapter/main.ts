/**
 * Round-to-rectangular hose adapter.
 *
 * One ThruSections loft carries a near-circular inlet into a rounded rectangle
 * through a shifted middle section, then a second loft cuts the wall. Every
 * section is the same eight-edge wire so the loft can pair edges. A cone
 * primitive only covers the circular case, and a mesh hull between the two
 * ends skips the bend.
 */
import {
  BRepAlgoAPI_Cut,
  BRepBuilderAPI_MakeEdge,
  BRepBuilderAPI_MakeWire,
  BRepFill_ThruSectionErrorStatus,
  BRepOffsetAPI_ThruSections,
  GC_MakeArcOfCircle,
  Message_ProgressRange,
  gp_Pnt,
  type TopoDS_Edge,
  type TopoDS_Shape,
  type TopoDS_Wire,
} from 'libcascade';

export const defaultParams = {
  /** Circular inlet, outside diameter. */
  inletDiameter: 48,
  /** Rectangular outlet width. */
  outletWidth: 40,
  /** Rectangular outlet height. */
  outletHeight: 20,
  /** Outlet corner radius. */
  outletCorner: 4,
  /** Length along the loft. */
  length: 56,
  /** Wall thickness. */
  wall: 2.2,
  /** How far the middle section steps sideways, which bends the run. */
  bend: 14,
};

type Params = typeof defaultParams;

type Disposable = { delete(): void };

/**
 * Section wires and the boolean stay referenced for the life of the evaluation.
 * Dropping them lets the wasm finalizer free topology the mesh export still reads.
 */
const retained: Disposable[] = [];

const requireShape = (params: Params): void => {
  const fields = [
    params.inletDiameter,
    params.outletWidth,
    params.outletHeight,
    params.outletCorner,
    params.length,
    params.wall,
  ];
  if (fields.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Adapter dimensions must be positive.');
  }
  if (!Number.isFinite(params.bend)) {
    throw new RangeError('bend must be finite.');
  }
  const opening = Math.min(
    params.inletDiameter,
    params.outletWidth,
    params.outletHeight,
  );
  if (params.wall * 2 + 1.5 >= opening) {
    throw new RangeError('wall leaves no opening.');
  }
  if (
    params.outletCorner * 2 >=
    Math.min(params.outletWidth, params.outletHeight)
  ) {
    throw new RangeError('outletCorner is larger than the outlet.');
  }
};

/**
 * Hollow loft from a round inlet to a rounded rectangular outlet.
 * @param params - End sizes, wall, length and sideways bend.
 * @returns The adapter solid.
 */
export default function main(params: Params = defaultParams): TopoDS_Shape {
  requireShape(params);
  const own = <T extends Disposable>(value: T): T => {
    retained.push(value);
    return value;
  };
  const point = (x: number, y: number, z: number): gp_Pnt =>
    own(new gp_Pnt(x, y, z));

  const lineEdge = (start: gp_Pnt, end: gp_Pnt): TopoDS_Edge =>
    own(new BRepBuilderAPI_MakeEdge(start, end)).Edge();

  const arcEdge = (start: gp_Pnt, mid: gp_Pnt, end: gp_Pnt): TopoDS_Edge => {
    const arc = own(new GC_MakeArcOfCircle(start, mid, end));
    return own(new BRepBuilderAPI_MakeEdge(arc.Value())).Edge();
  };

  const wireFrom = (edges: readonly TopoDS_Edge[]): TopoDS_Wire => {
    const maker = own(new BRepBuilderAPI_MakeWire());
    for (const edge of edges) {
      maker.Add(edge);
    }
    if (!maker.IsDone()) {
      throw new Error('Adapter profile wire did not close.');
    }
    return maker.Wire();
  };

  const roundedRectWire = (
    width: number,
    height: number,
    radius: number,
    x: number,
    z: number,
  ): TopoDS_Wire => {
    const hx = width / 2;
    const hy = height / 2;
    const r = Math.min(radius, Math.min(hx, hy) - 0.4);
    const k = Math.SQRT1_2 * r;
    const at = (dx: number, dy: number): gp_Pnt => point(x + dx, dy, z);
    const bottomLeft = at(-hx + r, -hy);
    const bottomRight = at(hx - r, -hy);
    const rightBottom = at(hx, -hy + r);
    const rightTop = at(hx, hy - r);
    const topRight = at(hx - r, hy);
    const topLeft = at(-hx + r, hy);
    const leftTop = at(-hx, hy - r);
    const leftBottom = at(-hx, -hy + r);
    return wireFrom([
      lineEdge(bottomLeft, bottomRight),
      arcEdge(bottomRight, at(hx - r + k, -hy + r - k), rightBottom),
      lineEdge(rightBottom, rightTop),
      arcEdge(rightTop, at(hx - r + k, hy - r + k), topRight),
      lineEdge(topRight, topLeft),
      arcEdge(topLeft, at(-hx + r - k, hy - r + k), leftTop),
      lineEdge(leftTop, leftBottom),
      arcEdge(leftBottom, at(-hx + r - k, -hy + r - k), bottomLeft),
    ]);
  };

  const loft = (wires: readonly TopoDS_Wire[]): TopoDS_Shape => {
    const maker = own(new BRepOffsetAPI_ThruSections(true, false));
    maker.CheckCompatibility(true);
    for (const profile of wires) {
      maker.AddWire(profile);
    }
    const progress = own(new Message_ProgressRange());
    maker.Build(progress);
    if (
      maker.GetStatus() !==
      BRepFill_ThruSectionErrorStatus.BRepFill_ThruSectionErrorStatus_Done
    ) {
      throw new Error(`Adapter loft failed (${String(maker.GetStatus())}).`);
    }
    return maker.Shape();
  };

  const {
    inletDiameter,
    outletWidth,
    outletHeight,
    outletCorner,
    length,
    wall,
    bend,
  } = params;
  const midWidth = (inletDiameter + outletWidth) / 2;
  const midHeight = (inletDiameter + outletHeight) / 2;
  const midRadius = Math.min(midWidth, midHeight) / 2 - 1;
  // The inlet uses the same eight-edge wire as the outlet, with the corner
  // radius taken almost to a semicircle, so it reads as a round port.
  const outer = loft([
    roundedRectWire(inletDiameter, inletDiameter, inletDiameter / 2, 0, 0),
    roundedRectWire(midWidth, midHeight, midRadius, bend, length / 2),
    roundedRectWire(
      outletWidth,
      outletHeight,
      outletCorner,
      bend * 0.45,
      length,
    ),
  ]);
  const inner = loft([
    roundedRectWire(
      inletDiameter - 2 * wall,
      inletDiameter - 2 * wall,
      inletDiameter / 2,
      0,
      -1,
    ),
    roundedRectWire(
      midWidth - 2 * wall,
      midHeight - 2 * wall,
      Math.max(midRadius - wall, 0.8),
      bend,
      length / 2,
    ),
    roundedRectWire(
      outletWidth - 2 * wall,
      outletHeight - 2 * wall,
      Math.max(outletCorner - wall, 0.8),
      bend * 0.45,
      length + 1,
    ),
  ]);
  const progress = own(new Message_ProgressRange());
  const cut = own(new BRepAlgoAPI_Cut(outer, inner, progress));
  if (!cut.IsDone()) {
    throw new Error('Adapter wall cut failed.');
  }
  return cut.Shape();
}
