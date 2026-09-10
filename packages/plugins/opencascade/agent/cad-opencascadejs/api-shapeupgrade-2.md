# libcascade — ShapeUpgrade (2)

11 top-level symbols. Signatures are verbatim typescript.

// Splits a 2d curve with a criterion
ShapeUpgrade_SplitCurve2d: declare class ShapeUpgrade_SplitCurve2d extends ShapeUpgrade_SplitCurve

constructor

// Initializes with pcurve with its first and last parameters
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;

// If Segment is True, the result is composed with segments of the curve bounded by the SplitValues
Build(Segment: boolean): void;

GetCurves(): NCollection_HArray1_handle_Geom2d_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Corrects/splits a 2d curve with a continuity criterion
ShapeUpgrade_SplitCurve2dContinuity: declare class ShapeUpgrade_SplitCurve2dContinuity extends ShapeUpgrade_SplitCurve2d

constructor

// Sets criterion for splitting
SetCriterion(Criterion: GeomAbs_Shape): void;

// Sets tolerance
SetTolerance(Tol: number): void;

// Calculates points for correction/splitting of the curve
Compute(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Splits a 3d curve with a criterion
ShapeUpgrade_SplitCurve3d: declare class ShapeUpgrade_SplitCurve3d extends ShapeUpgrade_SplitCurve

constructor

// Initializes with curve with its first and last parameters
Init(C: Geom_Curve): void;
Init(C: Geom_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom_Curve, First: number, Last: number): void;
Init(First: number, Last: number): void;

// If Segment is True, the result is composed with segments of the curve bounded by the SplitValues
Build(Segment: boolean): void;

GetCurves(): NCollection_HArray1_handle_Geom_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Corrects/splits a 2d curve with a continuity criterion
ShapeUpgrade_SplitCurve3dContinuity: declare class ShapeUpgrade_SplitCurve3dContinuity extends ShapeUpgrade_SplitCurve3d

constructor

// Sets criterion for splitting
SetCriterion(Criterion: GeomAbs_Shape): void;

// Sets tolerance
SetTolerance(Tol: number): void;

// Calculates points for correction/splitting of the curve
Compute(): void;

GetCurve(): Geom_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Splits a Surface with a criterion
ShapeUpgrade_SplitSurface: declare class ShapeUpgrade_SplitSurface extends Standard_Transient

constructor

// Initializes with single supporting surface
Init(S: Geom_Surface): void;
Init(S: Geom_Surface, UFirst: number, ULast: number, VFirst: number, VLast: number, theArea: number): void;
Init(S: Geom_Surface): void;
Init(S: Geom_Surface, UFirst: number, ULast: number, VFirst: number, VLast: number, theArea: number): void;

// Sets U parameters where splitting has to be done
SetUSplitValues(UValues: NCollection_HSequence_double): void;

// Sets V parameters where splitting has to be done
SetVSplitValues(VValues: NCollection_HSequence_double): void;

// Performs splitting of the supporting surface
Build(Segment: boolean): void;

// Calculates points for correction/splitting of the surface
Compute(Segment?: boolean): void;

// Performs correction/splitting of the surface
Perform(Segment?: boolean): void;

// returns all the U splitting values including the First and Last parameters of the input surface
USplitValues(): NCollection_HSequence_double;

// returns all the splitting V values including the First and Last parameters of the input surface
VSplitValues(): NCollection_HSequence_double;

// Returns the status OK - no splitting is needed DONE1 - splitting required and gives more than one patch DONE2 - splitting is required, but gives only single patch (initial) DONE3 - geometric form of the surface or parametrisation is modified
Status(status: ShapeExtend_Status): boolean;

// Returns obtained surfaces after splitting as CompositeSurface
ResSurfaces(): ShapeExtend_CompositeSurface;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Splits a surfaces of revolution, cylindrical, toroidal, conical, spherical so that each resulting segment covers not more than defined number of degrees
ShapeUpgrade_SplitSurfaceAngle: declare class ShapeUpgrade_SplitSurfaceAngle extends ShapeUpgrade_SplitSurface

constructor

// Set maximal angle
SetMaxAngle(MaxAngle: number): void;

// Returns maximal angle
MaxAngle(): number;

// Performs splitting of the supporting surface(s)
Compute(Segment: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Split surface in the parametric space in according specified number of splits on the
ShapeUpgrade_SplitSurfaceArea: declare class ShapeUpgrade_SplitSurfaceArea extends ShapeUpgrade_SplitSurface

constructor

// Set number of split for surfaces
NbParts(): number;

// Set splitting mode If the mode is "splitting into squares", the face is splitted approximately into <myNbParts> parts, the parts are similar to squares in 2D
SetSplittingIntoSquares(theIsSplittingIntoSquares: boolean): void;

// Set fixed numbers of splits in U and V directions
SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

// Calculates points for correction/splitting of the surface
Compute(Segment?: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Splits a Surface with a continuity criterion
ShapeUpgrade_SplitSurfaceContinuity: declare class ShapeUpgrade_SplitSurfaceContinuity extends ShapeUpgrade_SplitSurface

constructor

// Sets criterion for splitting
SetCriterion(Criterion: GeomAbs_Shape): void;

// Sets tolerance
SetTolerance(Tol: number): void;

// Calculates points for correction/splitting of the surface
Compute(Segment: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool is a root class for splitting classes Provides context for recording changes, basic precision value and limit (minimal and maximal) values for tolerances
ShapeUpgrade_Tool: declare class ShapeUpgrade_Tool extends Standard_Transient

constructor

// Copy all fields from another Root object
Set(tool: ShapeUpgrade_Tool): void;

// Sets context
SetContext(context: ShapeBuild_ReShape): void;

// Returns context
Context(): ShapeBuild_ReShape;

// Sets basic precision value
SetPrecision(preci: number): void;

// Returns basic precision value
Precision(): number;

// Sets minimal allowed tolerance
SetMinTolerance(mintol: number): void;

// Returns minimal allowed tolerance
MinTolerance(): number;

// Sets maximal allowed tolerance
SetMaxTolerance(maxtol: number): void;

// Returns maximal allowed tolerance
MaxTolerance(): number;

// Returns tolerance limited by [myMinTol,myMaxTol]
LimitTolerance(toler: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This tool tries to unify faces and edges of the shape which lie on the same geometry
ShapeUpgrade_UnifySameDomain: declare class ShapeUpgrade_UnifySameDomain extends Standard_Transient

constructor

// Initializes with a shape and necessary flags
Initialize(aShape: TopoDS_Shape, UnifyEdges?: boolean, UnifyFaces?: boolean, ConcatBSplines?: boolean): void;

// Sets the flag defining whether it is allowed to create internal edges inside merged faces in the case of non-manifold topology
AllowInternalEdges(theValue: boolean): void;

// Sets the shape for avoid merging of the faces/edges
KeepShape(theShape: TopoDS_Shape): void;

// Sets the map of shapes for avoid merging of the faces/edges
KeepShapes(theShapes: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// Sets the flag defining the behavior of the algorithm regarding modification of input shape
SetSafeInputMode(theValue: boolean): void;

// Sets the linear tolerance
SetLinearTolerance(theValue: number): void;

// Sets the angular tolerance
SetAngularTolerance(theValue: number): void;

// Performs unification and builds the resulting shape
Build(): void;

// Gives the resulting shape
Shape(): TopoDS_Shape;

// Returns the history of the processed shapes
History(): BRepTools_History;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Divides edges in the wire lying on the face or free wires or free edges with a criterion
ShapeUpgrade_WireDivide: declare class ShapeUpgrade_WireDivide extends ShapeUpgrade_Tool

constructor

// Initializes by wire and face
Init(W: TopoDS_Wire, F: TopoDS_Face): void;
Init(W: TopoDS_Wire, S: Geom_Surface): void;
Init(W: TopoDS_Wire, F: TopoDS_Face): void;
Init(W: TopoDS_Wire, S: Geom_Surface): void;

// Loads working wire
Load(W: TopoDS_Wire): void;
Load(E: TopoDS_Edge): void;
Load(W: TopoDS_Wire): void;
Load(E: TopoDS_Edge): void;

// Sets supporting surface by face
SetFace(F: TopoDS_Face): void;

// Sets supporting surface
SetSurface(S: Geom_Surface): void;
SetSurface(S: Geom_Surface, L: TopLoc_Location): void;
SetSurface(S: Geom_Surface): void;
SetSurface(S: Geom_Surface, L: TopLoc_Location): void;

// Computes the resulting wire by splitting all the edges according to splitting criteria
Perform(): void;

// Gives the resulting Wire (equal to initial one if not done or Null if not loaded)
Wire(): TopoDS_Wire;

// Queries status of last call to `Perform()` OK - no edges were split, wire left untouched DONE1 - some edges were split FAIL1 - some edges have no 3d curve (skipped) FAIL2 - some edges have no pcurve (skipped)
Status(status: ShapeExtend_Status): boolean;

// Sets the tool for splitting 3D curves
SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

// Sets the tool for splitting pcurves
SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

// Sets the tool for Transfer parameters between curves and pcurves
SetTransferParamTool(TransferParam: ShapeAnalysis_TransferParameters): void;

// Sets tool for splitting edge
SetEdgeDivideTool(edgeDivideTool: ShapeUpgrade_EdgeDivide): void;

// returns tool for splitting edges
GetEdgeDivideTool(): ShapeUpgrade_EdgeDivide;

// Returns the tool for Transfer of parameters
GetTransferParamTool(): ShapeAnalysis_TransferParameters;

// Sets mode for splitting 3d curves from edges
SetEdgeMode(EdgeMode: number): void;

// Sets tool for fixing small curves with specified min tolerance;
SetFixSmallCurveTool(FixSmallCurvesTool: ShapeUpgrade_FixSmallCurves): void;

// Returns tool for fixing small curves
GetFixSmallCurveTool(): ShapeUpgrade_FixSmallCurves;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
