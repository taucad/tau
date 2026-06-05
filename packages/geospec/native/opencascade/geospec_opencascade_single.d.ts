/**
 * Provides class methods to access to the geometry of BRep shapes.
 */
export declare class BRep_Tool {
  constructor();
  /**
   * If S is Shell, returns True if it has no free boundaries (edges). If S is Wire, returns True if it has no free ends (vertices). (Internal and External sub-shepes are ignored in these checks) If S is Edge, returns True if its vertices are the same. For other shape types returns S.Closed().
   */
  static IsClosed(S: TopoDS_Shape): boolean;
  /**
   * Returns True if <E> has two PCurves in the parametric space of <F>. i.e. <F> is on a closed surface and <E> is on the closing curve.
   */
  static IsClosed(E: unknown, F: TopoDS_Face): boolean;
  /**
   * Returns True if <E> has two PCurves in the parametric space of . i.e. is a closed surface and <E> is on the closing curve.
   */
  static IsClosed(E: unknown, S: unknown, L: TopLoc_Location): boolean;
  /**
   * Returns True if <E> has two arrays of indices in the triangulation <T>.
   */
  static IsClosed(E: unknown, T: Poly_Triangulation, L: TopLoc_Location): boolean;
  /**
   * Returns the geometric surface of the face. Returns in <L> the location for the surface.
   * @param L Mutated in place; read the updated value from this argument after the call.
   */
  static Surface(F: TopoDS_Face, L: TopLoc_Location): unknown;
  /**
   * Returns the geometric surface of the face. It can be a copy if there is a Location.
   */
  static Surface(F: TopoDS_Face): unknown;
  /**
   * Returns the triangulation of the face according to the mesh purpose.
   * @param theFace the input face to find triangulation.
   * @param theLocation the face location. Mutated in place; read the updated value from this argument after the call.
   * @param theMeshPurpose a mesh purpose to find appropriate triangulation (NONE by default).
   * @returns an active triangulation in case of NONE purpose, the first triangulation appropriate for the input purpose, just the first triangulation if none matching other criteria and input purpose is AnyFallback or null handle if there is no any suitable triangulation.
   */
  static Triangulation(theFace: TopoDS_Face, theLocation: TopLoc_Location, theMeshPurpose: number): Poly_Triangulation;
  /**
   * Returns all triangulations of the face.
   * @param theFace the input face.
   * @param theLocation the face location. Mutated in place; read the updated value from this argument after the call.
   * @returns list of all available face triangulations.
   */
  static Triangulations(theFace: TopoDS_Face, theLocation: TopLoc_Location): NCollection_List_handle_Poly_Triangulation;
  /**
   * Returns the tolerance of the face.
   */
  static Tolerance(F: TopoDS_Face): number;
  /**
   * Returns the tolerance for <E>.
   */
  static Tolerance(E: unknown): number;
  /**
   * Returns the tolerance.
   */
  static Tolerance(V: unknown): number;
  /**
   * Returns the NaturalRestriction flag of the face.
   */
  static NaturalRestriction(F: TopoDS_Face): boolean;
  /**
   * Returns True if <F> has a surface, false otherwise.
   */
  static IsGeometric(F: TopoDS_Face): boolean;
  /**
   * Returns True if <E> is a 3d curve or a curve on surface.
   */
  static IsGeometric(E: unknown): boolean;
  /**
   * Returns the 3D curve of the edge. May be a Null handle. Returns in <L> the location for the curve. In <First> and <Last> the parameter range.
   * @param L Mutated in place; read the updated value from this argument after the call.
   * @returns A result object with fields:
   * - `returnValue`: the C++ return value
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static Curve(
    E: unknown,
    L: TopLoc_Location,
    First: number,
    Last: number,
  ): { returnValue: unknown; First: number; Last: number; [Symbol.dispose](): void };
  /**
   * Returns the 3D curve of the edge. May be a Null handle. In <First> and <Last> the parameter range. It can be a copy if there is a Location.
   * @returns A result object with fields:
   * - `returnValue`: the C++ return value
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static Curve(
    E: unknown,
    First: number,
    Last: number,
  ): { returnValue: unknown; First: number; Last: number; [Symbol.dispose](): void };
  /**
   * Returns the 3D polygon of the edge. May be a Null handle. Returns in <L> the location for the polygon.
   * @param L Mutated in place; read the updated value from this argument after the call.
   */
  static Polygon3D(E: unknown, L: TopLoc_Location): unknown;
  /**
   * Returns the curve associated to the edge in the parametric space of the surface. Returns a NULL handle if this curve does not exist. Returns in <First> and <Last> the parameter range. If the surface is a plane the curve can be not stored but created a new each time. The flag pointed by <theIsStored> serves to indicate storage status. It is valued if the pointer is non-null.
   * @param L Mutated in place; read the updated value from this argument after the call.
   * @returns A result object with fields:
   * - `C`: owned by the returned envelope.
   * - `S`: owned by the returned envelope.
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static CurveOnSurface(
    E: unknown,
    L: TopLoc_Location,
    First: number,
    Last: number,
  ): { C: unknown; S: unknown; First: number; Last: number; [Symbol.dispose](): void };
  /**
   * Returns the curve associated to the edge in the parametric space of the face. Returns a NULL handle if this curve does not exist. Returns in <First> and <Last> the parameter range. If the surface is a plane the curve can be not stored but created a new each time. The flag pointed by <theIsStored> serves to indicate storage status. It is valued if the pointer is non-null.
   * @returns A result object with fields:
   * - `returnValue`: the C++ return value
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static CurveOnSurface(
    E: unknown,
    F: TopoDS_Face,
    First: number,
    Last: number,
    theIsStored: boolean,
  ): { returnValue: unknown; First: number; Last: number; [Symbol.dispose](): void };
  /**
   * Returns in `, , <L> the 2d curve, the surface and the location for the edge <E> of rank <Index>. and are null if the index is out of range. Returns in <First> and <Last> the parameter range.`
   * @param L Mutated in place; read the updated value from this argument after the call.
   * @returns A result object with fields:
   * - `C`: owned by the returned envelope.
   * - `S`: owned by the returned envelope.
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static CurveOnSurface(
    E: unknown,
    L: TopLoc_Location,
    First: number,
    Last: number,
    Index: number,
  ): { C: unknown; S: unknown; First: number; Last: number; [Symbol.dispose](): void };
  /**
   * Returns the curve associated to the edge in the parametric space of the surface. Returns a NULL handle if this curve does not exist. Returns in <First> and <Last> the parameter range. If the surface is a plane the curve can be not stored but created a new each time. The flag pointed by <theIsStored> serves to indicate storage status. It is valued if the pointer is non-null.
   * @returns A result object with fields:
   * - `returnValue`: the C++ return value
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static CurveOnSurface(
    E: unknown,
    S: unknown,
    L: TopLoc_Location,
    First: number,
    Last: number,
    theIsStored: boolean,
  ): { returnValue: unknown; First: number; Last: number; [Symbol.dispose](): void };
  /**
   * For the planar surface builds the 2d curve for the edge by projection of the edge on plane. Returns a NULL handle if the surface is not planar or the projection failed.
   * @returns A result object with fields:
   * - `returnValue`: the C++ return value
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static CurveOnPlane(
    E: unknown,
    S: unknown,
    L: TopLoc_Location,
    First: number,
    Last: number,
  ): { returnValue: unknown; First: number; Last: number; [Symbol.dispose](): void };
  /**
   * Returns the polygon associated to the edge in the parametric space of the face. Returns a NULL handle if this polygon does not exist.
   */
  static PolygonOnSurface(E: unknown, F: TopoDS_Face): unknown;
  /**
   * Returns in `, , <L> a 2d curve, a surface and a location for the edge <E>. and are null if the edge has no polygon on surface.`
   * @param L Mutated in place; read the updated value from this argument after the call.
   * @returns A result object with fields:
   * - `C`: owned by the returned envelope.
   * - `S`: owned by the returned envelope.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static PolygonOnSurface(E: unknown, L: TopLoc_Location): { C: unknown; S: unknown; [Symbol.dispose](): void };
  /**
   * Returns the polygon associated to the edge in the parametric space of the surface. Returns a NULL handle if this polygon does not exist.
   */
  static PolygonOnSurface(E: unknown, S: unknown, L: TopLoc_Location): unknown;
  /**
   * Returns in `, , <L> the 2d curve, the surface and the location for the edge <E> of rank <Index>. and are null if the index is out of range.`
   * @param L Mutated in place; read the updated value from this argument after the call.
   * @returns A result object with fields:
   * - `C`: owned by the returned envelope.
   * - `S`: owned by the returned envelope.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static PolygonOnSurface(
    E: unknown,
    L: TopLoc_Location,
    Index: number,
  ): { C: unknown; S: unknown; [Symbol.dispose](): void };
  /**
   * Returns in.
   *
   * , <T>, <L> a polygon on triangulation, a triangulation and a location for the edge <E>.
   *
   * and <T> are null if the edge has no polygon on triangulation.
   * @param L Mutated in place; read the updated value from this argument after the call.
   * @returns A result object with fields:
   * - `P`: owned by the returned envelope.
   * - `T`: owned by the returned envelope.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static PolygonOnTriangulation(
    E: unknown,
    L: TopLoc_Location,
  ): { P: unknown; T: Poly_Triangulation; [Symbol.dispose](): void };
  /**
   * Returns the polygon associated to the edge in the parametric space of the face. Returns a NULL handle if this polygon does not exist.
   */
  static PolygonOnTriangulation(E: unknown, T: Poly_Triangulation, L: TopLoc_Location): unknown;
  /**
   * Returns in.
   *
   * , <T>, <L> a polygon on triangulation, a triangulation and a location for the edge <E> for the range index. `and are null if the edge has no polygon on triangulation.`
   * @param L Mutated in place; read the updated value from this argument after the call.
   * @returns A result object with fields:
   * - `P`: owned by the returned envelope.
   * - `T`: owned by the returned envelope.
   * Dispose the returned envelope to release owned Handle fields.
   */
  static PolygonOnTriangulation(
    E: unknown,
    L: TopLoc_Location,
    Index: number,
  ): { P: unknown; T: Poly_Triangulation; [Symbol.dispose](): void };
  /**
   * Returns the SameParameter flag for the edge.
   */
  static SameParameter(E: unknown): boolean;
  /**
   * Returns the SameRange flag for the edge.
   */
  static SameRange(E: unknown): boolean;
  /**
   * Returns True if the edge is degenerated.
   */
  static Degenerated(E: unknown): boolean;
  /**
   * Gets the range of the 3d curve.
   * @returns A result object with fields:
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   */
  static Range(E: unknown, First: number, Last: number): { First: number; Last: number };
  /**
   * Gets the range of the edge on the pcurve on the surface.
   * @returns A result object with fields:
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   */
  static Range(
    E: unknown,
    S: unknown,
    L: TopLoc_Location,
    First: number,
    Last: number,
  ): { First: number; Last: number };
  /**
   * Gets the range of the edge on the pcurve on the face.
   * @returns A result object with fields:
   * - `First`: updated value from the call.
   * - `Last`: updated value from the call.
   */
  static Range(E: unknown, F: TopoDS_Face, First: number, Last: number): { First: number; Last: number };
  /**
   * Gets the UV locations of the extremities of the edge.
   * @param PFirst Mutated in place; read the updated value from this argument after the call.
   * @param PLast Mutated in place; read the updated value from this argument after the call.
   */
  static UVPoints(E: unknown, S: unknown, L: TopLoc_Location, PFirst: unknown, PLast: unknown): void;
  /**
   * Gets the UV locations of the extremities of the edge.
   * @param PFirst Mutated in place; read the updated value from this argument after the call.
   * @param PLast Mutated in place; read the updated value from this argument after the call.
   */
  static UVPoints(E: unknown, F: TopoDS_Face, PFirst: unknown, PLast: unknown): void;
  /**
   * Sets the UV locations of the extremities of the edge.
   */
  static SetUVPoints(E: unknown, S: unknown, L: TopLoc_Location, PFirst: unknown, PLast: unknown): void;
  /**
   * Sets the UV locations of the extremities of the edge.
   */
  static SetUVPoints(E: unknown, F: TopoDS_Face, PFirst: unknown, PLast: unknown): void;
  /**
   * Returns True if the edge is on the surfaces of the two faces.
   */
  static HasContinuity(E: unknown, F1: TopoDS_Face, F2: TopoDS_Face): boolean;
  /**
   * Returns True if the edge is on the surfaces.
   */
  static HasContinuity(E: unknown, S1: unknown, S2: unknown, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
  /**
   * Returns True if the edge has regularity on some two surfaces.
   */
  static HasContinuity(E: unknown): boolean;
  /**
   * Returns the continuity.
   */
  static Continuity(E: unknown, F1: TopoDS_Face, F2: TopoDS_Face): unknown;
  /**
   * Returns the continuity.
   */
  static Continuity(E: unknown, S1: unknown, S2: unknown, L1: TopLoc_Location, L2: TopLoc_Location): unknown;
  /**
   * Returns the max continuity of edge between some surfaces or GeomAbs_C0 if there are no such surfaces.
   */
  static MaxContinuity(theEdge: unknown): unknown;
  /**
   * Returns the 3d point.
   */
  static Pnt(V: unknown): gp_Pnt;
  /**
   * Returns the parameter of <V> on <E>. Throws Standard_NoSuchObject if no parameter on edge.
   */
  static Parameter(V: unknown, E: unknown): number;
  /**
   * Finds the parameter of <theV> on <theE>.
   * @param theV input vertex
   * @param theE input edge
   * @param theParam calculated parameter on the curve
   * @returns A result object with fields:
   * - `returnValue`: TRUE if done
   * - `theParam`: calculated parameter on the curve
   */
  static Parameter(theV: unknown, theE: unknown, theParam: number): { returnValue: boolean; theParam: number };
  /**
   * Returns the parameters of the vertex on the pcurve of the edge on the face.
   */
  static Parameter(V: unknown, E: unknown, F: TopoDS_Face): number;
  /**
   * Returns the parameters of the vertex on the pcurve of the edge on the surface.
   */
  static Parameter(V: unknown, E: unknown, S: unknown, L: TopLoc_Location): number;
  /**
   * Returns the parameters of the vertex on the face.
   */
  static Parameters(V: unknown, F: TopoDS_Face): unknown;
  /**
   * Returns the maximum tolerance of input shape subshapes.
   */
  static MaxTolerance(theShape: TopoDS_Shape, theSubShape: TopAbs_ShapeEnum): number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The {@link BRepTools | `BRepTools`} package provides utilities for BRep data structures.
 *
 * - WireExplorer: Tool to explore the topology of a wire in the order of the edges.
 * - ShapeSet: Tools used for dumping, writing and reading.
 * - UVBounds: Methods to compute the limits of the boundary of a face, a wire or an edge in the parametric space of a face.
 * - Update: Methods to call when a topology has been created to compute all missing data.
 * - UpdateFaceUVPoints: Method to update the UV points stored with the edges on a face.
 * - Compare: Method to compare two vertices.
 * - Compare: Method to compare two edges.
 * - OuterWire: Method to find the outer wire of a face.
 * - Map3DEdges: Method to map all the 3D Edges of a Shape.
 * - Dump: Method to dump a BRep object.
 */
export declare class BRepTools {
  constructor();
  // dropped: LoadTriangulation param 3 resolves to excluded type OSD_FileSystem
  // dropped: LoadAllTriangulations param 1 resolves to excluded type OSD_FileSystem
  /**
   * Returns in UMin, UMax, VMin, VMax the bounding values in the parametric space of F.
   * @returns A result object with fields:
   * - `UMin`: updated value from the call.
   * - `UMax`: updated value from the call.
   * - `VMin`: updated value from the call.
   * - `VMax`: updated value from the call.
   */
  static UVBounds(
    F: TopoDS_Face,
    UMin: number,
    UMax: number,
    VMin: number,
    VMax: number,
  ): { UMin: number; UMax: number; VMin: number; VMax: number };
  /**
   * Returns in UMin, UMax, VMin, VMax the bounding values of the wire in the parametric space of F.
   * @returns A result object with fields:
   * - `UMin`: updated value from the call.
   * - `UMax`: updated value from the call.
   * - `VMin`: updated value from the call.
   * - `VMax`: updated value from the call.
   */
  static UVBounds(
    F: TopoDS_Face,
    W: unknown,
    UMin: number,
    UMax: number,
    VMin: number,
    VMax: number,
  ): { UMin: number; UMax: number; VMin: number; VMax: number };
  /**
   * Returns in UMin, UMax, VMin, VMax the bounding values of the edge in the parametric space of F.
   * @returns A result object with fields:
   * - `UMin`: updated value from the call.
   * - `UMax`: updated value from the call.
   * - `VMin`: updated value from the call.
   * - `VMax`: updated value from the call.
   */
  static UVBounds(
    F: TopoDS_Face,
    E: unknown,
    UMin: number,
    UMax: number,
    VMin: number,
    VMax: number,
  ): { UMin: number; UMax: number; VMin: number; VMax: number };
  /**
   * Adds to the box **the bounding values in the parametric space of F.**
   * @param B Mutated in place; read the updated value from this argument after the call.
   */
  static AddUVBounds(F: TopoDS_Face, B: unknown): void;
  /**
   * Adds to the box **the bounding values of the wire in the parametric space of F.**
   * @param B Mutated in place; read the updated value from this argument after the call.
   */
  static AddUVBounds(F: TopoDS_Face, W: unknown, B: unknown): void;
  /**
   * Adds to the box **the bounding values of the edge in the parametric space of F.**
   * @param B Mutated in place; read the updated value from this argument after the call.
   */
  static AddUVBounds(F: TopoDS_Face, E: unknown, B: unknown): void;
  /**
   * Update a vertex (nothing is done)
   */
  static Update(V: unknown): void;
  /**
   * Update an edge, compute 2d bounding boxes.
   */
  static Update(E: unknown): void;
  /**
   * Update a wire (nothing is done)
   */
  static Update(W: unknown): void;
  /**
   * Update a Face, update UV points.
   */
  static Update(F: TopoDS_Face): void;
  /**
   * Update a shell (nothing is done)
   */
  static Update(S: TopoDS_Shell): void;
  /**
   * Update a solid (nothing is done)
   */
  static Update(S: TopoDS_Solid): void;
  /**
   * Update a composite solid (nothing is done)
   */
  static Update(C: unknown): void;
  /**
   * Update a compound (nothing is done)
   */
  static Update(C: unknown): void;
  /**
   * Update a shape, call the correct update.
   */
  static Update(S: TopoDS_Shape): void;
  /**
   * For each edge of the face <F> reset the UV points to the bounding points of the parametric curve of the edge on the face.
   */
  static UpdateFaceUVPoints(theF: TopoDS_Face): void;
  /**
   * Removes all cached polygonal representation of the shape, i.e. the triangulations of the faces of and polygons on triangulations and polygons 3d of the edges. In case polygonal representation is the only available representation for the shape (shape does not have geometry) it is not removed.
   * @param theShape the shape to clean
   * @param theForce allows removing all polygonal representations from the shape, including polygons on triangulations irrelevant for the faces of the given shape.
   */
  static Clean(theShape: TopoDS_Shape, theForce?: boolean): void;
  /**
   * Removes geometry (curves and surfaces) from all edges and faces of the shape.
   */
  static CleanGeometry(theShape: TopoDS_Shape): void;
  /**
   * Removes all the pcurves of the edges of that refer to surfaces not belonging to any face of
   */
  static RemoveUnusedPCurves(S: TopoDS_Shape): void;
  /**
   * Verifies that each Face from the shape has got a triangulation with a deflection smaller or equal to specified one and the Edges a discretization on this triangulation.
   * @param theShape shape to verify
   * @param theLinDefl maximum allowed linear deflection
   * @param theToCheckFreeEdges if TRUE, then free Edges are required to have 3D polygon
   * @returns FALSE if input Shape contains Faces without triangulation, or that triangulation has worse (greater) deflection than specified one, or Edges in Shape lack polygons on triangulation or free Edges in Shape lack 3D polygons
   */
  static Triangulation(theShape: TopoDS_Shape, theLinDefl: number, theToCheckFreeEdges?: boolean): boolean;
  /**
   * Releases triangulation data for each face of the shape if there is deferred storage to load it later.
   * @param theShape shape to unload triangulations
   * @param theTriangulationIdx index defining what triangulation should be unloaded. Starts from 0. -1 is used in specific case to unload currently already active triangulation. If some face doesn't contain triangulation with this index, nothing will be unloaded for it. Exception will be thrown in case of invalid negative index
   * @returns TRUE if at least one triangulation is unloaded.
   */
  static UnloadTriangulation(theShape: TopoDS_Shape, theTriangulationIdx?: number): boolean;
  /**
   * Activates triangulation data for each face of the shape from some deferred storage using specified shared input file system.
   * @param theShape shape to activate triangulations
   * @param theTriangulationIdx index defining what triangulation should be activated. Starts from 0. Exception will be thrown in case of invalid negative index
   * @param theToActivateStrictly flag to activate exactly triangulation with defined theTriangulationIdx index. In TRUE case if some face doesn't contain triangulation with this index, active triangulation will not be changed for it. Else the last available triangulation will be activated.
   * @returns TRUE if at least one active triangulation was changed.
   */
  static ActivateTriangulation(
    theShape: TopoDS_Shape,
    theTriangulationIdx: number,
    theToActivateStrictly?: boolean,
  ): boolean;
  /**
   * Releases all available triangulations for each face of the shape if there is deferred storage to load them later.
   * @param theShape shape to unload triangulations
   * @returns TRUE if at least one triangulation is unloaded.
   */
  static UnloadAllTriangulations(theShape: TopoDS_Shape): boolean;
  /**
   * Returns True if the distance between the two vertices is lower than their tolerance.
   */
  static Compare(V1: unknown, V2: unknown): boolean;
  /**
   * Returns True if the distance between the two edges is lower than their tolerance.
   */
  static Compare(E1: unknown, E2: unknown): boolean;
  /**
   * Returns the outer most wire of <F>. Returns a Null wire if <F> has no wires.
   */
  static OuterWire(F: TopoDS_Face): unknown;
  /**
   * Stores in the map <M> all the 3D topology edges of .
   * @param M Mutated in place; read the updated value from this argument after the call.
   */
  static Map3DEdges(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
  /**
   * Verifies that the edge <E> is found two times on the face <F> before calling `BRep_Tool::IsClosed`.
   */
  static IsReallyClosed(E: unknown, F: TopoDS_Face): boolean;
  /**
   * Detect closedness of face in U and V directions.
   * @returns A result object with fields:
   * - `theUclosed`: updated value from the call.
   * - `theVclosed`: updated value from the call.
   */
  static DetectClosedness(
    theFace: TopoDS_Face,
    theUclosed: boolean,
    theVclosed: boolean,
  ): { theUclosed: boolean; theVclosed: boolean };
  /**
   * Writes the shape to the file in an ASCII format TopTools_FormatVersion_VERSION_1. This alias writes shape with triangulation data.
   * @param theShape the shape to write
   * @param theFile the path to file to output shape into
   * @param theProgress the range of progress indicator to fill in
   */
  static Write(theShape: TopoDS_Shape, theFile: string, theProgress: Message_ProgressRange): boolean;
  /**
   * Writes the shape to the file in an ASCII format of specified version.
   * @param theShape the shape to write
   * @param theFile the path to file to output shape into
   * @param theWithTriangles flag which specifies whether to save shape with (TRUE) or without (FALSE) triangles; has no effect on triangulation-only geometry
   * @param theWithNormals flag which specifies whether to save triangulation with (TRUE) or without (FALSE) normals; has no effect on triangulation-only geometry
   * @param theVersion the {@link TopTools | `TopTools`} format version
   * @param theProgress the range of progress indicator to fill in
   */
  static Write(
    theShape: TopoDS_Shape,
    theFile: string,
    theWithTriangles: boolean,
    theWithNormals: boolean,
    theVersion: unknown,
    theProgress: Message_ProgressRange,
  ): boolean;
  /**
   * Reads a Shape from in returns it in <Sh>. **is used to build the shape.**
   * @param Sh Mutated in place; read the updated value from this argument after the call.
   */
  static Read(Sh: TopoDS_Shape, File: string, B: unknown, theProgress: Message_ProgressRange): boolean;
  /**
   * Evals real tolerance of edge <theE>. <theC3d>, <theC2d>, <theS>, <theF>, <theL> are correspondently 3d curve of edge, 2d curve on surface <theS> and rang of edge If calculated tolerance is more then current edge tolerance, edge is updated. Method returns actual tolerance of edge.
   */
  static EvalAndUpdateTol(
    theE: unknown,
    theC3d: unknown,
    theC2d: unknown,
    theS: unknown,
    theF: number,
    theL: number,
  ): number;
  /**
   * returns the cumul of the orientation of <Edge> and the containing wire in <Face>
   */
  static OriEdgeInFace(theEdge: unknown, theFace: TopoDS_Face): TopAbs_Orientation;
  /**
   * Removes internal sub-shapes from the shape. The check on internal status is based on orientation of sub-shapes, classification is not performed. Before removal of internal sub-shapes the algorithm checks if such removal is not going to break topological connectivity between sub-shapes. The flag <theForce> if set to true disables the connectivity check and clears the given shape from all sub-shapes with internal orientation.
   * @param theS Mutated in place; read the updated value from this argument after the call.
   */
  static RemoveInternals(theS: TopoDS_Shape, theForce: boolean): void;
  /**
   * Check all locations of shape according criterium: aTrsf.IsNegative() || (std::abs(std::abs(aTrsf.ScaleFactor()) - 1.) > `TopLoc_Location::ScalePrec()`) All sub-shapes having such locations are put in list theProblemShapes.
   * @param theProblemShapes Mutated in place; read the updated value from this argument after the call.
   */
  static CheckLocations(theS: TopoDS_Shape, theProblemShapes: NCollection_List_TopoDS_Shape): void;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes a solid shape which.
 *
 * - references an underlying solid shape with the potential to be given a location and an orientation
 * - has a location for the underlying shape, giving its placement in the local coordinate system
 * - has an orientation for the underlying shape, in terms of its geometry (as opposed to orientation in relation to other shapes).
 */
export declare class TopoDS_Solid extends TopoDS_Shape {
  /**
   * Constructs an Undefined Solid.
   */
  constructor();
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes a shell which.
 *
 * - references an underlying shell with the potential to be given a location and an orientation
 * - has a location for the underlying shell, giving its placement in the local coordinate system
 * - has an orientation for the underlying shell, in terms of its geometry (as opposed to orientation in relation to other shapes).
 */
export declare class TopoDS_Shell extends TopoDS_Shape {
  /**
   * Constructs an Undefined Shell.
   */
  constructor();
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes a face which.
 *
 * - references an underlying face with the potential to be given a location and an orientation
 * - has a location for the underlying face, giving its placement in the local coordinate system
 * - has an orientation for the underlying face, in terms of its geometry (as opposed to orientation in relation to other shapes).
 */
export declare class TopoDS_Face extends TopoDS_Shape {
  /**
   * Undefined Face.
   */
  constructor();
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes a shape which.
 *
 * - references an underlying shape with the potential to be given a location and an orientation
 * - has a location for the underlying shape, giving its placement in the local coordinate system
 * - has an orientation for the underlying shape, in terms of its geometry (as opposed to orientation in relation to other shapes). Note: A Shape is empty if it references an underlying shape which has an empty list of shapes.
 */
export declare class TopoDS_Shape {
  /**
   * Creates a NULL Shape referring to nothing.
   */
  constructor();
  /**
   * Returns true if this shape is null. In other words, it references no underlying shape with the potential to be given a location and an orientation.
   */
  IsNull(): boolean;
  /**
   * Destroys the reference to the underlying shape stored in this shape. As a result, this shape becomes null.
   */
  Nullify(): void;
  /**
   * Returns the shape local coordinate system.
   */
  Location(): TopLoc_Location;
  /**
   * Sets the shape local coordinate system.
   * @param theLoc the new local coordinate system.
   * @param theRaiseExc flag to raise exception in case of transformation with scale or negative.
   */
  Location(theLoc: TopLoc_Location, theRaiseExc: boolean): void;
  /**
   * Returns a shape similar to <me> with the local coordinate system set to <Loc>.
   * @param theLoc the new local coordinate system.
   * @param theRaiseExc flag to raise exception in case of transformation with scale or negative.
   * @returns the located shape.
   */
  Located(theLoc: TopLoc_Location, theRaiseExc?: boolean): TopoDS_Shape;
  /**
   * Returns the shape orientation.
   */
  Orientation(): TopAbs_Orientation;
  /**
   * Sets the shape orientation.
   */
  Orientation(theOrient: TopAbs_Orientation): void;
  /**
   * Returns a shape similar to <me> with the orientation set to <Or>.
   */
  Oriented(theOrient: TopAbs_Orientation): TopoDS_Shape;
  /**
   * Returns a handle to the actual shape implementation.
   */
  TShape(): unknown;
  TShape(theTShape: unknown): void;
  /**
   * Returns the value of the TopAbs_ShapeEnum enumeration that corresponds to this shape, for example VERTEX, EDGE, and so on. Exceptions Standard_NullObject if this shape is null.
   */
  ShapeType(): TopAbs_ShapeEnum;
  /**
   * Returns the free flag.
   */
  Free(): boolean;
  /**
   * Sets the free flag.
   */
  Free(theIsFree: boolean): void;
  /**
   * Returns the locked flag.
   */
  Locked(): boolean;
  /**
   * Sets the locked flag.
   */
  Locked(theIsLocked: boolean): void;
  /**
   * Returns the modification flag.
   */
  Modified(): boolean;
  /**
   * Sets the modification flag.
   */
  Modified(theIsModified: boolean): void;
  /**
   * Returns the checked flag.
   */
  Checked(): boolean;
  /**
   * Sets the checked flag.
   */
  Checked(theIsChecked: boolean): void;
  /**
   * Returns the orientability flag.
   */
  Orientable(): boolean;
  /**
   * Sets the orientability flag.
   */
  Orientable(theIsOrientable: boolean): void;
  /**
   * Returns the closedness flag.
   */
  Closed(): boolean;
  /**
   * Sets the closedness flag.
   */
  Closed(theIsClosed: boolean): void;
  /**
   * Returns the infinity flag.
   */
  Infinite(): boolean;
  /**
   * Sets the infinity flag.
   */
  Infinite(theIsInfinite: boolean): void;
  /**
   * Returns the convexness flag.
   */
  Convex(): boolean;
  /**
   * Sets the convexness flag.
   */
  Convex(theIsConvex: boolean): void;
  /**
   * Multiplies the Shape location by thePosition.
   * @param thePosition the transformation to apply.
   * @param theRaiseExc flag to raise exception in case of transformation with scale or negative.
   */
  Move(thePosition: TopLoc_Location, theRaiseExc?: boolean): void;
  /**
   * Returns a shape similar to <me> with a location multiplied by thePosition.
   * @param thePosition the transformation to apply.
   * @param theRaiseExc flag to raise exception in case of transformation with scale or negative.
   * @returns the moved shape.
   */
  Moved(thePosition: TopLoc_Location, theRaiseExc?: boolean): TopoDS_Shape;
  /**
   * Reverses the orientation, using the Reverse method from the {@link TopAbs | `TopAbs`} package.
   */
  Reverse(): void;
  /**
   * Returns a shape similar to <me> with the orientation reversed, using the Reverse method from the {@link TopAbs | `TopAbs`} package.
   */
  Reversed(): TopoDS_Shape;
  /**
   * Complements the orientation, using the Complement method from the {@link TopAbs | `TopAbs`} package.
   */
  Complement(): void;
  /**
   * Returns a shape similar to <me> with the orientation complemented, using the Complement method from the {@link TopAbs | `TopAbs`} package.
   */
  Complemented(): TopoDS_Shape;
  /**
   * Updates the Shape Orientation by composition with theOrient, using the Compose method from the {@link TopAbs | `TopAbs`} package.
   */
  Compose(theOrient: TopAbs_Orientation): void;
  /**
   * Returns a shape similar to <me> with the orientation composed with theOrient, using the Compose method from the {@link TopAbs | `TopAbs`} package.
   */
  Composed(theOrient: TopAbs_Orientation): TopoDS_Shape;
  /**
   * Returns the number of direct sub-shapes (children).
   * @see {@link TopoDS_Iterator | `TopoDS_Iterator`}
   */
  NbChildren(): number;
  /**
   * Returns True if two shapes are partners, i.e. if they share the same TShape. Locations and Orientations may differ.
   */
  IsPartner(theOther: TopoDS_Shape): boolean;
  /**
   * Returns True if two shapes are same, i.e. if they share the same TShape with the same Locations. Orientations may differ.
   */
  IsSame(theOther: TopoDS_Shape): boolean;
  /**
   * Returns True if two shapes are equal, i.e. if they share the same TShape with the same Locations and Orientations.
   */
  IsEqual(theOther: TopoDS_Shape): boolean;
  /**
   * Negation of the IsEqual method.
   */
  IsNotEqual(theOther: TopoDS_Shape): boolean;
  /**
   * Replace <me> by a new Shape with the same Orientation and Location and a new TShape with the same geometry and no sub-shapes.
   */
  EmptyCopy(): void;
  /**
   * Returns a new Shape with the same Orientation and Location and a new TShape with the same geometry and no sub-shapes.
   */
  EmptyCopied(): TopoDS_Shape;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The Surface from BRepAdaptor allows to use a Face of the BRep topology look like a 3D surface.
 *
 * It has the methods of the class Surface from Adaptor3d.
 *
 * It is created or initialized with a Face. It takes into account the local coordinates system.
 *
 * The u,v parameter range is the minmax value for the restriction, unless the flag restriction is set to false.
 */
export declare class BRepAdaptor_Surface {
  /**
   * Creates an undefined surface with no face loaded.
   */
  constructor();
  /**
   * Creates a surface to access the geometry of <F>. If <Restriction> is true the parameter range is the parameter range in the UV space of the restriction.
   */
  constructor(F: TopoDS_Face, R?: boolean);
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /**
   * Shallow copy of adaptor.
   */
  ShallowCopy(): unknown;
  /**
   * Sets the surface to the geometry of <F>.
   */
  Initialize(F: TopoDS_Face, Restriction?: boolean): void;
  /**
   * Returns the face.
   */
  Face(): TopoDS_Face;
  /**
   * Returns the face tolerance.
   */
  Tolerance(): number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * An Explorer is a Tool to visit a Topological Data Structure from the `TopoDS` package.
 *
 * An Explorer is built with:
 *
 * - The Shape to explore.
 * - The type of Shapes to find: e.g VERTEX, EDGE. This type cannot be SHAPE.
 * - The type of Shapes to avoid. e.g SHELL, EDGE. By default this type is SHAPE which means no restriction on the exploration.
 *
 * The Explorer visits all the structure to find shapes of the requested type which are not contained in the type to avoid.
 *
 * Example to find all the Faces in the Shape S :
 *
 * {@link TopExp_Explorer | `TopExp_Explorer`} Ex; for (Ex.Init(S,TopAbs_FACE); Ex.More(); Ex.Next()) { ProcessFace(Ex.Current()); }
 *
 * // an other way {@link TopExp_Explorer | `TopExp_Explorer`} Ex(S,TopAbs_FACE); while (Ex.More()) { ProcessFace(Ex.Current()); Ex.Next(); }
 *
 * To find all the vertices which are not in an edge :
 *
 * for (Ex.Init(S,TopAbs_VERTEX,TopAbs_EDGE); ...)
 *
 * To find all the faces in a SHELL, then all the faces not in a SHELL :
 *
 * {@link TopExp_Explorer | `TopExp_Explorer`} Ex1, Ex2;
 *
 * for (Ex1.Init(S,TopAbs_SHELL),...) { // visit all shells for (Ex2.Init(Ex1.Current(),TopAbs_FACE),...) { // visit all the faces of the current shell } }
 *
 * for (Ex1.Init(S,TopAbs_FACE,TopAbs_SHELL),...) { // visit all faces not in a shell }
 *
 * If the type to avoid is the same or is less complex than the type to find it has no effect.
 *
 * For example searching edges not in a vertex does not make a difference.
 */
export declare class TopExp_Explorer {
  /**
   * Creates an empty explorer, becomes useful after Init.
   */
  constructor();
  /**
   * Creates an Explorer on the Shape .
   *
   * <ToFind> is the type of shapes to search. TopAbs_VERTEX, TopAbs_EDGE, ...
   *
   * <ToAvoid> is the type of shape to skip in the exploration. If <ToAvoid> is equal or less complex than <ToFind> or if <ToAVoid> is SHAPE it has no effect on the exploration.
   */
  constructor(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid?: TopAbs_ShapeEnum);
  /**
   * Resets this explorer on the shape S. It is initialized to search the shape S, for shapes of type ToFind, that are not part of a shape ToAvoid. If the shape ToAvoid is equal to TopAbs_SHAPE, or if it is the same as, or less complex than, the shape ToFind it has no effect on the search.
   */
  Init(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid?: TopAbs_ShapeEnum): void;
  /**
   * Returns True if there are more shapes in the exploration.
   */
  More(): boolean;
  /**
   * Moves to the next Shape in the exploration.
   */
  Next(): void;
  /**
   * Returns the current shape in the exploration.
   */
  Value(): TopoDS_Shape;
  /**
   * Returns the current shape in the exploration.
   */
  Current(): TopoDS_Shape;
  /**
   * Reinitialize the exploration with the original arguments.
   */
  ReInit(): void;
  /**
   * Return explored shape.
   */
  ExploredShape(): TopoDS_Shape;
  /**
   * Returns the current depth of the exploration. 0 is the shape to explore itself.
   */
  Depth(): number;
  /**
   * Clears the content of the explorer.
   */
  Clear(): void;
  /**
   * Returns a sentinel marking the end of iteration.
   */
  end(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export type TopAbs_Orientation = (typeof TopAbs_Orientation)[keyof typeof TopAbs_Orientation];
/**
 * Identifies the orientation of a topological shape. Orientation can represent a relation between two entities, or it can apply to a shape in its own right.
 * When used to describe a relation between two shapes, orientation allows you to use the underlying entity in either direction.
 * For example on a curve which is oriented FORWARD (say from left to right) you can have both a FORWARD and a REVERSED edge. The FORWARD edge will be oriented from left to right, and the REVERSED edge from right to left. In this way, you share the underlying entity. In other words, two faces of a cube can share an edge, and can also be used to build compound shapes.
 * For each case in which an element is used as the boundary of a geometric domain of a higher dimension, this element defines two local regions of which one is arbitrarily considered as the default region. A change in orientation implies a switch of default region. This allows you to apply changes of orientation to the shape as a whole.
 */
export declare const TopAbs_Orientation: {
  readonly TopAbs_FORWARD: 'TopAbs_FORWARD';
  readonly TopAbs_REVERSED: 'TopAbs_REVERSED';
  readonly TopAbs_INTERNAL: 'TopAbs_INTERNAL';
  readonly TopAbs_EXTERNAL: 'TopAbs_EXTERNAL';
};

export type TopAbs_ShapeEnum = (typeof TopAbs_ShapeEnum)[keyof typeof TopAbs_ShapeEnum];
/**
 * Identifies various topological shapes. This enumeration allows you to use dynamic typing of shapes. The values are listed in order of complexity, from the most complex to the most simple i.e. COMPOUND > COMPSOLID > SOLID > .... > VERTEX > SHAPE. Any shape can contain simpler shapes in its definition. Abstract topological data structure describes a basic entity, the shape (present in this enumeration as the SHAPE value), which can be divided into the following component topologies:
 *
 * - COMPOUND: A group of any of the shapes below.
 * - COMPSOLID: A set of solids connected by their faces. This expands the notions of WIRE and SHELL to solids.
 * - SOLID: A part of 3D space bounded by shells.
 * - SHELL: A set of faces connected by some of the edges of their wire boundaries. A shell can be open or closed.
 * - FACE: Part of a plane (in 2D geometry) or a surface (in 3D geometry) bounded by a closed wire. Its geometry is constrained (trimmed) by contours.
 * - WIRE: A sequence of edges connected by their vertices. It can be open or closed depending on whether the edges are linked or not.
 * - EDGE: A single dimensional shape corresponding to a curve, and bound by a vertex at each extremity.
 * - VERTEX: A zero-dimensional shape corresponding to a point in geometry.
 */
export declare const TopAbs_ShapeEnum: {
  readonly TopAbs_COMPOUND: 'TopAbs_COMPOUND';
  readonly TopAbs_COMPSOLID: 'TopAbs_COMPSOLID';
  readonly TopAbs_SOLID: 'TopAbs_SOLID';
  readonly TopAbs_SHELL: 'TopAbs_SHELL';
  readonly TopAbs_FACE: 'TopAbs_FACE';
  readonly TopAbs_WIRE: 'TopAbs_WIRE';
  readonly TopAbs_EDGE: 'TopAbs_EDGE';
  readonly TopAbs_VERTEX: 'TopAbs_VERTEX';
  readonly TopAbs_SHAPE: 'TopAbs_SHAPE';
};

/**
 * Implements a general mechanism to compute the global properties of a "compound geometric system" in 3D space by composition of the global properties of elementary geometric entities such as a curve, surface, solid, or set of points. It is also possible to compose the properties of several "compound geometric systems".
 *
 * To compute the global properties of a compound geometric system:
 *
 * - declare a {@link GProp_GProps | `GProp_GProps`} using a constructor which initializes the instance and defines the location point used to compute the inertia,
 * - compose the global properties of the geometric components into the system using the method `Add()`.
 *
 * To compute the global properties of the geometric components of the system, use the services of the following frameworks:
 *
 * - {@link GProp_PGProps | `GProp_PGProps`} for a set of points,
 * - CGProps for a curve,
 * - SGProps for a surface,
 * - VGProps for a "solid". The CGProps, SGProps and VGProps frameworks are generic and must be instantiated for the application (see {@link BRepGProp | `BRepGProp`} / GeomGProp).
 *
 * The global properties computed are:
 *
 * - the dimension (length, area or volume),
 * - the mass,
 * - the centre of mass,
 * - the moments of inertia (static moments and quadratic moments),
 * - the moment about an axis,
 * - the radius of gyration about an axis,
 * - the principal properties of inertia (see {@link GProp_PrincipalProps | `GProp_PrincipalProps`}):the principal moments,the principal axes of inertia,the principal radii of gyration.
 *
 * Example:
 *
 * ```
 * //DeclarestheGProps;theabsoluteorigin(0,0,0)isusedasthe //defaultreferencepointtocomputethecentreofmass. GProp_GPropsaSystem; //Computestheinertiaofa3Dcurve. Your_CGPropsaComponent1(theCurve,...); //Computestheinertiaoftwosurfaces.
 * Your_SGPropsaComponent2(theSurface1,...); Your_SGPropsaComponent3(theSurface2,...); //Composestheglobalpropertiesofcomponents1,2,3.Adensity //canbeassociatedwiththecomponents;itdefaultsto1.0. constdoubleaDensity1=2.0; constdoubleaDensity2=3.0; aSystem.Add(aComponent1,aDensity1); aSystem.Add(aComponent2,aDensity2); aSystem.Add(aComponent3); //Returnsthecentreofmassofthesystemintheabsolute //Cartesiancoordinatesystem. constgp_PntaG=aSystem.CentreOfMass(); //Computestheprincipalpropertiesofinertiaofthesystem. constGProp_PrincipalPropsaPp=aSystem.PrincipalProperties(); //Returnstheprincipalmomentsandradiiofgyration. doubleaIxx,aIyy,aIzz,aRxx,aRyy,aRzz; aPp.Moments(aIxx,aIyy,aIzz); aPp.RadiusOfGyration(aRxx,aRyy,aRzz);
 * ```
 */
export declare class GProp_GProps {
  /**
   * The origin (0, 0, 0) of the absolute Cartesian coordinate system is used to compute the global properties.
   */
  constructor();
  /**
   * The point SystemLocation is used to compute the global properties of the system. For greater accuracy, define this point close to the location of the system; for example a point near the centre of mass of the system.
   *
   * At initialization the framework is empty: it retains no dimensional information such as mass or inertia. It is, however, ready to bring together global properties of various other systems whose global properties have already been computed using another framework. To do this, use `Add()` to define the components of the system, once per component, and then use the interrogation functions to access the computed values.
   * @param SystemLocation reference point of the system used for inertia accumulation
   */
  constructor(SystemLocation: gp_Pnt);
  /**
   * Either:
   *
   * - initializes the global properties retained by this framework from those retained by the framework Item, or
   * - brings together the global properties retained by this framework with those retained by the framework Item.
   *
   * The value Density (1.0 by default) is used as the density of the system analysed by Item.
   * Sometimes the density has already been accounted for at construction time of Item - for example when Item is a {@link GProp_PGProps | `GProp_PGProps`} framework built to compute the global properties of a set of weighted points, or another {@link GProp_GProps | `GProp_GProps`} object that already retains composite global properties. In these cases the real density was already taken into account at construction of Item.
   * Note that this is not checked: if the density of parts of the system is taken into account two or more times, the result of the computation will be wrong.
   *
   * Notes:
   *
   * - The reference point of Item may differ from the reference point of this framework. Huygens' theorem is applied automatically to transfer inertia values to the reference point of this framework.
   * - `Add()` is used once per component of the system. After all components are composed, the interrogation functions return values for the system as a whole.
   * - The system whose global properties have been brought together by this framework is referred to as the "current system". The current system itself is not retained: only its global properties are.
   * @param Item framework holding the global properties of the component to compose
   * @param Density density of the component (default 1.0)
   */
  Add(Item: GProp_GProps, Density?: number): void;
  /**
   * Returns the mass of the current system.
   *
   * If no density has been attached to the components of the current system, the returned value corresponds to:
   *
   * - the total length of the edges of the current system if this framework retains only linear properties (for example, when using only LinearProperties() to combine properties of lines from shapes), or
   * - the total area of the faces of the current system if this framework retains only surface properties (for example, when using only SurfaceProperties() to combine properties of surfaces from shapes), or
   * - the total volume of the solids of the current system if this framework retains only volume properties (for example, when using only VolumeProperties() to combine properties of volumes from solids).
   * @remarks **Warning:** A length, an area or a volume is computed in the current unit system. The mass of a single object is its length, area or volume multiplied by its density. Be consistent with respect to the units used.
   */
  Mass(): number;
  /**
   * Returns the centre of mass of the current system. With a uniform gravitational field this is also the centre of gravity. The coordinates returned for the centre of mass are expressed in the absolute Cartesian coordinate system.
   */
  CentreOfMass(): gp_Pnt;
  /**
   * Returns the matrix of inertia. It is a symmetric matrix whose coefficients are the quadratic moments of inertia:
   *
   * ```
   * | Ixx Ixy Ixz | matrix = | Ixy Iyy Iyz | | Ixz Iyz Izz |
   * ```
   *
   * Ixx, Iyy, Izz are the moments of inertia; Ixy, Ixz, Iyz are the products of inertia.
   *
   * The matrix of inertia is returned in the central coordinate system (G, Gx, Gy, Gz), where G is the centre of mass of the system and Gx, Gy, Gz are parallel to the X(1, 0, 0), Y(0, 1, 0) and Z(0, 0, 1) directions of the absolute Cartesian coordinate system. To compute the matrix of inertia at another location use `GProp::HOperator()` (Huygens' theorem).
   */
  MatrixOfInertia(): unknown;
  /**
   * Returns the static moments of inertia of the current system - i.e. the moments of inertia about the three axes of the absolute Cartesian coordinate system.
   * @param Ix static moment of inertia about X
   * @param Iy static moment of inertia about Y
   * @param Iz static moment of inertia about Z
   * @returns A result object with fields:
   * - `Ix`: static moment of inertia about X
   * - `Iy`: static moment of inertia about Y
   * - `Iz`: static moment of inertia about Z
   */
  StaticMoments(Ix: number, Iy: number, Iz: number): { Ix: number; Iy: number; Iz: number };
  /**
   * Computes the moment of inertia of the system about the axis A.
   * @param A axis about which the moment of inertia is computed
   */
  MomentOfInertia(A: unknown): number;
  /**
   * Computes the principal properties of inertia of the current system. There is always a set of axes for which the products of inertia of a geometric system are equal to 0 - i.e. the matrix of inertia of the system is diagonal. These axes are the principal axes of inertia; their origin coincides with the centre of mass of the system. The associated moments are called the principal moments of inertia.
   *
   * This function computes the eigen values and eigen vectors of the matrix of inertia of the system. Results are stored in a {@link GProp_PrincipalProps | `GProp_PrincipalProps`} framework which can be queried to access the value sought.
   */
  PrincipalProperties(): unknown;
  /**
   * Returns the radius of gyration of the current system about the axis A.
   * @param A axis about which the radius of gyration is computed
   */
  RadiusOfGyration(A: unknown): number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export declare class GeoSpecMeshOverlapResult {
  constructor();
  constructor(ok: boolean, evidenceJson: string);
  success: boolean;
  evidenceJson(): string;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export declare class GeoSpecNativeVec3 {
  constructor();
  x: number;
  y: number;
  z: number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export declare class GeoSpecMeshDistanceStats {
  constructor();
  min: number;
  mean: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  rms: number;
  samples: number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time. The range of the index is user defined. An array1 can be constructed with a "C array". This functionality is useful to call methods expecting an Array1. It allows to carry the bounds inside the arrays.
 *
 * Examples:
 *
 * ```
 * Itemtab[100];//anexamplewithaCarray NCollection_Array1<Item>ttab(tab[0],1,100); NCollection_Array1<Item>tttab(ttab(10),10,20);//asliceofttab
 * ```
 *
 * If you want to reindex an array from 1 to Length do:
 *
 * ```
 * NCollection_Array1<Item>tab1(tab(tab.Lower()),1,tab.Length());
 * ```
 *
 * Warning: Programs client of such a class must be independent of the range of the first element. Then, a C++ for loop must be written like this
 *
 * ```
 * for(i=A.Lower();i<=A.Upper();i++)
 * ```
 *
 * Zero-based (size_t) construction mode: Use `NCollection_Array1(size_t theSize)` or `NCollection_Array1(pointer, size_t)` to create a zero-based array (`Lower()`==0). In this mode `At()`/ChangeAt() and STL iterators are the preferred access path - they address elements directly without any offset subtraction. Buffer-reuse variants do NOT own the memory and will not free it on destruction.
 *
 * ```
 * intaBuffer[100]; NCollection_Array1<int>aZero(100);//allocates,lower=0 NCollection_Array1<int>aWrap(aBuffer,100);//wrapsaBuffer,lower=0,notowner for(size_ti=0;i<aWrap.Size();++i) aWrap.At(i)=static_cast<int>(i);
 * ```
 */
export declare class NCollection_Array1_int {
  constructor();
  /**
   * Zero-based constructor: allocates theSize elements with lower bound 0. Use `At()`/ChangeAt() or STL iterators for optimal access (no offset subtraction).
   */
  constructor(theSize: number);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Array1_int);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: number, theLower: number, theUpper: number, theUseBuffer?: boolean);
  /**
   * Initialise the items with theValue.
   */
  Init(theValue: number): void;
  /**
   * Size query.
   */
  Size(): number;
  /**
   * Length query (legacy int-returning API).
   */
  Length(): number;
  /**
   * Return TRUE if array has zero length.
   */
  IsEmpty(): boolean;
  /**
   * Lower bound.
   */
  Lower(): number;
  /**
   * Upper bound.
   */
  Upper(): number;
  /**
   * Replaces this array by a copy of theOther array. Bounds and length are copied from theOther. When this array wraps an external (non-owned) buffer:
   *
   * - if theOther has the same length, values are copied in place into the external buffer and ownership is unchanged;
   * - if theOther has a different length, this array detaches from the external buffer and allocates a fresh owned buffer. Use `CopyValues()` to preserve this array's bounds.
   */
  Assign(theOther: NCollection_Array1_int): NCollection_Array1_int;
  /**
   * Copies values from theOther array without changing this array bounds. This array should be pre-allocated and have the same length as theOther; otherwise exception Standard_DimensionMismatch is thrown.
   */
  CopyValues(theOther: NCollection_Array1_int): NCollection_Array1_int;
  /**
   * Move assignment. This array will borrow all the data from theOther. The moved object will keep pointer to the memory buffer and range, but it will not free the buffer on destruction.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Move(theOther: NCollection_Array1_int): NCollection_Array1_int;
  /**
   * @returns first element
   */
  First(): number;
  /**
   * @returns first element
   */
  ChangeFirst(): number;
  /**
   * @returns last element
   */
  Last(): number;
  /**
   * @returns last element
   */
  ChangeLast(): number;
  /**
   * Constant value access.
   */
  Value(theIndex: number): number;
  /**
   * Variable value access.
   */
  ChangeValue(theIndex: number): number;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): number;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): number;
  /**
   * Set value.
   */
  SetValue(theIndex: number, theItem: number): void;
  /**
   * Changes the lowest bound. Do not move data.
   */
  UpdateLowerBound(theLower: number): void;
  /**
   * Changes the upper bound. Do not move data.
   */
  UpdateUpperBound(theUpper: number): void;
  /**
   * Resizes the array to specified bounds. No re-allocation will be done if length of array does not change, but existing values will not be discarded if theToCopyData set to FALSE.
   * @param theLower new lower bound of array
   * @param theUpper new upper bound of array
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  /**
   * Resizes the array to theSize elements, keeping the lower bound unchanged.
   * @param theSize new number of elements
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theSize: number, theToCopyData: boolean): void;
  IsDeletable(): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time. The range of the index is user defined. An array1 can be constructed with a "C array". This functionality is useful to call methods expecting an Array1. It allows to carry the bounds inside the arrays.
 *
 * Examples:
 *
 * ```
 * Itemtab[100];//anexamplewithaCarray NCollection_Array1<Item>ttab(tab[0],1,100); NCollection_Array1<Item>tttab(ttab(10),10,20);//asliceofttab
 * ```
 *
 * If you want to reindex an array from 1 to Length do:
 *
 * ```
 * NCollection_Array1<Item>tab1(tab(tab.Lower()),1,tab.Length());
 * ```
 *
 * Warning: Programs client of such a class must be independent of the range of the first element. Then, a C++ for loop must be written like this
 *
 * ```
 * for(i=A.Lower();i<=A.Upper();i++)
 * ```
 *
 * Zero-based (size_t) construction mode: Use `NCollection_Array1(size_t theSize)` or `NCollection_Array1(pointer, size_t)` to create a zero-based array (`Lower()`==0). In this mode `At()`/ChangeAt() and STL iterators are the preferred access path - they address elements directly without any offset subtraction. Buffer-reuse variants do NOT own the memory and will not free it on destruction.
 *
 * ```
 * intaBuffer[100]; NCollection_Array1<int>aZero(100);//allocates,lower=0 NCollection_Array1<int>aWrap(aBuffer,100);//wrapsaBuffer,lower=0,notowner for(size_ti=0;i<aWrap.Size();++i) aWrap.At(i)=static_cast<int>(i);
 * ```
 */
export declare class NCollection_Array1_gp_Pnt {
  constructor();
  /**
   * Zero-based constructor: allocates theSize elements with lower bound 0. Use `At()`/ChangeAt() or STL iterators for optimal access (no offset subtraction).
   */
  constructor(theSize: number);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Array1_gp_Pnt);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: gp_Pnt, theLower: number, theUpper: number, theUseBuffer?: boolean);
  /**
   * Initialise the items with theValue.
   */
  Init(theValue: gp_Pnt): void;
  /**
   * Size query.
   */
  Size(): number;
  /**
   * Length query (legacy int-returning API).
   */
  Length(): number;
  /**
   * Return TRUE if array has zero length.
   */
  IsEmpty(): boolean;
  /**
   * Lower bound.
   */
  Lower(): number;
  /**
   * Upper bound.
   */
  Upper(): number;
  /**
   * Replaces this array by a copy of theOther array. Bounds and length are copied from theOther. When this array wraps an external (non-owned) buffer:
   *
   * - if theOther has the same length, values are copied in place into the external buffer and ownership is unchanged;
   * - if theOther has a different length, this array detaches from the external buffer and allocates a fresh owned buffer. Use `CopyValues()` to preserve this array's bounds.
   */
  Assign(theOther: NCollection_Array1_gp_Pnt): NCollection_Array1_gp_Pnt;
  /**
   * Copies values from theOther array without changing this array bounds. This array should be pre-allocated and have the same length as theOther; otherwise exception Standard_DimensionMismatch is thrown.
   */
  CopyValues(theOther: NCollection_Array1_gp_Pnt): NCollection_Array1_gp_Pnt;
  /**
   * Move assignment. This array will borrow all the data from theOther. The moved object will keep pointer to the memory buffer and range, but it will not free the buffer on destruction.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Move(theOther: NCollection_Array1_gp_Pnt): NCollection_Array1_gp_Pnt;
  /**
   * @returns first element
   */
  First(): gp_Pnt;
  /**
   * @returns first element
   */
  ChangeFirst(): gp_Pnt;
  /**
   * @returns last element
   */
  Last(): gp_Pnt;
  /**
   * @returns last element
   */
  ChangeLast(): gp_Pnt;
  /**
   * Constant value access.
   */
  Value(theIndex: number): gp_Pnt;
  /**
   * Variable value access.
   */
  ChangeValue(theIndex: number): gp_Pnt;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): gp_Pnt;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): gp_Pnt;
  /**
   * Set value.
   */
  SetValue(theIndex: number, theItem: gp_Pnt): void;
  /**
   * Changes the lowest bound. Do not move data.
   */
  UpdateLowerBound(theLower: number): void;
  /**
   * Changes the upper bound. Do not move data.
   */
  UpdateUpperBound(theUpper: number): void;
  /**
   * Resizes the array to specified bounds. No re-allocation will be done if length of array does not change, but existing values will not be discarded if theToCopyData set to FALSE.
   * @param theLower new lower bound of array
   * @param theUpper new upper bound of array
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  /**
   * Resizes the array to theSize elements, keeping the lower bound unchanged.
   * @param theSize new number of elements
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theSize: number, theToCopyData: boolean): void;
  IsDeletable(): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Template class for Handle-managed sequences. Inherits from both NCollection_Sequence<TheItemType> and {@link Standard_Transient | `Standard_Transient`}, providing reference-counted sequence functionality.
 */
export declare class NCollection_HSequence_handle_Standard_Transient {
  /**
   * Default constructor.
   */
  constructor();
  /**
   * Copy constructor from sequence.
   * @param theOther the sequence to copy from
   */
  constructor(theOther: any);
  /**
   * Returns const reference to the underlying sequence.
   */
  Sequence(): any;
  /**
   * Returns mutable reference to the underlying sequence.
   */
  ChangeSequence(): any;
  /**
   * Append single item.
   * @param theItem the item to append
   */
  Append(theItem: unknown): void;
  /**
   * Append another sequence.
   * @param theSequence the sequence to append
   */
  Append(theSequence: any): void;
  /**
   * Append single item.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  Append(theSeq: unknown): void;
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Purpose: Definition of a sequence of elements indexed by an Integer in range of 1..n
 */
export declare class NCollection_Sequence_handle_Standard_Transient {
  /**
   * Empty constructor.
   */
  constructor();
  /**
   * Constructor.
   */
  constructor(theAllocator: unknown);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Sequence_handle_Standard_Transient);
  // dropped: delNode param 0 resolves to excluded type NCollection_SeqNode
  /**
   * Method for consistency with other collections.
   * @returns Lower bound (inclusive) for iteration.
   */
  static Lower(): number;
  /**
   * Method for consistency with other collections.
   * @returns Upper bound (inclusive) for iteration.
   */
  Upper(): number;
  /**
   * Empty query.
   */
  IsEmpty(): boolean;
  /**
   * Reverse sequence.
   */
  Reverse(): void;
  /**
   * Exchange two members.
   */
  Exchange(I: number, J: number): void;
  /**
   * Clear the items out, take a new allocator if non null.
   */
  Clear(theAllocator?: unknown): void;
  /**
   * Replace this sequence by the items of theOther. This method does not change the internal allocator.
   */
  Assign(theOther: NCollection_Sequence_handle_Standard_Transient): NCollection_Sequence_handle_Standard_Transient;
  /**
   * Remove one item.
   */
  Remove(theIndex: number): void;
  /**
   * Remove range of items.
   */
  Remove(theFromIndex: number, theToIndex: number): void;
  /**
   * Append one item.
   */
  Append(theItem: unknown): void;
  /**
   * Append one item.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  Append(theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  /**
   * Prepend one item.
   */
  Prepend(theItem: unknown): void;
  /**
   * Prepend one item.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  Prepend(theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  /**
   * InsertBefore theIndex theItem.
   */
  InsertBefore(theIndex: number, theItem: unknown): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  /**
   * InsertAfter the position of iterator.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  /**
   * InsertAfter the position of iterator.
   */
  InsertAfter(theIndex: number, theItem: unknown): void;
  /**
   * Split in two sequences.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  /**
   * First item access.
   */
  First(): unknown;
  /**
   * First item access.
   */
  ChangeFirst(): unknown;
  /**
   * Last item access.
   */
  Last(): unknown;
  /**
   * Last item access.
   */
  ChangeLast(): unknown;
  /**
   * Constant item access by theIndex.
   */
  Value(theIndex: number): unknown;
  /**
   * Variable item access by theIndex.
   */
  ChangeValue(theIndex: number): unknown;
  /**
   * Set item value by theIndex.
   */
  SetValue(theIndex: number, theItem: unknown): void;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): unknown;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export declare class GeoSpecMeshMetrics {
  constructor();
  static componentOverlapFromTrianglePointers(
    trianglePointer: number,
    triangleCount: number,
    componentIdPointer: number,
    componentCount: number,
    tolerance: number,
  ): GeoSpecMeshOverlapResult;
  static chamferDistanceFromTrianglePointers(
    actualPointer: number,
    actualTriangleCount: number,
    expectedPointer: number,
    expectedTriangleCount: number,
    samples: number,
  ): GeoSpecMeshDistanceStats;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Template class for Handle-managed 1D arrays. Inherits from both NCollection_Array1<TheItemType> and {@link Standard_Transient | `Standard_Transient`}, providing reference-counted array functionality.
 */
export declare class NCollection_HArray1_gp_Pnt {
  /**
   * Default constructor.
   */
  constructor();
  /**
   * Copy constructor from array.
   * @param theOther the array to copy from
   */
  constructor(theOther: any);
  /**
   * Constructor with bounds.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   */
  constructor(theLower: number, theUpper: number);
  /**
   * Constructor with bounds and initial value.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theValue initial value for all elements
   */
  constructor(theLower: number, theUpper: number, theValue: gp_Pnt);
  /**
   * Constructor from C array.
   * @param theBegin reference to the first element of a C array
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theUseBuffer flag indicating whether to use external buffer (must be explicit)
   */
  constructor(theBegin: gp_Pnt, theLower: number, theUpper: number, theUseBuffer: boolean);
  /**
   * Returns const reference to the underlying array.
   */
  Array1(): any;
  /**
   * Returns mutable reference to the underlying array.
   */
  ChangeArray1(): any;
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time. The range of the index is user defined. An array1 can be constructed with a "C array". This functionality is useful to call methods expecting an Array1. It allows to carry the bounds inside the arrays.
 *
 * Examples:
 *
 * ```
 * Itemtab[100];//anexamplewithaCarray NCollection_Array1<Item>ttab(tab[0],1,100); NCollection_Array1<Item>tttab(ttab(10),10,20);//asliceofttab
 * ```
 *
 * If you want to reindex an array from 1 to Length do:
 *
 * ```
 * NCollection_Array1<Item>tab1(tab(tab.Lower()),1,tab.Length());
 * ```
 *
 * Warning: Programs client of such a class must be independent of the range of the first element. Then, a C++ for loop must be written like this
 *
 * ```
 * for(i=A.Lower();i<=A.Upper();i++)
 * ```
 *
 * Zero-based (size_t) construction mode: Use `NCollection_Array1(size_t theSize)` or `NCollection_Array1(pointer, size_t)` to create a zero-based array (`Lower()`==0). In this mode `At()`/ChangeAt() and STL iterators are the preferred access path - they address elements directly without any offset subtraction. Buffer-reuse variants do NOT own the memory and will not free it on destruction.
 *
 * ```
 * intaBuffer[100]; NCollection_Array1<int>aZero(100);//allocates,lower=0 NCollection_Array1<int>aWrap(aBuffer,100);//wrapsaBuffer,lower=0,notowner for(size_ti=0;i<aWrap.Size();++i) aWrap.At(i)=static_cast<int>(i);
 * ```
 */
export declare class NCollection_Array1_NCollection_Vec3_float {
  constructor();
  /**
   * Zero-based constructor: allocates theSize elements with lower bound 0. Use `At()`/ChangeAt() or STL iterators for optimal access (no offset subtraction).
   */
  constructor(theSize: number);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Array1_NCollection_Vec3_float);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: unknown, theLower: number, theUpper: number, theUseBuffer?: boolean);
  /**
   * Initialise the items with theValue.
   */
  Init(theValue: unknown): void;
  /**
   * Size query.
   */
  Size(): number;
  /**
   * Length query (legacy int-returning API).
   */
  Length(): number;
  /**
   * Return TRUE if array has zero length.
   */
  IsEmpty(): boolean;
  /**
   * Lower bound.
   */
  Lower(): number;
  /**
   * Upper bound.
   */
  Upper(): number;
  /**
   * Replaces this array by a copy of theOther array. Bounds and length are copied from theOther. When this array wraps an external (non-owned) buffer:
   *
   * - if theOther has the same length, values are copied in place into the external buffer and ownership is unchanged;
   * - if theOther has a different length, this array detaches from the external buffer and allocates a fresh owned buffer. Use `CopyValues()` to preserve this array's bounds.
   */
  Assign(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;
  /**
   * Copies values from theOther array without changing this array bounds. This array should be pre-allocated and have the same length as theOther; otherwise exception Standard_DimensionMismatch is thrown.
   */
  CopyValues(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;
  /**
   * Move assignment. This array will borrow all the data from theOther. The moved object will keep pointer to the memory buffer and range, but it will not free the buffer on destruction.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Move(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;
  /**
   * @returns first element
   */
  First(): unknown;
  /**
   * @returns first element
   */
  ChangeFirst(): unknown;
  /**
   * @returns last element
   */
  Last(): unknown;
  /**
   * @returns last element
   */
  ChangeLast(): unknown;
  /**
   * Constant value access.
   */
  Value(theIndex: number): unknown;
  /**
   * Variable value access.
   */
  ChangeValue(theIndex: number): unknown;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): unknown;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): unknown;
  /**
   * Set value.
   */
  SetValue(theIndex: number, theItem: unknown): void;
  /**
   * Changes the lowest bound. Do not move data.
   */
  UpdateLowerBound(theLower: number): void;
  /**
   * Changes the upper bound. Do not move data.
   */
  UpdateUpperBound(theUpper: number): void;
  /**
   * Resizes the array to specified bounds. No re-allocation will be done if length of array does not change, but existing values will not be discarded if theToCopyData set to FALSE.
   * @param theLower new lower bound of array
   * @param theUpper new upper bound of array
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  /**
   * Resizes the array to theSize elements, keeping the lower bound unchanged.
   * @param theSize new number of elements
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theSize: number, theToCopyData: boolean): void;
  IsDeletable(): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time. The range of the index is user defined. An array1 can be constructed with a "C array". This functionality is useful to call methods expecting an Array1. It allows to carry the bounds inside the arrays.
 *
 * Examples:
 *
 * ```
 * Itemtab[100];//anexamplewithaCarray NCollection_Array1<Item>ttab(tab[0],1,100); NCollection_Array1<Item>tttab(ttab(10),10,20);//asliceofttab
 * ```
 *
 * If you want to reindex an array from 1 to Length do:
 *
 * ```
 * NCollection_Array1<Item>tab1(tab(tab.Lower()),1,tab.Length());
 * ```
 *
 * Warning: Programs client of such a class must be independent of the range of the first element. Then, a C++ for loop must be written like this
 *
 * ```
 * for(i=A.Lower();i<=A.Upper();i++)
 * ```
 *
 * Zero-based (size_t) construction mode: Use `NCollection_Array1(size_t theSize)` or `NCollection_Array1(pointer, size_t)` to create a zero-based array (`Lower()`==0). In this mode `At()`/ChangeAt() and STL iterators are the preferred access path - they address elements directly without any offset subtraction. Buffer-reuse variants do NOT own the memory and will not free it on destruction.
 *
 * ```
 * intaBuffer[100]; NCollection_Array1<int>aZero(100);//allocates,lower=0 NCollection_Array1<int>aWrap(aBuffer,100);//wrapsaBuffer,lower=0,notowner for(size_ti=0;i<aWrap.Size();++i) aWrap.At(i)=static_cast<int>(i);
 * ```
 */
export declare class NCollection_Array1_gp_Pnt2d {
  constructor();
  /**
   * Zero-based constructor: allocates theSize elements with lower bound 0. Use `At()`/ChangeAt() or STL iterators for optimal access (no offset subtraction).
   */
  constructor(theSize: number);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Array1_gp_Pnt2d);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: unknown, theLower: number, theUpper: number, theUseBuffer?: boolean);
  /**
   * Initialise the items with theValue.
   */
  Init(theValue: unknown): void;
  /**
   * Size query.
   */
  Size(): number;
  /**
   * Length query (legacy int-returning API).
   */
  Length(): number;
  /**
   * Return TRUE if array has zero length.
   */
  IsEmpty(): boolean;
  /**
   * Lower bound.
   */
  Lower(): number;
  /**
   * Upper bound.
   */
  Upper(): number;
  /**
   * Replaces this array by a copy of theOther array. Bounds and length are copied from theOther. When this array wraps an external (non-owned) buffer:
   *
   * - if theOther has the same length, values are copied in place into the external buffer and ownership is unchanged;
   * - if theOther has a different length, this array detaches from the external buffer and allocates a fresh owned buffer. Use `CopyValues()` to preserve this array's bounds.
   */
  Assign(theOther: NCollection_Array1_gp_Pnt2d): NCollection_Array1_gp_Pnt2d;
  /**
   * Copies values from theOther array without changing this array bounds. This array should be pre-allocated and have the same length as theOther; otherwise exception Standard_DimensionMismatch is thrown.
   */
  CopyValues(theOther: NCollection_Array1_gp_Pnt2d): NCollection_Array1_gp_Pnt2d;
  /**
   * Move assignment. This array will borrow all the data from theOther. The moved object will keep pointer to the memory buffer and range, but it will not free the buffer on destruction.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Move(theOther: NCollection_Array1_gp_Pnt2d): NCollection_Array1_gp_Pnt2d;
  /**
   * @returns first element
   */
  First(): unknown;
  /**
   * @returns first element
   */
  ChangeFirst(): unknown;
  /**
   * @returns last element
   */
  Last(): unknown;
  /**
   * @returns last element
   */
  ChangeLast(): unknown;
  /**
   * Constant value access.
   */
  Value(theIndex: number): unknown;
  /**
   * Variable value access.
   */
  ChangeValue(theIndex: number): unknown;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): unknown;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): unknown;
  /**
   * Set value.
   */
  SetValue(theIndex: number, theItem: unknown): void;
  /**
   * Changes the lowest bound. Do not move data.
   */
  UpdateLowerBound(theLower: number): void;
  /**
   * Changes the upper bound. Do not move data.
   */
  UpdateUpperBound(theUpper: number): void;
  /**
   * Resizes the array to specified bounds. No re-allocation will be done if length of array does not change, but existing values will not be discarded if theToCopyData set to FALSE.
   * @param theLower new lower bound of array
   * @param theUpper new upper bound of array
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  /**
   * Resizes the array to theSize elements, keeping the lower bound unchanged.
   * @param theSize new number of elements
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theSize: number, theToCopyData: boolean): void;
  IsDeletable(): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Template class for Handle-managed 1D arrays. Inherits from both NCollection_Array1<TheItemType> and {@link Standard_Transient | `Standard_Transient`}, providing reference-counted array functionality.
 */
export declare class NCollection_HArray1_float {
  /**
   * Default constructor.
   */
  constructor();
  /**
   * Copy constructor from array.
   * @param theOther the array to copy from
   */
  constructor(theOther: any);
  /**
   * Constructor with bounds.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   */
  constructor(theLower: number, theUpper: number);
  /**
   * Constructor with bounds and initial value.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theValue initial value for all elements
   */
  constructor(theLower: number, theUpper: number, theValue: number);
  /**
   * Constructor from C array.
   * @param theBegin reference to the first element of a C array
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theUseBuffer flag indicating whether to use external buffer (must be explicit)
   */
  constructor(theBegin: number, theLower: number, theUpper: number, theUseBuffer: boolean);
  /**
   * Returns const reference to the underlying array.
   */
  Array1(): any;
  /**
   * Returns mutable reference to the underlying array.
   */
  ChangeArray1(): any;
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export declare class GeoSpecPoint {
  constructor();
  x: number;
  y: number;
  z: number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export declare class GeoSpecStepReadResult {
  constructor();
  constructor(other: GeoSpecStepReadResult);
  constructor(ok: boolean, evidenceJson: string, meshTrianglesPtr: number, meshTriangleCount: number);
  success: boolean;
  evidenceJson(): string;
  meshTrianglePointer(): number;
  meshTriangleCount(): number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Purpose: Simple list to link items together keeping the first and the last one. Inherits BaseList, adding the data item to each node.
 */
export declare class NCollection_List_TopoDS_Shape {
  /**
   * Empty constructor.
   */
  constructor();
  /**
   * Constructor.
   */
  constructor(theAllocator: unknown);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_List_TopoDS_Shape);
  /**
   * Initializer list constructor.
   * @param theInitList initializer list of elements to populate the list
   * @param theAllocator optional allocator for memory management
   */
  constructor(theInitList: TopoDS_Shape[], theAllocator?: unknown);
  // dropped: appendList param 0 resolves to excluded type NCollection_ListNode
  /**
   * Replace this list by the items of another list (theOther parameter). This method does not change the internal allocator.
   */
  Assign(theOther: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
  /**
   * Clear this list.
   */
  Clear(theAllocator?: unknown): void;
  /**
   * First item.
   */
  First(): TopoDS_Shape;
  /**
   * Last item.
   */
  Last(): TopoDS_Shape;
  /**
   * Append one item at the end.
   */
  Append(theItem: TopoDS_Shape): TopoDS_Shape;
  /**
   * Append one item at the end.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Append(theOther: NCollection_List_TopoDS_Shape): void;
  /**
   * Prepend one item at the beginning.
   */
  Prepend(theItem: TopoDS_Shape): TopoDS_Shape;
  /**
   * Prepend one item at the beginning.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Prepend(theOther: NCollection_List_TopoDS_Shape): void;
  /**
   * RemoveFirst item.
   */
  RemoveFirst(): void;
  /**
   * Reverse the list.
   */
  Reverse(): void;
  /**
   * Exchange the content of two lists without re-allocations. Swaps all internal state including allocators, ensuring correct deallocation. Existing iterators remain valid but will point to the other list's elements.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Exchange(theOther: NCollection_List_TopoDS_Shape): void;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time. The range of the index is user defined. An array1 can be constructed with a "C array". This functionality is useful to call methods expecting an Array1. It allows to carry the bounds inside the arrays.
 *
 * Examples:
 *
 * ```
 * Itemtab[100];//anexamplewithaCarray NCollection_Array1<Item>ttab(tab[0],1,100); NCollection_Array1<Item>tttab(ttab(10),10,20);//asliceofttab
 * ```
 *
 * If you want to reindex an array from 1 to Length do:
 *
 * ```
 * NCollection_Array1<Item>tab1(tab(tab.Lower()),1,tab.Length());
 * ```
 *
 * Warning: Programs client of such a class must be independent of the range of the first element. Then, a C++ for loop must be written like this
 *
 * ```
 * for(i=A.Lower();i<=A.Upper();i++)
 * ```
 *
 * Zero-based (size_t) construction mode: Use `NCollection_Array1(size_t theSize)` or `NCollection_Array1(pointer, size_t)` to create a zero-based array (`Lower()`==0). In this mode `At()`/ChangeAt() and STL iterators are the preferred access path - they address elements directly without any offset subtraction. Buffer-reuse variants do NOT own the memory and will not free it on destruction.
 *
 * ```
 * intaBuffer[100]; NCollection_Array1<int>aZero(100);//allocates,lower=0 NCollection_Array1<int>aWrap(aBuffer,100);//wrapsaBuffer,lower=0,notowner for(size_ti=0;i<aWrap.Size();++i) aWrap.At(i)=static_cast<int>(i);
 * ```
 */
export declare class NCollection_Array1_float {
  constructor();
  /**
   * Zero-based constructor: allocates theSize elements with lower bound 0. Use `At()`/ChangeAt() or STL iterators for optimal access (no offset subtraction).
   */
  constructor(theSize: number);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Array1_float);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: number, theLower: number, theUpper: number, theUseBuffer?: boolean);
  /**
   * Initialise the items with theValue.
   */
  Init(theValue: number): void;
  /**
   * Size query.
   */
  Size(): number;
  /**
   * Length query (legacy int-returning API).
   */
  Length(): number;
  /**
   * Return TRUE if array has zero length.
   */
  IsEmpty(): boolean;
  /**
   * Lower bound.
   */
  Lower(): number;
  /**
   * Upper bound.
   */
  Upper(): number;
  /**
   * Replaces this array by a copy of theOther array. Bounds and length are copied from theOther. When this array wraps an external (non-owned) buffer:
   *
   * - if theOther has the same length, values are copied in place into the external buffer and ownership is unchanged;
   * - if theOther has a different length, this array detaches from the external buffer and allocates a fresh owned buffer. Use `CopyValues()` to preserve this array's bounds.
   */
  Assign(theOther: NCollection_Array1_float): NCollection_Array1_float;
  /**
   * Copies values from theOther array without changing this array bounds. This array should be pre-allocated and have the same length as theOther; otherwise exception Standard_DimensionMismatch is thrown.
   */
  CopyValues(theOther: NCollection_Array1_float): NCollection_Array1_float;
  /**
   * Move assignment. This array will borrow all the data from theOther. The moved object will keep pointer to the memory buffer and range, but it will not free the buffer on destruction.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Move(theOther: NCollection_Array1_float): NCollection_Array1_float;
  /**
   * @returns first element
   */
  First(): number;
  /**
   * @returns first element
   */
  ChangeFirst(): number;
  /**
   * @returns last element
   */
  Last(): number;
  /**
   * @returns last element
   */
  ChangeLast(): number;
  /**
   * Constant value access.
   */
  Value(theIndex: number): number;
  /**
   * Variable value access.
   */
  ChangeValue(theIndex: number): number;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): number;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): number;
  /**
   * Set value.
   */
  SetValue(theIndex: number, theItem: number): void;
  /**
   * Changes the lowest bound. Do not move data.
   */
  UpdateLowerBound(theLower: number): void;
  /**
   * Changes the upper bound. Do not move data.
   */
  UpdateUpperBound(theUpper: number): void;
  /**
   * Resizes the array to specified bounds. No re-allocation will be done if length of array does not change, but existing values will not be discarded if theToCopyData set to FALSE.
   * @param theLower new lower bound of array
   * @param theUpper new upper bound of array
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  /**
   * Resizes the array to theSize elements, keeping the lower bound unchanged.
   * @param theSize new number of elements
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theSize: number, theToCopyData: boolean): void;
  IsDeletable(): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time. The range of the index is user defined. An array1 can be constructed with a "C array". This functionality is useful to call methods expecting an Array1. It allows to carry the bounds inside the arrays.
 *
 * Examples:
 *
 * ```
 * Itemtab[100];//anexamplewithaCarray NCollection_Array1<Item>ttab(tab[0],1,100); NCollection_Array1<Item>tttab(ttab(10),10,20);//asliceofttab
 * ```
 *
 * If you want to reindex an array from 1 to Length do:
 *
 * ```
 * NCollection_Array1<Item>tab1(tab(tab.Lower()),1,tab.Length());
 * ```
 *
 * Warning: Programs client of such a class must be independent of the range of the first element. Then, a C++ for loop must be written like this
 *
 * ```
 * for(i=A.Lower();i<=A.Upper();i++)
 * ```
 *
 * Zero-based (size_t) construction mode: Use `NCollection_Array1(size_t theSize)` or `NCollection_Array1(pointer, size_t)` to create a zero-based array (`Lower()`==0). In this mode `At()`/ChangeAt() and STL iterators are the preferred access path - they address elements directly without any offset subtraction. Buffer-reuse variants do NOT own the memory and will not free it on destruction.
 *
 * ```
 * intaBuffer[100]; NCollection_Array1<int>aZero(100);//allocates,lower=0 NCollection_Array1<int>aWrap(aBuffer,100);//wrapsaBuffer,lower=0,notowner for(size_ti=0;i<aWrap.Size();++i) aWrap.At(i)=static_cast<int>(i);
 * ```
 */
export declare class NCollection_Array1_double {
  constructor();
  /**
   * Zero-based constructor: allocates theSize elements with lower bound 0. Use `At()`/ChangeAt() or STL iterators for optimal access (no offset subtraction).
   */
  constructor(theSize: number);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Array1_double);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: number, theLower: number, theUpper: number, theUseBuffer?: boolean);
  /**
   * Initialise the items with theValue.
   */
  Init(theValue: number): void;
  /**
   * Size query.
   */
  Size(): number;
  /**
   * Length query (legacy int-returning API).
   */
  Length(): number;
  /**
   * Return TRUE if array has zero length.
   */
  IsEmpty(): boolean;
  /**
   * Lower bound.
   */
  Lower(): number;
  /**
   * Upper bound.
   */
  Upper(): number;
  /**
   * Replaces this array by a copy of theOther array. Bounds and length are copied from theOther. When this array wraps an external (non-owned) buffer:
   *
   * - if theOther has the same length, values are copied in place into the external buffer and ownership is unchanged;
   * - if theOther has a different length, this array detaches from the external buffer and allocates a fresh owned buffer. Use `CopyValues()` to preserve this array's bounds.
   */
  Assign(theOther: NCollection_Array1_double): NCollection_Array1_double;
  /**
   * Copies values from theOther array without changing this array bounds. This array should be pre-allocated and have the same length as theOther; otherwise exception Standard_DimensionMismatch is thrown.
   */
  CopyValues(theOther: NCollection_Array1_double): NCollection_Array1_double;
  /**
   * Move assignment. This array will borrow all the data from theOther. The moved object will keep pointer to the memory buffer and range, but it will not free the buffer on destruction.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Move(theOther: NCollection_Array1_double): NCollection_Array1_double;
  /**
   * @returns first element
   */
  First(): number;
  /**
   * @returns first element
   */
  ChangeFirst(): number;
  /**
   * @returns last element
   */
  Last(): number;
  /**
   * @returns last element
   */
  ChangeLast(): number;
  /**
   * Constant value access.
   */
  Value(theIndex: number): number;
  /**
   * Variable value access.
   */
  ChangeValue(theIndex: number): number;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): number;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): number;
  /**
   * Set value.
   */
  SetValue(theIndex: number, theItem: number): void;
  /**
   * Changes the lowest bound. Do not move data.
   */
  UpdateLowerBound(theLower: number): void;
  /**
   * Changes the upper bound. Do not move data.
   */
  UpdateUpperBound(theUpper: number): void;
  /**
   * Resizes the array to specified bounds. No re-allocation will be done if length of array does not change, but existing values will not be discarded if theToCopyData set to FALSE.
   * @param theLower new lower bound of array
   * @param theUpper new upper bound of array
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  /**
   * Resizes the array to theSize elements, keeping the lower bound unchanged.
   * @param theSize new number of elements
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theSize: number, theToCopyData: boolean): void;
  IsDeletable(): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Purpose: An indexed map is used to store keys and to bind an index to them. Each new key stored in the map gets an index. Index are incremented as keys are stored in the map. A key can be found by the index and an index by the key. No key but the last can be removed so the indices are in the range 1..Extent. See the class Map from NCollection for a discussion about the number of buckets.
 */
export declare class NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher {
  /**
   * Empty constructor.
   */
  constructor();
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher);
  /**
   * Exchange the content of two maps without re-allocations. Notice that allocators will be swapped as well!
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Exchange(theOther: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
  /**
   * Returns const reference to the hasher.
   */
  GetHasher(): unknown;
  /**
   * Assign. This method does not change the internal allocator.
   */
  Assign(
    theOther: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher,
  ): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;
  /**
   * ReSize.
   */
  ReSize(theExtent: number): void;
  /**
   * Add adds a new key to the map.
   * @param theKey1 key to add
   * @returns index of the key (new or existing)
   */
  Add(theKey1: TopoDS_Shape): number;
  /**
   * Added: add a new key if not yet in the map, and return reference to either newly added or previously existing key.
   * @param theKey1 key to add
   * @returns const reference to the key in the map
   */
  Added(theKey1: TopoDS_Shape): TopoDS_Shape;
  /**
   * Contains.
   */
  Contains(theKey1: TopoDS_Shape): boolean;
  /**
   * Substitute.
   */
  Substitute(theIndex: number, theKey1: TopoDS_Shape): void;
  /**
   * Swaps two elements with the given indices.
   */
  Swap(theIndex1: number, theIndex2: number): void;
  /**
   * RemoveLast.
   */
  RemoveLast(): void;
  /**
   * Remove the key of the given index. Caution! The index of the last key can be changed.
   */
  RemoveFromIndex(theIndex: number): void;
  /**
   * Remove the given key. Caution! The index of the last key can be changed.
   */
  RemoveKey(theKey1: TopoDS_Shape): boolean;
  /**
   * FindKey.
   */
  FindKey(theIndex: number): TopoDS_Shape;
  /**
   * FindIndex.
   */
  FindIndex(theKey1: TopoDS_Shape): number;
  /**
   * Clear data. If doReleaseMemory is false then the table of buckets is not released and will be reused.
   */
  Clear(doReleaseMemory: boolean): void;
  /**
   * Clear data and reset allocator.
   */
  Clear(theAllocator: unknown): void;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Constructor.
 */
export declare class NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_2 extends NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher {
  /**
   * Constructor.
   */
  constructor(theNbBuckets: number, theAllocator: unknown);
}

/**
 * Constructor (legacy int-taking).
 */
export declare class NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_3 extends NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher {
  /**
   * Constructor (legacy int-taking).
   */
  constructor(theNbBuckets: number, theAllocator: unknown);
}

/**
 * Constructor with custom hasher (copy).
 * @param theHasher custom hasher instance
 * @param theNbBuckets initial number of buckets
 * @param theAllocator custom memory allocator
 */
export declare class NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_4 extends NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher {
  /**
   * Constructor with custom hasher (copy).
   * @param theHasher custom hasher instance
   * @param theNbBuckets initial number of buckets
   * @param theAllocator custom memory allocator
   */
  constructor(theHasher: unknown, theNbBuckets: number, theAllocator: unknown);
}

/**
 * Constructor with custom hasher (move).
 * @param theHasher custom hasher instance (moved)
 * @param theNbBuckets initial number of buckets
 * @param theAllocator custom memory allocator
 */
export declare class NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_5 extends NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher {
  /**
   * Constructor with custom hasher (move).
   * @param theHasher custom hasher instance (moved)
   * @param theNbBuckets initial number of buckets
   * @param theAllocator custom memory allocator
   */
  constructor(theHasher: unknown, theNbBuckets: number, theAllocator: unknown);
}

/**
 * Constructor with custom hasher (move).
 * @param theHasher custom hasher instance (moved)
 * @param theNbBuckets initial number of buckets
 * @param theAllocator custom memory allocator
 */
export declare class NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_6 extends NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher {
  /**
   * Constructor with custom hasher (move).
   * @param theHasher custom hasher instance (moved)
   * @param theNbBuckets initial number of buckets
   * @param theAllocator custom memory allocator
   */
  constructor(theHasher: unknown, theNbBuckets: number, theAllocator: unknown);
}

/**
 * Constructor with custom hasher (move).
 * @param theHasher custom hasher instance (moved)
 * @param theNbBuckets initial number of buckets
 * @param theAllocator custom memory allocator
 */
export declare class NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_7 extends NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher {
  /**
   * Constructor with custom hasher (move).
   * @param theHasher custom hasher instance (moved)
   * @param theNbBuckets initial number of buckets
   * @param theAllocator custom memory allocator
   */
  constructor(theHasher: unknown, theNbBuckets: number, theAllocator: unknown);
}

/**
 * Template class for Handle-managed 1D arrays. Inherits from both NCollection_Array1<TheItemType> and {@link Standard_Transient | `Standard_Transient`}, providing reference-counted array functionality.
 */
export declare class NCollection_HArray1_Poly_Triangle {
  /**
   * Default constructor.
   */
  constructor();
  /**
   * Copy constructor from array.
   * @param theOther the array to copy from
   */
  constructor(theOther: any);
  /**
   * Constructor with bounds.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   */
  constructor(theLower: number, theUpper: number);
  /**
   * Constructor with bounds and initial value.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theValue initial value for all elements
   */
  constructor(theLower: number, theUpper: number, theValue: Poly_Triangle);
  /**
   * Constructor from C array.
   * @param theBegin reference to the first element of a C array
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theUseBuffer flag indicating whether to use external buffer (must be explicit)
   */
  constructor(theBegin: Poly_Triangle, theLower: number, theUpper: number, theUseBuffer: boolean);
  /**
   * Returns const reference to the underlying array.
   */
  Array1(): any;
  /**
   * Returns mutable reference to the underlying array.
   */
  ChangeArray1(): any;
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time. The range of the index is user defined. An array1 can be constructed with a "C array". This functionality is useful to call methods expecting an Array1. It allows to carry the bounds inside the arrays.
 *
 * Examples:
 *
 * ```
 * Itemtab[100];//anexamplewithaCarray NCollection_Array1<Item>ttab(tab[0],1,100); NCollection_Array1<Item>tttab(ttab(10),10,20);//asliceofttab
 * ```
 *
 * If you want to reindex an array from 1 to Length do:
 *
 * ```
 * NCollection_Array1<Item>tab1(tab(tab.Lower()),1,tab.Length());
 * ```
 *
 * Warning: Programs client of such a class must be independent of the range of the first element. Then, a C++ for loop must be written like this
 *
 * ```
 * for(i=A.Lower();i<=A.Upper();i++)
 * ```
 *
 * Zero-based (size_t) construction mode: Use `NCollection_Array1(size_t theSize)` or `NCollection_Array1(pointer, size_t)` to create a zero-based array (`Lower()`==0). In this mode `At()`/ChangeAt() and STL iterators are the preferred access path - they address elements directly without any offset subtraction. Buffer-reuse variants do NOT own the memory and will not free it on destruction.
 *
 * ```
 * intaBuffer[100]; NCollection_Array1<int>aZero(100);//allocates,lower=0 NCollection_Array1<int>aWrap(aBuffer,100);//wrapsaBuffer,lower=0,notowner for(size_ti=0;i<aWrap.Size();++i) aWrap.At(i)=static_cast<int>(i);
 * ```
 */
export declare class NCollection_Array1_Poly_Triangle {
  constructor();
  /**
   * Zero-based constructor: allocates theSize elements with lower bound 0. Use `At()`/ChangeAt() or STL iterators for optimal access (no offset subtraction).
   */
  constructor(theSize: number);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Array1_Poly_Triangle);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Poly_Triangle, theLower: number, theUpper: number, theUseBuffer?: boolean);
  /**
   * Initialise the items with theValue.
   */
  Init(theValue: Poly_Triangle): void;
  /**
   * Size query.
   */
  Size(): number;
  /**
   * Length query (legacy int-returning API).
   */
  Length(): number;
  /**
   * Return TRUE if array has zero length.
   */
  IsEmpty(): boolean;
  /**
   * Lower bound.
   */
  Lower(): number;
  /**
   * Upper bound.
   */
  Upper(): number;
  /**
   * Replaces this array by a copy of theOther array. Bounds and length are copied from theOther. When this array wraps an external (non-owned) buffer:
   *
   * - if theOther has the same length, values are copied in place into the external buffer and ownership is unchanged;
   * - if theOther has a different length, this array detaches from the external buffer and allocates a fresh owned buffer. Use `CopyValues()` to preserve this array's bounds.
   */
  Assign(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;
  /**
   * Copies values from theOther array without changing this array bounds. This array should be pre-allocated and have the same length as theOther; otherwise exception Standard_DimensionMismatch is thrown.
   */
  CopyValues(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;
  /**
   * Move assignment. This array will borrow all the data from theOther. The moved object will keep pointer to the memory buffer and range, but it will not free the buffer on destruction.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Move(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;
  /**
   * @returns first element
   */
  First(): Poly_Triangle;
  /**
   * @returns first element
   */
  ChangeFirst(): Poly_Triangle;
  /**
   * @returns last element
   */
  Last(): Poly_Triangle;
  /**
   * @returns last element
   */
  ChangeLast(): Poly_Triangle;
  /**
   * Constant value access.
   */
  Value(theIndex: number): Poly_Triangle;
  /**
   * Variable value access.
   */
  ChangeValue(theIndex: number): Poly_Triangle;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): Poly_Triangle;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): Poly_Triangle;
  /**
   * Set value.
   */
  SetValue(theIndex: number, theItem: Poly_Triangle): void;
  /**
   * Changes the lowest bound. Do not move data.
   */
  UpdateLowerBound(theLower: number): void;
  /**
   * Changes the upper bound. Do not move data.
   */
  UpdateUpperBound(theUpper: number): void;
  /**
   * Resizes the array to specified bounds. No re-allocation will be done if length of array does not change, but existing values will not be discarded if theToCopyData set to FALSE.
   * @param theLower new lower bound of array
   * @param theUpper new upper bound of array
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  /**
   * Resizes the array to theSize elements, keeping the lower bound unchanged.
   * @param theSize new number of elements
   * @param theToCopyData flag to copy existing data into new array
   */
  Resize(theSize: number, theToCopyData: boolean): void;
  IsDeletable(): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export declare class GeoSpecStepStreamReader {
  constructor();
  static readText(data: string, optionsJson: string): GeoSpecStepReadResult;
  static readFile(path: string, optionsJson: string): GeoSpecStepReadResult;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Template class for Handle-managed 1D arrays. Inherits from both NCollection_Array1<TheItemType> and {@link Standard_Transient | `Standard_Transient`}, providing reference-counted array functionality.
 */
export declare class NCollection_HArray1_gp_Pnt2d {
  /**
   * Default constructor.
   */
  constructor();
  /**
   * Copy constructor from array.
   * @param theOther the array to copy from
   */
  constructor(theOther: any);
  /**
   * Constructor with bounds.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   */
  constructor(theLower: number, theUpper: number);
  /**
   * Constructor with bounds and initial value.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theValue initial value for all elements
   */
  constructor(theLower: number, theUpper: number, theValue: unknown);
  /**
   * Constructor from C array.
   * @param theBegin reference to the first element of a C array
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theUseBuffer flag indicating whether to use external buffer (must be explicit)
   */
  constructor(theBegin: unknown, theLower: number, theUpper: number, theUseBuffer: boolean);
  /**
   * Returns const reference to the underlying array.
   */
  Array1(): any;
  /**
   * Returns mutable reference to the underlying array.
   */
  ChangeArray1(): any;
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Template class for Handle-managed 1D arrays. Inherits from both NCollection_Array1<TheItemType> and {@link Standard_Transient | `Standard_Transient`}, providing reference-counted array functionality.
 */
export declare class NCollection_HArray1_double {
  /**
   * Default constructor.
   */
  constructor();
  /**
   * Copy constructor from array.
   * @param theOther the array to copy from
   */
  constructor(theOther: any);
  /**
   * Constructor with bounds.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   */
  constructor(theLower: number, theUpper: number);
  /**
   * Constructor with bounds and initial value.
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theValue initial value for all elements
   */
  constructor(theLower: number, theUpper: number, theValue: number);
  /**
   * Constructor from C array.
   * @param theBegin reference to the first element of a C array
   * @param theLower lower bound of the array
   * @param theUpper upper bound of the array
   * @param theUseBuffer flag indicating whether to use external buffer (must be explicit)
   */
  constructor(theBegin: number, theLower: number, theUpper: number, theUseBuffer: boolean);
  /**
   * Returns const reference to the underlying array.
   */
  Array1(): any;
  /**
   * Returns mutable reference to the underlying array.
   */
  ChangeArray1(): any;
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Purpose: Simple list to link items together keeping the first and the last one. Inherits BaseList, adding the data item to each node.
 */
export declare class NCollection_List_BRepCheck_Status {
  /**
   * Empty constructor.
   */
  constructor();
  /**
   * Constructor.
   */
  constructor(theAllocator: unknown);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_List_BRepCheck_Status);
  /**
   * Initializer list constructor.
   * @param theInitList initializer list of elements to populate the list
   * @param theAllocator optional allocator for memory management
   */
  constructor(theInitList: unknown[], theAllocator?: unknown);
  // dropped: appendList param 0 resolves to excluded type NCollection_ListNode
  /**
   * Replace this list by the items of another list (theOther parameter). This method does not change the internal allocator.
   */
  Assign(theOther: NCollection_List_BRepCheck_Status): NCollection_List_BRepCheck_Status;
  /**
   * Clear this list.
   */
  Clear(theAllocator?: unknown): void;
  /**
   * First item.
   */
  First(): unknown;
  /**
   * Last item.
   */
  Last(): unknown;
  /**
   * Append one item at the end.
   */
  Append(theItem: unknown): unknown;
  /**
   * Append one item at the end.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Append(theOther: NCollection_List_BRepCheck_Status): void;
  /**
   * Prepend one item at the beginning.
   */
  Prepend(theItem: unknown): unknown;
  /**
   * Prepend one item at the beginning.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Prepend(theOther: NCollection_List_BRepCheck_Status): void;
  /**
   * RemoveFirst item.
   */
  RemoveFirst(): void;
  /**
   * Reverse the list.
   */
  Reverse(): void;
  /**
   * Exchange the content of two lists without re-allocations. Swaps all internal state including allocators, ensuring correct deallocation. Existing iterators remain valid but will point to the other list's elements.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Exchange(theOther: NCollection_List_BRepCheck_Status): void;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Purpose: Definition of a sequence of elements indexed by an Integer in range of 1..n
 */
export declare class NCollection_Sequence_TCollection_AsciiString {
  /**
   * Empty constructor.
   */
  constructor();
  /**
   * Constructor.
   */
  constructor(theAllocator: unknown);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_Sequence_TCollection_AsciiString);
  // dropped: delNode param 0 resolves to excluded type NCollection_SeqNode
  /**
   * Method for consistency with other collections.
   * @returns Lower bound (inclusive) for iteration.
   */
  static Lower(): number;
  /**
   * Method for consistency with other collections.
   * @returns Upper bound (inclusive) for iteration.
   */
  Upper(): number;
  /**
   * Empty query.
   */
  IsEmpty(): boolean;
  /**
   * Reverse sequence.
   */
  Reverse(): void;
  /**
   * Exchange two members.
   */
  Exchange(I: number, J: number): void;
  /**
   * Clear the items out, take a new allocator if non null.
   */
  Clear(theAllocator?: unknown): void;
  /**
   * Replace this sequence by the items of theOther. This method does not change the internal allocator.
   */
  Assign(theOther: NCollection_Sequence_TCollection_AsciiString): NCollection_Sequence_TCollection_AsciiString;
  /**
   * Remove one item.
   */
  Remove(theIndex: number): void;
  /**
   * Remove range of items.
   */
  Remove(theFromIndex: number, theToIndex: number): void;
  /**
   * Append one item.
   */
  Append(theItem: unknown): void;
  /**
   * Append one item.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  Append(theSeq: NCollection_Sequence_TCollection_AsciiString): void;
  /**
   * Prepend one item.
   */
  Prepend(theItem: unknown): void;
  /**
   * Prepend one item.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  Prepend(theSeq: NCollection_Sequence_TCollection_AsciiString): void;
  /**
   * InsertBefore theIndex theItem.
   */
  InsertBefore(theIndex: number, theItem: unknown): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;
  /**
   * InsertAfter the position of iterator.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;
  /**
   * InsertAfter the position of iterator.
   */
  InsertAfter(theIndex: number, theItem: unknown): void;
  /**
   * Split in two sequences.
   * @param theSeq Mutated in place; read the updated value from this argument after the call.
   */
  Split(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;
  /**
   * First item access.
   */
  First(): unknown;
  /**
   * First item access.
   */
  ChangeFirst(): unknown;
  /**
   * Last item access.
   */
  Last(): unknown;
  /**
   * Last item access.
   */
  ChangeLast(): unknown;
  /**
   * Constant item access by theIndex.
   */
  Value(theIndex: number): unknown;
  /**
   * Variable item access by theIndex.
   */
  ChangeValue(theIndex: number): unknown;
  /**
   * Set item value by theIndex.
   */
  SetValue(theIndex: number, theItem: unknown): void;
  /**
   * 0-based checked access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  At(theIndex: number): unknown;
  /**
   * 0-based checked mutable access independent of `Lower()`/Upper().
   * @param theIndex 0-based index in [0, `Size()`-1]
   */
  ChangeAt(theIndex: number): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Purpose: Simple list to link items together keeping the first and the last one. Inherits BaseList, adding the data item to each node.
 */
export declare class NCollection_List_handle_Poly_Triangulation {
  /**
   * Empty constructor.
   */
  constructor();
  /**
   * Constructor.
   */
  constructor(theAllocator: unknown);
  /**
   * Copy constructor.
   */
  constructor(theOther: NCollection_List_handle_Poly_Triangulation);
  /**
   * Initializer list constructor.
   * @param theInitList initializer list of elements to populate the list
   * @param theAllocator optional allocator for memory management
   */
  constructor(theInitList: Poly_Triangulation[], theAllocator?: unknown);
  // dropped: appendList param 0 resolves to excluded type NCollection_ListNode
  /**
   * Replace this list by the items of another list (theOther parameter). This method does not change the internal allocator.
   */
  Assign(theOther: NCollection_List_handle_Poly_Triangulation): NCollection_List_handle_Poly_Triangulation;
  /**
   * Clear this list.
   */
  Clear(theAllocator?: unknown): void;
  /**
   * First item.
   */
  First(): Poly_Triangulation;
  /**
   * Last item.
   */
  Last(): Poly_Triangulation;
  /**
   * Append one item at the end.
   */
  Append(theItem: Poly_Triangulation): Poly_Triangulation;
  /**
   * Append one item at the end.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Append(theOther: NCollection_List_handle_Poly_Triangulation): void;
  /**
   * Prepend one item at the beginning.
   */
  Prepend(theItem: Poly_Triangulation): Poly_Triangulation;
  /**
   * Prepend one item at the beginning.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Prepend(theOther: NCollection_List_handle_Poly_Triangulation): void;
  /**
   * RemoveFirst item.
   */
  RemoveFirst(): void;
  /**
   * Reverse the list.
   */
  Reverse(): void;
  /**
   * Exchange the content of two lists without re-allocations. Swaps all internal state including allocators, ensuring correct deallocation. Existing iterators remain valid but will point to the other list's elements.
   * @param theOther Mutated in place; read the updated value from this argument after the call.
   */
  Exchange(theOther: NCollection_List_handle_Poly_Triangulation): void;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * A Location is a composite transition. It comprises a series of elementary reference coordinates, i.e. objects of type {@link TopLoc_Datum3D | `TopLoc_Datum3D`}, and the powers to which these objects are raised.
 */
export declare class TopLoc_Location {
  /**
   * Constructs an empty local coordinate system object. Note: A Location constructed from a default datum is said to be "empty".
   */
  constructor();
  /**
   * Copy constructor.
   */
  constructor(theOther: TopLoc_Location);
  /**
   * Move constructor.
   */
  constructor(T: unknown);
  /**
   * Constructs the local coordinate system object defined by the transformation T. T invokes in turn, a {@link TopLoc_Datum3D | `TopLoc_Datum3D`} object.
   */
  constructor(D: unknown);
  /**
   * Returns true if this location is equal to the Identity transformation.
   */
  IsIdentity(): boolean;
  /**
   * Resets this location to the Identity transformation.
   */
  Identity(): void;
  /**
   * Returns the first elementary datum of the Location. Use the NextLocation function recursively to access the other data comprising this location. Exceptions Standard_NoSuchObject if this location is empty.
   */
  FirstDatum(): unknown;
  /**
   * Returns the power elevation of the first elementary datum. Exceptions Standard_NoSuchObject if this location is empty.
   */
  FirstPower(): number;
  /**
   * Returns a Location representing <me> without the first datum. We have the relation:
   *
   * <me> = `NextLocation()` * `FirstDatum()` ^ `FirstPower()` Exceptions Standard_NoSuchObject if this location is empty.
   */
  NextLocation(): TopLoc_Location;
  /**
   * Returns the transformation associated to the coordinate system.
   */
  Transformation(): unknown;
  /**
   * Returns the inverse of <me>.
   *
   * <me> * `Inverted()` is an Identity.
   */
  Inverted(): TopLoc_Location;
  /**
   * Returns <me> * <Other>, the elementary datums are concatenated.
   */
  Multiplied(Other: TopLoc_Location): TopLoc_Location;
  /**
   * Returns <me> / <Other>.
   */
  Divided(Other: TopLoc_Location): TopLoc_Location;
  /**
   * Returns <Other>.`Inverted()` * <me>.
   */
  Predivided(Other: TopLoc_Location): TopLoc_Location;
  /**
   * Returns me at the power <pwr>. If <pwr> is zero returns Identity. <pwr> can be lower than zero (usual meaning for powers).
   */
  Powered(pwr: number): TopLoc_Location;
  /**
   * Returns a hashed value for this local coordinate system. This value is used, with map tables, to store and retrieve the object easily.
   * @returns a computed hash code
   */
  HashCode(): number;
  /**
   * Returns true if this location and the location Other have the same elementary data, i.e. contain the same series of {@link TopLoc_Datum3D | `TopLoc_Datum3D`} and respective powers. This method is an alias for operator ==.
   */
  IsEqual(theOther: TopLoc_Location): boolean;
  /**
   * Returns true if this location and the location Other do not have the same elementary data, i.e. do not contain the same series of {@link TopLoc_Datum3D | `TopLoc_Datum3D`} and respective powers. This method is an alias for operator !=.
   */
  IsDifferent(theOther: TopLoc_Location): boolean;
  /**
   * Clear myItems.
   */
  Clear(): void;
  static ScalePrec(): number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export type GeomAbs_SurfaceType = (typeof GeomAbs_SurfaceType)[keyof typeof GeomAbs_SurfaceType];
export declare const GeomAbs_SurfaceType: {
  readonly GeomAbs_Plane: 'GeomAbs_Plane';
  readonly GeomAbs_Cylinder: 'GeomAbs_Cylinder';
  readonly GeomAbs_Cone: 'GeomAbs_Cone';
  readonly GeomAbs_Sphere: 'GeomAbs_Sphere';
  readonly GeomAbs_Torus: 'GeomAbs_Torus';
  readonly GeomAbs_BezierSurface: 'GeomAbs_BezierSurface';
  readonly GeomAbs_BSplineSurface: 'GeomAbs_BSplineSurface';
  readonly GeomAbs_SurfaceOfRevolution: 'GeomAbs_SurfaceOfRevolution';
  readonly GeomAbs_SurfaceOfExtrusion: 'GeomAbs_SurfaceOfExtrusion';
  readonly GeomAbs_OffsetSurface: 'GeomAbs_OffsetSurface';
  readonly GeomAbs_OtherSurface: 'GeomAbs_OtherSurface';
};

/**
 * Provides a triangulation for a surface, a set of surfaces, or more generally a shape.
 *
 * A triangulation consists of an approximate representation of the actual shape, using a collection of points and triangles. The points are located on the surface. The edges of the triangles connect adjacent points with a straight line that approximates the true curve on the surface.
 *
 * A triangulation comprises:
 *
 * - A table of 3D nodes (3D points on the surface).
 * - A table of triangles. Each triangle ({@link Poly_Triangle | `Poly_Triangle`} object) comprises a triplet of indices in the table of 3D nodes specific to the triangulation.
 * - An optional table of 2D nodes (2D points), parallel to the table of 3D nodes. 2D point are the (u, v) parameters of the corresponding 3D point on the surface approximated by the triangulation.
 * - An optional table of 3D vectors, parallel to the table of 3D nodes, defining normals to the surface at specified 3D point.
 * - An optional deflection, which maximizes the distance from a point on the surface to the corresponding point on its approximate triangulation.
 *
 * In many cases, algorithms do not need to work with the exact representation of a surface. A triangular representation induces simpler and more robust adjusting, faster performances, and the results are as good.
 */
export declare class Poly_Triangulation {
  /**
   * Constructs an empty triangulation.
   */
  constructor();
  /**
   * Copy constructor for triangulation.
   */
  constructor(theTriangulation: Poly_Triangulation);
  /**
   * Constructs a triangulation from a set of triangles. The triangulation is initialized with 3D points from Nodes and triangles from Triangles.
   */
  constructor(Nodes: NCollection_Array1_gp_Pnt, Triangles: NCollection_Array1_Poly_Triangle);
  /**
   * Constructs a triangulation from a set of triangles. The triangulation is initialized with 3D points from Nodes, 2D points from UVNodes and triangles from Triangles, where coordinates of a 2D point from UVNodes are the (u, v) parameters of the corresponding 3D point from Nodes on the surface approximated by the constructed triangulation.
   */
  constructor(
    Nodes: NCollection_Array1_gp_Pnt,
    UVNodes: NCollection_Array1_gp_Pnt2d,
    Triangles: NCollection_Array1_Poly_Triangle,
  );
  /**
   * Constructs a triangulation from a set of triangles. The triangulation is initialized without a triangle or a node, but capable of containing specified number of nodes and triangles.
   * @param theNbNodes number of nodes to allocate
   * @param theNbTriangles number of triangles to allocate
   * @param theHasUVNodes indicates whether 2D nodes will be associated with 3D ones, (i.e. to enable a 2D representation)
   * @param theHasNormals indicates whether normals will be given and associated with nodes
   */
  constructor(theNbNodes: number, theNbTriangles: number, theHasUVNodes: boolean, theHasNormals?: boolean);
  // dropped: LoadDeferredData param 0 resolves to excluded type OSD_FileSystem
  // dropped: DetachedLoadDeferredData param 0 resolves to excluded type OSD_FileSystem
  // dropped: loadDeferredData param 0 resolves to excluded type OSD_FileSystem
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /**
   * Creates full copy of current triangulation.
   */
  Copy(): Poly_Triangulation;
  /**
   * Returns the deflection of this triangulation.
   */
  Deflection(): number;
  /**
   * Sets the deflection of this triangulation to theDeflection. See more on deflection in Polygon2D.
   */
  Deflection(theDeflection: number): void;
  /**
   * Returns initial set of parameters used to generate this triangulation.
   */
  Parameters(): unknown;
  /**
   * Updates initial set of parameters used to generate this triangulation.
   */
  Parameters(theParams: unknown): void;
  /**
   * Clears internal arrays of nodes and all attributes.
   */
  Clear(): void;
  /**
   * Returns TRUE if triangulation has some geometry.
   */
  HasGeometry(): boolean;
  /**
   * Returns the number of nodes for this triangulation.
   */
  NbNodes(): number;
  /**
   * Returns the number of triangles for this triangulation.
   */
  NbTriangles(): number;
  /**
   * Returns true if 2D nodes are associated with 3D nodes for this triangulation.
   */
  HasUVNodes(): boolean;
  /**
   * Returns true if nodal normals are defined.
   */
  HasNormals(): boolean;
  /**
   * Returns a node at the given index.
   * @param theIndex node index within [1, `NbNodes()`] range
   * @returns 3D point coordinates
   */
  Node(theIndex: number): gp_Pnt;
  /**
   * Sets a node coordinates.
   * @param theIndex node index within [1, `NbNodes()`] range
   * @param thePnt 3D point coordinates
   */
  SetNode(theIndex: number, thePnt: gp_Pnt): void;
  /**
   * Returns UV-node at the given index.
   * @param theIndex node index within [1, `NbNodes()`] range
   * @returns 2D point defining UV coordinates
   */
  UVNode(theIndex: number): unknown;
  /**
   * Sets an UV-node coordinates.
   * @param theIndex node index within [1, `NbNodes()`] range
   * @param thePnt UV coordinates
   */
  SetUVNode(theIndex: number, thePnt: unknown): void;
  /**
   * Returns triangle at the given index.
   * @param theIndex triangle index within [1, `NbTriangles()`] range
   * @returns triangle node indices, with each node defined within [1, `NbNodes()`] range
   */
  Triangle(theIndex: number): Poly_Triangle;
  /**
   * Sets a triangle.
   * @param theIndex triangle index within [1, `NbTriangles()`] range
   * @param theTriangle triangle node indices, with each node defined within [1, `NbNodes()`] range
   */
  SetTriangle(theIndex: number, theTriangle: Poly_Triangle): void;
  /**
   * Returns normal at the given index.
   * @param theIndex node index within [1, `NbNodes()`] range
   * @returns normalized 3D vector defining a surface normal
   */
  Normal(theIndex: number): gp_Dir;
  /**
   * Changes normal at the given index.
   * @param theIndex node index within [1, `NbNodes()`] range
   * @param theNormal normalized 3D vector defining a surface normal
   */
  SetNormal(theIndex: number, theNormal: gp_Dir): void;
  /**
   * Returns mesh purpose bits.
   */
  MeshPurpose(): number;
  /**
   * Sets mesh purpose bits.
   */
  SetMeshPurpose(thePurpose: number): void;
  /**
   * Returns cached min - max range of triangulation data, which is VOID by default (e.g, no cached information).
   */
  CachedMinMax(): unknown;
  /**
   * Sets a cached min - max range of this triangulation. The bounding box should exactly match actual range of triangulation data without a gap or transformation, or otherwise undefined behavior will be observed. Passing a VOID range invalidates the cache.
   */
  SetCachedMinMax(theBox: unknown): void;
  /**
   * Returns TRUE if there is some cached min - max range of this triangulation.
   */
  HasCachedMinMax(): boolean;
  /**
   * Updates cached min - max range of this triangulation with bounding box of nodal data.
   */
  UpdateCachedMinMax(): void;
  /**
   * Extends the passed box with bounding box of this triangulation. Uses cached min - max range when available and:
   *
   * - input transformation theTrsf has no rotation part;
   * - theIsAccurate is set to FALSE;
   * - no triangulation data available (e.g. it is deferred and not loaded).
   * @param theBox Mutated in place; read the updated value from this argument after the call.
   */
  MinMax(theBox: unknown, theTrsf: unknown, theIsAccurate: boolean): boolean;
  /**
   * Returns TRUE if node positions are defined with double precision; TRUE by default.
   */
  IsDoublePrecision(): boolean;
  /**
   * Set if node positions should be defined with double or single precision for 3D and UV nodes. Raises exception if data was already allocated.
   */
  SetDoublePrecision(theIsDouble: boolean): void;
  /**
   * Method resizing internal arrays of nodes (synchronously for all attributes).
   * @param theNbNodes new number of nodes
   * @param theToCopyOld copy old nodes into the new array
   */
  ResizeNodes(theNbNodes: number, theToCopyOld: boolean): void;
  /**
   * Method resizing an internal array of triangles.
   * @param theNbTriangles new number of triangles
   * @param theToCopyOld copy old triangles into the new array
   */
  ResizeTriangles(theNbTriangles: number, theToCopyOld: boolean): void;
  /**
   * If an array for UV coordinates is not allocated yet, do it now.
   */
  AddUVNodes(): void;
  /**
   * Deallocates the UV nodes array.
   */
  RemoveUVNodes(): void;
  /**
   * If an array for normals is not allocated yet, do it now.
   */
  AddNormals(): void;
  /**
   * Deallocates the normals array.
   */
  RemoveNormals(): void;
  /**
   * Compute smooth normals by averaging triangle normals.
   */
  ComputeNormals(): void;
  /**
   * Returns the table of 3D points for read-only access or NULL if nodes array is undefined. `Poly_Triangulation::Node()` should be used instead when possible. Returned object should not be used after {@link Poly_Triangulation | `Poly_Triangulation`} destruction.
   */
  MapNodeArray(): NCollection_HArray1_gp_Pnt;
  /**
   * Returns the triangle array for read-only access or NULL if triangle array is undefined. `Poly_Triangulation::Triangle()` should be used instead when possible. Returned object should not be used after {@link Poly_Triangulation | `Poly_Triangulation`} destruction.
   */
  MapTriangleArray(): NCollection_HArray1_Poly_Triangle;
  /**
   * Returns the table of 2D nodes for read-only access or NULL if UV nodes array is undefined. `Poly_Triangulation::UVNode()` should be used instead when possible. Returned object should not be used after {@link Poly_Triangulation | `Poly_Triangulation`} destruction.
   */
  MapUVNodeArray(): NCollection_HArray1_gp_Pnt2d;
  /**
   * Returns the table of per-vertex normals for read-only access or NULL if normals array is undefined. `Poly_Triangulation::Normal()` should be used instead when possible. Returned object should not be used after {@link Poly_Triangulation | `Poly_Triangulation`} destruction.
   */
  MapNormalArray(): NCollection_HArray1_float;
  /**
   * Returns an internal array of triangles. `Triangle()`/SetTriangle() should be used instead in portable code.
   */
  InternalTriangles(): NCollection_Array1_Poly_Triangle;
  /**
   * Returns an internal array of nodes. `Node()`/SetNode() should be used instead in portable code.
   */
  InternalNodes(): unknown;
  /**
   * Returns an internal array of UV nodes. UBNode()/SetUVNode() should be used instead in portable code.
   */
  InternalUVNodes(): unknown;
  /**
   * Return an internal array of normals. `Normal()`/SetNormal() should be used instead in portable code.
   */
  InternalNormals(): NCollection_Array1_NCollection_Vec3_float;
  /**
   * @deprecated
   */
  SetNormals(theNormals: NCollection_HArray1_float): void;
  /**
   * @deprecated
   */
  Triangles(): NCollection_Array1_Poly_Triangle;
  /**
   * @deprecated
   */
  ChangeTriangles(): NCollection_Array1_Poly_Triangle;
  /**
   * @deprecated
   */
  ChangeTriangle(theIndex: number): Poly_Triangle;
  NbDeferredNodes(): number;
  NbDeferredTriangles(): number;
  HasDeferredData(): boolean;
  UnloadDeferredData(): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes a component triangle of a triangulation ({@link Poly_Triangulation | `Poly_Triangulation`} object). A Triangle is defined by a triplet of nodes within [1, `Poly_Triangulation::NbNodes()`] range. Each node is an index in the table of nodes specific to an existing triangulation of a shape, and represents a point on the surface.
 */
export declare class Poly_Triangle {
  /**
   * Constructs a triangle and sets all indices to zero.
   */
  constructor();
  /**
   * Constructs a triangle and sets its three indices, where these node values are indices in the table of nodes specific to an existing triangulation of a shape.
   */
  constructor(theN1: number, theN2: number, theN3: number);
  /**
   * Sets the value of the three nodes of this triangle.
   */
  Set(theN1: number, theN2: number, theN3: number): void;
  /**
   * Sets the value of node with specified index of this triangle. Raises Standard_OutOfRange if index is not in 1,2,3.
   */
  Set(theIndex: number, theNode: number): void;
  /**
   * Returns the node indices of this triangle.
   * @returns A result object with fields:
   * - `theN1`: updated value from the call.
   * - `theN2`: updated value from the call.
   * - `theN3`: updated value from the call.
   */
  Get(theN1: number, theN2: number, theN3: number): { theN1: number; theN2: number; theN3: number };
  /**
   * Get the node of given Index. Raises OutOfRange from {@link Standard | `Standard`} if Index is not in 1,2,3.
   */
  Value(theIndex: number): number;
  /**
   * Get the node of given Index. Raises OutOfRange if Index is not in 1,2,3.
   */
  ChangeValue(theIndex: number): number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Defines a non-persistent vector in 3D space.
 */
export declare class gp_Vec {
  /**
   * Creates a zero vector.
   */
  constructor();
  /**
   * Creates a unitary vector from a direction theV.
   */
  constructor(theV: gp_Dir);
  /**
   * Creates a vector with a triplet of coordinates.
   */
  constructor(theCoord: gp_XYZ);
  /**
   * Creates a vector from two points. The length of the vector is the distance between theP1 and theP2.
   */
  constructor(theP1: gp_Pnt, theP2: gp_Pnt);
  /**
   * Creates a point with its three cartesian coordinates.
   */
  constructor(theXv: number, theYv: number, theZv: number);
  /**
   * Changes the coordinate of range theIndex theIndex = 1 => X is modified theIndex = 2 => Y is modified theIndex = 3 => Z is modified Raised if theIndex != {1, 2, 3}.
   */
  SetCoord(theIndex: number, theXi: number): void;
  /**
   * For this vector, assigns.
   *
   * - the values theXv, theYv and theZv to its three coordinates.
   */
  SetCoord(theXv: number, theYv: number, theZv: number): void;
  /**
   * Assigns the given value to the X coordinate of this vector.
   */
  SetX(theX: number): void;
  /**
   * Assigns the given value to the X coordinate of this vector.
   */
  SetY(theY: number): void;
  /**
   * Assigns the given value to the X coordinate of this vector.
   */
  SetZ(theZ: number): void;
  /**
   * Assigns the three coordinates of theCoord to this vector.
   */
  SetXYZ(theCoord: gp_XYZ): void;
  /**
   * Returns the coordinate of range theIndex : theIndex = 1 => X is returned theIndex = 2 => Y is returned theIndex = 3 => Z is returned Raised if theIndex != {1, 2, 3}.
   */
  Coord(theIndex: number): number;
  /**
   * For this vector returns its three coordinates theXv, theYv, and theZv inline.
   * @returns A result object with fields:
   * - `theXv`: updated value from the call.
   * - `theYv`: updated value from the call.
   * - `theZv`: updated value from the call.
   */
  Coord(theXv: number, theYv: number, theZv: number): { theXv: number; theYv: number; theZv: number };
  /**
   * For this vector, returns its X coordinate.
   */
  X(): number;
  /**
   * For this vector, returns its Y coordinate.
   */
  Y(): number;
  /**
   * For this vector, returns its Z coordinate.
   */
  Z(): number;
  /**
   * For this vector, returns.
   *
   * - its three coordinates as a number triple
   */
  XYZ(): gp_XYZ;
  /**
   * Returns True if the two vectors have the same magnitude value and the same direction. The precision values are theLinearTolerance for the magnitude and theAngularTolerance for the direction.
   */
  IsEqual(theOther: gp_Vec, theLinearTolerance: number, theAngularTolerance: number): boolean;
  /**
   * Returns True if abs(<me>.Angle(theOther) - PI/2.) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.`Magnitude()` <= Resolution or theOther.Magnitude() <= Resolution from gp.
   */
  IsNormal(theOther: gp_Vec, theAngularTolerance: number): boolean;
  /**
   * Returns True if PI - <me>.Angle(theOther) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.`Magnitude()` <= Resolution or Other.Magnitude() <= Resolution from gp.
   */
  IsOpposite(theOther: gp_Vec, theAngularTolerance: number): boolean;
  /**
   * Returns True if Angle(<me>, theOther) <= theAngularTolerance or PI - Angle(<me>, theOther) <= theAngularTolerance This definition means that two parallel vectors cannot define a plane but two vectors with opposite directions are considered as parallel. Raises VectorWithNullMagnitude if <me>.`Magnitude()` <= Resolution or Other.Magnitude() <= Resolution from gp.
   */
  IsParallel(theOther: gp_Vec, theAngularTolerance: number): boolean;
  /**
   * Computes the angular value between <me> and <theOther> Returns the angle value between 0 and PI in radian. Raises VectorWithNullMagnitude if <me>.`Magnitude()` <= Resolution from gp or theOther.Magnitude() <= Resolution because the angular value is indefinite if one of the vectors has a null magnitude.
   */
  Angle(theOther: gp_Vec): number;
  /**
   * Computes the angle, in radians, between this vector and vector theOther. The result is a value between -Pi and Pi.
   * For this, theVRef defines the positive sense of rotation: the angular value is positive, if the cross product this ^ theOther has the same orientation as theVRef relative to the plane defined by the vectors this and theOther. Otherwise, the angular value is negative.
   * Exceptions gp_VectorWithNullMagnitude if the magnitude of this vector, the vector theOther, or the vector theVRef is less than or equal to `gp::Resolution()`.
   * Standard_DomainError if this vector, the vector theOther, and the vector theVRef are coplanar, unless this vector and the vector theOther are parallel.
   */
  AngleWithRef(theOther: gp_Vec, theVRef: gp_Vec): number;
  /**
   * Computes the magnitude of this vector.
   */
  Magnitude(): number;
  /**
   * Computes the square magnitude of this vector.
   */
  SquareMagnitude(): number;
  /**
   * Adds two vectors.
   */
  Add(theOther: gp_Vec): void;
  /**
   * Adds two vectors.
   */
  Added(theOther: gp_Vec): gp_Vec;
  /**
   * Subtracts two vectors.
   */
  Subtract(theRight: gp_Vec): void;
  /**
   * Subtracts two vectors.
   */
  Subtracted(theRight: gp_Vec): gp_Vec;
  /**
   * Multiplies a vector by a scalar.
   */
  Multiply(theScalar: number): void;
  /**
   * Multiplies a vector by a scalar.
   */
  Multiplied(theScalar: number): gp_Vec;
  /**
   * Divides a vector by a scalar.
   */
  Divide(theScalar: number): void;
  /**
   * Divides a vector by a scalar.
   */
  Divided(theScalar: number): gp_Vec;
  /**
   * computes the cross product between two vectors
   */
  Cross(theRight: gp_Vec): void;
  /**
   * computes the cross product between two vectors
   */
  Crossed(theRight: gp_Vec): gp_Vec;
  /**
   * Computes the magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||.
   */
  CrossMagnitude(theRight: gp_Vec): number;
  /**
   * Computes the square magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||**2.
   */
  CrossSquareMagnitude(theRight: gp_Vec): number;
  /**
   * Computes the triple vector product. <me> ^= (theV1 ^ theV2)
   */
  CrossCross(theV1: gp_Vec, theV2: gp_Vec): void;
  /**
   * Computes the triple vector product. <me> ^ (theV1 ^ theV2)
   */
  CrossCrossed(theV1: gp_Vec, theV2: gp_Vec): gp_Vec;
  /**
   * computes the scalar product
   */
  Dot(theOther: gp_Vec): number;
  /**
   * Computes the triple scalar product <me> * (theV1 ^ theV2).
   */
  DotCross(theV1: gp_Vec, theV2: gp_Vec): number;
  /**
   * normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from gp.
   */
  Normalize(): void;
  /**
   * normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from gp.
   */
  Normalized(): gp_Vec;
  /**
   * Reverses the direction of a vector.
   */
  Reverse(): void;
  /**
   * Reverses the direction of a vector.
   */
  Reversed(): gp_Vec;
  /**
   * <me> is set to the following linear form : theA1 * theV1 + theA2 * theV2 + theA3 * theV3 + theV4
   */
  SetLinearForm(
    theA1: number,
    theV1: gp_Vec,
    theA2: number,
    theV2: gp_Vec,
    theA3: number,
    theV3: gp_Vec,
    theV4: gp_Vec,
  ): void;
  /**
   * <me> is set to the following linear form : theA1 * theV1 + theA2 * theV2 + theA3 * theV3
   */
  SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
  /**
   * <me> is set to the following linear form : theA1 * theV1 + theA2 * theV2 + theV3
   */
  SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
  /**
   * <me> is set to the following linear form : theA1 * theV1 + theA2 * theV2
   */
  SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
  /**
   * <me> is set to the following linear form : theA1 * theV1 + theV2
   */
  SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
  /**
   * <me> is set to the following linear form : theV1 + theV2
   */
  SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
  Mirror(theV: gp_Vec): void;
  Mirror(theA1: unknown): void;
  Mirror(theA2: unknown): void;
  /**
   * Performs the symmetrical transformation of a vector with respect to the vector theV which is the center of the symmetry.
   */
  Mirrored(theV: gp_Vec): gp_Vec;
  /**
   * Performs the symmetrical transformation of a vector with respect to an axis placement which is the axis of the symmetry.
   */
  Mirrored(theA1: unknown): gp_Vec;
  /**
   * Performs the symmetrical transformation of a vector with respect to a plane. The axis placement theA2 locates the plane of the symmetry : (Location, XDirection, YDirection).
   */
  Mirrored(theA2: unknown): gp_Vec;
  Rotate(theA1: unknown, theAng: number): void;
  /**
   * Rotates a vector. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
   */
  Rotated(theA1: unknown, theAng: number): gp_Vec;
  Scale(theS: number): void;
  /**
   * Scales a vector. theS is the scaling value.
   */
  Scaled(theS: number): gp_Vec;
  /**
   * Transforms a vector with the transformation theT.
   */
  Transform(theT: unknown): void;
  /**
   * Transforms a vector with the transformation theT.
   */
  Transformed(theT: unknown): gp_Vec;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes an infinite cylindrical surface. A cylinder is defined by its radius and positioned in space with a coordinate system (a {@link gp_Ax3 | `gp_Ax3`} object), the "main Axis" of which is the axis of the cylinder. This coordinate system is the "local coordinate system" of the cylinder. Note: when a {@link gp_Cylinder | `gp_Cylinder`} cylinder is converted into a {@link Geom_CylindricalSurface | `Geom_CylindricalSurface`} cylinder, some implicit properties of its local coordinate system are used explicitly:
 *
 * - its origin, "X Direction", "Y Direction" and "main Direction" are used directly to define the parametric directions on the cylinder and the origin of the parameters,
 * - its implicit orientation (right-handed or left-handed) gives an orientation (direct or indirect) to the {@link Geom_CylindricalSurface | `Geom_CylindricalSurface`} cylinder. See Also {@link gce_MakeCylinder | `gce_MakeCylinder`} which provides functions for more complex cylinder constructions {@link Geom_CylindricalSurface | `Geom_CylindricalSurface`} which provides additional functions for constructing cylinders and works, in particular, with the parametric equations of cylinders {@link gp_Ax3 | `gp_Ax3`}
 */
export declare class gp_Cylinder {
  /**
   * Creates a indefinite cylinder.
   */
  constructor();
  /**
   * Creates a cylinder of radius Radius, whose axis is the "main Axis" of theA3. theA3 is the local coordinate system of the cylinder. Raises ConstructionErrord if theRadius < 0.0.
   */
  constructor(theA3: unknown, theRadius: number);
  /**
   * Changes the symmetry axis of the cylinder. Raises ConstructionError if the direction of theA1 is parallel to the "XDirection" of the coordinate system of the cylinder.
   */
  SetAxis(theA1: unknown): void;
  /**
   * Changes the location of the surface.
   */
  SetLocation(theLoc: gp_Pnt): void;
  /**
   * Change the local coordinate system of the surface.
   */
  SetPosition(theA3: unknown): void;
  /**
   * Modifies the radius of this cylinder. Exceptions Standard_ConstructionError if theR is negative.
   */
  SetRadius(theR: number): void;
  /**
   * Reverses the U parametrization of the cylinder reversing the YAxis.
   */
  UReverse(): void;
  /**
   * Reverses the V parametrization of the plane reversing the Axis.
   */
  VReverse(): void;
  /**
   * Returns true if the local coordinate system of this cylinder is right-handed.
   */
  Direct(): boolean;
  /**
   * Returns the symmetry axis of the cylinder.
   */
  Axis(): unknown;
  /**
   * Computes the coefficients of the implicit equation of the quadric in the absolute cartesian coordinate system : theA1.X**2 + theA2.Y**2 + theA3.Z**2 + 2.(theB1.X.Y + theB2.X.Z + theB3.Y.Z) + 2.(theC1.X + theC2.Y + theC3.Z) + theD = 0.0.
   * @returns A result object with fields:
   * - `theA1`: updated value from the call.
   * - `theA2`: updated value from the call.
   * - `theA3`: updated value from the call.
   * - `theB1`: updated value from the call.
   * - `theB2`: updated value from the call.
   * - `theB3`: updated value from the call.
   * - `theC1`: updated value from the call.
   * - `theC2`: updated value from the call.
   * - `theC3`: updated value from the call.
   * - `theD`: updated value from the call.
   */
  Coefficients(
    theA1: number,
    theA2: number,
    theA3: number,
    theB1: number,
    theB2: number,
    theB3: number,
    theC1: number,
    theC2: number,
    theC3: number,
    theD: number,
  ): {
    theA1: number;
    theA2: number;
    theA3: number;
    theB1: number;
    theB2: number;
    theB3: number;
    theC1: number;
    theC2: number;
    theC3: number;
    theD: number;
  };
  /**
   * Returns the "Location" point of the cylinder.
   */
  Location(): gp_Pnt;
  /**
   * Returns the local coordinate system of the cylinder.
   */
  Position(): unknown;
  /**
   * Returns the radius of the cylinder.
   */
  Radius(): number;
  /**
   * Returns the axis X of the cylinder.
   */
  XAxis(): unknown;
  /**
   * Returns the axis Y of the cylinder.
   */
  YAxis(): unknown;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: unknown): void;
  Mirror(theA2: unknown): void;
  /**
   * Performs the symmetrical transformation of a cylinder with respect to the point theP which is the center of the symmetry.
   */
  Mirrored(theP: gp_Pnt): gp_Cylinder;
  /**
   * Performs the symmetrical transformation of a cylinder with respect to an axis placement which is the axis of the symmetry.
   */
  Mirrored(theA1: unknown): gp_Cylinder;
  /**
   * Performs the symmetrical transformation of a cylinder with respect to a plane. The axis placement theA2 locates the plane of the of the symmetry : (Location, XDirection, YDirection).
   */
  Mirrored(theA2: unknown): gp_Cylinder;
  Rotate(theA1: unknown, theAng: number): void;
  /**
   * Rotates a cylinder. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
   */
  Rotated(theA1: unknown, theAng: number): gp_Cylinder;
  Scale(theP: gp_Pnt, theS: number): void;
  /**
   * Scales a cylinder. theS is the scaling value. The absolute value of theS is used to scale the cylinder.
   */
  Scaled(theP: gp_Pnt, theS: number): gp_Cylinder;
  Transform(theT: unknown): void;
  /**
   * Transforms a cylinder with the transformation theT from class Trsf.
   */
  Transformed(theT: unknown): gp_Cylinder;
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
  /**
   * Translates a cylinder in the direction of the vector theV. The magnitude of the translation is the vector's magnitude.
   */
  Translated(theV: gp_Vec): gp_Cylinder;
  /**
   * Translates a cylinder from the point theP1 to the point theP2.
   */
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cylinder;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes a unit vector in 3D space. This unit vector is also called "Direction". See Also {@link gce_MakeDir | `gce_MakeDir`} which provides functions for more complex unit vector constructions {@link Geom_Direction | `Geom_Direction`} which provides additional functions for constructing unit vectors and works, in particular, with the parametric equations of unit vectors.
 */
export declare class gp_Dir {
  /**
   * Creates a direction corresponding to X axis.
   */
  constructor();
  /**
   * Creates a direction from a standard direction enumeration.
   */
  constructor(theDir: gp_Dir_D);
  /**
   * Normalizes the vector theV and creates a direction. Raises ConstructionError if theV.Magnitude() <= Resolution.
   * @remarks **Note:** Constexpr-compatible when input is already normalized.
   */
  constructor(theV: gp_Vec);
  /**
   * Creates a direction from a triplet of coordinates. Raises ConstructionError if theCoord.Modulus() <= Resolution from gp.
   * @remarks **Note:** Constexpr-compatible when input is already normalized.
   */
  constructor(theCoord: gp_XYZ);
  constructor(a0: gp_Dir);
  /**
   * Creates a direction with its 3 cartesian coordinates. Raises ConstructionError if std::sqrt(theXv*theXv + theYv*theYv + theZv*theZv) <= Resolution Modification of the direction's coordinates If std::sqrt (theXv*theXv + theYv*theYv + theZv*theZv) <= Resolution from gp where theXv, theYv ,theZv are the new coordinates it is not possible to construct the direction and the method raises the exception ConstructionError.
   * @remarks **Note:** Constexpr-compatible when input is already normalized.
   */
  constructor(theXv: number, theYv: number, theZv: number);
  /**
   * For this unit vector, assigns the value Xi to:
   *
   * - the X coordinate if theIndex is 1, or
   * - the Y coordinate if theIndex is 2, or
   * - the Z coordinate if theIndex is 3, and then normalizes it. Warning: Remember that all the coordinates of a unit vector are implicitly modified when any single one is changed directly. Exceptions Standard_OutOfRange if theIndex is not 1, 2, or 3. Standard_ConstructionError if either of the following is less than or equal to `gp::Resolution()`:
   * - std::sqrt(Xv*Xv + Yv*Yv + Zv*Zv), or
   * - the modulus of the number triple formed by the new value theXi and the two other coordinates of this vector that were not directly modified.
   * @remarks **Note:** Constexpr-compatible when result is already normalized.
   */
  SetCoord(theIndex: number, theXi: number): void;
  /**
   * For this unit vector, assigns the values theXv, theYv and theZv to its three coordinates. Remember that all the coordinates of a unit vector are implicitly modified when any single one is changed directly.
   * @remarks **Note:** Constexpr-compatible when input is already normalized.
   */
  SetCoord(theXv: number, theYv: number, theZv: number): void;
  /**
   * Assigns the given value to the X coordinate of this unit vector.
   * @remarks **Note:** Constexpr-compatible when result is already normalized.
   */
  SetX(theX: number): void;
  /**
   * Assigns the given value to the Y coordinate of this unit vector.
   * @remarks **Note:** Constexpr-compatible when result is already normalized.
   */
  SetY(theY: number): void;
  /**
   * Assigns the given value to the Z coordinate of this unit vector.
   * @remarks **Note:** Constexpr-compatible when result is already normalized.
   */
  SetZ(theZ: number): void;
  /**
   * Assigns the three coordinates of theCoord to this unit vector.
   * @remarks **Note:** Constexpr-compatible when input is already normalized.
   */
  SetXYZ(theCoord: gp_XYZ): void;
  /**
   * Returns the coordinate of range theIndex : theIndex = 1 => X is returned theIndex = 2 => Y is returned theIndex = 3 => Z is returned Exceptions Standard_OutOfRange if theIndex is not 1, 2, or 3.
   */
  Coord(theIndex: number): number;
  /**
   * Returns for the unit vector its three coordinates theXv, theYv, and theZv.
   * @returns A result object with fields:
   * - `theXv`: updated value from the call.
   * - `theYv`: updated value from the call.
   * - `theZv`: updated value from the call.
   */
  Coord(theXv: number, theYv: number, theZv: number): { theXv: number; theYv: number; theZv: number };
  /**
   * Returns the X coordinate for a unit vector.
   */
  X(): number;
  /**
   * Returns the Y coordinate for a unit vector.
   */
  Y(): number;
  /**
   * Returns the Z coordinate for a unit vector.
   */
  Z(): number;
  /**
   * for this unit vector, returns its three coordinates as a number triple.
   */
  XYZ(): gp_XYZ;
  /**
   * Returns True if the angle between the two directions is lower or equal to theAngularTolerance.
   */
  IsEqual(theOther: gp_Dir, theAngularTolerance: number): boolean;
  /**
   * Returns True if the angle between this unit vector and the unit vector theOther is equal to Pi/2 (normal).
   */
  IsNormal(theOther: gp_Dir, theAngularTolerance: number): boolean;
  /**
   * Returns True if the angle between this unit vector and the unit vector theOther is equal to Pi (opposite).
   */
  IsOpposite(theOther: gp_Dir, theAngularTolerance: number): boolean;
  /**
   * Returns true if the angle between this unit vector and the unit vector theOther is equal to 0 or to Pi. Note: the tolerance criterion is given by theAngularTolerance.
   */
  IsParallel(theOther: gp_Dir, theAngularTolerance: number): boolean;
  /**
   * Computes the angular value in radians between <me> and <theOther>. This value is always positive in 3D space. Returns the angle in the range [0, PI].
   */
  Angle(theOther: gp_Dir): number;
  /**
   * Computes the angular value between <me> and <theOther>. <theVRef> is the direction of reference normal to <me> and <theOther> and its orientation gives the positive sense of rotation. If the cross product <me> ^ <theOther> has the same orientation as <theVRef> the angular value is positive else negative. Returns the angular value in the range -PI and PI (in radians). Raises DomainError if <me> and <theOther> are not parallel this exception is raised when <theVRef> is in the same plane as <me> and <theOther> The tolerance criterion is Resolution from package gp.
   */
  AngleWithRef(theOther: gp_Dir, theVRef: gp_Dir): number;
  /**
   * Computes the cross product between two directions Raises the exception ConstructionError if the two directions are parallel because the computed vector cannot be normalized to create a direction.
   * @remarks **Note:** Constexpr-compatible when result is already normalized.
   */
  Cross(theRight: gp_Dir): void;
  /**
   * Computes the triple vector product. <me> ^ (V1 ^ V2) Raises the exception ConstructionError if V1 and V2 are parallel or <me> and (V1^V2) are parallel because the computed vector can't be normalized to create a direction.
   * @remarks **Note:** Constexpr-compatible when result is already normalized.
   */
  Crossed(theRight: gp_Dir): gp_Dir;
  /**
   * @remarks **Note:** Constexpr-compatible when result is already normalized.
   */
  CrossCross(theV1: gp_Dir, theV2: gp_Dir): void;
  /**
   * Computes the double vector product this ^ (theV1 ^ theV2).
   *
   * - CrossCrossed creates a new unit vector. Exceptions Standard_ConstructionError if:
   * - theV1 and theV2 are parallel, or
   * - this unit vector and (theV1 ^ theV2) are parallel. This is because, in these conditions, the computed vector is null and cannot be normalized.
   * @remarks **Note:** Constexpr-compatible when result is already normalized.
   */
  CrossCrossed(theV1: gp_Dir, theV2: gp_Dir): gp_Dir;
  /**
   * Computes the scalar product.
   */
  Dot(theOther: gp_Dir): number;
  /**
   * Computes the triple scalar product <me> * (theV1 ^ theV2). Warnings : The computed vector theV1' = theV1 ^ theV2 is not normalized to create a unitary vector. So this method never raises an exception even if theV1 and theV2 are parallel.
   */
  DotCross(theV1: gp_Dir, theV2: gp_Dir): number;
  Reverse(): void;
  /**
   * Reverses the orientation of a direction geometric transformations Performs the symmetrical transformation of a direction with respect to the direction V which is the center of the symmetry.
   */
  Reversed(): gp_Dir;
  Mirror(theV: gp_Dir): void;
  Mirror(theA1: unknown): void;
  Mirror(theA2: unknown): void;
  /**
   * Performs the symmetrical transformation of a direction with respect to the direction theV which is the center of the symmetry.
   */
  Mirrored(theV: gp_Dir): gp_Dir;
  /**
   * Performs the symmetrical transformation of a direction with respect to an axis placement which is the axis of the symmetry.
   */
  Mirrored(theA1: unknown): gp_Dir;
  /**
   * Performs the symmetrical transformation of a direction with respect to a plane. The axis placement theA2 locates the plane of the symmetry : (Location, XDirection, YDirection).
   */
  Mirrored(theA2: unknown): gp_Dir;
  Rotate(theA1: unknown, theAng: number): void;
  /**
   * Rotates a direction. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
   */
  Rotated(theA1: unknown, theAng: number): gp_Dir;
  Transform(theT: unknown): void;
  /**
   * Transforms a direction with a "Trsf" from gp. Warnings : If the scale factor of the "Trsf" theT is negative then the direction <me> is reversed.
   */
  Transformed(theT: unknown): gp_Dir;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export type gp_Dir_D = (typeof gp_Dir_D)[keyof typeof gp_Dir_D];
/**
 * {@link Standard | `Standard`} directions in 3D space for optimized constexpr construction.
 */
export declare const gp_Dir_D: {
  /**
   * Direction along positive X axis (1, 0, 0)
   */
  readonly X: 'X';
  /**
   * Direction along positive Y axis (0, 1, 0)
   */
  readonly Y: 'Y';
  /**
   * Direction along positive Z axis (0, 0, 1)
   */
  readonly Z: 'Z';
  /**
   * Direction along negative X axis (-1, 0, 0)
   */
  readonly NX: 'NX';
  /**
   * Direction along negative Y axis (0, -1, 0)
   */
  readonly NY: 'NY';
  /**
   * Direction along negative Z axis (0, 0, -1)
   */
  readonly NZ: 'NZ';
};

/**
 * Describes a plane.
 * A plane is positioned in space with a coordinate system (a {@link gp_Ax3 | `gp_Ax3`} object), such that the plane is defined by the origin, "X Direction" and "Y Direction" of this coordinate system, which is the "local coordinate system" of the plane. The "main Direction" of the coordinate system is a vector normal to the plane.
 * It gives the plane an implicit orientation such that the plane is said to be "direct", if the coordinate system is right-handed, or "indirect" in the other case.
 * Note: when a {@link gp_Pln | `gp_Pln`} plane is converted into a {@link Geom_Plane | `Geom_Plane`} plane, some implicit properties of its local coordinate system are used explicitly:
 *
 * - its origin defines the origin of the two parameters of the planar surface,
 * - its implicit orientation is also that of the {@link Geom_Plane | `Geom_Plane`}. See Also {@link gce_MakePln | `gce_MakePln`} which provides functions for more complex plane constructions {@link Geom_Plane | `Geom_Plane`} which provides additional functions for constructing planes and works, in particular, with the parametric equations of planes
 */
export declare class gp_Pln {
  /**
   * Creates a plane coincident with OXY plane of the reference coordinate system.
   */
  constructor();
  /**
   * The coordinate system of the plane is defined with the axis placement theA3. The "Direction" of theA3 defines the normal to the plane. The "Location" of theA3 defines the location (origin) of the plane. The "XDirection" and "YDirection" of theA3 define the "XAxis" and the "YAxis" of the plane used to parametrize the plane.
   */
  constructor(theA3: unknown);
  /**
   * Creates a plane with the "Location" point <theP> and the normal direction <theV>.
   */
  constructor(theP: gp_Pnt, theV: gp_Dir);
  /**
   * Creates a plane from its cartesian equation :
   *
   * ```
   * theA*X+theB*Y+theC*Z+theD=0.0
   * ```
   *
   * Raises ConstructionError if std::sqrt (theA*theA + theB*theB + theC*theC) <= Resolution from gp.
   */
  constructor(theA: number, theB: number, theC: number, theD: number);
  /**
   * Returns the coefficients of the plane's cartesian equation:
   *
   * ```
   * theA*X+theB*Y+theC*Z+theD=0.
   * ```
   * @returns A result object with fields:
   * - `theA`: updated value from the call.
   * - `theB`: updated value from the call.
   * - `theC`: updated value from the call.
   * - `theD`: updated value from the call.
   */
  Coefficients(
    theA: number,
    theB: number,
    theC: number,
    theD: number,
  ): { theA: number; theB: number; theC: number; theD: number };
  /**
   * Modifies this plane, by redefining its local coordinate system so that.
   *
   * - its origin and "main Direction" become those of the axis theA1 (the "X Direction" and "Y Direction" are then recomputed). Raises ConstructionError if the theA1 is parallel to the "XAxis" of the plane.
   */
  SetAxis(theA1: unknown): void;
  /**
   * Changes the origin of the plane.
   */
  SetLocation(theLoc: gp_Pnt): void;
  /**
   * Changes the local coordinate system of the plane.
   */
  SetPosition(theA3: unknown): void;
  /**
   * Reverses the U parametrization of the plane reversing the XAxis.
   */
  UReverse(): void;
  /**
   * Reverses the V parametrization of the plane reversing the YAxis.
   */
  VReverse(): void;
  /**
   * Returns true if the Ax3 is right handed.
   */
  Direct(): boolean;
  /**
   * Returns the plane's normal Axis.
   */
  Axis(): unknown;
  /**
   * Returns the plane's location (origin).
   */
  Location(): gp_Pnt;
  /**
   * Returns the local coordinate system of the plane.
   */
  Position(): unknown;
  /**
   * Computes the distance between <me> and the point <theP>.
   */
  Distance(theP: gp_Pnt): number;
  /**
   * Computes the distance between <me> and the line <theL>.
   */
  Distance(theL: unknown): number;
  /**
   * Computes the distance between two planes.
   */
  Distance(theOther: gp_Pln): number;
  /**
   * Computes the signed distance between <me> and the point <theP>. The sign of the distance indicates on which side of the plane the point is located:
   *
   * - positive sign: the point is located in the direction of the plane normal,
   * - negative sign: the point is located in the opposite direction to the plane normal,
   * - zero: the point is located on the plane.
   */
  SignedDistance(theP: gp_Pnt): number;
  /**
   * Computes the signed distance between <me> and the line <theL>. The sign of the distance indicates on which side of the plane the line is located:
   *
   * - positive sign: the line is located in the direction of the plane normal,
   * - negative sign: the line is located in the opposite direction to the plane normal,
   * - zero: the line intersects the plane.
   */
  SignedDistance(theL: unknown): number;
  /**
   * Computes the signed distance between two planes. The sign of the distance indicates on which side of <me> the other plane is located:
   *
   * - positive sign: the other plane is located in the direction of the plane normal,
   * - negative sign: the other plane is located in the opposite direction to the plane normal,
   * - zero: the planes intersect.
   */
  SignedDistance(theOther: gp_Pln): number;
  /**
   * Computes the square distance between <me> and the point <theP>.
   */
  SquareDistance(theP: gp_Pnt): number;
  /**
   * Computes the square distance between <me> and the line <theL>.
   */
  SquareDistance(theL: unknown): number;
  /**
   * Computes the square distance between two planes.
   */
  SquareDistance(theOther: gp_Pln): number;
  /**
   * Returns the X axis of the plane.
   */
  XAxis(): unknown;
  /**
   * Returns the Y axis of the plane.
   */
  YAxis(): unknown;
  /**
   * Returns true if this plane contains the point theP. This means that.
   *
   * - the distance between point theP and this plane is less than or equal to theLinearTolerance, or
   * - line L is normal to the "main Axis" of the local coordinate system of this plane, within the tolerance AngularTolerance, and the distance between the origin of line L and this plane is less than or equal to theLinearTolerance.
   */
  Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;
  /**
   * Returns true if this plane contains the line theL. This means that.
   *
   * - the distance between point P and this plane is less than or equal to LinearTolerance, or
   * - line theL is normal to the "main Axis" of the local coordinate system of this plane, within the tolerance theAngularTolerance, and the distance between the origin of line theL and this plane is less than or equal to theLinearTolerance.
   */
  Contains(theL: unknown, theLinearTolerance: number, theAngularTolerance: number): boolean;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: unknown): void;
  Mirror(theA2: unknown): void;
  /**
   * Performs the symmetrical transformation of a plane with respect to the point <theP> which is the center of the symmetry Warnings : The normal direction to the plane is not changed. The "XAxis" and the "YAxis" are reversed.
   */
  Mirrored(theP: gp_Pnt): gp_Pln;
  /**
   * Performs the symmetrical transformation of a plane with respect to an axis placement which is the axis of the symmetry. The transformation is performed on the "Location" point, on the "XAxis" and the "YAxis". The resulting normal direction is the cross product between the "XDirection" and the "YDirection" after transformation if the initial plane was right handed, else it is the opposite.
   */
  Mirrored(theA1: unknown): gp_Pln;
  /**
   * Performs the symmetrical transformation of a plane with respect to an axis placement. The axis placement <A2> locates the plane of the symmetry. The transformation is performed on the "Location" point, on the "XAxis" and the "YAxis". The resulting normal direction is the cross product between the "XDirection" and the "YDirection" after transformation if the initial plane was right handed, else it is the opposite.
   */
  Mirrored(theA2: unknown): gp_Pln;
  Rotate(theA1: unknown, theAng: number): void;
  /**
   * Rotates a plane. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
   */
  Rotated(theA1: unknown, theAng: number): gp_Pln;
  Scale(theP: gp_Pnt, theS: number): void;
  /**
   * Scales a plane. theS is the scaling value.
   */
  Scaled(theP: gp_Pnt, theS: number): gp_Pln;
  Transform(theT: unknown): void;
  /**
   * Transforms a plane with the transformation theT from class Trsf. The transformation is performed on the "Location" point, on the "XAxis" and the "YAxis". The resulting normal direction is the cross product between the "XDirection" and the "YDirection" after transformation.
   */
  Transformed(theT: unknown): gp_Pln;
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
  /**
   * Translates a plane in the direction of the vector theV. The magnitude of the translation is the vector's magnitude.
   */
  Translated(theV: gp_Vec): gp_Pln;
  /**
   * Translates a plane from the point theP1 to the point theP2.
   */
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pln;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * This class describes a cartesian coordinate entity in 3D space {X,Y,Z}. This entity is used for algebraic calculation. This entity can be transformed with a "Trsf" or a "GTrsf" from package "gp". It is used in vectorial computations or for holding this type of information in data structures.
 */
export declare class gp_XYZ {
  /**
   * Creates an XYZ object with zero coordinates (0,0,0)
   */
  constructor();
  /**
   * creates an XYZ with given coordinates
   */
  constructor(theX: number, theY: number, theZ: number);
  /**
   * For this XYZ object, assigns the values theX, theY and theZ to its three coordinates.
   */
  SetCoord(theX: number, theY: number, theZ: number): void;
  /**
   * modifies the coordinate of range theIndex theIndex = 1 => X is modified theIndex = 2 => Y is modified theIndex = 3 => Z is modified Raises OutOfRange if theIndex != {1, 2, 3}.
   */
  SetCoord(theIndex: number, theXi: number): void;
  /**
   * Assigns the given value to the X coordinate.
   */
  SetX(theX: number): void;
  /**
   * Assigns the given value to the Y coordinate.
   */
  SetY(theY: number): void;
  /**
   * Assigns the given value to the Z coordinate.
   */
  SetZ(theZ: number): void;
  /**
   * returns the coordinate of range theIndex : theIndex = 1 => X is returned theIndex = 2 => Y is returned theIndex = 3 => Z is returned
   *
   * Raises OutOfRange if theIndex != {1, 2, 3}.
   */
  Coord(theIndex: number): number;
  Coord(theX: number, theY: number, theZ: number): { theX: number; theY: number; theZ: number };
  ChangeCoord(theIndex: number): number;
  /**
   * Returns a const ptr to coordinates location. Is useful for algorithms, but DOES NOT PERFORM ANY CHECKS!
   */
  GetData(): number;
  /**
   * Returns a ptr to coordinates location. Is useful for algorithms, but DOES NOT PERFORM ANY CHECKS!
   */
  ChangeData(): number;
  /**
   * Returns the X coordinate.
   */
  X(): number;
  /**
   * Returns the Y coordinate.
   */
  Y(): number;
  /**
   * Returns the Z coordinate.
   */
  Z(): number;
  /**
   * Computes std::sqrt(X*X + Y*Y + Z*Z) where X, Y and Z are the three coordinates of this XYZ object.
   */
  Modulus(): number;
  /**
   * Computes X*X + Y*Y + Z*Z where X, Y and Z are the three coordinates of this XYZ object.
   */
  SquareModulus(): number;
  /**
   * Returns True if he coordinates of this XYZ object are equal to the respective coordinates Other, within the specified tolerance theTolerance.
   */
  IsEqual(theOther: gp_XYZ, theTolerance: number): boolean;
  /**
   * ```
   * <me>.X()=<me>.X()+theOther.X() <me>.Y()=<me>.Y()+theOther.Y() <me>.Z()=<me>.Z()+theOther.Z()
   * ```
   */
  Add(theOther: gp_XYZ): void;
  /**
   * ```
   * new.X()=<me>.X()+theOther.X() new.Y()=<me>.Y()+theOther.Y() new.Z()=<me>.Z()+theOther.Z()
   * ```
   */
  Added(theOther: gp_XYZ): gp_XYZ;
  /**
   * ```
   * <me>.X()=<me>.Y()*theOther.Z()-<me>.Z()*theOther.Y() <me>.Y()=<me>.Z()*theOther.X()-<me>.X()*theOther.Z() <me>.Z()=<me>.X()*theOther.Y()-<me>.Y()*theOther.X()
   * ```
   */
  Cross(theOther: gp_XYZ): void;
  /**
   * ```
   * new.X()=<me>.Y()*theOther.Z()-<me>.Z()*theOther.Y() new.Y()=<me>.Z()*theOther.X()-<me>.X()*theOther.Z() new.Z()=<me>.X()*theOther.Y()-<me>.Y()*theOther.X()
   * ```
   */
  Crossed(theOther: gp_XYZ): gp_XYZ;
  /**
   * Computes the magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||.
   */
  CrossMagnitude(theRight: gp_XYZ): number;
  /**
   * Computes the square magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||**2.
   */
  CrossSquareMagnitude(theRight: gp_XYZ): number;
  /**
   * Triple vector product Computes <me> = <me>.Cross(theCoord1.Cross(theCoord2))
   */
  CrossCross(theCoord1: gp_XYZ, theCoord2: gp_XYZ): void;
  /**
   * Triple vector product computes New = <me>.Cross(theCoord1.Cross(theCoord2))
   */
  CrossCrossed(theCoord1: gp_XYZ, theCoord2: gp_XYZ): gp_XYZ;
  /**
   * divides <me> by a real.
   */
  Divide(theScalar: number): void;
  /**
   * divides <me> by a real.
   */
  Divided(theScalar: number): gp_XYZ;
  /**
   * Computes the scalar product between <me> and theOther.
   */
  Dot(theOther: gp_XYZ): number;
  /**
   * Computes the triple scalar product.
   */
  DotCross(theCoord1: gp_XYZ, theCoord2: gp_XYZ): number;
  /**
   * ```
   * <me>.X()=<me>.X()*theScalar; <me>.Y()=<me>.Y()*theScalar; <me>.Z()=<me>.Z()*theScalar;
   * ```
   */
  Multiply(theScalar: number): void;
  /**
   * ```
   * <me>.X()=<me>.X()*theOther.X(); <me>.Y()=<me>.Y()*theOther.Y(); <me>.Z()=<me>.Z()*theOther.Z();
   * ```
   */
  Multiply(theOther: gp_XYZ): void;
  /**
   * <me> = theMatrix * <me>
   */
  Multiply(theMatrix: unknown): void;
  /**
   * ```
   * New.X()=<me>.X()*theScalar; New.Y()=<me>.Y()*theScalar; New.Z()=<me>.Z()*theScalar;
   * ```
   */
  Multiplied(theScalar: number): gp_XYZ;
  /**
   * ```
   * new.X()=<me>.X()*theOther.X(); new.Y()=<me>.Y()*theOther.Y(); new.Z()=<me>.Z()*theOther.Z();
   * ```
   */
  Multiplied(theOther: gp_XYZ): gp_XYZ;
  /**
   * New = theMatrix * <me>
   */
  Multiplied(theMatrix: unknown): gp_XYZ;
  /**
   * ```
   * <me>.X()=<me>.X()/<me>.Modulus() <me>.Y()=<me>.Y()/<me>.Modulus() <me>.Z()=<me>.Z()/<me>.Modulus()
   * ```
   *
   * Raised if <me>.`Modulus()` <= Resolution from gp
   */
  Normalize(): void;
  /**
   * ```
   * New.X()=<me>.X()/<me>.Modulus() New.Y()=<me>.Y()/<me>.Modulus() New.Z()=<me>.Z()/<me>.Modulus()
   * ```
   *
   * Raised if <me>.`Modulus()` <= Resolution from gp
   */
  Normalized(): gp_XYZ;
  /**
   * ```
   * <me>.X()=-<me>.X() <me>.Y()=-<me>.Y() <me>.Z()=-<me>.Z()
   * ```
   */
  Reverse(): void;
  /**
   * ```
   * New.X()=-<me>.X() New.Y()=-<me>.Y() New.Z()=-<me>.Z()
   * ```
   */
  Reversed(): gp_XYZ;
  /**
   * ```
   * <me>.X()=<me>.X()-theOther.X() <me>.Y()=<me>.Y()-theOther.Y() <me>.Z()=<me>.Z()-theOther.Z()
   * ```
   */
  Subtract(theOther: gp_XYZ): void;
  /**
   * ```
   * new.X()=<me>.X()-theOther.X() new.Y()=<me>.Y()-theOther.Y() new.Z()=<me>.Z()-theOther.Z()
   * ```
   */
  Subtracted(theOther: gp_XYZ): gp_XYZ;
  /**
   * <me> is set to the following linear form :
   *
   * ```
   * theA1*theXYZ1+theA2*theXYZ2+theA3*theXYZ3+theXYZ4
   * ```
   */
  SetLinearForm(
    theA1: number,
    theXYZ1: gp_XYZ,
    theA2: number,
    theXYZ2: gp_XYZ,
    theA3: number,
    theXYZ3: gp_XYZ,
    theXYZ4: gp_XYZ,
  ): void;
  /**
   * <me> is set to the following linear form :
   *
   * ```
   * theA1*theXYZ1+theA2*theXYZ2+theA3*theXYZ3
   * ```
   */
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ): void;
  /**
   * <me> is set to the following linear form :
   *
   * ```
   * theA1*theXYZ1+theA2*theXYZ2+theXYZ3
   * ```
   */
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theXYZ3: gp_XYZ): void;
  /**
   * <me> is set to the following linear form :
   *
   * ```
   * theA1*theXYZ1+theA2*theXYZ2
   * ```
   */
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ): void;
  /**
   * <me> is set to the following linear form :
   *
   * ```
   * theA1*theXYZ1+theXYZ2
   * ```
   */
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
  /**
   * <me> is set to the following linear form :
   *
   * ```
   * theXYZ1+theXYZ2
   * ```
   */
  SetLinearForm(theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Defines a 3D cartesian point.
 */
export declare class gp_Pnt {
  /**
   * Creates a point with zero coordinates.
   */
  constructor();
  /**
   * Creates a point from a XYZ object.
   */
  constructor(theCoord: gp_XYZ);
  /**
   * Creates a point with its 3 cartesian's coordinates: theXp, theYp, theZp.
   */
  constructor(theXp: number, theYp: number, theZp: number);
  /**
   * Changes the coordinate of range theIndex: theIndex = 1 => X is modified theIndex = 2 => Y is modified theIndex = 3 => Z is modified Raised if theIndex != {1, 2, 3}.
   */
  SetCoord(theIndex: number, theXi: number): void;
  /**
   * For this point, assigns the values theXp, theYp and theZp to its three coordinates.
   */
  SetCoord(theXp: number, theYp: number, theZp: number): void;
  /**
   * Assigns the given value to the X coordinate of this point.
   */
  SetX(theX: number): void;
  /**
   * Assigns the given value to the Y coordinate of this point.
   */
  SetY(theY: number): void;
  /**
   * Assigns the given value to the Z coordinate of this point.
   */
  SetZ(theZ: number): void;
  /**
   * Assigns the three coordinates of theCoord to this point.
   */
  SetXYZ(theCoord: gp_XYZ): void;
  /**
   * Returns the coordinate of corresponding to the value of theIndex : theIndex = 1 => X is returned theIndex = 2 => Y is returned theIndex = 3 => Z is returned Raises OutOfRange if theIndex != {1, 2, 3}. Raised if theIndex != {1, 2, 3}.
   */
  Coord(theIndex: number): number;
  /**
   * For this point gives its three coordinates theXp, theYp and theZp.
   * @returns A result object with fields:
   * - `theXp`: updated value from the call.
   * - `theYp`: updated value from the call.
   * - `theZp`: updated value from the call.
   */
  Coord(theXp: number, theYp: number, theZp: number): { theXp: number; theYp: number; theZp: number };
  /**
   * For this point, returns its three coordinates as a XYZ object.
   */
  Coord(): gp_XYZ;
  /**
   * For this point, returns its X coordinate.
   */
  X(): number;
  /**
   * For this point, returns its Y coordinate.
   */
  Y(): number;
  /**
   * For this point, returns its Z coordinate.
   */
  Z(): number;
  /**
   * For this point, returns its three coordinates as a XYZ object.
   */
  XYZ(): gp_XYZ;
  /**
   * Returns the coordinates of this point. Note: This syntax allows direct modification of the returned value.
   */
  ChangeCoord(): gp_XYZ;
  /**
   * Assigns the result of the following expression to this point (theAlpha*this + theBeta*theP) / (theAlpha + theBeta)
   */
  BaryCenter(theAlpha: number, theP: gp_Pnt, theBeta: number): void;
  /**
   * Comparison Returns True if the distance between the two points is lower or equal to theLinearTolerance.
   */
  IsEqual(theOther: gp_Pnt, theLinearTolerance: number): boolean;
  /**
   * Computes the distance between two points.
   */
  Distance(theOther: gp_Pnt): number;
  /**
   * Computes the square distance between two points.
   */
  SquareDistance(theOther: gp_Pnt): number;
  /**
   * Performs the symmetrical transformation of a point with respect to the point theP which is the center of the symmetry.
   */
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: unknown): void;
  Mirror(theA2: unknown): void;
  /**
   * Performs the symmetrical transformation of a point with respect to an axis placement which is the axis of the symmetry.
   */
  Mirrored(theP: gp_Pnt): gp_Pnt;
  /**
   * Performs the symmetrical transformation of a point with respect to a plane. The axis placement theA2 locates the plane of the symmetry : (Location, XDirection, YDirection).
   */
  Mirrored(theA1: unknown): gp_Pnt;
  /**
   * Rotates a point. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
   */
  Mirrored(theA2: unknown): gp_Pnt;
  Rotate(theA1: unknown, theAng: number): void;
  Rotated(theA1: unknown, theAng: number): gp_Pnt;
  /**
   * Scales a point. theS is the scaling value.
   */
  Scale(theP: gp_Pnt, theS: number): void;
  Scaled(theP: gp_Pnt, theS: number): gp_Pnt;
  /**
   * Transforms a point with the transformation T.
   */
  Transform(theT: unknown): void;
  Transformed(theT: unknown): gp_Pnt;
  /**
   * Translates a point in the direction of the vector theV. The magnitude of the translation is the vector's magnitude.
   */
  Translate(theV: gp_Vec): void;
  /**
   * Translates a point from the point theP1 to the point theP2.
   */
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
  Translated(theV: gp_Vec): gp_Pnt;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pnt;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Auxiliary class representing a part of the global progress scale allocated by a step of the progress scope, see `Message_ProgressScope::Next()`.
 *
 * A range object takes responsibility of advancing the progress by the size of allocated step, which is then performed depending on how it is used:
 *
 * - If {@link Message_ProgressScope | `Message_ProgressScope`} object is created using this range as argument, then this respondibility is taken over by that scope.
 * - Otherwise, a range advances progress directly upon destruction.
 *
 * A range object can be copied, the responsibility for progress advancement is then taken by the copy. The same range object may be used (either copied or used to create scope) only once. Any consequent attempts to use range will give no result on the progress; in debug mode, an assert message will be generated.
 * @see {@link Message_ProgressScope | `Message_ProgressScope`}
 */
export declare class Message_ProgressRange {
  /**
   * Constructor of the empty range.
   */
  constructor();
  /**
   * Copy constructor disarms the source.
   */
  constructor(theOther: Message_ProgressRange);
  /**
   * Returns true if ProgressIndicator signals UserBreak.
   */
  UserBreak(): boolean;
  /**
   * Returns false if ProgressIndicator signals UserBreak.
   */
  More(): boolean;
  /**
   * Returns true if this progress range is attached to some indicator.
   */
  IsActive(): boolean;
  /**
   * Closes the current range and advances indicator.
   */
  Close(): void;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * The class provides Boolean common operation between arguments and tools (Boolean Intersection).
 */
export declare class BRepAlgoAPI_Common {
  /**
   * Empty constructor.
   */
  constructor();
  /**
   * Constructor with two shapes <S1> -argument <S2> -tool <anOperation> - the type of the operation Obsolete.
   */
  constructor(S1: TopoDS_Shape, S2: TopoDS_Shape, theRange?: Message_ProgressRange);
  // dropped: BRepAlgoAPI_Common param 0 resolves to excluded type BOPAlgo_PaveFiller
  // dropped: BRepAlgoAPI_Common param 2 resolves to excluded type BOPAlgo_PaveFiller
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Builds the mesh of a shape with respect of their correctly triangulated parts.
 */
export declare class BRepMesh_IncrementalMesh {
  constructor();
  constructor(theShape: TopoDS_Shape, theParameters: unknown, theRange?: Message_ProgressRange);
  constructor(
    theShape: TopoDS_Shape,
    theLinDeflection: number,
    isRelative?: boolean,
    theAngDeflection?: number,
    isInParallel?: boolean,
  );
  Perform(theRange: Message_ProgressRange): void;
  Perform(theContext: unknown, theRange: Message_ProgressRange): void;
  Parameters(): unknown;
  ChangeParameters(): unknown;
  IsModified(): boolean;
  GetStatusFlags(): number;
  static IsParallelDefault(): boolean;
  static SetParallelDefault(isInParallel: boolean): void;
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * A framework to check the overall validity of a shape. For a shape to be valid in Open CASCADE, it - or its component subshapes - must respect certain criteria. These criteria are checked by the function IsValid. Once you have determined whether a shape is valid or not, you can diagnose its specific anomalies and correct them using the services of the {@link ShapeAnalysis | `ShapeAnalysis`}, {@link ShapeUpgrade | `ShapeUpgrade`}, and {@link ShapeFix | `ShapeFix`} packages.
 */
export declare class BRepCheck_Analyzer {
  /**
   * Constructs a shape validation object defined by the shape S. is the shape to control. <GeomControls> If False only topological informaions are checked. The geometricals controls are For a Vertex: BRepCheck_InvalidToleranceValue NYI For an Edge: BRepCheck_InvalidCurveOnClosedSurface, BRepCheck_InvalidCurveOnSurface, BRepCheck_InvalidSameParameterFlag, BRepCheck_InvalidToleranceValue NYI For a face: BRepCheck_UnorientableShape, BRepCheck_IntersectingWires, BRepCheck_InvalidToleranceValue NYI For a wire: BRepCheck_SelfIntersectingWire.
   */
  constructor(S: TopoDS_Shape, GeomControls?: boolean, theIsParallel?: boolean, theIsExact?: boolean);
  /**
   * is the shape to control. <GeomControls> If False only topological informaions are checked. The geometricals controls are For a Vertex: BRepCheck_InvalidTolerance NYI For an Edge: BRepCheck_InvalidCurveOnClosedSurface, BRepCheck_InvalidCurveOnSurface, BRepCheck_InvalidSameParameterFlag, BRepCheck_InvalidTolerance NYI For a face: BRepCheck_UnorientableShape, BRepCheck_IntersectingWires, BRepCheck_InvalidTolerance NYI For a wire: BRepCheck_SelfIntersectingWire
   */
  Init(S: TopoDS_Shape, GeomControls?: boolean): void;
  /**
   * Sets method to calculate distance: Calculating in finite number of points (if theIsExact is false, faster, but possible not correct result) or exact calculating by using {@link BRepLib_CheckCurveOnSurface | `BRepLib_CheckCurveOnSurface`} class (if theIsExact is true, slowly, but more correctly). Exact method is used only when edge is SameParameter. Default method is calculating in finite number of points.
   */
  SetExactMethod(theIsExact: boolean): void;
  /**
   * Returns true if exact method selected.
   */
  IsExactMethod(): boolean;
  /**
   * Sets parallel flag.
   */
  SetParallel(theIsParallel: boolean): void;
  /**
   * Returns true if parallel flag is set.
   */
  IsParallel(): boolean;
  /**
   * is a subshape of the original shape. Returns <STandard_True> if no default has been detected on and any of its subshape.
   */
  IsValid(S: TopoDS_Shape): boolean;
  /**
   * Returns true if no defect is detected on the shape S or any of its subshapes. Returns true if the shape S is valid. This function checks whether a given shape is valid by checking that:
   *
   * - the topology is correct
   * - parameterization of edges in particular is correct. For the topology to be correct, the following conditions must be satisfied:
   * - edges should have at least two vertices if they are not degenerate edges. The vertices should be within the range of the bounding edges at the tolerance specified in the vertex,
   * - edges should share at least one face. The representation of the edges should be within the tolerance criterion assigned to them.
   * - wires defining a face should not self-intersect and should be closed,
   * - there should be one wire which contains all other wires inside a face,
   * - wires should be correctly oriented with respect to each of the edges,
   * - faces should be correctly oriented, in particular with respect to adjacent faces if these faces define a solid,
   * - shells defining a solid should be closed. There should be one enclosing shell if the shape is a solid; To check parameterization of edge, there are 2 approaches depending on the edge?s contextual situation.
   * - if the edge is either single, or it is in the context of a wire or a compound, its parameterization is defined by the parameterization of its 3D curve and is considered as valid.
   * - If the edge is in the context of a face, it should have SameParameter and SameRange flags set to true. To check these flags, you should call the function `BRep_Tool::SameParameter` and `BRep_Tool::SameRange` for an edge. If at least one of these flags is set to false, the edge is considered as invalid without any additional check.
   * If the edge is contained by a face, and it has SameParameter and SameRange flags set to true, IsValid checks whether representation of the edge on face, in context of which the edge is considered, has the same parameterization up to the tolerance value coded on the edge.
   * For a given parameter t on the edge having C as a 3D curve and one PCurve P on a surface S (base surface of the reference face), this checks that |C(t) - S(P(t))| is less than or equal to tolerance, where tolerance is the tolerance value coded on the edge.
   */
  IsValid(): boolean;
  Result(theSubS: TopoDS_Shape): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * This package provides the bounding boxes for curves and surfaces from BRepAdaptor. Functions to add a topological shape to a bounding box.
 */
export declare class BRepBndLib {
  constructor();
  /**
   * Adds the shape S to the bounding box B. More precisely are successively added to B:
   *
   * - each face of S; the triangulation of the face is used if it exists,
   * - then each edge of S which does not belong to a face, the polygon of the edge is used if it exists
   * - and last each vertex of S which does not belong to an edge. After each elementary operation, the bounding box B is enlarged by the tolerance value of the relative sub-shape. When working with the triangulation of a face this value of enlargement is the sum of the triangulation deflection and the face tolerance. When working with the polygon of an edge this value of enlargement is the sum of the polygon deflection and the edge tolerance. Warning
   * - This algorithm is time consuming if triangulation has not been inserted inside the data structure of the shape S.
   * - The resulting bounding box may be somewhat larger than the object.
   * @param B Mutated in place; read the updated value from this argument after the call.
   */
  static Add(S: TopoDS_Shape, B: unknown, useTriangulation: boolean): void;
  /**
   * Adds the shape S to the bounding box B. This is a quick algorithm but only works if the shape S is composed of polygonal planar faces, as is the case if S is an approached polyhedral representation of an exact shape. Pay particular attention to this because this condition is not checked and, if it not respected, an error may occur in the algorithm for which the bounding box is built. Note that the resulting bounding box is not enlarged by the tolerance value of the sub-shapes as is the case with the Add function. So the added part of the resulting bounding box is closer to the shape S.
   * @param B Mutated in place; read the updated value from this argument after the call.
   */
  static AddClose(S: TopoDS_Shape, B: unknown): void;
  /**
   * Adds the shape S to the bounding box B. This algorithm builds precise bounding box, which differs from exact geometry boundaries of shape only on shape entities tolerances Algorithm is the same as for method Add(..), but uses more precise methods for building boxes for geometry objects. If useShapeTolerance = True, bounding box is enlardged by shape tolerances and these tolerances are used for numerical methods of bounding box size calculations, otherwise bounding box is built according to sizes of uderlined geometrical entities, numerical calculation use tolerance `Precision::Confusion()`.
   * @param B Mutated in place; read the updated value from this argument after the call.
   */
  static AddOptimal(S: TopoDS_Shape, B: unknown, useTriangulation: boolean, useShapeTolerance: boolean): void;
  /**
   * Computes the Oriented Bounding box for the shape <theS>. Two independent methods of computation are implemented: first method based on set of points (so, it demands the triangulated shape or shape with planar faces and linear edges). The second method is based on use of inertia axes and is called if use of the first method is impossible. If theIsTriangulationUsed == FALSE then the triangulation will be ignored at all.
   * If theIsShapeToleranceUsed == TRUE then resulting box will be extended on the tolerance of the shape. theIsOptimal flag defines whether to look for the more tight OBB for the cost of performance or not.
   * @param theOBB Mutated in place; read the updated value from this argument after the call.
   */
  static AddOBB(
    theS: TopoDS_Shape,
    theOBB: unknown,
    theIsTriangulationUsed: boolean,
    theIsOptimal: boolean,
    theIsShapeToleranceUsed: boolean,
  ): void;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Provides global functions to compute a shape's global properties for lines, surfaces or volumes, and bring them together with the global properties already computed for a geometric system. The global properties computed for a system are :
 *
 * - its mass,
 * - its center of mass,
 * - its matrix of inertia,
 * - its moment about an axis,
 * - its radius of gyration about an axis,
 * - and its principal properties of inertia such as principal axis, principal moments, principal radius of gyration.
 */
export declare class BRepGProp {
  constructor();
  /**
   * Computes the linear global properties of the shape S, i.e. the global properties induced by each edge of the shape S, and brings them together with the global properties still retained by the framework LProps. If the current system of LProps was empty, its global properties become equal to the linear global properties of S. For this computation no linear density is attached to the edges. So, for example, the added mass corresponds to the sum of the lengths of the edges of S.
   * The density of the composed systems, i.e. that of each component of the current system of LProps, and that of S which is considered to be equal to 1, must be coherent. Note that this coherence cannot be checked.
   * You are advised to use a separate framework for each density, and then to bring these frameworks together into a global one. The point relative to which the inertia of the system is computed is the reference point of the framework LProps.
   * Note: if your programming ensures that the framework LProps retains only linear global properties (brought together for example, by the function LinearProperties) for objects the density of which is equal to 1 (or is not defined), the function Mass will return the total length of edges of the system analysed by LProps. Warning No check is performed to verify that the shape S retains truly linear properties. If S is simply a vertex, it is not considered to present any additional global properties. SkipShared is a special flag, which allows taking in calculation shared topological entities or not. For ex., if SkipShared = True, edges, shared by two or more faces, are taken into calculation only once. If we have cube with sizes 1, 1, 1, its linear properties = 12 for SkipEdges = true and 24 for SkipEdges = false. UseTriangulation is a special flag, which defines preferable source of geometry data.
   * If UseTriangulation = false, exact geometry objects (curves) are used, otherwise polygons of triangulation are used first.
   * @param LProps Mutated in place; read the updated value from this argument after the call.
   */
  static LinearProperties(S: TopoDS_Shape, LProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;
  /**
   * Computes the surface global properties of the shape S, i.e. the global properties induced by each face of the shape S, and brings them together with the global properties still retained by the framework SProps. If the current system of SProps was empty, its global properties become equal to the surface global properties of S. For this computation, no surface density is attached to the faces. Consequently, the added mass corresponds to the sum of the areas of the faces of S.
   * The density of the component systems, i.e. that of each component of the current system of SProps, and that of S which is considered to be equal to 1, must be coherent. Note that this coherence cannot be checked.
   * You are advised to use a framework for each different value of density, and then to bring these frameworks together into a global one. The point relative to which the inertia of the system is computed is the reference point of the framework SProps.
   * Note : if your programming ensures that the framework SProps retains only surface global properties, brought together, for example, by the function SurfaceProperties, for objects the density of which is equal to 1 (or is not defined), the function Mass will return the total area of faces of the system analysed by SProps. Warning No check is performed to verify that the shape S retains truly surface properties. If S is simply a vertex, an edge or a wire, it is not considered to present any additional global properties. SkipShared is a special flag, which allows taking in calculation shared topological entities or not. For ex., if SkipShared = True, faces, shared by two or more shells, are taken into calculation only once. UseTriangulation is a special flag, which defines preferable source of geometry data. If UseTriangulation = false, exact geometry objects (surfaces) are used, otherwise face triangulations are used first.
   * @param SProps Mutated in place; read the updated value from this argument after the call.
   */
  static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;
  /**
   * Updates <SProps> with the shape , that contains its principal properties. The surface properties of all the faces in are computed. Adaptive 2D Gauss integration is used. Parameter Eps sets maximal relative error of computed mass (area) for each face. Error is calculated as std::abs((M(i+1)-M(i))/M(i+1)), M(i+1) and M(i) are values for two successive steps of adaptive integration. Method returns estimation of relative error reached for whole shape. WARNING: if Eps > 0.001 algorithm performs non-adaptive integration.
   * SkipShared is a special flag, which allows taking in calculation shared topological entities or not For ex., if SkipShared = True, faces, shared by two or more shells, are taken into calculation only once.
   * @param SProps Mutated in place; read the updated value from this argument after the call.
   */
  static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, Eps: number, SkipShared: boolean): number;
  /**
   * Computes the global volume properties of the solid S, and brings them together with the global properties still retained by the framework VProps. If the current system of VProps was empty, its global properties become equal to the global properties of S for volume. For this computation, no volume density is attached to the solid. Consequently, the added mass corresponds to the volume of S.
   * The density of the component systems, i.e. that of each component of the current system of VProps, and that of S which is considered to be equal to 1, must be coherent to each other. Note that this coherence cannot be checked.
   * You are advised to use a separate framework for each density, and then to bring these frameworks together into a global one. The point relative to which the inertia of the system is computed is the reference point of the framework VProps.
   * Note: if your programming ensures that the framework VProps retains only global properties of volume (brought together for example, by the function VolumeProperties) for objects the density of which is equal to 1 (or is not defined), the function Mass will return the total volume of the solids of the system analysed by VProps. Warning The shape S must represent an object whose global volume properties can be computed. It may be a finite solid, or a series of finite solids all oriented in a coherent way. Nonetheless, S must be exempt of any free boundary.
   * Note that these conditions of coherence are not checked by this algorithm, and results will be false if they are not respected. SkipShared a is special flag, which allows taking in calculation shared topological entities or not.
   * For ex., if SkipShared = True, the volumes formed by the equal (the same TShape, location and orientation) faces are taken into calculation only once. UseTriangulation is a special flag, which defines preferable source of geometry data. If UseTriangulation = false, exact geometry objects (surfaces) are used, otherwise face triangulations are used first.
   * @param VProps Mutated in place; read the updated value from this argument after the call.
   */
  static VolumeProperties(
    S: TopoDS_Shape,
    VProps: GProp_GProps,
    OnlyClosed: boolean,
    SkipShared: boolean,
    UseTriangulation: boolean,
  ): void;
  /**
   * Updates <VProps> with the shape , that contains its principal properties. The volume properties of all the FORWARD and REVERSED faces in are computed. If OnlyClosed is True then computed faces must belong to closed Shells. Adaptive 2D Gauss integration is used. Parameter Eps sets maximal relative error of computed mass (volume) for each face.
   * Error is calculated as std::abs((M(i+1)-M(i))/M(i+1)), M(i+1) and M(i) are values for two successive steps of adaptive integration. Method returns estimation of relative error reached for whole shape. WARNING: if Eps > 0.001 algorithm performs non-adaptive integration. SkipShared is a special flag, which allows taking in calculation shared topological entities or not.
   * For ex., if SkipShared = True, the volumes formed by the equal (the same TShape, location and orientation) faces are taken into calculation only once.
   * @param VProps Mutated in place; read the updated value from this argument after the call.
   */
  static VolumeProperties(
    S: TopoDS_Shape,
    VProps: GProp_GProps,
    Eps: number,
    OnlyClosed: boolean,
    SkipShared: boolean,
  ): number;
  /**
   * Updates <VProps> with the shape , that contains its principal properties. The volume properties of all the FORWARD and REVERSED faces in are computed. If OnlyClosed is True then computed faces must belong to closed Shells. Adaptive 2D Gauss integration is used. Parameter IsUseSpan says if it is necessary to define spans on a face. This option has an effect only for BSpline faces. Parameter Eps sets maximal relative error of computed property for each face.
   * Error is delivered by the adaptive Gauss-Kronrod method of integral computation that is used for properties computation. Method returns estimation of relative error reached for whole shape. Returns negative value if the computation is failed. SkipShared is a special flag, which allows taking in calculation shared topological entities or not.
   * For ex., if SkipShared = True, the volumes formed by the equal (the same TShape, location and orientation) faces are taken into calculation only once.
   * @param VProps Mutated in place; read the updated value from this argument after the call.
   */
  static VolumePropertiesGK(
    S: TopoDS_Shape,
    VProps: GProp_GProps,
    Eps: number,
    OnlyClosed: boolean,
    IsUseSpan: boolean,
    CGFlag: boolean,
    IFlag: boolean,
    SkipShared: boolean,
  ): number;
  static VolumePropertiesGK(
    S: TopoDS_Shape,
    VProps: GProp_GProps,
    thePln: gp_Pln,
    Eps: number,
    OnlyClosed: boolean,
    IsUseSpan: boolean,
    CGFlag: boolean,
    IFlag: boolean,
    SkipShared: boolean,
  ): number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Provides methods to.
 *
 * - identify possible contiguous boundaries (for control afterwards (of continuity: C0, C1, ...))
 * - assemble contiguous shapes into one shape. Only manifold shapes will be found. Sewing will not be done in case of multiple edges.
 *
 * For sewing, use this function as following:
 *
 * - create an empty object
 * - default tolerance 1.E-06
 * - with face analysis on
 * - with sewing operation on
 * - set the cutting option as you need (default True)
 * - define a tolerance
 * - add shapes to be sewed -> Add
 * - compute -> Perform
 * - output the resulted shapes
 * - output free edges if necessary
 * - output multiple edges if necessary
 * - output the problems if any
 */
export declare class BRepBuilderAPI_Sewing {
  /**
   * Creates an object with tolerance of connexity option for sewing (if false only control) option for analysis of degenerated shapes option for cutting of free edges. option for non manifold processing.
   */
  constructor(tolerance?: number, option1?: boolean, option2?: boolean, option3?: boolean, option4?: boolean);
  /**
   * initialize the parameters if necessary
   */
  Init(tolerance?: number, option1?: boolean, option2?: boolean, option3?: boolean, option4?: boolean): void;
  /**
   * Loads the context shape.
   */
  Load(shape: TopoDS_Shape): void;
  /**
   * Defines the shapes to be sewed or controlled.
   */
  Add(shape: TopoDS_Shape): void;
  /**
   * Computing theProgress - progress indicator of algorithm.
   */
  Perform(theProgress?: Message_ProgressRange): void;
  /**
   * Gives the sewed shape a null shape if nothing constructed may be a face, a shell, a solid or a compound.
   */
  SewedShape(): TopoDS_Shape;
  /**
   * set context
   */
  SetContext(theContext: unknown): void;
  /**
   * return context
   */
  GetContext(): unknown;
  /**
   * Gives the number of free edges (edge shared by one face)
   */
  NbFreeEdges(): number;
  /**
   * Gives each free edge.
   */
  FreeEdge(index: number): unknown;
  /**
   * Gives the number of multiple edges (edge shared by more than two faces)
   */
  NbMultipleEdges(): number;
  /**
   * Gives each multiple edge.
   */
  MultipleEdge(index: number): unknown;
  /**
   * Gives the number of contiguous edges (edge shared by two faces)
   */
  NbContigousEdges(): number;
  /**
   * Gives each contiguous edge.
   */
  ContigousEdge(index: number): unknown;
  /**
   * Gives the sections (edge) belonging to a contiguous edge.
   */
  ContigousEdgeCouple(index: number): NCollection_List_TopoDS_Shape;
  /**
   * Indicates if a section is bound (before use SectionToBoundary)
   */
  IsSectionBound(section: unknown): boolean;
  /**
   * Gives the original edge (free boundary) which becomes the the section. Remember that sections constitute common edges. This information is important for control because with original edge we can find the surface to which the section is attached.
   */
  SectionToBoundary(section: unknown): unknown;
  /**
   * Gives the number of degenerated shapes.
   */
  NbDegeneratedShapes(): number;
  /**
   * Gives each degenerated shape.
   */
  DegeneratedShape(index: number): TopoDS_Shape;
  /**
   * Indicates if a input shape is degenerated.
   */
  IsDegenerated(shape: TopoDS_Shape): boolean;
  /**
   * Indicates if a input shape has been modified.
   */
  IsModified(shape: TopoDS_Shape): boolean;
  /**
   * Gives a modifieded shape.
   */
  Modified(shape: TopoDS_Shape): TopoDS_Shape;
  /**
   * Indicates if a input subshape has been modified.
   */
  IsModifiedSubShape(shape: TopoDS_Shape): boolean;
  /**
   * Gives a modifieded subshape.
   */
  ModifiedSubShape(shape: TopoDS_Shape): TopoDS_Shape;
  /**
   * print the information
   */
  Dump(): void;
  /**
   * Gives the number of deleted faces (faces smallest than tolerance)
   */
  NbDeletedFaces(): number;
  /**
   * Gives each deleted face.
   */
  DeletedFace(index: number): TopoDS_Face;
  /**
   * Gives a modified shape.
   */
  WhichFace(theEdg: unknown, index?: number): TopoDS_Face;
  /**
   * Gets same parameter mode.
   */
  SameParameterMode(): boolean;
  /**
   * Sets same parameter mode.
   */
  SetSameParameterMode(SameParameterMode: boolean): void;
  /**
   * Gives set tolerance.
   */
  Tolerance(): number;
  /**
   * Sets tolerance.
   */
  SetTolerance(theToler: number): void;
  /**
   * Gives set min tolerance.
   */
  MinTolerance(): number;
  /**
   * Sets min tolerance.
   */
  SetMinTolerance(theMinToler: number): void;
  /**
   * Gives set max tolerance.
   */
  MaxTolerance(): number;
  /**
   * Sets max tolerance.
   */
  SetMaxTolerance(theMaxToler: number): void;
  /**
   * Returns mode for sewing faces By default - true.
   */
  FaceMode(): boolean;
  /**
   * Sets mode for sewing faces By default - true.
   */
  SetFaceMode(theFaceMode: boolean): void;
  /**
   * Returns mode for sewing floating edges By default - false.
   */
  FloatingEdgesMode(): boolean;
  /**
   * Sets mode for sewing floating edges By default - false. Returns mode for cutting floating edges By default - false. Sets mode for cutting floating edges By default - false.
   */
  SetFloatingEdgesMode(theFloatingEdgesMode: boolean): void;
  /**
   * Returns mode for accounting of local tolerances of edges and vertices during of merging.
   */
  LocalTolerancesMode(): boolean;
  /**
   * Sets mode for accounting of local tolerances of edges and vertices during of merging in this case WorkTolerance = myTolerance + tolEdge1+ tolEdg2;.
   */
  SetLocalTolerancesMode(theLocalTolerancesMode: boolean): void;
  /**
   * Sets mode for non-manifold sewing.
   */
  SetNonManifoldMode(theNonManifoldMode: boolean): void;
  /**
   * Gets mode for non-manifold sewing.
   *
   * INTERNAL FUNCTIONS --
   */
  NonManifoldMode(): boolean;
  static get_type_name(): string;
  static get_type_descriptor(): unknown;
  DynamicType(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Provides methods to build faces.
 *
 * A face may be built:
 *
 * - From a surface.
 * - Elementary surface from gp.
 * - Surface from Geom.
 * - From a surface and U,V values.
 * - From a wire.
 * - Find the surface automatically if possible.
 * - From a surface and a wire.
 * - A flag Inside is given, when this flag is True the wire is oriented to bound a finite area on the surface.
 * - From a face and a wire.
 * - The new wire is a perforation.
 */
export declare class BRepBuilderAPI_MakeFace {
  /**
   * Not done.
   */
  constructor();
  /**
   * Load a face. useful to add wires.
   */
  constructor(F: TopoDS_Face);
  /**
   * Make a face from a plane.
   */
  constructor(P: gp_Pln);
  /**
   * Make a face from a cylinder.
   */
  constructor(C: gp_Cylinder);
  /**
   * Make a face from a cone.
   */
  constructor(C: unknown);
  /**
   * Make a face from a sphere.
   */
  constructor(S: unknown);
  /**
   * Make a face from a torus.
   */
  constructor(C: unknown);
  /**
   * Make a face from a Surface. Accepts tolerance value (TolDegen) for resolution of degenerated edges.
   */
  constructor(S: unknown, TolDegen: number);
  /**
   * Find a surface from the wire and make a face. if <OnlyPlane> is true, the computed surface will be a plane. If it is not possible to find a plane, the flag NotDone will be set.
   */
  constructor(W: unknown, OnlyPlane?: boolean);
  /**
   * Adds the wire <W> in the face <F> A general method to create a face is to give.
   *
   * - a surface S as the support (the geometric domain) of the face,
   * - and a wire W to bound it.
   * The bounds of the face can also be defined by four parameter values umin, umax, vmin, vmax which determine isoparametric limitations on the parametric space of the surface. In this way, a patch is defined. The parameter values are optional. If they are omitted, the natural bounds of the surface are used. A wire is automatically built using the defined bounds.
   * Up to four edges and four vertices are created with this wire (no edge is created when the corresponding parameter value is infinite). Wires can then be added using the function Add to define other restrictions on the face. These restrictions represent holes.
   * More than one wire may be added by this way, provided that the wires do not cross each other and that they define only one area on the surface. (Be careful, however, as this is not checked).
   * Forbidden addition of wires Note that in this schema, the third case is valid if edges of the wire W are declared internal to the face. As a result, these edges are no longer bounds of the face.
   * A default tolerance (`Precision::Confusion()`) is given to the face, this tolerance may be increased during construction of the face using various algorithms. Rules applied to the arguments For the surface:
   * - The surface must not be a 'null handle'.
   * - If the surface is a trimmed surface, the basis surface is used.
   * - For the wire: the wire is composed of connected edges, each edge having a parametric curve description in the parametric domain of the surface; in other words, as a pcurve. For the parameters:
   * - The parameter values must be in the parametric range of the surface (or the basis surface, if the surface is trimmed). If this condition is not satisfied, the face is not built, and the Error function will return BRepBuilderAPI_ParametersOutOfRange.
   * - The bounding parameters p1 and p2 are adjusted on a periodic surface in a given parametric direction by adding or subtracting the period to obtain p1 in the parametric range of the surface and such p2, that p2 - p1 <= Period, where Period is the period of the surface in this parametric direction.
   * - A parameter value may be infinite. There will be no edge and no vertex in the corresponding direction.
   */
  constructor(F: TopoDS_Face, W: unknown);
  /**
   * Make a face from a plane and a wire.
   */
  constructor(P: gp_Pln, W: unknown, Inside?: boolean);
  /**
   * Make a face from a cylinder and a wire.
   */
  constructor(C: gp_Cylinder, W: unknown, Inside?: boolean);
  /**
   * Make a face from a cone and a wire.
   */
  constructor(C: unknown, W: unknown, Inside?: boolean);
  /**
   * Make a face from a sphere and a wire.
   */
  constructor(S: unknown, W: unknown, Inside?: boolean);
  /**
   * Make a face from a torus and a wire.
   */
  constructor(C: unknown, W: unknown, Inside?: boolean);
  /**
   * Make a face from a Surface and a wire. If the surface S is not plane, it must contain pcurves for all edges in W, otherwise the wrong shape will be created.
   */
  constructor(S: unknown, W: unknown, Inside?: boolean);
  /**
   * Make a face from a plane.
   */
  constructor(P: gp_Pln, UMin: number, UMax: number, VMin: number, VMax: number);
  /**
   * Make a face from a cylinder.
   */
  constructor(C: gp_Cylinder, UMin: number, UMax: number, VMin: number, VMax: number);
  /**
   * Make a face from a cone.
   */
  constructor(C: unknown, UMin: number, UMax: number, VMin: number, VMax: number);
  /**
   * Make a face from a sphere.
   */
  constructor(S: unknown, UMin: number, UMax: number, VMin: number, VMax: number);
  /**
   * Make a face from a torus.
   */
  constructor(C: unknown, UMin: number, UMax: number, VMin: number, VMax: number);
  /**
   * Make a face from a Surface. Accepts tolerance value (TolDegen) for resolution of degenerated edges.
   */
  constructor(S: unknown, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number);
  /**
   * Initializes (or reinitializes) the construction of a face by creating a new object which is a copy of the face F, in order to add wires to it, using the function Add. Note: this complete copy of the geometry is only required if you want to work on the geometries of the two faces independently.
   */
  Init(F: TopoDS_Face): void;
  /**
   * Initializes (or reinitializes) the construction of a face on the surface S. If Bound is true, a wire is automatically created from the natural bounds of the surface S and added to the face in order to bound it. If Bound is false, no wire is added. This option is used when real bounds are known. These will be added to the face after this initialization, using the function Add. TolDegen parameter is used for resolution of degenerated edges if calculation of natural bounds is turned on.
   */
  Init(S: unknown, Bound: boolean, TolDegen: number): void;
  /**
   * Initializes (or reinitializes) the construction of a face on the surface S, limited in the u parametric direction by the two parameter values UMin and UMax and in the v parametric direction by the two parameter values VMin and VMax. Warning Error returns:
   *
   * - BRepBuilderAPI_ParametersOutOfRange when the parameters given are outside the bounds of the surface or the basis surface of a trimmed surface. TolDegen parameter is used for resolution of degenerated edges.
   */
  Init(S: unknown, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
  /**
   * Adds the wire W to the constructed face as a hole. Warning W must not cross the other bounds of the face, and all the bounds must define only one area on the surface. (Be careful, however, as this is not checked.) Example // a cylinder {@link gp_Cylinder | `gp_Cylinder`} C = ..; // a wire {@link TopoDS_Wire | `TopoDS_Wire`} W = ...; {@link BRepBuilderAPI_MakeFace | `BRepBuilderAPI_MakeFace`} MF(C); MF.Add(W); {@link TopoDS_Face | `TopoDS_Face`} F = MF;.
   */
  Add(W: unknown): void;
  /**
   * Returns true if this algorithm has a valid face.
   */
  IsDone(): boolean;
  /**
   * Returns the construction status BRepBuilderAPI_FaceDone if the face is built, or.
   *
   * - another value of the BRepBuilderAPI_FaceError enumeration indicating why the construction failed, in particular when the given parameters are outside the bounds of the surface.
   */
  Error(): unknown;
  /**
   * Returns the constructed face. Exceptions StdFail_NotDone if no face is built.
   */
  Face(): TopoDS_Face;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes functions to build a solid from shells. A solid is made of one shell, or a series of shells, which do not intersect each other. One of these shells constitutes the outside skin of the solid. It may be closed (a finite solid) or open (an infinite solid). Other shells form hollows (cavities) in these previous ones. Each must bound a closed volume. A MakeSolid object provides a framework for:
 *
 * - defining and implementing the construction of a solid, and
 * - consulting the result.
 */
export declare class BRepBuilderAPI_MakeSolid {
  /**
   * Initializes the construction of a solid. An empty solid is considered to cover the whole space. The Add function is used to define shells to bound it.
   */
  constructor();
  /**
   * Make a solid from a CompSolid.
   */
  constructor(S: unknown);
  /**
   * Make a solid from a shell.
   */
  constructor(S: TopoDS_Shell);
  /**
   * Make a solid from a solid. useful for adding later.
   */
  constructor(So: TopoDS_Solid);
  /**
   * Make a solid from two shells.
   */
  constructor(S1: TopoDS_Shell, S2: TopoDS_Shell);
  /**
   * Add a shell to a solid.
   *
   * Constructs a solid:
   *
   * - from the solid So, to which shells can be added, or
   * - by adding the shell S to the solid So. Warning No check is done to verify the conditions of coherence of the resulting solid. In particular S must not intersect the solid S0. Besides, after all shells have been added using the Add function, one of these shells should constitute the outside skin of the solid. It may be closed (a finite solid) or open (an infinite solid). Other shells form hollows (cavities) in the previous ones. Each must bound a closed volume.
   */
  constructor(So: TopoDS_Solid, S: TopoDS_Shell);
  /**
   * Make a solid from three shells. Constructs a solid.
   *
   * - covering the whole space, or
   * - from shell S, or
   * - from two shells S1 and S2, or
   * - from three shells S1, S2 and S3, or Warning No check is done to verify the conditions of coherence of the resulting solid. In particular, S1, S2 (and S3) must not intersect each other. Besides, after all shells have been added using the Add function, one of these shells should constitute the outside skin of the solid; it may be closed (a finite solid) or open (an infinite solid). Other shells form hollows (cavities) in these previous ones. Each must bound a closed volume.
   */
  constructor(S1: TopoDS_Shell, S2: TopoDS_Shell, S3: TopoDS_Shell);
  /**
   * Adds the shell to the current solid. Warning No check is done to verify the conditions of coherence of the resulting solid. In particular, S must not intersect other shells of the solid under construction. Besides, after all shells have been added, one of these shells should constitute the outside skin of the solid. It may be closed (a finite solid) or open (an infinite solid). Other shells form hollows (cavities) in these previous ones. Each must bound a closed volume.
   */
  Add(S: TopoDS_Shell): void;
  /**
   * Returns true if the solid is built. For this class, a solid under construction is always valid. If no shell has been added, it could be a whole-space solid. However, no check was done to verify the conditions of coherence of the resulting solid.
   */
  IsDone(): boolean;
  /**
   * Returns the new Solid.
   */
  Solid(): TopoDS_Solid;
  /**
   * Returns true if the shape S has been deleted.
   */
  IsDeleted(S: TopoDS_Shape): boolean;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Describes functions to build polygonal wires. A polygonal wire can be built from any number of points or vertices, and consists of a sequence of connected rectilinear edges. When a point or vertex is added to the polygon if it is identic to the previous point no edge is built. The method added can be used to test it. Construction of a Polygonal Wire You can construct:
 *
 * - a complete polygonal wire by defining all its points or vertices (limited to four), or
 * - an empty polygonal wire and add its points or vertices in sequence (unlimited number). A MakePolygon object provides a framework for:
 * - initializing the construction of a polygonal wire,
 * - adding points or vertices to the polygonal wire under construction, and
 * - consulting the result.
 */
export declare class BRepBuilderAPI_MakePolygon {
  /**
   * Initializes an empty polygonal wire, to which points or vertices are added using the Add function. As soon as the polygonal wire under construction contains vertices, it can be consulted using the Wire function.
   */
  constructor();
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(V1: unknown, V2: unknown);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, Close?: boolean);
  constructor(V1: unknown, V2: unknown, V3: unknown, Close?: boolean);
  /**
   * Constructs a polygonal wire from 2, 3 or 4 points. Vertices are automatically created on the given points. The polygonal wire is closed if Close is true; otherwise it is open. Further vertices can be added using the Add function. The polygonal wire under construction can be consulted at any time by using the Wire function. Example //an open polygon from four points {@link TopoDS_Wire | `TopoDS_Wire`} W = `BRepBuilderAPI_MakePolygon(P1,P2,P3,P4)`; Warning: The process is equivalent to:
   *
   * - initializing an empty polygonal wire,
   * - and adding the given points in sequence. Consequently, be careful when using this function: if the sequence of points p1 - p2 - p1 is found among the arguments of the constructor, you will create a polygonal wire with two consecutive coincident edges.
   */
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, P4: gp_Pnt, Close?: boolean);
  /**
   * Constructs a polygonal wire from 2, 3 or 4 vertices. The polygonal wire is closed if Close is true; otherwise it is open (default value). Further vertices can be added using the Add function. The polygonal wire under construction can be consulted at any time by using the Wire function. Example //a closed triangle from three vertices {@link TopoDS_Wire | `TopoDS_Wire`} W = `BRepBuilderAPI_MakePolygon(V1,V2,V3,true)`; Warning The process is equivalent to:
   *
   * - initializing an empty polygonal wire,
   * - then adding the given points in sequence. So be careful, as when using this function, you could create a polygonal wire with two consecutive coincident edges if the sequence of vertices v1 - v2 - v1 is found among the constructor's arguments.
   */
  constructor(V1: unknown, V2: unknown, V3: unknown, V4: unknown, Close?: boolean);
  Add(P: gp_Pnt): void;
  /**
   * Adds the point P or the vertex V at the end of the polygonal wire under construction. A vertex is automatically created on the point P. Warning.
   *
   * - When P or V is coincident to the previous vertex, no edge is built. The method Added can be used to test for this. Neither P nor V is checked to verify that it is coincident with another vertex than the last one, of the polygonal wire under construction. It is also possible to add vertices on a closed polygon (built for example by using a constructor which declares the polygon closed, or after the use of the Close function). Consequently, be careful using this function: you might create:
   * - a polygonal wire with two consecutive coincident edges, or
   * - a non manifold polygonal wire.
   * - P or V is not checked to verify if it is coincident with another vertex but the last one, of the polygonal wire under construction. It is also possible to add vertices on a closed polygon (built for example by using a constructor which declares the polygon closed, or after the use of the Close function). Consequently, be careful when using this function: you might create:
   * - a polygonal wire with two consecutive coincident edges, or
   * - a non-manifold polygonal wire.
   */
  Add(V: unknown): void;
  /**
   * Returns true if the last vertex added to the constructed polygonal wire is not coincident with the previous one.
   */
  Added(): boolean;
  /**
   * Closes the polygonal wire under construction. Note - this is equivalent to adding the first vertex to the polygonal wire under construction.
   */
  Close(): void;
  FirstVertex(): unknown;
  /**
   * Returns the first or the last vertex of the polygonal wire under construction. If the constructed polygonal wire is closed, the first and the last vertices are identical.
   */
  LastVertex(): unknown;
  /**
   * Returns true if this algorithm contains a valid polygonal wire (i.e. if there is at least one edge). IsDone returns false if fewer than two vertices have been chained together by this construction algorithm.
   */
  IsDone(): boolean;
  /**
   * Returns the edge built between the last two points or vertices added to the constructed polygonal wire under construction. Warning If there is only one vertex in the polygonal wire, the result is a null edge.
   */
  Edge(): unknown;
  /**
   * Returns the constructed polygonal wire, or the already built part of the polygonal wire under construction. Exceptions StdFail_NotDone if the wire is not built, i.e. if fewer than two vertices have been chained together by this construction algorithm.
   */
  Wire(): unknown;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Reads STEP files, checks them and translates their contents into Open CASCADE models. The STEP data can be that of a whole model or that of a specific list of entities in the model. As in {@link XSControl_Reader | `XSControl_Reader`}, you specify the list using a selection.
 * For the translation of iges files it is possible to use next sequence: To change translation parameters class {@link Interface_Static | `Interface_Static`} should be used before beginning of translation (see STEP Parameters and General Parameters) Creation of reader - {@link STEPControl_Reader | `STEPControl_Reader`} reader; To load s file in a model use method reader.ReadFile("filename.stp") To print load results reader.PrintCheckLoad(failsonly,mode) where mode is equal to the value of enumeration IFSelect_PrintCount For definition number of candidates : int nbroots = reader. `NbRootsForTransfer()`; To transfer entities from a model the following methods can be used: for the whole model - reader.TransferRoots(); to transfer a list of entities: reader.TransferList(list); to transfer one entity `occ::handle<Standard_Transient>` ent = reader.RootForTransfer(num); reader.TransferEntity(ent), or reader.TransferOneRoot(num), or reader.TransferOne(num), or reader.TransferRoot(num) To obtain
 * the result the following method can be used: reader.NbShapes() and reader.Shape(num); or reader.OneShape(); To print the results of transfer use method: reader.PrintCheckTransfer(failwarn,mode); where printfail is equal to the value of enumeration IFSelect_PrintFail, mode see above; or reader.PrintStatsTransfer(); Gets correspondence between a STEP entity and a result shape obtained from it. `occ::handle<XSControl_WorkSession>` WS = reader.WS(); if ( WS->TransferReader()->HasResult(ent) ) {@link TopoDS_Shape | `TopoDS_Shape`} shape = WS->TransferReader()->ShapeResult(ent);.
 */
export declare class STEPControl_Reader {
  /**
   * Creates a reader object with an empty STEP model.
   */
  constructor();
  /**
   * Creates a Reader for STEP from an already existing Session Clears the session if it was not yet set for STEP.
   */
  constructor(WS: unknown, scratch?: boolean);
  // dropped: ReadFile param 1 resolves to excluded type DESTEP_Parameters
  // dropped: GetDefaultShapeFixParameters return resolves to excluded type DE_ShapeFixParameters
  /**
   * Returns the model as a StepModel. It can then be consulted (header, product)
   */
  StepModel(): unknown;
  /**
   * Loads a file and returns the read status Zero for a Model which compies with the Controller.
   */
  ReadFile(filename: string): IFSelect_ReturnStatus;
  /**
   * Transfers a root given its rank in the list of candidate roots Default is the first one Returns True if a shape has resulted, false else Same as inherited TransferOneRoot, kept for compatibility.
   */
  TransferRoot(num?: number, theProgress?: Message_ProgressRange): boolean;
  /**
   * Determines the list of root entities from Model which are candidate for a transfer to a Shape (type of entities is PRODUCT)
   */
  NbRootsForTransfer(): number;
  /**
   * Returns sequence of all unit names for shape representations found in file.
   * @param theUnitLengthNames Mutated in place; read the updated value from this argument after the call.
   * @param theUnitAngleNames Mutated in place; read the updated value from this argument after the call.
   * @param theUnitSolidAngleNames Mutated in place; read the updated value from this argument after the call.
   */
  FileUnits(
    theUnitLengthNames: NCollection_Sequence_TCollection_AsciiString,
    theUnitAngleNames: NCollection_Sequence_TCollection_AsciiString,
    theUnitSolidAngleNames: NCollection_Sequence_TCollection_AsciiString,
  ): void;
  /**
   * Sets system length unit used by transfer process. Performs only if a model is not NULL.
   */
  SetSystemLengthUnit(theLengthUnit: number): void;
  /**
   * Returns system length unit used by transfer process. Performs only if a model is not NULL.
   */
  SystemLengthUnit(): number;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}

export type IFSelect_ReturnStatus = (typeof IFSelect_ReturnStatus)[keyof typeof IFSelect_ReturnStatus];
/**
 * Qualifies an execution status : RetVoid : normal execution which created nothing, or no data to process RetDone : normal execution with a result RetError : error in command or input data, no execution RetFail : execution was run and has failed RetStop : indicates end or stop (such as Raise)
 */
export declare const IFSelect_ReturnStatus: {
  readonly IFSelect_RetVoid: 'IFSelect_RetVoid';
  readonly IFSelect_RetDone: 'IFSelect_RetDone';
  readonly IFSelect_RetError: 'IFSelect_RetError';
  readonly IFSelect_RetFail: 'IFSelect_RetFail';
  readonly IFSelect_RetStop: 'IFSelect_RetStop';
};

/**
 * Indexed map of ASCII string key-value pairs.
 *
 * Used for metadata exchange in data export operations
 * (e.g. GLTF writer metadata passed to `RWGltf_CafWriter.Perform`).
 */
export declare class TColStd_IndexedDataMapOfStringString {
  constructor();
  /** Release the underlying C++ object to prevent memory leaks. */
  delete(): void;
  [Symbol.dispose](): void;
}

/**
 * Static helper for downcasting generic `TopoDS_Shape` to concrete topology subtypes.
 *
 * OCCT shapes are polymorphic — `BRepAlgoAPI_Fuse.Shape()` returns `TopoDS_Shape`,
 * but algorithms like `BRepFilletAPI_MakeFillet` require `TopoDS_Edge` or `TopoDS_Face`.
 * Use these static casts after verifying the shape type via `TopExp_Explorer`.
 */
export declare class TopoDS {
  /**
   * Downcast a generic shape to an edge.
   *
   * @param shape - The shape to cast (must have `ShapeType() === TopAbs_EDGE`).
   * @returns The same shape typed as `TopoDS_Edge`.
   */
  static Edge(shape: TopoDS_Shape): unknown;
  /**
   * Downcast a generic shape to a wire.
   *
   * @param shape - The shape to cast (must have `ShapeType() === TopAbs_WIRE`).
   * @returns The same shape typed as `TopoDS_Wire`.
   */
  static Wire(shape: TopoDS_Shape): unknown;
  /**
   * Downcast a generic shape to a face.
   *
   * @param shape - The shape to cast (must have `ShapeType() === TopAbs_FACE`).
   * @returns The same shape typed as `TopoDS_Face`.
   */
  static Face(shape: TopoDS_Shape): TopoDS_Face;
  /**
   * Downcast a generic shape to a vertex.
   *
   * @param shape - The shape to cast (must have `ShapeType() === TopAbs_VERTEX`).
   * @returns The same shape typed as `TopoDS_Vertex`.
   */
  static Vertex(shape: TopoDS_Shape): unknown;
  /**
   * Downcast a generic shape to a shell.
   *
   * @param shape - The shape to cast (must have `ShapeType() === TopAbs_SHELL`).
   * @returns The same shape typed as `TopoDS_Shell`.
   */
  static Shell(shape: TopoDS_Shape): TopoDS_Shell;
  /**
   * Downcast a generic shape to a solid.
   *
   * @param shape - The shape to cast (must have `ShapeType() === TopAbs_SOLID`).
   * @returns The same shape typed as `TopoDS_Solid`.
   */
  static Solid(shape: TopoDS_Shape): TopoDS_Solid;
  /**
   * Downcast a generic shape to a compound.
   *
   * @param shape - The shape to cast (must have `ShapeType() === TopAbs_COMPOUND`).
   * @returns The same shape typed as `TopoDS_Compound`.
   */
  static Compound(shape: TopoDS_Shape): unknown;
}

/**
 * OpenCascade.js runtime helpers for exception introspection.
 *
 * Provides access to OCCT exception data when exception handling is enabled
 * (`-fexceptions` / `-sDISABLE_EXCEPTION_CATCHING=0`).
 */
export declare class OCJS {
  /**
   * Extract the `Standard_Failure` data from a caught Emscripten exception pointer.
   *
   * @param exceptionPtr - The raw exception pointer from the Emscripten catch block.
   * @returns The OCCT failure object containing the exception type and message.
   */
  static getStandard_FailureData(exceptionPtr: number): unknown;
  /**
   * Whether this WASM build was compiled with exception handling enabled.
   *
   * @returns `true` if `-fexceptions` / `-sDISABLE_EXCEPTION_CATCHING=0` was used.
   */
  static exceptionsEnabled(): boolean;
  /** Release the underlying C++ object to prevent memory leaks. */
  delete(): void;
  [Symbol.dispose](): void;
}

/** OCCT boolean primitive, mapped to JS `boolean`. */
type Standard_Boolean = boolean;
/** OCCT unsigned byte primitive (0–255), mapped to JS `number`. */
type Standard_Byte = number;
/** OCCT single character, mapped to JS `string`. */
type Standard_Character = string;
/** OCCT null-terminated C string, mapped to JS `string`. */
type Standard_CString = string;
/** OCCT signed integer primitive, mapped to JS `number`. */
type Standard_Integer = number;
/** OCCT double-precision floating-point primitive, mapped to JS `number`. */
type Standard_Real = number;
/** OCCT single-precision floating-point primitive, mapped to JS `number`. */
type Standard_ShortReal = number;
/** OCCT unsigned size/count primitive, mapped to JS `number`. */
type Standard_Size = number;

/**
 * Emscripten virtual filesystem.
 *
 * Provides POSIX-like file operations on the in-memory filesystem backing the
 * WASM module. Use this to load CAD files (STEP, IGES, BREP) into the WASM heap
 * before processing, and to retrieve output files after export.
 *
 * @see {@link https://emscripten.org/docs/api_reference/Filesystem-API.html | Emscripten FS API}
 */
export declare namespace FS {
  /** Result of a path lookup containing the resolved node. */
  interface Lookup {
    path: string;
    node: unknown;
  }

  /** Opaque handle to an open file stream. */
  type FSStream = unknown;
  /** Opaque handle to a filesystem node (file, directory, or device). */
  type FSNode = unknown;
  /** Error thrown by FS operations with an Emscripten errno code. */
  type ErrnoError = unknown;

  /** When `true`, permission checks are bypassed for all FS operations. */
  let ignorePermissions: boolean;
  let trackingDelegate: any;
  let tracking: any;
  let genericErrors: any;

  /**
   * Resolve a path to its filesystem node, optionally following symlinks.
   *
   * @param path - The absolute or relative path to resolve.
   * @param opts - Lookup options (e.g. `{ follow: true }`).
   * @returns The resolved path and filesystem node.
   */
  function lookupPath(path: string, opts: any): unknown;
  /**
   * Get the absolute path for a filesystem node.
   *
   * @param node - The filesystem node.
   * @returns The absolute path string.
   */
  function getPath(node: unknown): string;

  /**
   * Check whether the mode bits indicate a regular file.
   *
   * @param mode - The st_mode value from `stat`.
   * @returns `true` if the mode represents a regular file.
   */
  function isFile(mode: number): boolean;
  /**
   * Check whether the mode bits indicate a directory.
   *
   * @param mode - The st_mode value from `stat`.
   * @returns `true` if the mode represents a directory.
   */
  function isDir(mode: number): boolean;
  /**
   * Check whether the mode bits indicate a symbolic link.
   *
   * @param mode - The st_mode value from `stat`.
   * @returns `true` if the mode represents a symbolic link.
   */
  function isLink(mode: number): boolean;
  /**
   * Check whether the mode bits indicate a character device.
   *
   * @param mode - The st_mode value from `stat`.
   * @returns `true` if the mode represents a character device.
   */
  function isChrdev(mode: number): boolean;
  /**
   * Check whether the mode bits indicate a block device.
   *
   * @param mode - The st_mode value from `stat`.
   * @returns `true` if the mode represents a block device.
   */
  function isBlkdev(mode: number): boolean;
  /**
   * Check whether the mode bits indicate a FIFO (named pipe).
   *
   * @param mode - The st_mode value from `stat`.
   * @returns `true` if the mode represents a FIFO.
   */
  function isFIFO(mode: number): boolean;
  /**
   * Check whether the mode bits indicate a socket.
   *
   * @param mode - The st_mode value from `stat`.
   * @returns `true` if the mode represents a socket.
   */
  function isSocket(mode: number): boolean;

  /**
   * Extract the major device number from a device identifier.
   *
   * @param dev - The combined device identifier.
   * @returns The major device number.
   */
  function major(dev: number): number;
  /**
   * Extract the minor device number from a device identifier.
   *
   * @param dev - The combined device identifier.
   * @returns The minor device number.
   */
  function minor(dev: number): number;
  /**
   * Combine major and minor numbers into a device identifier.
   *
   * @param ma - The major device number.
   * @param mi - The minor device number.
   * @returns The combined device identifier.
   */
  function makedev(ma: number, mi: number): number;
  /**
   * Register a device driver for the given device identifier.
   *
   * @param dev - The combined device identifier.
   * @param ops - Device operation callbacks (read, write, etc.).
   */
  function registerDevice(dev: number, ops: any): void;

  /**
   * Persist or restore the virtual filesystem to/from a backing store.
   *
   * @param populate - When `true`, loads data from the backing store into memory;
   *   when `false`, writes in-memory data to the backing store.
   * @param callback - Called on completion with an optional error.
   */
  function syncfs(populate: boolean, callback: (e: any) => any): void;
  /**
   * Persist or restore the virtual filesystem (callback-first overload).
   *
   * @param callback - Called on completion with an optional error.
   * @param populate - When `true`, loads from backing store (defaults to `false`).
   */
  function syncfs(callback: (e: any) => any, populate?: boolean): void;
  /**
   * Mount a filesystem type at the given mountpoint.
   *
   * @param type - The filesystem type (e.g. `MEMFS`, `IDBFS`).
   * @param opts - Mount options passed to the filesystem driver.
   * @param mountpoint - The path at which to mount.
   * @returns The mount record.
   */
  function mount(type: any, opts: any, mountpoint: string): any;
  /**
   * Unmount the filesystem at the given mountpoint.
   *
   * @param mountpoint - The path to unmount.
   */
  function unmount(mountpoint: string): void;

  /**
   * Create a directory in the virtual filesystem.
   *
   * @param path - The directory path to create.
   * @param mode - Optional POSIX permission bits (default `0o777`).
   * @returns The created directory node.
   */
  function mkdir(path: string, mode?: number): any;
  /**
   * Create a device node in the virtual filesystem.
   *
   * @param path - The path for the device node.
   * @param mode - Optional POSIX permission bits.
   * @param dev - Optional device identifier (from `makedev`).
   * @returns The created device node.
   */
  function mkdev(path: string, mode?: number, dev?: number): any;
  /**
   * Create a symbolic link.
   *
   * @param oldpath - The target path the symlink points to.
   * @param newpath - The path of the symlink itself.
   * @returns The created symlink node.
   */
  function symlink(oldpath: string, newpath: string): any;
  /**
   * Rename (move) a file or directory.
   *
   * @param old_path - The current path.
   * @param new_path - The new path.
   */
  function rename(old_path: string, new_path: string): void;
  /**
   * Remove an empty directory.
   *
   * @param path - The directory to remove.
   */
  function rmdir(path: string): void;
  /**
   * List entries in a directory.
   *
   * @param path - The directory path.
   * @returns Array of entry names (including `.` and `..`).
   */
  function readdir(path: string): any;
  /**
   * Remove a file.
   *
   * @param path - The file to remove.
   */
  function unlink(path: string): void;
  /**
   * Read the target of a symbolic link.
   *
   * @param path - The symlink path.
   * @returns The target path the symlink points to.
   */
  function readlink(path: string): string;
  /**
   * Get file status (size, mode, timestamps, etc.).
   *
   * @param path - The file path.
   * @param dontFollow - When `true`, returns the symlink's own status instead of the target's.
   * @returns An object with POSIX stat fields.
   */
  function stat(path: string, dontFollow?: boolean): any;
  /**
   * Like `stat`, but always returns the symlink's own status.
   *
   * @param path - The file path.
   * @returns An object with POSIX stat fields.
   */
  function lstat(path: string): any;
  /**
   * Change file permission bits.
   *
   * @param path - The file path.
   * @param mode - The new POSIX permission bits.
   * @param dontFollow - When `true`, changes the symlink itself rather than its target.
   */
  function chmod(path: string, mode: number, dontFollow?: boolean): void;
  /**
   * Change permission bits of a symbolic link itself.
   *
   * @param path - The symlink path.
   * @param mode - The new POSIX permission bits.
   */
  function lchmod(path: string, mode: number): void;
  /**
   * Change permission bits of an open file descriptor.
   *
   * @param fd - The file descriptor.
   * @param mode - The new POSIX permission bits.
   */
  function fchmod(fd: number, mode: number): void;
  /**
   * Change file ownership.
   *
   * @param path - The file path.
   * @param uid - The new user ID.
   * @param gid - The new group ID.
   * @param dontFollow - When `true`, changes the symlink itself rather than its target.
   */
  function chown(path: string, uid: number, gid: number, dontFollow?: boolean): void;
  /**
   * Change ownership of a symbolic link itself.
   *
   * @param path - The symlink path.
   * @param uid - The new user ID.
   * @param gid - The new group ID.
   */
  function lchown(path: string, uid: number, gid: number): void;
  /**
   * Change ownership of an open file descriptor.
   *
   * @param fd - The file descriptor.
   * @param uid - The new user ID.
   * @param gid - The new group ID.
   */
  function fchown(fd: number, uid: number, gid: number): void;
  /**
   * Truncate a file to a specified length.
   *
   * @param path - The file path.
   * @param len - The new length in bytes.
   */
  function truncate(path: string, len: number): void;
  /**
   * Truncate an open file descriptor to a specified length.
   *
   * @param fd - The file descriptor.
   * @param len - The new length in bytes.
   */
  function ftruncate(fd: number, len: number): void;
  /**
   * Update access and modification timestamps of a file.
   *
   * @param path - The file path.
   * @param atime - The new access time (seconds since epoch).
   * @param mtime - The new modification time (seconds since epoch).
   */
  function utime(path: string, atime: number, mtime: number): void;
  /**
   * Open a file and return a stream handle.
   *
   * @param path - The file path.
   * @param flags - POSIX open flags as a string (e.g. `'r'`, `'w'`, `'a'`).
   * @param mode - Optional permission bits for newly created files.
   * @param fd_start - Optional starting file descriptor number.
   * @param fd_end - Optional ending file descriptor number.
   * @returns The opened file stream.
   */
  function open(path: string, flags: string, mode?: number, fd_start?: number, fd_end?: number): unknown;
  /**
   * Close an open file stream.
   *
   * @param stream - The stream to close.
   */
  function close(stream: unknown): void;
  /**
   * Reposition the read/write offset of a stream.
   *
   * @param stream - The open file stream.
   * @param offset - The byte offset.
   * @param whence - The reference point (`0` = start, `1` = current, `2` = end).
   * @returns The resulting absolute offset.
   */
  function llseek(stream: unknown, offset: number, whence: number): any;
  /**
   * Read bytes from a stream into a buffer.
   *
   * @param stream - The open file stream.
   * @param buffer - The destination buffer.
   * @param offset - The byte offset within `buffer` to start writing.
   * @param length - Maximum number of bytes to read.
   * @param position - Optional absolute file offset to read from.
   * @returns The number of bytes actually read.
   */
  function read(stream: unknown, buffer: ArrayBufferView, offset: number, length: number, position?: number): number;
  /**
   * Write bytes from a buffer to a stream.
   *
   * @param stream - The open file stream.
   * @param buffer - The source buffer.
   * @param offset - The byte offset within `buffer` to start reading.
   * @param length - Number of bytes to write.
   * @param position - Optional absolute file offset to write at.
   * @param canOwn - When `true`, Emscripten may take ownership of the buffer.
   * @returns The number of bytes actually written.
   */
  function write(
    stream: unknown,
    buffer: ArrayBufferView,
    offset: number,
    length: number,
    position?: number,
    canOwn?: boolean,
  ): number;
  /**
   * Pre-allocate storage for a file region.
   *
   * @param stream - The open file stream.
   * @param offset - Starting byte offset.
   * @param length - Number of bytes to allocate.
   */
  function allocate(stream: unknown, offset: number, length: number): void;
  /**
   * Memory-map a region of a file.
   *
   * @param stream - The open file stream.
   * @param buffer - The target buffer view.
   * @param offset - Byte offset in the buffer.
   * @param length - Length of the mapping in bytes.
   * @param position - Byte offset in the file.
   * @param prot - Memory protection flags.
   * @param flags - Mapping flags.
   * @returns The mapped memory region.
   */
  function mmap(
    stream: unknown,
    buffer: ArrayBufferView,
    offset: number,
    length: number,
    position: number,
    prot: number,
    flags: number,
  ): any;
  /**
   * Perform a device-specific I/O control operation.
   *
   * @param stream - The open file stream.
   * @param cmd - The ioctl command.
   * @param arg - The command argument.
   * @returns The ioctl result.
   */
  function ioctl(stream: unknown, cmd: any, arg: any): any;
  /**
   * Read an entire file as a `Uint8Array` (binary mode).
   *
   * @param path - The file path.
   * @param opts - Options with `encoding: 'binary'`.
   * @returns The file contents as raw bytes.
   */
  function readFile(path: string, opts: { encoding: 'binary'; flags?: string }): Uint8Array;
  /**
   * Read an entire file as a UTF-8 string.
   *
   * @param path - The file path.
   * @param opts - Options with `encoding: 'utf8'`.
   * @returns The file contents as a string.
   */
  function readFile(path: string, opts: { encoding: 'utf8'; flags?: string }): string;
  /**
   * Read an entire file (defaults to binary `Uint8Array`).
   *
   * @param path - The file path.
   * @param opts - Optional flags.
   * @returns The file contents as raw bytes.
   */
  function readFile(path: string, opts?: { flags?: string }): Uint8Array;
  /**
   * Write data to a file, creating it if it does not exist.
   *
   * @param path - The file path.
   * @param data - The content to write (string or binary buffer).
   * @param opts - Optional flags.
   */
  function writeFile(path: string, data: string | ArrayBufferView, opts?: { flags?: string }): void;

  /**
   * Get the current working directory.
   *
   * @returns The absolute path of the current working directory.
   */
  function cwd(): string;
  /**
   * Change the current working directory.
   *
   * @param path - The directory to switch to.
   */
  function chdir(path: string): void;
  /**
   * Initialize the standard I/O streams (stdin, stdout, stderr).
   *
   * @param input - Callback supplying characters for stdin, or `null` for default.
   * @param output - Callback receiving characters from stdout, or `null` for default.
   * @param error - Callback receiving characters from stderr, or `null` for default.
   */
  function init(
    input: null | (() => number | null),
    output: null | ((c: number) => any),
    error: null | ((c: number) => any),
  ): void;

  /**
   * Create a file that is lazily fetched from a URL on first read.
   *
   * @param parent - The parent directory path or node.
   * @param name - The filename.
   * @param url - The URL to fetch the content from.
   * @param canRead - Whether the file is readable.
   * @param canWrite - Whether the file is writable.
   * @returns The created filesystem node.
   */
  function createLazyFile(
    parent: string | FSNode,
    name: string,
    url: string,
    canRead: boolean,
    canWrite: boolean,
  ): unknown;
  /**
   * Create a file that is preloaded (fetched and stored) before the program runs.
   *
   * @param parent - The parent directory path or node.
   * @param name - The filename.
   * @param url - The URL to fetch the content from.
   * @param canRead - Whether the file is readable.
   * @param canWrite - Whether the file is writable.
   * @param onload - Optional callback on successful load.
   * @param onerror - Optional callback on load failure.
   * @param dontCreateFile - When `true`, skips creating the file node.
   * @param canOwn - When `true`, the runtime may take ownership of the data.
   */
  function createPreloadedFile(
    parent: string | FSNode,
    name: string,
    url: string,
    canRead: boolean,
    canWrite: boolean,
    onload?: () => void,
    onerror?: () => void,
    dontCreateFile?: boolean,
    canOwn?: boolean,
  ): void;
  /**
   * Create a file from in-memory data.
   *
   * @param parent - The parent directory path or node.
   * @param name - The filename.
   * @param data - The file contents.
   * @param canRead - Whether the file is readable.
   * @param canWrite - Whether the file is writable.
   * @param canOwn - When `true`, the runtime may take ownership of the data.
   * @returns The created filesystem node.
   */
  function createDataFile(
    parent: string | FSNode,
    name: string,
    data: ArrayBufferView | string,
    canRead: boolean,
    canWrite: boolean,
    canOwn: boolean,
  ): unknown;
  /** Result of analyzing a filesystem path for existence and parent resolution. */
  interface AnalysisResults {
    isRoot: boolean;
    exists: boolean;
    error: Error;
    name: string;
    path: any;
    object: any;
    parentExists: boolean;
    parentPath: any;
    parentObject: any;
  }
  /**
   * Analyze a path to determine existence, parent information, and errors.
   *
   * @param path - The path to analyze.
   * @returns Detailed information about the path's resolution.
   */
  function analyzePath(path: string): unknown;
}

/**
 * Emscripten WASM heap views.
 *
 * Typed array views into the WASM linear memory (`Module.buffer`). Each view
 * provides direct access to the heap at the corresponding element size and
 * signedness. Only available when listed in `-sEXPORTED_RUNTIME_METHODS`.
 *
 * **Important:** These views are invalidated when WASM memory grows
 * (`-sALLOW_MEMORY_GROWTH=1`). Do not cache references across calls that may
 * trigger allocation — re-read the property from the module instance instead.
 *
 * @see {@link https://emscripten.org/docs/api_reference/preamble.js.html#type-accessors-for-the-memory-model | Emscripten Heap Views}
 */

/** Signed 8-bit integer view of the WASM heap. */
export declare const HEAP8: Int8Array;
/** Unsigned 8-bit integer view of the WASM heap. */
export declare const HEAPU8: Uint8Array;
/** Signed 16-bit integer view of the WASM heap. */
export declare const HEAP16: Int16Array;
/** Unsigned 16-bit integer view of the WASM heap. */
export declare const HEAPU16: Uint16Array;
/** Signed 32-bit integer view of the WASM heap. */
export declare const HEAP32: Int32Array;
/** Unsigned 32-bit integer view of the WASM heap. */
export declare const HEAPU32: Uint32Array;
/** 32-bit floating-point view of the WASM heap. */
export declare const HEAPF32: Float32Array;
/** 64-bit floating-point view of the WASM heap. */
export declare const HEAPF64: Float64Array;

/**
 * Extract the exception type and message from a caught `WebAssembly.Exception`.
 *
 * Only available in builds compiled with `-fwasm-exceptions` (native WASM exception handling).
 *
 * @param ex - The caught `WebAssembly.Exception` object.
 * @returns A `[type, message]` tuple where `type` is the C++ exception class name
 *   (e.g. `'Standard_DomainError'`) and `message` is the exception text.
 */
export declare function getExceptionMessage(ex: WebAssembly.Exception): [string, string];
/**
 * Increment the reference count of a `WebAssembly.Exception` to prevent premature disposal.
 *
 * Call this when storing an exception reference beyond its catch scope.
 *
 * @param ex - The exception whose refcount to increment.
 */
export declare function incrementExceptionRefcount(ex: WebAssembly.Exception): void;
/**
 * Decrement the reference count of a `WebAssembly.Exception`, freeing it when count reaches zero.
 *
 * @param ex - The exception whose refcount to decrement.
 */
export declare function decrementExceptionRefcount(ex: WebAssembly.Exception): void;

/**
 * Union of the Emscripten runtime exports and all bound OCCT classes, enums, and functions.
 *
 * Returned by {@link init | `init`} after the WASM module is fully loaded. Access any
 * OCCT binding as a property (e.g. `oc.BRepPrimAPI_MakeBox`) and use
 * the Emscripten virtual filesystem (`oc.FS`) and WASM heap views (`oc.HEAP32`, `oc.HEAPF64`).
 */
export type OpenCascadeInstance = {
  /** Emscripten virtual filesystem for reading/writing files in the WASM heap. */
  FS: typeof FS;
  /** Signed 32-bit integer view of the WASM linear memory. Index by byte offset / 4. */
  HEAP32: typeof HEAP32;
  /** 64-bit floating-point view of the WASM linear memory. Index by byte offset / 8. */
  HEAPF64: typeof HEAPF64;
} & {
  BRep_Tool: typeof BRep_Tool;
  BRepTools: typeof BRepTools;
  TopoDS_Solid: typeof TopoDS_Solid;
  TopoDS_Shell: typeof TopoDS_Shell;
  TopoDS_Face: typeof TopoDS_Face;
  TopoDS_Shape: typeof TopoDS_Shape;
  BRepAdaptor_Surface: typeof BRepAdaptor_Surface;
  TopExp_Explorer: typeof TopExp_Explorer;
  TopAbs_Orientation: typeof TopAbs_Orientation;
  TopAbs_ShapeEnum: typeof TopAbs_ShapeEnum;
  GProp_GProps: typeof GProp_GProps;
  GeoSpecMeshOverlapResult: typeof GeoSpecMeshOverlapResult;
  GeoSpecNativeVec3: typeof GeoSpecNativeVec3;
  GeoSpecMeshDistanceStats: typeof GeoSpecMeshDistanceStats;
  NCollection_Array1_int: typeof NCollection_Array1_int;
  NCollection_Array1_gp_Pnt: typeof NCollection_Array1_gp_Pnt;
  NCollection_HSequence_handle_Standard_Transient: typeof NCollection_HSequence_handle_Standard_Transient;
  NCollection_Sequence_handle_Standard_Transient: typeof NCollection_Sequence_handle_Standard_Transient;
  GeoSpecMeshMetrics: typeof GeoSpecMeshMetrics;
  NCollection_HArray1_gp_Pnt: typeof NCollection_HArray1_gp_Pnt;
  NCollection_Array1_NCollection_Vec3_float: typeof NCollection_Array1_NCollection_Vec3_float;
  NCollection_Array1_gp_Pnt2d: typeof NCollection_Array1_gp_Pnt2d;
  NCollection_HArray1_float: typeof NCollection_HArray1_float;
  GeoSpecPoint: typeof GeoSpecPoint;
  GeoSpecStepReadResult: typeof GeoSpecStepReadResult;
  NCollection_List_TopoDS_Shape: typeof NCollection_List_TopoDS_Shape;
  NCollection_Array1_float: typeof NCollection_Array1_float;
  NCollection_Array1_double: typeof NCollection_Array1_double;
  NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher: typeof NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;
  NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_2: typeof NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_2;
  NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_3: typeof NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_3;
  NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_4: typeof NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_4;
  NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_5: typeof NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_5;
  NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_6: typeof NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_6;
  NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_7: typeof NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher_7;
  NCollection_HArray1_Poly_Triangle: typeof NCollection_HArray1_Poly_Triangle;
  NCollection_Array1_Poly_Triangle: typeof NCollection_Array1_Poly_Triangle;
  GeoSpecStepStreamReader: typeof GeoSpecStepStreamReader;
  NCollection_HArray1_gp_Pnt2d: typeof NCollection_HArray1_gp_Pnt2d;
  NCollection_HArray1_double: typeof NCollection_HArray1_double;
  NCollection_List_BRepCheck_Status: typeof NCollection_List_BRepCheck_Status;
  NCollection_Sequence_TCollection_AsciiString: typeof NCollection_Sequence_TCollection_AsciiString;
  NCollection_List_handle_Poly_Triangulation: typeof NCollection_List_handle_Poly_Triangulation;
  TopLoc_Location: typeof TopLoc_Location;
  GeomAbs_SurfaceType: typeof GeomAbs_SurfaceType;
  Poly_Triangulation: typeof Poly_Triangulation;
  Poly_Triangle: typeof Poly_Triangle;
  gp_Vec: typeof gp_Vec;
  gp_Cylinder: typeof gp_Cylinder;
  gp_Dir: typeof gp_Dir;
  gp_Dir_D: typeof gp_Dir_D;
  gp_Pln: typeof gp_Pln;
  gp_XYZ: typeof gp_XYZ;
  gp_Pnt: typeof gp_Pnt;
  Message_ProgressRange: typeof Message_ProgressRange;
  BRepAlgoAPI_Common: typeof BRepAlgoAPI_Common;
  BRepMesh_IncrementalMesh: typeof BRepMesh_IncrementalMesh;
  BRepCheck_Analyzer: typeof BRepCheck_Analyzer;
  BRepBndLib: typeof BRepBndLib;
  BRepGProp: typeof BRepGProp;
  BRepBuilderAPI_Sewing: typeof BRepBuilderAPI_Sewing;
  BRepBuilderAPI_MakeFace: typeof BRepBuilderAPI_MakeFace;
  BRepBuilderAPI_MakeSolid: typeof BRepBuilderAPI_MakeSolid;
  BRepBuilderAPI_MakePolygon: typeof BRepBuilderAPI_MakePolygon;
  STEPControl_Reader: typeof STEPControl_Reader;
  IFSelect_ReturnStatus: typeof IFSelect_ReturnStatus;
  TColStd_IndexedDataMapOfStringString: typeof TColStd_IndexedDataMapOfStringString;
  TopoDS: typeof TopoDS;
  OCJS: typeof OCJS;
  getExceptionMessage: typeof getExceptionMessage;
  incrementExceptionRefcount: typeof incrementExceptionRefcount;
  decrementExceptionRefcount: typeof decrementExceptionRefcount;
};

/**
 * Initialize the OpenCASCADE WASM module and return the fully populated instance.
 *
 * Downloads, compiles, and instantiates the WASM binary. The returned
 * `OpenCascadeInstance` provides access to all bound OCCT classes and the
 * Emscripten virtual filesystem.
 *
 * @param options - Emscripten module overrides (e.g. `locateFile`, `print`, `instantiateWasm`).
 * @returns The initialized instance with all OCCT bindings and the `FS` namespace.
 */
export default function init(options?: Record<string, unknown>): Promise<OpenCascadeInstance>;
