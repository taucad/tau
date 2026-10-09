# libcascade — Geom2dGcc

28 top-level symbols. Signatures are verbatim typescript.

Geom2dGcc: declare class Geom2dGcc

  // Geom2dGcc.constructor (constructor)
  constructor();

  // Geom2dGcc.Unqualified (method)
  static Unqualified(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

  // Geom2dGcc.Enclosing (method)
  static Enclosing(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

  // Geom2dGcc.Enclosed (method)
  static Enclosed(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

  // Geom2dGcc.Outside (method)
  static Outside(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

  // Geom2dGcc.delete (method)
  delete(): void;

  // Geom2dGcc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanOn: declare class Geom2dGcc_Circ2d2TanOn

  // Geom2dGcc_Circ2d2TanOn.constructor (constructor)
  constructor(Point1: Geom2d_Point, Point2: Geom2d_Point, OnCurve: Geom2dAdaptor_Curve, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Point: Geom2d_Point, OnCurve: Geom2dAdaptor_Curve, Tolerance: number, Param1: number, ParamOn: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Qualified2: Geom2dGcc_QualifiedCurve, OnCurve: Geom2dAdaptor_Curve, Tolerance: number, Param1: number, Param2: number, ParamOn: number);

  // Geom2dGcc_Circ2d2TanOn.Results (method)
  Results(Circ: GccAna_Circ2d2TanOn): void;
  Results(Circ: Geom2dGcc_Circ2d2TanOnGeo): void;

  // Geom2dGcc_Circ2d2TanOn.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2d2TanOn.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2d2TanOn.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2d2TanOn.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // Geom2dGcc_Circ2d2TanOn.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanOn.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanOn.CenterOn3 (method)
  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  // Geom2dGcc_Circ2d2TanOn.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // Geom2dGcc_Circ2d2TanOn.IsTheSame2 (method)
  IsTheSame2(Index: number): boolean;

  // Geom2dGcc_Circ2d2TanOn.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2d2TanOn.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanOnGeo: declare class Geom2dGcc_Circ2d2TanOnGeo

  // Geom2dGcc_Circ2d2TanOnGeo.constructor (constructor)
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, OnCurv: Geom2dAdaptor_Curve, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedLin, OnCurv: Geom2dAdaptor_Curve, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Point2: gp_Pnt2d, OnCurv: Geom2dAdaptor_Curve, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: GccEnt_QualifiedLin, OnCurv: Geom2dAdaptor_Curve, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: gp_Pnt2d, OnCurv: Geom2dAdaptor_Curve, Tolerance: number);
  constructor(Point1: gp_Pnt2d, Point2: gp_Pnt2d, OnCurv: Geom2dAdaptor_Curve, Tolerance: number);

  // Geom2dGcc_Circ2d2TanOnGeo.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2d2TanOnGeo.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2d2TanOnGeo.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2d2TanOnGeo.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // Geom2dGcc_Circ2d2TanOnGeo.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanOnGeo.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanOnGeo.CenterOn3 (method)
  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  // Geom2dGcc_Circ2d2TanOnGeo.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // Geom2dGcc_Circ2d2TanOnGeo.IsTheSame2 (method)
  IsTheSame2(Index: number): boolean;

  // Geom2dGcc_Circ2d2TanOnGeo.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2d2TanOnGeo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanOnIter: declare class Geom2dGcc_Circ2d2TanOnIter

  // Geom2dGcc_Circ2d2TanOnIter.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QCurve, Point2: gp_Pnt2d, OnLine: gp_Lin2d, Param1: number, Param2: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Point2: gp_Pnt2d, OnCirc: gp_Circ2d, Param1: number, Param2: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Point2: gp_Pnt2d, OnCurve: Geom2dAdaptor_Curve, Param1: number, ParamOn: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: Geom2dGcc_QCurve, OnLine: gp_Lin2d, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: Geom2dGcc_QCurve, OnLine: gp_Lin2d, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Qualified2: Geom2dGcc_QCurve, OnLine: gp_Lin2d, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: Geom2dGcc_QCurve, OnCirc: gp_Circ2d, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: Geom2dGcc_QCurve, OnCirc: gp_Circ2d, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Qualified2: Geom2dGcc_QCurve, OnCirc: gp_Circ2d, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: Geom2dGcc_QCurve, OnCurv: Geom2dAdaptor_Curve, Param1: number, Param2: number, ParamOn: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: Geom2dGcc_QCurve, OnCurve: Geom2dAdaptor_Curve, Param1: number, Param2: number, ParamOn: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Qualified2: Geom2dGcc_QCurve, OnCurve: Geom2dAdaptor_Curve, Param1: number, Param2: number, ParamOn: number, Tolerance: number);

  // Geom2dGcc_Circ2d2TanOnIter.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2d2TanOnIter.ThisSolution (method)
  ThisSolution(): gp_Circ2d;

  // Geom2dGcc_Circ2d2TanOnIter.WhichQualifier (method)
  WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // Geom2dGcc_Circ2d2TanOnIter.Tangency1 (method)
  Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanOnIter.Tangency2 (method)
  Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanOnIter.CenterOn3 (method)
  CenterOn3(ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  // Geom2dGcc_Circ2d2TanOnIter.IsTheSame1 (method)
  IsTheSame1(): boolean;

  // Geom2dGcc_Circ2d2TanOnIter.IsTheSame2 (method)
  IsTheSame2(): boolean;

  // Geom2dGcc_Circ2d2TanOnIter.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2d2TanOnIter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanRad: declare class Geom2dGcc_Circ2d2TanRad

  // Geom2dGcc_Circ2d2TanRad.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Qualified2: Geom2dGcc_QualifiedCurve, Radius: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Point: Geom2d_Point, Radius: number, Tolerance: number);
  constructor(Point1: Geom2d_Point, Point2: Geom2d_Point, Radius: number, Tolerance: number);

  // Geom2dGcc_Circ2d2TanRad.Results (method)
  Results(Circ: GccAna_Circ2d2TanRad): void;
  Results(Circ: Geom2dGcc_Circ2d2TanRadGeo): void;

  // Geom2dGcc_Circ2d2TanRad.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2d2TanRad.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2d2TanRad.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2d2TanRad.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // Geom2dGcc_Circ2d2TanRad.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanRad.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanRad.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // Geom2dGcc_Circ2d2TanRad.IsTheSame2 (method)
  IsTheSame2(Index: number): boolean;

  // Geom2dGcc_Circ2d2TanRad.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2d2TanRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanRadGeo: declare class Geom2dGcc_Circ2d2TanRadGeo

  // Geom2dGcc_Circ2d2TanRadGeo.constructor (constructor)
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: Geom2dGcc_QCurve, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: Geom2dGcc_QCurve, Radius: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Qualified2: Geom2dGcc_QCurve, Radius: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Point2: gp_Pnt2d, Radius: number, Tolerance: number);

  // Geom2dGcc_Circ2d2TanRadGeo.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2d2TanRadGeo.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2d2TanRadGeo.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2d2TanRadGeo.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // Geom2dGcc_Circ2d2TanRadGeo.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanRadGeo.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d2TanRadGeo.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // Geom2dGcc_Circ2d2TanRadGeo.IsTheSame2 (method)
  IsTheSame2(Index: number): boolean;

  // Geom2dGcc_Circ2d2TanRadGeo.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2d2TanRadGeo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2d3Tan: declare class Geom2dGcc_Circ2d3Tan

  // Geom2dGcc_Circ2d3Tan.constructor (constructor)
  constructor(Point1: Geom2d_Point, Point2: Geom2d_Point, Point3: Geom2d_Point, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Point1: Geom2d_Point, Point2: Geom2d_Point, Tolerance: number, Param1: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Qualified2: Geom2dGcc_QualifiedCurve, Point: Geom2d_Point, Tolerance: number, Param1: number, Param2: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Qualified2: Geom2dGcc_QualifiedCurve, Qualified3: Geom2dGcc_QualifiedCurve, Tolerance: number, Param1: number, Param2: number, Param3: number);

  // Geom2dGcc_Circ2d3Tan.Results (method)
  Results(Circ: GccAna_Circ2d3Tan, Rank1: number, Rank2: number, Rank3: number): void;

  // Geom2dGcc_Circ2d3Tan.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2d3Tan.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2d3Tan.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2d3Tan.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

  // Geom2dGcc_Circ2d3Tan.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d3Tan.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d3Tan.Tangency3 (method)
  Tangency3(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d3Tan.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // Geom2dGcc_Circ2d3Tan.IsTheSame2 (method)
  IsTheSame2(Index: number): boolean;

  // Geom2dGcc_Circ2d3Tan.IsTheSame3 (method)
  IsTheSame3(Index: number): boolean;

  // Geom2dGcc_Circ2d3Tan.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2d3Tan.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2d3TanIter: declare class Geom2dGcc_Circ2d3TanIter

  // Geom2dGcc_Circ2d3TanIter.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QCurve, Point1: gp_Pnt2d, Point2: gp_Pnt2d, Param1: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: Geom2dGcc_QCurve, Point3: gp_Pnt2d, Param1: number, Param2: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: Geom2dGcc_QCurve, Point3: gp_Pnt2d, Param1: number, Param2: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Qualified2: Geom2dGcc_QCurve, Point2: gp_Pnt2d, Param1: number, Param2: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, Qualified3: Geom2dGcc_QCurve, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: Geom2dGcc_QCurve, Qualified3: Geom2dGcc_QCurve, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedLin, Qualified3: Geom2dGcc_QCurve, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: GccEnt_QualifiedLin, Qualified3: Geom2dGcc_QCurve, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: Geom2dGcc_QCurve, Qualified3: Geom2dGcc_QCurve, Param1: number, Param2: number, Param3: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Qualified2: Geom2dGcc_QCurve, Qualified3: Geom2dGcc_QCurve, Param1: number, Param2: number, Param3: number, Tolerance: number);

  // Geom2dGcc_Circ2d3TanIter.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2d3TanIter.ThisSolution (method)
  ThisSolution(): gp_Circ2d;

  // Geom2dGcc_Circ2d3TanIter.WhichQualifier (method)
  WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

  // Geom2dGcc_Circ2d3TanIter.Tangency1 (method)
  Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d3TanIter.Tangency2 (method)
  Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d3TanIter.Tangency3 (method)
  Tangency3(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2d3TanIter.IsTheSame1 (method)
  IsTheSame1(): boolean;

  // Geom2dGcc_Circ2d3TanIter.IsTheSame2 (method)
  IsTheSame2(): boolean;

  // Geom2dGcc_Circ2d3TanIter.IsTheSame3 (method)
  IsTheSame3(): boolean;

  // Geom2dGcc_Circ2d3TanIter.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2d3TanIter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2dTanCen: declare class Geom2dGcc_Circ2dTanCen

  // Geom2dGcc_Circ2dTanCen.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Pcenter: Geom2d_Point, Tolerance: number);

  // Geom2dGcc_Circ2dTanCen.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2dTanCen.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2dTanCen.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2dTanCen.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // Geom2dGcc_Circ2dTanCen.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2dTanCen.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // Geom2dGcc_Circ2dTanCen.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2dTanCen.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2dTanCenGeo: declare class Geom2dGcc_Circ2dTanCenGeo

  // Geom2dGcc_Circ2dTanCenGeo.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QCurve, Pcenter: gp_Pnt2d, Tolerance: number);

  // Geom2dGcc_Circ2dTanCenGeo.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2dTanCenGeo.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2dTanCenGeo.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2dTanCenGeo.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // Geom2dGcc_Circ2dTanCenGeo.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2dTanCenGeo.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2dTanCenGeo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2dTanOnRad: declare class Geom2dGcc_Circ2dTanOnRad

  // Geom2dGcc_Circ2dTanOnRad.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, OnCurv: Geom2dAdaptor_Curve, Radius: number, Tolerance: number);
  constructor(Point1: Geom2d_Point, OnCurv: Geom2dAdaptor_Curve, Radius: number, Tolerance: number);

  // Geom2dGcc_Circ2dTanOnRad.Results (method)
  Results(Circ: GccAna_Circ2dTanOnRad): void;
  Results(Circ: Geom2dGcc_Circ2dTanOnRadGeo): void;

  // Geom2dGcc_Circ2dTanOnRad.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2dTanOnRad.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2dTanOnRad.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2dTanOnRad.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // Geom2dGcc_Circ2dTanOnRad.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2dTanOnRad.CenterOn3 (method)
  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  // Geom2dGcc_Circ2dTanOnRad.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // Geom2dGcc_Circ2dTanOnRad.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2dTanOnRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Circ2dTanOnRadGeo: declare class Geom2dGcc_Circ2dTanOnRadGeo

  // Geom2dGcc_Circ2dTanOnRadGeo.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QCurve, OnLine: gp_Lin2d, Radius: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, OnCirc: gp_Circ2d, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, OnCurv: Geom2dAdaptor_Curve, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, OnCurv: Geom2dAdaptor_Curve, Radius: number, Tolerance: number);
  constructor(Qualified1: Geom2dGcc_QCurve, OnCurv: Geom2dAdaptor_Curve, Radius: number, Tolerance: number);
  constructor(Point1: gp_Pnt2d, OnCurv: Geom2dAdaptor_Curve, Radius: number, Tolerance: number);

  // Geom2dGcc_Circ2dTanOnRadGeo.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Circ2dTanOnRadGeo.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Circ2dTanOnRadGeo.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // Geom2dGcc_Circ2dTanOnRadGeo.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // Geom2dGcc_Circ2dTanOnRadGeo.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Circ2dTanOnRadGeo.CenterOn3 (method)
  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  // Geom2dGcc_Circ2dTanOnRadGeo.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // Geom2dGcc_Circ2dTanOnRadGeo.delete (method)
  delete(): void;

  // Geom2dGcc_Circ2dTanOnRadGeo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_CurveTool: declare class Geom2dGcc_CurveTool

  // Geom2dGcc_CurveTool.constructor (constructor)
  constructor();

  // Geom2dGcc_CurveTool.FirstParameter (method)
  static FirstParameter(C: Geom2dAdaptor_Curve): number;

  // Geom2dGcc_CurveTool.LastParameter (method)
  static LastParameter(C: Geom2dAdaptor_Curve): number;

  // Geom2dGcc_CurveTool.EpsX (method)
  static EpsX(C: Geom2dAdaptor_Curve, Tol: number): number;

  // Geom2dGcc_CurveTool.NbSamples (method)
  static NbSamples(C: Geom2dAdaptor_Curve): number;

  // Geom2dGcc_CurveTool.Value (method)
  static Value(C: Geom2dAdaptor_Curve, X: number): gp_Pnt2d;

  // Geom2dGcc_CurveTool.D1 (method)
  static D1(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

  // Geom2dGcc_CurveTool.D2 (method)
  static D2(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

  // Geom2dGcc_CurveTool.D3 (method)
  static D3(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d, dN: gp_Vec2d): void;

  // Geom2dGcc_CurveTool.delete (method)
  delete(): void;

  // Geom2dGcc_CurveTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanCirCu: declare class Geom2dGcc_FunctionTanCirCu extends math_FunctionWithDerivative

  // Geom2dGcc_FunctionTanCirCu.constructor (constructor)
  constructor(Circ: gp_Circ2d, Curv: Geom2dAdaptor_Curve);

  // Geom2dGcc_FunctionTanCirCu.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // Geom2dGcc_FunctionTanCirCu.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // Geom2dGcc_FunctionTanCirCu.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // Geom2dGcc_FunctionTanCirCu.delete (method)
  delete(): void;

  // Geom2dGcc_FunctionTanCirCu.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanCuCu: declare class Geom2dGcc_FunctionTanCuCu extends math_FunctionSetWithDerivatives

  // Geom2dGcc_FunctionTanCuCu.constructor (constructor)
  constructor(Curv1: Geom2dAdaptor_Curve, Curv2: Geom2dAdaptor_Curve);
  constructor(Circ1: gp_Circ2d, Curv2: Geom2dAdaptor_Curve);

  // Geom2dGcc_FunctionTanCuCu.InitDerivative (method)
  InitDerivative(X: math_VectorBase_double, Point1: gp_Pnt2d, Point2: gp_Pnt2d, Tan1: gp_Vec2d, Tan2: gp_Vec2d, D21: gp_Vec2d, D22: gp_Vec2d): void;

  // Geom2dGcc_FunctionTanCuCu.NbVariables (method)
  NbVariables(): number;

  // Geom2dGcc_FunctionTanCuCu.NbEquations (method)
  NbEquations(): number;

  // Geom2dGcc_FunctionTanCuCu.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Geom2dGcc_FunctionTanCuCu.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Geom2dGcc_FunctionTanCuCu.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Geom2dGcc_FunctionTanCuCu.delete (method)
  delete(): void;

  // Geom2dGcc_FunctionTanCuCu.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanCuCuOnCu: declare class Geom2dGcc_FunctionTanCuCuOnCu extends math_FunctionSetWithDerivatives

  // Geom2dGcc_FunctionTanCuCuOnCu.constructor (constructor)
  constructor(C1: Geom2dAdaptor_Curve, C2: Geom2dAdaptor_Curve, OnCi: gp_Circ2d, Rad: number);
  constructor(C1: gp_Circ2d, C2: Geom2dAdaptor_Curve, OnCi: gp_Circ2d, Rad: number);
  constructor(L1: gp_Lin2d, C2: Geom2dAdaptor_Curve, OnCi: gp_Circ2d, Rad: number);
  constructor(C1: Geom2dAdaptor_Curve, P2: gp_Pnt2d, OnCi: gp_Circ2d, Rad: number);
  constructor(C1: Geom2dAdaptor_Curve, C2: Geom2dAdaptor_Curve, OnLi: gp_Lin2d, Rad: number);
  constructor(C1: gp_Circ2d, C2: Geom2dAdaptor_Curve, OnLi: gp_Lin2d, Rad: number);
  constructor(L1: gp_Lin2d, C2: Geom2dAdaptor_Curve, OnLi: gp_Lin2d, Rad: number);
  constructor(C1: Geom2dAdaptor_Curve, P2: gp_Pnt2d, OnLi: gp_Lin2d, Rad: number);
  constructor(C1: Geom2dAdaptor_Curve, C2: Geom2dAdaptor_Curve, OnCu: Geom2dAdaptor_Curve, Rad: number);
  constructor(C1: gp_Circ2d, C2: Geom2dAdaptor_Curve, OnCu: Geom2dAdaptor_Curve, Rad: number);
  constructor(L1: gp_Lin2d, C2: Geom2dAdaptor_Curve, OnCu: Geom2dAdaptor_Curve, Rad: number);
  constructor(C1: Geom2dAdaptor_Curve, P1: gp_Pnt2d, OnCu: Geom2dAdaptor_Curve, Rad: number);

  // Geom2dGcc_FunctionTanCuCuOnCu.InitDerivative (method)
  InitDerivative(X: math_VectorBase_double, Point1: gp_Pnt2d, Point2: gp_Pnt2d, Point3: gp_Pnt2d, Tan1: gp_Vec2d, Tan2: gp_Vec2d, Tan3: gp_Vec2d, D21: gp_Vec2d, D22: gp_Vec2d, D23: gp_Vec2d): void;

  // Geom2dGcc_FunctionTanCuCuOnCu.NbVariables (method)
  NbVariables(): number;

  // Geom2dGcc_FunctionTanCuCuOnCu.NbEquations (method)
  NbEquations(): number;

  // Geom2dGcc_FunctionTanCuCuOnCu.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Geom2dGcc_FunctionTanCuCuOnCu.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Geom2dGcc_FunctionTanCuCuOnCu.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Geom2dGcc_FunctionTanCuCuOnCu.delete (method)
  delete(): void;

  // Geom2dGcc_FunctionTanCuCuOnCu.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanCuPnt: declare class Geom2dGcc_FunctionTanCuPnt extends math_FunctionWithDerivative

  // Geom2dGcc_FunctionTanCuPnt.constructor (constructor)
  constructor(C: Geom2dAdaptor_Curve, Point: gp_Pnt2d);

  // Geom2dGcc_FunctionTanCuPnt.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // Geom2dGcc_FunctionTanCuPnt.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // Geom2dGcc_FunctionTanCuPnt.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // Geom2dGcc_FunctionTanCuPnt.delete (method)
  delete(): void;

  // Geom2dGcc_FunctionTanCuPnt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanObl: declare class Geom2dGcc_FunctionTanObl extends math_FunctionWithDerivative

  // Geom2dGcc_FunctionTanObl.constructor (constructor)
  constructor(Curve: Geom2dAdaptor_Curve, Dir: gp_Dir2d);

  // Geom2dGcc_FunctionTanObl.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // Geom2dGcc_FunctionTanObl.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // Geom2dGcc_FunctionTanObl.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // Geom2dGcc_FunctionTanObl.delete (method)
  delete(): void;

  // Geom2dGcc_FunctionTanObl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_IsParallel: declare class Geom2dGcc_IsParallel extends Standard_DomainError

  // Geom2dGcc_IsParallel.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Geom2dGcc_IsParallel.ExceptionType (method)
  ExceptionType(): string;

  // Geom2dGcc_IsParallel.delete (method)
  delete(): void;

  // Geom2dGcc_IsParallel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Lin2d2Tan: declare class Geom2dGcc_Lin2d2Tan

  // Geom2dGcc_Lin2d2Tan.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Qualified2: Geom2dGcc_QualifiedCurve, Tolang: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, ThePoint: gp_Pnt2d, Tolang: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, ThePoint: gp_Pnt2d, Tolang: number, Param1: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, Qualified2: Geom2dGcc_QualifiedCurve, Tolang: number, Param1: number, Param2: number);

  // Geom2dGcc_Lin2d2Tan.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Lin2d2Tan.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Lin2d2Tan.ThisSolution (method)
  ThisSolution(Index: number): gp_Lin2d;

  // Geom2dGcc_Lin2d2Tan.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // Geom2dGcc_Lin2d2Tan.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Lin2d2Tan.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Lin2d2Tan.delete (method)
  delete(): void;

  // Geom2dGcc_Lin2d2Tan.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Lin2d2TanIter: declare class Geom2dGcc_Lin2d2TanIter

  // Geom2dGcc_Lin2d2TanIter.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QCurve, ThePoint: gp_Pnt2d, Param1: number, Tolang: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: Geom2dGcc_QCurve, Param2: number, Tolang: number);
  constructor(Qualified1: Geom2dGcc_QCurve, Qualified2: Geom2dGcc_QCurve, Param1: number, Param2: number, Tolang: number);

  // Geom2dGcc_Lin2d2TanIter.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Lin2d2TanIter.ThisSolution (method)
  ThisSolution(): gp_Lin2d;

  // Geom2dGcc_Lin2d2TanIter.WhichQualifier (method)
  WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // Geom2dGcc_Lin2d2TanIter.Tangency1 (method)
  Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Lin2d2TanIter.Tangency2 (method)
  Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Lin2d2TanIter.delete (method)
  delete(): void;

  // Geom2dGcc_Lin2d2TanIter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Lin2dTanObl: declare class Geom2dGcc_Lin2dTanObl

  // Geom2dGcc_Lin2dTanObl.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, TheLin: gp_Lin2d, TolAng: number, Angle: number);
  constructor(Qualified1: Geom2dGcc_QualifiedCurve, TheLin: gp_Lin2d, TolAng: number, Param1: number, Angle: number);

  // Geom2dGcc_Lin2dTanObl.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Lin2dTanObl.NbSolutions (method)
  NbSolutions(): number;

  // Geom2dGcc_Lin2dTanObl.ThisSolution (method)
  ThisSolution(Index: number): gp_Lin2d;

  // Geom2dGcc_Lin2dTanObl.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // Geom2dGcc_Lin2dTanObl.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Lin2dTanObl.Intersection2 (method)
  Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Lin2dTanObl.delete (method)
  delete(): void;

  // Geom2dGcc_Lin2dTanObl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Lin2dTanOblIter: declare class Geom2dGcc_Lin2dTanOblIter

  // Geom2dGcc_Lin2dTanOblIter.constructor (constructor)
  constructor(Qualified1: Geom2dGcc_QCurve, TheLin: gp_Lin2d, Param1: number, TolAng: number, Angle?: number);

  // Geom2dGcc_Lin2dTanOblIter.IsDone (method)
  IsDone(): boolean;

  // Geom2dGcc_Lin2dTanOblIter.ThisSolution (method)
  ThisSolution(): gp_Lin2d;

  // Geom2dGcc_Lin2dTanOblIter.WhichQualifier (method)
  WhichQualifier(Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // Geom2dGcc_Lin2dTanOblIter.Tangency1 (method)
  Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Lin2dTanOblIter.Intersection2 (method)
  Intersection2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // Geom2dGcc_Lin2dTanOblIter.IsParallel2 (method)
  IsParallel2(): boolean;

  // Geom2dGcc_Lin2dTanOblIter.delete (method)
  delete(): void;

  // Geom2dGcc_Lin2dTanOblIter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_QCurve: declare class Geom2dGcc_QCurve

  // Geom2dGcc_QCurve.constructor (constructor)
  constructor(Curve: Geom2dAdaptor_Curve, Qualifier: GccEnt_Position);

  // Geom2dGcc_QCurve.Qualified (method)
  Qualified(): Geom2dAdaptor_Curve;

  // Geom2dGcc_QCurve.Qualifier (method)
  Qualifier(): GccEnt_Position;

  // Geom2dGcc_QCurve.IsUnqualified (method)
  IsUnqualified(): boolean;

  // Geom2dGcc_QCurve.IsEnclosing (method)
  IsEnclosing(): boolean;

  // Geom2dGcc_QCurve.IsEnclosed (method)
  IsEnclosed(): boolean;

  // Geom2dGcc_QCurve.IsOutside (method)
  IsOutside(): boolean;

  // Geom2dGcc_QCurve.delete (method)
  delete(): void;

  // Geom2dGcc_QCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_QualifiedCurve: declare class Geom2dGcc_QualifiedCurve

  // Geom2dGcc_QualifiedCurve.constructor (constructor)
  constructor(Curve: Geom2dAdaptor_Curve, Qualifier: GccEnt_Position);

  // Geom2dGcc_QualifiedCurve.Qualified (method)
  Qualified(): Geom2dAdaptor_Curve;

  // Geom2dGcc_QualifiedCurve.Qualifier (method)
  Qualifier(): GccEnt_Position;

  // Geom2dGcc_QualifiedCurve.IsUnqualified (method)
  IsUnqualified(): boolean;

  // Geom2dGcc_QualifiedCurve.IsEnclosing (method)
  IsEnclosing(): boolean;

  // Geom2dGcc_QualifiedCurve.IsEnclosed (method)
  IsEnclosed(): boolean;

  // Geom2dGcc_QualifiedCurve.IsOutside (method)
  IsOutside(): boolean;

  // Geom2dGcc_QualifiedCurve.delete (method)
  delete(): void;

  // Geom2dGcc_QualifiedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dGcc_Type1: typeof Geom2dGcc_Type1[keyof typeof Geom2dGcc_Type1]

  readonly Geom2dGcc_CuCuCu: 'Geom2dGcc_CuCuCu'

  readonly Geom2dGcc_CiCuCu: 'Geom2dGcc_CiCuCu'

  readonly Geom2dGcc_CiCiCu: 'Geom2dGcc_CiCiCu'

  readonly Geom2dGcc_CiLiCu: 'Geom2dGcc_CiLiCu'

  readonly Geom2dGcc_LiLiCu: 'Geom2dGcc_LiLiCu'

  readonly Geom2dGcc_LiCuCu: 'Geom2dGcc_LiCuCu'

Geom2dGcc_Type2: typeof Geom2dGcc_Type2[keyof typeof Geom2dGcc_Type2]

  readonly Geom2dGcc_CuCuOnCu: 'Geom2dGcc_CuCuOnCu'

  readonly Geom2dGcc_CiCuOnCu: 'Geom2dGcc_CiCuOnCu'

  readonly Geom2dGcc_LiCuOnCu: 'Geom2dGcc_LiCuOnCu'

  readonly Geom2dGcc_CuPtOnCu: 'Geom2dGcc_CuPtOnCu'

  readonly Geom2dGcc_CuCuOnLi: 'Geom2dGcc_CuCuOnLi'

  readonly Geom2dGcc_CiCuOnLi: 'Geom2dGcc_CiCuOnLi'

  readonly Geom2dGcc_LiCuOnLi: 'Geom2dGcc_LiCuOnLi'

  readonly Geom2dGcc_CuPtOnLi: 'Geom2dGcc_CuPtOnLi'

  readonly Geom2dGcc_CuCuOnCi: 'Geom2dGcc_CuCuOnCi'

  readonly Geom2dGcc_CiCuOnCi: 'Geom2dGcc_CiCuOnCi'

  readonly Geom2dGcc_LiCuOnCi: 'Geom2dGcc_LiCuOnCi'

  readonly Geom2dGcc_CuPtOnCi: 'Geom2dGcc_CuPtOnCi'

Geom2dGcc_Type3: typeof Geom2dGcc_Type3[keyof typeof Geom2dGcc_Type3]

  readonly Geom2dGcc_CuCu: 'Geom2dGcc_CuCu'

  readonly Geom2dGcc_CiCu: 'Geom2dGcc_CiCu'
