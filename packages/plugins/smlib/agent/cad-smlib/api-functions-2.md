# @classcad/smlibwasm — Functions (2)

8 top-level symbols. Signatures are verbatim typescript.

// The bodies of the BrepArray prims of a USD text (.usda)
// fromUsd (function)
export declare function fromUsd(data: string | Uint8Array, options?: {
    heal?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;

// Read the bodies of the BrepArray prims of a USD text file (.usda, .usd)
// importUsd (function)
export declare function importUsd(path: string, options?: {
    heal?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;

// The text of a USD file (.usda) of parts, sheets and meshes
// toUsd (function)
export declare function toUsd(shapes: unknown, options?: UsdExportOptions): string;

// Compare two pictures of the same size pixel by pixel
// Remarks: Meaningful for two renders of the same view with a pinned frame (the `frame` of the first): without it, a changed model is fitted anew and every pixel moves.
// diffImages (function)
export declare function diffImages(a: unknown, b: unknown, tolerance?: number): ImageDiff;
//   a: A picture from `render`, PNG file contents (`Uint8Array`), a PNG file path (Node), or pixels (`{ width, height, data }`, see `ImageLike`)
//   b: The picture to compare with, in any of the same forms
//   tolerance: Largest difference per color channel (0 to 255) that still counts as equal

// Render shapes to a PNG image
// Remarks: The options combine: a sectioned drawing with highlights and markers is fine.
// render (function)
export declare function render(...args: unknown[]): Picture;
//   args: Parts, sketches, shells, faces, edges, wires, meshes, or lists of them, and last the options (see `RenderOptions`)

// A self-contained HTML page showing the shapes
// Remarks: The page loads three.js from a CDN; the model is inside it (a binary glTF as a data URL). Show it in an iframe (`iframe.srcdoc = htmlPage(part)`) or save it as a file.
// htmlPage (function)
export declare function htmlPage(...args: unknown[]): string;
//   args: Parts, sketches, faces, edges, wires, meshes, or lists of them, and last the options (see `PageOptions`)

// Show shapes (parts, sketches, faces, edges, wires, meshes, lists) in a 3D viewer
// Remarks: Writes the page (`htmlPage`) to `path` or a temporary file and opens it in the default browser. Needs Node; in a browser app, show `htmlPage(...)` in an iframe instead.
// show (function)
export declare function show(...args: unknown[]): string;
//   args: The shapes, and last the options (see `ShowOptions`)

// Where smlibwasm's warnings go (Python's warnings.warn)
// setWarningHandler (function)
export declare function setWarningHandler(handler: (message: string) => void): void;
