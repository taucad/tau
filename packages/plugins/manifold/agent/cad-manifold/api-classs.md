# manifold-3d — Classs

3 top-level symbols. Signatures are verbatim typescript.

// Two-dimensional cross sections guaranteed to be without self-intersections, or overlaps between polygons (from construction onwards)
CrossSection: export declare class CrossSection

constructor

// Constructs a square with the given XY dimensions
static square(size?: Readonly<Vec2>|number, center?: boolean): CrossSection;
// size: The X, and Y dimensions of the square
// center: Set to true to shift the center to the origin

// Constructs a circle of a given radius
static circle(radius: number, circularSegments?: number): CrossSection;
// radius: Radius of the circle
// circularSegments: Number of segments along its diameter

// Constructs a manifold by extruding the cross-section along Z-axis
extrude(
height: number, nDivisions?: number, twistDegrees?: number,
scaleTop?: Readonly<Vec2>|number, center?: boolean): Manifold;
// height: Z-extent of extrusion
// nDivisions: Number of extra copies of the crossSection to insert into the shape vertically
// twistDegrees: Amount to twist the top crossSection relative to the bottom, interpolated linearly for the divisions in between
// scaleTop: Amount to scale the top (independently in X and Y)
// center: If true, the extrusion is centered on the z-axis through the origin as opposed to resting on the XY plane as is default

// Constructs a manifold by revolving this cross-section around its Y-axis and then setting this as the Z-axis of the resulting manifold
revolve(circularSegments?: number, revolveDegrees?: number): Manifold;
// circularSegments: Number of segments along its diameter

// Transform this CrossSection in space
transform(m: Mat3): CrossSection;
// m: The affine transformation matrix to apply to all the vertices

// Move this CrossSection in space
translate(v: Readonly<Vec2>): CrossSection;
translate(x: number, y?: number): CrossSection;
translate(v: Readonly<Vec2>): CrossSection;
translate(x: number, y?: number): CrossSection;
// v: The vector to add to every vertex

// Applies a (Z-axis) rotation to the CrossSection, in degrees
rotate(degrees: number): CrossSection;
// degrees: degrees about the Z-axis to rotate

// Scale this CrossSection in space
scale(v: Readonly<Vec2>|number): CrossSection;
// v: The vector to multiply every vertex by per component

// Mirror this CrossSection over the arbitrary axis described by the unit form of the given vector
mirror(ax: Readonly<Vec2>): CrossSection;
// ax: the axis to be mirrored over

// Move the vertices of this CrossSection (creating a new one) according to any arbitrary input function, followed by a union operation (with a Positive fill rule) that ensures any introduced intersections are not included in the result
warp(warpFunc: (vert: Vec2) => void): CrossSection;
// warpFunc: A function that modifies a given vertex position

// Inflate the contours in CrossSection by the specified delta, handling corners according to the given JoinType
offset(
delta: number, joinType?: JoinType, miterLimit?: number,
circularSegments?: number): CrossSection;
// delta: Positive deltas will cause the expansion of outlining contours to expand, and retraction of inner (hole) contours
// joinType: The join type specifying the treatment of contour joins (corners)
// miterLimit: The maximum distance in multiples of delta that vertices can be offset from their original positions with before squaring is applied, **when the join type is Miter** (default is 2, which is the minimum allowed)
// circularSegments: Number of segments per 360 degrees of <B>JoinType::Round</B> corners (roughly, the number of vertices that will be added to each contour)

// Remove vertices from the contours in this CrossSection that are less than the specified distance epsilon from an imaginary line that passes through its two adjacent vertices
simplify(epsilon?: number): CrossSection;
// epsilon: minimum distance vertices must diverge from the hypothetical outline without them in order to be included in the output (default 1e-6)

// Boolean union
add(other: CrossSection|Polygons): CrossSection;

// Boolean difference
subtract(other: CrossSection|Polygons): CrossSection;

// Boolean intersection
intersect(other: CrossSection|Polygons): CrossSection;

// Boolean union of the cross-sections a and b Boolean union of a list of cross-sections
static union(a: CrossSection|Polygons, b: CrossSection|Polygons):
CrossSection;
static union(polygons: readonly(CrossSection|Polygons)[]): CrossSection;
static union(a: CrossSection|Polygons, b: CrossSection|Polygons):
CrossSection;
static union(polygons: readonly(CrossSection|Polygons)[]): CrossSection;

// Boolean difference of the cross-section b from the cross-section a Boolean difference of the tail of a list of cross-sections from its head
static difference(a: CrossSection|Polygons, b: CrossSection|Polygons):
CrossSection;
static difference(polygons: readonly(CrossSection|Polygons)[]): CrossSection;
static difference(a: CrossSection|Polygons, b: CrossSection|Polygons):
CrossSection;
static difference(polygons: readonly(CrossSection|Polygons)[]): CrossSection;

// Boolean intersection of the cross-sections a and b Boolean intersection of a list of cross-sections
static intersection(a: CrossSection|Polygons, b: CrossSection|Polygons):
CrossSection;
static intersection(polygons: readonly(CrossSection|Polygons)[]):
CrossSection;
static intersection(a: CrossSection|Polygons, b: CrossSection|Polygons):
CrossSection;
static intersection(polygons: readonly(CrossSection|Polygons)[]):
CrossSection;

// Compute the convex hull of the contours in this CrossSection
hull(): CrossSection;
static hull(polygons: readonly(CrossSection|Polygons)[]): CrossSection;

// Construct a CrossSection from a vector of other Polygons (batch boolean union)
static compose(polygons: readonly(CrossSection|Polygons)[]): CrossSection;

// This operation returns a vector of CrossSections that are topologically disconnected, each containing one outline contour with zero or more holes
decompose(): CrossSection[];

// Create a 2d cross-section from a set of contours (complex polygons)
static ofPolygons(contours: Polygons, fillRule?: FillRule): CrossSection;
// contours: A set of closed paths describing zero or more complex polygons
// fillRule: The filling rule used to interpret polygon sub-regions in contours

// Return the contours of this CrossSection as a list of simple polygons
toPolygons(): SimplePolygon[];

// Return the total area covered by complex polygons making up the CrossSection
area(): number;

// Does the CrossSection (not) have any contours?
isEmpty(): boolean;

// The number of vertices in the CrossSection
numVert(): number;

// The number of contours in the CrossSection
numContour(): number;

// Returns the axis-aligned bounding rectangle of all the CrossSection's vertices
bounds(): Rect;

// Frees the WASM memory of this CrossSection, since these cannot be garbage-collected automatically
delete(): void;

// This library's internal representation of an oriented, 2-manifold, triangle mesh - a simple boundary-representation of a solid object
Manifold: export declare class Manifold

constructor

// Constructs a tetrahedron centered at the origin with one vertex at (1,1,1) and the rest at similarly symmetric points
static tetrahedron(): Manifold;

// Constructs a unit cube (edge lengths all one), by default in the first octant, touching the origin
static cube(size?: Readonly<Vec3>|number, center?: boolean): Manifold;
// size: The X, Y, and Z dimensions of the box
// center: Set to true to shift the center to the origin

// A convenience constructor for the common case of extruding a circle
static cylinder(
height: number, radiusLow: number, radiusHigh?: number,
circularSegments?: number, center?: boolean): Manifold;
// height: Z-extent
// radiusLow: Radius of bottom circle
// radiusHigh: Radius of top circle
// circularSegments: How many line segments to use around the circle
// center: Set to true to shift the center to the origin

// Constructs a geodesic sphere of a given radius
static sphere(radius: number, circularSegments?: number): Manifold;
// radius: Radius of the sphere
// circularSegments: Number of segments along its diameter

// Constructs a manifold from a set of polygons/cross-section by extruding them along the Z-axis
static extrude(
polygons: CrossSection|Polygons, height: number, nDivisions?: number,
twistDegrees?: number, scaleTop?: Readonly<Vec2>|number,
center?: boolean): Manifold;
// polygons: A set of non-overlapping polygons to extrude
// height: Z-extent of extrusion
// nDivisions: Number of extra copies of the crossSection to insert into the shape vertically
// twistDegrees: Amount to twist the top crossSection relative to the bottom, interpolated linearly for the divisions in between
// scaleTop: Amount to scale the top (independently in X and Y)
// center: If true, the extrusion is centered on the z-axis through the origin as opposed to resting on the XY plane as is default

// Constructs a manifold from a set of polygons/cross-section by revolving them around the Y-axis and then setting this as the Z-axis of the resulting manifold
static revolve(
polygons: CrossSection|Polygons, circularSegments?: number,
revolveDegrees?: number): Manifold;
// polygons: A set of non-overlapping polygons to revolve
// circularSegments: Number of segments along its diameter
// revolveDegrees: Number of degrees to revolve

// Convert a Mesh into a Manifold, retaining its properties and merging only the positions according to the merge vectors
static ofMesh(mesh: Mesh): Manifold;

// Constructs a smooth version of the input mesh by creating tangents
static smooth(mesh: Mesh, sharpenedEdges?: readonly Smoothness[]): Manifold;
// mesh: input Mesh
// sharpenedEdges: If desired, you can supply a vector of sharpened halfedges, which should in general be a small subset of all halfedges

// Constructs a level-set Mesh from the input Signed-Distance Function (SDF)
static levelSet(
sdf: (point: Vec3) => number, bounds: Box, edgeLength: number,
level?: number, tolerance?: number): Manifold;
// sdf: The signed-distance function which returns the signed distance of a given point in R^3
// bounds: An axis-aligned box that defines the extent of the grid
// edgeLength: Approximate maximum edge length of the triangles in the final result
// level: You can inset your Mesh by using a positive value, or outset it with a negative value
// tolerance: Ensure each vertex is within this distance of the true surface

// Transform this Manifold in space
transform(m: Mat4): Manifold;
// m: The affine transformation matrix to apply to all the vertices

// Move this Manifold in space
translate(v: Readonly<Vec3>): Manifold;
translate(x: number, y?: number, z?: number): Manifold;
translate(v: Readonly<Vec3>): Manifold;
translate(x: number, y?: number, z?: number): Manifold;
// v: The vector to add to every vertex

// Applies an Euler or Tait-Bryan angle rotation to the manifold
rotate(v: Readonly<Vec3>): Manifold;
rotate(x: number, y?: number, z?: number): Manifold;
rotate(v: Readonly<Vec3>): Manifold;
rotate(x: number, y?: number, z?: number): Manifold;
// v: [X, Y, Z] rotation in degrees

// Scale this Manifold in space
scale(v: Readonly<Vec3>|number): Manifold;
// v: The vector to multiply every vertex by per component

// Mirror this Manifold over the plane described by the unit form of the given normal vector
mirror(normal: Readonly<Vec3>): Manifold;
// normal: The normal vector of the plane to be mirrored over

// This function does not change the topology, but allows the vertices to be moved according to any arbitrary input function
warp(warpFunc: (vert: Vec3) => void): Manifold;
// warpFunc: A function that modifies a given vertex position

// Smooths out the Manifold by filling in the halfedgeTangent vectors
smoothByNormals(normalIdx: number): Manifold;
// normalIdx: The first property channel of the normals

// Smooths out the Manifold by filling in the halfedgeTangent vectors
smoothOut(minSharpAngle?: number, minSmoothness?: number): Manifold;
// minSharpAngle: degrees, default 60
// minSmoothness: range

// Increase the density of the mesh by splitting every edge into n pieces
refine(n: number): Manifold;
// n: The number of pieces to split every edge into

// Increase the density of the mesh by splitting each edge into pieces of roughly the input length
refineToLength(length: number): Manifold;
// length: The length that edges will be broken down to

// Increase the density of the mesh by splitting each edge into pieces such that any point on the resulting triangles is roughly within tolerance of the smoothly curved surface defined by the tangent vectors
refineToTolerance(tolerance: number): Manifold;
// tolerance: The desired maximum distance between the faceted mesh produced and the exact smoothly curving surface

// Create a new copy of this manifold with updated vertex properties by supplying a function that takes the existing position and properties as input
setProperties(
numProp: number,
propFunc: (newProp: number[], position: Vec3, oldProp: number[]) => void):
Manifold;
// numProp: The new number of properties per vertex
// propFunc: A function that modifies the properties of a given vertex

// Curvature is the inverse of the radius of curvature, and signed such that positive is convex and negative is concave
calculateCurvature(gaussianIdx: number, meanIdx: number): Manifold;
// gaussianIdx: The property channel index in which to store the Gaussian curvature
// meanIdx: The property channel index in which to store the mean curvature

// Fills in vertex properties for normal vectors, calculated from the mesh geometry
calculateNormals(normalIdx: number, minSharpAngle?: number): Manifold;
// normalIdx: The property channel in which to store the X values of the normals
// minSharpAngle: Any edges with angles greater than this value will remain sharp, getting different normal vector properties on each side of the edge

// Boolean union
add(other: Manifold): Manifold;

// Boolean difference
subtract(other: Manifold): Manifold;

// Boolean intersection
intersect(other: Manifold): Manifold;

// Boolean union of the manifolds a and b Boolean union of a list of manifolds
static union(a: Manifold, b: Manifold): Manifold;
static union(manifolds: readonly Manifold[]): Manifold;
static union(a: Manifold, b: Manifold): Manifold;
static union(manifolds: readonly Manifold[]): Manifold;

// Boolean difference of the manifold b from the manifold a Boolean difference of the tail of a list of manifolds from its head
static difference(a: Manifold, b: Manifold): Manifold;
static difference(manifolds: readonly Manifold[]): Manifold;
static difference(a: Manifold, b: Manifold): Manifold;
static difference(manifolds: readonly Manifold[]): Manifold;

// Boolean intersection of the manifolds a and b Boolean intersection of a list of manifolds
static intersection(a: Manifold, b: Manifold): Manifold;
static intersection(manifolds: readonly Manifold[]): Manifold;
static intersection(a: Manifold, b: Manifold): Manifold;
static intersection(manifolds: readonly Manifold[]): Manifold;

// Split cuts this manifold in two using the cutter manifold
split(cutter: Manifold): [Manifold, Manifold];

// Convenient version of Split() for a half-space
splitByPlane(normal: Readonly<Vec3>, originOffset: number):
[Manifold, Manifold];
// normal: This vector is normal to the cutting plane and its length does not matter
// originOffset: The distance of the plane from the origin in the direction of the normal vector

// Removes everything behind the given half-space plane
trimByPlane(normal: Readonly<Vec3>, originOffset: number): Manifold;
// normal: This vector is normal to the cutting plane and its length does not matter
// originOffset: The distance of the plane from the origin in the direction of the normal vector

// Compute the minkowski sum of this manifold with another
minkowskiSum(other: Manifold): Manifold;
// other: The other manifold to minkowski sum to this one

// Subtract the sweep of the other manifold across this manifold's surface
minkowskiDifference(other: Manifold): Manifold;
// other: The other manifold to minkowski subtract from this one

// Returns the cross section of this object parallel to the X-Y plane at the specified height
slice(height: number): CrossSection;
// height: Z-level of slice

// Returns a cross section representing the projected outline of this object onto the X-Y plane
project(): CrossSection;

// Compute the convex hull of all points in this Manifold
hull(): Manifold;
static hull(points: readonly(Manifold|Vec3)[]): Manifold;

// Constructs a new manifold from a list of other manifolds
// DEPRECATED: Please use {@link add} or {@link union} instead.
static compose(manifolds: readonly Manifold[]): Manifold;
// manifolds: A list of Manifolds to lazy-union together

// This operation returns a vector of Manifolds that are topologically disconnected
decompose(): Manifold[];

// Does the Manifold have any triangles?
isEmpty(): boolean;

// The number of vertices in the Manifold
numVert(): number;

// The number of triangles in the Manifold
numTri(): number;

// The number of edges in the Manifold
numEdge(): number;

// The number of properties per vertex in the Manifold
numProp(): number;

// The number of property vertices in the Manifold
numPropVert(): number

// Returns the axis-aligned bounding box of all the Manifold's vertices
boundingBox(): Box;

// Returns the tolerance of this Manifold's vertices, which tracks the approximate rounding error over all the transforms and operations that have led to this state
tolerance(): number;

// Return a copy of the manifold with the set tolerance value
setTolerance(tolerance: number): Manifold;

// Return a copy of the manifold simplified to the given tolerance, but with its actual tolerance value unchanged
simplify(tolerance?: number): Manifold;
// tolerance: The maximum distance between the original and simplified meshes

// The genus is a topological property of the manifold, representing the number of "handles"
genus(): number;

// Returns the surface area of the manifold
surfaceArea(): number;

// Returns the volume of the manifold
volume(): number;

// Returns the minimum gap between two manifolds
minGap(other: Manifold, searchLength: number): number;

// Returns the reason for an input Mesh producing an empty Manifold
status(): ErrorStatus;

// Returns a Mesh that is designed to easily push into a renderer, including all interleaved vertex properties that may have been input
getMesh(normalIdx?: number): Mesh;
// normalIdx: If the original MeshGL inputs that formed this manifold had properties corresponding to normal vectors, you can specify the first of the three consecutive property channels forming the (x, y, z) normals, which will cause this output MeshGL to automatically update these normals according to the applied transforms and front/back side

// If you copy a manifold, but you want this new copy to have new properties (e.g
asOriginal(): Manifold;

// If this mesh is an original, this returns its ID that can be referenced by product manifolds
originalID(): number;

// Returns the first of n sequential new unique mesh IDs for marking sets of triangles that can be looked up after further operations
static reserveIDs(count: number): number;

// Frees the WASM memory of this Manifold, since these cannot be garbage-collected automatically
delete(): void;

// An alternative to Mesh for output suitable for pushing into graphics libraries directly
Mesh: export declare class Mesh

constructor

// Number of properties per vertex, always >= 3
numProp: number

// Flat, GL-style interleaved list of all vertex properties
vertProperties: Float32Array

// The vertex indices of the three triangle corners in CCW (from the outside) order, for each triangle
triVerts: Uint32Array

// Optional
mergeFromVert: Uint32Array

// Optional
mergeToVert: Uint32Array

// Optional
runIndex: Uint32Array

// Optional
runOriginalID: Uint32Array

// Optional
runTransform: Float32Array

// Optional
faceID: Uint32Array

// Optional
halfedgeTangent: Float32Array

// Tolerance for mesh simplification
tolerance: number

// Number of triangles
numTri

// Number of property vertices
numVert

// Number of triangle runs
numRun

// Updates the mergeFromVert and mergeToVert vectors in order to create a manifold solid
merge(): boolean;

// Gets the three vertex indices of this triangle in CCW order
verts(tri: number): SealedUint32Array<3>;
// tri: triangle index

// Gets the x, y, z position of this vertex
position(vert: number): SealedFloat32Array<3>;
// vert: vertex index

// Gets any other properties associated with this vertex
extras(vert: number): Float32Array;
// vert: vertex index

// Gets the tangent vector starting at verts(tri)[j] pointing to the next Bezier point along the CCW edge
tangent(halfedge: number): SealedFloat32Array<4>;
// halfedge: halfedge index

// Gets the column-major 4x4 matrix transform from the original mesh to these related triangles
transform(run: number): Mat4;
// run: triangle run index
