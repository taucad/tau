import { Plane, Vector } from './geometry.js';
import { Mesh } from './mesh.js';
import { Part, Shape, ShapeList, Shell, Sketch } from './shapes.js';
import { type BytesLike } from './_bytes.js';
import { type StepCurve, type StepFrame, type StepModel, type StepPoint } from './step_import.js';
import { type DxfShapesLike, type DxfWriteOptions } from './dxf.js';
import { type SvgOptions } from './drawing.js';
import { type UsdExportOptions } from './usd.js';
type Any = any;
/** Shapes as the exporters, `htmlPage` and `show` take them: parts, sheets, sketches, faces, edges,
 * wires, meshes, or lists of them (an array, a ShapeList, a Set; also nested). */
export type ShapesLike = Shape | Mesh | (Iterable<ShapesLike> & object);
/** What a STEP file can hold, as `exportStep` and `toStep` take it: shapes (also edges, wires and
 * vertices: curves and points), points as Vectors, coordinate systems as Planes, named and colored
 * `StepCurve`s, `StepPoint`s and `StepFrame`s, a whole `StepModel`, or lists of them. */
export type StepItemsLike = Shape | Mesh | Vector | Plane | StepCurve | StepPoint | StepFrame | StepModel | (Iterable<StepItemsLike> & object);
/** What `exportFile` and `toFile` take: shapes, and what only some formats hold (the views of
 * `drawingViews` for .dxf and .svg; points, coordinate systems and the items of `StepItemsLike`
 * for .step). A format that cannot hold an item says so. */
export type FileItemsLike = StepItemsLike | DxfShapesLike;
/** What `exportFile`, `toFile`, `Shape.export` and `Mesh.export` take as options: those of the
 * format the file's extension picks (`StepExportOptions` for .step, `MeshOptions` and `ascii` for
 * .stl, `GltfOptions` for .glb and .gltf, `MeshOptions` for .obj, `ascii` for .smb and .smp,
 * `DxfWriteOptions`, `SvgOptions`, `UsdExportOptions`; none for .brep). The format checks them as
 * its own function does. */
export type FileOptions = StepExportOptions | (MeshOptions & {
    ascii?: boolean;
}) | GltfOptions | DxfWriteOptions | SvgOptions | UsdExportOptions;
/** Write shapes to `path`; the format follows the file extension (Python's `export`). */
export declare function exportFile(shapes: FileItemsLike, path: string, options?: FileOptions): void;
/**
 * The contents of a file of the shapes, in memory, the format picked from the file's name as
 * `exportFile` picks it from a path: the text of a STEP (`.step`, `.stp`), glTF (`.gltf`), OBJ
 * (`.obj`), DXF (`.dxf`), SVG (`.svg`), USD (`.usda`, `.usd`) or OpenCASCADE (`.brep`) file, the
 * bytes (a Uint8Array) of an STL, GLB or SMLib (`.smb`, `.smp`) file. The options are those of the
 * format's function (`toStep`, `toStl`, ...).
 *
 * In a browser, `new Blob([toFile(part, 'part.step')])` is the file to download.
 */
export declare function toFile(shapes: FileItemsLike, name: string, options?: FileOptions): string | Uint8Array;
/**
 * Read a file's contents in memory, picking the format from the file's name, as `load` does from a
 * path: STEP (`.step`, `.stp`), IGES (`.igs`, `.iges`), USD (`.usda`), OpenCASCADE (`.brep`) and
 * SMLib (`.smb`, `.smp`) give exact parts, DXF (`.dxf`) a
 * `Sketch` of the drawing's outlines, STL a `Mesh`. `data` is the file's text or its bytes (a
 * Uint8Array or an ArrayBuffer, as `await file.arrayBuffer()` gives them for an
 * `<input type="file">`); of `name`, the file's name or path, only the extension counts.
 *
 * A STEP file with one body gives that part, one with several a `ShapeList`. A native file comes
 * back as a `Part` when its body encloses a volume, as a `Shell` when it does not. The layers a USD
 * file names (subLayers, references, payloads) are not read: `fromUsd` reads them with its
 * `resolve` option.
 */
export declare function fromFile(data: string | BytesLike, name: string): Part | Shell | Sketch | Mesh | ShapeList<Part | Shell> | Shape | ShapeList<Shape>;
/** How a STEP file is written: `unit` its length unit ("mm", "cm", "m", "um" or "inch"; the
 * coordinates are converted to it), `name` the product's name (the file's name by default),
 * `assembly` each body in a product of its own (default false). */
export interface StepExportOptions {
    unit?: 'mm' | 'cm' | 'm' | 'um' | 'inch' | 'in';
    name?: string | null;
    assembly?: boolean;
}
/**
 * Exact B-rep export to STEP AP214. Names and colors of parts are kept.
 *
 * The bodies go into one product called `name` (default: the file's name), or, with
 * `assembly: true`, each into a product of its own, named as the body, in an assembly called
 * `name`: other CAD systems then list the parts by name. A body listed more than once is written
 * once and used at each place.
 *
 * Edges and wires are written as wireframe curves, vertices and Vectors as points, Planes as
 * coordinate systems (supplemental geometry), each unnamed; `StepCurve`, `StepPoint` and
 * `StepFrame` give them names and colors, and a `StepModel` (from `readStep`) is written whole.
 * `readStep` reads them back.
 */
export declare function exportStep(shapes: StepItemsLike, path: string, options?: StepExportOptions): void;
/** The text of a STEP AP214 file of the shapes (see `exportStep`). Without a file the product is
 * called "part" unless `name` says otherwise. */
export declare function toStep(shapes: StepItemsLike, options?: StepExportOptions): string;
/** How shapes are meshed: `tolerance` the maximum deviation from the exact surface (by default
 * 0.1 % of the bounding box diagonal), `angle` the maximum angle between neighbouring triangle
 * normals in degrees, `maxEdge` the longest edge a triangle may have (see `tessellate`). */
export interface MeshOptions {
    tolerance?: number | null;
    angle?: number;
    maxEdge?: number | null;
}
/** A triangle mesh in STL (binary unless `ascii`). `tolerance` is the maximum deviation. */
export declare function toStl(shapes: ShapesLike, options?: MeshOptions & {
    ascii?: boolean;
}): Uint8Array;
/** Triangle mesh export to an STL file (binary unless `ascii`). `tolerance` is the maximum
 * deviation, `maxEdge` the longest edge a triangle may have (see `tessellate`). */
export declare function exportStl(shapes: ShapesLike, path: string, options?: MeshOptions & {
    ascii?: boolean;
}): void;
/** Read an STL file (binary or ASCII) as a mesh. */
export declare function importStl(path: string): Mesh;
/** A mesh from the contents of an STL file (binary or ASCII; a string is the text of an ASCII
 * file; bytes are a Uint8Array or an ArrayBuffer, see `BytesLike`). */
export declare function fromStl(data: string | BytesLike): Mesh;
/** Wavefront OBJ text of the shapes (one object per part), with the mesh's normals: each corner
 * names its normal (`f v//vn`), so edges stay sharp where the faces meet at an angle and curved
 * faces shade smooth. `maxEdge` is the longest edge a triangle may have. */
export declare function toObj(shapes: ShapesLike, options?: MeshOptions): string;
/** Wavefront OBJ export (one object per part; see `toObj`). */
export declare function exportObj(shapes: ShapesLike, path: string, options?: MeshOptions): void;
/** How glTF is written: the mesh options, and `edges` (the B-rep edges as lines, default true)
 * in `edgeColor`. */
export interface GltfOptions extends MeshOptions {
    edges?: boolean;
    edgeColor?: Any;
}
/** glTF JSON, binary buffer and a one-line summary for any mix of shapes. */
export declare function gltfDocumentMixed(shapes: unknown, options?: GltfOptions): [
    Any,
    Uint8Array,
    string
];
/** glTF JSON and binary buffer for the shapes. */
export declare function gltfDocument(shapes: unknown, options?: GltfOptions): [
    Any,
    Uint8Array
];
/**
 * Binary glTF (GLB) of the shapes, with colors, names and (optionally) the B-rep edges as lines.
 *
 * glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under
 * a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
 */
export declare function toGlb(shapes: ShapesLike, options?: GltfOptions): Uint8Array;
/**
 * Binary glTF export with colors, names and (optionally) the B-rep edges as lines.
 *
 * glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under
 * a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
 */
export declare function exportGlb(shapes: ShapesLike, path: string, options?: GltfOptions): void;
/** glTF JSON of the shapes with the buffer embedded as a data URI (in meters, like `toGlb`). */
export declare function toGltf(shapes: ShapesLike, options?: GltfOptions): string;
/** glTF export with the buffer embedded as a data URI (in meters, like `exportGlb`). */
export declare function exportGltf(shapes: ShapesLike, path: string, options?: GltfOptions): void;
/** The contents of an SMLib native `.smb` file of one body (exact; ASCII unless `ascii` is false).
 * Reading it back gives the same geometry; B-spline faces that are exactly planes, cylinders, cones,
 * spheres or surfaces of revolution come back as those (`toNurbs()` does not survive). */
export declare function toSmb(shapes: ShapesLike, options?: {
    ascii?: boolean;
}): Uint8Array;
/** The body of an SMLib native `.smb` file's contents (its text, or its bytes: a Uint8Array or an
 * ArrayBuffer): a Part when it encloses a volume (a merged part with its cells too, and a broken
 * solid, whose `isValid()` is false), a Shell when it does not. */
export declare function fromSmb(data: string | BytesLike): Part | Shell;
/**
 * The contents of an SMLib part file (`.smp`) of the shapes, as `save` writes it.
 *
 * A part file is the kernel's own container: any number of exact bodies (parts with their cells,
 * sheets, sketches and faces as sheets), each with its name and color, and curves (an edge as one, a
 * wire as its edges). `fromSmp` and `load` give them back in the same order, with their names and
 * colors, a wire as a `Wire`. A sheet metal part keeps the K-factor each bend was folded with
 * (`fold`, `flange`), so that it unfolds as it was folded; `.smb` and STEP files do not hold them
 * (pass `kFactor` to `unfold` for a part read from those). ASCII unless `ascii` is false; the
 * binary form is bit-exact, the ASCII form keeps the geometry to 16 decimals.
 */
export declare function toSmp(shapes: ShapesLike, options?: {
    ascii?: boolean;
}): Uint8Array;
/**
 * The bodies and curves of an SMLib part file's contents (`.smp`, ASCII or binary): a single shape
 * when it holds one, otherwise a `ShapeList`. Bodies come back as `Part` (one that encloses a
 * volume) or `Shell`, named and colored as written, curves as `Edge` and `Wire`; a file of another
 * SMLib program gives its loose surfaces as sheets of one face each.
 */
export declare function fromSmp(data: string | BytesLike): Shape | ShapeList<Shape>;
/**
 * Write shapes to SMLib's native files (exact): one body to an `.smb` file (see `toSmb`), or bodies
 * and curves with their names and colors to an `.smp` part file (see `toSmp`); any other extension
 * writes `.smb`.
 */
export declare function save(shapes: ShapesLike, path: string, options?: {
    ascii?: boolean;
}): void;
/**
 * Read a file, picking the format from the extension: STEP (`.step`, `.stp`), IGES (`.igs`, `.iges`),
 * USD (`.usda`), OpenCASCADE (`.brep`) and SMLib (`.smb`, `.smp`) give exact parts, DXF (`.dxf`) a
 * `Sketch` of the drawing's outlines, STL a `Mesh`.
 *
 * A STEP or IGES file with one body gives that part, one with several a `ShapeList`. A native file comes
 * back as a `Part` when its body encloses a volume (a merged part with its cells too, and a broken
 * solid, whose `isValid()` is false), as a `Shell` when it does not; a part file (`.smp`) with its
 * names, colors and curves (see `fromSmp`). A body that also holds wire edges, points or faces outside
 * its solid comes with a warning.
 */
export declare function load(path: string): Part | Shell | Sketch | Mesh | ShapeList<Part | Shell> | Shape | ShapeList<Shape>;
export {};
