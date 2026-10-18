# @classcad/smlibwasm — Functions

99 top-level symbols. Signatures are verbatim typescript.

// A translation
// Pos (function)
export declare function Pos(x?: number | VectorLike | XYZ, y?: number, z?: number): Location;

// A rotation in degrees about the world X, then Y, then Z axis
// Rot (function)
export declare function Rot(x?: number | VectorLike | XYZ, y?: number, z?: number): Location;

// Triangulate a shape
// tessellate (function)
export declare function tessellate(shape: Shape | Iterable<Shape>, tolerance?: number | null, angle?: number): Mesh;
//   shape: A part, sketch, shell or face (or a list of them)
//   tolerance: Maximum distance between mesh and exact surface
//   angle: Maximum angle (degrees) between neighbouring triangle normals on curved faces

// A Bézier curve (rational if `weights` are given) from its control points
// Bezier (function)
export declare function Bezier(...args: (VectorLike | readonly VectorLike[] | {
    weights?: readonly number[] | null;
})[]): Edge;

// An arc around `center` starting at `startAngle` and spanning `arcSize` degrees (angles counterclockwise from the plane's X axis
// Remarks: `center` is given in plane coordinates.
// CenterArc (function)
export declare function CenterArc(center: VectorLike, radius: number, startAngle: number, arcSize: number, plane?: Plane): Edge;

// An ellipse (or elliptical arc) around `center` in `plane`
// Remarks: The angles are ellipse angles in degrees (the point at angle a is `(xRadius cos a, yRadius sin a)`). The arc runs counterclockwise from `startAngle` to `endAngle`, also across 0 (300 to 60 passes through the X axis); equal angles give the whole ellipse.
// EllipticalArc (function)
export declare function EllipticalArc(center: VectorLike, xRadius: number, yRadius: number, startAngle?: number, endAngle?: number, plane?: Plane): Edge;

// A polyline whose corners are rounded with `radius`
// FilletPolyline (function)
export declare function FilletPolyline(...args: (VectorLike | readonly VectorLike[] | {
    radius: number;
    close?: boolean;
})[]): Wire;

// A helix around `direction` through `center`
// Remarks: `direction` is a vector or an axis (only its direction counts; `center` places the helix). `endRadius` makes a conical helix; `pitch` is the rise per turn.
// Helix (function)
export declare function Helix(pitch: number, height: number, radius: number, options?: {
    center?: VectorLike;
    direction?: Axis | VectorLike;
    endRadius?: number | null;
    leftHanded?: boolean;
}): Edge;

// A straight edge from `start` to `end`
// Line (function)
export declare function Line(start: VectorLike, end: VectorLike): Edge;

// A line of `length` leaving `start` at `angle` degrees from the plane's X axis
// PolarLine (function)
export declare function PolarLine(start: VectorLike, length: number, angle: number, plane?: Plane): Edge;

// Straight segments through the points
// Polyline (function)
export declare function Polyline(...args: (VectorLike | readonly VectorLike[] | {
    close?: boolean;
})[]): Wire;

// The shorter arc of `radius` from `start` to `end` in `plane`
// Remarks: A positive radius bulges to the left of the direction start->end, a negative one to the right.
// RadiusArc (function)
export declare function RadiusArc(start: VectorLike, end: VectorLike, radius: number, plane?: Plane): Edge;

// An arc from `start` to `end` whose middle is `sagitta` away from the chord (positive to the left of start->end)
// SagittaArc (function)
export declare function SagittaArc(start: VectorLike, end: VectorLike, sagitta: number, plane?: Plane): Edge;

// A smooth cubic curve through the points
// Remarks: Options: `tangents`, the `[start, end]` tangent directions (either may be null); `closed` makes a closed loop (smooth at the join).
// Spline (function)
export declare function Spline(...args: (VectorLike | readonly VectorLike[] | {
    tangents?: readonly [VectorLike | null, VectorLike | null] | null;
    closed?: boolean;
})[]): Edge;

// An arc from `start` to `end` leaving `start` along `tangent`
// TangentArc (function)
export declare function TangentArc(start: VectorLike, end: VectorLike, tangent: VectorLike): Edge;

// The circular arc from `start` through `through` to `end`
// ThreePointArc (function)
export declare function ThreePointArc(start: VectorLike, through: VectorLike, end: VectorLike): Edge;

// Copies of the curves as B-splines of one degree and one knot vector, with the same shapes
// makeCompatible (function)
export declare function makeCompatible(...edges: (Edge | Iterable<Edge>)[]): Edge[];
//   edges: Two or more edges (or arrays of them)

// A slot along an arc around the origin
// ArcSlot (function)
export declare function ArcSlot(radius: number, width: number, angle: number, options?: PlacementOptions): Sketch;

// A disk of `radius`
// Circle (function)
export declare function Circle(radius: number, options?: {
    align?: AlignLike;
}): Sketch;

// An ellipse with semi-axes `xRadius` and `yRadius`, turned by `rotation` degrees about its center
// Ellipse (function)
export declare function Ellipse(xRadius: number, yRadius: number, options?: PlacementOptions): Sketch;

// The convex hull of points and shapes
// Remarks: `items`: points ([x, y], Vectors, Vertices), edges, wires, sketches or faces, or lists of them. `Hull(Circle(10), Pos(60, 0).mul(Circle(6)))` is a lever outline.
// Hull (function)
export declare function Hull(...items: unknown[]): Sketch;

// The polygon through the points (closed automatically)
// Polygon (function)
export declare function Polygon(...args: (VectorLike | readonly VectorLike[] | PolygonOptions)[]): Sketch;

// A `width` (X) by `height` (Y) rectangle
// Remarks: `fillet` rounds the four corners with that radius, `chamfer` bevels them by that length (at most half the shorter side). `rotation` turns it about its center (degrees counterclockwise); `align` then works on the turned outline.
// Rectangle (function)
export declare function Rectangle(width: number, height: number, options?: CornerOptions & PlacementOptions): Sketch;

// A regular polygon with `sides` corners
// Remarks: `radius` is the distance to the corners, or to the middle of the sides when `inscribed` is true (handy for hexagons measured across flats: `radius = flats / 2`). `fillet` and `chamfer` round or bevel every corner.
// RegularPolygon (function)
export declare function RegularPolygon(radius: number, sides: number, options?: {
    inscribed?: boolean;
} & CornerOptions & PlacementOptions): Sketch;

// A rectangle with rounded corners
// RoundedRectangle (function)
export declare function RoundedRectangle(width: number, height: number, radius: number, options?: {
    align?: AlignLike;
}): Sketch;

// An obround slot `length` long overall (round ends included) and `width` wide, along X
// Slot (function)
export declare function Slot(length: number, width: number, options?: PlacementOptions): Sketch;

// The region a pen `width` wide covers along a path of lines and arcs
// Remarks: `ends`: "round" (half circles, the default) or "flat" (cut square at the end points). `corners`: how the outside of a bend is shaped, "round", "sharp" or "chamfer". A closed path makes a ring. The path stays where it is (in its plane).
// Stroke (function)
export declare function Stroke(path: Edge | Wire, width: number, options?: {
    ends?: string;
    corners?: string;
}): Sketch;

// A trapezoid with a base of `width`
// Trapezoid (function)
export declare function Trapezoid(width: number, height: number, leftAngle: number, rightAngle?: number | null | TrapezoidOptions, options?: TrapezoidOptions): Sketch;

// A triangle with a base of `width` along X and its top corner `height` above it
// Remarks: `apex` is the x position of the top corner measured from the left end of the base: the middle by default (an isosceles triangle), `0` for a right angle at the left end, `width` for one at the right end. The triangle is centered on its bounding box; `fillet` and `chamfer` round or bevel the three corners.
// Triangle (function)
export declare function Triangle(width: number, height: number, options?: {
    apex?: number | null;
} & CornerOptions & PlacementOptions): Sketch;

// The planar region inside a closed wire, minus the regions inside `holes`
// makeFace (function)
export declare function makeFace(outer: Wire | Edge, ...holes: (Wire | Edge)[]): Sketch;

// Lettering as a sketch in the XY plane, with the exact outlines of the font
// Remarks: `text` is the text; "\n" starts a new line. `size` is the height of the capital letters (H, E, T) in mm, the nominal height of technical lettering: `Text("H", 10)` is 10 mm tall. Round letters overshoot it by a few percent; descenders go below the baseline. Returns a `Sketch` on `Plane.XY`: one face per separate piece of a letter, counters as holes. Outlines are exact: straight segments are lines, curved runs are B-splines through the font's on-curve points. Throws a RangeError for an empty text, a size that is not positive, a character the font does not have, a font that cannot be read, or a path the text does not fit on.
// Text (function)
export declare function Text(text: string, size: number, options?: TextOptions): Sketch;

// The font `source`, read once and kept
// Remarks: A path that is no file throws an Error with `code` "ENOENT" (Python's FileNotFoundError).
// loadFont (function)
export declare function loadFont(source?: string | Uint8Array | null): Font;

// A box of `length` (X) by `width` (Y) by `height` (Z)
// Box (function)
export declare function Box(length: number, width: number, height: number, options?: {
    align?: AlignLike;
}): Part;

// A cone (or frustum) along Z
// Cone (function)
export declare function Cone(bottomRadius: number, topRadius: number, height: number, options?: {
    align?: AlignLike;
}): Part;

// A drilling tool with a counterbore at the top
// CounterBoreHole (function)
export declare function CounterBoreHole(radius: number, counterBoreRadius: number, counterBoreDepth: number, depth: number): Part;

// A drilling tool with a conical countersink of included `angle` at the top
// CounterSinkHole (function)
export declare function CounterSinkHole(radius: number, counterSinkRadius: number, depth: number, angle?: number): Part;

// A cylinder along Z
// Cylinder (function)
export declare function Cylinder(radius: number, height: number, options?: {
    align?: AlignLike;
}): Part;

// A drilling tool
// Hole (function)
export declare function Hole(radius: number, depth: number): Part;

// A sphere
// Sphere (function)
export declare function Sphere(radius: number, options?: {
    align?: AlignLike;
}): Part;

// A torus around Z
// Torus (function)
export declare function Torus(majorRadius: number, minorRadius: number, options?: {
    align?: AlignLike;
}): Part;

// A ramp
// Wedge (function)
export declare function Wedge(length: number, width: number, height: number, topLength?: number, options?: {
    align?: AlignLike;
}): Part;

// A rectangular grid in the XY plane, centered on the origin unless `centered
// GridLocations (function)
export declare function GridLocations(xSpacing: number, ySpacing: number, xCount: number, yCount: number, options?: {
    centered?: boolean;
}): Locations;

// A honeycomb pattern
// HexLocations (function)
export declare function HexLocations(spacing: number, xCount: number, yCount: number, options?: {
    centered?: boolean;
}): Locations;

// `count` locations on a circle of `radius` in the XY plane
// Remarks: With `rotate` the copies turn with the pattern (their X axis points outward). A full circle (`angularRange: 360`) spaces them evenly without repeating the start.
// PolarLocations (function)
export declare function PolarLocations(radius: number, count: number, options?: {
    startAngle?: number;
    angularRange?: number;
    rotate?: boolean;
}): Locations;

// Bevel edges of the part they belong to (see `Part.chamfer`), or corners of the sketch they belong to (see `Sketch.chamfer`)
// chamfer (function)
export declare function chamfer(edges: unknown, length: number): Part | Sketch;

// Extrude a sketch, a planar face or a closed wire into a solid (see `Sketch.extrude`)
// Remarks: An open curve extrudes into a surface (a Shell), along `direction` (an axis or a vector) or the normal of the curve's plane.
// extrude (function)
export declare function extrude(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, amount: number, options?: ExtrudeFunctionOptions): Part | Shell;

// Round edges of the part they belong to (see `Part.fillet`), or corners of the sketch they belong to
// fillet (function)
export declare function fillet(edges: unknown, radius: FilletRadius, options?: FilletOptions): Part | Sketch;

// A solid through a sequence of cross sections, or a surface through open curves
// loft (function)
export declare function loft(sections: readonly unknown[], options?: {
    ruled?: boolean;
    smooth?: boolean;
}): Part | Shell;
//   sections: Two or more sections in order
//   options: `ruled`

// Parts as one part made of cells
// merge (function)
export declare function merge(...parts: (Part | Iterable<Part>)[]): Part;

// A mirrored copy of a shape
// mirror (function)
export declare function mirror<S extends Shape>(shape: S, plane?: Plane | Face | Axis | ShapeList<Face>): S;

// Grow or shrink a part or a sketch by `distance` (for a sketch also the option `corners
// offset (function)
export declare function offset(shape: Part | Sketch, distance: number, options?: {
    corners?: string;
    round?: boolean | null;
}): Part | Sketch;

// Revolve a sketch about an axis into a solid (see `Sketch.revolve`)
// Remarks: An open curve revolves into a surface of revolution (a Shell).
// revolve (function)
export declare function revolve(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, axis?: Axis | null, angle?: number): Part | Shell;

// Cross-section of a part (see `Part.section`)
// section (function)
export declare function section(part: Part, plane?: Plane | Face): Sketch;

// Hollow out a part (see `Part.shell`)
// shell (function)
export declare function shell(part: Part, thickness: number, openings?: unknown, options?: {
    outward?: boolean;
}): Part;

// Cut a part with a plane (see `Part.split`)
// split (function)
export declare function split(part: Part, plane: Plane | Face, keep?: 'above' | 'below' | 'both'): Part | [Part, Part];

// Sweep a profile along a path
// Remarks: The profile is moved so that its center sits at the start of the path and (with `orient`) turned to face along the path, so profiles can be drawn anywhere, usually in the XY plane: const tube = sweep(Circle(2), Spline([0, 0, 0], [0, 10, 20], [30, 10, 40])) const rail = sweep(Rectangle(4, 2), Helix(10, 40, 20))
// sweep (function)
export declare function sweep(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, path: Edge | Wire | ShapeList<Edge>, options?: SweepOptions): Part | Shell;
//   profile: A sketch (holes allowed), a planar face or a closed wire
//   path: An edge, or a wire of connected edges

// Turn a face or sheet into a solid of `thickness`
// thicken (function)
export declare function thicken(surface: Shell | Face, thickness: number): Part;

// Bend a part around an axis by `angle` degrees, like a bar bent over a mandrel
// Remarks: `plane` sets the bend: its `xDir` runs along the part, a positive `angle` bends the part toward `yDir`, and the bend axis is parallel to the plane normal. The layer of the part through `plane.origin` (spanned by `xDir` and the normal) is the neutral layer: it keeps its length; material on the inside of the bend is compressed, material on the outside stretched. With the default `Plane.XZ`, a part lying along X bends up (toward +Z) about an axis parallel to Y.
// bend (function)
export declare function bend(shape: Part, angle: number, options?: BendOptions): Part;
export declare function bend(shape: Shell, angle: number, options?: BendOptions): Shell;
//   shape: A Part (or a Shell)
//   angle: How far the part turns, in degrees (positive
//   options: `radius`

// Taper a part along an axis
// Remarks: The cross-sections are scaled toward the axis by a factor that changes evenly from 1 at `start` to `scale` at `end`.
// taper (function)
export declare function taper(shape: Part, scale: number, options?: TaperOptions): Part;
export declare function taper(shape: Shell, scale: number, options?: TaperOptions): Shell;
//   shape: A Part (or a Shell)
//   scale: Size of the cross-section at `end` relative to `start` (> 0)
//   options: `axis`

// Twist a part about an axis by `angle` degrees over its length (or from `start` to `end`)
// Remarks: Every cross-section turns by an angle that grows evenly from 0 at `start` to `angle` at `end`.
// twist (function)
export declare function twist(shape: Part, angle: number, options?: TwistOptions): Part;
export declare function twist(shape: Shell, angle: number, options?: TwistOptions): Shell;
//   shape: A Part (or a Shell)
//   angle: The turn in degrees between `start` and `end`, counterclockwise seen from the tip of `axis` (right-hand rule, like `rotate`)
//   options: `axis`

// The ruled surface between two curves (straight lines join matching points)
// ruled (function)
export declare function ruled(a: Edge | Wire, b: Edge | Wire): Shell;

// Sew faces and sheets along their common edges
// Remarks: Returns a Part when the result encloses a volume, otherwise a Shell. `tolerance` is the largest gap to close (default: 1e-4 of the model size).
// stitch (function)
export declare function stitch(...args: (Shell | Face | Part | Iterable<unknown> | {
    tolerance?: number | null;
})[]): Part | Shell;

// A freeform NURBS surface through a grid of points, or fitted to a cloud of points
// surface (function)
export declare function surface(points: readonly (readonly VectorLike[])[] | readonly VectorLike[], options?: {
    interpolate?: boolean;
    controls?: number | readonly [number, number] | null;
    smoothing?: number;
}): Shell;
//   points: Rows of points, `points[i][j]` (a grid
//   options: `interpolate` (grids)

// A round blend between the surfaces of two faces, as a sheet
// surfaceFillet (function)
export declare function surfaceFillet(a: Face | Shell, b: Face | Shell, radius: number, options?: {
    sides?: readonly [number, number];
}): Shell;
//   a: The first face (or a sheet of one face)
//   b: The second face
//   radius: The radius of the blend
//   options: `sides`

// Length of the flat strip that a bend takes
// Remarks: `angle` is the bend angle in degrees (90 for an L), `radius` the inside radius.
// bendAllowance (function)
export declare function bendAllowance(angle: number, options: BendAllowanceOptions): number;

// What a bend takes off the sum of the outside leg lengths
// bendDeduction (function)
export declare function bendDeduction(angle: number, options: BendAllowanceOptions): number;

// Length of the flat blank for a strip bent into `legs`
// Remarks: The legs are outside lengths: from the free end, or from the virtual sharp where the outer faces of two legs meet, to the next virtual sharp (the dimensions on a drawing of the part). `angle` is the angle of every bend, or one angle per bend (`legs.length - 1` of them). The result is `sum(legs) - sum(bend deductions)`.
// developedLength (function)
export declare function developedLength(...args: [...legs: number[], options: DevelopedLengthOptions]): number;

// Add a flange along a straight edge of a sheet
// Remarks: The sheet is extended beyond the edge and bent there: the bend starts at the edge (the sheet keeps its size), its inside radius is `radius`.
// flange (function)
export declare function flange(part: Part, edge: Edge | ShapeList<Edge>, length: number, options: FlangeOptions): Part;
//   part: A sheet (a plate, or a part with bends or flanges)
//   edge: A straight edge where a top or bottom face of the sheet meets a side face (an outer edge, such as `plate.edges().filterBy(Y).top().right()`)
//   length: Outside length of the flange
//   options: `angle` (the bend angle in degrees, below 180, default 90

// The flat pattern of a sheet metal part, laid on the XY plane (see `FlatPattern`)
// Remarks: The part is unfolded with `fixed` (default: the largest planar face) staying in place; that face is the bottom of the flat (z = 0) and bends are "up" when the far side of the sheet folds towards +Z. The longer side of the smallest rectangle around the blank runs along X, and the bounding box starts at the origin.
// flatPattern (function)
export declare function flatPattern(part: Part, options?: UnfoldOptions): FlatPattern;

// Fold a sheet along a line
// fold (function)
export declare function fold(part: Part, line: Axis | Edge, angle: number, options: FoldOptions): Part;
//   part: A sheet
//   line: The bend line, an `Axis` or a straight `Edge` lying on the top or bottom face of the sheet
//   angle: Bend angle in degrees, up to 180
//   options: `radius` (the inside bend radius), `kFactor` (the position of the neutral fiber, 0 inside to 1 outside), `fixed` (a point, or a face, edge or vertex, on the side of the line that stays in place

// Unfold a sheet metal part
// Remarks: The face `fixed` (default: the largest planar face) stays where it is; the rest of the sheet unfolds into its plane. With the K-factor the part was bent with, the result is the blank it was bent from. For the flat pattern on the XY plane, with outline and bend lines, use `flatPattern`.
// unfold (function)
export declare function unfold(part: Part, options?: UnfoldOptions): Part;

// Write shapes to `path`
// exportFile (function)
export declare function exportFile(shapes: unknown, path: string, options?: Record<string, Any>): void;

// Binary glTF export with colors, names and (optionally) the B-rep edges as lines
// Remarks: glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
// exportGlb (function)
export declare function exportGlb(shapes: unknown, path: string, options?: GltfOptions): void;

// glTF export with the buffer embedded as a data URI (in meters, like `exportGlb`)
// exportGltf (function)
export declare function exportGltf(shapes: unknown, path: string, options?: GltfOptions): void;

// Wavefront OBJ export (one object per part)
// exportObj (function)
export declare function exportObj(shapes: unknown, path: string, options?: MeshOptions): void;

// Exact B-rep export to STEP AP214
// exportStep (function)
export declare function exportStep(shapes: unknown, path: string, options?: StepExportOptions): void;

// Triangle mesh export to an STL file (binary unless `ascii`)
// exportStl (function)
export declare function exportStl(shapes: unknown, path: string, options?: MeshOptions & {
    ascii?: boolean;
}): void;

// Read an STL file (binary or ASCII) as a mesh
// importStl (function)
export declare function importStl(path: string): Mesh;

// Read a file, picking the format from the extension
// Remarks: A STEP file with one body gives that part, one with several a `ShapeList`. A native file that encloses no volume comes back as a `Shell`.
// load (function)
export declare function load(path: string): Any;

// Write a body to SMLib's native `.smb` format (exact and lossless)
// save (function)
export declare function save(shapes: unknown, path: string, options?: {
    ascii?: boolean;
}): void;

// The body of an SMLib native `.smb` file's contents
// fromSmb (function)
export declare function fromSmb(data: string | Uint8Array): Part | Shell;

// The contents of an SMLib native `.smb` file of one body (exact and lossless
// toSmb (function)
export declare function toSmb(shapes: unknown, options?: {
    ascii?: boolean;
}): Uint8Array;

// A mesh from the contents of an STL file (binary or ASCII
// fromStl (function)
export declare function fromStl(data: string | Uint8Array): Mesh;

// Binary glTF (GLB) of the shapes, with colors, names and (optionally) the B-rep edges as lines
// Remarks: glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
// toGlb (function)
export declare function toGlb(shapes: unknown, options?: GltfOptions): Uint8Array;

// glTF JSON of the shapes with the buffer embedded as a data URI (in meters, like `toGlb`)
// toGltf (function)
export declare function toGltf(shapes: unknown, options?: GltfOptions): string;

// Wavefront OBJ text of the shapes (one object per part)
// toObj (function)
export declare function toObj(shapes: unknown, options?: MeshOptions): string;

// The text of a STEP AP214 file of the shapes (see `exportStep`)
// toStep (function)
export declare function toStep(shapes: unknown, options?: StepExportOptions): string;

// A triangle mesh in STL (binary unless `ascii`)
// toStl (function)
export declare function toStl(shapes: unknown, options?: MeshOptions & {
    ascii?: boolean;
}): Uint8Array;

// Read the solids and surfaces of STEP file contents (AP203, AP214, AP242 B-rep data)
// Remarks: Returns a single `Part` (or `Shell`) when the file holds one body, otherwise a `ShapeList` of them. Lengths are converted to millimeters; assembly placements are applied; names and colors are kept. `heal` repairs bodies that come out invalid (valid ones are left alone; default true).
// fromStep (function)
export declare function fromStep(data: string | Uint8Array, options?: {
    heal?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;

// Read everything STEP file contents hold that smlibwasm can use (the text, or the bytes of the file)
// Remarks: `readStep` for the contents in memory (in the browser too); see `readStep`.
// fromStepModel (function)
export declare function fromStepModel(data: string | Uint8Array, options?: {
    heal?: boolean;
}): StepModel;

// Read the solids and surfaces of a STEP file (AP203, AP214, AP242 B-rep data)
// Remarks: Returns a single `Part` (or `Shell`) when the file holds one body, otherwise a `ShapeList` of them. Lengths are converted to millimeters; assembly placements are applied; names and colors are kept. `heal` repairs bodies that come out invalid (valid ones are left alone; default true).
// importStep (function)
export declare function importStep(path: string, options?: {
    heal?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;

// Read everything a STEP file holds that smlibwasm can use
// Remarks: The bodies are those of `importStep`, as a `ShapeList` also when there is one. Coordinate systems are the placements of supplemental geometry (as NX, CATIA and tool catalogs write `MCS`, `PCS` or `CSW`) and the named placements of shape representations; curves and points are the wireframe geometry (contours such as a tool's cutting edge line, curve sets, reference points). Each carries its name and the product it belongs to, at its place in the assembly, in millimeters. Items on hidden layers are left out. A file with no bodies gives an empty `bodies`. `heal` as for `importStep` (default true).
// readStep (function)
export declare function readStep(path: string, options?: {
    heal?: boolean;
}): StepModel;

// Write sketches, faces, wires and edges to a DXF drawing (AutoCAD 2000, AC1015) at `path` (Node)
// exportDxf (function)
export declare function exportDxf(shapes: unknown, path: string, options?: DxfWriteOptions): void;

// `importDxf` of a drawing in memory
// fromDxf (function)
export declare function fromDxf(data: string | Uint8Array, options?: DxfReadOptions): Sketch;

// `importDxfWires` of a drawing in memory
// fromDxfWires (function)
export declare function fromDxfWires(data: string | Uint8Array, options?: DxfReadOptions): ShapeList<Wire>;

// Read the outlines of a DXF drawing (an ASCII DXF file's path
// Remarks: Lines, arcs, circles, ellipses, polylines (bulges become exact arcs), splines (exact NURBS) and inserted blocks are joined end to end into closed loops. Loops nest by the even-odd rule: a loop inside a loop is a hole, a loop inside a hole an island. The result keeps the drawing's coordinates, converted to millimeters. Throws ModelingError for curves that do not close into loops (with their ends and layers), or outlines that branch.
// importDxf (function)
export declare function importDxf(path: string, options?: DxfReadOptions): Sketch;

// Every chain of curves of a DXF drawing (a path
// Remarks: The curves are read and joined like in `importDxf`; chains also stop where three or more curve ends meet. Closed chains come first, then open ones, each in drawing order.
// importDxfWires (function)
export declare function importDxfWires(path: string, options?: DxfReadOptions): ShapeList<Wire>;

// Sketches, faces, wires and edges as the text of a DXF drawing (AutoCAD 2000, AC1015)
// Remarks: Every curve is written exactly: LINE, ARC, CIRCLE, ELLIPSE, or SPLINE with the kernel's control points, knots and weights. Circular B-splines (the edges of sections) are written as ARC and CIRCLE, straight ones as LINE. A shape's name becomes its layer. `shapes` is a `Sketch`, `Face`, `Wire`, `Edge` or an array of them.
// toDxf (function)
export declare function toDxf(shapes: unknown, options?: DxfWriteOptions): string;

// Write parts, sheets and meshes to a USD file (.usda, or .usd as text)
// exportUsd (function)
export declare function exportUsd(shapes: unknown, path: string, options?: UsdExportOptions): void;
