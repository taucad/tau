import { Mesh } from './mesh.js';
import { Edge, Part, Shape, Shell, Wire } from './shapes.js';
type Any = any;
type NodeFs = any;
/**
 * Node's file system (node:fs), for the functions that read and write files. It is looked up
 * when needed (`process.getBuiltinModule`), so bundles for the browser carry no `node:` import;
 * outside Node it throws.
 */
export declare function _fs(): NodeFs;
/** The bodies and meshes of `shapes` (a shape, a mesh or nested lists of them); a face becomes a
 * sheet of its own, or stays a face with `faces`. */
export declare function _items(shapes: unknown, faces?: boolean): (Shape | Mesh)[];
/** Write shapes to `path`; the format follows the file extension (Python's `export`). */
export declare function exportFile(shapes: unknown, path: string, options?: Record<string, Any>): void;
/** How a STEP file is written: `unit` its length unit ("mm", "cm", "m", "um" or "inch"; the
 * coordinates are converted to it), `name` the product's name (the file's name by default). */
export interface StepExportOptions {
    unit?: string;
    name?: string | null;
}
/** Exact B-rep export to STEP AP214. Names and colors of parts are kept. */
export declare function exportStep(shapes: unknown, path: string, options?: StepExportOptions): void;
/** The text of a STEP AP214 file of the shapes (see `exportStep`). Without a file the product is
 * called "part" unless `name` says otherwise. */
export declare function toStep(shapes: unknown, options?: StepExportOptions): string;
/** How shapes are meshed: `tolerance` the maximum deviation from the exact surface (by default
 * 0.1 % of the bounding box diagonal), `angle` the maximum angle between neighbouring triangle
 * normals in degrees. */
export interface MeshOptions {
    tolerance?: number | null;
    angle?: number;
}
/** A triangle mesh in STL (binary unless `ascii`). `tolerance` is the maximum deviation. */
export declare function toStl(shapes: unknown, options?: MeshOptions & {
    ascii?: boolean;
}): Uint8Array;
/** Triangle mesh export to an STL file (binary unless `ascii`). `tolerance` is the maximum
 * deviation. */
export declare function exportStl(shapes: unknown, path: string, options?: MeshOptions & {
    ascii?: boolean;
}): void;
/** Read an STL file (binary or ASCII) as a mesh. */
export declare function importStl(path: string): Mesh;
/** A mesh from the contents of an STL file (binary or ASCII; a string is the text of an ASCII
 * file). */
export declare function fromStl(data: string | Uint8Array): Mesh;
/** Wavefront OBJ text of the shapes (one object per part). */
export declare function toObj(shapes: unknown, options?: MeshOptions): string;
/** Wavefront OBJ export (one object per part). */
export declare function exportObj(shapes: unknown, path: string, options?: MeshOptions): void;
export declare const _DEFAULT_COLORS: readonly string[];
/** Polylines of the body's edges (each an array of [x, y, z] points), without the seams of
 * periodic faces (they are not edges a designer drew). */
export declare function _edgePolylines(item: unknown, angle?: number): number[][][];
/** The shapes and meshes in `shapes` (a shape, a mesh or nested lists of them). */
export declare function _flattenAll(shapes: unknown): (Shape | Mesh)[];
/** Points along each edge of an edge or wire (arrays of [x, y, z]): the two ends of a line, 97
 * points along other curves. */
export declare function _curvePoints(item: Edge | Wire | Shape): number[][][];
/** How glTF is written: the mesh options, and `edges` (the B-rep edges as lines, default true)
 * in `edgeColor`. */
export interface GltfOptions extends MeshOptions {
    edges?: boolean;
    edgeColor?: Any;
}
/** glTF JSON, binary buffer and a one-line summary for any mix of shapes. */
export declare function gltfDocumentMixed(shapes: unknown, options?: GltfOptions): [Any, Uint8Array, string];
/** glTF JSON and binary buffer for the shapes. */
export declare function gltfDocument(shapes: unknown, options?: GltfOptions): [Any, Uint8Array];
/**
 * Binary glTF (GLB) of the shapes, with colors, names and (optionally) the B-rep edges as lines.
 *
 * glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under
 * a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
 */
export declare function toGlb(shapes: unknown, options?: GltfOptions): Uint8Array;
/**
 * Binary glTF export with colors, names and (optionally) the B-rep edges as lines.
 *
 * glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under
 * a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
 */
export declare function exportGlb(shapes: unknown, path: string, options?: GltfOptions): void;
/** glTF JSON of the shapes with the buffer embedded as a data URI (in meters, like `toGlb`). */
export declare function toGltf(shapes: unknown, options?: GltfOptions): string;
/** glTF export with the buffer embedded as a data URI (in meters, like `exportGlb`). */
export declare function exportGltf(shapes: unknown, path: string, options?: GltfOptions): void;
/** Base64 of bytes (no Buffer, no btoa: works everywhere). */
export declare function _base64(bytes: Uint8Array): string;
/** Put the scene under a root node that turns the Z-up model Y-up (glTF's), in meters with
 * `meters`. */
export declare function _zUp(doc: Any, meters?: boolean): void;
/** The contents of an SMLib native `.smb` file of one body (exact and lossless; ASCII unless
 * `ascii` is false). */
export declare function toSmb(shapes: unknown, options?: {
    ascii?: boolean;
}): Uint8Array;
/** The body of an SMLib native `.smb` file's contents: a Part, or a Shell when it encloses no
 * volume. */
export declare function fromSmb(data: string | Uint8Array): Part | Shell;
/** Write a body to SMLib's native `.smb` format (exact and lossless). */
export declare function save(shapes: unknown, path: string, options?: {
    ascii?: boolean;
}): void;
/**
 * Read a file, picking the format from the extension: STEP (`.step`, `.stp`), USD (`.usda`) and
 * SMLib (`.smb`) give exact parts, DXF (`.dxf`) a `Sketch` of the drawing's outlines, STL a `Mesh`.
 *
 * A STEP file with one body gives that part, one with several a `ShapeList`. A native file that
 * encloses no volume comes back as a `Shell`.
 */
export declare function load(path: string): Any;
export {};
