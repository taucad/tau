# libcascade — gp (2)

13 top-level symbols. Signatures are verbatim typescript.

gp_Elips: declare class gp_Elips

constructor

SetAxis(theA1: gp_Ax1): void;

SetLocation(theP: gp_Pnt): void;

SetMajorRadius(theMajorRadius: number): void;

SetMinorRadius(theMinorRadius: number): void;

SetPosition(theA2: gp_Ax2): void;

Area(): number;

Axis(): gp_Ax1;

Directrix1(): gp_Ax1;

Directrix2(): gp_Ax1;

Eccentricity(): number;

Focal(): number;

Focus1(): gp_Pnt;

Focus2(): gp_Pnt;

Location(): gp_Pnt;

MajorRadius(): number;

MinorRadius(): number;

Parameter(): number;

Position(): gp_Ax2;

XAxis(): gp_Ax1;

YAxis(): gp_Ax1;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

Mirrored(theP: gp_Pnt): gp_Elips;
Mirrored(theA1: gp_Ax1): gp_Elips;
Mirrored(theA2: gp_Ax2): gp_Elips;
Mirrored(theP: gp_Pnt): gp_Elips;
Mirrored(theA1: gp_Ax1): gp_Elips;
Mirrored(theA2: gp_Ax2): gp_Elips;
Mirrored(theP: gp_Pnt): gp_Elips;
Mirrored(theA1: gp_Ax1): gp_Elips;
Mirrored(theA2: gp_Ax2): gp_Elips;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Elips;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Elips;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Elips;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Elips;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Elips;
Translated(theV: gp_Vec): gp_Elips;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Elips;

delete(): void;

[Symbol.dispose](): void;

gp_Elips2d: declare class gp_Elips2d

constructor

SetLocation(theP: gp_Pnt2d): void;

SetMajorRadius(theMajorRadius: number): void;

SetMinorRadius(theMinorRadius: number): void;

SetAxis(theA: gp_Ax22d): void;

SetXAxis(theA: gp_Ax2d): void;

SetYAxis(theA: gp_Ax2d): void;

Area(): number;

Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

Directrix1(): gp_Ax2d;

Directrix2(): gp_Ax2d;

Eccentricity(): number;

Focal(): number;

Focus1(): gp_Pnt2d;

Focus2(): gp_Pnt2d;

Location(): gp_Pnt2d;

MajorRadius(): number;

MinorRadius(): number;

Parameter(): number;

Axis(): gp_Ax22d;

XAxis(): gp_Ax2d;

YAxis(): gp_Ax2d;

Reverse(): void;

Reversed(): gp_Elips2d;

IsDirect(): boolean;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

Mirrored(theP: gp_Pnt2d): gp_Elips2d;
Mirrored(theA: gp_Ax2d): gp_Elips2d;
Mirrored(theP: gp_Pnt2d): gp_Elips2d;
Mirrored(theA: gp_Ax2d): gp_Elips2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Elips2d;

Scale(theP: gp_Pnt2d, theS: number): void;

Scaled(theP: gp_Pnt2d, theS: number): gp_Elips2d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Elips2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

Translated(theV: gp_Vec2d): gp_Elips2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Elips2d;
Translated(theV: gp_Vec2d): gp_Elips2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Elips2d;

delete(): void;

[Symbol.dispose](): void;

gp_EulerSequence: typeof gp_EulerSequence[keyof typeof gp_EulerSequence]

gp_GTrsf: declare class gp_GTrsf

constructor

SetAffinity(theA1: gp_Ax1, theRatio: number): void;
SetAffinity(theA2: gp_Ax2, theRatio: number): void;
SetAffinity(theA1: gp_Ax1, theRatio: number): void;
SetAffinity(theA2: gp_Ax2, theRatio: number): void;

SetValue(theRow: number, theCol: number, theValue: number): void;

SetVectorialPart(theMatrix: gp_Mat): void;

SetTranslationPart(theCoord: gp_XYZ): void;

SetTrsf(theT: gp_Trsf): void;

IsNegative(): boolean;

IsSingular(): boolean;

Form(): gp_TrsfForm;

SetForm(): void;

TranslationPart(): gp_XYZ;

VectorialPart(): gp_Mat;

Value(theRow: number, theCol: number): number;

Invert(): void;

Inverted(): gp_GTrsf;

Multiplied(theT: gp_GTrsf): gp_GTrsf;

Multiply(theT: gp_GTrsf): void;

PreMultiply(theT: gp_GTrsf): void;

Power(theN: number): void;

Powered(theN: number): gp_GTrsf;

Transforms(theCoord: gp_XYZ): void;
Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
Transforms(theCoord: gp_XYZ): void;
Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

Trsf(): gp_Trsf;

delete(): void;

[Symbol.dispose](): void;

gp_GTrsf2d: declare class gp_GTrsf2d

constructor

SetAffinity(theA: gp_Ax2d, theRatio: number): void;

SetValue(theRow: number, theCol: number, theValue: number): void;

SetTranslationPart(theCoord: gp_XY): void;

SetTrsf2d(theT: gp_Trsf2d): void;

SetVectorialPart(theMatrix: gp_Mat2d): void;

IsNegative(): boolean;

IsSingular(): boolean;

Form(): gp_TrsfForm;

TranslationPart(): gp_XY;

VectorialPart(): gp_Mat2d;

Value(theRow: number, theCol: number): number;

Invert(): void;

Inverted(): gp_GTrsf2d;

Multiplied(theT: gp_GTrsf2d): gp_GTrsf2d;

Multiply(theT: gp_GTrsf2d): void;

PreMultiply(theT: gp_GTrsf2d): void;

Power(theN: number): void;

Powered(theN: number): gp_GTrsf2d;

Transforms(theCoord: gp_XY): void;
Transforms(theX?: number, theY?: number): { theX: number; theY: number };
Transforms(theCoord: gp_XY): void;
Transforms(theX?: number, theY?: number): { theX: number; theY: number };

Transformed(theCoord: gp_XY): gp_XY;

Trsf2d(): gp_Trsf2d;

delete(): void;

[Symbol.dispose](): void;

gp_Hypr: declare class gp_Hypr

constructor

SetAxis(theA1: gp_Ax1): void;

SetLocation(theP: gp_Pnt): void;

SetMajorRadius(theMajorRadius: number): void;

SetMinorRadius(theMinorRadius: number): void;

SetPosition(theA2: gp_Ax2): void;

Asymptote1(): gp_Ax1;

Asymptote2(): gp_Ax1;

Axis(): gp_Ax1;

ConjugateBranch1(): gp_Hypr;

ConjugateBranch2(): gp_Hypr;

Directrix1(): gp_Ax1;

Directrix2(): gp_Ax1;

Eccentricity(): number;

Focal(): number;

Focus1(): gp_Pnt;

Focus2(): gp_Pnt;

Location(): gp_Pnt;

MajorRadius(): number;

MinorRadius(): number;

OtherBranch(): gp_Hypr;

Parameter(): number;

Position(): gp_Ax2;

XAxis(): gp_Ax1;

YAxis(): gp_Ax1;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

Mirrored(theP: gp_Pnt): gp_Hypr;
Mirrored(theA1: gp_Ax1): gp_Hypr;
Mirrored(theA2: gp_Ax2): gp_Hypr;
Mirrored(theP: gp_Pnt): gp_Hypr;
Mirrored(theA1: gp_Ax1): gp_Hypr;
Mirrored(theA2: gp_Ax2): gp_Hypr;
Mirrored(theP: gp_Pnt): gp_Hypr;
Mirrored(theA1: gp_Ax1): gp_Hypr;
Mirrored(theA2: gp_Ax2): gp_Hypr;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Hypr;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Hypr;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Hypr;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Hypr;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Hypr;
Translated(theV: gp_Vec): gp_Hypr;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Hypr;

delete(): void;

[Symbol.dispose](): void;

gp_Hypr2d: declare class gp_Hypr2d

constructor

SetLocation(theP: gp_Pnt2d): void;

SetMajorRadius(theMajorRadius: number): void;

SetMinorRadius(theMinorRadius: number): void;

SetAxis(theA: gp_Ax22d): void;

SetXAxis(theA: gp_Ax2d): void;

SetYAxis(theA: gp_Ax2d): void;

Asymptote1(): gp_Ax2d;

Asymptote2(): gp_Ax2d;

Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

ConjugateBranch1(): gp_Hypr2d;

ConjugateBranch2(): gp_Hypr2d;

Directrix1(): gp_Ax2d;

Directrix2(): gp_Ax2d;

Eccentricity(): number;

Focal(): number;

Focus1(): gp_Pnt2d;

Focus2(): gp_Pnt2d;

Location(): gp_Pnt2d;

MajorRadius(): number;

MinorRadius(): number;

OtherBranch(): gp_Hypr2d;

Parameter(): number;

Axis(): gp_Ax22d;

XAxis(): gp_Ax2d;

YAxis(): gp_Ax2d;

Reverse(): void;

Reversed(): gp_Hypr2d;

IsDirect(): boolean;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

Mirrored(theP: gp_Pnt2d): gp_Hypr2d;
Mirrored(theA: gp_Ax2d): gp_Hypr2d;
Mirrored(theP: gp_Pnt2d): gp_Hypr2d;
Mirrored(theA: gp_Ax2d): gp_Hypr2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Hypr2d;

Scale(theP: gp_Pnt2d, theS: number): void;

Scaled(theP: gp_Pnt2d, theS: number): gp_Hypr2d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Hypr2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

Translated(theV: gp_Vec2d): gp_Hypr2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Hypr2d;
Translated(theV: gp_Vec2d): gp_Hypr2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Hypr2d;

delete(): void;

[Symbol.dispose](): void;

gp_Lin: declare class gp_Lin

constructor

Reverse(): void;

Reversed(): gp_Lin;

SetDirection(theV: gp_Dir): void;

SetLocation(theP: gp_Pnt): void;

SetPosition(theA1: gp_Ax1): void;

Direction(): gp_Dir;

Location(): gp_Pnt;

Position(): gp_Ax1;

Angle(theOther: gp_Lin): number;

Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;

Distance(theP: gp_Pnt): number;
Distance(theOther: gp_Lin): number;
Distance(theP: gp_Pnt): number;
Distance(theOther: gp_Lin): number;

SquareDistance(theP: gp_Pnt): number;
SquareDistance(theOther: gp_Lin): number;
SquareDistance(theP: gp_Pnt): number;
SquareDistance(theOther: gp_Lin): number;

Normal(theP: gp_Pnt): gp_Lin;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

Mirrored(theP: gp_Pnt): gp_Lin;
Mirrored(theA1: gp_Ax1): gp_Lin;
Mirrored(theA2: gp_Ax2): gp_Lin;
Mirrored(theP: gp_Pnt): gp_Lin;
Mirrored(theA1: gp_Ax1): gp_Lin;
Mirrored(theA2: gp_Ax2): gp_Lin;
Mirrored(theP: gp_Pnt): gp_Lin;
Mirrored(theA1: gp_Ax1): gp_Lin;
Mirrored(theA2: gp_Ax2): gp_Lin;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Lin;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Lin;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Lin;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Lin;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Lin;
Translated(theV: gp_Vec): gp_Lin;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Lin;

delete(): void;

[Symbol.dispose](): void;

gp_Lin2d: declare class gp_Lin2d

constructor

Reverse(): void;

Reversed(): gp_Lin2d;

SetDirection(theV: gp_Dir2d): void;

SetLocation(theP: gp_Pnt2d): void;

SetPosition(theA: gp_Ax2d): void;

Coefficients(theA?: number, theB?: number, theC?: number): { theA: number; theB: number; theC: number };

Direction(): gp_Dir2d;

Location(): gp_Pnt2d;

Position(): gp_Ax2d;

Angle(theOther: gp_Lin2d): number;

Contains(theP: gp_Pnt2d, theLinearTolerance: number): boolean;

Distance(theP: gp_Pnt2d): number;
Distance(theOther: gp_Lin2d): number;
Distance(theP: gp_Pnt2d): number;
Distance(theOther: gp_Lin2d): number;

SquareDistance(theP: gp_Pnt2d): number;
SquareDistance(theOther: gp_Lin2d): number;
SquareDistance(theP: gp_Pnt2d): number;
SquareDistance(theOther: gp_Lin2d): number;

Normal(theP: gp_Pnt2d): gp_Lin2d;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

Mirrored(theP: gp_Pnt2d): gp_Lin2d;
Mirrored(theA: gp_Ax2d): gp_Lin2d;
Mirrored(theP: gp_Pnt2d): gp_Lin2d;
Mirrored(theA: gp_Ax2d): gp_Lin2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Lin2d;

Scale(theP: gp_Pnt2d, theS: number): void;

Scaled(theP: gp_Pnt2d, theS: number): gp_Lin2d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Lin2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

Translated(theV: gp_Vec2d): gp_Lin2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Lin2d;
Translated(theV: gp_Vec2d): gp_Lin2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Lin2d;

delete(): void;

[Symbol.dispose](): void;

gp_Mat: declare class gp_Mat

constructor

SetCol(theCol: number, theValue: gp_XYZ): void;

SetCols(theCol1: gp_XYZ, theCol2: gp_XYZ, theCol3: gp_XYZ): void;

SetCross(theRef: gp_XYZ): void;

SetDiagonal(theX1: number, theX2: number, theX3: number): void;

SetDot(theRef: gp_XYZ): void;

SetIdentity(): void;

SetRotation(theAxis: gp_XYZ, theAng: number): void;

SetRow(theRow: number, theValue: gp_XYZ): void;

SetRows(theRow1: gp_XYZ, theRow2: gp_XYZ, theRow3: gp_XYZ): void;

SetScale(theS: number): void;

SetValue(theRow: number, theCol: number, theValue: number): void;

Column(theCol: number): gp_XYZ;

Determinant(): number;

Diagonal(): gp_XYZ;

Row(theRow: number): gp_XYZ;

Value(theRow: number, theCol: number): number;

ChangeValue(theRow: number, theCol: number): number;

IsSingular(): boolean;

Add(theOther: gp_Mat): void;

Added(theOther: gp_Mat): gp_Mat;

Divide(theScalar: number): void;

Divided(theScalar: number): gp_Mat;

Invert(): void;

Inverted(): gp_Mat;

Multiplied(theOther: gp_Mat): gp_Mat;
Multiplied(theScalar: number): gp_Mat;
Multiplied(theOther: gp_Mat): gp_Mat;
Multiplied(theScalar: number): gp_Mat;

Multiply(theOther: gp_Mat): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_Mat): void;
Multiply(theScalar: number): void;

PreMultiply(theOther: gp_Mat): void;

Power(N: number): void;

Powered(theN: number): gp_Mat;

Subtract(theOther: gp_Mat): void;

Subtracted(theOther: gp_Mat): gp_Mat;

Transpose(): void;

Transposed(): gp_Mat;

delete(): void;

[Symbol.dispose](): void;

gp_Mat2d: declare class gp_Mat2d

constructor

SetCol(theCol: number, theValue: gp_XY): void;

SetCols(theCol1: gp_XY, theCol2: gp_XY): void;

SetDiagonal(theX1: number, theX2: number): void;

SetIdentity(): void;

SetRotation(theAng: number): void;

SetRow(theRow: number, theValue: gp_XY): void;

SetRows(theRow1: gp_XY, theRow2: gp_XY): void;

SetScale(theS: number): void;

SetValue(theRow: number, theCol: number, theValue: number): void;

Column(theCol: number): gp_XY;

Determinant(): number;

Diagonal(): gp_XY;

Row(theRow: number): gp_XY;

Value(theRow: number, theCol: number): number;

ChangeValue(theRow: number, theCol: number): number;

IsSingular(): boolean;

Add(Other: gp_Mat2d): void;

Added(theOther: gp_Mat2d): gp_Mat2d;

Divide(theScalar: number): void;

Divided(theScalar: number): gp_Mat2d;

Invert(): void;

Inverted(): gp_Mat2d;

Multiplied(theOther: gp_Mat2d): gp_Mat2d;
Multiplied(theScalar: number): gp_Mat2d;
Multiplied(theOther: gp_Mat2d): gp_Mat2d;
Multiplied(theScalar: number): gp_Mat2d;

Multiply(theOther: gp_Mat2d): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_Mat2d): void;
Multiply(theScalar: number): void;

PreMultiply(theOther: gp_Mat2d): void;

Power(theN: number): void;

Powered(theN: number): gp_Mat2d;

Subtract(theOther: gp_Mat2d): void;

Subtracted(theOther: gp_Mat2d): gp_Mat2d;

Transpose(): void;

Transposed(): gp_Mat2d;

delete(): void;

[Symbol.dispose](): void;

gp_Parab: declare class gp_Parab

constructor

SetAxis(theA1: gp_Ax1): void;

SetFocal(theFocal: number): void;

SetLocation(theP: gp_Pnt): void;

SetPosition(theA2: gp_Ax2): void;

Axis(): gp_Ax1;

Directrix(): gp_Ax1;

Focal(): number;

Focus(): gp_Pnt;

Location(): gp_Pnt;

Parameter(): number;

Position(): gp_Ax2;

XAxis(): gp_Ax1;

YAxis(): gp_Ax1;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

Mirrored(theP: gp_Pnt): gp_Parab;
Mirrored(theA1: gp_Ax1): gp_Parab;
Mirrored(theA2: gp_Ax2): gp_Parab;
Mirrored(theP: gp_Pnt): gp_Parab;
Mirrored(theA1: gp_Ax1): gp_Parab;
Mirrored(theA2: gp_Ax2): gp_Parab;
Mirrored(theP: gp_Pnt): gp_Parab;
Mirrored(theA1: gp_Ax1): gp_Parab;
Mirrored(theA2: gp_Ax2): gp_Parab;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Parab;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Parab;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Parab;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Parab;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Parab;
Translated(theV: gp_Vec): gp_Parab;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Parab;

delete(): void;

[Symbol.dispose](): void;

gp_Parab2d: declare class gp_Parab2d

constructor

SetFocal(theFocal: number): void;

SetLocation(theP: gp_Pnt2d): void;

SetMirrorAxis(theA: gp_Ax2d): void;

SetAxis(theA: gp_Ax22d): void;

Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

Directrix(): gp_Ax2d;

Focal(): number;

Focus(): gp_Pnt2d;

Location(): gp_Pnt2d;

MirrorAxis(): gp_Ax2d;

Axis(): gp_Ax22d;

Parameter(): number;

Reverse(): void;

Reversed(): gp_Parab2d;

IsDirect(): boolean;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

Mirrored(theP: gp_Pnt2d): gp_Parab2d;
Mirrored(theA: gp_Ax2d): gp_Parab2d;
Mirrored(theP: gp_Pnt2d): gp_Parab2d;
Mirrored(theA: gp_Ax2d): gp_Parab2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Parab2d;

Scale(theP: gp_Pnt2d, theS: number): void;

Scaled(theP: gp_Pnt2d, theS: number): gp_Parab2d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Parab2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

Translated(theV: gp_Vec2d): gp_Parab2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Parab2d;
Translated(theV: gp_Vec2d): gp_Parab2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Parab2d;

delete(): void;

[Symbol.dispose](): void;
