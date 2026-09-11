# libcascade — ShapeUpgrade

33 top-level symbols. Signatures are verbatim typescript.

ShapeUpgrade: declare class ShapeUpgrade

constructor

static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };
static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ClosedEdgeDivide: declare class ShapeUpgrade_ClosedEdgeDivide extends ShapeUpgrade_EdgeDivide

constructor

Compute(E: TopoDS_Edge): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ClosedFaceDivide: declare class ShapeUpgrade_ClosedFaceDivide extends ShapeUpgrade_FaceDivide

constructor

SplitSurface(theArea?: number): boolean;

SetNbSplitPoints(num: number): void;

GetNbSplitPoints(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ConvertCurve2dToBezier: declare class ShapeUpgrade_ConvertCurve2dToBezier extends ShapeUpgrade_SplitCurve2d

constructor

Compute(): void;

Build(Segment: boolean): void;

SplitParams(): NCollection_HSequence_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ConvertCurve3dToBezier: declare class ShapeUpgrade_ConvertCurve3dToBezier extends ShapeUpgrade_SplitCurve3d

constructor

SetLineMode(mode: boolean): void;

GetLineMode(): boolean;

SetCircleMode(mode: boolean): void;

GetCircleMode(): boolean;

SetConicMode(mode: boolean): void;

GetConicMode(): boolean;

Compute(): void;

Build(Segment: boolean): void;

SplitParams(): NCollection_HSequence_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ConvertSurfaceToBezierBasis: declare class ShapeUpgrade_ConvertSurfaceToBezierBasis extends ShapeUpgrade_SplitSurface

constructor

Build(Segment: boolean): void;

Compute(Segment: boolean): void;

Segments(): ShapeExtend_CompositeSurface;

SetPlaneMode(mode: boolean): void;

GetPlaneMode(): boolean;

SetRevolutionMode(mode: boolean): void;

GetRevolutionMode(): boolean;

SetExtrusionMode(mode: boolean): void;

GetExtrusionMode(): boolean;

SetBSplineMode(mode: boolean): void;

GetBSplineMode(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_EdgeDivide: declare class ShapeUpgrade_EdgeDivide extends ShapeUpgrade_Tool

constructor

Clear(): void;

SetFace(F: TopoDS_Face): void;

Compute(E: TopoDS_Edge): boolean;

HasCurve2d(): boolean;

HasCurve3d(): boolean;

Knots2d(): NCollection_HSequence_double;

Knots3d(): NCollection_HSequence_double;

SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

GetSplitCurve2dTool(): ShapeUpgrade_SplitCurve2d;

GetSplitCurve3dTool(): ShapeUpgrade_SplitCurve3d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_FaceDivide: declare class ShapeUpgrade_FaceDivide extends ShapeUpgrade_Tool

constructor

Init(F: TopoDS_Face): void;

SetSurfaceSegmentMode(Segment: boolean): void;

Perform(theArea?: number): boolean;

SplitSurface(theArea?: number): boolean;

SplitCurves(): boolean;

Result(): TopoDS_Shape;

Status(status: ShapeExtend_Status): boolean;

SetSplitSurfaceTool(splitSurfaceTool: ShapeUpgrade_SplitSurface): void;

SetWireDivideTool(wireDivideTool: ShapeUpgrade_WireDivide): void;

GetSplitSurfaceTool(): ShapeUpgrade_SplitSurface;

GetWireDivideTool(): ShapeUpgrade_WireDivide;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_FaceDivideArea: declare class ShapeUpgrade_FaceDivideArea extends ShapeUpgrade_FaceDivide

constructor

Perform(theArea?: number): boolean;

MaxArea(): number;

NbParts(): number;

SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

SetSplittingByNumber(theIsSplittingByNumber: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_FixSmallBezierCurves: declare class ShapeUpgrade_FixSmallBezierCurves extends ShapeUpgrade_FixSmallCurves

constructor

Approx(First: number, Last: number): { returnValue: boolean; Curve3d: Geom_Curve; Curve2d: Geom2d_Curve; Curve2dR: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_FixSmallCurves: declare class ShapeUpgrade_FixSmallCurves extends ShapeUpgrade_Tool

constructor

Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;

Approx(First: number, Last: number): { returnValue: boolean; Curve3d: Geom_Curve; Curve2d: Geom2d_Curve; Curve2dR: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

Status(status: ShapeExtend_Status): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_RemoveInternalWires: declare class ShapeUpgrade_RemoveInternalWires extends ShapeUpgrade_Tool

constructor

Init(theShape: TopoDS_Shape): void;

Perform(): boolean;
Perform(theSeqShapes: NCollection_Sequence_TopoDS_Shape): boolean;
Perform(): boolean;
Perform(theSeqShapes: NCollection_Sequence_TopoDS_Shape): boolean;

GetResult(): TopoDS_Shape;

MinArea(): number;

RemoveFaceMode(): boolean;

RemovedFaces(): NCollection_Sequence_TopoDS_Shape;

RemovedWires(): NCollection_Sequence_TopoDS_Shape;

Status(theStatus: ShapeExtend_Status): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_RemoveLocations: declare class ShapeUpgrade_RemoveLocations extends Standard_Transient

constructor

Remove(theShape: TopoDS_Shape): boolean;

GetResult(): TopoDS_Shape;

SetRemoveLevel(theLevel: TopAbs_ShapeEnum): void;

RemoveLevel(): TopAbs_ShapeEnum;

ModifiedShape(theInitShape: TopoDS_Shape): TopoDS_Shape;

GetModifiedShapesMap(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShapeConvertToBezier: declare class ShapeUpgrade_ShapeConvertToBezier extends ShapeUpgrade_ShapeDivide

constructor

Set2dConversion(mode: boolean): void;

Get2dConversion(): boolean;

Set3dConversion(mode: boolean): void;

Get3dConversion(): boolean;

SetSurfaceConversion(mode: boolean): void;

GetSurfaceConversion(): boolean;

Set3dLineConversion(mode: boolean): void;

Get3dLineConversion(): boolean;

Set3dCircleConversion(mode: boolean): void;

Get3dCircleConversion(): boolean;

Set3dConicConversion(mode: boolean): void;

Get3dConicConversion(): boolean;

SetPlaneMode(mode: boolean): void;

GetPlaneMode(): boolean;

SetRevolutionMode(mode: boolean): void;

GetRevolutionMode(): boolean;

SetExtrusionMode(mode: boolean): void;

GetExtrusionMode(): boolean;

SetBSplineMode(mode: boolean): void;

GetBSplineMode(): boolean;

Perform(newContext?: boolean): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShapeDivide: declare class ShapeUpgrade_ShapeDivide

constructor

Init(S: TopoDS_Shape): void;

SetPrecision(Prec: number): void;

SetMaxTolerance(maxtol: number): void;

SetMinTolerance(mintol: number): void;

SetSurfaceSegmentMode(Segment: boolean): void;

Perform(newContext?: boolean): boolean;

Result(): TopoDS_Shape;

GetContext(): ShapeBuild_ReShape;

SetContext(context: ShapeBuild_ReShape): void;

SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity?: Message_Gravity): void;

Status(status: ShapeExtend_Status): boolean;

SetSplitFaceTool(splitFaceTool: ShapeUpgrade_FaceDivide): void;

SetEdgeMode(aEdgeMode: number): void;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideAngle: declare class ShapeUpgrade_ShapeDivideAngle extends ShapeUpgrade_ShapeDivide

constructor

InitTool(MaxAngle: number): void;

SetMaxAngle(MaxAngle: number): void;

MaxAngle(): number;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideArea: declare class ShapeUpgrade_ShapeDivideArea extends ShapeUpgrade_ShapeDivide

constructor

MaxArea(): number;

NbParts(): number;

SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

SetSplittingByNumber(theIsSplittingByNumber: boolean): void;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideClosed: declare class ShapeUpgrade_ShapeDivideClosed extends ShapeUpgrade_ShapeDivide

constructor

SetNbSplitPoints(num: number): void;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideClosedEdges: declare class ShapeUpgrade_ShapeDivideClosedEdges extends ShapeUpgrade_ShapeDivide

constructor

SetNbSplitPoints(num: number): void;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideContinuity: declare class ShapeUpgrade_ShapeDivideContinuity extends ShapeUpgrade_ShapeDivide

constructor

SetTolerance(Tol: number): void;

SetTolerance2d(Tol: number): void;

SetBoundaryCriterion(Criterion?: GeomAbs_Shape): void;

SetPCurveCriterion(Criterion?: GeomAbs_Shape): void;

SetSurfaceCriterion(Criterion?: GeomAbs_Shape): void;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShellSewing: declare class ShapeUpgrade_ShellSewing

constructor

ApplySewing(shape: TopoDS_Shape, tol?: number): TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitCurve: declare class ShapeUpgrade_SplitCurve extends Standard_Transient

constructor

Init(First: number, Last: number): void;

SetSplitValues(SplitValues: NCollection_HSequence_double): void;

Build(Segment: boolean): void;

SplitValues(): NCollection_HSequence_double;

Compute(): void;

Perform(Segment?: boolean): void;

Status(status: ShapeExtend_Status): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitCurve2d: declare class ShapeUpgrade_SplitCurve2d extends ShapeUpgrade_SplitCurve

constructor

Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;

Build(Segment: boolean): void;

GetCurves(): NCollection_HArray1_handle_Geom2d_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitCurve2dContinuity: declare class ShapeUpgrade_SplitCurve2dContinuity extends ShapeUpgrade_SplitCurve2d

constructor

SetCriterion(Criterion: GeomAbs_Shape): void;

SetTolerance(Tol: number): void;

Compute(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitCurve3d: declare class ShapeUpgrade_SplitCurve3d extends ShapeUpgrade_SplitCurve

constructor

Init(C: Geom_Curve): void;
Init(C: Geom_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;

Build(Segment: boolean): void;

GetCurves(): NCollection_HArray1_handle_Geom_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitCurve3dContinuity: declare class ShapeUpgrade_SplitCurve3dContinuity extends ShapeUpgrade_SplitCurve3d

constructor

SetCriterion(Criterion: GeomAbs_Shape): void;

SetTolerance(Tol: number): void;

Compute(): void;

GetCurve(): Geom_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitSurface: declare class ShapeUpgrade_SplitSurface extends Standard_Transient

constructor

Init(S: Geom_Surface): void;
Init(S: Geom_Surface, UFirst: number, ULast: number, VFirst: number, VLast: number, theArea: number): void;
Init(S: Geom_Surface): void;
Init(S: Geom_Surface, UFirst: number, ULast: number, VFirst: number, VLast: number, theArea: number): void;

SetUSplitValues(UValues: NCollection_HSequence_double): void;

SetVSplitValues(VValues: NCollection_HSequence_double): void;

Build(Segment: boolean): void;

Compute(Segment?: boolean): void;

Perform(Segment?: boolean): void;

USplitValues(): NCollection_HSequence_double;

VSplitValues(): NCollection_HSequence_double;

Status(status: ShapeExtend_Status): boolean;

ResSurfaces(): ShapeExtend_CompositeSurface;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitSurfaceAngle: declare class ShapeUpgrade_SplitSurfaceAngle extends ShapeUpgrade_SplitSurface

constructor

SetMaxAngle(MaxAngle: number): void;

MaxAngle(): number;

Compute(Segment: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitSurfaceArea: declare class ShapeUpgrade_SplitSurfaceArea extends ShapeUpgrade_SplitSurface

constructor

NbParts(): number;

SetSplittingIntoSquares(theIsSplittingIntoSquares: boolean): void;

SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

Compute(Segment?: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_SplitSurfaceContinuity: declare class ShapeUpgrade_SplitSurfaceContinuity extends ShapeUpgrade_SplitSurface

constructor

SetCriterion(Criterion: GeomAbs_Shape): void;

SetTolerance(Tol: number): void;

Compute(Segment: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_Tool: declare class ShapeUpgrade_Tool extends Standard_Transient

constructor

Set(tool: ShapeUpgrade_Tool): void;

SetContext(context: ShapeBuild_ReShape): void;

Context(): ShapeBuild_ReShape;

SetPrecision(preci: number): void;

Precision(): number;

SetMinTolerance(mintol: number): void;

MinTolerance(): number;

SetMaxTolerance(maxtol: number): void;

MaxTolerance(): number;

LimitTolerance(toler: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_UnifySameDomain: declare class ShapeUpgrade_UnifySameDomain extends Standard_Transient

constructor

Initialize(aShape: TopoDS_Shape, UnifyEdges?: boolean, UnifyFaces?: boolean, ConcatBSplines?: boolean): void;

AllowInternalEdges(theValue: boolean): void;

KeepShape(theShape: TopoDS_Shape): void;

KeepShapes(theShapes: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

SetSafeInputMode(theValue: boolean): void;

SetLinearTolerance(theValue: number): void;

SetAngularTolerance(theValue: number): void;

Build(): void;

Shape(): TopoDS_Shape;

History(): BRepTools_History;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_WireDivide: declare class ShapeUpgrade_WireDivide extends ShapeUpgrade_Tool

constructor

Init(W: TopoDS_Wire, F: TopoDS_Face): void;
Init(W: TopoDS_Wire, S: Geom_Surface): void;
Init(W: TopoDS_Wire, F: TopoDS_Face): void;
Init(W: TopoDS_Wire, S: Geom_Surface): void;

Load(W: TopoDS_Wire): void;
Load(E: TopoDS_Edge): void;
Load(W: TopoDS_Wire): void;
Load(E: TopoDS_Edge): void;

SetFace(F: TopoDS_Face): void;

SetSurface(S: Geom_Surface): void;
SetSurface(S: Geom_Surface, L: TopLoc_Location): void;
SetSurface(S: Geom_Surface): void;
SetSurface(S: Geom_Surface, L: TopLoc_Location): void;

Perform(): void;

Wire(): TopoDS_Wire;

Status(status: ShapeExtend_Status): boolean;

SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

SetTransferParamTool(TransferParam: ShapeAnalysis_TransferParameters): void;

SetEdgeDivideTool(edgeDivideTool: ShapeUpgrade_EdgeDivide): void;

GetEdgeDivideTool(): ShapeUpgrade_EdgeDivide;

GetTransferParamTool(): ShapeAnalysis_TransferParameters;

SetEdgeMode(EdgeMode: number): void;

SetFixSmallCurveTool(FixSmallCurvesTool: ShapeUpgrade_FixSmallCurves): void;

GetFixSmallCurveTool(): ShapeUpgrade_FixSmallCurves;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
