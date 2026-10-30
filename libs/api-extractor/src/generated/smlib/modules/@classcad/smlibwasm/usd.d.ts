import { Part, Shell, ShapeList } from './shapes.js';
import { type BytesLike } from './_bytes.js';
import { type ShapesLike } from './exporters.js';
/** How a USD file is written: `mesh` (default true) writes a Mesh prim (`<name>_mesh`) of each body,
 * which is what USD viewers draw, with `tolerance`, `angle` and `maxEdge` as in `tessellate`; false writes the
 * exact B-reps alone, for usd-brep and Omniverse, which draw BrepArray prims themselves and would
 * show each body twice. `materials` (default false) also gives each color a Material (a
 * UsdPreviewSurface of that color under /World/Looks) bound to the prims of that color, which
 * Omniverse and other renderers use where they leave displayColor aside; `fromUsd` reads such
 * bindings back. */
export interface UsdExportOptions {
    mesh?: boolean;
    tolerance?: number | null;
    angle?: number;
    materials?: boolean;
    maxEdge?: number | null;
}
/**
 * The text of a USD file (.usda) of parts, sheets and meshes: each body a BrepArray prim under
 * /World, its exact B-rep with its name and color, and a Mesh prim of it (`<name>_mesh`), which is
 * what USD viewers draw; meshes Mesh prims. The stage is in millimeters (metersPerUnit 0.001) with
 * Z up.
 */
export declare function toUsd(shapes: ShapesLike, options?: UsdExportOptions): string;
/** Write parts, sheets and meshes to a USD file (.usda, or .usd as text); see `toUsd`. */
export declare function exportUsd(shapes: ShapesLike, path: string, options?: UsdExportOptions): void;
/** How a USD stage is read: `heal` runs the kernel's import healer on the bodies; `units` is the
 * stage's unit ("mm", "cm", "m", "um" or "inch") in place of its metersPerUnit (left out: the
 * stage's metersPerUnit; a stage that has none is taken as millimeters, where USD itself takes
 * centimeters); `placement` (default true) places the bodies as the stage does (the xformOps of
 * their prims and of the prims above them, a Y-up stage turned to Z up), false leaves each body where
 * its prim has it; `check` (default true) checks each body with the kernel before anything measures
 * it (not those smlibwasm wrote): gaps of more than 1e-3 of its size make it unreadable, smaller ones
 * give a warning; `strict` (default false, as for STEP and IGES) throws for the first body that
 * cannot be read (a RangeError for a malformed or refused body, a KernelError for one the kernel
 * cannot build), where false leaves such bodies out, with a warning for each that says which and why,
 * and returns the others (as usd-brep's allow_partial; a text none of whose bodies can be read throws
 * a ModelingError). */
export interface UsdImportOptions {
    heal?: boolean;
    units?: string | null;
    placement?: boolean;
    check?: boolean;
    strict?: boolean;
}
/** fromUsd's options: those of `UsdImportOptions`, and `resolve(asset, from)`, which gives the text
 * of a layer the stage names (a subLayer, a reference or a payload: `asset` as written, `from` the
 * name of the layer that names it, "" for the text given; a relative asset is taken from the
 * directory of `from`), or null if it has none. Without it, such layers are not read (a warning
 * names them). */
export interface UsdReadOptions extends UsdImportOptions {
    resolve?: ((asset: string, from: string) => string | Uint8Array | null | undefined) | null;
}
/**
 * The bodies of the BrepArray prims of a USD text (.usda): a single Part (or Shell, for a body
 * that encloses no volume) when it holds one body, otherwise a ShapeList of them, named and colored
 * as their prims (a body whose prim's name another prim has too is named by its prim's path). The
 * text is read as USD composes it: the layers it names (subLayers, references, payloads) come from
 * `resolve`; abstract (class), inactive and over-only prims hold no bodies. Lengths come out in
 * millimeters, the bodies placed as the stage has them (see `UsdImportOptions`). A malformed
 * BrepArray throws a RangeError that says what is wrong, in which body, face or edge, with the rule
 * of usd-brep's validator it breaks; a body the kernel cannot build a KernelError that names it. A
 * solid that also holds wire edges, points or faces outside it (which the schema allows) comes with a
 * warning that names them: such a Part is not valid. A body's color is that of the material bound to
 * it (the diffuseColor of the UsdPreviewSurface its material has, through a GeomSubset of bodies, the
 * prim or a prim above it), or else its prim's displayColor.
 * Edges come back with the curves they had: lines, circles and ellipses that `toUsd` wrote as such,
 * and B-spline edges that are lines or circular arcs exactly (usd-brep and Omniverse write every edge
 * as a B-spline) as lines and circles.
 */
export declare function fromUsd(data: string | BytesLike, options?: UsdReadOptions): Part | Shell | ShapeList<Part | Shell>;
/** Read the bodies of the BrepArray prims of a USD text file (.usda, .usd), and the files it names
 * (subLayers, references, payloads) relative to the file that names them; see `fromUsd`. */
export declare function importUsd(path: string, options?: UsdImportOptions): Part | Shell | ShapeList<Part | Shell>;
