# @classcad/smlibwasm — Functions (2)

60 top-level symbols. Signatures are verbatim typescript.

// Revolve a sketch about an axis into a solid (see `Sketch.revolve`)
// Remarks: An open curve revolves into a surface of revolution (a Shell).
// revolve (function)
export declare function revolve(profile: Sketch | Face | ShapeList<Sketch | Face>, axis?: Axis | null, angle?: number): Part;
export declare function revolve(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, axis?: Axis | null, angle?: number): Part | Shell;

// A scaled copy of a shape or a mesh, about `center` (see `Shape.scale`)
// scale (function)
export declare function scale<S extends Shape | Mesh>(shape: S, factor: number | VectorLike, center?: VectorLike): S;

// Cross-section of a part (see `Part.section`)
// section (function)
export declare function section(part: Part, plane?: Plane | Face): Sketch;

// Hollow out a part (see `Part.shell`)
// shell (function)
export declare function shell(part: Part, thickness: number, openings?: FacesLike | null, options?: {
    outward?: boolean;
    corners?: 'round' | 'sharp' | null;
    walls?: WallsLike | null;
}): Part;

// The contour of a body seen along a direction (see `Part.silhouette`)
// silhouette (function)
export declare function silhouette(shape: Part | Shell, direction?: Axis | VectorLike): ShapeList<Edge>;

// Sections of a part (sketches) or a mesh (wires) every `step` along an axis (see `Part.slices`, `Mesh.slices`)
// slices (function)
export declare function slices(shape: Part, step: number, axis?: Axis | VectorLike): Sketch[];
export declare function slices(shape: Mesh, step: number, axis?: Axis | VectorLike): ShapeList<Wire>[];

// Cut a part with a plane or along a sheet (see `Part.split`)
// split (function)
export declare function split(part: Part, plane: Plane | Face | Shell, keep: 'both'): [
    Part,
    Part
];
export declare function split(part: Part, plane: Plane | Face | Shell, keep?: 'above' | 'below'): Part;
export declare function split(part: Part, plane: Plane | Face | Shell, keep?: 'above' | 'below' | 'both'): Part | [
    Part,
    Part
];

// Sweep a profile along a path
// Remarks: The profile is moved so that the center of its box (along the axes of its plane) sits at the start of the path and (with `orient`) turned to face along the path, so profiles can be drawn anywhere, usually in the XY plane: const tube = sweep(Circle(2), Spline([0, 0, 0], [0, 10, 20], [30, 10, 40])) const rail = sweep(Rectangle(4, 2), Helix(10, 40, 20)) `anchor` puts another point of the profile on the path: `'origin'` (the origin of the sketch's plane) or a point of the profile's plane: const lip = sweep(Rectangle(4, 2, { align: [Align.MIN, Align.MIN] }), rim, { anchor: [0, 0] }) // its corner Edges of a path that meet tangentially are swept as one; at a corner of a path that is not planar, the profile goes on turned by the smallest rotation from one tangent to the next. Where the kernel cannot sweep an open path of several edges so, each edge is swept on its own, turned to its own start, and the pieces are fused (with a warning unless the profile is round: it turns where the edges meet). A closed path it cannot sweep so (the fuse where the halves of a loop closed with a kink cross) is swept in pieces, each turned from the path's start to its own, where that puts the profile on the path. Faces without area that a fuse leaves are taken out (or the sweep throws `ModelingError`). The corners of a planar path of several edges are mitered, the profile placed as on any other path; where they cannot be (arcs that meet at a corner), the path is swept piece by piece, with a warning. Along the path the profile turns as little as it can (a rotation-minimizing frame: on a planar path it keeps its attitude to the plane), except along a helix (also a conical one), where it keeps its attitude to the helix's axis, as a thread or a flat spring wire does. `up` and `twist` set the attitude instead: const rail = sweep(Rectangle(4, 2), path, { up: Z }) // stays upright: its angle to Z kept const bar = sweep(Rectangle(10, 2), Line([0, 0, 0], [0, 0, 100]), { twist: 180 }) // a half turn `scale` grows or shrinks the profile along the path, about the point that sits on it: const horn = sweep(Circle(2), Spline([0, 0, 0], [0, 10, 20], [30, 10, 40]), { scale: [1, 3] }) const spring = sweep(Circle(1), Helix(8, 40, 15), { scale: [[0, 1], [0.5, 1.5], [1, 1]] }) A single line or arc is swept as an extrusion or a revolve (planes, cylinders, cones, spheres and tori, not B-spline surfaces); a profile that reaches across the axis of an arc throws `ModelingError` (it would sweep through itself).
// sweep (function)
export declare function sweep(profile: Sketch | Face | ShapeList<Sketch | Face>, path: Edge | Wire | ShapeList<Edge>, options?: SweepOptions): Part;
export declare function sweep(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, path: Edge | Wire | ShapeList<Edge>, options?: SweepOptions): Part | Shell;
//   profile: A sketch (holes allowed), a planar face or a closed wire
//   path: An edge, or a wire of connected edges

// Swing a profile around an outline
// Remarks: At each height the section is the outline scaled about the Z axis so that it passes through the profile's point on the +X side: the cut of the result by the XZ plane on the +X side is the profile. A circle around the origin gives the revolve. The faces are exact (NURBS products of the two curves).
// swing (function)
export declare function swing(profile: Sketch | Face, outline: Sketch | Face | Wire | Edge | ShapeList<Any>): Part;
export declare function swing(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, outline: Sketch | Face | Wire | Edge | ShapeList<Any>): Part | Shell;
//   profile: Drawn as for a lathe (see `revolve`)
//   outline: A closed curve around the Z axis in a plane parallel to XY (its height does not matter), such as `Ellipse(30, 20)` or a `RoundedRectangle`

// Turn a face or sheet into a solid of `thickness` (`both`
// thicken (function)
export declare function thicken(surface: Shell | Face, thickness: number, options?: {
    both?: boolean;
}): Part;

// Trim a sheet with curves on it, keeping a side (`trim(sheet, curves, keep)`
// trim (function)
export declare function trim(shape: Shell, curves: Edge | Wire | Iterable<Edge | Wire>, keep: VectorLike | string): Shell;
export declare function trim(shape: Edge, start: number | VectorLike | Vertex, end: number | VectorLike | Vertex): Edge;
export declare function trim(shape: Wire, start: number | VectorLike | Vertex, end: number | VectorLike | Vertex): Wire;

// Raise or sink a region of a face (see `Part.warp`, `Shell.warp`)
// warp (function)
export declare function warp(shape: Part, face: Face, region: RegionLike, by: number | VectorLike, options?: {
    continuity?: 'crease' | 'G1' | 'G2';
}): Part;
export declare function warp(shape: Shell, face: Face, region: RegionLike, by: number | VectorLike, options?: {
    continuity?: 'crease' | 'G1' | 'G2';
}): Shell;

// The region in exactly one of the sketches, Python's `a ^ b` (see `Sketch.xor`)
// xor (function)
export declare function xor(sketch: Sketch, ...others: (Sketch | Iterable<Sketch>)[]): Sketch;

// Sets GUARD_BOOLEANS (Python's `smlibpy.defeature.GUARD_BOOLEANS = on`)
// setGuardBooleans (function)
export declare function setGuardBooleans(on: boolean): boolean;

// Sets GUARD_SECONDS (Python's `smlibpy.defeature.GUARD_SECONDS = seconds`)
// setGuardSeconds (function)
export declare function setGuardSeconds(seconds: number): number;

// Bend a part around an axis by `angle` degrees, like a bar bent over a mandrel
// Remarks: `plane` sets the bend: its `xDir` runs along the part, a positive `angle` bends the part toward `yDir`, and the bend axis is parallel to the plane normal. The layer of the part through `plane.origin` (spanned by `xDir` and the normal) is the neutral layer: it keeps its length; material on the inside of the bend is compressed, material on the outside stretched. With the default `Plane.XZ`, a part lying along X bends up (toward +Z) about an axis parallel to Y.
// bend (function)
export declare function bend(shape: Part, angle: number, options?: BendOptions): Part;
export declare function bend(shape: Shell, angle: number, options?: BendOptions): Shell;
export declare function bend(shape: Edge, angle: number, options?: BendOptions): Edge;
export declare function bend(shape: Wire, angle: number, options?: BendOptions): Wire;
export declare function bend(shape: VectorLike, angle: number, options?: BendOptions): Vector;
export declare function bend(shape: readonly VectorLike[], angle: number, options?: BendOptions): Vector[];
//   shape: A Part (or a Shell), an Edge, a Wire, or points (a point or an array of them)
//   angle: How far the part turns, in degrees (positive
//   options: `radius`

// Deform a part, a sheet, a curve or points with a lattice
// deform (function)
export declare function deform(shape: Part, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Part;
export declare function deform(shape: Shell, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Shell;
export declare function deform(shape: Edge, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Edge;
export declare function deform(shape: Wire, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Wire;
export declare function deform(shape: VectorLike, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Vector;
export declare function deform(shape: readonly VectorLike[], lattice: Lattice, options?: {
    tolerance?: number | null;
}): Vector[];

// Taper a part along an axis
// Remarks: The cross-sections are scaled toward the axis by a factor that changes evenly from 1 at `start` to `scale` at `end`.
// taper (function)
export declare function taper(shape: Part, scale: number, options?: TaperOptions): Part;
export declare function taper(shape: Shell, scale: number, options?: TaperOptions): Shell;
export declare function taper(shape: Edge, scale: number, options?: TaperOptions): Edge;
export declare function taper(shape: Wire, scale: number, options?: TaperOptions): Wire;
export declare function taper(shape: VectorLike, scale: number, options?: TaperOptions): Vector;
export declare function taper(shape: readonly VectorLike[], scale: number, options?: TaperOptions): Vector[];
//   shape: A Part (or a Shell), an Edge, a Wire, or points (a point or an array of them)
//   scale: Size of the cross-section at `end` relative to `start` (> 0)
//   options: `axis`

// Twist a part about an axis by `angle` degrees over its length (or from `start` to `end`)
// Remarks: Every cross-section turns by an angle that grows evenly from 0 at `start` to `angle` at `end`. A cylinder, cone, sphere or torus about the axis maps onto itself and stays as it was (a twisted tube's walls are its cylinders).
// twist (function)
export declare function twist(shape: Part, angle: number, options?: TwistOptions): Part;
export declare function twist(shape: Shell, angle: number, options?: TwistOptions): Shell;
export declare function twist(shape: Edge, angle: number, options?: TwistOptions): Edge;
export declare function twist(shape: Wire, angle: number, options?: TwistOptions): Wire;
export declare function twist(shape: VectorLike, angle: number, options?: TwistOptions): Vector;
export declare function twist(shape: readonly VectorLike[], angle: number, options?: TwistOptions): Vector[];
//   shape: A Part (or a Shell), an Edge, a Wire, or points (a point or an array of them)
//   angle: The turn in degrees between `start` and `end`, counterclockwise seen from the tip of `axis` (right-hand rule, like `rotate`)
//   options: `axis`

// Unroll a part wrapped around an axis into a flat one
// Remarks: A point at distance `r` from the axis and at the angle `a` (radians) about it from `start` goes to distance `r` from the axis along `start` and `radius * a` across: the layer at `radius` (the neutral layer) keeps its length, material inside it gets longer and outside it shorter. A rolled sheet (a ring segment of inside radius `R` and thickness `t`) unrolls into a flat plate; as sheet metal, with `radius = R + kFactor * t` (`unfold` does that, also for rolled parts). Cylinders about the axis become planes, circles about it lines; the faces are exact where their image is a plane, cone, cylinder, line or circle, and within `tolerance` elsewhere.
// unroll (function)
export declare function unroll(shape: Part, options: UnrollOptions): Part;
export declare function unroll(shape: Shell, options: UnrollOptions): Shell;
export declare function unroll(shape: Edge, options: UnrollOptions): Edge;
export declare function unroll(shape: Wire, options: UnrollOptions): Wire;
export declare function unroll(shape: VectorLike, options: UnrollOptions): Vector;
export declare function unroll(shape: readonly VectorLike[], options: UnrollOptions): Vector[];
//   shape: A Part (or a Shell), an Edge, a Wire or points around the axis
//   options: `radius`

// A smooth bridge between free edges of two sheets
// blend (function)
export declare function blend(edgeA: Edge, edgeB: Edge, options?: {
    continuity?: 'G1' | 'G2' | 'G3' | number;
    tension?: number | readonly [
        number,
        number
    ];
    join?: boolean;
}): Shell;
//   edgeA: An edge on the border of a sheet (one face uses it), such as `sheet.edges().filter((e) => e.faces().length === 1)`
//   edgeB: An edge on the border of another sheet (or of the same one)
//   options: `continuity`

// A surface that fills a closed loop of curves
// Throws: RangeError The curves do not close into one loop (the message names the gap), or some curves are edges of sheets and others not while `tangent` is true.
// Throws: ModelingError The patch misses its curves, meets a sheet at an angle, or folds back over the sheets.
// fill (function)
export declare function fill(boundary: Edge | Wire | Iterable<Edge | Wire>, options?: {
    tangent?: boolean;
}): Shell;
//   boundary: The curves around the hole, in any order and direction
//   options: `tangent`

// A surface through a network of curves
// Throws: RangeError Curves that do not cross (within 1e-4 of the network's size), that cross out of order, or that run on past the outer curves of the other set.
// Throws: ModelingError The surface misses a curve by more than 1e-4 of the network's size (a very uneven network: curves of more even spacing, or more of them, help).
// network (function)
export declare function network(u: Iterable<Edge | Wire>, v: Iterable<Edge | Wire>): Shell;
//   u: Two or more curves running one way, in any order and direction (splines, arcs, edges
//   v: Two or more curves running across them

// A surface from its NURBS data
// nurbsSurface (function)
export declare function nurbsSurface(points: readonly (readonly VectorLike[])[] | NurbsSurfaceData, knots?: readonly [
    readonly number[],
    readonly number[]
] | null, degrees?: number | readonly [
    number,
    number
] | null, weights?: readonly (readonly number[])[] | null): Shell;
//   points: The control points in rows, `points[i][j]` the point `i` along u and `j` along v (all rows the same length, at least `degree + 1` each way)
//   knots: The knot vectors `[uKnots, vKnots]`, every knot as often as its multiplicity
//   degrees: The degrees `[u, v]` (1 to 32), or one for both
//   weights: A positive weight per control point, in the same rows

// The ruled surface between two curves (straight lines join matching points)
// ruled (function)
export declare function ruled(a: Edge | Wire, b: Edge | Wire): Shell;

// Sew faces and sheets along their common edges
// stitch (function)
export declare function stitch(...args: [
    ...StitchPiece[],
    StitchOptions & {
        report: true;
    }
]): [
    Part | Shell,
    StitchReport
];
export declare function stitch(...args: (StitchPiece | StitchOptions)[]): Part | Shell;
//   args: Faces, sheets, sketches or parts, and arrays of them

// A freeform NURBS surface through a grid of points, or fitted to a cloud of points
// surface (function)
export declare function surface(points: readonly (readonly VectorLike[])[] | readonly VectorLike[], options: SurfaceOptions & {
    report: true;
}): [
    Shell,
    FitReport
];
export declare function surface(points: readonly (readonly VectorLike[])[] | readonly VectorLike[], options?: SurfaceOptions): Shell;
//   points: Rows of points, `points[i][j]` (a grid
//   options: `interpolate` (grids)

// A round blend between the surfaces of two faces, as a sheet
// surfaceFillet (function)
export declare function surfaceFillet(a: Face | Shell, b: Face | Shell, radius: number, options?: {
    radius2?: number | null;
    shape?: 'round' | 'chamfer';
    sides?: readonly [
        number,
        number
    ];
    trim?: boolean;
}): Shell;
//   a: The first face (or a sheet of one face)
//   b: The second face
//   radius: The radius of the blend
//   options: `radius2`

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
export declare function developedLength(...args: [
    ...legs: number[],
    options: DevelopedLengthOptions
]): number;

// Add a flange along a straight edge of a sheet
// Remarks: The sheet is extended beyond the edge and bent there: the bend starts at the edge (the sheet keeps its size), its inside radius is `radius`.
// flange (function)
export declare function flange(part: Part, edge: Edge | ShapeList<Edge>, length: number, options: FlangeOptions): Part;
//   part: A sheet (a plate, or a part with bends or flanges)
//   edge: A straight edge where a top or bottom face of the sheet meets a side face (an outer edge, such as `plate.edges().filterBy(Y).top().right()`)
//   length: Outside length of the flange
//   options: `angle` (the bend angle in degrees, below 180, default 90

// The flat pattern of a sheet metal part, laid on the XY plane (see `FlatPattern`)
// Remarks: `kFactor` as for `unfold`: by default each bend's own (from `fold` and `flange`), else `K_FACTOR`. The part is unfolded with `fixed` (default: the largest planar face) staying in place; that face is the bottom of the flat (z = 0) and bends are "up" when the far side of the sheet folds towards +Z. The longer side of the smallest rectangle around the blank runs along X, and the bounding box starts at the origin.
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
// Remarks: The face `fixed` (default: the largest planar face) stays where it is; the rest of the sheet unfolds into its plane. With the K-factor the part was bent with, the result is the blank it was bent from: by default each bend takes the K-factor `fold` or `flange` made it with (else `K_FACTOR`, 0.44, as for an imported part). `kFactor` gives other ones: one number for every bend, a function `(radius, thickness, angle) => k`, a mapping from inside radius to K-factor (`{ 1: 0.33, 6: 0.45 }`), `[r / t, k]` pairs to interpolate (a shop's table), or `'din6935'` (see `KFactor`). For the flat pattern on the XY plane, with outline and bend lines, use `flatPattern`. Rolled parts (one bend, no flat sheet: a ring segment), bends at a free end of the sheet (a curl) and bends over 180 degrees unroll at the neutral radius `radius + kFactor * thickness`; a rolled part about the middle of its bend (`fixed` is refused there).
// unfold (function)
export declare function unfold(part: Part, options?: UnfoldOptions): Part;

// Write shapes to `path`
// exportFile (function)
export declare function exportFile(shapes: FileItemsLike, path: string, options?: FileOptions): void;

// Binary glTF export with colors, names and (optionally) the B-rep edges as lines
// Remarks: glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
// exportGlb (function)
export declare function exportGlb(shapes: ShapesLike, path: string, options?: GltfOptions): void;

// glTF export with the buffer embedded as a data URI (in meters, like `exportGlb`)
// exportGltf (function)
export declare function exportGltf(shapes: ShapesLike, path: string, options?: GltfOptions): void;

// Wavefront OBJ export (one object per part
// exportObj (function)
export declare function exportObj(shapes: ShapesLike, path: string, options?: MeshOptions): void;

// Exact B-rep export to STEP AP214
// Remarks: The bodies go into one product called `name` (default: the file's name), or, with `assembly: true`, each into a product of its own, named as the body, in an assembly called `name`: other CAD systems then list the parts by name. A body listed more than once is written once and used at each place. Edges and wires are written as wireframe curves, vertices and Vectors as points, Planes as coordinate systems (supplemental geometry), each unnamed; `StepCurve`, `StepPoint` and `StepFrame` give them names and colors, and a `StepModel` (from `readStep`) is written whole. `readStep` reads them back.
// exportStep (function)
export declare function exportStep(shapes: StepItemsLike, path: string, options?: StepExportOptions): void;

// Triangle mesh export to an STL file (binary unless `ascii`)
// exportStl (function)
export declare function exportStl(shapes: ShapesLike, path: string, options?: MeshOptions & {
    ascii?: boolean;
}): void;

// Read a file's contents in memory, picking the format from the file's name, as `load` does from a path
// Remarks: A STEP file with one body gives that part, one with several a `ShapeList`. A native file comes back as a `Part` when its body encloses a volume, as a `Shell` when it does not. The layers a USD file names (subLayers, references, payloads) are not read: `fromUsd` reads them with its `resolve` option.
// fromFile (function)
export declare function fromFile(data: string | BytesLike, name: string): Part | Shell | Sketch | Mesh | ShapeList<Part | Shell> | Shape | ShapeList<Shape>;

// Read an STL file (binary or ASCII) as a mesh
// importStl (function)
export declare function importStl(path: string): Mesh;

// Read a file, picking the format from the extension
// Remarks: A STEP or IGES file with one body gives that part, one with several a `ShapeList`. A native file comes back as a `Part` when its body encloses a volume (a merged part with its cells too, and a broken solid, whose `isValid()` is false), as a `Shell` when it does not; a part file (`.smp`) with its names, colors and curves (see `fromSmp`). A body that also holds wire edges, points or faces outside its solid comes with a warning.
// load (function)
export declare function load(path: string): Part | Shell | Sketch | Mesh | ShapeList<Part | Shell> | Shape | ShapeList<Shape>;

// Write shapes to SMLib's native files (exact)
// save (function)
export declare function save(shapes: ShapesLike, path: string, options?: {
    ascii?: boolean;
}): void;

// The body of an SMLib native `.smb` file's contents (its text, or its bytes
// fromSmb (function)
export declare function fromSmb(data: string | BytesLike): Part | Shell;

// The contents of a file of the shapes, in memory, the format picked from the file's name as `exportFile` picks it from a path
// Remarks: In a browser, `new Blob([toFile(part, 'part.step')])` is the file to download.
// toFile (function)
export declare function toFile(shapes: FileItemsLike, name: string, options?: FileOptions): string | Uint8Array;

// The contents of an SMLib native `.smb` file of one body (exact
// toSmb (function)
export declare function toSmb(shapes: ShapesLike, options?: {
    ascii?: boolean;
}): Uint8Array;

// The bodies and curves of an SMLib part file's contents (`.smp`, ASCII or binary)
// fromSmp (function)
export declare function fromSmp(data: string | BytesLike): Shape | ShapeList<Shape>;

// The contents of an SMLib part file (`.smp`) of the shapes, as `save` writes it
// Remarks: A part file is the kernel's own container: any number of exact bodies (parts with their cells, sheets, sketches and faces as sheets), each with its name and color, and curves (an edge as one, a wire as its edges). `fromSmp` and `load` give them back in the same order, with their names and colors, a wire as a `Wire`. A sheet metal part keeps the K-factor each bend was folded with (`fold`, `flange`), so that it unfolds as it was folded; `.smb` and STEP files do not hold them (pass `kFactor` to `unfold` for a part read from those). ASCII unless `ascii` is false; the binary form is bit-exact, the ASCII form keeps the geometry to 16 decimals.
// toSmp (function)
export declare function toSmp(shapes: ShapesLike, options?: {
    ascii?: boolean;
}): Uint8Array;

// A mesh from the contents of an STL file (binary or ASCII
// fromStl (function)
export declare function fromStl(data: string | BytesLike): Mesh;

// Binary glTF (GLB) of the shapes, with colors, names and (optionally) the B-rep edges as lines
// Remarks: glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
// toGlb (function)
export declare function toGlb(shapes: ShapesLike, options?: GltfOptions): Uint8Array;

// glTF JSON of the shapes with the buffer embedded as a data URI (in meters, like `toGlb`)
// toGltf (function)
export declare function toGltf(shapes: ShapesLike, options?: GltfOptions): string;

// Wavefront OBJ text of the shapes (one object per part), with the mesh's normals
// toObj (function)
export declare function toObj(shapes: ShapesLike, options?: MeshOptions): string;

// The text of a STEP AP214 file of the shapes (see `exportStep`)
// toStep (function)
export declare function toStep(shapes: StepItemsLike, options?: StepExportOptions): string;

// A triangle mesh in STL (binary unless `ascii`)
// toStl (function)
export declare function toStl(shapes: ShapesLike, options?: MeshOptions & {
    ascii?: boolean;
}): Uint8Array;

// Read the solids and surfaces of STEP file contents (AP203, AP214, AP242 B-rep data)
// Remarks: Returns a single `Part` (or `Shell`) when the file holds one body, otherwise a `ShapeList` of them. Lengths are converted to millimeters; assembly placements are applied; names and colors are kept. `heal` repairs bodies that come out invalid (valid ones are left alone; default true): the kernel's healer, then stitching where faces do not share their edges, each with a warning when it changed the body or could not repair it. A body that cannot be read (an entity smlibwasm does not read, one the kernel cannot build) is left out with a warning that names it, its entity and the reason; the other bodies are read. `strict: true` throws a `ModelingError` for it instead. A file none of whose bodies can be read throws.
// fromStep (function)
export declare function fromStep(data: string | BytesLike, options?: {
    heal?: boolean;
    strict?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;

// Read everything STEP file contents hold that smlibwasm can use (the text, or the bytes of the file)
// Remarks: `readStep` for the contents in memory (in the browser too); see `readStep`.
// fromStepModel (function)
export declare function fromStepModel(data: string | BytesLike, options?: {
    heal?: boolean;
    strict?: boolean;
}): StepModel;

// Read the solids and surfaces of a STEP file (AP203, AP214, AP242 B-rep data)
// Remarks: Returns a single `Part` (or `Shell`) when the file holds one body, otherwise a `ShapeList` of them. Lengths are converted to millimeters; assembly placements are applied; names and colors are kept. `heal` repairs bodies that come out invalid (valid ones are left alone; default true); `strict` as for `fromStep`.
// importStep (function)
export declare function importStep(path: string, options?: {
    heal?: boolean;
    strict?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;

// Read everything a STEP file holds that smlibwasm can use
// Remarks: The bodies are those of `importStep`, as a `ShapeList` also when there is one. Coordinate systems are the placements of supplemental geometry (as NX, CATIA and tool catalogs write `MCS`, `PCS` or `CSW`) and the named placements of shape representations; curves and points are the wireframe geometry (contours such as a tool's cutting edge line, curve sets, reference points). Each carries its name and the product it belongs to, at its place in the assembly, in millimeters. Items on hidden layers are left out. A file with no bodies gives an empty `bodies`. `heal` as for `importStep` (default true). A body that cannot be read is left out with a warning and listed in `skipped` (`strict: true` throws instead), as `importStep` does.
// readStep (function)
export declare function readStep(path: string, options?: {
    heal?: boolean;
    strict?: boolean;
}): StepModel;
