import { type AlignLike } from './align.js';
import { Part } from './shapes.js';
/** A box of `length` (X) by `width` (Y) by `height` (Z). */
export declare function Box(length: number, width: number, height: number, options?: {
    align?: AlignLike;
}): Part;
/**
 * A cylinder along Z.
 *
 * `arcSize` (degrees, at most 360) makes a sector: the part of the cylinder from the +X axis
 * counter-clockwise about +Z (planes on its two sides). Like every primitive it is centered by its
 * bounding box, so a sector's axis moves off Z; `align: null` keeps it on Z (the sector of the
 * centered cylinder).
 */
export declare function Cylinder(radius: number, height: number, options?: {
    arcSize?: number;
    align?: AlignLike;
}): Part;
/** A cone (or frustum) along Z; one of the radii may be zero. `arcSize` makes a sector, as for
 * `Cylinder`. */
export declare function Cone(bottomRadius: number, topRadius: number, height: number, options?: {
    arcSize?: number;
    align?: AlignLike;
}): Part;
/**
 * A sphere, or a part of one.
 *
 * `arcSize1` and `arcSize2` are the latitudes (degrees, -90 at the bottom pole to 90 at the top) it
 * reaches from and to: planes parallel to XY cut it there. `arcSize3` (at most 360) is the longitude
 * it spans, from the +X axis counter-clockwise about +Z (planes through the Z axis on its sides). A
 * part of a sphere is centered by its bounding box; `align: null` keeps the sphere's center at the
 * origin.
 */
export declare function Sphere(radius: number, options?: {
    arcSize1?: number;
    arcSize2?: number;
    arcSize3?: number;
    align?: AlignLike;
}): Part;
/**
 * A torus around Z.
 *
 * `majorAngle` (degrees, at most 360) makes a sector of it, from the +X axis counter-clockwise about
 * +Z, with round ends. `minorStartAngle` and `minorEndAngle` (degrees) keep the part of the tube's
 * circle between them, as build123d does: measured in the tube's section from the side away from the
 * axis (0) towards +Z (90), the section a slice of the circle from its center (cones, planes or
 * cylinders where the slice's straight sides go round). A part of a torus is centered by its bounding
 * box (`align: null` keeps the torus's center at the origin).
 *
 *     const topHalf = Torus(20, 5, { minorStartAngle: 0, minorEndAngle: 180 })
 *     const bead = Torus(20, 5, { minorStartAngle: -90, minorEndAngle: 90 }) // the outer half
 */
export declare function Torus(majorRadius: number, minorRadius: number, options?: {
    minorStartAngle?: number;
    minorEndAngle?: number;
    majorAngle?: number;
    align?: AlignLike;
}): Part;
/** A pyramid: a `length` (X) by `width` (Y) rectangle at the bottom, its apex `height` (Z) above the
 * rectangle's center; five planes. Centered by its bounding box. */
export declare function Pyramid(length: number, width: number, height: number, options?: {
    align?: AlignLike;
}): Part;
/** A ramp: a `length` (X) by `width` (Y) base whose high side, `height` tall, is the face at
 * x = -length/2; the slope runs down towards +X. `topLength` gives a flat top of that length,
 * measured from the -X end. */
export declare function Wedge(length: number, width: number, height: number, topLength?: number, options?: {
    align?: AlignLike;
}): Part;
/** A sector of a tube along Z: between `innerRadius` and `outerRadius` from the Z axis, `height`
 * tall, `arcSize` degrees (at most 360: a whole tube) from the +X axis counter-clockwise about +Z. An
 * `innerRadius` of 0 gives a sector of a cylinder. Centered by its bounding box; `align: null` keeps
 * the axis on Z (z from -height/2 to height/2). */
export declare function AnnularSector(innerRadius: number, outerRadius: number, height: number, arcSize: number, options?: {
    align?: AlignLike;
}): Part;
/** A drilling tool: a cylinder from the origin down to `-depth`. */
export declare function Hole(radius: number, depth: number): Part;
/** A drilling tool with a counterbore at the top. */
export declare function CounterBoreHole(radius: number, counterBoreRadius: number, counterBoreDepth: number, depth: number): Part;
/** A drilling tool with a conical countersink of included `angle` at the top. */
export declare function CounterSinkHole(radius: number, counterSinkRadius: number, depth: number, angle?: number): Part;
