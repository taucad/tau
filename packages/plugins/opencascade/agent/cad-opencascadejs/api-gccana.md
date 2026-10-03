# libcascade — GccAna

16 top-level symbols. Signatures are verbatim typescript.

GccAna_Circ2d2TanOn: declare class GccAna_Circ2d2TanOn

  // GccAna_Circ2d2TanOn.constructor (constructor)
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, OnLine: gp_Lin2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedLin, OnLine: gp_Lin2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: GccEnt_QualifiedLin, OnLine: gp_Lin2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Point2: gp_Pnt2d, OnLine: gp_Lin2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Point2: gp_Pnt2d, OnLine: gp_Lin2d, Tolerance: number);
  constructor(Point1: gp_Pnt2d, Point2: gp_Pnt2d, OnLine: gp_Lin2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, OnCirc: gp_Circ2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedLin, OnCirc: gp_Circ2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Point2: gp_Pnt2d, OnCirc: gp_Circ2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: GccEnt_QualifiedLin, OnCirc: gp_Circ2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Point2: gp_Pnt2d, OnCirc: gp_Circ2d, Tolerance: number);
  constructor(Point1: gp_Pnt2d, Point2: gp_Pnt2d, OnCirc: gp_Circ2d, Tolerance: number);

  // GccAna_Circ2d2TanOn.IsDone (method)
  IsDone(): boolean;

  // GccAna_Circ2d2TanOn.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Circ2d2TanOn.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // GccAna_Circ2d2TanOn.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // GccAna_Circ2d2TanOn.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2d2TanOn.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2d2TanOn.CenterOn3 (method)
  CenterOn3(Index: number, ParArg: number, PntArg: gp_Pnt2d): { ParArg: number };

  // GccAna_Circ2d2TanOn.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // GccAna_Circ2d2TanOn.IsTheSame2 (method)
  IsTheSame2(Index: number): boolean;

  // GccAna_Circ2d2TanOn.delete (method)
  delete(): void;

  // GccAna_Circ2d2TanOn.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Circ2d2TanRad: declare class GccAna_Circ2d2TanRad

  // GccAna_Circ2d2TanRad.constructor (constructor)
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedLin, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Point2: gp_Pnt2d, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Point2: gp_Pnt2d, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: GccEnt_QualifiedLin, Radius: number, Tolerance: number);
  constructor(Point1: gp_Pnt2d, Point2: gp_Pnt2d, Radius: number, Tolerance: number);

  // GccAna_Circ2d2TanRad.IsDone (method)
  IsDone(): boolean;

  // GccAna_Circ2d2TanRad.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Circ2d2TanRad.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // GccAna_Circ2d2TanRad.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // GccAna_Circ2d2TanRad.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2d2TanRad.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2d2TanRad.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // GccAna_Circ2d2TanRad.IsTheSame2 (method)
  IsTheSame2(Index: number): boolean;

  // GccAna_Circ2d2TanRad.delete (method)
  delete(): void;

  // GccAna_Circ2d2TanRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Circ2d3Tan: declare class GccAna_Circ2d3Tan

  // GccAna_Circ2d3Tan.constructor (constructor)
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, Qualified3: GccEnt_QualifiedCirc, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, Qualified3: GccEnt_QualifiedLin, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedLin, Qualified3: GccEnt_QualifiedLin, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: GccEnt_QualifiedLin, Qualified3: GccEnt_QualifiedLin, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, Point3: gp_Pnt2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedLin, Point3: gp_Pnt2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Qualified2: GccEnt_QualifiedLin, Point3: gp_Pnt2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Point2: gp_Pnt2d, Point3: gp_Pnt2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, Point2: gp_Pnt2d, Point3: gp_Pnt2d, Tolerance: number);
  constructor(Point1: gp_Pnt2d, Point2: gp_Pnt2d, Point3: gp_Pnt2d, Tolerance: number);

  // GccAna_Circ2d3Tan.IsDone (method)
  IsDone(): boolean;

  // GccAna_Circ2d3Tan.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Circ2d3Tan.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // GccAna_Circ2d3Tan.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

  // GccAna_Circ2d3Tan.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2d3Tan.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2d3Tan.Tangency3 (method)
  Tangency3(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2d3Tan.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // GccAna_Circ2d3Tan.IsTheSame2 (method)
  IsTheSame2(Index: number): boolean;

  // GccAna_Circ2d3Tan.IsTheSame3 (method)
  IsTheSame3(Index: number): boolean;

  // GccAna_Circ2d3Tan.delete (method)
  delete(): void;

  // GccAna_Circ2d3Tan.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Circ2dBisec: declare class GccAna_Circ2dBisec

  // GccAna_Circ2dBisec.constructor (constructor)
  constructor(Circ1: gp_Circ2d, Circ2: gp_Circ2d);

  // GccAna_Circ2dBisec.IsDone (method)
  IsDone(): boolean;

  // GccAna_Circ2dBisec.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Circ2dBisec.ThisSolution (method)
  ThisSolution(Index: number): GccInt_Bisec;

  // GccAna_Circ2dBisec.delete (method)
  delete(): void;

  // GccAna_Circ2dBisec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Circ2dTanCen: declare class GccAna_Circ2dTanCen

  // GccAna_Circ2dTanCen.constructor (constructor)
  constructor(Linetan: gp_Lin2d, Pcenter: gp_Pnt2d);
  constructor(Point1: gp_Pnt2d, Pcenter: gp_Pnt2d);
  constructor(Qualified1: GccEnt_QualifiedCirc, Pcenter: gp_Pnt2d, Tolerance: number);

  // GccAna_Circ2dTanCen.IsDone (method)
  IsDone(): boolean;

  // GccAna_Circ2dTanCen.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Circ2dTanCen.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // GccAna_Circ2dTanCen.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // GccAna_Circ2dTanCen.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2dTanCen.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // GccAna_Circ2dTanCen.delete (method)
  delete(): void;

  // GccAna_Circ2dTanCen.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Circ2dTanOnRad: declare class GccAna_Circ2dTanOnRad

  // GccAna_Circ2dTanOnRad.constructor (constructor)
  constructor(Qualified1: GccEnt_QualifiedCirc, OnLine: gp_Lin2d, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, OnLine: gp_Lin2d, Radius: number, Tolerance: number);
  constructor(Point1: gp_Pnt2d, OnLine: gp_Lin2d, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, OnCirc: gp_Circ2d, Radius: number, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedLin, OnCirc: gp_Circ2d, Radius: number, Tolerance: number);
  constructor(Point1: gp_Pnt2d, OnCirc: gp_Circ2d, Radius: number, Tolerance: number);

  // GccAna_Circ2dTanOnRad.IsDone (method)
  IsDone(): boolean;

  // GccAna_Circ2dTanOnRad.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Circ2dTanOnRad.ThisSolution (method)
  ThisSolution(Index: number): gp_Circ2d;

  // GccAna_Circ2dTanOnRad.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // GccAna_Circ2dTanOnRad.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Circ2dTanOnRad.CenterOn3 (method)
  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  // GccAna_Circ2dTanOnRad.IsTheSame1 (method)
  IsTheSame1(Index: number): boolean;

  // GccAna_Circ2dTanOnRad.delete (method)
  delete(): void;

  // GccAna_Circ2dTanOnRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_CircLin2dBisec: declare class GccAna_CircLin2dBisec

  // GccAna_CircLin2dBisec.constructor (constructor)
  constructor(Circle: gp_Circ2d, Line: gp_Lin2d);

  // GccAna_CircLin2dBisec.IsDone (method)
  IsDone(): boolean;

  // GccAna_CircLin2dBisec.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_CircLin2dBisec.ThisSolution (method)
  ThisSolution(Index: number): GccInt_Bisec;

  // GccAna_CircLin2dBisec.delete (method)
  delete(): void;

  // GccAna_CircLin2dBisec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_CircPnt2dBisec: declare class GccAna_CircPnt2dBisec

  // GccAna_CircPnt2dBisec.constructor (constructor)
  constructor(Circle1: gp_Circ2d, Point2: gp_Pnt2d);
  constructor(Circle1: gp_Circ2d, Point2: gp_Pnt2d, Tolerance: number);

  // GccAna_CircPnt2dBisec.IsDone (method)
  IsDone(): boolean;

  // GccAna_CircPnt2dBisec.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_CircPnt2dBisec.ThisSolution (method)
  ThisSolution(Index: number): GccInt_Bisec;

  // GccAna_CircPnt2dBisec.delete (method)
  delete(): void;

  // GccAna_CircPnt2dBisec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Lin2d2Tan: declare class GccAna_Lin2d2Tan

  // GccAna_Lin2d2Tan.constructor (constructor)
  constructor(ThePoint1: gp_Pnt2d, ThePoint2: gp_Pnt2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, ThePoint: gp_Pnt2d, Tolerance: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, Qualified2: GccEnt_QualifiedCirc, Tolerance: number);

  // GccAna_Lin2d2Tan.IsDone (method)
  IsDone(): boolean;

  // GccAna_Lin2d2Tan.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Lin2d2Tan.ThisSolution (method)
  ThisSolution(Index: number): gp_Lin2d;

  // GccAna_Lin2d2Tan.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  // GccAna_Lin2d2Tan.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2d2Tan.Tangency2 (method)
  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2d2Tan.delete (method)
  delete(): void;

  // GccAna_Lin2d2Tan.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Lin2dBisec: declare class GccAna_Lin2dBisec

  // GccAna_Lin2dBisec.constructor (constructor)
  constructor(Lin1: gp_Lin2d, Lin2: gp_Lin2d);

  // GccAna_Lin2dBisec.IsDone (method)
  IsDone(): boolean;

  // GccAna_Lin2dBisec.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Lin2dBisec.ThisSolution (method)
  ThisSolution(Index: number): gp_Lin2d;

  // GccAna_Lin2dBisec.Intersection1 (method)
  Intersection1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2dBisec.Intersection2 (method)
  Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2dBisec.delete (method)
  delete(): void;

  // GccAna_Lin2dBisec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Lin2dTanObl: declare class GccAna_Lin2dTanObl

  // GccAna_Lin2dTanObl.constructor (constructor)
  constructor(ThePoint: gp_Pnt2d, TheLine: gp_Lin2d, TheAngle: number);
  constructor(Qualified1: GccEnt_QualifiedCirc, TheLine: gp_Lin2d, TheAngle: number);

  // GccAna_Lin2dTanObl.IsDone (method)
  IsDone(): boolean;

  // GccAna_Lin2dTanObl.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Lin2dTanObl.ThisSolution (method)
  ThisSolution(Index: number): gp_Lin2d;

  // GccAna_Lin2dTanObl.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // GccAna_Lin2dTanObl.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2dTanObl.Intersection2 (method)
  Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2dTanObl.delete (method)
  delete(): void;

  // GccAna_Lin2dTanObl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Lin2dTanPar: declare class GccAna_Lin2dTanPar

  // GccAna_Lin2dTanPar.constructor (constructor)
  constructor(ThePoint: gp_Pnt2d, Lin1: gp_Lin2d);
  constructor(Qualified1: GccEnt_QualifiedCirc, Lin1: gp_Lin2d);

  // GccAna_Lin2dTanPar.IsDone (method)
  IsDone(): boolean;

  // GccAna_Lin2dTanPar.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Lin2dTanPar.ThisSolution (method)
  ThisSolution(Index: number): gp_Lin2d;

  // GccAna_Lin2dTanPar.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // GccAna_Lin2dTanPar.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, Pnt: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2dTanPar.delete (method)
  delete(): void;

  // GccAna_Lin2dTanPar.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Lin2dTanPer: declare class GccAna_Lin2dTanPer

  // GccAna_Lin2dTanPer.constructor (constructor)
  constructor(ThePnt: gp_Pnt2d, TheLin: gp_Lin2d);
  constructor(ThePnt: gp_Pnt2d, TheCircle: gp_Circ2d);
  constructor(Qualified1: GccEnt_QualifiedCirc, TheLin: gp_Lin2d);
  constructor(Qualified1: GccEnt_QualifiedCirc, TheCircle: gp_Circ2d);

  // GccAna_Lin2dTanPer.IsDone (method)
  IsDone(): boolean;

  // GccAna_Lin2dTanPer.NbSolutions (method)
  NbSolutions(): number;

  // GccAna_Lin2dTanPer.WhichQualifier (method)
  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  // GccAna_Lin2dTanPer.ThisSolution (method)
  ThisSolution(Index: number): gp_Lin2d;

  // GccAna_Lin2dTanPer.Tangency1 (method)
  Tangency1(Index: number, ParSol: number, ParArg: number, Pnt: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2dTanPer.Intersection2 (method)
  Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  // GccAna_Lin2dTanPer.delete (method)
  delete(): void;

  // GccAna_Lin2dTanPer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_LinPnt2dBisec: declare class GccAna_LinPnt2dBisec

  // GccAna_LinPnt2dBisec.constructor (constructor)
  constructor(Line1: gp_Lin2d, Point2: gp_Pnt2d);

  // GccAna_LinPnt2dBisec.IsDone (method)
  IsDone(): boolean;

  // GccAna_LinPnt2dBisec.ThisSolution (method)
  ThisSolution(): GccInt_Bisec;

  // GccAna_LinPnt2dBisec.delete (method)
  delete(): void;

  // GccAna_LinPnt2dBisec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_NoSolution: declare class GccAna_NoSolution extends Standard_Failure

  // GccAna_NoSolution.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // GccAna_NoSolution.ExceptionType (method)
  ExceptionType(): string;

  // GccAna_NoSolution.delete (method)
  delete(): void;

  // GccAna_NoSolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccAna_Pnt2dBisec: declare class GccAna_Pnt2dBisec

  // GccAna_Pnt2dBisec.constructor (constructor)
  constructor(Point1: gp_Pnt2d, Point2: gp_Pnt2d);

  // GccAna_Pnt2dBisec.IsDone (method)
  IsDone(): boolean;

  // GccAna_Pnt2dBisec.HasSolution (method)
  HasSolution(): boolean;

  // GccAna_Pnt2dBisec.ThisSolution (method)
  ThisSolution(): gp_Lin2d;

  // GccAna_Pnt2dBisec.delete (method)
  delete(): void;

  // GccAna_Pnt2dBisec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
