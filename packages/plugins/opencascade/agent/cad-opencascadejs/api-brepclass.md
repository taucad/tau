# libcascade — BRepClass

6 top-level symbols. Signatures are verbatim typescript.

// This class is used to send the description of an Edge to the classifier
BRepClass_Edge: declare class BRepClass_Edge

constructor

// Returns the current Edge
Edge(): TopoDS_Edge;

// Returns the Face for the current Edge
Face(): TopoDS_Face;

// Returns the next Edge
NextEdge(): TopoDS_Edge;

// Finds and sets the next Edge for the current
SetNextEdge(theMapVE: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// Returns the maximum tolerance
MaxTolerance(): number;

// Sets the maximum tolerance at which to start checking in the intersector
SetMaxTolerance(theValue: number): void;

// Returns true if we are using boxes in the intersector
UseBndBox(): boolean;

// Sets the status of whether we are using boxes or not
SetUseBndBox(theValue: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepClass_FClass2dOfFClassifier: declare class BRepClass_FClass2dOfFClassifier

constructor

// Starts a classification process
Reset(L: gp_Lin2d, P: number, Tol: number): void;

// Updates the classification process with the edge <E> from the boundary
Compare(E: BRepClass_Edge, Or: TopAbs_Orientation): void;

// Returns the current value of the parameter
Parameter(): number;

// Returns the intersecting algorithm
Intersector(): BRepClass_Intersector;

// Returns 0 if the last compared edge had no relevant intersection
ClosestIntersection(): number;

// Returns the current state of the point
State(): TopAbs_State;

// Returns the true if the closest intersection point represents head or end of the edge
IsHeadOrEnd(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepClass_FClassifier: declare class BRepClass_FClassifier

constructor

// Returns the result of the classification
State(): TopAbs_State;

// Returns True when the state was computed by a rejection
Rejected(): boolean;

// Returns True if the face contains no wire
NoWires(): boolean;

// Returns the Edge used to determine the classification
Edge(): BRepClass_Edge;

// Returns the parameter on `Edge()` used to determine the classification
EdgeParameter(): number;

// Returns the position of the point on the edge returned by Edge
Position(): IntRes2d_Position;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides Constructors with a Face
BRepClass_FaceClassifier: declare class BRepClass_FaceClassifier extends BRepClass_FClassifier

constructor

// Classify the Point P with Tolerance <T> on the face described by <F>
Perform(theF: TopoDS_Face, theP: gp_Pnt2d, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(F: unknown, P: gp_Pnt2d, Tol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt2d, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(F: unknown, P: gp_Pnt2d, Tol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt2d, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(F: unknown, P: gp_Pnt2d, Tol: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepClass_FacePassiveClassifier: declare class BRepClass_FacePassiveClassifier

constructor

// Starts a classification process
Reset(L: gp_Lin2d, P: number, Tol: number): void;

// Updates the classification process with the edge <E> from the boundary
Compare(E: BRepClass_Edge, Or: TopAbs_Orientation): void;

// Returns the current value of the parameter
Parameter(): number;

// Returns the intersecting algorithm
Intersector(): BRepClass_Intersector;

// Returns 0 if the last compared edge had no relevant intersection
ClosestIntersection(): number;

// Returns the current state of the point
State(): TopAbs_State;

// Returns the true if the closest intersection point represents head or end of the edge
IsHeadOrEnd(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Intersect an Edge with a segment
BRepClass_Intersector: declare class BRepClass_Intersector extends Geom2dInt_IntConicCurveOfGInter

constructor

// Intersect the line segment and the edge
Perform(L: gp_Lin2d, P: number, Tol: number, E: BRepClass_Edge): void;
Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: BRepClass_Edge): void;
Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: BRepClass_Edge): void;
Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: BRepClass_Edge): void;
Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: BRepClass_Edge): void;
Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: BRepClass_Edge): void;
Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

// Returns in <T>, <N> and `the tangent, normal and curvature of the edge <E> at parameter value .`
LocalGeometry(E: BRepClass_Edge, U: number, T: gp_Dir2d, N: gp_Dir2d, C?: number): { C: number };
// T: Mutated in place
// N: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
