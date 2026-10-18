import { Mesh } from './mesh.js';
type Any = any;
type Vec3 = [number, number, number];
type RGB = readonly [number, number, number];
/** The frame of a single view: output pixels per model unit, and the projected point in the
 * middle of the picture. */
export interface Frame {
    scale: number;
    midX: number;
    midY: number;
}
declare const inspect: unique symbol;
/** Named views: the direction from the model towards the camera (Z up). */
export declare const VIEWS: Readonly<Record<string, readonly [number, number, number]>>;
/** The color of labels and of the measurement overlay. */
export declare const _LABEL: RGB;
/** Pixels to compare: `width * height` pixels row by row, 3 or 4 numbers each (RGB or RGBA; a
 * canvas's ImageData is one). `data` holds bytes (a Uint8Array or Uint8ClampedArray) or numbers
 * from 0 to 1 (any other array). */
export interface ImageLike {
    width: number;
    height: number;
    data: ArrayLike<number>;
}
interface _RGBImage {
    pixels: Uint8Array;
    width: number;
    height: number;
}
/**
 * A render: the PNG file contents and what the render knows about itself.
 *
 * - `data`: the PNG file contents.
 * - `pixels`: the picture, `width * height` pixels row by row from the top left, three bytes
 *   (red, green, blue) each.
 * - `frame`: the frame of a single view, `{ scale, midX, midY }`: output pixels per model unit,
 *   and the projected point in the middle of the picture. Pass it as the `frame` option to a
 *   later render of the same view and size to get pictures that compare pixel by pixel. `null`
 *   for sheets and drawings.
 */
export declare class Picture {
    readonly data: Uint8Array;
    readonly pixels: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly frame: Frame | null;
    /** A picture of PNG file contents; `image` gives its pixels when they are at hand (otherwise
     * the PNG is decoded). */
    constructor(data: Uint8Array, image?: _RGBImage | null, frame?: Frame | null);
    /** Write the PNG file (Node). */
    save(path: string): void;
    toString(): string;
    [inspect](): string;
}
/**
 * The result of `diffImages`.
 *
 * - `changed`: number of pixels that differ.
 * - `total`: number of pixels.
 * - `fraction`: `changed / total`.
 * - `bbox`: `[x0, y0, x1, y1]` of the changed pixels (inclusive), or `null`.
 * - `picture`: a `Picture` of the difference: changed pixels red on a faded gray of the second
 *   picture.
 */
export declare class ImageDiff {
    readonly changed: number;
    readonly total: number;
    readonly fraction: number;
    readonly bbox: [number, number, number, number] | null;
    readonly picture: Picture;
    constructor(changed: number, total: number, fraction: number, bbox: [number, number, number, number] | null, picture: Picture);
    /** Write the picture of the difference as a PNG file (Node). */
    save(path: string): void;
    toString(): string;
    [inspect](): string;
}
/** The options of `render`. */
export interface RenderOptions {
    /** Also write the PNG to this file (Node). */
    path?: string | null;
    /**
     * The camera, orthographic, Z up:
     *
     * - a name: `"iso"` (default; a true isometric view from front, right and above), `"front"`,
     *   `"back"`, `"left"`, `"right"`, `"top"`, `"bottom"`;
     * - `{ azimuth: a, elevation: e }` in degrees: azimuth 0 looks from the front, 90 from the
     *   right (+X); elevation 90 from above. `"iso"` is azimuth 45, elevation 35.264; `"right"` is
     *   azimuth 90;
     * - `{ direction: [x, y, z], up: [x, y, z] }`: the direction the camera looks in (from the
     *   camera towards the model); `up` defaults to Z;
     * - `[x, y, z]` (or a Vector): the direction from the model towards the camera;
     * - `"sheet"`: the same as `drawing: "first-angle"`.
     *
     * Views are never mirrored.
     */
    view?: unknown;
    /** Width and height in pixels (default [800, 600]). */
    size?: readonly [number, number];
    /** Draw the edges of faces in the shaded view (hidden edges stay hidden). */
    edges?: boolean;
    /** Background color (default "white"). */
    background?: string | readonly number[];
    /** Tessellation tolerance; default 0.1 % of each body's size. */
    tolerance?: number | null;
    /** Factor on the scale that fits the shapes (2 shows half as much). */
    zoom?: number;
    /** A point that lands in the middle of the picture. */
    lookAt?: unknown;
    /** The frame of an earlier render of the same view and size (its `Picture.frame`, or the
     * picture itself): scale and middle stay the same, so pictures of a changed model compare
     * pixel by pixel (`diffImages`). Overrides `zoom` and `lookAt`. */
    frame?: Frame | Picture | Record<string, number> | readonly number[] | null;
    /** Render at this many times the size and average down (1 to 4); 2 (default) gives smooth
     * edges. Very large pictures get a lower factor (16 million subpixels at most). */
    supersample?: number;
    /** `"native"`: each shape's own color, or a palette color by its position; `"distinct"`: a
     * palette color per body, also per solid of a part. */
    colors?: string;
    /** Line style instead of shading: no fill, visible edges and silhouettes solid, hidden ones
     * dashed. Applies to the single view and every panel of a sheet. */
    lines?: boolean;
    /** A technical drawing: front, top and side view in line style, aligned at one scale, and a
     * shaded iso view in the free corner. `true` or `"first-angle"` (ISO 5456-2 method E): the top
     * view below the front view, the view from the left to its right. `"third-angle"` (method A):
     * the top view above the front view, the view from the right to its right.
     * `{ projection, side: "left" | "right", iso: boolean }` picks the side view or leaves the
     * corner empty. */
    drawing?: unknown;
    /** Several shaded views in one picture: `true` (top, iso, front, right), a list of 4 views
     * (2 x 2) or of 2 views side by side. Named ortho views share one scale; the others fit
     * themselves. `drawing` wins over `sheet`. */
    sheet?: unknown;
    /** Cut at a plane and leave out what is on the positive side of its normal: a `Plane`, a
     * planar face, `[origin, normal]` or `{ origin, normal, cap }`. The picture keeps the framing
     * of the whole model. */
    section?: unknown;
    /** Fill the cut faces of closed bodies, hatched at 45 degrees (neighbouring bodies alternate
     * the direction); bores and pockets stay open. `false` leaves the cut open and shows the
     * inside walls shaded darker. */
    cap?: boolean;
    /** Shapes drawn in signal colors: faces and bodies orange, edges red. Faces, edges, wires,
     * parts, vertices or selections (`part.edges().concave()`). */
    highlight?: unknown;
    /** Points; the face closest to each point is highlighted. */
    highlightAt?: unknown;
    /** Crosshairs with labels, drawn on top: points `[x, y, z]`, `[point, label]` (or
     * `[point, label, color]`), or `{ position, label, color }`. */
    markers?: unknown;
    /** Measurement overlay: the size of the bounding box (`"60 X 54 X 34"`), the axes as seen in
     * the view (an axis pointing into the screen is left out) and a scale bar of a round length. */
    annotate?: boolean;
    /** Translucent bodies: hidden faces shine through, edges stay opaque. */
    xray?: boolean;
    /** Opacity of each face in the x-ray view (0 to 1, default 0.42). */
    xrayAlpha?: number;
    /** Zebra stripes: the reflection of parallel light lines on the shaded surfaces, from the exact
     * surface normals. Stripes break where surfaces meet with a gap or an edge (G0), kink where they
     * meet tangentially (G1, a circular fillet) and run smoothly across curvature-continuous joints
     * (G2). `true`, or `{ stripes: 16, width: 0.5, direction: "vertical" }`: the number of black
     * stripes around the light, the black share of each, and the direction of the light lines
     * (`"vertical"` or `"horizontal"` on the screen, or a world direction). Surfaces that curve
     * along the light lines show none; turn the direction for them. */
    zebra?: unknown;
    /** A curvature map of the exact surfaces: `"mean"`, `"gaussian"`, `"max"` or `"min"` (the
     * principal curvatures). Blue is concave, white flat, red convex (a sphere of radius R has 1/R
     * everywhere); a legend gives the range in 1/mm (1/mm^2 for Gaussian).
     * `{ kind: "mean", range: 0.2 }` (or `[lo, hi]`) fixes the range; by default it spans the
     * values on the shapes. */
    curvature?: unknown;
}
/**
 * Render shapes to a PNG image: `render(part)`, `render(a, b, { view: 'front' })`.
 *
 * The options combine: a sectioned drawing with highlights and markers is fine.
 *
 * @param args Parts, sketches, shells, faces, edges, wires, meshes, or lists of them, and last the
 *   options (see `RenderOptions`). Edges, wires, and sketches shown together with solids, are
 *   drawn on top of everything at their place in space. A read STEP file (`readStep`) draws its
 *   bodies and curves, and marks its coordinate systems and named points.
 * @returns A `Picture`: the PNG file contents (`data`), with `pixels` and `frame`.
 */
export declare function render(...args: unknown[]): Picture;
/**
 * Compare two pictures of the same size pixel by pixel.
 *
 * Meaningful for two renders of the same view with a pinned frame (the `frame` of the first):
 * without it, a changed model is fitted anew and every pixel moves.
 *
 * @param a A picture from `render`, PNG file contents (`Uint8Array`), a PNG file path (Node), or
 *   pixels (`{ width, height, data }`, see `ImageLike`).
 * @param b The picture to compare with, in any of the same forms.
 * @param tolerance Largest difference per color channel (0 to 255) that still counts as equal.
 * @returns An `ImageDiff`: the number, share and bounding box of the changed pixels, and a picture
 *   of the difference (changed pixels red on a faded gray of `b`).
 */
export declare function diffImages(a: unknown, b: unknown, tolerance?: number): ImageDiff;
/** The kind of a curvature map and its range (`null`: from the values on the shapes). */
export declare function _curvatureSpec(curvature: unknown): [string, [number, number] | null] | null;
/** An orthographic camera: screen right, screen up, and `back` towards the camera. */
export declare class _Camera {
    readonly back: Vec3;
    readonly right: Vec3;
    readonly up: Vec3;
    label: string | null;
    constructor(back: ArrayLike<number>, right?: ArrayLike<number> | null, label?: string | null);
    static of(view: unknown): _Camera;
    static turntable(azimuth: number, elevation: number): _Camera;
    /** Screen x, screen y and depth (towards the camera) of flat points. */
    project(points: Float64Array): [Float64Array, Float64Array, Float64Array];
}
/** The triangles of one body (corner normals, one color) and its edges, in world space. Flat
 * arrays: nine numbers per triangle (three corners), six per segment. */
declare class _Body {
    readonly tris: Float64Array;
    readonly norms: Float64Array;
    readonly rgb: RGB;
    readonly closed: boolean;
    readonly segs: Float64Array;
    readonly mesh: Mesh | null;
    readonly source: unknown;
    _adjacent: [Int32Array, Int32Array, Float64Array] | null;
    _principal: [Float64Array, Float64Array] | null;
    constructor(tris: Float64Array, norms: Float64Array, rgb: RGB, closed: boolean, segs: Float64Array, mesh?: Mesh | null, source?: unknown);
    get count(): number;
    /** Curvature of the exact surface at every triangle corner (three numbers per triangle); NaN
     * where there is no exact surface (a mesh). */
    curvature(kind: string): Float64Array;
    /** Mesh edges shared by exactly two triangles: the two triangles and the end points (six
     * numbers per edge). Corners that round to the same point (9 digits of the size) are one. */
    adjacency(): [Int32Array, Int32Array, Float64Array];
}
interface _AxisLine {
    foot: Vec3;
    direction: Vec3;
    t0: number;
    t1: number;
    radius: number;
}
/** Bodies, curves drawn on top, highlights, and the points that count for the fit. */
export declare class _Scene {
    readonly bodies: _Body[];
    /** Segments and their color, drawn on top. */
    readonly overlays: [Float64Array, RGB][];
    /** The shapes whose faces highlightAt searches. */
    readonly items: Any[];
    readonly hlTris: [Float64Array, Float64Array][];
    readonly hlSegs: Float64Array[];
    readonly hlPoints: Vec3[];
    readonly tolerance: number | null;
    _axes: _AxisLine[] | null;
    readonly points: Float64Array;
    readonly lo: Vec3;
    readonly hi: Vec3;
    readonly diagonal: number;
    constructor(shapes: unknown, tolerance: number | null, colors: string, fine?: boolean);
    /** The range of a curvature map: the given one, or the values on the bodies; it always holds
     * zero, the white of the map. */
    curvatureRange(kind: string, span: readonly [number, number] | null): [number, number];
    /** The axes of round features, for center lines: from the circles and arcs of at least half a
     * turn among the edges, one entry per axis line with a point on it, its direction, the range
     * of the circles along it and their largest radius. */
    axes(): _AxisLine[];
    addHighlights(highlight: unknown, highlightAt: unknown): void;
    _addMesh(mesh: Mesh): void;
}
/** An image of floats (0 to 1), row by row, three numbers per pixel. */
export interface _Img {
    data: Float32Array | Float64Array;
    width: number;
    height: number;
}
/** A value of a legend: three significant digits, a short exponent. */
export declare function _valueText(v: number): string;
/** The glyphs of the font: 7 rows of 5 pixels each (true: ink). */
export declare const _FONT: ReadonlyMap<string, readonly (readonly boolean[])[]>;
/** Text in the 5 x 7 font, in capitals. (x, y) is the top left of the text, or its top middle or
 * top right for anchor "middle" or "end". Characters without a glyph stay blank. `halo`: a one
 * pixel outline in this color, so the text reads on any background. */
export declare function _text(img: _Img, x: number, y: number, text: string, color: RGB, scale?: number, anchor?: string, halo?: RGB | null): void;
/** PNG file contents of RGB pixels. */
export declare function _png(pixels: Uint8Array, w: number, h: number): Uint8Array;
/** An 8-bit, non-interlaced PNG (gray, RGB, gray and alpha, RGBA) as RGB pixels. */
export declare function _pngDecode(data: Uint8Array): _RGBImage;
export {};
