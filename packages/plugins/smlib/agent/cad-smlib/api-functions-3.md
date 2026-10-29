# @classcad/smlibwasm — Functions (3)

26 top-level symbols. Signatures are verbatim typescript.

// Read the solids and surfaces of IGES file contents (IGES 5.3, ASCII)
// Remarks: Returns a single `Part` (or `Shell`) when the file holds one body, otherwise a `ShapeList` of them, in millimeters whatever unit the file uses, named and colored as the file has them. Solids (manifold solid B-rep objects, entity 186) come in as STEP bodies do: each face on its exact surface, each edge on its exact curve, the faces sharing their edges. Trimmed and bounded surfaces (144, 143), the way most CAD systems write IGES, share nothing: each becomes a face, the faces are stitched where their edges meet, and each set of faces that closes up becomes a part, the others sheets. `heal` repairs solids that come out invalid, as `fromStep` does. Something that cannot be read (an entity smlibwasm does not read, one the kernel cannot build) is left out with a warning that names it and the reason; `strict: true` throws a `ModelingError` instead. A file none of whose bodies can be read throws.
// fromIges (function)
export declare function fromIges(data: string | BytesLike, options?: IgesImportOptions): Part | Shell | ShapeList<Part | Shell>;

// Read the solids and surfaces of an IGES file (.igs, .iges
// importIges (function)
export declare function importIges(path: string, options?: IgesImportOptions): Part | Shell | ShapeList<Part | Shell>;

// Write sketches, faces, wires and edges to a DXF drawing (AutoCAD 2000, AC1015) at `path` (Node)
// exportDxf (function)
export declare function exportDxf(shapes: DxfShapesLike, path: string, options?: DxfWriteOptions): void;

// `importDxf` of a drawing in memory
// fromDxf (function)
export declare function fromDxf(data: string | BytesLike, options?: DxfReadOptions): Sketch;

// `importDxfWires` of a drawing in memory
// fromDxfWires (function)
export declare function fromDxfWires(data: string | BytesLike, options?: DxfReadOptions): ShapeList<Wire>;

// Read the outlines of a DXF drawing (an ASCII DXF file's path
// Remarks: Lines, arcs, circles, ellipses, polylines (bulges become exact arcs), splines (exact NURBS) and inserted blocks are joined end to end into closed loops. Loops nest by the even-odd rule: a loop inside a loop is a hole, a loop inside a hole an island. The result keeps the drawing's coordinates, converted to millimeters. Throws ModelingError for curves that do not close into loops (with their ends and layers), or outlines that branch.
// importDxf (function)
export declare function importDxf(path: string, options?: DxfReadOptions): Sketch;

// Every chain of curves of a DXF drawing (a path
// Remarks: The curves are read and joined like in `importDxf`; chains also stop where three or more curve ends meet. Closed chains come first, then open ones, each in drawing order.
// importDxfWires (function)
export declare function importDxfWires(path: string, options?: DxfReadOptions): ShapeList<Wire>;

// Sketches, faces, wires and edges as the text of a DXF drawing (AutoCAD 2000, AC1015)
// Remarks: Every curve is written exactly: LINE, ARC, CIRCLE, ELLIPSE, or SPLINE with the kernel's control points, knots and weights. Circular B-splines (the edges of sections) are written as ARC and CIRCLE, straight ones as LINE. A shape's name becomes its layer. `curves: 'arcs'` writes splines and ellipses as LINE and ARC within `tolerance` (`Edge.toArcs`), for software that reads only lines and arcs. The views of `drawingViews` go on the layers VISIBLE and HIDDEN, the hidden lines dashed (the linetype DASHED: 3 mm dashes, 1.5 mm gaps). `shapes` is a `Sketch`, `Face`, `Wire`, `Edge`, `DrawingView` or an array of them.
// toDxf (function)
export declare function toDxf(shapes: DxfShapesLike, options?: DxfWriteOptions): string;

// The views of a part for a 2D drawing, laid out in the world XY plane
// Remarks: - `part`: a part (or a shell), or a list of them (an assembly): drawn together, each body hiding the lines of the others behind it (bodies that overlap are not cut where they meet). - `views`: the views, by where they look from: `'front'` (from -Y; the drawing's x is the model's X, its y the model's Z), `'back'` (from +Y), `'top'` (from +Z: X and Y), `'bottom'` (from -Z), `'left'` (from -X: -Y and Z) and `'right'` (from +X: Y and Z). - `projection`: `'first-angle'` (ISO: the top view below the front view, the left view to its right) or `'third-angle'` (ASME: the top view above it, the left view to its left). The back view goes at the far right. - `hidden`: draw the hidden lines (`DrawingView.hidden`, dashed in DXF and SVG); `false` leaves them empty. - `tangentEdges`: draw the edges between faces that meet tangentially (fillet tangent lines). - `gap`: space between the views. Default: a fifth of the part's largest extent. The views of the front row share its height (the model's Z), the views of its column the front view's x (the model's X). Write them with `exportDxf`/`toDxf` (layers VISIBLE and HIDDEN, the hidden lines dashed) or `exportSvg`/`toSvg`.
// drawingViews (function)
export declare function drawingViews(part: Part | Shell | Iterable<Part | Shell>, views?: string | readonly string[], options?: DrawingViewsOptions): DrawingView[];

// Write `toSvg` of the shapes to a file (Node)
// exportSvg (function)
export declare function exportSvg(shapes: SvgItemsLike, path: string, options?: SvgOptions): void;

// An SVG drawing of drawing views (dashed hidden lines), edges, wires and the edges of faces and sketches, seen from +Z (their x and y
// Remarks: - `shapes`: `DrawingView`, `Edge`, `Wire`, `Face`, `Sketch` or an array of them. - `margin`: space around the lines. Default: 5 % of the drawing's size. - `stroke`: width of the visible lines (the hidden ones are 0.7 of it, dashed). Default: 0.35 mm, or 1/500 of the drawing's size where that is smaller.
// toSvg (function)
export declare function toSvg(shapes: SvgItemsLike, options?: SvgOptions): string;

// Write parts, sheets and meshes to a USD file (.usda, or .usd as text)
// exportUsd (function)
export declare function exportUsd(shapes: ShapesLike, path: string, options?: UsdExportOptions): void;

// The bodies of the BrepArray prims of a USD text (.usda)
// fromUsd (function)
export declare function fromUsd(data: string | BytesLike, options?: UsdReadOptions): Part | Shell | ShapeList<Part | Shell>;

// Read the bodies of the BrepArray prims of a USD text file (.usda, .usd), and the files it names (subLayers, references, payloads) relative to the file that names them
// importUsd (function)
export declare function importUsd(path: string, options?: UsdImportOptions): Part | Shell | ShapeList<Part | Shell>;

// The text of a USD file (.usda) of parts, sheets and meshes
// toUsd (function)
export declare function toUsd(shapes: ShapesLike, options?: UsdExportOptions): string;

// Write parts, sheets and faces to an OpenCASCADE .brep file (ASCII, as OpenCASCADE's BRepTools::Write writes it), which build123d (import_brep), CadQuery (importBrep), FreeCAD and OpenCASCADE itself read (Node only
// Remarks: The file holds one shape: the solid or shell of a single body, or a compound of the bodies (a part with several solids gives one solid each, a sheet its shell; a sheet whose faces share no edge, a shell per connected set). Faces keep their exact surfaces (planes, cylinders, cones, spheres, tori and B-splines; surfaces of revolution and extrusions are written as the B-splines they are), edges their curves, and every edge gets its curves in the parameters of its faces, as OpenCASCADE requires. Names and colors are not written: the format has no place for them (`exportStep` keeps them). Throws a RangeError for a body without faces, a TypeError for meshes, curves and points, and a KernelError where a body cannot be converted (an edge that lies farther from its face than 1e-3 of the body's size, a face whose boundary does not close).
// exportBrep (function)
export declare function exportBrep(shapes: ShapesLike, path: string): void;

// The bodies of an OpenCASCADE .brep file's contents (the text of an ASCII file, or the bytes of either kind), as `importBrep` reads a file
// fromBrep (function)
export declare function fromBrep(data: string | BytesLike, options?: BrepImportOptions): Part | Shell | ShapeList<Part | Shell>;

// Read an OpenCASCADE .brep file (ASCII from BRepTools::Write, binary from BinTools::Write), as build123d (export_brep), CadQuery (exportBrep), FreeCAD and OpenCASCADE write it (Node only
// Remarks: Gives a Part for each solid of the file's shape and a Shell for each shell or face that is no solid's (a single shape when there is one, otherwise a ShapeList in the order of the file's compound), placed as the file places them and in its units (millimeters for the tools above). Faces and edges keep their exact geometry: planes, cylinders, cones, spheres, tori and B-splines come back as those; surfaces of extrusion and revolution, Bezier surfaces and offset geometry as B-splines. Curves and points outside faces (wires, edges and vertices of the compound) are not read: a warning names how many. A file that is not a .brep file, or whose shape holds no faces, throws a RangeError; one the kernel cannot build, a KernelError.
// importBrep (function)
export declare function importBrep(path: string, options?: BrepImportOptions): Part | Shell | ShapeList<Part | Shell>;

// The text of an OpenCASCADE .brep file of parts and sheets, as `exportBrep` writes it
// toBrep (function)
export declare function toBrep(shapes: ShapesLike): string;

// Compare two pictures of the same size pixel by pixel
// Remarks: Meaningful for two renders of the same view with a pinned frame (the `frame` of the first): without it, a changed model is fitted anew and every pixel moves.
// diffImages (function)
export declare function diffImages(a: Picture | ImageLike | Uint8Array | ArrayBuffer | string, b: Picture | ImageLike | Uint8Array | ArrayBuffer | string, tolerance?: number): ImageDiff;
//   a: A picture from `render`, PNG file contents (`Uint8Array`), a PNG file path (Node), or pixels (`{ width, height, data }`, see `ImageLike`)
//   b: The picture to compare with, in any of the same forms
//   tolerance: Largest difference per color channel (0 to 255) that still counts as equal

// Render shapes to a PNG image
// Remarks: The options combine: a sectioned drawing with highlights and markers is fine.
// render (function)
export declare function render(...shapes: Renderable[]): Picture;
export declare function render(...args: [
    ...shapes: Renderable[],
    options: RenderOptions
]): Picture;

// A self-contained HTML page showing the shapes
// Remarks: The page loads three.js from a CDN; the model is inside it (a binary glTF as a data URL). Show it in an iframe (`iframe.srcdoc = htmlPage(part)`) or save it as a file.
// htmlPage (function)
export declare function htmlPage(...shapes: ShapesLike[]): string;
export declare function htmlPage(...args: [
    ...shapes: ShapesLike[],
    options: PageOptions
]): string;

// Show shapes (parts, sketches, faces, edges, wires, meshes, lists) in a 3D viewer
// Remarks: Writes the page (`htmlPage`) to `path` or a temporary file and opens it in the default browser. Needs Node; in a browser app, show `htmlPage(...)` in an iframe instead.
// show (function)
export declare function show(...shapes: ShapesLike[]): string;
export declare function show(...args: [
    ...shapes: ShapesLike[],
    options: ShowOptions
]): string;

// What the kernel's memory holds, in bytes
// memoryUsage (function)
export declare function memoryUsage(): MemoryUsage;

// Runs `fn` and frees every kernel object (body, curve, surface, mesh) made while it runs that its result does not hold, at once
// Remarks: The garbage collector frees kernel objects only between tasks of the event loop, so a loop that builds without returning to the event loop keeps every object until it ends: `scope` keeps such a loop's memory flat. Scopes nest: what an inner scope returns belongs to the outer one. `fn` must return its result, not a promise (a scope cannot see what an async function makes after its first `await`): a promise is a TypeError, and nothing is freed. Do not keep objects that `fn` makes anywhere but in its result (in a variable outside, a cache): they are disposed, and using them is a TypeError. (A JavaScript-only function: Python frees each kernel object with its last reference.)
// scope (function)
export declare function scope<T>(fn: () => T): T;

// Where smlibwasm's warnings go (Python's warnings.warn)
// setWarningHandler (function)
export declare function setWarningHandler(handler: (message: string) => void): void;
