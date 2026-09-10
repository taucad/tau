# libcascade — Geom2dGcc (2)

18 top-level symbols. Signatures are verbatim typescript.

// This class implements the algorithms used to create a 2d circle tangent to a 2d entity, centered on a 2d entity and with a given radius
Geom2dGcc_Circ2dTanOnRad: declare class Geom2dGcc_Circ2dTanOnRad

constructor

Results(Circ: GccAna_Circ2dTanOnRad): void;
Results(Circ: Geom2dGcc_Circ2dTanOnRadGeo): void;
Results(Circ: GccAna_Circ2dTanOnRad): void;
Results(Circ: Geom2dGcc_Circ2dTanOnRadGeo): void;

// Returns true if the construction algorithm does not fail (even if it finds no solution)
IsDone(): boolean;

// Returns the number of circles, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

// Returns the qualifier Qualif1 of the tangency argument for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns information about the tangency point between the result number Index and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns the center PntSol on the second argument (i.e
CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };
// PntSol: Mutated in place

// Returns true if the solution of index Index and the first argument of this algorithm are the same (i.e
IsTheSame1(Index: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create a 2d circle tangent to a 2d entity, centered on a 2d entity and with a given radius
Geom2dGcc_Circ2dTanOnRadGeo: declare class Geom2dGcc_Circ2dTanOnRadGeo

constructor

// This method returns True if the construction algorithm succeeded
IsDone(): boolean;

// This method returns the number of solutions
NbSolutions(): number;

// Returns the solution number Index and raises OutOfRange exception if Index is greater than the number of solutions
ThisSolution(Index: number): gp_Circ2d;

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

Geom2dGcc_CurveTool: declare class Geom2dGcc_CurveTool

constructor

static FirstParameter(C: Geom2dAdaptor_Curve): number;

static LastParameter(C: Geom2dAdaptor_Curve): number;

static EpsX(C: Geom2dAdaptor_Curve, Tol: number): number;

static NbSamples(C: Geom2dAdaptor_Curve): number;

static Value(C: Geom2dAdaptor_Curve, X: number): gp_Pnt2d;

static D1(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

static D2(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

static D3(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d, dN: gp_Vec2d): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This abstract class describes a Function of 1 Variable used to find a line tangent to a curve and a circle
Geom2dGcc_FunctionTanCirCu: declare class Geom2dGcc_FunctionTanCirCu extends math_FunctionWithDerivative

constructor

// Computes the value of the function F for the variable X
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative of the function F for the variable X
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value and the derivative of the function F for the variable X
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This abstract class describes a Function of 1 Variable used to find a line tangent to two curves
Geom2dGcc_FunctionTanCuCu: declare class Geom2dGcc_FunctionTanCuCu extends math_FunctionSetWithDerivatives

constructor

InitDerivative(X: math_VectorBase_double, Point1: gp_Pnt2d, Point2: gp_Pnt2d, Tan1: gp_Vec2d, Tan2: gp_Vec2d, D21: gp_Vec2d, D22: gp_Vec2d): void;

// returns the number of variables of the function
NbVariables(): number;

// returns the number of equations of the function
NbEquations(): number;

// Computes the value of the function F for the variable X
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Computes the derivative of the function F for the variable X
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Computes the value and the derivative of the function F for the variable X
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This abstract class describes a set on N Functions of M independent variables
Geom2dGcc_FunctionTanCuCuOnCu: declare class Geom2dGcc_FunctionTanCuCuOnCu extends math_FunctionSetWithDerivatives

constructor

InitDerivative(X: math_VectorBase_double, Point1: gp_Pnt2d, Point2: gp_Pnt2d, Point3: gp_Pnt2d, Tan1: gp_Vec2d, Tan2: gp_Vec2d, Tan3: gp_Vec2d, D21: gp_Vec2d, D22: gp_Vec2d, D23: gp_Vec2d): void;

// Returns the number of variables of the function
NbVariables(): number;

// Returns the number of equations of the function
NbEquations(): number;

// Computes the values of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Returns the values of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Returns the values of the functions and the derivatives for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This abstract class describes a Function of 1 Variable used to find a line tangent to a curve and passing through a point
Geom2dGcc_FunctionTanCuPnt: declare class Geom2dGcc_FunctionTanCuPnt extends math_FunctionWithDerivative

constructor

// Computes the value of the function F for the variable X
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative of the function F for the variable X
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value and the derivative of the function F for the variable X
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describe a function of a single variable
Geom2dGcc_FunctionTanObl: declare class Geom2dGcc_FunctionTanObl extends math_FunctionWithDerivative

constructor

// Computes the value of the function F for the variable X
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative of the function F for the variable X
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value and the derivative of the function F for the variable X
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dGcc_IsParallel: declare class Geom2dGcc_IsParallel extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d lines tangent to 2 other elements which can be circles, curves or points
Geom2dGcc_Lin2d2Tan: declare class Geom2dGcc_Lin2d2Tan

constructor

// Returns true if the construction algorithm does not fail (even if it finds no solution)
IsDone(): boolean;

// Returns the number of lines, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns a line, representing the solution of index Index computed by this algorithm
ThisSolution(Index: number): gp_Lin2d;

// Returns the qualifiers Qualif1 and Qualif2 of the tangency arguments for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns information about the tangency point between the result and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns information about the tangency point between the result and the first argument
Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d lines tangent to 2 other elements which can be circles, curves or points
Geom2dGcc_Lin2d2TanIter: declare class Geom2dGcc_Lin2d2TanIter

constructor

// This methode returns true when there is a solution and false in the other cases
IsDone(): boolean;

// Returns the solution
ThisSolution(): gp_Lin2d;

WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

// Returns information about the tangency point between the result and the first argument
Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d line tangent to a curve QualifiedCurv and doing an angle Angle with a line TheLin
Geom2dGcc_Lin2dTanObl: declare class Geom2dGcc_Lin2dTanObl

constructor

// Returns true if the construction algorithm does not fail (even if it finds no solution)
IsDone(): boolean;

// Returns the number of lines, representing solutions computed by this algorithm
NbSolutions(): number;

// Returns a line, representing the solution of index Index computed by this algorithm
ThisSolution(Index: number): gp_Lin2d;

// Returns the qualifier Qualif1 of the tangency argument for the solution of index Index computed by this algorithm
WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

// Returns information about the tangency point between the result and the first argument
Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Returns the point of intersection PntSol between the solution of index Index and the second argument (the line) of this algorithm
Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };
// PntSol: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the algorithms used to create 2d line tangent to a curve QualifiedCurv and doing an angle Angle with a line TheLin
Geom2dGcc_Lin2dTanOblIter: declare class Geom2dGcc_Lin2dTanOblIter

constructor

// This method returns true when there is a solution and false in the other cases
IsDone(): boolean;

ThisSolution(): gp_Lin2d;

WhichQualifier(Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

Intersection2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

IsParallel2(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Creates a qualified 2d line
Geom2dGcc_QCurve: declare class Geom2dGcc_QCurve

constructor

Qualified(): Geom2dAdaptor_Curve;

Qualifier(): GccEnt_Position;

// Returns true if the solution is unqualified and false in the other cases
IsUnqualified(): boolean;

// Returns true if the solution is Enclosing the Curv and false in the other cases
IsEnclosing(): boolean;

// Returns true if the solution is Enclosed in the Curv and false in the other cases
IsEnclosed(): boolean;

// Returns true if the solution is Outside the Curv and false in the other cases
IsOutside(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions for building a qualified 2D curve
Geom2dGcc_QualifiedCurve: declare class Geom2dGcc_QualifiedCurve

constructor

// Returns a 2D curve to which the qualifier is assigned
Qualified(): Geom2dAdaptor_Curve;

// Returns
Qualifier(): GccEnt_Position;

// Returns true if the solution is unqualified and false in the other cases
IsUnqualified(): boolean;

// It returns true if the solution is Enclosing the Curv and false in the other cases
IsEnclosing(): boolean;

// It returns true if the solution is Enclosed in the Curv and false in the other cases
IsEnclosed(): boolean;

// It returns true if the solution is Outside the Curv and false in the other cases
IsOutside(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dGcc_Type1: typeof Geom2dGcc_Type1[keyof typeof Geom2dGcc_Type1]

Geom2dGcc_Type2: typeof Geom2dGcc_Type2[keyof typeof Geom2dGcc_Type2]

Geom2dGcc_Type3: typeof Geom2dGcc_Type3[keyof typeof Geom2dGcc_Type3]
