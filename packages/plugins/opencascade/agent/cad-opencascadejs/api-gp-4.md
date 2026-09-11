# libcascade — gp (4)

4 top-level symbols. Signatures are verbatim typescript.

gp_Vec: declare class gp_Vec

constructor

SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number, theZv: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number, theZv: number): void;

SetX(theX: number): void;

SetY(theY: number): void;

SetZ(theZ: number): void;

SetXYZ(theCoord: gp_XYZ): void;

Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number, theZv?: number): { theXv: number; theYv: number; theZv: number };
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number, theZv?: number): { theXv: number; theYv: number; theZv: number };

X(): number;

Y(): number;

Z(): number;

XYZ(): gp_XYZ;

IsEqual(theOther: gp_Vec, theLinearTolerance: number, theAngularTolerance: number): boolean;

IsNormal(theOther: gp_Vec, theAngularTolerance: number): boolean;

IsOpposite(theOther: gp_Vec, theAngularTolerance: number): boolean;

IsParallel(theOther: gp_Vec, theAngularTolerance: number): boolean;

Angle(theOther: gp_Vec): number;

AngleWithRef(theOther: gp_Vec, theVRef: gp_Vec): number;

Magnitude(): number;

SquareMagnitude(): number;

Add(theOther: gp_Vec): void;

Added(theOther: gp_Vec): gp_Vec;

Subtract(theRight: gp_Vec): void;

Subtracted(theRight: gp_Vec): gp_Vec;

Multiply(theScalar: number): void;

Multiplied(theScalar: number): gp_Vec;

Divide(theScalar: number): void;

Divided(theScalar: number): gp_Vec;

Cross(theRight: gp_Vec): void;

Crossed(theRight: gp_Vec): gp_Vec;

CrossMagnitude(theRight: gp_Vec): number;

CrossSquareMagnitude(theRight: gp_Vec): number;

CrossCross(theV1: gp_Vec, theV2: gp_Vec): void;

CrossCrossed(theV1: gp_Vec, theV2: gp_Vec): gp_Vec;

Dot(theOther: gp_Vec): number;

DotCross(theV1: gp_Vec, theV2: gp_Vec): number;

Normalize(): void;

Normalized(): gp_Vec;

Reverse(): void;

Reversed(): gp_Vec;

SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;

Mirror(theV: gp_Vec): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theV: gp_Vec): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theV: gp_Vec): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

Mirrored(theV: gp_Vec): gp_Vec;
Mirrored(theA1: gp_Ax1): gp_Vec;
Mirrored(theA2: gp_Ax2): gp_Vec;
Mirrored(theV: gp_Vec): gp_Vec;
Mirrored(theA1: gp_Ax1): gp_Vec;
Mirrored(theA2: gp_Ax2): gp_Vec;
Mirrored(theV: gp_Vec): gp_Vec;
Mirrored(theA1: gp_Ax1): gp_Vec;
Mirrored(theA2: gp_Ax2): gp_Vec;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Vec;

Scale(theS: number): void;

Scaled(theS: number): gp_Vec;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Vec;

delete(): void;

[Symbol.dispose](): void;

gp_Vec2d: declare class gp_Vec2d

constructor

SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number): void;

SetX(theX: number): void;

SetY(theY: number): void;

SetXY(theCoord: gp_XY): void;

Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number): { theXv: number; theYv: number };
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number): { theXv: number; theYv: number };

X(): number;

Y(): number;

XY(): gp_XY;

IsEqual(theOther: gp_Vec2d, theLinearTolerance: number, theAngularTolerance: number): boolean;

IsNormal(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

IsOpposite(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

IsParallel(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

Angle(theOther: gp_Vec2d): number;

Magnitude(): number;

SquareMagnitude(): number;

Add(theOther: gp_Vec2d): void;

Added(theOther: gp_Vec2d): gp_Vec2d;

Crossed(theRight: gp_Vec2d): number;

CrossMagnitude(theRight: gp_Vec2d): number;

CrossSquareMagnitude(theRight: gp_Vec2d): number;

Divide(theScalar: number): void;

Divided(theScalar: number): gp_Vec2d;

Dot(theOther: gp_Vec2d): number;

GetNormal(): gp_Vec2d;

Multiply(theScalar: number): void;

Multiplied(theScalar: number): gp_Vec2d;

Normalize(): void;

Normalized(): gp_Vec2d;

Reverse(): void;

Reversed(): gp_Vec2d;

Subtract(theRight: gp_Vec2d): void;

Subtracted(theRight: gp_Vec2d): gp_Vec2d;

SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;

Mirror(theV: gp_Vec2d): void;
Mirror(theA1: gp_Ax2d): void;
Mirror(theV: gp_Vec2d): void;
Mirror(theA1: gp_Ax2d): void;

Mirrored(theV: gp_Vec2d): gp_Vec2d;
Mirrored(theA1: gp_Ax2d): gp_Vec2d;
Mirrored(theV: gp_Vec2d): gp_Vec2d;
Mirrored(theA1: gp_Ax2d): gp_Vec2d;

Rotate(theAng: number): void;

Rotated(theAng: number): gp_Vec2d;

Scale(theS: number): void;

Scaled(theS: number): gp_Vec2d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Vec2d;

delete(): void;

[Symbol.dispose](): void;

gp_XY: declare class gp_XY

constructor

SetCoord(theIndex: number, theXi: number): void;
SetCoord(theX: number, theY: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theX: number, theY: number): void;

SetX(theX: number): void;

SetY(theY: number): void;

Coord(theIndex: number): number;
Coord(theX?: number, theY?: number): { theX: number; theY: number };
Coord(theIndex: number): number;
Coord(theX?: number, theY?: number): { theX: number; theY: number };

ChangeCoord(theIndex: number): number;

X(): number;

Y(): number;

Modulus(): number;

SquareModulus(): number;

IsEqual(theOther: gp_XY, theTolerance: number): boolean;

Add(theOther: gp_XY): void;

Added(theOther: gp_XY): gp_XY;

Crossed(theOther: gp_XY): number;

CrossMagnitude(theRight: gp_XY): number;

CrossSquareMagnitude(theRight: gp_XY): number;

Divide(theScalar: number): void;

Divided(theScalar: number): gp_XY;

Dot(theOther: gp_XY): number;

Multiply(theScalar: number): void;
Multiply(theOther: gp_XY): void;
Multiply(theMatrix: gp_Mat2d): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_XY): void;
Multiply(theMatrix: gp_Mat2d): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_XY): void;
Multiply(theMatrix: gp_Mat2d): void;

Multiplied(theScalar: number): gp_XY;
Multiplied(theOther: gp_XY): gp_XY;
Multiplied(theMatrix: gp_Mat2d): gp_XY;
Multiplied(theScalar: number): gp_XY;
Multiplied(theOther: gp_XY): gp_XY;
Multiplied(theMatrix: gp_Mat2d): gp_XY;
Multiplied(theScalar: number): gp_XY;
Multiplied(theOther: gp_XY): gp_XY;
Multiplied(theMatrix: gp_Mat2d): gp_XY;

Normalize(): void;

Normalized(): gp_XY;

Reverse(): void;

Reversed(): gp_XY;

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

Subtract(theOther: gp_XY): void;

Subtracted(theOther: gp_XY): gp_XY;

delete(): void;

[Symbol.dispose](): void;

gp_XYZ: declare class gp_XYZ

constructor

SetCoord(theX: number, theY: number, theZ: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theX: number, theY: number, theZ: number): void;
SetCoord(theIndex: number, theXi: number): void;

SetX(theX: number): void;

SetY(theY: number): void;

SetZ(theZ: number): void;

Coord(theIndex: number): number;
Coord(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
Coord(theIndex: number): number;
Coord(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

ChangeCoord(theIndex: number): number;

GetData(): number;

ChangeData(): number;

X(): number;

Y(): number;

Z(): number;

Modulus(): number;

SquareModulus(): number;

IsEqual(theOther: gp_XYZ, theTolerance: number): boolean;

Add(theOther: gp_XYZ): void;

Added(theOther: gp_XYZ): gp_XYZ;

Cross(theOther: gp_XYZ): void;

Crossed(theOther: gp_XYZ): gp_XYZ;

CrossMagnitude(theRight: gp_XYZ): number;

CrossSquareMagnitude(theRight: gp_XYZ): number;

CrossCross(theCoord1: gp_XYZ, theCoord2: gp_XYZ): void;

CrossCrossed(theCoord1: gp_XYZ, theCoord2: gp_XYZ): gp_XYZ;

Divide(theScalar: number): void;

Divided(theScalar: number): gp_XYZ;

Dot(theOther: gp_XYZ): number;

DotCross(theCoord1: gp_XYZ, theCoord2: gp_XYZ): number;

Multiply(theScalar: number): void;
Multiply(theOther: gp_XYZ): void;
Multiply(theMatrix: gp_Mat): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_XYZ): void;
Multiply(theMatrix: gp_Mat): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_XYZ): void;
Multiply(theMatrix: gp_Mat): void;

Multiplied(theScalar: number): gp_XYZ;
Multiplied(theOther: gp_XYZ): gp_XYZ;
Multiplied(theMatrix: gp_Mat): gp_XYZ;
Multiplied(theScalar: number): gp_XYZ;
Multiplied(theOther: gp_XYZ): gp_XYZ;
Multiplied(theMatrix: gp_Mat): gp_XYZ;
Multiplied(theScalar: number): gp_XYZ;
Multiplied(theOther: gp_XYZ): gp_XYZ;
Multiplied(theMatrix: gp_Mat): gp_XYZ;

Normalize(): void;

Normalized(): gp_XYZ;

Reverse(): void;

Reversed(): gp_XYZ;

Subtract(theOther: gp_XYZ): void;

Subtracted(theOther: gp_XYZ): gp_XYZ;

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

delete(): void;

[Symbol.dispose](): void;
