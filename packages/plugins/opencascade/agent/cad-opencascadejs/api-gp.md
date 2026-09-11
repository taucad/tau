# libcascade — gp

14 top-level symbols. Signatures are verbatim typescript.

gp: declare class gp

static Resolution(): number;

static Origin(): gp_Pnt;

static DX(): gp_Dir;

static DY(): gp_Dir;

static DZ(): gp_Dir;

static OX(): gp_Ax1;

static OY(): gp_Ax1;

static OZ(): gp_Ax1;

static XOY(): gp_Ax2;

static ZOX(): gp_Ax2;

static YOZ(): gp_Ax2;

static Origin2d(): gp_Pnt2d;

static DX2d(): gp_Dir2d;

static DY2d(): gp_Dir2d;

static OX2d(): gp_Ax2d;

static OY2d(): gp_Ax2d;

delete(): void;

[Symbol.dispose](): void;

gp_Ax1: declare class gp_Ax1

constructor

SetDirection(theV: gp_Dir): void;

SetLocation(theP: gp_Pnt): void;

Direction(): gp_Dir;

Location(): gp_Pnt;

IsCoaxial(Other: gp_Ax1, AngularTolerance: number, LinearTolerance: number): boolean;

IsNormal(theOther: gp_Ax1, theAngularTolerance: number): boolean;

IsOpposite(theOther: gp_Ax1, theAngularTolerance: number): boolean;

IsParallel(theOther: gp_Ax1, theAngularTolerance: number): boolean;

Angle(theOther: gp_Ax1): number;

Reverse(): void;

Reversed(): gp_Ax1;

Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;

Mirrored(P: gp_Pnt): gp_Ax1;
Mirrored(A1: gp_Ax1): gp_Ax1;
Mirrored(A2: gp_Ax2): gp_Ax1;
Mirrored(P: gp_Pnt): gp_Ax1;
Mirrored(A1: gp_Ax1): gp_Ax1;
Mirrored(A2: gp_Ax2): gp_Ax1;
Mirrored(P: gp_Pnt): gp_Ax1;
Mirrored(A1: gp_Ax1): gp_Ax1;
Mirrored(A2: gp_Ax2): gp_Ax1;

Rotate(theA1: gp_Ax1, theAngRad: number): void;

Rotated(theA1: gp_Ax1, theAngRad: number): gp_Ax1;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Ax1;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Ax1;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Ax1;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax1;
Translated(theV: gp_Vec): gp_Ax1;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax1;

delete(): void;

[Symbol.dispose](): void;

gp_Ax2: declare class gp_Ax2

constructor

SetAxis(A1: gp_Ax1): void;

SetDirection(V: gp_Dir): void;

SetLocation(theP: gp_Pnt): void;

SetXDirection(theVx: gp_Dir): void;

SetYDirection(theVy: gp_Dir): void;

Angle(theOther: gp_Ax2): number;

Axis(): gp_Ax1;

Direction(): gp_Dir;

Location(): gp_Pnt;

XDirection(): gp_Dir;

YDirection(): gp_Dir;

IsCoplanar(Other: gp_Ax2, LinearTolerance: number, AngularTolerance: number): boolean;
IsCoplanar(A1: gp_Ax1, LinearTolerance: number, AngularTolerance: number): boolean;
IsCoplanar(Other: gp_Ax2, LinearTolerance: number, AngularTolerance: number): boolean;
IsCoplanar(A1: gp_Ax1, LinearTolerance: number, AngularTolerance: number): boolean;

Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;

Mirrored(P: gp_Pnt): gp_Ax2;
Mirrored(A1: gp_Ax1): gp_Ax2;
Mirrored(A2: gp_Ax2): gp_Ax2;
Mirrored(P: gp_Pnt): gp_Ax2;
Mirrored(A1: gp_Ax1): gp_Ax2;
Mirrored(A2: gp_Ax2): gp_Ax2;
Mirrored(P: gp_Pnt): gp_Ax2;
Mirrored(A1: gp_Ax1): gp_Ax2;
Mirrored(A2: gp_Ax2): gp_Ax2;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Ax2;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Ax2;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Ax2;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Ax2;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax2;
Translated(theV: gp_Vec): gp_Ax2;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax2;

delete(): void;

[Symbol.dispose](): void;

gp_Ax22d: declare class gp_Ax22d

constructor

SetAxis(theA1: gp_Ax22d): void;

SetXAxis(theA1: gp_Ax2d): void;

SetYAxis(theA1: gp_Ax2d): void;

SetLocation(theP: gp_Pnt2d): void;

SetXDirection(theVx: gp_Dir2d): void;

SetYDirection(theVy: gp_Dir2d): void;

XAxis(): gp_Ax2d;

YAxis(): gp_Ax2d;

Location(): gp_Pnt2d;

XDirection(): gp_Dir2d;

YDirection(): gp_Dir2d;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

Mirrored(theP: gp_Pnt2d): gp_Ax22d;
Mirrored(theA: gp_Ax2d): gp_Ax22d;
Mirrored(theP: gp_Pnt2d): gp_Ax22d;
Mirrored(theA: gp_Ax2d): gp_Ax22d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Ax22d;

Scale(theP: gp_Pnt2d, theS: number): void;

Scaled(theP: gp_Pnt2d, theS: number): gp_Ax22d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Ax22d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

Translated(theV: gp_Vec2d): gp_Ax22d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax22d;
Translated(theV: gp_Vec2d): gp_Ax22d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax22d;

delete(): void;

[Symbol.dispose](): void;

gp_Ax2d: declare class gp_Ax2d

constructor

SetLocation(theP: gp_Pnt2d): void;

SetDirection(theV: gp_Dir2d): void;

Location(): gp_Pnt2d;

Direction(): gp_Dir2d;

IsCoaxial(Other: gp_Ax2d, AngularTolerance: number, LinearTolerance: number): boolean;

IsNormal(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

IsOpposite(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

IsParallel(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

Angle(theOther: gp_Ax2d): number;

Reverse(): void;

Reversed(): gp_Ax2d;

Mirror(P: gp_Pnt2d): void;
Mirror(A: gp_Ax2d): void;
Mirror(P: gp_Pnt2d): void;
Mirror(A: gp_Ax2d): void;

Mirrored(P: gp_Pnt2d): gp_Ax2d;
Mirrored(A: gp_Ax2d): gp_Ax2d;
Mirrored(P: gp_Pnt2d): gp_Ax2d;
Mirrored(A: gp_Ax2d): gp_Ax2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Ax2d;

Scale(P: gp_Pnt2d, S: number): void;

Scaled(theP: gp_Pnt2d, theS: number): gp_Ax2d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Ax2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

Translated(theV: gp_Vec2d): gp_Ax2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax2d;
Translated(theV: gp_Vec2d): gp_Ax2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax2d;

delete(): void;

[Symbol.dispose](): void;

gp_Ax3: declare class gp_Ax3

constructor

XReverse(): void;

YReverse(): void;

ZReverse(): void;

SetAxis(theA1: gp_Ax1): void;

SetDirection(theV: gp_Dir): void;

SetLocation(theP: gp_Pnt): void;

SetXDirection(theVx: gp_Dir): void;

SetYDirection(theVy: gp_Dir): void;

Angle(theOther: gp_Ax3): number;

Axis(): gp_Ax1;

Ax2(): gp_Ax2;

Direction(): gp_Dir;

Location(): gp_Pnt;

XDirection(): gp_Dir;

YDirection(): gp_Dir;

Direct(): boolean;

IsCoplanar(theOther: gp_Ax3, theLinearTolerance: number, theAngularTolerance: number): boolean;
IsCoplanar(theA1: gp_Ax1, theLinearTolerance: number, theAngularTolerance: number): boolean;
IsCoplanar(theOther: gp_Ax3, theLinearTolerance: number, theAngularTolerance: number): boolean;
IsCoplanar(theA1: gp_Ax1, theLinearTolerance: number, theAngularTolerance: number): boolean;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

Mirrored(theP: gp_Pnt): gp_Ax3;
Mirrored(theA1: gp_Ax1): gp_Ax3;
Mirrored(theA2: gp_Ax2): gp_Ax3;
Mirrored(theP: gp_Pnt): gp_Ax3;
Mirrored(theA1: gp_Ax1): gp_Ax3;
Mirrored(theA2: gp_Ax2): gp_Ax3;
Mirrored(theP: gp_Pnt): gp_Ax3;
Mirrored(theA1: gp_Ax1): gp_Ax3;
Mirrored(theA2: gp_Ax2): gp_Ax3;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Ax3;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Ax3;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Ax3;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Ax3;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax3;
Translated(theV: gp_Vec): gp_Ax3;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax3;

delete(): void;

[Symbol.dispose](): void;

gp_Circ: declare class gp_Circ

constructor

SetAxis(theA1: gp_Ax1): void;

SetLocation(theP: gp_Pnt): void;

SetPosition(theA2: gp_Ax2): void;

SetRadius(theRadius: number): void;

Area(): number;

Axis(): gp_Ax1;

Length(): number;

Location(): gp_Pnt;

Position(): gp_Ax2;

Radius(): number;

XAxis(): gp_Ax1;

YAxis(): gp_Ax1;

Distance(theP: gp_Pnt): number;

SquareDistance(theP: gp_Pnt): number;

Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

Mirrored(theP: gp_Pnt): gp_Circ;
Mirrored(theA1: gp_Ax1): gp_Circ;
Mirrored(theA2: gp_Ax2): gp_Circ;
Mirrored(theP: gp_Pnt): gp_Circ;
Mirrored(theA1: gp_Ax1): gp_Circ;
Mirrored(theA2: gp_Ax2): gp_Circ;
Mirrored(theP: gp_Pnt): gp_Circ;
Mirrored(theA1: gp_Ax1): gp_Circ;
Mirrored(theA2: gp_Ax2): gp_Circ;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Circ;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Circ;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Circ;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Circ;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Circ;
Translated(theV: gp_Vec): gp_Circ;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Circ;

delete(): void;

[Symbol.dispose](): void;

gp_Circ2d: declare class gp_Circ2d

constructor

SetLocation(theP: gp_Pnt2d): void;

SetXAxis(theA: gp_Ax2d): void;

SetAxis(theA: gp_Ax22d): void;

SetYAxis(theA: gp_Ax2d): void;

SetRadius(theRadius: number): void;

Area(): number;

Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

Contains(theP: gp_Pnt2d, theLinearTolerance: number): boolean;

Distance(theP: gp_Pnt2d): number;

SquareDistance(theP: gp_Pnt2d): number;

Length(): number;

Location(): gp_Pnt2d;

Radius(): number;

Axis(): gp_Ax22d;

Position(): gp_Ax22d;

XAxis(): gp_Ax2d;

YAxis(): gp_Ax2d;

Reverse(): void;

Reversed(): gp_Circ2d;

IsDirect(): boolean;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

Mirrored(theP: gp_Pnt2d): gp_Circ2d;
Mirrored(theA: gp_Ax2d): gp_Circ2d;
Mirrored(theP: gp_Pnt2d): gp_Circ2d;
Mirrored(theA: gp_Ax2d): gp_Circ2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Circ2d;

Scale(theP: gp_Pnt2d, theS: number): void;

Scaled(theP: gp_Pnt2d, theS: number): gp_Circ2d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Circ2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

Translated(theV: gp_Vec2d): gp_Circ2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Circ2d;
Translated(theV: gp_Vec2d): gp_Circ2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Circ2d;

delete(): void;

[Symbol.dispose](): void;

gp_Cone: declare class gp_Cone

constructor

SetAxis(theA1: gp_Ax1): void;

SetLocation(theLoc: gp_Pnt): void;

SetPosition(theA3: gp_Ax3): void;

SetRadius(theR: number): void;

SetSemiAngle(theAng: number): void;

Apex(): gp_Pnt;

UReverse(): void;

VReverse(): void;

Direct(): boolean;

Axis(): gp_Ax1;

Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

Location(): gp_Pnt;

Position(): gp_Ax3;

RefRadius(): number;

SemiAngle(): number;

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

Mirrored(theP: gp_Pnt): gp_Cone;
Mirrored(theA1: gp_Ax1): gp_Cone;
Mirrored(theA2: gp_Ax2): gp_Cone;
Mirrored(theP: gp_Pnt): gp_Cone;
Mirrored(theA1: gp_Ax1): gp_Cone;
Mirrored(theA2: gp_Ax2): gp_Cone;
Mirrored(theP: gp_Pnt): gp_Cone;
Mirrored(theA1: gp_Ax1): gp_Cone;
Mirrored(theA2: gp_Ax2): gp_Cone;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Cone;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Cone;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Cone;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Cone;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cone;
Translated(theV: gp_Vec): gp_Cone;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cone;

delete(): void;

[Symbol.dispose](): void;

gp_Cylinder: declare class gp_Cylinder

constructor

SetAxis(theA1: gp_Ax1): void;

SetLocation(theLoc: gp_Pnt): void;

SetPosition(theA3: gp_Ax3): void;

SetRadius(theR: number): void;

UReverse(): void;

VReverse(): void;

Direct(): boolean;

Axis(): gp_Ax1;

Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

Location(): gp_Pnt;

Position(): gp_Ax3;

Radius(): number;

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

Mirrored(theP: gp_Pnt): gp_Cylinder;
Mirrored(theA1: gp_Ax1): gp_Cylinder;
Mirrored(theA2: gp_Ax2): gp_Cylinder;
Mirrored(theP: gp_Pnt): gp_Cylinder;
Mirrored(theA1: gp_Ax1): gp_Cylinder;
Mirrored(theA2: gp_Ax2): gp_Cylinder;
Mirrored(theP: gp_Pnt): gp_Cylinder;
Mirrored(theA1: gp_Ax1): gp_Cylinder;
Mirrored(theA2: gp_Ax2): gp_Cylinder;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Cylinder;

Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Cylinder;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Cylinder;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Cylinder;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cylinder;
Translated(theV: gp_Vec): gp_Cylinder;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cylinder;

delete(): void;

[Symbol.dispose](): void;

gp_Dir: declare class gp_Dir

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

IsEqual(theOther: gp_Dir, theAngularTolerance: number): boolean;

IsNormal(theOther: gp_Dir, theAngularTolerance: number): boolean;

IsOpposite(theOther: gp_Dir, theAngularTolerance: number): boolean;

IsParallel(theOther: gp_Dir, theAngularTolerance: number): boolean;

Angle(theOther: gp_Dir): number;

AngleWithRef(theOther: gp_Dir, theVRef: gp_Dir): number;

Cross(theRight: gp_Dir): void;

Crossed(theRight: gp_Dir): gp_Dir;

CrossCross(theV1: gp_Dir, theV2: gp_Dir): void;

CrossCrossed(theV1: gp_Dir, theV2: gp_Dir): gp_Dir;

Dot(theOther: gp_Dir): number;

DotCross(theV1: gp_Dir, theV2: gp_Dir): number;

Reverse(): void;

Reversed(): gp_Dir;

Mirror(theV: gp_Dir): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theV: gp_Dir): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theV: gp_Dir): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

Mirrored(theV: gp_Dir): gp_Dir;
Mirrored(theA1: gp_Ax1): gp_Dir;
Mirrored(theA2: gp_Ax2): gp_Dir;
Mirrored(theV: gp_Dir): gp_Dir;
Mirrored(theA1: gp_Ax1): gp_Dir;
Mirrored(theA2: gp_Ax2): gp_Dir;
Mirrored(theV: gp_Dir): gp_Dir;
Mirrored(theA1: gp_Ax1): gp_Dir;
Mirrored(theA2: gp_Ax2): gp_Dir;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Dir;

Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Dir;

delete(): void;

[Symbol.dispose](): void;

gp_Dir_D: typeof gp_Dir_D[keyof typeof gp_Dir_D]

gp_Dir2d: declare class gp_Dir2d

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

IsEqual(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

IsNormal(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

IsOpposite(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

IsParallel(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

Angle(theOther: gp_Dir2d): number;

Crossed(theRight: gp_Dir2d): number;

Dot(theOther: gp_Dir2d): number;

Reverse(): void;

Reversed(): gp_Dir2d;

Mirror(theV: gp_Dir2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theV: gp_Dir2d): void;
Mirror(theA: gp_Ax2d): void;

Mirrored(theV: gp_Dir2d): gp_Dir2d;
Mirrored(theA: gp_Ax2d): gp_Dir2d;
Mirrored(theV: gp_Dir2d): gp_Dir2d;
Mirrored(theA: gp_Ax2d): gp_Dir2d;

Rotate(Ang: number): void;

Rotated(theAng: number): gp_Dir2d;

Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Dir2d;

delete(): void;

[Symbol.dispose](): void;

gp_Dir2d_D: typeof gp_Dir2d_D[keyof typeof gp_Dir2d_D]
