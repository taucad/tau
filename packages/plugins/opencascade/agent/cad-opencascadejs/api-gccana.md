# libcascade — GccAna

12 top-level symbols. Signatures are verbatim typescript.

// Describes functions for building a 2D circle
GccAna_Circ2d2TanOn: declare class GccAna_Circ2d2TanOn

constructor

// Returns true if the construction algorithm does not fail (even if it finds no solution)
IsDone(): boolean;

// Returns the number of circles, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// Returns the qualifiers Qualif1 and Qualif2 of the tangency arguments for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns the information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns the information about the tangency point between the result number Index and the second argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns the information about the center (on the curv) of the result number Index and the third argument
CenterOn3(Index: number, ParArg: number, PntArg: gp_Pnt2d): { ParArg: number };
// PntArg: Mutated in place

// True if the solution and the first argument are the same (2 circles)
IsTheSame1(Index: number): boolean;

// True if the solution and the second argument are the same (2 circles)
IsTheSame2(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles tangent to 2 points/lines/circles and with a given radius
GccAna_Circ2d2TanRad: declare class GccAna_Circ2d2TanRad

constructor

// This method returns True if the algorithm succeeded
IsDone(): boolean;

// This method returns the number of circles, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns the solution number Index
ThisSolution(Index: number): gp_Circ2d;

// Returns the information about the qualifiers of the tangency arguments concerning the solution number Index
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result number Index and the second argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns True if the solution number Index is equal to the first argument
IsTheSame1(Index: number): boolean;

// Returns True if the solution number Index is equal to the second argument
IsTheSame2(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles tangent to 3 points/lines/circles
GccAna_Circ2d3Tan: declare class GccAna_Circ2d3Tan

constructor

// This method returns True if the construction algorithm succeeded
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// Returns the information about the qualifiers of the tangency arguments concerning the solution number Index
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result number Index and the first argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result number Index and the first argument
Tangency3(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns True if the solution number Index is equal to the first argument
IsTheSame1(Index: number): boolean;

// Returns True if the solution number Index is equal to the second argument
IsTheSame2(Index: number): boolean;

// Returns True if the solution number Index is equal to the third argument
IsTheSame3(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes functions for building bisecting curves between two 2D circles
GccAna_Circ2dBisec: declare class GccAna_Circ2dBisec

constructor

// This method returns True if the construction algorithm succeeded
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index Raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): GccInt_Bisec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles tangent to an entity and centered on a point
GccAna_Circ2dTanCen: declare class GccAna_Circ2dTanCen

constructor

// This method returns True if the construction algorithm succeeded
IsDone(): boolean;

// Returns the number of circles, representing solutions computed by this algorithm and raises NotDone exception if the algorithm didn't succeed
NbSolutions(): number;

// Returns the circle, representing the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// Returns the qualifier Qualif1 of the tangency argument for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns True if the solution number Index is equal to the first argument
IsTheSame1(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create a 2d circle tangent to a 2d entity, centered on a curv and with a given radius
GccAna_Circ2dTanOnRad: declare class GccAna_Circ2dTanOnRad

constructor

// Returns true if the construction algorithm does not fail (even if it finds no solution)
IsDone(): boolean;

// This method returns the number of circles, representing solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// Returns the qualifier Qualif1 of the tangency argument for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the center (on the curv) of the result
CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };
// PntSol: Mutated in place

// Returns True if the solution number Index is equal to the first argument and False in the other cases
IsTheSame1(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions for building bisecting curves between a 2D line and a 2D circle
GccAna_CircLin2dBisec: declare class GccAna_CircLin2dBisec

constructor

// Returns true (this construction algorithm never fails)
IsDone(): boolean;

// Returns the number of curves, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions Exceptions Standard_OutOfRange if Index is less than zero or greater than the number of solutions computed by this algorithm
ThisSolution(Index: number): GccInt_Bisec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions for building a bisecting curve between a 2D circle and a point
GccAna_CircPnt2dBisec: declare class GccAna_CircPnt2dBisec

constructor

// Returns true (this construction algorithm never fails)
IsDone(): boolean;

// Returns the number of curves, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): GccInt_Bisec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d lines tangent to 2 other elements which can be circles or points
GccAna_Lin2d2Tan: declare class GccAna_Lin2d2Tan

constructor

// This method returns true when there is a solution and false in the other cases
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Lin2d;

// Returns the qualifiers Qualif1 and Qualif2 of the tangency arguments for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result number Index and the second argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions for building bisecting lines between two 2D lines
GccAna_Lin2dBisec: declare class GccAna_Lin2dBisec

constructor

// Returns True when the algorithm succeeded
IsDone(): boolean;

// Returns the number of solutions and raise NotDone if the constructor wasn't called before
NbSolutions(): number;

// Returns the solution number Index
ThisSolution(Index: number): gp_Lin2d;

// Returns information about the intersection point between the result number Index and the first argument
Intersection1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the intersection point between the result number Index and the second argument
Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d line tangent to a circle or a point and making an angle with a line
GccAna_Lin2dTanObl: declare class GccAna_Lin2dTanObl

constructor

// Returns True if the algorithm succeeded
IsDone(): boolean;

// Returns the number of lines, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns the solution number Index
ThisSolution(Index: number): gp_Lin2d;

// Returns the qualifier Qualif1 of the tangency argument for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the intersection between the result number Index and the third argument
Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d line tangent to a circle or a point and parallel to another line
GccAna_Lin2dTanPar: declare class GccAna_Lin2dTanPar

constructor

// Returns True if the algorithm succeeded
IsDone(): boolean;

// Returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Lin2d;

// Returns the information about the qualifiers of the tangency arguments concerning the solution number Index
WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, Pnt: gp_Pnt2d): { ParSol: number; ParArg: number };
// Pnt: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
