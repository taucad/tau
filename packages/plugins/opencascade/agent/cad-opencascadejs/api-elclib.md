# libcascade — ElCLib

1 top-level symbols. Signatures are verbatim typescript.

ElCLib: declare class ElCLib

  // ElCLib.constructor (constructor)
  constructor();

  // ElCLib.InPeriod (method)
  static InPeriod(U: number, UFirst: number, ULast: number): number;

  // ElCLib.AdjustPeriodic (method)
  static AdjustPeriodic(UFirst: number, ULast: number, Precision: number, U1?: number, U2?: number): { U1: number; U2: number };

  // ElCLib.Value (method)
  static Value(U: number, L: gp_Lin): gp_Pnt;
  static Value(U: number, C: gp_Circ): gp_Pnt;
  static Value(U: number, E: gp_Elips): gp_Pnt;
  static Value(U: number, H: gp_Hypr): gp_Pnt;
  static Value(U: number, Prb: gp_Parab): gp_Pnt;
  static Value(U: number, L: gp_Lin2d): gp_Pnt2d;
  static Value(U: number, C: gp_Circ2d): gp_Pnt2d;
  static Value(U: number, E: gp_Elips2d): gp_Pnt2d;
  static Value(U: number, H: gp_Hypr2d): gp_Pnt2d;
  static Value(U: number, Prb: gp_Parab2d): gp_Pnt2d;

  // ElCLib.D1 (method)
  static D1(U: number, L: gp_Lin, P: gp_Pnt, V1: gp_Vec): void;
  static D1(U: number, C: gp_Circ, P: gp_Pnt, V1: gp_Vec): void;
  static D1(U: number, E: gp_Elips, P: gp_Pnt, V1: gp_Vec): void;
  static D1(U: number, H: gp_Hypr, P: gp_Pnt, V1: gp_Vec): void;
  static D1(U: number, Prb: gp_Parab, P: gp_Pnt, V1: gp_Vec): void;
  static D1(U: number, L: gp_Lin2d, P: gp_Pnt2d, V1: gp_Vec2d): void;
  static D1(U: number, C: gp_Circ2d, P: gp_Pnt2d, V1: gp_Vec2d): void;
  static D1(U: number, E: gp_Elips2d, P: gp_Pnt2d, V1: gp_Vec2d): void;
  static D1(U: number, H: gp_Hypr2d, P: gp_Pnt2d, V1: gp_Vec2d): void;
  static D1(U: number, Prb: gp_Parab2d, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // ElCLib.D2 (method)
  static D2(U: number, C: gp_Circ, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  static D2(U: number, E: gp_Elips, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  static D2(U: number, H: gp_Hypr, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  static D2(U: number, Prb: gp_Parab, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  static D2(U: number, C: gp_Circ2d, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
  static D2(U: number, E: gp_Elips2d, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
  static D2(U: number, H: gp_Hypr2d, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
  static D2(U: number, Prb: gp_Parab2d, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // ElCLib.D3 (method)
  static D3(U: number, C: gp_Circ, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
  static D3(U: number, E: gp_Elips, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
  static D3(U: number, H: gp_Hypr, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
  static D3(U: number, C: gp_Circ2d, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;
  static D3(U: number, E: gp_Elips2d, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;
  static D3(U: number, H: gp_Hypr2d, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // ElCLib.DN (method)
  static DN(U: number, L: gp_Lin, N: number): gp_Vec;
  static DN(U: number, C: gp_Circ, N: number): gp_Vec;
  static DN(U: number, E: gp_Elips, N: number): gp_Vec;
  static DN(U: number, H: gp_Hypr, N: number): gp_Vec;
  static DN(U: number, Prb: gp_Parab, N: number): gp_Vec;
  static DN(U: number, L: gp_Lin2d, N: number): gp_Vec2d;
  static DN(U: number, C: gp_Circ2d, N: number): gp_Vec2d;
  static DN(U: number, E: gp_Elips2d, N: number): gp_Vec2d;
  static DN(U: number, H: gp_Hypr2d, N: number): gp_Vec2d;
  static DN(U: number, Prb: gp_Parab2d, N: number): gp_Vec2d;

  // ElCLib.LineValue (method)
  static LineValue(U: number, Pos: gp_Ax1): gp_Pnt;
  static LineValue(U: number, Pos: gp_Ax2d): gp_Pnt2d;

  // ElCLib.CircleValue (method)
  static CircleValue(U: number, Pos: gp_Ax2, Radius: number): gp_Pnt;
  static CircleValue(U: number, Pos: gp_Ax22d, Radius: number): gp_Pnt2d;

  // ElCLib.EllipseValue (method)
  static EllipseValue(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number): gp_Pnt;
  static EllipseValue(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number): gp_Pnt2d;

  // ElCLib.HyperbolaValue (method)
  static HyperbolaValue(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number): gp_Pnt;
  static HyperbolaValue(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number): gp_Pnt2d;

  // ElCLib.ParabolaValue (method)
  static ParabolaValue(U: number, Pos: gp_Ax2, Focal: number): gp_Pnt;
  static ParabolaValue(U: number, Pos: gp_Ax22d, Focal: number): gp_Pnt2d;

  // ElCLib.LineD1 (method)
  static LineD1(U: number, Pos: gp_Ax1, P: gp_Pnt, V1: gp_Vec): void;
  static LineD1(U: number, Pos: gp_Ax2d, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // ElCLib.CircleD1 (method)
  static CircleD1(U: number, Pos: gp_Ax2, Radius: number, P: gp_Pnt, V1: gp_Vec): void;
  static CircleD1(U: number, Pos: gp_Ax22d, Radius: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // ElCLib.EllipseD1 (method)
  static EllipseD1(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, P: gp_Pnt, V1: gp_Vec): void;
  static EllipseD1(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // ElCLib.HyperbolaD1 (method)
  static HyperbolaD1(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, P: gp_Pnt, V1: gp_Vec): void;
  static HyperbolaD1(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // ElCLib.ParabolaD1 (method)
  static ParabolaD1(U: number, Pos: gp_Ax2, Focal: number, P: gp_Pnt, V1: gp_Vec): void;
  static ParabolaD1(U: number, Pos: gp_Ax22d, Focal: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // ElCLib.CircleD2 (method)
  static CircleD2(U: number, Pos: gp_Ax2, Radius: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  static CircleD2(U: number, Pos: gp_Ax22d, Radius: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // ElCLib.EllipseD2 (method)
  static EllipseD2(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  static EllipseD2(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // ElCLib.HyperbolaD2 (method)
  static HyperbolaD2(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  static HyperbolaD2(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // ElCLib.ParabolaD2 (method)
  static ParabolaD2(U: number, Pos: gp_Ax2, Focal: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  static ParabolaD2(U: number, Pos: gp_Ax22d, Focal: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // ElCLib.CircleD3 (method)
  static CircleD3(U: number, Pos: gp_Ax2, Radius: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
  static CircleD3(U: number, Pos: gp_Ax22d, Radius: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // ElCLib.EllipseD3 (method)
  static EllipseD3(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
  static EllipseD3(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // ElCLib.HyperbolaD3 (method)
  static HyperbolaD3(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
  static HyperbolaD3(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // ElCLib.LineDN (method)
  static LineDN(U: number, Pos: gp_Ax1, N: number): gp_Vec;
  static LineDN(U: number, Pos: gp_Ax2d, N: number): gp_Vec2d;

  // ElCLib.CircleDN (method)
  static CircleDN(U: number, Pos: gp_Ax2, Radius: number, N: number): gp_Vec;
  static CircleDN(U: number, Pos: gp_Ax22d, Radius: number, N: number): gp_Vec2d;

  // ElCLib.EllipseDN (method)
  static EllipseDN(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, N: number): gp_Vec;
  static EllipseDN(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, N: number): gp_Vec2d;

  // ElCLib.HyperbolaDN (method)
  static HyperbolaDN(U: number, Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, N: number): gp_Vec;
  static HyperbolaDN(U: number, Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, N: number): gp_Vec2d;

  // ElCLib.ParabolaDN (method)
  static ParabolaDN(U: number, Pos: gp_Ax2, Focal: number, N: number): gp_Vec;
  static ParabolaDN(U: number, Pos: gp_Ax22d, Focal: number, N: number): gp_Vec2d;

  // ElCLib.Parameter (method)
  static Parameter(L: gp_Lin, P: gp_Pnt): number;
  static Parameter(L: gp_Lin2d, P: gp_Pnt2d): number;
  static Parameter(C: gp_Circ, P: gp_Pnt): number;
  static Parameter(C: gp_Circ2d, P: gp_Pnt2d): number;
  static Parameter(E: gp_Elips, P: gp_Pnt): number;
  static Parameter(E: gp_Elips2d, P: gp_Pnt2d): number;
  static Parameter(H: gp_Hypr, P: gp_Pnt): number;
  static Parameter(H: gp_Hypr2d, P: gp_Pnt2d): number;
  static Parameter(Prb: gp_Parab, P: gp_Pnt): number;
  static Parameter(Prb: gp_Parab2d, P: gp_Pnt2d): number;

  // ElCLib.LineParameter (method)
  static LineParameter(Pos: gp_Ax1, P: gp_Pnt): number;
  static LineParameter(Pos: gp_Ax2d, P: gp_Pnt2d): number;

  // ElCLib.CircleParameter (method)
  static CircleParameter(Pos: gp_Ax2, P: gp_Pnt): number;
  static CircleParameter(Pos: gp_Ax22d, P: gp_Pnt2d): number;

  // ElCLib.EllipseParameter (method)
  static EllipseParameter(Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, P: gp_Pnt): number;
  static EllipseParameter(Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, P: gp_Pnt2d): number;

  // ElCLib.HyperbolaParameter (method)
  static HyperbolaParameter(Pos: gp_Ax2, MajorRadius: number, MinorRadius: number, P: gp_Pnt): number;
  static HyperbolaParameter(Pos: gp_Ax22d, MajorRadius: number, MinorRadius: number, P: gp_Pnt2d): number;

  // ElCLib.ParabolaParameter (method)
  static ParabolaParameter(Pos: gp_Ax2, P: gp_Pnt): number;
  static ParabolaParameter(Pos: gp_Ax22d, P: gp_Pnt2d): number;

  // ElCLib.To3d (method)
  static To3d(Pos: gp_Ax2, P: gp_Pnt2d): gp_Pnt;
  static To3d(Pos: gp_Ax2, V: gp_Vec2d): gp_Vec;
  static To3d(Pos: gp_Ax2, V: gp_Dir2d): gp_Dir;
  static To3d(Pos: gp_Ax2, A: gp_Ax2d): gp_Ax1;
  static To3d(Pos: gp_Ax2, A: gp_Ax22d): gp_Ax2;
  static To3d(Pos: gp_Ax2, L: gp_Lin2d): gp_Lin;
  static To3d(Pos: gp_Ax2, C: gp_Circ2d): gp_Circ;
  static To3d(Pos: gp_Ax2, E: gp_Elips2d): gp_Elips;
  static To3d(Pos: gp_Ax2, H: gp_Hypr2d): gp_Hypr;
  static To3d(Pos: gp_Ax2, Prb: gp_Parab2d): gp_Parab;

  // ElCLib.delete (method)
  delete(): void;

  // ElCLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
