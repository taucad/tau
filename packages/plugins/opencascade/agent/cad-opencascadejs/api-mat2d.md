# libcascade — MAT2d

8 top-level symbols. Signatures are verbatim typescript.

// BiInt is a set of two integers
MAT2d_BiInt: declare class MAT2d_BiInt

constructor

FirstIndex(): number;
FirstIndex(I1: number): void;
FirstIndex(): number;
FirstIndex(I1: number): void;

SecondIndex(): number;
SecondIndex(I2: number): void;
SecondIndex(): number;
SecondIndex(I2: number): void;

IsEqual(B: MAT2d_BiInt): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Constructs a circuit on a set of lines
MAT2d_Circuit: declare class MAT2d_Circuit extends Standard_Transient

constructor

Perform(aFigure: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry, IsClosed: NCollection_Sequence_bool, IndRefLine: number, Trigo: boolean): void;

// Returns the Number of Items
NumberOfItems(): number;

// Returns the item at position <Index> in <me>
Value(Index: number): Geom2d_Geometry;

// Returns the number of items on the line <IndexLine>
LineLength(IndexLine: number): number;

// Returns the set of index of the items in <me>corresponding to the curve <IndCurve> on the line <IndLine> from the initial figure
RefToEqui(IndLine: number, IndCurve: number): NCollection_Sequence_int;

// Returns the Connexion on the item <Index> in me
Connexion(Index: number): MAT2d_Connexion;

// Returns <True> is there is a connexion on the item <Index> in <me>
ConnexionOn(Index: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Connexion links two lines of items in a set of lines
MAT2d_Connexion: declare class MAT2d_Connexion extends Standard_Transient

constructor

// Returns the Index on the first line
IndexFirstLine(): number;
IndexFirstLine(anIndex: number): void;
IndexFirstLine(): number;
IndexFirstLine(anIndex: number): void;

// Returns the Index on the Second line
IndexSecondLine(): number;
IndexSecondLine(anIndex: number): void;
IndexSecondLine(): number;
IndexSecondLine(anIndex: number): void;

// Returns the Index of the item on the first line
IndexItemOnFirst(): number;
IndexItemOnFirst(anIndex: number): void;
IndexItemOnFirst(): number;
IndexItemOnFirst(anIndex: number): void;

// Returns the Index of the item on the second line
IndexItemOnSecond(): number;
IndexItemOnSecond(anIndex: number): void;
IndexItemOnSecond(): number;
IndexItemOnSecond(anIndex: number): void;

// Returns the parameter of the point on the firstline
ParameterOnFirst(): number;
ParameterOnFirst(aParameter: number): void;
ParameterOnFirst(): number;
ParameterOnFirst(aParameter: number): void;

// Returns the parameter of the point on the secondline
ParameterOnSecond(): number;
ParameterOnSecond(aParameter: number): void;
ParameterOnSecond(): number;
ParameterOnSecond(aParameter: number): void;

// Returns the point on the firstline
PointOnFirst(): gp_Pnt2d;
PointOnFirst(aPoint: gp_Pnt2d): void;
PointOnFirst(): gp_Pnt2d;
PointOnFirst(aPoint: gp_Pnt2d): void;

// Returns the point on the secondline
PointOnSecond(): gp_Pnt2d;
PointOnSecond(aPoint: gp_Pnt2d): void;
PointOnSecond(): gp_Pnt2d;
PointOnSecond(aPoint: gp_Pnt2d): void;

// Returns the distance between the two points
Distance(): number;
Distance(aDistance: number): void;
Distance(): number;
Distance(aDistance: number): void;

// Returns the reverse connexion of <me>
Reverse(): MAT2d_Connexion;

// Returns <True> if my firstPoint is on the same line than the firstpoint of <aConnexion> and my firstpoint is after the firstpoint of <aConnexion> on the line
IsAfter(aConnexion: MAT2d_Connexion, aSense: number): boolean;

// Print <me>
Dump(Deep?: number, Offset?: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class contains the generic algorithm of computation of the bisecting locus
MAT2d_Mat2d: declare class MAT2d_Mat2d

constructor

// Algorithm of computation of the bisecting locus
CreateMat(aTool: MAT2d_Tool2d): void;
// aTool: Mutated in place

// Algorithm of computation of the bisecting locus for open wire
CreateMatOpen(aTool: MAT2d_Tool2d): void;
// aTool: Mutated in place

// Returns <TRUE> if CreateMat has succeeded
IsDone(): boolean;

// Initialize an iterator on the set of the roots of the trees of bisectors
Init(): void;

// Return False if there is no more roots
More(): boolean;

// Move to the next root
Next(): void;

// Returns the current root
Bisector(): MAT_Bisector;

// Returns True if there are semi_infinite bisectors
SemiInfinite(): boolean;

// Returns the total number of bisectors
NumberOfBisectors(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// MiniPath computes a path to link all the lines in a set of lines
MAT2d_MiniPath: declare class MAT2d_MiniPath

constructor

// Computes the path to link the lines in <Figure>
Perform(Figure: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry, IndStart: number, Sense: boolean): void;

// Run on the set of connexions to compute the path
RunOnConnexions(): void;

// Returns the sequence of connexions corresponding to the path
Path(): NCollection_Sequence_handle_MAT2d_Connexion;

// Returns <True> if there is one Connexion which starts on line designed by <Index>
IsConnexionsFrom(Index: number): boolean;

// Returns the connexions which start on line designed by <Index>
ConnexionsFrom(Index: number): NCollection_Sequence_handle_MAT2d_Connexion;

// Returns <True> if the line designed by <Index> is the root
IsRoot(Index: number): boolean;

// Returns the connexion which ends on line designed by <Index>
Father(Index: number): MAT2d_Connexion;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Set of the methods useful for the MAT's computation
MAT2d_Tool2d: declare class MAT2d_Tool2d

constructor

// <aSide> defines the side of the computation of the map
Sense(aside: MAT_Side): void;

SetJoinType(aJoinType: GeomAbs_JoinType): void;

// InitItems cuts the line in Items
InitItems(aCircuit: MAT2d_Circuit): void;

// Returns the Number of Items
NumberOfItems(): number;

// Returns tolerance to test the confusion of two points
ToleranceOfConfusion(): number;

// Creates the point at the origin of the bisector between anitem and the previous item
FirstPoint(anitem: number, dist?: number): { returnValue: number; dist: number };

// Creates the Tangent at the end of the Item defined by <anitem>
TangentBefore(anitem: number, IsOpenResult: boolean): number;

// Creates the Reversed Tangent at the origin of the Item defined by <anitem>
TangentAfter(anitem: number, IsOpenResult: boolean): number;

// Creates the Tangent at the end of the bisector defined by <bisector>
Tangent(bisector: number): number;

// Creates the geometric bisector defined by <abisector>
CreateBisector(abisector: MAT_Bisector): void;

// Trims the geometric bisector by the <firstparameter> of <abisector>
TrimBisector(abisector: MAT_Bisector): boolean;
TrimBisector(abisector: MAT_Bisector, apoint: number): boolean;
TrimBisector(abisector: MAT_Bisector): boolean;
TrimBisector(abisector: MAT_Bisector, apoint: number): boolean;

// Computes the point of intersection between the bisectors defined by <bisectorone> and <bisectortwo>
IntersectBisector(bisectorone: MAT_Bisector, bisectortwo: MAT_Bisector, intpnt?: number): { returnValue: number; intpnt: number };

// Returns the distance between the two points designed by their parameters on <abisector>
Distance(abisector: MAT_Bisector, param1: number, param2: number): number;

// displays information about the bisector defined by <bisector>
Dump(bisector: number, erease: number): void;

// Returns the <Bisec> of index <Index> in <theGeomBisectors>
GeomBis(Index: number): Bisector_Bisec;

// Returns the Geometry of index <Index> in <theGeomElts>
GeomElt(Index: number): Geom2d_Geometry;

// Returns the point of index <Index> in the <theGeomPnts>
GeomPnt(Index: number): gp_Pnt2d;

// Returns the vector of index <Index> in the <theGeomVecs>
GeomVec(Index: number): gp_Vec2d;

Circuit(): MAT2d_Circuit;

BisecFusion(Index1: number, Index2: number): void;

// Returns the <Bisec> of index <Index> in <theGeomBisectors>
ChangeGeomBis(Index: number): Bisector_Bisec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MAT2d_SequenceOfConnexion: NCollection_Sequence_handle_MAT2d_Connexion

MAT2d_SequenceOfSequenceOfGeometry: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry
