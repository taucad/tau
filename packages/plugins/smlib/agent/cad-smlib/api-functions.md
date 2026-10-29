# @classcad/smlibwasm — Functions

78 top-level symbols. Signatures are verbatim typescript.

// A translation
// Pos (function)
export declare function Pos(x?: number | VectorLike | XYZ, y?: number, z?: number): Location;

// A rotation in degrees about the world X, then Y, then Z axis
// Rot (function)
export declare function Rot(x?: number | VectorLike | XYZ, y?: number, z?: number): Location;

// One mesh per face of a part, shell or sketch (in `shape.faces()` order), cut from one tessellation of the whole body
// faceMeshes (function)
export declare function faceMeshes(shape: Shape | ShapeList<Shape>, tolerance?: number | null, angle?: number): Mesh[];

// Triangulate a shape
// tessellate (function)
export declare function tessellate(shape: Shape | Iterable<Shape>, tolerance?: number | null, angle?: number, options?: {
    maxEdge?: number | null;
}): Mesh;
//   shape: A part, sketch, shell or face (or a list of them)
//   tolerance: Maximum distance between mesh and exact surface
//   angle: Maximum angle (degrees) between neighbouring triangle normals on curved faces
//   options: `maxEdge`

// A Bézier curve (rational if `weights` are given) from its control points
// Bezier (function)
export declare function Bezier(...args: (VectorLike | readonly VectorLike[] | {
    weights?: readonly number[] | null;
})[]): Edge;

// An arc around `center` starting at `startAngle` and spanning `arcSize` degrees (angles counterclockwise from the plane's X axis
// Remarks: `center` is given in plane coordinates.
// CenterArc (function)
export declare function CenterArc(center: VectorLike, radius: number, startAngle: number, arcSize: number, plane?: Plane): Edge;

// A conic arc from `start` to `end`, tangent there to the lines toward `apex` (the point where the end tangents meet), with the fullness `rho` (0 < rho < 1)
// Remarks: `ConicArc([0, 0], [10, 0], [10, 10], 0.4142)` is nearly the quarter circle of radius 10 (exactly for rho = sqrt(2) - 1).
// ConicArc (function)
export declare function ConicArc(start: VectorLike, apex: VectorLike, end: VectorLike, rho?: number): Edge;

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
// Remarks: `direction` is a vector or an axis (only its direction counts; `center` places the helix). `endRadius` makes a conical helix; `pitch` is the rise per turn. Any number of turns: beyond 120 the helix is fitted in pieces of whole turns, joined into one curve.
// Helix (function)
export declare function Helix(pitch: number, height: number, radius: number, options?: {
    center?: VectorLike;
    direction?: Axis | VectorLike;
    endRadius?: number | null;
    leftHanded?: boolean;
}): Edge;

// A piece of the hyperbola `x²/xRadius² - y²/yRadius² = 1`, the branch on the +X side of `center` (in plane coordinates), from `y = start` to `y = end` (measured from the center along the plane's Y axis)
// Remarks: `HyperbolicArc([0, 0], 10, 20, -30, 30)` revolved about the Y axis is a cooling tower with a waist of radius 10.
// HyperbolicArc (function)
export declare function HyperbolicArc(center: VectorLike, xRadius: number, yRadius: number, start: number, end: number, plane?: Plane): Edge;

// A straight edge from `start` to `end`
// Line (function)
export declare function Line(start: VectorLike, end: VectorLike): Edge;

// A piece of the parabola `y = x² / (4 focalLength)`
// Remarks: `ParabolicArc([0, 0], 10, -20, 20)` runs from (-20, 10) through (0, 0) to (20, 10); its focus is at (0, 10).
// ParabolicArc (function)
export declare function ParabolicArc(vertex: VectorLike, focalLength: number, start: number, end: number, plane?: Plane): Edge;

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

// A flat (Archimedean) spiral around the plane's origin
// Remarks: `Spiral(2, 20, 5)` runs from (2, 0) to (20, 0) in five turns, 9/5 = 3.6 apart.
// Spiral (function)
export declare function Spiral(startRadius: number, endRadius: number, turns: number, plane?: Plane, options?: {
    clockwise?: boolean;
}): Edge;

// A smooth cubic curve through the points
// Remarks: Options: `tangents`, the `[start, end]` tangent directions (either may be null), or one direction for every point (an array as long as the points: the curve passes through each point in its direction); `closed` makes a closed loop (smooth at the join).
// Spline (function)
export declare function Spline(...args: (VectorLike | readonly VectorLike[] | {
    tangents?: readonly (VectorLike | null)[] | null;
    closed?: boolean;
})[]): Edge;

// An arc from `start` to `end` leaving `start` along `tangent`
// TangentArc (function)
export declare function TangentArc(start: VectorLike, end: VectorLike, tangent: VectorLike): Edge;

// The circular arc from `start` through `through` to `end`
// ThreePointArc (function)
export declare function ThreePointArc(start: VectorLike, through: VectorLike, end: VectorLike): Edge;

// A smooth curve near many points, with as few control points as keep it within `tolerance` of every one
// Remarks: A least-squares B-spline: it averages noise smaller than the tolerance out instead of following it, and takes more control points (spread evenly over the points) until every point is within the tolerance, measured to the nearest point of the curve. An open curve runs from the first point to the last; where the points run smoothly there and no tangent is given, it leaves them in the points' own direction. Below the points' noise it takes up to a control point per point, and where even that does not keep within the tolerance it throws a `ModelingError` with the distance it reached (`Spline` passes through every point). `points`: the points in order along the curve (2D points lie at z = 0). Options: `tolerance`, the largest distance from any point to the curve (default: 1/1000 of the size of the points); `degree`, the degree of the curve, 2 to 9; `tangents`, optional `[start, end]` directions, either may be null, or a direction at every point (as many as there are points, none null; a cubic curve then: the curve leaves each point near that direction, as the curve through the points along them, `Spline(...points, { tangents })`, does, simplified within the tolerance), not for closed curves; `closed`, a closed curve starting and ending near the first point (within the tolerance), as smooth there as elsewhere. Few points (fewer than six) give the curve through them (`Spline`). Where no fit keeps within the tolerance, a ModelingError gives the distance it reached. const outline = fitCurve(scanPoints, { tolerance: 0.02 })
// fitCurve (function)
export declare function fitCurve(points: Iterable<VectorLike>, options?: {
    tolerance?: number | null;
    degree?: number;
    tangents?: readonly [
        VectorLike | null,
        VectorLike | null
    ] | readonly VectorLike[] | null;
    closed?: boolean;
}): Edge;

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
export declare function Hull(...items: HullItem[]): Sketch;

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

// The region a pen `width` wide covers along a path
// Remarks: `ends`: "round" (half circles, the default) or "flat" (cut square at the end points). `corners`: how the outside of a bend is shaped, "round", "sharp" or "chamfer". A closed path makes a ring. The path stays where it is (in its plane).
// Stroke (function)
export declare function Stroke(path: Edge | Wire, width: number, options?: {
    ends?: 'round' | 'flat';
    corners?: 'round' | 'sharp' | 'chamfer';
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
// Remarks: `text` is the text; "\n" starts a new line. `size` is the height of the capital letters (H, E, T) in mm, the nominal height of technical lettering: `Text("H", 10)` is 10 mm tall. Round letters overshoot it by a few percent; descenders go below the baseline. Returns a `Sketch` on `Plane.XY`: one face per separate piece of a letter, counters as holes. Outlines are exact: straight segments are lines, curved runs are B-splines through the font's on-curve points. Throws a RangeError for an empty text, a size that is not positive, a character the font does not have, or a path the text does not fit on; a font that cannot be read throws a `FontError` (a RangeError).
// Text (function)
export declare function Text(text: string, size: number, options?: TextOptions): Sketch;

// The font `source`, read once and kept
// Remarks: A path that is no file throws an Error with `code` "ENOENT" (Python's FileNotFoundError).
// loadFont (function)
export declare function loadFont(source?: string | BytesLike | null): Font;

// A sector of a tube along Z
// AnnularSector (function)
export declare function AnnularSector(innerRadius: number, outerRadius: number, height: number, arcSize: number, options?: {
    align?: AlignLike;
}): Part;

// A box of `length` (X) by `width` (Y) by `height` (Z)
// Box (function)
export declare function Box(length: number, width: number, height: number, options?: {
    align?: AlignLike;
}): Part;

// A cone (or frustum) along Z
// Cone (function)
export declare function Cone(bottomRadius: number, topRadius: number, height: number, options?: {
    arcSize?: number;
    align?: AlignLike;
}): Part;

// A drilling tool with a counterbore at the top
// CounterBoreHole (function)
export declare function CounterBoreHole(radius: number, counterBoreRadius: number, counterBoreDepth: number, depth: number): Part;

// A drilling tool with a conical countersink of included `angle` at the top
// CounterSinkHole (function)
export declare function CounterSinkHole(radius: number, counterSinkRadius: number, depth: number, angle?: number): Part;

// A cylinder along Z
// Remarks: `arcSize` (degrees, at most 360) makes a sector: the part of the cylinder from the +X axis counter-clockwise about +Z (planes on its two sides). Like every primitive it is centered by its bounding box, so a sector's axis moves off Z; `align: null` keeps it on Z (the sector of the centered cylinder).
// Cylinder (function)
export declare function Cylinder(radius: number, height: number, options?: {
    arcSize?: number;
    align?: AlignLike;
}): Part;

// A drilling tool
// Hole (function)
export declare function Hole(radius: number, depth: number): Part;

// A pyramid
// Pyramid (function)
export declare function Pyramid(length: number, width: number, height: number, options?: {
    align?: AlignLike;
}): Part;

// A sphere, or a part of one
// Remarks: `arcSize1` and `arcSize2` are the latitudes (degrees, -90 at the bottom pole to 90 at the top) it reaches from and to: planes parallel to XY cut it there. `arcSize3` (at most 360) is the longitude it spans, from the +X axis counter-clockwise about +Z (planes through the Z axis on its sides). A part of a sphere is centered by its bounding box; `align: null` keeps the sphere's center at the origin.
// Sphere (function)
export declare function Sphere(radius: number, options?: {
    arcSize1?: number;
    arcSize2?: number;
    arcSize3?: number;
    align?: AlignLike;
}): Part;

// A torus around Z
// Remarks: `majorAngle` (degrees, at most 360) makes a sector of it, from the +X axis counter-clockwise about +Z, with round ends. `minorStartAngle` and `minorEndAngle` (degrees) keep the part of the tube's circle between them, as build123d does: measured in the tube's section from the side away from the axis (0) towards +Z (90), the section a slice of the circle from its center (cones, planes or cylinders where the slice's straight sides go round). A part of a torus is centered by its bounding box (`align: null` keeps the torus's center at the origin). const topHalf = Torus(20, 5, { minorStartAngle: 0, minorEndAngle: 180 }) const bead = Torus(20, 5, { minorStartAngle: -90, minorEndAngle: 90 }) // the outer half
// Torus (function)
export declare function Torus(majorRadius: number, minorRadius: number, options?: {
    minorStartAngle?: number;
    minorEndAngle?: number;
    majorAngle?: number;
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
export declare function chamfer(edges: EdgesLike, length: number, options?: ChamferOptions): Part;
export declare function chamfer(vertices: Vertex | readonly Vertex[], length: number): Sketch;
export declare function chamfer(edges: EdgesLike | Vertex | readonly Vertex[], length: number, options?: ChamferOptions): Part | Sketch;

// A body less others, Python's `a - b` (see `Part.cut`, `Shell.cut`, `Sketch.cut`)
// cut (function)
export declare function cut(shape: Sketch, ...others: (Sketch | Iterable<Sketch>)[]): Sketch;
export declare function cut(shape: Shell, ...others: (Part | Iterable<Part>)[]): Shell;
export declare function cut(shape: Part, ...others: (Part | Iterable<Part>)[]): Part;

// Tilt faces by a draft angle about a neutral plane (see `Part.draft`)
// draft (function)
export declare function draft(part: Part, faces: FacesLike, angle: number, neutralPlane: Plane | Face): Part;

// Extend a sheet or a face past its edges (options `sides`, `continuity`
// extend (function)
export declare function extend(shape: Edge, distance: number, options?: {
    end?: 'start' | 'end' | 'both';
    continuity?: 'G1' | 'G2' | 'natural';
}): Edge;
export declare function extend(shape: Shell | Face, distance: number, options?: {
    sides?: Edge | Iterable<Edge> | null;
    continuity?: 'natural' | 'G1' | 'G2';
}): Shell;

// Extrude a sketch, a planar face or a closed wire into a solid (see `Sketch.extrude`)
// Remarks: An open curve extrudes into a surface (a Shell), along `direction` (an axis or a vector) or the normal of the curve's plane; it takes no `taper` (RangeError).
// extrude (function)
export declare function extrude(profile: Sketch | Face | ShapeList<Sketch | Face>, amount: number, options?: ExtrudeFunctionOptions): Part;
export declare function extrude(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, amount: number, options?: ExtrudeFunctionOptions): Part | Shell;

// Round edges of the part they belong to (see `Part.fillet`), or corners of the sketch they belong to
// fillet (function)
export declare function fillet(edges: EdgesLike, radius: FilletRadius, options?: FilletOptions): Part;
export declare function fillet(vertices: Vertex | readonly Vertex[], radius: number): Sketch;
export declare function fillet(edges: EdgesLike | Vertex | readonly Vertex[], radius: FilletRadius, options?: FilletOptions): Part | Sketch;

// The surfaces of a fillet's rounds as untrimmed sheets, the part unchanged (see `Part.filletPreview`)
// filletPreview (function)
export declare function filletPreview(edges: EdgesLike, radius: number, options?: {
    propagate?: boolean;
}): ShapeList<Shell>;

// Press a region of a face onto a plane (see `Part.flatten`, `Shell.flatten`)
// flatten (function)
export declare function flatten(shape: Part, face: Face, region: RegionLike, plane: Plane | Face, options?: {
    continuity?: 'crease' | 'G1' | 'G2';
}): Part;
export declare function flatten(shape: Shell, face: Face, region: RegionLike, plane: Plane | Face, options?: {
    continuity?: 'crease' | 'G1' | 'G2';
}): Shell;

// Union of bodies, Python's `a + b` (see `Part.fuse`, `Shell.fuse`, `Sketch.fuse`)
// fuse (function)
export declare function fuse(shape: Sketch, ...others: (Sketch | Iterable<Sketch>)[]): Sketch;
export declare function fuse(shape: Shell, ...others: (Shell | Part | Face | Iterable<Shell | Part | Face>)[]): Shell;
export declare function fuse(shape: Part, ...others: (Part | Iterable<Part>)[]): Part;

// The part's faces split where a tool crosses them (see `Part.imprint`)
// imprint (function)
export declare function imprint(part: Part, tool: Part | Shell | Face | ShapeList<Face> | Edge | Wire | Iterable<Edge | Wire>, direction?: Axis | VectorLike | null, options?: {
    nearest?: boolean;
}): Part;

// What bodies share, Python's `a & b` (see `Part.intersect`, `Shell.intersect`, `Sketch.intersect`)
// intersect (function)
export declare function intersect(shape: Sketch, ...others: (Sketch | Iterable<Sketch>)[]): Sketch;
export declare function intersect(shape: Shell, ...others: (Part | Iterable<Part>)[]): Shell;
export declare function intersect(shape: Part, sheet: Shell | Face): Shell;
export declare function intersect(shape: Part, ...others: (Part | Iterable<Part>)[]): Part;

// The curves where a body meets another, a face or a plane (see `Part.intersectionCurves`)
// intersectionCurves (function)
export declare function intersectionCurves(shape: Part | Shell, other: Part | Shell | Face | Plane): ShapeList<Edge>;

// A solid through a sequence of cross sections, or a surface through open curves
// loft (function)
export declare function loft(sections: readonly (Sketch | Face | ShapeList<Sketch | Face>)[], options?: LoftOptions): Part;
export declare function loft(sections: readonly (Sketch | Face | Wire | Edge | ShapeList<Any>)[], options?: LoftOptions): Part | Shell;
//   sections: Two or more sections in order
//   options: `ruled`

// An edge of a sheet moved onto a curve (see `Shell.matchEdge`)
// matchEdge (function)
export declare function matchEdge(sheet: Shell, edge: Edge, target: Edge | Wire, options?: {
    extent?: number;
}): Shell;

// Parts as one part made of cells
// merge (function)
export declare function merge(...parts: (Part | Iterable<Part>)[]): Part;

// Two faces of a sheet that share a side made one (see `Shell.mergeFaces`)
// mergeFaces (function)
export declare function mergeFaces(sheet: Shell, a: Face, b: Face): Shell;

// A mirrored copy of a shape
// mirror (function)
export declare function mirror<S extends Shape>(shape: S, plane?: Plane | Face | Axis | ShapeList<Face>): S;

// Move faces by a vector or a location, the part rebuilt around them (see `Part.moveFaces`)
// moveFaces (function)
export declare function moveFaces(part: Part, faces: FacesLike, by: Location | VectorLike): Part;

// Grow or shrink a part or a sketch by `distance` (also the option `corners`
// offset (function)
export declare function offset(shape: Part, distance: number, options?: {
    corners?: 'sharp' | 'round';
}): Part;
export declare function offset(shape: Sketch, distance: number, options?: {
    corners?: 'round' | 'sharp' | 'chamfer';
}): Sketch;
export declare function offset(shape: Shell | Face, distance: number): Shell;
export declare function offset(shape: Wire, distance: number, options?: {
    corners?: 'round' | 'sharp' | 'chamfer';
    plane?: Plane | null;
}): Wire;
export declare function offset(shape: Edge, distance: number, options?: {
    plane?: Plane | null;
}): Edge;
export declare function offset(shape: Part | Sketch | Shell | Face | Wire | Edge, distance: number, options?: OffsetFunctionOptions): Part | Sketch | Shell | Wire | Edge;

// Offset faces along their normals, the part rebuilt around them (see `Part.offsetFaces`)
// offsetFaces (function)
export declare function offsetFaces(part: Part, faces: FacesLike, distance: number): Part;

// The lines of a view of a body, also its hidden ones (see `Part.outline`)
// outline (function)
export declare function outline(shape: Part | Shell, plane?: Plane, options?: {
    hidden?: false;
    tangentEdges?: boolean;
}): ShapeList<Edge>;
export declare function outline(shape: Part | Shell, plane: Plane | undefined, options: {
    hidden: true;
    tangentEdges?: boolean;
}): [
    ShapeList<Edge>,
    ShapeList<Edge>
];

// The parting lines of a part for a pull direction (see `Part.partingLine`)
// partingLine (function)
export declare function partingLine(part: Part, direction: Axis | VectorLike): ShapeList<Wire>;

// A curve projected onto a body along a direction (see `Part.project`), or onto a face along its normals (see `Face.project`)
// project (function)
export declare function project(shape: Face, curve: Edge | Wire): ShapeList<Edge>;
export declare function project(shape: Part | Shell, curve: Edge | Wire, direction?: Axis | VectorLike, options?: {
    nearest?: boolean;
}): ShapeList<Edge>;

// A smooth dent or bump in a face at a point (see `Part.push`, `Shell.push`)
// push (function)
export declare function push(shape: Part, face: Face, at: VectorLike, options?: PushOptions): Part;
export declare function push(shape: Shell, face: Face, at: VectorLike, options?: PushOptions): Shell;

// The part with a hole, a boss or a pocket taken out (see `Part.removeFaces`)
// removeFaces (function)
export declare function removeFaces(part: Part, faces: FacesLike, options?: {
    partial?: boolean;
}): Part;

// The part with fillets taken out and their edges sharp again (see `Part.removeFillets`)
// removeFillets (function)
export declare function removeFillets(part: Part, faces?: FacesLike | null, options?: {
    maxRadius?: number | null;
    partial?: boolean;
}): Part;
