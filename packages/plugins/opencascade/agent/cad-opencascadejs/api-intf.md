# libcascade — Intf

9 top-level symbols. Signatures are verbatim typescript.

Intf: declare class Intf

constructor

static PlaneEquation(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, NormalVector: gp_XYZ, PolarDistance?: number): { PolarDistance: number };

static Contain(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, ThePnt: gp_Pnt): boolean;

delete(): void;

[Symbol.dispose](): void;

Intf_Interference: declare class Intf_Interference

NbSectionPoints(): number;

NbSectionLines(): number;

LineValue(Index: number): Intf_SectionLine;

NbTangentZones(): number;

ZoneValue(Index: number): Intf_TangentZone;

GetTolerance(): number;

Insert(TheZone: Intf_TangentZone): boolean;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

Intf_InterferencePolygon2d: declare class Intf_InterferencePolygon2d extends Intf_Interference

constructor

Perform(Obje1: Intf_Polygon2d, Obje2: Intf_Polygon2d): void;
Perform(Obje: Intf_Polygon2d): void;
Perform(Obje1: Intf_Polygon2d, Obje2: Intf_Polygon2d): void;
Perform(Obje: Intf_Polygon2d): void;

Pnt2dValue(Index: number): gp_Pnt2d;

delete(): void;

[Symbol.dispose](): void;

Intf_PIType: typeof Intf_PIType[keyof typeof Intf_PIType]

Intf_Polygon2d: declare class Intf_Polygon2d

Bounding(): Bnd_Box2d;

Closed(): boolean;

DeflectionOverEstimation(): number;

NbSegments(): number;

Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;

delete(): void;

[Symbol.dispose](): void;

Intf_SectionLine: declare class Intf_SectionLine

constructor

NumberOfPoints(): number;

IsClosed(): boolean;

IsEqual(Other: Intf_SectionLine): boolean;

Append(LS: Intf_SectionLine): void;

Prepend(LS: Intf_SectionLine): void;

Reverse(): void;

Close(): void;

Dump(Indent: number): void;

delete(): void;

[Symbol.dispose](): void;

Intf_TangentZone: declare class Intf_TangentZone

constructor

NumberOfPoints(): number;

IsEqual(Other: Intf_TangentZone): boolean;

ParamOnFirst(paraMin?: number, paraMax?: number): { paraMin: number; paraMax: number };

ParamOnSecond(paraMin?: number, paraMax?: number): { paraMin: number; paraMax: number };

InfoFirst(segMin?: number, paraMin?: number, segMax?: number, paraMax?: number): { segMin: number; paraMin: number; segMax: number; paraMax: number };

InfoSecond(segMin?: number, paraMin?: number, segMax?: number, paraMax?: number): { segMin: number; paraMin: number; segMax: number; paraMax: number };

HasCommonRange(Other: Intf_TangentZone): boolean;

Append(Tzi: Intf_TangentZone): void;

Dump(Indent: number): void;

delete(): void;

[Symbol.dispose](): void;

Intf_Tool: declare class Intf_Tool

constructor

Lin2dBox(theLin2d: gp_Lin2d, bounding: Bnd_Box2d, boxLin: Bnd_Box2d): void;

Hypr2dBox(theHypr2d: gp_Hypr2d, bounding: Bnd_Box2d, boxHypr: Bnd_Box2d): void;

Parab2dBox(theParab2d: gp_Parab2d, bounding: Bnd_Box2d, boxHypr: Bnd_Box2d): void;

LinBox(theLin: gp_Lin, bounding: Bnd_Box, boxLin: Bnd_Box): void;

HyprBox(theHypr: gp_Hypr, bounding: Bnd_Box, boxHypr: Bnd_Box): void;

ParabBox(theParab: gp_Parab, bounding: Bnd_Box, boxHypr: Bnd_Box): void;

NbSegments(): number;

BeginParam(SegmentNum: number): number;

EndParam(SegmentNum: number): number;

delete(): void;

[Symbol.dispose](): void;

Intf_Array1OfLin: NCollection_Array1_gp_Lin
