# libcascade — ChFi3d

6 top-level symbols. Signatures are verbatim typescript.

// creation of spatial fillets on a solid
ChFi3d: declare class ChFi3d

constructor

// Defines the type of concavity in the edge of connection of two faces
static DefineConnectType(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, SinTol: number, CorrectPoint: boolean): ChFiDS_TypeOfConcavity;

// Returns true if theEdge between theFace1 and theFace2 is tangent
static IsTangentFaces(theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, Order?: GeomAbs_Shape): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for calculation of surfaces (fillets, chamfers) destined to smooth edges of a gap on a Shape and the reconstruction of the Shape
ChFi3d_Builder: declare class ChFi3d_Builder

SetParams(Tang: number, Tesp: number, T2d: number, TApp3d: number, TolApp2d: number, Fleche: number): void;

SetContinuity(InternalContinuity: GeomAbs_Shape, AngularTolerance: number): void;

// extracts from the list the contour containing edge E
Remove(E: TopoDS_Edge): void;

// gives the number of the contour containing E or 0 if E does not belong to any contour
Contains(E: TopoDS_Edge): number;
Contains(E: TopoDS_Edge, IndexInSpine?: number): { returnValue: number; IndexInSpine: number };
Contains(E: TopoDS_Edge): number;
Contains(E: TopoDS_Edge, IndexInSpine?: number): { returnValue: number; IndexInSpine: number };

// gives the number of disjoint contours on which the fillets are calculated
NbElements(): number;

// gives the n'th set of edges (contour) if I >`NbElements()`
Value(I: number): ChFiDS_Spine;

// returns the length of the contour of index IC
Length(IC: number): number;

// returns the First vertex V of the contour of index IC
FirstVertex(IC: number): TopoDS_Vertex;

// returns the Last vertex V of the contour of index IC
LastVertex(IC: number): TopoDS_Vertex;

// returns the abscissa of the vertex V on the contour of index IC
Abscissa(IC: number, V: TopoDS_Vertex): number;

// returns the relative abscissa([0.,1.]) of the vertex V on the contour of index IC
RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

// returns true if the contour of index IC is closed an tangent
ClosedAndTangent(IC: number): boolean;

// returns true if the contour of index IC is closed
Closed(IC: number): boolean;

// general calculation of geometry on all edges, topologic reconstruction
Compute(): void;

// returns True if the computation is success
IsDone(): boolean;

// if (Isdone()) makes the result
Shape(): TopoDS_Shape;

// Advanced function for the history
Generated(EouV: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the number of contours on which the calculation has failed
NbFaultyContours(): number;

// Returns the number of I'th contour on which the calculation has failed
FaultyContour(I: number): number;

// Returns the number of surfaces calculated on the contour IC
NbComputedSurfaces(IC: number): number;

// Returns the IS'th surface calculated on the contour IC
ComputedSurface(IC: number, IS: number): Geom_Surface;

// Returns the number of vertices on which the calculation has failed
NbFaultyVertices(): number;

// Returns the IV'th vertex on which the calculation has failed
FaultyVertex(IV: number): TopoDS_Vertex;

// returns True if a partial result has been calculated
HasResult(): boolean;

// if (`HasResult()`) returns partial result if (!HasResult())
BadShape(): TopoDS_Shape;

// for the stripe IC ,indication on the cause of failure WalkingFailure,TwistedSurface,Error, Ok
StripeStatus(IC: number): ChFiDS_ErrorStatus;

// Reset all results of compute and returns the algorithm in the state of the last acquisition to enable modification of contours or areas
Reset(): void;

// Returns the Builder of topologic operations
Builder(): unknown;

// Method, implemented in the inheritants, calculates the elements of construction of the surface (fillet or chamfer)
SplitKPart(Data: ChFiDS_SurfData, SetData: NCollection_Sequence_handle_ChFiDS_SurfData, Spine: ChFiDS_Spine, Iedge: number, S1: Adaptor3d_Surface, I1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, I2: Adaptor3d_TopolTool, Intf?: boolean, Intl?: boolean): { returnValue: boolean; Intf: boolean; Intl: boolean };
// SetData: Mutated in place

PerformTwoCornerbyInter(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// construction tool for 3D chamfers on edges (on a solid)
ChFi3d_ChBuilder: declare class ChFi3d_ChBuilder extends ChFi3d_Builder

constructor

// initializes a contour with the edge <E> as first (the next are found by propagation )
Add(E: TopoDS_Edge): void;
Add(Dis: number, E: TopoDS_Edge): void;
Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;
Add(E: TopoDS_Edge): void;
Add(Dis: number, E: TopoDS_Edge): void;
Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;
Add(E: TopoDS_Edge): void;
Add(Dis: number, E: TopoDS_Edge): void;
Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;

// set the distance <Dis> of the fillet contour of index <IC> in the DS with <Dis> on <F>
SetDist(Dis: number, IC: number, F: TopoDS_Face): void;

// gives the distances <Dis> of the fillet contour of index <IC> in the DS
GetDist(IC: number, Dis?: number): { Dis: number };

// set the distances <Dis1> and <Dis2> of the fillet contour of index <IC> in the DS with <Dis1> on <F>
SetDists(Dis1: number, Dis2: number, IC: number, F: TopoDS_Face): void;

// gives the distances <Dis1> and <Dis2> of the fillet contour of index <IC> in the DS
Dists(IC: number, Dis1?: number, Dis2?: number): { Dis1: number; Dis2: number };

// initializes a new contour with the edge <E> as first (the next are found by propagation ), and the distance <Dis1> and <Angle> if the edge <E> has more than 2 adjacent faces
AddDA(Dis: number, Angle: number, E: TopoDS_Edge, F: TopoDS_Face): void;

// set the distance <Dis> and <Angle> of the fillet contour of index <IC> in the DS with <Dis> on <F>
SetDistAngle(Dis: number, Angle: number, IC: number, F: TopoDS_Face): void;

// gives the distances <Dis> and <Angle> of the fillet contour of index <IC> in the DS
GetDistAngle(IC: number, Dis?: number, Angle?: number): { Dis: number; Angle: number };

// set the mode of shamfer
SetMode(theMode: ChFiDS_ChamfMode): void;

// renvoi la methode des chanfreins utilisee
IsChamfer(IC: number): ChFiDS_ChamfMethod;

// returns the mode of chamfer used
Mode(): ChFiDS_ChamfMode;

// Reset tous rayons du contour IC
ResetContour(IC: number): void;

Simulate(IC: number): void;

NbSurf(IC: number): number;

Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; First: number; Last: number; [Symbol.dispose](): void };
SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; First: number; Last: number; [Symbol.dispose](): void };
SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; First: number; Last: number; [Symbol.dispose](): void };
SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };

// Methode, implemented in inheritants, calculates the elements of construction of the surface (fillet or chamfer)
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };
// Data: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool of construction of fillets 3d on edges (on a solid)
ChFi3d_FilBuilder: declare class ChFi3d_FilBuilder extends ChFi3d_Builder

constructor

// Sets the type of fillet surface
SetFilletShape(FShape: ChFi3d_FilletShape): void;

// Returns the type of fillet surface
GetFilletShape(): ChFi3d_FilletShape;

// initialisation of a contour with the first edge (the following are found by propagation)
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;

// Set the radius of the contour of index IC
SetRadius(C: Law_Function, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IC: number, IinC: number): void;
SetRadius(C: Law_Function, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IC: number, IinC: number): void;
SetRadius(C: Law_Function, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IC: number, IinC: number): void;
SetRadius(C: Law_Function, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IC: number, IinC: number): void;

// Returns true the contour is flagged as edge constant
IsConstant(IC: number): boolean;
IsConstant(IC: number, E: TopoDS_Edge): boolean;
IsConstant(IC: number): boolean;
IsConstant(IC: number, E: TopoDS_Edge): boolean;

// Returns the vector if the contour is flagged as edge constant
Radius(IC: number): number;
Radius(IC: number, E: TopoDS_Edge): number;
Radius(IC: number): number;
Radius(IC: number, E: TopoDS_Edge): number;

// Reset all vectors of contour IC
ResetContour(IC: number): void;

// Extracts the flag constant and the vector of edge E
UnSet(IC: number, E: TopoDS_Edge): void;
UnSet(IC: number, V: TopoDS_Vertex): void;
UnSet(IC: number, E: TopoDS_Edge): void;
UnSet(IC: number, V: TopoDS_Vertex): void;

// Returns in First and Last extremities of the part of variable vector framing E, returns False if E is flagged as edge constant
GetBounds(IC: number, E: TopoDS_Edge, First?: number, Last?: number): { returnValue: boolean; First: number; Last: number };

// Returns the rule of elementary evolution of the part to variable vector framing E, returns a rule zero if E is flagged as edge constant
GetLaw(IC: number, E: TopoDS_Edge): Law_Function;

// Sets the rule of elementary evolution of the part to variable vector framing E
SetLaw(IC: number, E: TopoDS_Edge, L: Law_Function): void;

Simulate(IC: number): void;

NbSurf(IC: number): number;

Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lists the types of fillet shapes
ChFi3d_FilletShape: typeof ChFi3d_FilletShape[keyof typeof ChFi3d_FilletShape]

// Searches singularities on fillet
ChFi3d_SearchSing: declare class ChFi3d_SearchSing extends math_FunctionWithDerivative

constructor

// computes the value of the function <F> for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// computes the value <F> and the derivative <D> of the function for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
