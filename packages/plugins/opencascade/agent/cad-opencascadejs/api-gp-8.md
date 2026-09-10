# libcascade — gp (8)

2 top-level symbols. Signatures are verbatim typescript.

// This class describes a cartesian coordinate entity in 2D space {X,Y}
gp_XY: declare class gp_XY

constructor

// modifies the coordinate of range theIndex theIndex = 1 => X is modified theIndex = 2 => Y is modified Raises OutOfRange if theIndex != {1, 2}
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theX: number, theY: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theX: number, theY: number): void;

// Assigns the given value to the X coordinate of this number pair
SetX(theX: number): void;

// Assigns the given value to the Y coordinate of this number pair
SetY(theY: number): void;

// returns the coordinate of range theIndex
Coord(theIndex: number): number;
Coord(theX?: number, theY?: number): { theX: number; theY: number };
Coord(theIndex: number): number;
Coord(theX?: number, theY?: number): { theX: number; theY: number };

ChangeCoord(theIndex: number): number;

// Returns the X coordinate of this number pair
X(): number;

// Returns the Y coordinate of this number pair
Y(): number;

// Computes std::sqrt(X*X + Y*Y) where X and Y are the two coordinates of this number pair
Modulus(): number;

// Computes X*X + Y*Y where X and Y are the two coordinates of this number pair
SquareModulus(): number;

// Returns true if the coordinates of this number pair are equal to the respective coordinates of the number pair theOther, within the specified tolerance theTolerance
IsEqual(theOther: gp_XY, theTolerance: number): boolean;

// Computes the sum of this number pair and number pair theOther
Add(theOther: gp_XY): void;

// Computes the sum of this number pair and number pair theOther
Added(theOther: gp_XY): gp_XY;

// `doubleD=<me>.X()*theOther.Y()-<me>.Y()*theOther.X()`
Crossed(theOther: gp_XY): number;

// computes the magnitude of the cross product between <me> and theRight
CrossMagnitude(theRight: gp_XY): number;

// computes the square magnitude of the cross product between <me> and theRight
CrossSquareMagnitude(theRight: gp_XY): number;

// divides <me> by a real
Divide(theScalar: number): void;

// Divides <me> by a real
Divided(theScalar: number): gp_XY;

// Computes the scalar product between <me> and theOther
Dot(theOther: gp_XY): number;

// ``` <me>.X()=<me>.X()\*theScalar
Multiply(theScalar: number): void;
Multiply(theOther: gp_XY): void;
Multiply(theMatrix: gp_Mat2d): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_XY): void;
Multiply(theMatrix: gp_Mat2d): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_XY): void;
Multiply(theMatrix: gp_Mat2d): void;

// ``` New.X()=<me>.X()\*theScalar
Multiplied(theScalar: number): gp_XY;
Multiplied(theOther: gp_XY): gp_XY;
Multiplied(theMatrix: gp_Mat2d): gp_XY;
Multiplied(theScalar: number): gp_XY;
Multiplied(theOther: gp_XY): gp_XY;
Multiplied(theMatrix: gp_Mat2d): gp_XY;
Multiplied(theScalar: number): gp_XY;
Multiplied(theOther: gp_XY): gp_XY;
Multiplied(theMatrix: gp_Mat2d): gp_XY;

// `<me>.X()=<me>.X()/<me>.Modulus() <me>.Y()=<me>.Y()/<me>.Modulus()`
Normalize(): void;

// `New.X()=<me>.X()/<me>.Modulus() New.Y()=<me>.Y()/<me>.Modulus()`
Normalized(): gp_XY;

// `<me>.X()=-<me>.X() <me>.Y()=-<me>.Y()`
Reverse(): void;

// `New.X()=-<me>.X() New.Y()=-<me>.Y()`
Reversed(): gp_XY;

// Computes the following linear combination and assigns the result to this number pair
SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY, theXY3: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theXY2: gp_XY): void;
SetLinearForm(theXY1: gp_XY, theXY2: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY, theXY3: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theXY2: gp_XY): void;
SetLinearForm(theXY1: gp_XY, theXY2: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY, theXY3: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theXY2: gp_XY): void;
SetLinearForm(theXY1: gp_XY, theXY2: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY, theXY3: gp_XY): void;
SetLinearForm(theA1: number, theXY1: gp_XY, theXY2: gp_XY): void;
SetLinearForm(theXY1: gp_XY, theXY2: gp_XY): void;

// `<me>.X()=<me>.X()-theOther.X() <me>.Y()=<me>.Y()-theOther.Y()`
Subtract(theOther: gp_XY): void;

// `new.X()=<me>.X()-theOther.X() new.Y()=<me>.Y()-theOther.Y()`
Subtracted(theOther: gp_XY): gp_XY;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes a cartesian coordinate entity in 3D space {X,Y,Z}
gp_XYZ: declare class gp_XYZ

constructor

// For this XYZ object, assigns the values theX, theY and theZ to its three coordinates
SetCoord(theX: number, theY: number, theZ: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theX: number, theY: number, theZ: number): void;
SetCoord(theIndex: number, theXi: number): void;

// Assigns the given value to the X coordinate
SetX(theX: number): void;

// Assigns the given value to the Y coordinate
SetY(theY: number): void;

// Assigns the given value to the Z coordinate
SetZ(theZ: number): void;

// returns the coordinate of range theIndex
Coord(theIndex: number): number;
Coord(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
Coord(theIndex: number): number;
Coord(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

ChangeCoord(theIndex: number): number;

// Returns a const ptr to coordinates location
GetData(): number;

// Returns a ptr to coordinates location
ChangeData(): number;

// Returns the X coordinate
X(): number;

// Returns the Y coordinate
Y(): number;

// Returns the Z coordinate
Z(): number;

// Computes std::sqrt(X*X + Y*Y + Z\*Z) where X, Y and Z are the three coordinates of this XYZ object
Modulus(): number;

// Computes X*X + Y*Y + Z\*Z where X, Y and Z are the three coordinates of this XYZ object
SquareModulus(): number;

// Returns True if he coordinates of this XYZ object are equal to the respective coordinates Other, within the specified tolerance theTolerance
IsEqual(theOther: gp_XYZ, theTolerance: number): boolean;

// `<me>.X()=<me>.X()+theOther.X() <me>.Y()=<me>.Y()+theOther.Y() <me>.Z()=<me>.Z()+theOther.Z()`
Add(theOther: gp_XYZ): void;

// `new.X()=<me>.X()+theOther.X() new.Y()=<me>.Y()+theOther.Y() new.Z()=<me>.Z()+theOther.Z()`
Added(theOther: gp_XYZ): gp_XYZ;

// `<me>.X()=<me>.Y()*theOther.Z()-<me>.Z()*theOther.Y() <me>.Y()=<me>.Z()*theOther.X()-<me>.X()*theOther.Z() <me>.Z()=<me>.X()*theOther.Y()-<me>.Y()*theOther.X()`
Cross(theOther: gp_XYZ): void;

// `new.X()=<me>.Y()*theOther.Z()-<me>.Z()*theOther.Y() new.Y()=<me>.Z()*theOther.X()-<me>.X()*theOther.Z() new.Z()=<me>.X()*theOther.Y()-<me>.Y()*theOther.X()`
Crossed(theOther: gp_XYZ): gp_XYZ;

// Computes the magnitude of the cross product between <me> and theRight
CrossMagnitude(theRight: gp_XYZ): number;

// Computes the square magnitude of the cross product between <me> and theRight
CrossSquareMagnitude(theRight: gp_XYZ): number;

// Triple vector product Computes <me> = <me>.Cross(theCoord1.Cross(theCoord2))
CrossCross(theCoord1: gp_XYZ, theCoord2: gp_XYZ): void;

// Triple vector product computes New = <me>.Cross(theCoord1.Cross(theCoord2))
CrossCrossed(theCoord1: gp_XYZ, theCoord2: gp_XYZ): gp_XYZ;

// divides <me> by a real
Divide(theScalar: number): void;

// divides <me> by a real
Divided(theScalar: number): gp_XYZ;

// Computes the scalar product between <me> and theOther
Dot(theOther: gp_XYZ): number;

// Computes the triple scalar product
DotCross(theCoord1: gp_XYZ, theCoord2: gp_XYZ): number;

// ``` <me>.X()=<me>.X()\*theScalar
Multiply(theScalar: number): void;
Multiply(theOther: gp_XYZ): void;
Multiply(theMatrix: gp_Mat): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_XYZ): void;
Multiply(theMatrix: gp_Mat): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_XYZ): void;
Multiply(theMatrix: gp_Mat): void;

// ``` New.X()=<me>.X()\*theScalar
Multiplied(theScalar: number): gp_XYZ;
Multiplied(theOther: gp_XYZ): gp_XYZ;
Multiplied(theMatrix: gp_Mat): gp_XYZ;
Multiplied(theScalar: number): gp_XYZ;
Multiplied(theOther: gp_XYZ): gp_XYZ;
Multiplied(theMatrix: gp_Mat): gp_XYZ;
Multiplied(theScalar: number): gp_XYZ;
Multiplied(theOther: gp_XYZ): gp_XYZ;
Multiplied(theMatrix: gp_Mat): gp_XYZ;

// `<me>.X()=<me>.X()/<me>.Modulus() <me>.Y()=<me>.Y()/<me>.Modulus() <me>.Z()=<me>.Z()/<me>.Modulus()`
Normalize(): void;

// `New.X()=<me>.X()/<me>.Modulus() New.Y()=<me>.Y()/<me>.Modulus() New.Z()=<me>.Z()/<me>.Modulus()`
Normalized(): gp_XYZ;

// `<me>.X()=-<me>.X() <me>.Y()=-<me>.Y() <me>.Z()=-<me>.Z()`
Reverse(): void;

// `New.X()=-<me>.X() New.Y()=-<me>.Y() New.Z()=-<me>.Z()`
Reversed(): gp_XYZ;

// `<me>.X()=<me>.X()-theOther.X() <me>.Y()=<me>.Y()-theOther.Y() <me>.Z()=<me>.Z()-theOther.Z()`
Subtract(theOther: gp_XYZ): void;

// `new.X()=<me>.X()-theOther.X() new.Y()=<me>.Y()-theOther.Y() new.Z()=<me>.Z()-theOther.Z()`
Subtracted(theOther: gp_XYZ): gp_XYZ;

// <me> is set to the following linear form
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ, theXYZ4: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ, theXYZ4: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ, theXYZ4: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ, theXYZ4: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ, theXYZ4: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ, theXYZ4: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theXYZ3: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ): void;
SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
SetLinearForm(theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
