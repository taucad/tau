# libcascade — GccEnt

5 top-level symbols. Signatures are verbatim typescript.

// This package provides an implementation of the qualified entities useful to create 2d entities with geometric constraints
GccEnt: declare class GccEnt

constructor

// Returns the string name for a given position
static PositionToString(thePosition: GccEnt_Position): string;
// thePosition: position type

// Returns the position from the given string identifier (using case-insensitive comparison)
static PositionFromString(thePositionString: string): GccEnt_Position;
static PositionFromString(thePositionString: string, thePosition?: GccEnt_Position): { returnValue: boolean; thePosition: GccEnt_Position };
static PositionFromString(thePositionString: string): GccEnt_Position;
static PositionFromString(thePositionString: string, thePosition?: GccEnt_Position): { returnValue: boolean; thePosition: GccEnt_Position };
// thePositionString: string identifier

// Constructs a qualified line, so that the relative position to the circle or line of the solution computed by a construction algorithm using the qualified circle or line is not qualified, i.e
static Unqualified(Obj: gp_Lin2d): GccEnt_QualifiedLin;
static Unqualified(Obj: gp_Circ2d): GccEnt_QualifiedCirc;
static Unqualified(Obj: gp_Lin2d): GccEnt_QualifiedLin;
static Unqualified(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

// Constructs such a qualified circle that the solution computed by a construction algorithm using the qualified circle encloses the circle
static Enclosing(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

// Constructs a qualified line, so that the solution computed by a construction algorithm using the qualified circle or line is enclosed by the circle or line
static Enclosed(Obj: gp_Lin2d): GccEnt_QualifiedLin;
static Enclosed(Obj: gp_Circ2d): GccEnt_QualifiedCirc;
static Enclosed(Obj: gp_Lin2d): GccEnt_QualifiedLin;
static Enclosed(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

// Constructs a qualified line, so that the solution computed by a construction algorithm using the qualified circle or line and the circle or line are external to one another
static Outside(Obj: gp_Lin2d): GccEnt_QualifiedLin;
static Outside(Obj: gp_Circ2d): GccEnt_QualifiedCirc;
static Outside(Obj: gp_Lin2d): GccEnt_QualifiedLin;
static Outside(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GccEnt_BadQualifier: declare class GccEnt_BadQualifier extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Qualifies the position of a solution of a construction algorithm with respect to one of its arguments
GccEnt_Position: typeof GccEnt_Position[keyof typeof GccEnt_Position]

// Creates a qualified 2d Circle
GccEnt_QualifiedCirc: declare class GccEnt_QualifiedCirc

constructor

// Returns a 2D circle to which the qualifier is assigned
Qualified(): gp_Circ2d;

// Returns
Qualifier(): GccEnt_Position;

// Returns true if the Circ2d is Unqualified and false in the other cases
IsUnqualified(): boolean;

// Returns true if the solution computed by a construction algorithm using this qualified circle encloses the circle
IsEnclosing(): boolean;

// Returns true if the solution computed by a construction algorithm using this qualified circle is enclosed by the circle
IsEnclosed(): boolean;

// Returns true if both the solution computed by a construction algorithm using this qualified circle and the circle are external to one another
IsOutside(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a qualified 2D line
GccEnt_QualifiedLin: declare class GccEnt_QualifiedLin

constructor

// Returns a 2D line to which the qualifier is assigned
Qualified(): gp_Lin2d;

// Returns the qualifier of this qualified line, if it is "enclosed" or "outside", or
Qualifier(): GccEnt_Position;

// Returns true if the solution is unqualified and false in the other cases
IsUnqualified(): boolean;

// Returns true if the solution is Enclosed in the Lin2d and false in the other cases
IsEnclosed(): boolean;

// Returns true if the solution is Outside the Lin2d and false in the other cases
IsOutside(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
