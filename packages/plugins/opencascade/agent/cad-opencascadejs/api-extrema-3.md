# libcascade — Extrema (3)

11 top-level symbols. Signatures are verbatim typescript.

// Data container for point on surface parameters
Extrema_POnSurfParams: declare class Extrema_POnSurfParams extends Extrema_POnSurf

constructor

// Sets the square distance from this point to another one (e.g
SetSqrDistance(theSqrDistance: number): void;

// Query the square distance from this point to another one
GetSqrDistance(): number;

// Sets the element type on which this point is situated
SetElementType(theElementType: Extrema_ElementType): void;

// Query the element type on which this point is situated
GetElementType(): Extrema_ElementType;

// Sets the U and V indices of an element that contains this point
SetIndices(theIndexU: number, theIndexV: number): void;

// Query the U and V indices of an element that contains this point
GetIndices(theIndexU?: number, theIndexV?: number): { theIndexU: number; theIndexV: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Generic class for computing extremal distances between a point and a curve
Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f: declare class Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f

constructor

// Initializes the algorithm with curve and parameter range
Initialize(theC: Adaptor2d_Curve2d, theUinf: number, theUsup: number, theTolF?: number): void;
// theC: The curve
// theUinf: Lower bound of parameter range
// theUsup: Upper bound of parameter range
// theTolF: Tolerance on function value (default 1.0e-10)

// Performs the extremum computation for the given point
Perform(theP: gp_Pnt2d): void;
// theP: The point to find extrema from

// Returns true if the distances are found
IsDone(): boolean;

// Returns the Nth extremum square distance
SquareDistance(theN: number): number;
// theN: Index of the extremum (1-based)

// Returns the number of extremum distances
NbExt(): number;

// Returns true if the Nth extremum distance is a minimum
IsMin(theN: number): boolean;
// theN: Index of the extremum (1-based)

// Returns the point of the Nth extremum distance
Point(theN: number): Extrema_POnCurv2d;
// theN: Index of the extremum (1-based)

// Returns the distances at curve endpoints
TrimmedSquareDistances(theDist1: number, theDist2: number, theP1: gp_Pnt2d, theP2: gp_Pnt2d): { theDist1: number; theDist2: number };
// theDist1: Square distance to first point
// theDist2: Square distance to last point
// theP1: First point on curve
// theP2: Last point on curve

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Generic class for computing extremal distances between a point and a curve
Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db: declare class Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

constructor

// Initializes the algorithm with curve and parameter range
Initialize(theC: Adaptor3d_Curve, theUinf: number, theUsup: number, theTolF?: number): void;
// theC: The curve
// theUinf: Lower bound of parameter range
// theUsup: Upper bound of parameter range
// theTolF: Tolerance on function value (default 1.0e-10)

// Performs the extremum computation for the given point
Perform(theP: gp_Pnt): void;
// theP: The point to find extrema from

// Returns true if the distances are found
IsDone(): boolean;

// Returns the Nth extremum square distance
SquareDistance(theN: number): number;
// theN: Index of the extremum (1-based)

// Returns the number of extremum distances
NbExt(): number;

// Returns true if the Nth extremum distance is a minimum
IsMin(theN: number): boolean;
// theN: Index of the extremum (1-based)

// Returns the point of the Nth extremum distance
Point(theN: number): Extrema_POnCurv;
// theN: Index of the extremum (1-based)

// Returns the distances at curve endpoints
TrimmedSquareDistances(theDist1: number, theDist2: number, theP1: gp_Pnt, theP2: gp_Pnt): { theDist1: number; theDist2: number };
// theDist1: Square distance to first point
// theDist2: Square distance to last point
// theP1: First point on curve
// theP2: Last point on curve

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Extrema_ELPCOfLocateExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_ExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_EPCOfELPCOfLocateExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_EPCOfExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_classclassclassclassclassclassclassclassAdaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCur_8b7a66bf2ea31743: Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f

Extrema_SequenceOfPOnCurv: NCollection_Sequence_Extrema_POnCurv

Extrema_SequenceOfPOnCurv2d: NCollection_Sequence_Extrema_POnCurv2d

Extrema_SequenceOfPOnSurf: NCollection_Sequence_Extrema_POnSurf
