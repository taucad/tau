# libcascade — ShapeAlgo

3 top-level symbols. Signatures are verbatim typescript.

ShapeAlgo: declare class ShapeAlgo

constructor

// Provides initerface to the algorithms from Shape Healing
static Init(): void;

// Sets default AlgoContainer
static SetAlgoContainer(aContainer: ShapeAlgo_AlgoContainer): void;

// Returns default AlgoContainer
static AlgoContainer(): ShapeAlgo_AlgoContainer;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeAlgo_AlgoContainer: declare class ShapeAlgo_AlgoContainer extends Standard_Transient

constructor

// Sets ToolContainer
SetToolContainer(TC: ShapeAlgo_ToolContainer): void;

// Returns ToolContainer
ToolContainer(): ShapeAlgo_ToolContainer;

// Finds the best way to connect and connects <nextsewd> to already built <sewd> (in <saw>)
ConnectNextWire(saw: ShapeAnalysis_Wire, nextsewd: ShapeExtend_WireData, maxtol: number, distmin: number, revsewd: boolean, revnextsewd: boolean): { returnValue: boolean; distmin: number; revsewd: boolean; revnextsewd: boolean };

ApproxBSplineCurve(bspline: Geom_BSplineCurve, seq: NCollection_Sequence_handle_Geom_Curve): void;
ApproxBSplineCurve(bspline: Geom2d_BSplineCurve, seq: NCollection_Sequence_handle_Geom2d_Curve): void;
ApproxBSplineCurve(bspline: Geom_BSplineCurve, seq: NCollection_Sequence_handle_Geom_Curve): void;
ApproxBSplineCurve(bspline: Geom2d_BSplineCurve, seq: NCollection_Sequence_handle_Geom2d_Curve): void;

// Converts C0 B-Spline curve into sequence of C1 B-Spline curves
C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };
C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };

// Converts a shape on C0 geometry into the shape on C1 geometry
C0ShapeToC1Shape(shape: TopoDS_Shape, tol: number): TopoDS_Shape;

// Converts a surface to B-Spline
ConvertSurfaceToBSpline(surf: Geom_Surface, UF: number, UL: number, VF: number, VL: number): Geom_BSplineSurface;

// Return 2 wires with the same number of edges
HomoWires(wireIn1: TopoDS_Wire, wireIn2: TopoDS_Wire, wireOut1: TopoDS_Wire, wireOut2: TopoDS_Wire, byParam: boolean): boolean;
// wireOut1: Mutated in place
// wireOut2: Mutated in place

// Returns the outer wire on the face <Face>
OuterWire(face: TopoDS_Face): TopoDS_Wire;

// Converts surface to periodic form
ConvertToPeriodic(surf: Geom_Surface): Geom_Surface;

// Computes exact UV bounds of all wires on the face
GetFaceUVBounds(F: TopoDS_Face, Umin: number, Umax: number, Vmin: number, Vmax: number): { Umin: number; Umax: number; Vmin: number; Vmax: number };

// Convert {@link Geom_Curve`Geom_Curve`} to {@link Geom_BSplineCurve`Geom_BSplineCurve`}
ConvertCurveToBSpline(C3D: Geom_Curve, First: number, Last: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineCurve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Returns tools used by AlgoContainer
ShapeAlgo_ToolContainer: declare class ShapeAlgo_ToolContainer extends Standard_Transient

constructor

// Returns {@link ShapeFix_Shape`ShapeFix_Shape`}
FixShape(): ShapeFix_Shape;

// Returns {@link ShapeFix_EdgeProjAux`ShapeFix_EdgeProjAux`}
EdgeProjAux(): ShapeFix_EdgeProjAux;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
