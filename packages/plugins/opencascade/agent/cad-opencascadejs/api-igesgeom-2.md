# libcascade — IGESGeom (2)

21 top-level symbols. Signatures are verbatim typescript.

// defines IGESOffsetCurve, Type <130> Form <0> in package {@link IGESGeom`IGESGeom`} An OffsetCurve entity contains the data necessary to determine the offset of a given curve C
IGESGeom_OffsetCurve: declare class IGESGeom_OffsetCurve extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class OffsetCurve
Init(aBaseCurve: IGESData_IGESEntity, anOffsetType: number, aFunction: IGESData_IGESEntity, aFunctionCoord: number, aTaperedOffsetType: number, offDistance1: number, arcLength1: number, offDistance2: number, arcLength2: number, aNormalVec: gp_XYZ, anOffsetParam: number, anotherOffsetParam: number): void;

// returns the curve to be offset
BaseCurve(): IGESData_IGESEntity;

// returns the offset distance flag 1 = Single value offset (uniform distance) 2 = Offset distance varying linearly 3 = Offset distance specified as a function
OffsetType(): number;

// returns the function defining the offset if at all the offset is described as a function or Null Handle
Function(): IGESData_IGESEntity;

// returns True if function defining the offset is present
HasFunction(): boolean;

// returns particular coordinate of the curve which describes offset as a function of its parameters
FunctionParameter(): number;

// returns tapered offset type flag (only used if `OffsetType()` = 2 or 3) 1 = Function of arc length 2 = Function of parameter
TaperedOffsetType(): number;

// returns first offset distance (only used if `OffsetType()` = 1 or 2)
FirstOffsetDistance(): number;

// returns arc length or parameter value (depending on value of offset distance flag) of first offset distance (only used if `OffsetType()` = 2)
ArcLength1(): number;

// returns the second offset distance
SecondOffsetDistance(): number;

// returns arc length or parameter value (depending on value of offset distance flag) of second offset distance (only used if `OffsetType()` = 2)
ArcLength2(): number;

// returns unit vector normal to plane containing curve to be offset
NormalVector(): gp_Vec;

// returns unit vector normal to plane containing curve to be offset after applying Transf
TransformedNormalVector(): gp_Vec;

Parameters(StartParam?: number, EndParam?: number): { StartParam: number; EndParam: number };

// returns Start Parameter value of the offset curve
StartParameter(): number;

// returns End Parameter value of the offset curve
EndParameter(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESOffsetSurface, Type <140> Form <0> in package {@link IGESGeom`IGESGeom`} An offset surface is a surface defined in terms of an already existing surface.If S(u, v) is a parametrised regular surface and N(u, v) is a differential field of unit normal vectors defined on the whole surface, and "d" a fixed non zero real number, then offset surface to S is a parametrised surface S(u, v) given by O(u, v) = S(u, v) + d \* N(u, v)
IGESGeom_OffsetSurface: declare class IGESGeom_OffsetSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class OffsetSurface
Init(anIndicatoR: gp_XYZ, aDistance: number, aSurface: IGESData_IGESEntity): void;

// returns the offset indicator
OffsetIndicator(): gp_Vec;

// returns the offset indicator after applying Transf
TransformedOffsetIndicator(): gp_Vec;

// returns the distance by which surface is offset
Distance(): number;

// returns the surface that has been offset
Surface(): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESPlane, Type <108> Form <-1,0,1> in package {@link IGESGeom`IGESGeom`} A plane entity can be used to represent unbounded plane, as well as bounded portion of a plane
IGESGeom_Plane: declare class IGESGeom_Plane extends IGESData_IGESEntity

constructor

Init(A: number, B: number, C: number, D: number, aCurve: IGESData_IGESEntity, attach: gp_XYZ, aSize: number): void;

// Changes FormNumber (indicates the Type of Bound
SetFormNumber(form: number): void;

Equation(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

TransformedEquation(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

// returns True if there exists a bounding curve
HasBoundingCurve(): boolean;

// returns True if bounding curve exists and bounded portion is negative
HasBoundingCurveHole(): boolean;

// returns Optional Bounding Curve, can be positive (normal clipping) or negative (hole) according to Form Number
BoundingCurve(): IGESData_IGESEntity;

// returns True if `SymbolSize()` > 0, False if `SymbolSize()` = 0
HasSymbolAttach(): boolean;

// returns (X, Y, Z) if symbol exists else returns (0, 0, 0)
SymbolAttach(): gp_Pnt;

// returns (X, Y, Z) if symbol exists after applying Transf
TransformedSymbolAttach(): gp_Pnt;

// Size of optional display symbol
SymbolSize(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESPoint, Type <116> Form <0> in package {@link IGESGeom`IGESGeom`}
IGESGeom_Point: declare class IGESGeom_Point extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Point
Init(aPoint: gp_XYZ, aSymbol: IGESBasic_SubfigureDef): void;

// returns coordinates of the point
Value(): gp_Pnt;

// returns coordinates of the point after applying Transf
TransformedValue(): gp_Pnt;

// returns True if symbol exists
HasDisplaySymbol(): boolean;

// returns display symbol entity if it exists
DisplaySymbol(): IGESBasic_SubfigureDef;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Protocol for {@link IGESGeom`IGESGeom`}
IGESGeom_Protocol: declare class IGESGeom_Protocol extends IGESData_Protocol

constructor

// Gives the count of Resource Protocol
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type This Case Number is then used in Libraries
TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Geom File Access Module for {@link IGESGeom`IGESGeom`} (specific parts) Specific actions concern
IGESGeom_ReadWriteModule: declare class IGESGeom_ReadWriteModule extends IGESData_ReadWriteModule

constructor

// Defines Case Numbers for Entities of {@link IGESGeom`IGESGeom`}
CaseIGES(typenum: number, formnum: number): number;

// Writes own parameters to IGESWriter
WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESRuledSurface, Type <118> Form <0-1> in package {@link IGESGeom`IGESGeom`} A ruled surface is formed by moving a line connecting points of equal relative arc length or equal relative parametric value on two parametric curves from a start point to a terminate point on the curves
IGESGeom_RuledSurface: declare class IGESGeom_RuledSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class RuledSurface
Init(aCurve: IGESData_IGESEntity, anotherCurve: IGESData_IGESEntity, aDirFlag: number, aDevFlag: number): void;

// Sets <me> to be Ruled by Parameter (Form 1) if <mode> is True, or Ruled by Length (Form 0) else
SetRuledByParameter(mode: boolean): void;

// Returns True if Form is 1
IsRuledByParameter(): boolean;

// returns the first curve
FirstCurve(): IGESData_IGESEntity;

// returns the second curve
SecondCurve(): IGESData_IGESEntity;

// return the sense of direction 0 = Join first to first, last to last 1 = Join first to last, last to first
DirectionFlag(): number;

// returns True if developable else False
IsDevelopable(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Services attached to IGES Entities
IGESGeom_SpecificModule: declare class IGESGeom_SpecificModule extends IGESData_SpecificModule

constructor

// Performs non-ambiguous Correction on Entities which support them (Boundary,ConicArc,Flash,OffsetCurve,TransformationMatrix)
OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGESSplineCurve, Type <112> Form <0> in package {@link IGESGeom`IGESGeom`} The parametric spline is a sequence of parametric polynomial segments
IGESGeom_SplineCurve: declare class IGESGeom_SplineCurve extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SplineCurve
Init(aType: number, aDegree: number, nbDimensions: number, allBreakPoints: NCollection_HArray1_double, allXPolynomials: NCollection_HArray2_double, allYPolynomials: NCollection_HArray2_double, allZPolynomials: NCollection_HArray2_double, allXvalues: NCollection_HArray1_double, allYvalues: NCollection_HArray1_double, allZvalues: NCollection_HArray1_double): void;

// returns the type of Spline curve
SplineType(): number;

// returns the degree of the curve
Degree(): number;

// returns the number of dimensions 2 = Planar 3 = Non-planar
NbDimensions(): number;

// returns the number of segments
NbSegments(): number;

// returns breakpoint of piecewise polynomial raises exception if Index <= 0 or Index > `NbSegments()` + 1
BreakPoint(Index: number): number;

// returns X coordinate polynomial for segment referred to by Index raises exception if Index <= 0 or Index > `NbSegments()`
XCoordPolynomial(Index: number, AX?: number, BX?: number, CX?: number, DX?: number): { AX: number; BX: number; CX: number; DX: number };

// returns Y coordinate polynomial for segment referred to by Index raises exception if Index <= 0 or Index > `NbSegments()`
YCoordPolynomial(Index: number, AY?: number, BY?: number, CY?: number, DY?: number): { AY: number; BY: number; CY: number; DY: number };

// returns Z coordinate polynomial for segment referred to by Index raises exception if Index <= 0 or Index > `NbSegments()`
ZCoordPolynomial(Index: number, AZ?: number, BZ?: number, CZ?: number, DZ?: number): { AZ: number; BZ: number; CZ: number; DZ: number };

// returns the value of X polynomial, the values of 1st, 2nd and 3rd derivatives of the X polynomial at the terminate point
XValues(TPX0?: number, TPX1?: number, TPX2?: number, TPX3?: number): { TPX0: number; TPX1: number; TPX2: number; TPX3: number };

// returns the value of Y polynomial, the values of 1st, 2nd and 3rd derivatives of the Y polynomial at the termminate point
YValues(TPY0?: number, TPY1?: number, TPY2?: number, TPY3?: number): { TPY0: number; TPY1: number; TPY2: number; TPY3: number };

// returns the value of Z polynomial, the values of 1st, 2nd and 3rd derivatives of the Z polynomial at the termminate point
ZValues(TPZ0?: number, TPZ1?: number, TPZ2?: number, TPZ3?: number): { TPZ0: number; TPZ1: number; TPZ2: number; TPZ3: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESSplineSurface, Type <114> Form <0> in package {@link IGESGeom`IGESGeom`} A parametric spline surface is a grid of polynomial patches
IGESGeom_SplineSurface: declare class IGESGeom_SplineSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SplineSurface
Init(aBoundaryType: number, aPatchType: number, allUBreakpoints: NCollection_HArray1_double, allVBreakpoints: NCollection_HArray1_double, allXCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double, allYCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double, allZCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double): void;

// returns the number of U segments
NbUSegments(): number;

// returns the number of V segments
NbVSegments(): number;

// returns boundary type
BoundaryType(): number;

// returns patch type
PatchType(): number;

// returns U break point of the grid line referred to by anIndex raises exception if anIndex <= 0 or anIndex > `NbUSegments()` + 1
UBreakPoint(anIndex: number): number;

// returns V break point of the grid line referred to by anIndex raises exception if anIndex <= 0 or anIndex > `NbVSegments()` + 1
VBreakPoint(anIndex: number): number;

// returns X polynomial of patch referred to by anIndex1, anIndex2 raises exception if anIndex1 <= 0 or anIndex1 > `NbUSegments()` or anIndex2 <= 0 or anIndex2 > `NbVSegments()`
XPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

// returns Y polynomial of patch referred to by anIndex1, anIndex2 raises exception if anIndex1 <= 0 or anIndex1 > `NbUSegments()` or anIndex2 <= 0 or anIndex2 > `NbVSegments()`
YPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

// returns Z polynomial of patch referred to by anIndex1, anIndex2 raises exception if anIndex1 <= 0 or anIndex1 > `NbUSegments()` or anIndex2 <= 0 or anIndex2 > `NbVSegments()`
ZPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

// returns in one all the polynomial values "in bulk" useful for massive treatments
Polynomials(): { XCoef: NCollection_HArray2_handle_NCollection_HArray1_double; YCoef: NCollection_HArray2_handle_NCollection_HArray1_double; ZCoef: NCollection_HArray2_handle_NCollection_HArray1_double; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESSurfaceOfRevolution, Type <120> Form <0> in package {@link IGESGeom`IGESGeom`} A surface of revolution is defined by an axis of rotation a generatrix, and start and terminate rotation angles
IGESGeom_SurfaceOfRevolution: declare class IGESGeom_SurfaceOfRevolution extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Line
Init(anAxis: IGESGeom_Line, aGeneratrix: IGESData_IGESEntity, aStartAngle: number, anEndAngle: number): void;

// returns the axis of revolution
AxisOfRevolution(): IGESGeom_Line;

// returns the curve which is revolved about the axis
Generatrix(): IGESData_IGESEntity;

// returns start angle of revolution
StartAngle(): number;

// returns end angle of revolution
EndAngle(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESTabulatedCylinder, Type <122> Form <0> in package {@link IGESGeom`IGESGeom`} A tabulated cylinder is a surface formed by moving a line segment called generatrix parallel to itself along a curve called directrix
IGESGeom_TabulatedCylinder: declare class IGESGeom_TabulatedCylinder extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class TabulatedCylinder
Init(aDirectrix: IGESData_IGESEntity, anEnd: gp_XYZ): void;

// returns the directrix curve of the tabulated cylinder
Directrix(): IGESData_IGESEntity;

// returns end point of generatrix of the tabulated cylinder
EndPoint(): gp_Pnt;

// returns end point of generatrix of the tabulated cylinder after applying Transf
TransformedEndPoint(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a BSplineCurve
IGESGeom_ToolBSplineCurve: declare class IGESGeom_ToolBSplineCurve

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_BSplineCurve, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_BSplineCurve): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_BSplineCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_BSplineCurve, entto: IGESGeom_BSplineCurve, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a BSplineSurface
IGESGeom_ToolBSplineSurface: declare class IGESGeom_ToolBSplineSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_BSplineSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_BSplineSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_BSplineSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_BSplineSurface, entto: IGESGeom_BSplineSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Boundary
IGESGeom_ToolBoundary: declare class IGESGeom_ToolBoundary

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_Boundary, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Boundary (if BoundaryType = 0, Nullify all ParameterCurves)
OwnCorrect(ent: IGESGeom_Boundary): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGeom_Boundary): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_Boundary, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_Boundary, entto: IGESGeom_Boundary, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a BoundedSurface
IGESGeom_ToolBoundedSurface: declare class IGESGeom_ToolBoundedSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_BoundedSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_BoundedSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_BoundedSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_BoundedSurface, entto: IGESGeom_BoundedSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a CircularArc
IGESGeom_ToolCircularArc: declare class IGESGeom_ToolCircularArc

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_CircularArc, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_CircularArc): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_CircularArc, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_CircularArc, entto: IGESGeom_CircularArc, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a CompositeCurve
IGESGeom_ToolCompositeCurve: declare class IGESGeom_ToolCompositeCurve

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_CompositeCurve, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_CompositeCurve): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_CompositeCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_CompositeCurve, entto: IGESGeom_CompositeCurve, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ConicArc
IGESGeom_ToolConicArc: declare class IGESGeom_ToolConicArc

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_ConicArc, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a ConicArc (FormNumber recomputed according case Ellips-Parab-Hyperb)
OwnCorrect(ent: IGESGeom_ConicArc): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGeom_ConicArc): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_ConicArc, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_ConicArc, entto: IGESGeom_ConicArc, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a CopiousData
IGESGeom_ToolCopiousData: declare class IGESGeom_ToolCopiousData

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_CopiousData, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_CopiousData): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_CopiousData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_CopiousData, entto: IGESGeom_CopiousData, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a CurveOnSurface
IGESGeom_ToolCurveOnSurface: declare class IGESGeom_ToolCurveOnSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_CurveOnSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a CurveOnSurface (its CurveUV must have UseFlag at 5)
OwnCorrect(ent: IGESGeom_CurveOnSurface): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGeom_CurveOnSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_CurveOnSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_CurveOnSurface, entto: IGESGeom_CurveOnSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
