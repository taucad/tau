# manifold-3d — Functions

7 top-level symbols. Signatures are verbatim typescript.

// Determine the result of the {@link setMinCircularAngle}, {@link setMinCircularEdgeLength}, and {@link setCircularSegments} defaults
export declare function getCircularSegments(radius: number): number;
//   radius: For a given radius of circle, determine how many default segments there will be

// Resets the circular construction parameters to their defaults if {@link setMinCircularAngle}, {@link setMinCircularEdgeLength}, or {@link * setCircularSegments} have been called
export declare function resetToCircularDefaults(): void;

// Sets the default number of circular segments for the {@link CrossSection.circle}, {@link Manifold.cylinder}, {@link * Manifold.sphere}, and {@link Manifold.revolve} constructors
export declare function setCircularSegments(segments: number): void;
//   segments: Number of circular segments

// Sets an angle constraint the default number of circular segments for the {@link CrossSection.circle}, {@link Manifold.cylinder}, {@link * Manifold.sphere}, and {@link Manifold.revolve} constructors
export declare function setMinCircularAngle(angle: number): void;
//   angle: The minimum angle in degrees between consecutive segments

// Sets a length constraint the default number of circular segments for the {@link CrossSection.circle}, {@link Manifold.cylinder}, {@link * Manifold.sphere}, and {@link Manifold.revolve} constructors
export declare function setMinCircularEdgeLength(length: number): void;
//   length: The minimum length of segments

// Triangulates a set of /epsilon-valid polygons
export declare function triangulate(
polygons: Polygons, epsilon?: number, allowConvex?: boolean): Vec3[];
//   polygons: The set of polygons, wound CCW and representing multiple polygons and/or holes
//   epsilon: The value of epsilon, bounding the uncertainty of the input
//   allowConvex: If true (default), the triangulator will use a fast triangulation if the input is convex, falling back to ear-clipping if not

declare function Module(config?: {locateFile: () => string}):
Promise<ManifoldToplevel>;
