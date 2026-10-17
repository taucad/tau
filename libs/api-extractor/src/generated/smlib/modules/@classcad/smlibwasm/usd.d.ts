import { Part, Shell, ShapeList } from './shapes.js';
/** How a USD file is written: `mesh` (default true) writes a Mesh prim (`<name>_mesh`) of each body,
 * which is what USD viewers draw, with `tolerance` and `angle` as in `tessellate`; false writes the
 * exact B-reps alone, for usd-brep and Omniverse, which draw BrepArray prims themselves and would
 * show each body twice. */
export interface UsdExportOptions {
    mesh?: boolean;
    tolerance?: number | null;
    angle?: number;
}
/**
 * The text of a USD file (.usda) of parts, sheets and meshes: each body a BrepArray prim under
 * /World, its exact B-rep with its name and color, and a Mesh prim of it (`<name>_mesh`), which is
 * what USD viewers draw; meshes Mesh prims. The stage is in millimeters (metersPerUnit 0.001) with
 * Z up.
 */
export declare function toUsd(shapes: unknown, options?: UsdExportOptions): string;
/** Write parts, sheets and meshes to a USD file (.usda, or .usd as text); see `toUsd`. */
export declare function exportUsd(shapes: unknown, path: string, options?: UsdExportOptions): void;
/**
 * The bodies of the BrepArray prims of a USD text (.usda): a single Part (or Shell, for a body
 * that encloses no volume) when it holds one body, otherwise a ShapeList of them, named and
 * colored as their prims. Lengths are taken as they are (smlibwasm writes millimeters). `heal`
 * runs the kernel's import healer on them. A malformed BrepArray throws a RangeError that says
 * what is wrong.
 */
export declare function fromUsd(data: string | Uint8Array, options?: {
    heal?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;
/** Read the bodies of the BrepArray prims of a USD text file (.usda, .usd); see `fromUsd`. */
export declare function importUsd(path: string, options?: {
    heal?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;
