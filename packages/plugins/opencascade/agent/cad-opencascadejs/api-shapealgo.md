# libcascade — ShapeAlgo

3 top-level symbols. Signatures are verbatim typescript.

ShapeAlgo: declare class ShapeAlgo

constructor

static Init(): void;

static SetAlgoContainer(aContainer: ShapeAlgo_AlgoContainer): void;

static AlgoContainer(): ShapeAlgo_AlgoContainer;

delete(): void;

[Symbol.dispose](): void;

ShapeAlgo_AlgoContainer: declare class ShapeAlgo_AlgoContainer extends Standard_Transient

constructor

SetToolContainer(TC: ShapeAlgo_ToolContainer): void;

ToolContainer(): ShapeAlgo_ToolContainer;

ConnectNextWire(saw: ShapeAnalysis_Wire, nextsewd: ShapeExtend_WireData, maxtol: number, distmin: number, revsewd: boolean, revnextsewd: boolean): { returnValue: boolean; distmin: number; revsewd: boolean; revnextsewd: boolean };

ApproxBSplineCurve(bspline: Geom_BSplineCurve, seq: NCollection_Sequence_handle_Geom_Curve): void;
ApproxBSplineCurve(bspline: Geom2d_BSplineCurve, seq: NCollection_Sequence_handle_Geom2d_Curve): void;
ApproxBSplineCurve(bspline: Geom_BSplineCurve, seq: NCollection_Sequence_handle_Geom_Curve): void;
ApproxBSplineCurve(bspline: Geom2d_BSplineCurve, seq: NCollection_Sequence_handle_Geom2d_Curve): void;

C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };
C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };

C0ShapeToC1Shape(shape: TopoDS_Shape, tol: number): TopoDS_Shape;

ConvertSurfaceToBSpline(surf: Geom_Surface, UF: number, UL: number, VF: number, VL: number): Geom_BSplineSurface;

HomoWires(wireIn1: TopoDS_Wire, wireIn2: TopoDS_Wire, wireOut1: TopoDS_Wire, wireOut2: TopoDS_Wire, byParam: boolean): boolean;

OuterWire(face: TopoDS_Face): TopoDS_Wire;

ConvertToPeriodic(surf: Geom_Surface): Geom_Surface;

GetFaceUVBounds(F: TopoDS_Face, Umin: number, Umax: number, Vmin: number, Vmax: number): { Umin: number; Umax: number; Vmin: number; Vmax: number };

ConvertCurveToBSpline(C3D: Geom_Curve, First: number, Last: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineCurve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeAlgo_ToolContainer: declare class ShapeAlgo_ToolContainer extends Standard_Transient

constructor

FixShape(): ShapeFix_Shape;

EdgeProjAux(): ShapeFix_EdgeProjAux;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
