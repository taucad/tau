# libcascade — GccEnt

5 top-level symbols. Signatures are verbatim typescript.

GccEnt: declare class GccEnt

  constructor

  static PositionToString(thePosition: GccEnt_Position): string;

  static PositionFromString(thePositionString: string): GccEnt_Position;
  static PositionFromString(thePositionString: string, thePosition?: GccEnt_Position): { returnValue: boolean; thePosition: GccEnt_Position };
  static PositionFromString(thePositionString: string): GccEnt_Position;
  static PositionFromString(thePositionString: string, thePosition?: GccEnt_Position): { returnValue: boolean; thePosition: GccEnt_Position };

  static Unqualified(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Unqualified(Obj: gp_Circ2d): GccEnt_QualifiedCirc;
  static Unqualified(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Unqualified(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

  static Enclosing(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

  static Enclosed(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Enclosed(Obj: gp_Circ2d): GccEnt_QualifiedCirc;
  static Enclosed(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Enclosed(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

  static Outside(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Outside(Obj: gp_Circ2d): GccEnt_QualifiedCirc;
  static Outside(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Outside(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

  delete(): void;

  [Symbol.dispose](): void;

GccEnt_BadQualifier: declare class GccEnt_BadQualifier extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

GccEnt_Position: typeof GccEnt_Position[keyof typeof GccEnt_Position]

GccEnt_QualifiedCirc: declare class GccEnt_QualifiedCirc

  constructor

  Qualified(): gp_Circ2d;

  Qualifier(): GccEnt_Position;

  IsUnqualified(): boolean;

  IsEnclosing(): boolean;

  IsEnclosed(): boolean;

  IsOutside(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GccEnt_QualifiedLin: declare class GccEnt_QualifiedLin

  constructor

  Qualified(): gp_Lin2d;

  Qualifier(): GccEnt_Position;

  IsUnqualified(): boolean;

  IsEnclosed(): boolean;

  IsOutside(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
