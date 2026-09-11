# libcascade — GccAna

16 top-level symbols. Signatures are verbatim typescript.

GccAna_Circ2d2TanOn: declare class GccAna_Circ2d2TanOn

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Circ2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

CenterOn3(Index: number, ParArg: number, PntArg: gp_Pnt2d): { ParArg: number };

IsTheSame1(Index: number): boolean;

IsTheSame2(Index: number): boolean;

delete(): void;

[Symbol.dispose](): void;

GccAna_Circ2d2TanRad: declare class GccAna_Circ2d2TanRad

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Circ2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

IsTheSame1(Index: number): boolean;

IsTheSame2(Index: number): boolean;

delete(): void;

[Symbol.dispose](): void;

GccAna_Circ2d3Tan: declare class GccAna_Circ2d3Tan

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Circ2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

Tangency3(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

IsTheSame1(Index: number): boolean;

IsTheSame2(Index: number): boolean;

IsTheSame3(Index: number): boolean;

delete(): void;

[Symbol.dispose](): void;

GccAna_Circ2dBisec: declare class GccAna_Circ2dBisec

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): GccInt_Bisec;

delete(): void;

[Symbol.dispose](): void;

GccAna_Circ2dTanCen: declare class GccAna_Circ2dTanCen

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Circ2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

IsTheSame1(Index: number): boolean;

delete(): void;

[Symbol.dispose](): void;

GccAna_Circ2dTanOnRad: declare class GccAna_Circ2dTanOnRad

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Circ2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

IsTheSame1(Index: number): boolean;

delete(): void;

[Symbol.dispose](): void;

GccAna_CircLin2dBisec: declare class GccAna_CircLin2dBisec

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): GccInt_Bisec;

delete(): void;

[Symbol.dispose](): void;

GccAna_CircPnt2dBisec: declare class GccAna_CircPnt2dBisec

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): GccInt_Bisec;

delete(): void;

[Symbol.dispose](): void;

GccAna_Lin2d2Tan: declare class GccAna_Lin2d2Tan

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Lin2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

delete(): void;

[Symbol.dispose](): void;

GccAna_Lin2dBisec: declare class GccAna_Lin2dBisec

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Lin2d;

Intersection1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

delete(): void;

[Symbol.dispose](): void;

GccAna_Lin2dTanObl: declare class GccAna_Lin2dTanObl

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Lin2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

delete(): void;

[Symbol.dispose](): void;

GccAna_Lin2dTanPar: declare class GccAna_Lin2dTanPar

constructor

IsDone(): boolean;

NbSolutions(): number;

ThisSolution(Index: number): gp_Lin2d;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

Tangency1(Index: number, ParSol: number, ParArg: number, Pnt: gp_Pnt2d): { ParSol: number; ParArg: number };

delete(): void;

[Symbol.dispose](): void;

GccAna_Lin2dTanPer: declare class GccAna_Lin2dTanPer

constructor

IsDone(): boolean;

NbSolutions(): number;

WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

ThisSolution(Index: number): gp_Lin2d;

Tangency1(Index: number, ParSol: number, ParArg: number, Pnt: gp_Pnt2d): { ParSol: number; ParArg: number };

Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

delete(): void;

[Symbol.dispose](): void;

GccAna_LinPnt2dBisec: declare class GccAna_LinPnt2dBisec

constructor

IsDone(): boolean;

ThisSolution(): GccInt_Bisec;

delete(): void;

[Symbol.dispose](): void;

GccAna_NoSolution: declare class GccAna_NoSolution extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

GccAna_Pnt2dBisec: declare class GccAna_Pnt2dBisec

constructor

IsDone(): boolean;

HasSolution(): boolean;

ThisSolution(): gp_Lin2d;

delete(): void;

[Symbol.dispose](): void;
