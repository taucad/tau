# libcascade — GccAna (2)

4 top-level symbols. Signatures are verbatim typescript.

// This class implements the algorithms used to create 2d lines tangent to a circle or a point and perpendicular to a line or a circle
GccAna_Lin2dTanPer: declare class GccAna_Lin2dTanPer

constructor

// Returns True if the algorithm succeeded
IsDone(): boolean;

// Returns the number of solutions
NbSolutions(): number;

// Returns the qualifier Qualif1 of the tangency argument for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Lin2d;

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, Pnt: gp_Pnt2d): { ParSol: number; ParArg: number };
// Pnt: Mutated in place

// Returns information about the intersection between the solution number Index and the second argument
Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions for building bisecting curves between a 2D line and a point
GccAna_LinPnt2dBisec: declare class GccAna_LinPnt2dBisec

constructor

// Returns True if the algorithm succeeded
IsDone(): boolean;

// Returns the number of solutions
ThisSolution(): GccInt_Bisec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GccAna_NoSolution: declare class GccAna_NoSolution extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create the bisecting line between two 2d points Describes functions for building a bisecting line between two 2D points
GccAna_Pnt2dBisec: declare class GccAna_Pnt2dBisec

constructor

// Returns true (this construction algorithm never fails)
IsDone(): boolean;

// Returns true if this algorithm has a solution, i.e
HasSolution(): boolean;

// Returns a line, representing the solution computed by this algorithm
ThisSolution(): gp_Lin2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
