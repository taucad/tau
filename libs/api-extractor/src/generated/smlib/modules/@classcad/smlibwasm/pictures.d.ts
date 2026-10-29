import { BoundBox, Plane, type VectorLike } from './geometry.js';
import { Mesh } from './mesh.js';
import { type ColorLike, Face, Shape } from './shapes.js';
import { StepModel } from './step_import.js';
/** The frame of a single view: output pixels per model unit, and the projected point in the
 * middle of the picture. */
export interface Frame {
    scale: number;
    midX: number;
    midY: number;
}
declare const inspect: unique symbol;
/** Named views: the direction from the model towards the camera (Z up). */
export declare const VIEWS: Readonly<Record<string, readonly [
    number,
    number,
    number
]>>;
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
    readonly bbox: [
        number,
        number,
        number,
        number
    ] | null;
    readonly picture: Picture;
    constructor(changed: number, total: number, fraction: number, bbox: [
        number,
        number,
        number,
        number
    ] | null, picture: Picture);
    /** Write the picture of the difference as a PNG file (Node). */
    save(path: string): void;
    toString(): string;
    [inspect](): string;
}
/** What `render` draws: parts, sketches, sheets, faces, edges, wires and vertices, meshes, a read
 * STEP file (`readStep`), or lists of them (an array, a ShapeList, a Set; also nested). */
export type Renderable = Shape | Mesh | StepModel | (Iterable<Renderable> & object);
/** A camera of `render` (see `RenderOptions.view`): a view's name, `{ azimuth, elevation }` in
 * degrees, `{ direction, up }`, or the direction from the model towards the camera. (Any string
 * type-checks, as names come from variables too; the names are checked when it renders.) */
export type RenderView = 'iso' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | (string & {}) | VectorLike | {
    azimuth?: number;
    elevation?: number;
} | {
    direction: VectorLike;
    up?: VectorLike | null;
};
/** A point of `render`'s options: a Vector, `[x, y, z]`, or the center of a shape or box. */
export type RenderPoint = VectorLike | Shape | BoundBox;
/** A marker of `render` (see `RenderOptions.markers`): a point, `[point, label]`,
 * `[point, label, color]` or `{ position, label, color }`. */
export type RenderMarker = RenderPoint | readonly [
    RenderPoint,
    string
] | readonly [
    RenderPoint,
    string,
    ColorLike | null
] | {
    position: RenderPoint;
    label?: string;
    color?: ColorLike | null;
};
/** The kinds of curvature `render` maps (see `RenderOptions.curvature`). */
export type CurvatureKind = 'mean' | 'gaussian' | 'max' | 'min' | (string & {});
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
    view?: RenderView | 'sheet';
    /** Width and height in pixels (default [800, 600]). */
    size?: readonly [
        number,
        number
    ];
    /** Draw the edges of faces in the shaded view (hidden edges stay hidden). */
    edges?: boolean;
    /** Background color (default "white"). */
    background?: string | readonly number[];
    /** Tessellation tolerance; default 0.1 % of each body's size. */
    tolerance?: number | null;
    /** Factor on the scale that fits the shapes (2 shows half as much). */
    zoom?: number;
    /** A point that lands in the middle of the picture. */
    lookAt?: RenderPoint | null;
    /** The frame of an earlier render of the same view and size (its `Picture.frame`, or the
     * picture itself): scale and middle stay the same, so pictures of a changed model compare
     * pixel by pixel (`diffImages`). Overrides `zoom` and `lookAt`. */
    frame?: Frame | Picture | Record<string, number> | readonly number[] | null;
    /** Render at this many times the size and average down (1 to 4); 2 (default) gives smooth
     * edges. Very large pictures get a lower factor (16 million subpixels at most). */
    supersample?: number;
    /** `"native"`: each shape's own color, or a palette color by its position; `"distinct"`: a
     * palette color per body, also per solid of a part. */
    colors?: 'native' | 'distinct';
    /** Line style instead of shading: no fill, visible edges and silhouettes solid, hidden ones
     * dashed. Applies to the single view and every panel of a sheet. */
    lines?: boolean;
    /** A technical drawing: front, top and side view in line style, aligned at one scale, and a
     * shaded iso view in the free corner. `true` or `"first-angle"` (ISO 5456-2 method E): the top
     * view below the front view, the view from the left to its right. `"third-angle"` (method A):
     * the top view above the front view, the view from the right to its right.
     * `{ projection, side: "left" | "right", iso: boolean }` picks the side view or leaves the
     * corner empty. */
    drawing?: boolean | 'first-angle' | 'third-angle' | (string & {}) | {
        projection?: string;
        side?: string;
        iso?: boolean;
    } | null;
    /** Several shaded views in one picture: `true` (top, iso, front, right), a list of 4 views
     * (2 x 2) or of 2 views side by side. Named ortho views share one scale; the others fit
     * themselves. `drawing` wins over `sheet`. */
    sheet?: boolean | readonly (RenderView | null)[] | null;
    /** Cut at a plane and leave out what is on the positive side of its normal: a `Plane`, a
     * planar face, `[origin, normal]` or `{ origin, normal, cap }`. The picture keeps the framing
     * of the whole model. */
    section?: Plane | Face | readonly [
        Face
    ] | readonly [
        RenderPoint,
        VectorLike
    ] | {
        origin: RenderPoint;
        normal: VectorLike;
        cap?: boolean;
    } | false | null;
    /** Fill the cut faces of closed bodies, hatched at 45 degrees (neighbouring bodies alternate
     * the direction); bores and pockets stay open. `false` leaves the cut open and shows the
     * inside walls shaded darker. */
    cap?: boolean;
    /** Shapes drawn in signal colors: faces and bodies orange, edges red. Faces, edges, wires,
     * parts, vertices or selections (`part.edges().concave()`). */
    highlight?: Shape | Mesh | readonly (Shape | Mesh | readonly (Shape | Mesh)[])[] | null;
    /** Points; the face closest to each point is highlighted. */
    highlightAt?: VectorLike | Iterable<RenderPoint> | null;
    /** Crosshairs with labels, drawn on top: points `[x, y, z]`, `[point, label]` (or
     * `[point, label, color]`), or `{ position, label, color }`. */
    markers?: VectorLike | {
        position: RenderPoint;
        label?: string;
        color?: ColorLike | null;
    } | Iterable<RenderMarker> | null;
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
    zebra?: boolean | {
        stripes?: number;
        width?: number;
        direction?: 'vertical' | 'horizontal' | (string & {}) | VectorLike;
    } | null;
    /** A curvature map of the exact surfaces: `"mean"`, `"gaussian"`, `"max"` or `"min"` (the
     * principal curvatures). Blue is concave, white flat, red convex (a sphere of radius R has 1/R
     * everywhere); a legend gives the range in 1/mm (1/mm^2 for Gaussian).
     * `{ kind: "mean", range: 0.2 }` (or `[lo, hi]`) fixes the range; by default it spans the
     * values on the shapes. */
    curvature?: CurvatureKind | {
        kind?: CurvatureKind;
        range?: number | readonly [
            number,
            number
        ] | null;
    } | false | null;
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
export declare function render(...shapes: Renderable[]): Picture;
export declare function render(...args: [
    ...shapes: Renderable[],
    options: RenderOptions
]): Picture;
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
export declare function diffImages(a: Picture | ImageLike | Uint8Array | ArrayBuffer | string, b: Picture | ImageLike | Uint8Array | ArrayBuffer | string, tolerance?: number): ImageDiff;
export {};
