# libcascade — GccEnt

5 top-level symbols. Signatures are verbatim typescript.

GccEnt: declare class GccEnt

  // GccEnt.constructor (constructor)
  constructor();

  // GccEnt.PositionToString (method)
  static PositionToString(thePosition: GccEnt_Position): string;

  // GccEnt.PositionFromString (method)
  static PositionFromString(thePositionString: string): GccEnt_Position;
  static PositionFromString(thePositionString: string, thePosition?: GccEnt_Position): { returnValue: boolean; thePosition: GccEnt_Position };

  // GccEnt.Unqualified (method)
  static Unqualified(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Unqualified(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

  // GccEnt.Enclosing (method)
  static Enclosing(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

  // GccEnt.Enclosed (method)
  static Enclosed(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Enclosed(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

  // GccEnt.Outside (method)
  static Outside(Obj: gp_Lin2d): GccEnt_QualifiedLin;
  static Outside(Obj: gp_Circ2d): GccEnt_QualifiedCirc;

  // GccEnt.delete (method)
  delete(): void;

  // GccEnt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccEnt_BadQualifier: declare class GccEnt_BadQualifier extends Standard_DomainError

  // GccEnt_BadQualifier.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // GccEnt_BadQualifier.ExceptionType (method)
  ExceptionType(): string;

  // GccEnt_BadQualifier.delete (method)
  delete(): void;

  // GccEnt_BadQualifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccEnt_Position: typeof GccEnt_Position[keyof typeof GccEnt_Position]

  readonly GccEnt_unqualified: 'GccEnt_unqualified'

  readonly GccEnt_enclosing: 'GccEnt_enclosing'

  readonly GccEnt_enclosed: 'GccEnt_enclosed'

  readonly GccEnt_outside: 'GccEnt_outside'

  readonly GccEnt_noqualifier: 'GccEnt_noqualifier'

GccEnt_QualifiedCirc: declare class GccEnt_QualifiedCirc

  // GccEnt_QualifiedCirc.constructor (constructor)
  constructor(Qualified: gp_Circ2d, Qualifier: GccEnt_Position);

  // GccEnt_QualifiedCirc.Qualified (method)
  Qualified(): gp_Circ2d;

  // GccEnt_QualifiedCirc.Qualifier (method)
  Qualifier(): GccEnt_Position;

  // GccEnt_QualifiedCirc.IsUnqualified (method)
  IsUnqualified(): boolean;

  // GccEnt_QualifiedCirc.IsEnclosing (method)
  IsEnclosing(): boolean;

  // GccEnt_QualifiedCirc.IsEnclosed (method)
  IsEnclosed(): boolean;

  // GccEnt_QualifiedCirc.IsOutside (method)
  IsOutside(): boolean;

  // GccEnt_QualifiedCirc.delete (method)
  delete(): void;

  // GccEnt_QualifiedCirc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccEnt_QualifiedLin: declare class GccEnt_QualifiedLin

  // GccEnt_QualifiedLin.constructor (constructor)
  constructor(Qualified: gp_Lin2d, Qualifier: GccEnt_Position);

  // GccEnt_QualifiedLin.Qualified (method)
  Qualified(): gp_Lin2d;

  // GccEnt_QualifiedLin.Qualifier (method)
  Qualifier(): GccEnt_Position;

  // GccEnt_QualifiedLin.IsUnqualified (method)
  IsUnqualified(): boolean;

  // GccEnt_QualifiedLin.IsEnclosed (method)
  IsEnclosed(): boolean;

  // GccEnt_QualifiedLin.IsOutside (method)
  IsOutside(): boolean;

  // GccEnt_QualifiedLin.delete (method)
  delete(): void;

  // GccEnt_QualifiedLin.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
