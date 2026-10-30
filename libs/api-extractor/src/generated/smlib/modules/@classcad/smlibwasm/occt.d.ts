import { type Part, type Shell, ShapeList } from './shapes.js';
import { type BytesLike } from './_bytes.js';
import { type ShapesLike } from './exporters.js';
/** How a .brep file is read: `heal` (default false) runs the kernel's import healer on the bodies;
 * `check` (default true) checks each body with the kernel before anything measures it: one whose
 * faces, edges and vertices leave gaps of more than 1e-3 of its size throws a RangeError, smaller
 * gaps give a warning. */
export interface BrepImportOptions {
    heal?: boolean;
    check?: boolean;
    /** Throw a ModelingError where a solid, shell or face of the file cannot be read; false (the
     * default, as for STEP, IGES and USD) leaves it out with a warning and returns the others. */
    strict?: boolean;
}
/**
 * The text of an OpenCASCADE .brep file of parts and sheets, as `exportBrep` writes it:
 * BRepTools::Read and `fromBrep` read it back.
 */
export declare function toBrep(shapes: ShapesLike): string;
/**
 * Write parts, sheets and faces to an OpenCASCADE .brep file (ASCII, as OpenCASCADE's
 * BRepTools::Write writes it), which build123d (import_brep), CadQuery (importBrep), FreeCAD and
 * OpenCASCADE itself read (Node only; `toBrep` gives the text anywhere).
 *
 * The file holds one shape: the solid or shell of a single body, or a compound of the bodies (a part
 * with several solids gives one solid each, a sheet its shell; a sheet whose faces share no edge, a
 * shell per connected set). Faces keep their exact surfaces (planes, cylinders, cones, spheres, tori
 * and B-splines; surfaces of revolution and extrusions are written as the B-splines they are), edges
 * their curves, and every edge gets its curves in the parameters of its faces, as OpenCASCADE
 * requires. Names and colors are not written: the format has no place for them (`exportStep` keeps
 * them).
 *
 * Throws a RangeError for a body without faces, a TypeError for meshes, curves and points, and a
 * KernelError where a body cannot be converted (an edge that lies farther from its face than 1e-3 of
 * the body's size, a face whose boundary does not close).
 */
export declare function exportBrep(shapes: ShapesLike, path: string): void;
/**
 * Read an OpenCASCADE .brep file (ASCII from BRepTools::Write, binary from BinTools::Write), as
 * build123d (export_brep), CadQuery (exportBrep), FreeCAD and OpenCASCADE write it (Node only;
 * `fromBrep` reads contents anywhere).
 *
 * Gives a Part for each solid of the file's shape and a Shell for each shell or face that is no
 * solid's (a single shape when there is one, otherwise a ShapeList in the order of the file's
 * compound), placed as the file places them and in its units (millimeters for the tools above).
 * Faces and edges keep their exact geometry: planes, cylinders, cones, spheres, tori and B-splines
 * come back as those; surfaces of extrusion and revolution, Bezier surfaces and offset geometry as
 * B-splines. Curves and points outside faces (wires, edges and vertices of the compound) are not
 * read: a warning names how many. A file that is not a .brep file, or whose shape holds no faces,
 * throws a RangeError; one the kernel cannot build, a KernelError.
 */
export declare function importBrep(path: string, options?: BrepImportOptions): Part | Shell | ShapeList<Part | Shell>;
/** The bodies of an OpenCASCADE .brep file's contents (the text of an ASCII file, or the bytes of
 * either kind), as `importBrep` reads a file; the options as there. */
export declare function fromBrep(data: string | BytesLike, options?: BrepImportOptions): Part | Shell | ShapeList<Part | Shell>;
