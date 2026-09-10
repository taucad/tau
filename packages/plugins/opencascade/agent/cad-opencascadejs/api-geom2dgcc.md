# libcascade — Geom2dGcc

10 top-level symbols. Signatures are verbatim typescript.

// The {@link Geom2dGcc`Geom2dGcc`} package describes qualified 2D curves used in the construction of constrained geometric objects by an algorithm provided by the {@link Geom2dGcc`Geom2dGcc`} package
Geom2dGcc: declare class Geom2dGcc

constructor

// Constructs such a qualified curve that the relative position of the solution computed by a construction algorithm using the qualified curve to the circle or line is not qualified, i.e
static Unqualified(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

// Constructs such a qualified curve that the solution computed by a construction algorithm using the qualified curve encloses the curve
static Enclosing(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

// Constructs such a qualified curve that the solution computed by a construction algorithm using the qualified curve is enclosed by the curve
static Enclosed(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

// Constructs such a qualified curve that the solution computed by a construction algorithm using the qualified curve and the curve are external to one another
static Outside(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles TANgent to 2 entities and having the center ON a curve
Geom2dGcc_Circ2d2TanOn: declare class Geom2dGcc_Circ2d2TanOn

constructor

Results(Circ: GccAna_Circ2d2TanOn): void;
Results(Circ: Geom2dGcc_Circ2d2TanOnGeo): void;
Results(Circ: GccAna_Circ2d2TanOn): void;
Results(Circ: Geom2dGcc_Circ2d2TanOnGeo): void;

// Returns true if the construction algorithm does not fail (even if it finds no solution)
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// It returns the information about the qualifiers of the tangency arguments concerning the solution number Index
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns information about the tangency point between the result and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result and the second argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns the center PntSol of the solution of index Index computed by this algorithm
CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };
// PntSol: Mutated in place

// Returns true if the solution of index Index and, respectively, the first or second argument of this algorithm are the same (i.e
IsTheSame1(Index: number): boolean;

// Returns true if the solution of index Index and, respectively, the first or second argument of this algorithm are the same (i.e
IsTheSame2(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles TANgent to 2 entities and having the center ON a curve
Geom2dGcc_Circ2d2TanOnGeo: declare class Geom2dGcc_Circ2d2TanOnGeo

constructor

// This method returns True if the construction algorithm succeeded
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// It returns the information about the qualifiers of the tangency arguments concerning the solution number Index
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result number Index and the second argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the center (on the curv) of the result
CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };
// PntSol: Mutated in place

// Returns True if the solution number Index is equal to the first argument and False in the other cases
IsTheSame1(Index: number): boolean;

// Returns True if the solution number Index is equal to the second argument and False in the other cases
IsTheSame2(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles TANgent to 2 entities and having the center ON a curv
Geom2dGcc_Circ2d2TanOnIter: declare class Geom2dGcc_Circ2d2TanOnIter

constructor

// This method returns True if the construction algorithm succeeded
IsDone(): boolean;

// Returns the solution
ThisSolution(): gp_Circ2d;

WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns information about the tangency point between the result and the first argument
Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result and the second argument
Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the center (on the curv) of the result and the third argument
CenterOn3(ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };
// PntSol: Mutated in place

// It raises NotDone if the construction algorithm didn't succeed
IsTheSame1(): boolean;

// It raises NotDone if the construction algorithm didn't succeed
IsTheSame2(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles tangent to one curve and a point/line/circle/curv and with a given radius
Geom2dGcc_Circ2d2TanRad: declare class Geom2dGcc_Circ2d2TanRad

constructor

Results(Circ: GccAna_Circ2d2TanRad): void;
Results(Circ: Geom2dGcc_Circ2d2TanRadGeo): void;
Results(Circ: GccAna_Circ2d2TanRad): void;
Results(Circ: Geom2dGcc_Circ2d2TanRadGeo): void;

// This method returns True if the algorithm succeeded
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// Returns the qualifiers Qualif1 and Qualif2 of the tangency arguments for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result number Index and the second argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns true if the solution of index Index and, respectively, the first or second argument of this algorithm are the same (i.e
IsTheSame1(Index: number): boolean;

// Returns true if the solution of index Index and, respectively, the first or second argument of this algorithm are the same (i.e
IsTheSame2(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles tangent to one curve and a point/line/circle/curv and with a given radius
Geom2dGcc_Circ2d2TanRadGeo: declare class Geom2dGcc_Circ2d2TanRadGeo

constructor

// This method returns True if the algorithm succeeded
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index
ThisSolution(Index: number): gp_Circ2d;

// It returns the information about the qualifiers of the tangency arguments concerning the solution number Index
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

// This class implements the algorithms used to create 2d circles tangent to 3 points/lines/circles/ curves with one curve or more
Geom2dGcc_Circ2d3Tan: declare class Geom2dGcc_Circ2d3Tan

constructor

Results(Circ: GccAna_Circ2d3Tan, Rank1: number, Rank2: number, Rank3: number): void;

// Returns true if the construction algorithm does not fail (even if it finds no solution)
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// It returns the information about the qualifiers of the tangency arguments concerning the solution number Index
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

// Returns information about the tangency point between the result and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result and the second argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result and the third argument
Tangency3(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns True if the solution is equal to the first argument
IsTheSame1(Index: number): boolean;

// Returns True if the solution is equal to the second argument
IsTheSame2(Index: number): boolean;

// Returns True if the solution is equal to the third argument
IsTheSame3(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles tangent to 3 points/lines/circles/ curves with one curve or more
Geom2dGcc_Circ2d3TanIter: declare class Geom2dGcc_Circ2d3TanIter

constructor

// This method returns True if the construction algorithm succeeded
IsDone(): boolean;

// Returns the solution
ThisSolution(): gp_Circ2d;

WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

// Returns information about the tangency point between the result and the first argument
Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result and the second argument
Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result and the third argument
Tangency3(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// It raises NotDone if the construction algorithm didn't succeed
IsTheSame1(): boolean;

// It raises NotDone if the construction algorithm didn't succeed
IsTheSame2(): boolean;

// It raises NotDone if the construction algorithm didn't succeed
IsTheSame3(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles tangent to a curve and centered on a point
Geom2dGcc_Circ2dTanCen: declare class Geom2dGcc_Circ2dTanCen

constructor

// Returns true if the construction algorithm does not fail (even if it finds no solution)
IsDone(): boolean;

// Returns the number of circles, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns a circle, representing the solution of index Index computed by this algorithm
ThisSolution(Index: number): gp_Circ2d;

// Returns the qualifier Qualif1 of the tangency argument for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns true if the solution of index Index and the first argument of this algorithm are the same (i.e
IsTheSame1(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d circles tangent to a curve and centered on a point
Geom2dGcc_Circ2dTanCenGeo: declare class Geom2dGcc_Circ2dTanCenGeo

constructor

// This method returns True if the construction algorithm succeeded
IsDone(): boolean;

// Returns the number of solutions and raises NotDone exception if the algorithm didn't succeed
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
