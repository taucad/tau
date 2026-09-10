# libcascade — BRepLib

9 top-level symbols. Signatures are verbatim typescript.

// The {@link BRepLib`BRepLib`} package provides general utilities for BRep
BRepLib: declare class BRepLib

constructor

// Computes the max distance between edge and its 2d representation on the face
static Precision(P: number): void;
static Precision(): number;
static Precision(P: number): void;
static Precision(): number;

// Sets the current plane to P
static Plane(P: Geom_Plane): void;
static Plane(): Geom_Plane;
static Plane(P: Geom_Plane): void;
static Plane(): Geom_Plane;

// checks if the Edge is same range IGNORING the same range flag of the edge Confusion argument is to compare real numbers idenpendently of any model space tolerance
static CheckSameRange(E: TopoDS_Edge, Confusion?: number): boolean;

// will make all the curve representation have the same range domain for the parameters
static SameRange(E: TopoDS_Edge, Tolerance?: number): void;

// Computes the 3d curve for the edge <E> if it does not exist
static BuildCurve3d(E: TopoDS_Edge, Tolerance?: number, Continuity?: GeomAbs_Shape, MaxDegree?: number, MaxSegment?: number): boolean;

// Computes the 3d curves for all the edges of return False if one of the computation failed
static BuildCurves3d(S: TopoDS_Shape, Tolerance: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegment: number): boolean;
static BuildCurves3d(S: TopoDS_Shape): boolean;
static BuildCurves3d(S: TopoDS_Shape, Tolerance: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegment: number): boolean;
static BuildCurves3d(S: TopoDS_Shape): boolean;

// Builds pcurve of edge on face if the surface is plane, and updates the edge
static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face): void;
static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face, bToUpdate?: boolean): { aC2D: Geom2d_Curve; bToUpdate: boolean; [Symbol.dispose](): void };
static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face): void;
static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face, bToUpdate?: boolean): { aC2D: Geom2d_Curve; bToUpdate: boolean; [Symbol.dispose](): void };

// Checks if the edge has a Tolerance smaller than MaxToleranceToCheck if so it will compute the radius of the cylindrical pipe surface that MinToleranceRequest is the minimum tolerance before it is useful to start testing
static UpdateEdgeTol(E: TopoDS_Edge, MinToleranceRequest: number, MaxToleranceToCheck: number): boolean;

// Checks all the edges of the shape whose Tolerance is smaller than MaxToleranceToCheck Returns True if at least one edge was updated MinToleranceRequest is the minimum tolerance before it is useful to start testing
static UpdateEdgeTolerance(S: TopoDS_Shape, MinToleranceRequest: number, MaxToleranceToCheck: number): boolean;

// Computes new 2d curve(s) for the edge <theEdge> to have the same parameter as the 3d curve
static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;
static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;
static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;
static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;

// Replaces tolerance of FACE EDGE VERTEX by the tolerance Max of their connected handling shapes
static UpdateTolerances(S: TopoDS_Shape, verifyFaceTolerance: boolean): void;
static UpdateTolerances(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, verifyFaceTolerance: boolean): void;
static UpdateTolerances(S: TopoDS_Shape, verifyFaceTolerance: boolean): void;
static UpdateTolerances(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, verifyFaceTolerance: boolean): void;

// Checks tolerances of edges (including inner points) and vertices of a shape and updates them to satisfy "SameParameter" condition
static UpdateInnerTolerances(S: TopoDS_Shape): void;

// Orients the solid forward and the shell with the orientation to have matter in the solid
static OrientClosedSolid(solid: TopoDS_Solid): boolean;
// solid: Mutated in place

// Returns the order of continuity between two faces connected by an edge
static ContinuityOfFaces(theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theAngleTol: number): GeomAbs_Shape;

// Encodes the Regularity of edges on a Shape
static EncodeRegularity(S: TopoDS_Shape, TolAng: number): void;
static EncodeRegularity(S: TopoDS_Shape, LE: NCollection_List_TopoDS_Shape, TolAng: number): void;
static EncodeRegularity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, TolAng: number): void;
static EncodeRegularity(S: TopoDS_Shape, TolAng: number): void;
static EncodeRegularity(S: TopoDS_Shape, LE: NCollection_List_TopoDS_Shape, TolAng: number): void;
static EncodeRegularity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, TolAng: number): void;
static EncodeRegularity(S: TopoDS_Shape, TolAng: number): void;
static EncodeRegularity(S: TopoDS_Shape, LE: NCollection_List_TopoDS_Shape, TolAng: number): void;
static EncodeRegularity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, TolAng: number): void;

// Sorts in LF the Faces of S on the complexity of their surfaces (Plane,Cylinder,Cone,Sphere,Torus,other)
static SortFaces(S: TopoDS_Shape, LF: NCollection_List_TopoDS_Shape): void;
// LF: Mutated in place

// Sorts in LF the Faces of S on the reverse complexity of their surfaces (other,Torus,Sphere,Cone,Cylinder,Plane)
static ReverseSortFaces(S: TopoDS_Shape, LF: NCollection_List_TopoDS_Shape): void;
// LF: Mutated in place

// Corrects the normals in {@link Poly_Triangulation`Poly_Triangulation`} of faces, in such way that normals at nodes lying along smooth edges have the same value on both adjacent triangulations
static EnsureNormalConsistency(S: TopoDS_Shape, theAngTol?: number, ForceComputeNormals?: boolean): boolean;

// Updates value of deflection in {@link Poly_Triangulation`Poly_Triangulation`} of faces by the maximum deviation measured on existing triangulation
static UpdateDeflection(S: TopoDS_Shape): void;

// Calculates the bounding sphere around the set of vertexes from the theLV list
static BoundingVertex(theLV: NCollection_List_TopoDS_Shape, theNewCenter: gp_Pnt, theNewTol?: number): { theNewTol: number };
// theNewCenter: Mutated in place

// For an edge defined by 3d curve and tolerance and vertices defined by points, parameters on curve and tolerances, finds a range of curve between vertices not covered by vertices tolerances
static FindValidRange(theCurve: Adaptor3d_Curve, theTolE: number, theParV1: number, thePntV1: gp_Pnt, theTolV1: number, theParV2: number, thePntV2: gp_Pnt, theTolV2: number, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };
static FindValidRange(theEdge: TopoDS_Edge, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };
static FindValidRange(theCurve: Adaptor3d_Curve, theTolE: number, theParV1: number, thePntV1: gp_Pnt, theTolV1: number, theParV2: number, thePntV2: gp_Pnt, theTolV2: number, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };
static FindValidRange(theEdge: TopoDS_Edge, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };

// Enlarges the face on the given value
static ExtendFace(theF: TopoDS_Face, theExtVal: number, theExtUMin: boolean, theExtUMax: boolean, theExtVMin: boolean, theExtVMax: boolean, theFExtended: TopoDS_Face): void;
// theF: The face to extend
// theExtVal: The extension value
// theExtUMin: Defines whether to extend the face in UMin direction
// theExtUMax: Defines whether to extend the face in UMax direction
// theExtVMin: Defines whether to extend the face in VMin direction
// theExtVMax: Defines whether to extend the face in VMax direction
// theFExtended: The extended face Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the max distance between edge and its 2d representation on the face
BRepLib_CheckCurveOnSurface: declare class BRepLib_CheckCurveOnSurface

constructor

// Sets the data for the algorithm
Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;

// Performs the calculation If myIsParallel == true then computation will be performed in parallel
Perform(): void;

// Returns true if the max distance has been found
IsDone(): boolean;

// Sets parallel flag
SetParallel(theIsParallel: boolean): void;

// Returns true if parallel flag is set
IsParallel(): boolean;

// Returns error status The possible values are
ErrorStatus(): number;

// Returns max distance
MaxDistance(): number;

// Returns parameter in which the distance is maximal
MaxParameter(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for all commands in {@link BRepLib`BRepLib`}
BRepLib_Command: declare class BRepLib_Command

IsDone(): boolean;

// Raises NotDone if done is false
Check(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Errors that can occur at edge construction
BRepLib_EdgeError: typeof BRepLib_EdgeError[keyof typeof BRepLib_EdgeError]

// Errors that can occur at face construction
BRepLib_FaceError: typeof BRepLib_FaceError[keyof typeof BRepLib_FaceError]

// Provides an algorithm to find a Surface through a set of edges
BRepLib_FindSurface: declare class BRepLib_FindSurface

constructor

// Computes the Surface from the edges of with the given tolerance
Init(S: TopoDS_Shape, Tol?: number, OnlyPlane?: boolean, OnlyClosed?: boolean): void;

Found(): boolean;

Surface(): Geom_Surface;

Tolerance(): number;

ToleranceReached(): number;

Existed(): boolean;

Location(): TopLoc_Location;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class can detect vertices in a face that can be considered useless and then perform the fuse of the edges and remove the useless vertices
BRepLib_FuseEdges: declare class BRepLib_FuseEdges

constructor

// set edges to avoid being fused
AvoidEdges(theMapEdg: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// set mode to enable concatenation G1 BSpline edges in one End Modified by IFV 19.04.07
SetConcatBSpl(theConcatBSpl?: boolean): void;

// returns all the list of edges to be fused each list of the map represent a set of connex edges that can be fused
Edges(theMapLstEdg: NCollection_DataMap_int_NCollection_List_TopoDS_Shape): void;
// theMapLstEdg: Mutated in place

// returns all the fused edges
ResultEdges(theMapEdg: NCollection_DataMap_int_TopoDS_Shape): void;
// theMapEdg: Mutated in place

// returns the map of modified faces
Faces(theMapFac: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// theMapFac: Mutated in place

// returns myShape modified with the list of internal edges removed from it
Shape(): TopoDS_Shape;

// returns the number of vertices candidate to be removed
NbVertices(): number;

// Using map of list of connex edges, fuse each list to one edge and then update myShape
Perform(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to build edges
BRepLib_MakeEdge: declare class BRepLib_MakeEdge extends BRepLib_MakeShape

constructor

Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

// Returns the error description when NotDone
Error(): BRepLib_EdgeError;

Edge(): TopoDS_Edge;

// Returns the first vertex of the edge
Vertex1(): TopoDS_Vertex;

// Returns the second vertex of the edge
Vertex2(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to build edges
BRepLib_MakeEdge2d: declare class BRepLib_MakeEdge2d extends BRepLib_MakeShape

constructor

Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

// Returns the error description when NotDone
Error(): BRepLib_EdgeError;

Edge(): TopoDS_Edge;

// Returns the first vertex of the edge
Vertex1(): TopoDS_Vertex;

// Returns the second vertex of the edge
Vertex2(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
