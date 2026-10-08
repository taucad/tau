# libcascade — Intf

9 top-level symbols. Signatures are verbatim typescript.

Intf: declare class Intf

  // Intf.constructor (constructor)
  constructor();

  // Intf.PlaneEquation (method)
  static PlaneEquation(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, NormalVector: gp_XYZ, PolarDistance?: number): { PolarDistance: number };

  // Intf.Contain (method)
  static Contain(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, ThePnt: gp_Pnt): boolean;

  // Intf.delete (method)
  delete(): void;

  // Intf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intf_Interference: declare class Intf_Interference

  // Intf_Interference.NbSectionPoints (method)
  NbSectionPoints(): number;

  // Intf_Interference.NbSectionLines (method)
  NbSectionLines(): number;

  // Intf_Interference.LineValue (method)
  LineValue(Index: number): Intf_SectionLine;

  // Intf_Interference.NbTangentZones (method)
  NbTangentZones(): number;

  // Intf_Interference.ZoneValue (method)
  ZoneValue(Index: number): Intf_TangentZone;

  // Intf_Interference.GetTolerance (method)
  GetTolerance(): number;

  // Intf_Interference.Insert (method)
  Insert(TheZone: Intf_TangentZone): boolean;

  // Intf_Interference.Dump (method)
  Dump(): void;

  // Intf_Interference.delete (method)
  delete(): void;

  // Intf_Interference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intf_InterferencePolygon2d: declare class Intf_InterferencePolygon2d extends Intf_Interference

  // Intf_InterferencePolygon2d.constructor (constructor)
  constructor();
  constructor(Obje: Intf_Polygon2d);
  constructor(Obje1: Intf_Polygon2d, Obje2: Intf_Polygon2d);

  // Intf_InterferencePolygon2d.Perform (method)
  Perform(Obje1: Intf_Polygon2d, Obje2: Intf_Polygon2d): void;
  Perform(Obje: Intf_Polygon2d): void;

  // Intf_InterferencePolygon2d.Pnt2dValue (method)
  Pnt2dValue(Index: number): gp_Pnt2d;

  // Intf_InterferencePolygon2d.delete (method)
  delete(): void;

  // Intf_InterferencePolygon2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intf_PIType: typeof Intf_PIType[keyof typeof Intf_PIType]

  readonly Intf_EXTERNAL: 'Intf_EXTERNAL'

  readonly Intf_FACE: 'Intf_FACE'

  readonly Intf_EDGE: 'Intf_EDGE'

  readonly Intf_VERTEX: 'Intf_VERTEX'

Intf_Polygon2d: declare class Intf_Polygon2d

  // Intf_Polygon2d.Bounding (method)
  Bounding(): Bnd_Box2d;

  // Intf_Polygon2d.Closed (method)
  Closed(): boolean;

  // Intf_Polygon2d.DeflectionOverEstimation (method)
  DeflectionOverEstimation(): number;

  // Intf_Polygon2d.NbSegments (method)
  NbSegments(): number;

  // Intf_Polygon2d.Segment (method)
  Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;

  // Intf_Polygon2d.delete (method)
  delete(): void;

  // Intf_Polygon2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intf_SectionLine: declare class Intf_SectionLine

  // Intf_SectionLine.constructor (constructor)
  constructor();
  constructor(Other: Intf_SectionLine);

  // Intf_SectionLine.NumberOfPoints (method)
  NumberOfPoints(): number;

  // Intf_SectionLine.IsClosed (method)
  IsClosed(): boolean;

  // Intf_SectionLine.IsEqual (method)
  IsEqual(Other: Intf_SectionLine): boolean;

  // Intf_SectionLine.Append (method)
  Append(LS: Intf_SectionLine): void;

  // Intf_SectionLine.Prepend (method)
  Prepend(LS: Intf_SectionLine): void;

  // Intf_SectionLine.Reverse (method)
  Reverse(): void;

  // Intf_SectionLine.Close (method)
  Close(): void;

  // Intf_SectionLine.Dump (method)
  Dump(Indent: number): void;

  // Intf_SectionLine.delete (method)
  delete(): void;

  // Intf_SectionLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intf_TangentZone: declare class Intf_TangentZone

  // Intf_TangentZone.constructor (constructor)
  constructor();

  // Intf_TangentZone.NumberOfPoints (method)
  NumberOfPoints(): number;

  // Intf_TangentZone.IsEqual (method)
  IsEqual(Other: Intf_TangentZone): boolean;

  // Intf_TangentZone.ParamOnFirst (method)
  ParamOnFirst(paraMin?: number, paraMax?: number): { paraMin: number; paraMax: number };

  // Intf_TangentZone.ParamOnSecond (method)
  ParamOnSecond(paraMin?: number, paraMax?: number): { paraMin: number; paraMax: number };

  // Intf_TangentZone.InfoFirst (method)
  InfoFirst(segMin?: number, paraMin?: number, segMax?: number, paraMax?: number): { segMin: number; paraMin: number; segMax: number; paraMax: number };

  // Intf_TangentZone.InfoSecond (method)
  InfoSecond(segMin?: number, paraMin?: number, segMax?: number, paraMax?: number): { segMin: number; paraMin: number; segMax: number; paraMax: number };

  // Intf_TangentZone.HasCommonRange (method)
  HasCommonRange(Other: Intf_TangentZone): boolean;

  // Intf_TangentZone.Append (method)
  Append(Tzi: Intf_TangentZone): void;

  // Intf_TangentZone.Dump (method)
  Dump(Indent: number): void;

  // Intf_TangentZone.delete (method)
  delete(): void;

  // Intf_TangentZone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intf_Tool: declare class Intf_Tool

  // Intf_Tool.constructor (constructor)
  constructor();

  // Intf_Tool.Lin2dBox (method)
  Lin2dBox(theLin2d: gp_Lin2d, bounding: Bnd_Box2d, boxLin: Bnd_Box2d): void;

  // Intf_Tool.Hypr2dBox (method)
  Hypr2dBox(theHypr2d: gp_Hypr2d, bounding: Bnd_Box2d, boxHypr: Bnd_Box2d): void;

  // Intf_Tool.Parab2dBox (method)
  Parab2dBox(theParab2d: gp_Parab2d, bounding: Bnd_Box2d, boxHypr: Bnd_Box2d): void;

  // Intf_Tool.LinBox (method)
  LinBox(theLin: gp_Lin, bounding: Bnd_Box, boxLin: Bnd_Box): void;

  // Intf_Tool.HyprBox (method)
  HyprBox(theHypr: gp_Hypr, bounding: Bnd_Box, boxHypr: Bnd_Box): void;

  // Intf_Tool.ParabBox (method)
  ParabBox(theParab: gp_Parab, bounding: Bnd_Box, boxHypr: Bnd_Box): void;

  // Intf_Tool.NbSegments (method)
  NbSegments(): number;

  // Intf_Tool.BeginParam (method)
  BeginParam(SegmentNum: number): number;

  // Intf_Tool.EndParam (method)
  EndParam(SegmentNum: number): number;

  // Intf_Tool.delete (method)
  delete(): void;

  // Intf_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intf_Array1OfLin: NCollection_Array1_gp_Lin
