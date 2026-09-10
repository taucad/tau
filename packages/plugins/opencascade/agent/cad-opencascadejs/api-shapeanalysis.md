# libcascade — ShapeAnalysis

7 top-level symbols. Signatures are verbatim typescript.

// This package is intended to analyze geometrical objects and topological shapes
ShapeAnalysis: declare class ShapeAnalysis

constructor

// Returns positively oriented wire in the face
static OuterWire(theFace: TopoDS_Face): TopoDS_Wire;

// Returns a total area of 2d wire
static TotCross2D(sewd: ShapeExtend_WireData, aFace: TopoDS_Face): number;

// Returns a total area of 3d wire
static ContourArea(theWire: TopoDS_Wire): number;

// Returns True if <F> has outer bound
static IsOuterBound(face: TopoDS_Face): boolean;

// Returns a shift required to move point <Val> to the range [ToVal-Period/2,ToVal+Period/2]
static AdjustByPeriod(Val: number, ToVal: number, Period: number): number;

// Returns a shift required to move point <Val> to the range [ValMin,ValMax]
static AdjustToPeriod(Val: number, ValMin: number, ValMax: number): number;

// Finds the start and end vertices of the shape Shape can be of the following type
static FindBounds(shape: TopoDS_Shape, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
// V1: Mutated in place
// V2: Mutated in place

// Computes exact UV bounds of all wires on the face
static GetFaceUVBounds(F: TopoDS_Face, Umin?: number, Umax?: number, Vmin?: number, Vmax?: number): { Umin: number; Umax: number; Vmin: number; Vmax: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_BoxBndTreeSelector: declare class ShapeAnalysis_BoxBndTreeSelector

constructor

DefineBoxes(theFBox: Bnd_Box, theLBox: Bnd_Box): void;

DefineVertexes(theVf: TopoDS_Vertex, theVl: TopoDS_Vertex): void;

DefinePnt(theFPnt: gp_Pnt, theLPnt: gp_Pnt): void;

GetNb(): number;

SetNb(theNb: number): void;

LoadList(elem: number): void;

SetStop(): void;

SetTolerance(theTol: number): void;

ContWire(nbWire: number): boolean;

LastCheckStatus(theStatus: ShapeExtend_Status): boolean;

Reject(argNo0: Bnd_Box): boolean;

Accept(argNo0: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides operators for analysis surfaces and curves of shapes in order to find out more simple geometry entities, which could replace existing complex (for example, BSpline) geometry objects with given tolerance
ShapeAnalysis_CanonicalRecognition: declare class ShapeAnalysis_CanonicalRecognition

constructor

// Sets shape
SetShape(theShape: TopoDS_Shape): void;

// Returns input shape
GetShape(): TopoDS_Shape;

// Returns deviation between input geometry entity and analytical entity
GetGap(): number;

// Returns status of operation
GetStatus(): number;

// Returns status to be equal 0
ClearStatus(): void;

// Returns true if the underlined surface can be represent by plane with tolerance theTol and sets in thePln the result plane
IsPlane(theTol: number, thePln: gp_Pln): boolean;
// thePln: Mutated in place

// Returns true if the underlined surface can be represent by cylindrical one with tolerance theTol and sets in theCyl the result cylinrical surface
IsCylinder(theTol: number, theCyl: gp_Cylinder): boolean;
// theCyl: Mutated in place

// Returns true if the underlined surface can be represent by conical one with tolerance theTol and sets in theCone the result conical surface
IsCone(theTol: number, theCone: gp_Cone): boolean;
// theCone: Mutated in place

// Returns true if the underlined surface can be represent by spherical one with tolerance theTol and sets in theSphere the result spherical surface
IsSphere(theTol: number, theSphere: gp_Sphere): boolean;
// theSphere: Mutated in place

// Returns true if the underlined curve can be represent by line with tolerance theTol and sets in theLin the result line
IsLine(theTol: number, theLin: gp_Lin): boolean;
// theLin: Mutated in place

// Returns true if the underlined curve can be represent by circle with tolerance theTol and sets in theCirc the result circle
IsCircle(theTol: number, theCirc: gp_Circ): boolean;
// theCirc: Mutated in place

// Returns true if the underlined curve can be represent by ellipse with tolerance theTol and sets in theCirc the result ellipse
IsEllipse(theTol: number, theElips: gp_Elips): boolean;
// theElips: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Analysis of the face size
ShapeAnalysis_CheckSmallFace: declare class ShapeAnalysis_CheckSmallFace

constructor

// Checks if a Face is as a Spot Returns 0 if not, 1 if yes, 2 if yes and all vertices are the same By default, considers the tolerance zone of its vertices A given value <tol> may be given to check a spot of this size If a Face is a Spot, its location is returned in <spot>, and <spotol> returns an equivalent tolerance, which is computed as half of max dimension of min-max box of the face
IsSpotFace(F: TopoDS_Face, spot: gp_Pnt, spotol: number, tol: number): { returnValue: number; spotol: number };
// spot: Mutated in place

// Acts as IsSpotFace, but records in <infos> a diagnostic "SpotFace" with the Pnt as value (data "Location")
CheckSpotFace(F: TopoDS_Face, tol?: number): boolean;

// Checks if a Face lies on a Surface which is a strip So the Face is a strip
IsStripSupport(F: TopoDS_Face, tol?: number): boolean;

// Checks if two edges define a strip, i.e
CheckStripEdges(E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number, dmax?: number): { returnValue: boolean; dmax: number };

// Searches for two and only two edges up tolerance Returns True if OK, false if not 2 edges If True, returns the two edges and their maximum distance
FindStripEdges(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number, dmax?: number): { returnValue: boolean; dmax: number };
// E1: Mutated in place
// E2: Mutated in place

// Checks if a Face is a single strip, i.e
CheckSingleStrip(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;
// E1: Mutated in place
// E2: Mutated in place

// Checks if a Face is as a Strip Returns 0 if not or non determined, 1 if in U, 2 if in V By default, considers the tolerance zone of its edges A given value <tol> may be given to check a strip of max this width
CheckStripFace(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;
// E1: Mutated in place
// E2: Mutated in place

// Checks if a Face brings vertices which split it, either confused with non adjacent vertices, or confused with their projection on non adjacent edges Returns the count of found splitting vertices Each vertex then brings a diagnostic "SplittingVertex", with data
CheckSplittingVertices(F: TopoDS_Face, MapEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, MapParam: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher, theAllVert: TopoDS_Compound): number;
// MapEdges: Mutated in place
// MapParam: Mutated in place
// theAllVert: Mutated in place

// Checks if a Face has a pin, which can be edited No singularity
CheckPin(F: TopoDS_Face, whatrow?: number, sence?: number): { returnValue: boolean; whatrow: number; sence: number };

// Checks if a Face is twisted (apart from checking Pin, i.e
CheckTwisted(F: TopoDS_Face, paramu?: number, paramv?: number): { returnValue: boolean; paramu: number; paramv: number };

CheckPinFace(F: TopoDS_Face, mapEdges: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, toler: number): boolean;

CheckPinEdges(theFirstEdge: TopoDS_Edge, theSecondEdge: TopoDS_Edge, coef1: number, coef2: number, toler: number): boolean;

// Returns the status of last call to Perform() ShapeExtend_OK
Status(status: ShapeExtend_Status): boolean;

// Sets a fixed Tolerance to check small face By default, local tolerance zone is considered Sets a fixed MaxTolerance to check small face Sets a fixed Tolerance to check small face By default, local tolerance zone is considered Unset fixed tolerance, comes back to local tolerance zones Unset fixed tolerance, comes back to local tolerance zones
SetTolerance(tol: number): void;

// Returns the tolerance to check small faces, negative value if local tolerances zones are to be considered
Tolerance(): number;

StatusSpot(status: ShapeExtend_Status): boolean;

StatusStrip(status: ShapeExtend_Status): boolean;

StatusPin(status: ShapeExtend_Status): boolean;

StatusTwisted(status: ShapeExtend_Status): boolean;

StatusSplitVert(status: ShapeExtend_Status): boolean;

StatusPinFace(status: ShapeExtend_Status): boolean;

StatusPinEdges(status: ShapeExtend_Status): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Analyzing tool for 2d or 3d curve
ShapeAnalysis_Curve: declare class ShapeAnalysis_Curve

constructor

// Projects a Point on a Curve
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
// proj: Mutated in place

ProjectAct(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param?: number): { returnValue: number; param: number };

// Projects a Point on a Curve using Newton method
NextProject(paramPrev: number, C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
NextProject(paramPrev: number, C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param?: number): { returnValue: number; param: number };
NextProject(paramPrev: number, C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
NextProject(paramPrev: number, C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param?: number): { returnValue: number; param: number };
// proj: Mutated in place

// Validate parameters First and Last for the given curve in order to make them valid for creation of edge
ValidateRange(Crv: Geom_Curve, First: number, Last: number, prec: number): { returnValue: boolean; First: number; Last: number };

// Computes a boundary box on segment of curve C2d from First to Last
FillBndBox(C2d: Geom2d_Curve, First: number, Last: number, NPoints: number, Exact: boolean, Box: Bnd_Box2d): void;
// Box: Mutated in place

// Defines which pcurve (C1 or C2) should be chosen for FORWARD seam edge
SelectForwardSeam(C1: Geom2d_Curve, C2: Geom2d_Curve): number;

// Checks if points are planar with given preci
static IsPlanar(pnts: NCollection_Array1_gp_Pnt, Normal: gp_XYZ, preci: number): boolean;
static IsPlanar(curve: Geom_Curve, Normal: gp_XYZ, preci: number): boolean;
static IsPlanar(pnts: NCollection_Array1_gp_Pnt, Normal: gp_XYZ, preci: number): boolean;
static IsPlanar(curve: Geom_Curve, Normal: gp_XYZ, preci: number): boolean;
// Normal: Mutated in place

// Returns sample points which will serve as linearisation of the2d curve in range (first, last) The distribution of sample points is consystent with what is used by `BRepTopAdaptor_FClass2d`
static GetSamplePoints(curve: Geom2d_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt2d): boolean;
static GetSamplePoints(curve: Geom_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt): boolean;
static GetSamplePoints(curve: Geom2d_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt2d): boolean;
static GetSamplePoints(curve: Geom_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt): boolean;
// seq: Mutated in place

// Tells if the Curve is closed with given precision
static IsClosed(curve: Geom_Curve, preci?: number): boolean;

// This method was implemented as fix for changes in trimmed curve behaviour
static IsPeriodic(curve: Geom_Curve): boolean;
static IsPeriodic(curve: Geom2d_Curve): boolean;
static IsPeriodic(curve: Geom_Curve): boolean;
static IsPeriodic(curve: Geom2d_Curve): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool for analyzing the edge
ShapeAnalysis_Edge: declare class ShapeAnalysis_Edge

constructor

// Tells if the edge has a 3d curve
HasCurve3d(edge: TopoDS_Edge): boolean;

// Returns the 3d curve and bounding parameters for the edge Returns False if no 3d curve
Curve3d(edge: TopoDS_Edge, cf: number, cl: number, orient: boolean): { returnValue: boolean; C3d: Geom_Curve; cf: number; cl: number; [Symbol.dispose](): void };

// Gives True if the edge has a 3d curve, this curve is closed, and the edge has the same vertex at start and end
IsClosed3d(edge: TopoDS_Edge): boolean;

// Tells if the Edge has a pcurve on the face
HasPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
HasPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
HasPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
HasPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

// Returns the pcurve and bounding parameters for the edge lying on the surface
PCurve(edge: TopoDS_Edge, face: TopoDS_Face, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
PCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
PCurve(edge: TopoDS_Edge, face: TopoDS_Face, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
PCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };

// Returns the ends of pcurve Calls method PCurve with <orient> equal to True
BoundUV(edge: TopoDS_Edge, face: TopoDS_Face, first: gp_Pnt2d, last: gp_Pnt2d): boolean;
BoundUV(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, first: gp_Pnt2d, last: gp_Pnt2d): boolean;
BoundUV(edge: TopoDS_Edge, face: TopoDS_Face, first: gp_Pnt2d, last: gp_Pnt2d): boolean;
BoundUV(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, first: gp_Pnt2d, last: gp_Pnt2d): boolean;

// Returns True if the edge has two pcurves on one surface
IsSeam(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
IsSeam(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
IsSeam(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
IsSeam(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

// Returns start vertex of the edge (taking edge orientation into account)
FirstVertex(edge: TopoDS_Edge): TopoDS_Vertex;

// Returns end vertex of the edge (taking edge orientation into account)
LastVertex(edge: TopoDS_Edge): TopoDS_Vertex;

// Returns tangent of the edge pcurve at its start (if atEnd is False) or end (if True), regarding the orientation of edge
GetEndTangent2d(edge: TopoDS_Edge, face: TopoDS_Face, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;
GetEndTangent2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;
GetEndTangent2d(edge: TopoDS_Edge, face: TopoDS_Face, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;
GetEndTangent2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;

// Checks the start and/or end vertex of the edge for matching with 3d curve with the given precision
CheckVerticesWithCurve3d(edge: TopoDS_Edge, preci?: number, vtx?: number): boolean;

// Checks the start and/or end vertex of the edge for matching with pcurve with the given precision
CheckVerticesWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face, preci: number, vtx: number): boolean;
CheckVerticesWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, preci: number, vtx: number): boolean;
CheckVerticesWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face, preci: number, vtx: number): boolean;
CheckVerticesWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, preci: number, vtx: number): boolean;

// Checks if it is necessary to increase tolerances of the edge vertices to comprise the ends of 3d curve and pcurve on the given face (first method) or all pcurves stored in an edge (second one) toler1 returns necessary tolerance for first vertex, toler2 returns necessary tolerance for last vertex
CheckVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };
CheckVertexTolerance(edge: TopoDS_Edge, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };
CheckVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };
CheckVertexTolerance(edge: TopoDS_Edge, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };

// Checks mutual orientation of 3d curve and pcurve on the analysis of curves bounding points
CheckCurve3dWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
CheckCurve3dWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
CheckCurve3dWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
CheckCurve3dWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

// Returns the status (in the form of True/False) of last Check
Status(status: ShapeExtend_Status): boolean;

// Checks the edge to be SameParameter
CheckSameParameter(edge: TopoDS_Edge, maxdev: number, NbControl: number): { returnValue: boolean; maxdev: number };
CheckSameParameter(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theMaxdev: number, theNbControl: number): { returnValue: boolean; theMaxdev: number };
CheckSameParameter(edge: TopoDS_Edge, maxdev: number, NbControl: number): { returnValue: boolean; maxdev: number };
CheckSameParameter(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theMaxdev: number, theNbControl: number): { returnValue: boolean; theMaxdev: number };

// Checks possibility for pcurve thePC to have range [theFirst, theLast] (edge range) having respect to real first, last parameters of thePC
CheckPCurveRange(theFirst: number, theLast: number, thePC: Geom2d_Curve): boolean;

// Checks the first edge is overlapped with second edge
CheckOverlapping(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theTolOverlap: number, theDomainDist: number): { returnValue: boolean; theTolOverlap: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to represent free bound and to store its properties
ShapeAnalysis_FreeBoundData: declare class ShapeAnalysis_FreeBoundData extends Standard_Transient

constructor

// Clears all properties of the contour
Clear(): void;

// Sets contour
SetFreeBound(freebound: TopoDS_Wire): void;

// Sets area of the contour
SetArea(area: number): void;

// Sets perimeter of the contour
SetPerimeter(perimeter: number): void;

// Sets ratio of average length to average width of the contour
SetRatio(ratio: number): void;

// Sets average width of the contour
SetWidth(width: number): void;

// Adds notch on the contour with its maximum width
AddNotch(notch: TopoDS_Wire, width: number): void;

// Returns contour
FreeBound(): TopoDS_Wire;

// Returns area of the contour
Area(): number;

// Returns perimeter of the contour
Perimeter(): number;

// Returns ratio of average length to average width of the contour
Ratio(): number;

// Returns average width of the contour
Width(): number;

// Returns number of notches on the contour
NbNotches(): number;

// Returns sequence of notches on the contour
Notches(): NCollection_HSequence_TopoDS_Shape;

// Returns notch on the contour
Notch(index: number): TopoDS_Wire;

// Returns maximum width of notch specified by its rank number on the contour
NotchWidth(index: number): number;
NotchWidth(notch: TopoDS_Wire): number;
NotchWidth(index: number): number;
NotchWidth(notch: TopoDS_Wire): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
