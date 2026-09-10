# libcascade — ShapeUpgrade

22 top-level symbols. Signatures are verbatim typescript.

// This package provides tools for splitting and converting shapes by some criteria
ShapeUpgrade: declare class ShapeUpgrade

constructor

// Unifies same domain faces and edges of specified shape
static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };
static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ClosedEdgeDivide: declare class ShapeUpgrade_ClosedEdgeDivide extends ShapeUpgrade_EdgeDivide

constructor

Compute(E: TopoDS_Edge): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Divides a Face with one or more seam edge to avoid closed faces
ShapeUpgrade_ClosedFaceDivide: declare class ShapeUpgrade_ClosedFaceDivide extends ShapeUpgrade_FaceDivide

constructor

// Performs splitting of surface and computes the shell from source face
SplitSurface(theArea?: number): boolean;

// Sets the number of cutting lines by which closed face will be split
SetNbSplitPoints(num: number): void;

// Returns the number of splitting points
GetNbSplitPoints(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// converts/splits a 2d curve to a list of beziers
ShapeUpgrade_ConvertCurve2dToBezier: declare class ShapeUpgrade_ConvertCurve2dToBezier extends ShapeUpgrade_SplitCurve2d

constructor

// Converts curve into a list of beziers, and stores the splitting parameters on original curve
Compute(): void;

// Splits a list of beziers computed by Compute method according the split values and splitting parameters
Build(Segment: boolean): void;

// Returns the list of split parameters in original curve parametrisation
SplitParams(): NCollection_HSequence_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// converts/splits a 3d curve of any type to a list of beziers
ShapeUpgrade_ConvertCurve3dToBezier: declare class ShapeUpgrade_ConvertCurve3dToBezier extends ShapeUpgrade_SplitCurve3d

constructor

// Sets mode for conversion {@link Geom_Line `Geom_Line`} to bezier
SetLineMode(mode: boolean): void;

// Returns the {@link Geom_Line `Geom_Line`} conversion mode
GetLineMode(): boolean;

// Sets mode for conversion {@link Geom_Circle `Geom_Circle`} to bezier
SetCircleMode(mode: boolean): void;

// Returns the {@link Geom_Circle `Geom_Circle`} conversion mode
GetCircleMode(): boolean;

// Returns the {@link Geom_Conic `Geom_Conic`} conversion mode
SetConicMode(mode: boolean): void;

// Performs converting and computes the resulting shape
GetConicMode(): boolean;

// Converts curve into a list of beziers, and stores the splitting parameters on original curve
Compute(): void;

// Splits a list of beziers computed by Compute method according the split values and splitting parameters
Build(Segment: boolean): void;

// Returns the list of split parameters in original curve parametrisation
SplitParams(): NCollection_HSequence_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Converts a plane, bspline surface, surface of revolution, surface of extrusion, offset surface to grid of bezier basis surface ( bezier surface, surface of revolution based on bezier curve, offset surface based on any previous type)
ShapeUpgrade_ConvertSurfaceToBezierBasis: declare class ShapeUpgrade_ConvertSurfaceToBezierBasis extends ShapeUpgrade_SplitSurface

constructor

// Splits a list of beziers computed by Compute method according the split values and splitting parameters
Build(Segment: boolean): void;

// Converts surface into a grid of bezier based surfaces, and stores this grid
Compute(Segment: boolean): void;

// Returns the grid of bezier based surfaces correspondent to original surface
Segments(): ShapeExtend_CompositeSurface;

// Sets mode for conversion {@link Geom_Plane `Geom_Plane`} to Bezier
SetPlaneMode(mode: boolean): void;

// Returns the Geom_Pline conversion mode
GetPlaneMode(): boolean;

// Sets mode for conversion {@link Geom_SurfaceOfRevolution `Geom_SurfaceOfRevolution`} to Bezier
SetRevolutionMode(mode: boolean): void;

// Returns the {@link Geom_SurfaceOfRevolution `Geom_SurfaceOfRevolution`} conversion mode
GetRevolutionMode(): boolean;

// Sets mode for conversion {@link Geom_SurfaceOfLinearExtrusion `Geom_SurfaceOfLinearExtrusion`} to Bezier
SetExtrusionMode(mode: boolean): void;

// Returns the {@link Geom_SurfaceOfLinearExtrusion `Geom_SurfaceOfLinearExtrusion`} conversion mode
GetExtrusionMode(): boolean;

// Sets mode for conversion {@link Geom_BSplineSurface `Geom_BSplineSurface`} to Bezier
SetBSplineMode(mode: boolean): void;

// Returns the {@link Geom_BSplineSurface `Geom_BSplineSurface`} conversion mode
GetBSplineMode(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_EdgeDivide: declare class ShapeUpgrade_EdgeDivide extends ShapeUpgrade_Tool

constructor

Clear(): void;

// Sets supporting surface by face
SetFace(F: TopoDS_Face): void;

Compute(E: TopoDS_Edge): boolean;

HasCurve2d(): boolean;

HasCurve3d(): boolean;

Knots2d(): NCollection_HSequence_double;

Knots3d(): NCollection_HSequence_double;

// Sets the tool for splitting pcurves
SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

// Sets the tool for splitting 3D curves
SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

// Returns the tool for splitting pcurves
GetSplitCurve2dTool(): ShapeUpgrade_SplitCurve2d;

// Returns the tool for splitting 3D curves
GetSplitCurve3dTool(): ShapeUpgrade_SplitCurve3d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Divides a Face (both edges in the wires, by splitting curves and pcurves, and the face itself, by splitting supporting surface) according to splitting criteria
ShapeUpgrade_FaceDivide: declare class ShapeUpgrade_FaceDivide extends ShapeUpgrade_Tool

constructor

// Initialize by a Face
Init(F: TopoDS_Face): void;

// Purpose sets mode for trimming (segment) surface by wire UV bounds
SetSurfaceSegmentMode(Segment: boolean): void;

// Performs splitting and computes the resulting shell The context is used to keep track of former splittings in order to keep sharings
Perform(theArea?: number): boolean;

// Performs splitting of surface and computes the shell from source face
SplitSurface(theArea?: number): boolean;

// Performs splitting of curves of all the edges in the shape and divides these edges
SplitCurves(): boolean;

// Gives the resulting Shell, or Face, or Null shape if not done
Result(): TopoDS_Shape;

// Queries the status of last call to Perform OK
Status(status: ShapeExtend_Status): boolean;

// Sets the tool for splitting surfaces
SetSplitSurfaceTool(splitSurfaceTool: ShapeUpgrade_SplitSurface): void;

// Sets the tool for dividing edges on Face
SetWireDivideTool(wireDivideTool: ShapeUpgrade_WireDivide): void;

// Returns the tool for splitting surfaces
GetSplitSurfaceTool(): ShapeUpgrade_SplitSurface;

// Returns the tool for dividing edges on Face
GetWireDivideTool(): ShapeUpgrade_WireDivide;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Divides face by max area criterium
ShapeUpgrade_FaceDivideArea: declare class ShapeUpgrade_FaceDivideArea extends ShapeUpgrade_FaceDivide

constructor

// Performs splitting and computes the resulting shell The context is used to keep track of former splittings
Perform(theArea?: number): boolean;

// Set max area allowed for faces
MaxArea(): number;

// Set number of parts expected
NbParts(): number;

// Set fixed numbers of splits in U and V directions
SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

// Set splitting mode If the mode is "splitting by number", the face is splitted approximately into <myNbParts> parts, the parts are similar to squares in 2D
SetSplittingByNumber(theIsSplittingByNumber: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_FixSmallBezierCurves: declare class ShapeUpgrade_FixSmallBezierCurves extends ShapeUpgrade_FixSmallCurves

constructor

Approx(First: number, Last: number): { returnValue: boolean; Curve3d: Geom_Curve; Curve2d: Geom2d_Curve; Curve2dR: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_FixSmallCurves: declare class ShapeUpgrade_FixSmallCurves extends ShapeUpgrade_Tool

constructor

Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;

Approx(First: number, Last: number): { returnValue: boolean; Curve3d: Geom_Curve; Curve2d: Geom2d_Curve; Curve2dR: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

// Sets the tool for splitting 3D curves
SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

// Sets the tool for splitting pcurves
SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

// Queries the status of last call to Perform OK
Status(status: ShapeExtend_Status): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Removes all internal wires having area less than specified min area
ShapeUpgrade_RemoveInternalWires: declare class ShapeUpgrade_RemoveInternalWires extends ShapeUpgrade_Tool

constructor

// Initialize by a Shape
Init(theShape: TopoDS_Shape): void;

// Removes all internal wires having area less than area specified as minimal allowed area
Perform(): boolean;
Perform(theSeqShapes: NCollection_Sequence_TopoDS_Shape): boolean;
Perform(): boolean;
Perform(theSeqShapes: NCollection_Sequence_TopoDS_Shape): boolean;

// Get result shape
GetResult(): TopoDS_Shape;

// Set min area allowed for holes( all holes having area less than mi area will be removed)
MinArea(): number;

// Set mode which manage removing faces which have outer wires consisting only from edges belonginig to removed internal wires
RemoveFaceMode(): boolean;

// Returns sequence of removed faces
RemovedFaces(): NCollection_Sequence_TopoDS_Shape;

// Returns sequence of removed faces
RemovedWires(): NCollection_Sequence_TopoDS_Shape;

// Queries status of last call to `Perform()`
Status(theStatus: ShapeExtend_Status): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Removes all locations sub-shapes of specified shape
ShapeUpgrade_RemoveLocations: declare class ShapeUpgrade_RemoveLocations extends Standard_Transient

constructor

// Removes all location correspondingly to RemoveLevel
Remove(theShape: TopoDS_Shape): boolean;

// Returns shape with removed locations
GetResult(): TopoDS_Shape;

// sets level starting with that location will be removed, by default TopAbs_SHAPE
SetRemoveLevel(theLevel: TopAbs_ShapeEnum): void;

// sets level starting with that location will be removed.Value of level can be set to TopAbs_SHAPE,TopAbs_COMPOUND,TopAbs_SOLID,TopAbs_SHELL,TopAbs_FACE.By default TopAbs_SHAPE
RemoveLevel(): TopAbs_ShapeEnum;

// Returns modified shape obtained from initial shape
ModifiedShape(theInitShape: TopoDS_Shape): TopoDS_Shape;

// Returns map of modified shapes
GetModifiedShapesMap(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// API class for performing conversion of 3D, 2D curves to bezier curves and surfaces to bezier based surfaces ( bezier surface, surface of revolution based on bezier curve, offset surface based on any previous type)
ShapeUpgrade_ShapeConvertToBezier: declare class ShapeUpgrade_ShapeConvertToBezier extends ShapeUpgrade_ShapeDivide

constructor

// Sets mode for conversion 2D curves to bezier
Set2dConversion(mode: boolean): void;

// Returns the 2D conversion mode
Get2dConversion(): boolean;

// Sets mode for conversion 3d curves to bezier
Set3dConversion(mode: boolean): void;

// Returns the 3D conversion mode
Get3dConversion(): boolean;

// Sets mode for conversion surfaces curves to bezier basis
SetSurfaceConversion(mode: boolean): void;

// Returns the surface conversion mode
GetSurfaceConversion(): boolean;

// Sets mode for conversion {@link Geom_Line `Geom_Line`} to bezier
Set3dLineConversion(mode: boolean): void;

// Returns the {@link Geom_Line `Geom_Line`} conversion mode
Get3dLineConversion(): boolean;

// Sets mode for conversion {@link Geom_Circle `Geom_Circle`} to bezier
Set3dCircleConversion(mode: boolean): void;

// Returns the {@link Geom_Circle `Geom_Circle`} conversion mode
Get3dCircleConversion(): boolean;

// Sets mode for conversion {@link Geom_Conic `Geom_Conic`} to bezier
Set3dConicConversion(mode: boolean): void;

// Returns the {@link Geom_Conic `Geom_Conic`} conversion mode
Get3dConicConversion(): boolean;

// Sets mode for conversion {@link Geom_Plane `Geom_Plane`} to Bezier
SetPlaneMode(mode: boolean): void;

// Returns the Geom_Pline conversion mode
GetPlaneMode(): boolean;

// Sets mode for conversion {@link Geom_SurfaceOfRevolution `Geom_SurfaceOfRevolution`} to Bezier
SetRevolutionMode(mode: boolean): void;

// Returns the {@link Geom_SurfaceOfRevolution `Geom_SurfaceOfRevolution`} conversion mode
GetRevolutionMode(): boolean;

// Sets mode for conversion {@link Geom_SurfaceOfLinearExtrusion `Geom_SurfaceOfLinearExtrusion`} to Bezier
SetExtrusionMode(mode: boolean): void;

// Returns the {@link Geom_SurfaceOfLinearExtrusion `Geom_SurfaceOfLinearExtrusion`} conversion mode
GetExtrusionMode(): boolean;

// Sets mode for conversion {@link Geom_BSplineSurface `Geom_BSplineSurface`} to Bezier
SetBSplineMode(mode: boolean): void;

// Returns the {@link Geom_BSplineSurface `Geom_BSplineSurface`} conversion mode
GetBSplineMode(): boolean;

// Performs converting and computes the resulting shape
Perform(newContext?: boolean): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Divides a all faces in shell with given criteria Shell
ShapeUpgrade_ShapeDivide: declare class ShapeUpgrade_ShapeDivide

constructor

// Initialize by a Shape
Init(S: TopoDS_Shape): void;

// Defines the spatial precision used for splitting
SetPrecision(Prec: number): void;

// Sets maximal allowed tolerance
SetMaxTolerance(maxtol: number): void;

// Sets minimal allowed tolerance
SetMinTolerance(mintol: number): void;

// Purpose sets mode for trimming (segment) surface by wire UV bounds
SetSurfaceSegmentMode(Segment: boolean): void;

// Performs splitting and computes the resulting shape If newContext is True (default), the internal context will be cleared at start, else previous substitutions will be acting
Perform(newContext?: boolean): boolean;

// Gives the resulting Shape, or Null shape if not done
Result(): TopoDS_Shape;

// Returns context with all the modifications made during last call(s) to `Perform()` recorded
GetContext(): ShapeBuild_ReShape;

// Sets context with recorded modifications to be applied during next call(s) to Perform(shape,false)
SetContext(context: ShapeBuild_ReShape): void;

// Sets message registrator
SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

// Returns message registrator
MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

// Sends a message to be attached to the shape
SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity?: Message_Gravity): void;

// Queries the status of last call to Perform OK
Status(status: ShapeExtend_Status): boolean;

// Sets the tool for splitting faces
SetSplitFaceTool(splitFaceTool: ShapeUpgrade_FaceDivide): void;

// Sets mode for splitting 3d curves from edges
SetEdgeMode(aEdgeMode: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Splits all surfaces of revolution, cylindrical, toroidal, conical, spherical surfaces in the given shape so that each resulting segment covers not more than defined number of degrees (to segments less than 90)
ShapeUpgrade_ShapeDivideAngle: declare class ShapeUpgrade_ShapeDivideAngle extends ShapeUpgrade_ShapeDivide

constructor

// Resets tool for splitting face with given angle
InitTool(MaxAngle: number): void;

// Set maximal angle (calls InitTool)
SetMaxAngle(MaxAngle: number): void;

// Returns maximal angle
MaxAngle(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Divides faces from specified shape by max area criterium
ShapeUpgrade_ShapeDivideArea: declare class ShapeUpgrade_ShapeDivideArea extends ShapeUpgrade_ShapeDivide

constructor

// Set max area allowed for faces
MaxArea(): number;

// Set number of parts expected for the case of splitting by number
NbParts(): number;

// Set fixed numbers of splits in U and V directions
SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

// Set splitting mode If the mode is "splitting by number", the face is splitted approximately into <myNbParts> parts, the parts are similar to squares in 2D
SetSplittingByNumber(theIsSplittingByNumber: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Divides all closed faces in the shape
ShapeUpgrade_ShapeDivideClosed: declare class ShapeUpgrade_ShapeDivideClosed extends ShapeUpgrade_ShapeDivide

constructor

// Sets the number of cuts applied to divide closed faces
SetNbSplitPoints(num: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideClosedEdges: declare class ShapeUpgrade_ShapeDivideClosedEdges extends ShapeUpgrade_ShapeDivide

constructor

// Sets the number of cuts applied to divide closed edges
SetNbSplitPoints(num: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// API Tool for converting shapes with C0 geometry into C1 ones
ShapeUpgrade_ShapeDivideContinuity: declare class ShapeUpgrade_ShapeDivideContinuity extends ShapeUpgrade_ShapeDivide

constructor

// Sets tolerance
SetTolerance(Tol: number): void;

// Sets tolerance
SetTolerance2d(Tol: number): void;

// Defines a criterion of continuity for the boundary (all the Wires)
SetBoundaryCriterion(Criterion?: GeomAbs_Shape): void;

// Defines a criterion of continuity for the boundary (all the pcurves of Wires)
SetPCurveCriterion(Criterion?: GeomAbs_Shape): void;

// Defines a criterion of continuity for the boundary (all the Wires)
SetSurfaceCriterion(Criterion?: GeomAbs_Shape): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a tool for applying sewing algorithm from {@link BRepBuilderAPI `BRepBuilderAPI`}
ShapeUpgrade_ShellSewing: declare class ShapeUpgrade_ShellSewing

constructor

// Builds a new shape from a former one, by calling Sewing from {@link BRepBuilderAPI `BRepBuilderAPI`}
ApplySewing(shape: TopoDS_Shape, tol?: number): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Splits a curve with a criterion
ShapeUpgrade_SplitCurve: declare class ShapeUpgrade_SplitCurve extends Standard_Transient

constructor

// Initializes with curve first and last parameters
Init(First: number, Last: number): void;

// Sets the parameters where splitting has to be done
SetSplitValues(SplitValues: NCollection_HSequence_double): void;

// If Segment is True, the result is composed with segments of the curve bounded by the SplitValues
Build(Segment: boolean): void;

// returns all the splitting values including the First and Last parameters of the input curve Merges input split values and new ones into myGlobalKnots
SplitValues(): NCollection_HSequence_double;

// Calculates points for correction/splitting of the curve
Compute(): void;

// Performs correction/splitting of the curve
Perform(Segment?: boolean): void;

// Returns the status OK - no splitting is needed DONE1 - splitting required and gives more than one segment DONE2 - splitting is required, but gives only one segment (initial) DONE3 - geometric form of the curve or parametrisation is modified
Status(status: ShapeExtend_Status): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
