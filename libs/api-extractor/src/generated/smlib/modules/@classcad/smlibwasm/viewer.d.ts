export declare const THREE_VERSION = "0.170.0";
/** The options of `htmlPage`. */
export interface PageOptions {
    /** The page title (default "smlibwasm"). */
    title?: string;
    /** Tessellation tolerance; default 0.1 % of each body's size. */
    tolerance?: number | null;
    /** Largest angle between neighbouring triangle normals on curved faces, degrees (default 12). */
    angle?: number;
    /** Draw the B-rep edges (default true). */
    edges?: boolean;
    /** The direction from the model towards the camera, Z up (default [1, -1.25, 0.75]). */
    view?: readonly [number, number, number];
    /** Room around the model when it is framed (default 1.1). */
    margin?: number;
}
/**
 * A self-contained HTML page showing the shapes: `htmlPage(part)`, `htmlPage(a, b, { title })`.
 *
 * The page loads three.js from a CDN; the model is inside it (a binary glTF as a data URL). Show it
 * in an iframe (`iframe.srcdoc = htmlPage(part)`) or save it as a file.
 *
 * @param args Parts, sketches, faces, edges, wires, meshes, or lists of them, and last the options
 *   (see `PageOptions`).
 */
export declare function htmlPage(...args: unknown[]): string;
/** The options of `show`. */
export interface ShowOptions {
    /** The page title (default "smlibwasm"). */
    title?: string;
    /** Where to write the page (default: a new temporary file). */
    path?: string | null;
    /** Open the page in the default browser (default true). */
    openBrowser?: boolean;
    /** Tessellation tolerance; default 0.1 % of each body's size. */
    tolerance?: number | null;
    /** Largest angle between neighbouring triangle normals on curved faces, degrees (default 12). */
    angle?: number;
    /** Draw the B-rep edges (default true). */
    edges?: boolean;
}
/**
 * Show shapes (parts, sketches, faces, edges, wires, meshes, lists) in a 3D viewer:
 * `show(part)`, `show(a, b, { title })`.
 *
 * Writes the page (`htmlPage`) to `path` or a temporary file and opens it in the default browser.
 * Needs Node; in a browser app, show `htmlPage(...)` in an iframe instead.
 *
 * @param args The shapes, and last the options (see `ShowOptions`).
 * @returns The path of the page.
 */
export declare function show(...args: unknown[]): string;
