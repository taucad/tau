# libcascade — BRepClass

6 top-level symbols. Signatures are verbatim typescript.

BRepClass_Edge: declare class BRepClass_Edge

constructor

Edge(): TopoDS_Edge;

Face(): TopoDS_Face;

NextEdge(): TopoDS_Edge;

SetNextEdge(theMapVE: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

MaxTolerance(): number;

SetMaxTolerance(theValue: number): void;

UseBndBox(): boolean;

SetUseBndBox(theValue: boolean): void;

delete(): void;

[Symbol.dispose](): void;

BRepClass_FClass2dOfFClassifier: declare class BRepClass_FClass2dOfFClassifier

constructor

Reset(L: gp_Lin2d, P: number, Tol: number): void;

Compare(E: BRepClass_Edge, Or: TopAbs_Orientation): void;

Parameter(): number;

Intersector(): BRepClass_Intersector;

ClosestIntersection(): number;

State(): TopAbs_State;

IsHeadOrEnd(): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepClass_FClassifier: declare class BRepClass_FClassifier

constructor

State(): TopAbs_State;

Rejected(): boolean;

NoWires(): boolean;

Edge(): BRepClass_Edge;

EdgeParameter(): number;

Position(): IntRes2d_Position;

delete(): void;

[Symbol.dispose](): void;

BRepClass_FaceClassifier: declare class BRepClass_FaceClassifier extends BRepClass_FClassifier

constructor

Perform(theF: TopoDS_Face, theP: gp_Pnt2d, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(F: unknown, P: gp_Pnt2d, Tol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt2d, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(F: unknown, P: gp_Pnt2d, Tol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt2d, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(theF: TopoDS_Face, theP: gp_Pnt, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
Perform(F: unknown, P: gp_Pnt2d, Tol: number): void;

delete(): void;

[Symbol.dispose](): void;

BRepClass_FacePassiveClassifier: declare class BRepClass_FacePassiveClassifier

constructor

Reset(L: gp_Lin2d, P: number, Tol: number): void;

Compare(E: BRepClass_Edge, Or: TopAbs_Orientation): void;

Parameter(): number;

Intersector(): BRepClass_Intersector;

ClosestIntersection(): number;

State(): TopAbs_State;

IsHeadOrEnd(): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepClass_Intersector: declare class BRepClass_Intersector extends Geom2dInt_IntConicCurveOfGInter

constructor

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

LocalGeometry(E: BRepClass_Edge, U: number, T: gp_Dir2d, N: gp_Dir2d, C?: number): { C: number };

delete(): void;

[Symbol.dispose](): void;
