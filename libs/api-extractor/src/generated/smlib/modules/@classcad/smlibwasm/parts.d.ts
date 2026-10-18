import { type AlignLike } from './align.js';
import { Part } from './shapes.js';
/** A box of `length` (X) by `width` (Y) by `height` (Z). */
export declare function Box(length: number, width: number, height: number, options?: {
    align?: AlignLike;
}): Part;
/** A cylinder along Z. */
export declare function Cylinder(radius: number, height: number, options?: {
    align?: AlignLike;
}): Part;
/** A cone (or frustum) along Z; one of the radii may be zero. */
export declare function Cone(bottomRadius: number, topRadius: number, height: number, options?: {
    align?: AlignLike;
}): Part;
/** A sphere. */
export declare function Sphere(radius: number, options?: {
    align?: AlignLike;
}): Part;
/** A torus around Z. */
export declare function Torus(majorRadius: number, minorRadius: number, options?: {
    align?: AlignLike;
}): Part;
/** A ramp: a `length` (X) by `width` (Y) base whose high side, `height` tall, is the face at
 * x = -length/2; the slope runs down towards +X. `topLength` gives a flat top of that length,
 * measured from the -X end. */
export declare function Wedge(length: number, width: number, height: number, topLength?: number, options?: {
    align?: AlignLike;
}): Part;
/** A drilling tool: a cylinder from the origin down to `-depth`. */
export declare function Hole(radius: number, depth: number): Part;
/** A drilling tool with a counterbore at the top. */
export declare function CounterBoreHole(radius: number, counterBoreRadius: number, counterBoreDepth: number, depth: number): Part;
/** A drilling tool with a conical countersink of included `angle` at the top. */
export declare function CounterSinkHole(radius: number, counterSinkRadius: number, depth: number, angle?: number): Part;
