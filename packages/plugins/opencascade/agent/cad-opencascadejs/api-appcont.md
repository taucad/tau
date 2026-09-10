# libcascade — AppCont

2 top-level symbols. Signatures are verbatim typescript.

// Class describing a continuous 3d and/or function f(u)
AppCont_Function: declare class AppCont_Function

// Get number of 3d and 2d points returned by "Value" and "D1" functions
GetNumberOfPoints(theNbPnt?: number, theNbPnt2d?: number): { theNbPnt: number; theNbPnt2d: number };

// Get number of 3d points returned by "Value" and "D1" functions
GetNbOf3dPoints(): number;

// Get number of 2d points returned by "Value" and "D1" functions
GetNbOf2dPoints(): number;

// Returns the first parameter of the function
FirstParameter(): number;

// Returns the last parameter of the function
LastParameter(): number;

// Returns the point at parameter <theU>
Value(theU: number, thePnt2d: NCollection_Array1_gp_Pnt2d, thePnt: NCollection_Array1_gp_Pnt): boolean;
// thePnt2d: Mutated in place
// thePnt: Mutated in place

// Returns the derivative at parameter <theU>
D1(theU: number, theVec2d: NCollection_Array1_gp_Vec2d, theVec: NCollection_Array1_gp_Vec): boolean;
// theVec2d: Mutated in place
// theVec: Mutated in place

// Return information about peridicity in output paramateters space
PeriodInformation(argNo0: number, IsPeriodic: boolean, thePeriod: number): { IsPeriodic: boolean; thePeriod: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

AppCont_LeastSquare: declare class AppCont_LeastSquare

constructor

Value(): AppParCurves_MultiCurve;

Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
