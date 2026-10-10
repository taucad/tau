# manifold-3d — Classes

5 top-level symbols. Signatures are verbatim typescript.

// The abstract class from which other classes inherit
BaseGLTFNode: export declare abstract class BaseGLTFNode

  name?: string

  translation?: Vec3 | ((t: number) => Vec3)

  // From the reference frame of the model being rotated, rotations are applied in *z-y'-x"* order
  // Remarks: From the global reference frame, a model will be rotated in *x-y-z* order. That is about the global X axis, then global Y axis, and finally global Z. This matches the behaviour of `Manifold.rotate()`.
  rotation?: Vec3 | ((t: number) => Vec3)

  scale?: Vec3 | ((t: number) => Vec3)

  // BaseGLTFNode.constructor (constructor)
  constructor(parent?: BaseGLTFNode);

  readonly parent: BaseGLTFNode | undefined

  // Does this node have any geometry that needs to be converted on export?
  // BaseGLTFNode.isEmpty (method)
  isEmpty(): boolean;

// Two-dimensional cross sections guaranteed to be without self-intersections, or overlaps between polygons (from construction onwards)
CrossSection: export declare class CrossSection

  // CrossSection.constructor (constructor)
  constructor(contours: Polygons, fillRule?: FillRule);
  //   contours: A set of closed paths describing zero or more complex polygons
  //   fillRule: The filling rule used to interpret polygon sub-regions in contours

  // Constructs a square with the given XY dimensions
  // CrossSection.square (method)
  static square(size?: Readonly<Vec2>|number, center?: boolean): CrossSection;
  //   size: The X, and Y dimensions of the square
  //   center: Set to true to shift the center to the origin

  // Constructs a circle of a given radius
  // CrossSection.circle (method)
  static circle(radius: number, circularSegments?: number): CrossSection;
  //   radius: Radius of the circle
  //   circularSegments: Number of segments along its diameter

  // Constructs a manifold by extruding the cross-section along Z-axis
  // CrossSection.extrude (method)
  extrude(
      height: number, nDivisions?: number, twistDegrees?: number,
      scaleTop?: Readonly<Vec2>|number, center?: boolean): Manifold;
  //   height: Z-extent of extrusion
  //   nDivisions: Number of extra copies of the crossSection to insert into the shape vertically
  //   twistDegrees: Amount to twist the top crossSection relative to the bottom, interpolated linearly for the divisions in between
  //   scaleTop: Amount to scale the top (independently in X and Y)
  //   center: If true, the extrusion is centered on the z-axis through the origin as opposed to resting on the XY plane as is default

  // Constructs a manifold by revolving this cross-section around its Y-axis and then setting this as the Z-axis of the resulting manifold
  // CrossSection.revolve (method)
  revolve(circularSegments?: number, revolveDegrees?: number): Manifold;
  //   circularSegments: Number of segments along its diameter

  // Transform this CrossSection in space
  // CrossSection.transform (method)
  transform(m: Mat3): CrossSection;
  //   m: The affine transformation matrix to apply to all the vertices

  // Move this CrossSection in space
  // CrossSection.translate (method)
  translate(v: Readonly<Vec2>): CrossSection;
  translate(x: number, y?: number): CrossSection;
  //   v: The vector to add to every vertex

  // Applies a (Z-axis) rotation to the CrossSection, in degrees
  // CrossSection.rotate (method)
  rotate(degrees: number): CrossSection;
  //   degrees: degrees about the Z-axis to rotate

  // Scale this CrossSection in space
  // CrossSection.scale (method)
  scale(v: Readonly<Vec2>|number): CrossSection;
  //   v: The vector to multiply every vertex by per component

  // Mirror this CrossSection over the arbitrary axis described by the unit form of the given vector
  // CrossSection.mirror (method)
  mirror(ax: Readonly<Vec2>): CrossSection;
  //   ax: the axis to be mirrored over

  // Move the vertices of this CrossSection (creating a new one) according to any arbitrary input function, followed by a union operation (with a Positive fill rule) that ensures any introduced intersections are not included in the result
  // CrossSection.warp (method)
  warp(warpFunc: (vert: Vec2) => void): CrossSection;
  //   warpFunc: A function that modifies a given vertex position

  // Inflate the contours in CrossSection by the specified delta, handling corners according to the given JoinType
  // CrossSection.offset (method)
  offset(
      delta: number, joinType?: JoinType, miterLimit?: number,
      circularSegments?: number): CrossSection;
  //   delta: Positive deltas will cause the expansion of outlining contours to expand, and retraction of inner (hole) contours
  //   joinType: The join type specifying the treatment of contour joins (corners)
  //   miterLimit: The maximum distance in multiples of delta that vertices can be offset from their original positions with before squaring is applied, **when the join type is Miter** (default is 2, which is the minimum allowed)
  //   circularSegments: Number of segments per 360 degrees of <B>JoinType::Round</B> corners (roughly, the number of vertices that will be added to each contour)

  // Remove vertices from the contours in this CrossSection that are less than the specified distance epsilon from an imaginary line that passes through its two adjacent vertices
  // Remarks: It is recommended to apply this function following Offset, in order to clean up any spurious tiny line segments introduced that do not improve quality in any meaningful way. This is particularly important if further offseting operations are to be performed, which would compound the issue.
  // CrossSection.simplify (method)
  simplify(epsilon?: number): CrossSection;
  //   epsilon: minimum distance vertices must diverge from the hypothetical outline without them in order to be included in the output (default 1e-6)

  // Boolean union
  // CrossSection.add (method)
  add(other: CrossSection|Polygons): CrossSection;

  // Boolean difference
  // CrossSection.subtract (method)
  subtract(other: CrossSection|Polygons): CrossSection;

  // Boolean intersection
  // CrossSection.intersect (method)
  intersect(other: CrossSection|Polygons): CrossSection;

  // Boolean union of the cross-sections a and b Boolean union of a list of cross-sections
  // CrossSection.union (method)
  static union(a: CrossSection|Polygons, b: CrossSection|Polygons):
      CrossSection;
  static union(polygons: readonly(CrossSection|Polygons)[]): CrossSection;

  // Boolean difference of the cross-section b from the cross-section a Boolean difference of the tail of a list of cross-sections from its head
  // CrossSection.difference (method)
  static difference(a: CrossSection|Polygons, b: CrossSection|Polygons):
      CrossSection;
  static difference(polygons: readonly(CrossSection|Polygons)[]): CrossSection;

  // Boolean intersection of the cross-sections a and b Boolean intersection of a list of cross-sections
  // CrossSection.intersection (method)
  static intersection(a: CrossSection|Polygons, b: CrossSection|Polygons):
      CrossSection;
  static intersection(polygons: readonly(CrossSection|Polygons)[]):
      CrossSection;

  // Compute the convex hull of the contours in this CrossSection
  // CrossSection.hull (method)
  hull(): CrossSection;
  static hull(polygons: readonly(CrossSection|Polygons)[]): CrossSection;

  // Construct a CrossSection from a vector of other Polygons (batch boolean union)
  // CrossSection.compose (method)
  static compose(polygons: readonly(CrossSection|Polygons)[]): CrossSection;

  // This operation returns a vector of CrossSections that are topologically disconnected, each containing one outline contour with zero or more holes
  // CrossSection.decompose (method)
  decompose(): CrossSection[];

  // Create a 2d cross-section from a set of contours (complex polygons)
  // CrossSection.ofPolygons (method)
  static ofPolygons(contours: Polygons, fillRule?: FillRule): CrossSection;
  //   contours: A set of closed paths describing zero or more complex polygons
  //   fillRule: The filling rule used to interpret polygon sub-regions in contours

  // Return the contours of this CrossSection as a list of simple polygons
  // CrossSection.toPolygons (method)
  toPolygons(): SimplePolygon[];

  // Return the total area covered by complex polygons making up the CrossSection
  // CrossSection.area (method)
  area(): number;

  // Does the CrossSection (not) have any contours?
  // CrossSection.isEmpty (method)
  isEmpty(): boolean;

  // The number of vertices in the CrossSection
  // CrossSection.numVert (method)
  numVert(): number;

  // The number of contours in the CrossSection
  // CrossSection.numContour (method)
  numContour(): number;

  // Returns the axis-aligned bounding rectangle of all the CrossSection's vertices
  // CrossSection.bounds (method)
  bounds(): Rect;

  // Frees the WASM memory of this CrossSection, since these cannot be garbage-collected automatically
  // CrossSection.delete (method)
  delete(): void;

// Display a CrossSection in 3D space
// Remarks: A CrossSection object is two dimensional. Attaching it as a node allows it to be included in the final exported file, complete with transformations. > [!NOTE] > > CrossSections are not -- and can never be -- manifold. That means > some exporters (like `.3mf`) will just skip over them entirely.
CrossSectionGLTFNode: export declare class CrossSectionGLTFNode extends BaseGLTFNode

  crossSection?: CrossSection

  material?: GLTFMaterial

  // CrossSectionGLTFNode.constructor (constructor)
  constructor(parent?: BaseGLTFNode);

  // CrossSectionGLTFNode.clone (method)
  clone(newParent?: BaseGLTFNode): CrossSectionGLTFNode;

  // Does this node have any geometry that needs to be converted on export?
  // CrossSectionGLTFNode.isEmpty (method)
  isEmpty(): boolean;

  // Get the runID for this node
  // Remarks: We don't need these for regular operations, but they do help when converting to meshes for export.
  readonly runID: number

// Position a manifold model for later export
GLTFNode: export declare class GLTFNode extends BaseGLTFNode

  manifold?: Manifold

  material?: GLTFMaterial

  // GLTFNode.clone (method)
  clone(newParent?: BaseGLTFNode): GLTFNode;

  // Does this node have any geometry that needs to be converted on export?
  // GLTFNode.isEmpty (method)
  isEmpty(): boolean;

// This library's internal representation of an oriented, 2-manifold, triangle mesh - a simple boundary-representation of a solid object
// Remarks: In addition to storing geometric data, a Manifold can also store an arbitrary number of vertex properties. These could be anything, e.g. normals, UV coordinates, colors, etc, but this library is completely agnostic. All properties are merely float values indexed by channel number. It is up to the user to associate channel numbers with meaning. Manifold allows vertex properties to be shared for efficient storage, or to have multiple property verts associated with a single geometric vertex, allowing sudden property changes, e.g. at Boolean intersections, without sacrificing manifoldness. Manifolds also keep track of their relationships to their inputs, via OriginalIDs and the faceIDs and transforms accessible through MeshGL. This allows object-level properties to be re-associated with the output after many operations, particularly useful for materials. Since separate object's properties are not mixed, there is no requirement that channels have consistent meaning between different inputs.
Manifold: export declare class Manifold

  // Manifold.constructor (constructor)
  constructor(mesh: Mesh);

  // Constructs a tetrahedron centered at the origin with one vertex at (1,1,1) and the rest at similarly symmetric points
  // Manifold.tetrahedron (method)
  static tetrahedron(): Manifold;

  // Constructs a unit cube (edge lengths all one), by default in the first octant, touching the origin
  // Manifold.cube (method)
  static cube(size?: Readonly<Vec3>|number, center?: boolean): Manifold;
  //   size: The X, Y, and Z dimensions of the box
  //   center: Set to true to shift the center to the origin

  // A convenience constructor for the common case of extruding a circle
  // Manifold.cylinder (method)
  static cylinder(
      height: number, radiusLow: number, radiusHigh?: number,
      circularSegments?: number, center?: boolean): Manifold;
  //   height: Z-extent
  //   radiusLow: Radius of bottom circle
  //   radiusHigh: Radius of top circle
  //   circularSegments: How many line segments to use around the circle
  //   center: Set to true to shift the center to the origin

  // Constructs a geodesic sphere of a given radius
  // Manifold.sphere (method)
  static sphere(radius: number, circularSegments?: number): Manifold;
  //   radius: Radius of the sphere
  //   circularSegments: Number of segments along its diameter

  // Constructs a manifold from a set of polygons/cross-section by extruding them along the Z-axis
  // Manifold.extrude (method)
  static extrude(
      polygons: CrossSection|Polygons, height: number, nDivisions?: number,
      twistDegrees?: number, scaleTop?: Readonly<Vec2>|number,
      center?: boolean): Manifold;
  //   polygons: A set of non-overlapping polygons to extrude
  //   height: Z-extent of extrusion
  //   nDivisions: Number of extra copies of the crossSection to insert into the shape vertically
  //   twistDegrees: Amount to twist the top crossSection relative to the bottom, interpolated linearly for the divisions in between
  //   scaleTop: Amount to scale the top (independently in X and Y)
  //   center: If true, the extrusion is centered on the z-axis through the origin as opposed to resting on the XY plane as is default

  // Constructs a manifold from a set of polygons/cross-section by revolving them around the Y-axis and then setting this as the Z-axis of the resulting manifold
  // Manifold.revolve (method)
  static revolve(
      polygons: CrossSection|Polygons, circularSegments?: number,
      revolveDegrees?: number): Manifold;
  //   polygons: A set of non-overlapping polygons to revolve
  //   circularSegments: Number of segments along its diameter
  //   revolveDegrees: Number of degrees to revolve

  // Convert a Mesh into a Manifold, retaining its properties and merging only the positions according to the merge vectors
  // Remarks: All fields are read, making this structure suitable for a lossless round-trip of data from getMesh(). For multi-material input, use reserveIDs() to set a unique originalID for each material, and sort the materials into triangle runs.
  // Manifold.ofMesh (method)
  static ofMesh(mesh: Mesh): Manifold;

  // Constructs a smooth version of the input mesh by creating tangents
  // Remarks: By default, every edge is calculated for maximum smoothness (very much approximately), attempting to minimize the maximum mean Curvature magnitude. No higher-order derivatives are considered, as the interpolation is independent per triangle, only sharing constraints on their boundaries.
  // Manifold.smooth (method)
  static smooth(mesh: Mesh, sharpenedEdges?: readonly Smoothness[]): Manifold;
  //   mesh: input Mesh
  //   sharpenedEdges: If desired, you can supply a vector of sharpened halfedges, which should in general be a small subset of all halfedges

  // Constructs a level-set Mesh from the input Signed-Distance Function (SDF)
  // Manifold.levelSet (method)
  static levelSet(
      sdf: (point: Vec3) => number, bounds: Box, edgeLength: number,
      level?: number, tolerance?: number): Manifold;
  //   sdf: The signed-distance function which returns the signed distance of a given point in R^3
  //   bounds: An axis-aligned box that defines the extent of the grid
  //   edgeLength: Approximate maximum edge length of the triangles in the final result
  //   level: You can inset your Mesh by using a positive value, or outset it with a negative value
  //   tolerance: Ensure each vertex is within this distance of the true surface

  // Transform this Manifold in space
  // Manifold.transform (method)
  transform(m: Mat4): Manifold;
  //   m: The affine transformation matrix to apply to all the vertices

  // Move this Manifold in space
  // Manifold.translate (method)
  translate(v: Readonly<Vec3>): Manifold;
  translate(x: number, y?: number, z?: number): Manifold;
  //   v: The vector to add to every vertex

  // Applies an Euler or Tait-Bryan angle rotation to the manifold
  // Remarks: We use degrees so that we can minimize rounding error, and eliminate it completely for any multiples of 90 degrees. Additionally, more efficient code paths are used to update the manifold when the transforms only rotate by multiples of 90 degrees. From the reference frame of the model being rotated, rotations are applied in *z-y'-x"* order. That is yaw first, then pitch and finally roll. From the global reference frame, a model will be rotated in *x-y-z* order. That is about the global X axis, then global Y axis, and finally global Z.
  // Manifold.rotate (method)
  rotate(v: Readonly<Vec3>): Manifold;
  rotate(x: number, y?: number, z?: number): Manifold;
  //   v: [X, Y, Z] rotation in degrees

  // Scale this Manifold in space
  // Manifold.scale (method)
  scale(v: Readonly<Vec3>|number): Manifold;
  //   v: The vector to multiply every vertex by per component

  // Mirror this Manifold over the plane described by the unit form of the given normal vector
  // Manifold.mirror (method)
  mirror(normal: Readonly<Vec3>): Manifold;
  //   normal: The normal vector of the plane to be mirrored over

  // This function does not change the topology, but allows the vertices to be moved according to any arbitrary input function
  // Manifold.warp (method)
  warp(warpFunc: (vert: Vec3) => void): Manifold;
  //   warpFunc: A function that modifies a given vertex position

  // Smooths out the Manifold by filling in the halfedgeTangent vectors
  // Manifold.smoothByNormals (method)
  smoothByNormals(normalIdx: number): Manifold;
  //   normalIdx: The first property channel of the normals

  // Smooths out the Manifold by filling in the halfedgeTangent vectors
  // Manifold.smoothOut (method)
  smoothOut(minSharpAngle?: number, minSmoothness?: number): Manifold;
  //   minSharpAngle: degrees, default 60
  //   minSmoothness: range

  // Increase the density of the mesh by splitting every edge into n pieces
  // Manifold.refine (method)
  refine(n: number): Manifold;
  //   n: The number of pieces to split every edge into

  // Increase the density of the mesh by splitting each edge into pieces of roughly the input length
  // Manifold.refineToLength (method)
  refineToLength(length: number): Manifold;
  //   length: The length that edges will be broken down to

  // Increase the density of the mesh by splitting each edge into pieces such that any point on the resulting triangles is roughly within tolerance of the smoothly curved surface defined by the tangent vectors
  // Manifold.refineToTolerance (method)
  refineToTolerance(tolerance: number): Manifold;
  //   tolerance: The desired maximum distance between the faceted mesh produced and the exact smoothly curving surface

  // Create a new copy of this manifold with updated vertex properties by supplying a function that takes the existing position and properties as input
  // Manifold.setProperties (method)
  setProperties(
      numProp: number,
      propFunc: (newProp: number[], position: Vec3, oldProp: number[]) => void):
      Manifold;
  //   numProp: The new number of properties per vertex
  //   propFunc: A function that modifies the properties of a given vertex

  // Curvature is the inverse of the radius of curvature, and signed such that positive is convex and negative is concave
  // Manifold.calculateCurvature (method)
  calculateCurvature(gaussianIdx: number, meanIdx: number): Manifold;
  //   gaussianIdx: The property channel index in which to store the Gaussian curvature
  //   meanIdx: The property channel index in which to store the mean curvature

  // Fills in vertex properties for normal vectors, calculated from the mesh geometry
  // Manifold.calculateNormals (method)
  calculateNormals(normalIdx: number, minSharpAngle?: number): Manifold;
  //   normalIdx: The property channel in which to store the X values of the normals
  //   minSharpAngle: Any edges with angles greater than this value will remain sharp, getting different normal vector properties on each side of the edge

  // Boolean union
  // Manifold.add (method)
  add(other: Manifold): Manifold;

  // Boolean difference
  // Manifold.subtract (method)
  subtract(other: Manifold): Manifold;

  // Boolean intersection
  // Manifold.intersect (method)
  intersect(other: Manifold): Manifold;

  // Boolean union of the manifolds a and b Boolean union of a list of manifolds
  // Manifold.union (method)
  static union(a: Manifold, b: Manifold): Manifold;
  static union(manifolds: readonly Manifold[]): Manifold;

  // Boolean difference of the manifold b from the manifold a Boolean difference of the tail of a list of manifolds from its head
  // Manifold.difference (method)
  static difference(a: Manifold, b: Manifold): Manifold;
  static difference(manifolds: readonly Manifold[]): Manifold;

  // Boolean intersection of the manifolds a and b Boolean intersection of a list of manifolds
  // Manifold.intersection (method)
  static intersection(a: Manifold, b: Manifold): Manifold;
  static intersection(manifolds: readonly Manifold[]): Manifold;

  // Split cuts this manifold in two using the cutter manifold
  // Manifold.split (method)
  split(cutter: Manifold): [Manifold, Manifold];

  // Convenient version of Split() for a half-space
  // Manifold.splitByPlane (method)
  splitByPlane(normal: Readonly<Vec3>, originOffset: number):
      [Manifold, Manifold];
  //   normal: This vector is normal to the cutting plane and its length does not matter
  //   originOffset: The distance of the plane from the origin in the direction of the normal vector

  // Removes everything behind the given half-space plane
  // Manifold.trimByPlane (method)
  trimByPlane(normal: Readonly<Vec3>, originOffset: number): Manifold;
  //   normal: This vector is normal to the cutting plane and its length does not matter
  //   originOffset: The distance of the plane from the origin in the direction of the normal vector

  // Compute the minkowski sum of this manifold with another
  // Manifold.minkowskiSum (method)
  minkowskiSum(other: Manifold): Manifold;
  //   other: The other manifold to minkowski sum to this one

  // Subtract the sweep of the other manifold across this manifold's surface
  // Manifold.minkowskiDifference (method)
  minkowskiDifference(other: Manifold): Manifold;
  //   other: The other manifold to minkowski subtract from this one

  // Returns the cross section of this object parallel to the X-Y plane at the specified height
  // Manifold.slice (method)
  slice(height: number): CrossSection;
  //   height: Z-level of slice

  // Returns a cross section representing the projected outline of this object onto the X-Y plane
  // Manifold.project (method)
  project(): CrossSection;

  // Compute the convex hull of all points in this Manifold
  // Manifold.hull (method)
  hull(): Manifold;
  static hull(points: readonly(Manifold|Vec3)[]): Manifold;

  // Constructs a new manifold from a list of other manifolds
  // DEPRECATED: Please use {@link add} or {@link union} instead.
  // Manifold.compose (method)
  static compose(manifolds: readonly Manifold[]): Manifold;
  //   manifolds: A list of Manifolds to lazy-union together

  // This operation returns a vector of Manifolds that are topologically disconnected
  // Manifold.decompose (method)
  decompose(): Manifold[];

  // Does the Manifold have any triangles?
  // Manifold.isEmpty (method)
  isEmpty(): boolean;

  // The number of vertices in the Manifold
  // Manifold.numVert (method)
  numVert(): number;

  // The number of triangles in the Manifold
  // Manifold.numTri (method)
  numTri(): number;

  // The number of edges in the Manifold
  // Manifold.numEdge (method)
  numEdge(): number;

  // The number of properties per vertex in the Manifold
  // Manifold.numProp (method)
  numProp(): number;

  // The number of property vertices in the Manifold
  // Manifold.numPropVert (method)
  numPropVert(): number

  // Returns the axis-aligned bounding box of all the Manifold's vertices
  // Manifold.boundingBox (method)
  boundingBox(): Box;

  // Returns the tolerance of this Manifold's vertices, which tracks the approximate rounding error over all the transforms and operations that have led to this state
  // Manifold.tolerance (method)
  tolerance(): number;

  // Return a copy of the manifold with the set tolerance value
  // Manifold.setTolerance (method)
  setTolerance(tolerance: number): Manifold;

  // Return a copy of the manifold simplified to the given tolerance, but with its actual tolerance value unchanged
  // Manifold.simplify (method)
  simplify(tolerance?: number): Manifold;
  //   tolerance: The maximum distance between the original and simplified meshes

  // The genus is a topological property of the manifold, representing the number of "handles"
  // Manifold.genus (method)
  genus(): number;

  // Returns the surface area of the manifold
  // Manifold.surfaceArea (method)
  surfaceArea(): number;

  // Returns the volume of the manifold
  // Manifold.volume (method)
  volume(): number;

  // Returns the minimum gap between two manifolds
  // Manifold.minGap (method)
  minGap(other: Manifold, searchLength: number): number;

  // Returns the reason for an input Mesh producing an empty Manifold
  // Manifold.status (method)
  status(): ErrorStatus;

  // Returns a Mesh that is designed to easily push into a renderer, including all interleaved vertex properties that may have been input
  // Manifold.getMesh (method)
  getMesh(normalIdx?: number): Mesh;
  //   normalIdx: If the original MeshGL inputs that formed this manifold had properties corresponding to normal vectors, you can specify the first of the three consecutive property channels forming the (x, y, z) normals, which will cause this output MeshGL to automatically update these normals according to the applied transforms and front/back side

  // If you copy a manifold, but you want this new copy to have new properties (e.g
  // Remarks: This function also condenses all coplanar faces in the relation, and collapses those edges. If you want to have inconsistent properties across these faces, meaning you want to preserve some of these edges, you should instead call GetMesh(), calculate your properties and use these to construct a new manifold.
  // Manifold.asOriginal (method)
  asOriginal(): Manifold;

  // If this mesh is an original, this returns its ID that can be referenced by product manifolds
  // Manifold.originalID (method)
  originalID(): number;

  // Returns the first of n sequential new unique mesh IDs for marking sets of triangles that can be looked up after further operations
  // Manifold.reserveIDs (method)
  static reserveIDs(count: number): number;

  // Frees the WASM memory of this Manifold, since these cannot be garbage-collected automatically
  // Manifold.delete (method)
  delete(): void;
