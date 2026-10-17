import { type BoundBox, Vector } from './geometry.js';
/**
 * How a new shape sits relative to the origin along an axis.
 *
 * `MIN` puts the shape's lower bound at the origin, `CENTER` centers it, `MAX` puts its upper
 * bound at the origin. Constructors take one value for all axes or one per axis:
 * `Box(10, 10, 2, { align: [Align.CENTER, Align.CENTER, Align.MIN] })` stands the box on the XY
 * plane.
 */
export declare const Align: {
    readonly MIN: "min";
    readonly CENTER: "center";
    readonly MAX: "max";
};
export type Align = (typeof Align)[keyof typeof Align];
/** One alignment for all axes, or one per axis (null leaves an axis alone). */
export type AlignLike = Align | string | null | readonly (Align | string | null)[];
export declare function _one(a: Align | string | null): Align | null;
/** Translation that aligns `box` as requested (axes beyond `dims` are left alone). */
export declare function alignmentOffset(box: BoundBox, align: AlignLike, dims?: number): Vector;
