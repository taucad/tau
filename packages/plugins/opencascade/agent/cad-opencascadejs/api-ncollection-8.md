# libcascade — NCollection (8)

14 top-level symbols. Signatures are verbatim typescript.

NCollection_Array1_gp_Vec2d: declare class NCollection_Array1_gp_Vec2d

  // NCollection_Array1_gp_Vec2d.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_gp_Vec2d);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: gp_Vec2d, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: gp_Vec2d, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_gp_Vec2d.Init (method)
  Init(theValue: gp_Vec2d): void;

  // NCollection_Array1_gp_Vec2d.Size (method)
  Size(): number;

  // NCollection_Array1_gp_Vec2d.Length (method)
  Length(): number;

  // NCollection_Array1_gp_Vec2d.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_gp_Vec2d.Lower (method)
  Lower(): number;

  // NCollection_Array1_gp_Vec2d.Upper (method)
  Upper(): number;

  // NCollection_Array1_gp_Vec2d.Assign (method)
  Assign(theOther: NCollection_Array1_gp_Vec2d): NCollection_Array1_gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_gp_Vec2d): NCollection_Array1_gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.Move (method)
  Move(theOther: NCollection_Array1_gp_Vec2d): NCollection_Array1_gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.First (method)
  First(): gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.ChangeFirst (method)
  ChangeFirst(): gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.Last (method)
  Last(): gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.ChangeLast (method)
  ChangeLast(): gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.Value (method)
  Value(theIndex: number): gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.ChangeValue (method)
  ChangeValue(theIndex: number): gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.At (method)
  At(theIndex: number): gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.ChangeAt (method)
  ChangeAt(theIndex: number): gp_Vec2d;

  // NCollection_Array1_gp_Vec2d.SetValue (method)
  SetValue(theIndex: number, theItem: gp_Vec2d): void;

  // NCollection_Array1_gp_Vec2d.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_gp_Vec2d.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_gp_Vec2d.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_gp_Vec2d.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_gp_Vec2d.delete (method)
  delete(): void;

  // NCollection_Array1_gp_Vec2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_gp_XY: declare class NCollection_Array1_gp_XY

  // NCollection_Array1_gp_XY.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_gp_XY);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: gp_XY, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: gp_XY, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_gp_XY.Init (method)
  Init(theValue: gp_XY): void;

  // NCollection_Array1_gp_XY.Size (method)
  Size(): number;

  // NCollection_Array1_gp_XY.Length (method)
  Length(): number;

  // NCollection_Array1_gp_XY.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_gp_XY.Lower (method)
  Lower(): number;

  // NCollection_Array1_gp_XY.Upper (method)
  Upper(): number;

  // NCollection_Array1_gp_XY.Assign (method)
  Assign(theOther: NCollection_Array1_gp_XY): NCollection_Array1_gp_XY;

  // NCollection_Array1_gp_XY.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_gp_XY): NCollection_Array1_gp_XY;

  // NCollection_Array1_gp_XY.Move (method)
  Move(theOther: NCollection_Array1_gp_XY): NCollection_Array1_gp_XY;

  // NCollection_Array1_gp_XY.First (method)
  First(): gp_XY;

  // NCollection_Array1_gp_XY.ChangeFirst (method)
  ChangeFirst(): gp_XY;

  // NCollection_Array1_gp_XY.Last (method)
  Last(): gp_XY;

  // NCollection_Array1_gp_XY.ChangeLast (method)
  ChangeLast(): gp_XY;

  // NCollection_Array1_gp_XY.Value (method)
  Value(theIndex: number): gp_XY;

  // NCollection_Array1_gp_XY.ChangeValue (method)
  ChangeValue(theIndex: number): gp_XY;

  // NCollection_Array1_gp_XY.At (method)
  At(theIndex: number): gp_XY;

  // NCollection_Array1_gp_XY.ChangeAt (method)
  ChangeAt(theIndex: number): gp_XY;

  // NCollection_Array1_gp_XY.SetValue (method)
  SetValue(theIndex: number, theItem: gp_XY): void;

  // NCollection_Array1_gp_XY.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_gp_XY.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_gp_XY.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_gp_XY.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_gp_XY.delete (method)
  delete(): void;

  // NCollection_Array1_gp_XY.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_gp_XYZ: declare class NCollection_Array1_gp_XYZ

  // NCollection_Array1_gp_XYZ.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_gp_XYZ);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: gp_XYZ, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: gp_XYZ, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_gp_XYZ.Init (method)
  Init(theValue: gp_XYZ): void;

  // NCollection_Array1_gp_XYZ.Size (method)
  Size(): number;

  // NCollection_Array1_gp_XYZ.Length (method)
  Length(): number;

  // NCollection_Array1_gp_XYZ.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_gp_XYZ.Lower (method)
  Lower(): number;

  // NCollection_Array1_gp_XYZ.Upper (method)
  Upper(): number;

  // NCollection_Array1_gp_XYZ.Assign (method)
  Assign(theOther: NCollection_Array1_gp_XYZ): NCollection_Array1_gp_XYZ;

  // NCollection_Array1_gp_XYZ.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_gp_XYZ): NCollection_Array1_gp_XYZ;

  // NCollection_Array1_gp_XYZ.Move (method)
  Move(theOther: NCollection_Array1_gp_XYZ): NCollection_Array1_gp_XYZ;

  // NCollection_Array1_gp_XYZ.First (method)
  First(): gp_XYZ;

  // NCollection_Array1_gp_XYZ.ChangeFirst (method)
  ChangeFirst(): gp_XYZ;

  // NCollection_Array1_gp_XYZ.Last (method)
  Last(): gp_XYZ;

  // NCollection_Array1_gp_XYZ.ChangeLast (method)
  ChangeLast(): gp_XYZ;

  // NCollection_Array1_gp_XYZ.Value (method)
  Value(theIndex: number): gp_XYZ;

  // NCollection_Array1_gp_XYZ.ChangeValue (method)
  ChangeValue(theIndex: number): gp_XYZ;

  // NCollection_Array1_gp_XYZ.At (method)
  At(theIndex: number): gp_XYZ;

  // NCollection_Array1_gp_XYZ.ChangeAt (method)
  ChangeAt(theIndex: number): gp_XYZ;

  // NCollection_Array1_gp_XYZ.SetValue (method)
  SetValue(theIndex: number, theItem: gp_XYZ): void;

  // NCollection_Array1_gp_XYZ.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_gp_XYZ.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_gp_XYZ.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_gp_XYZ.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_gp_XYZ.delete (method)
  delete(): void;

  // NCollection_Array1_gp_XYZ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_Expr_GeneralExpression: declare class NCollection_Array1_handle_Expr_GeneralExpression

  // NCollection_Array1_handle_Expr_GeneralExpression.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_Expr_GeneralExpression);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Expr_GeneralExpression, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Expr_GeneralExpression, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_Expr_GeneralExpression.Init (method)
  Init(theValue: Expr_GeneralExpression): void;

  // NCollection_Array1_handle_Expr_GeneralExpression.Size (method)
  Size(): number;

  // NCollection_Array1_handle_Expr_GeneralExpression.Length (method)
  Length(): number;

  // NCollection_Array1_handle_Expr_GeneralExpression.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_Expr_GeneralExpression.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_Expr_GeneralExpression.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_Expr_GeneralExpression.Assign (method)
  Assign(theOther: NCollection_Array1_handle_Expr_GeneralExpression): NCollection_Array1_handle_Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_Expr_GeneralExpression): NCollection_Array1_handle_Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.Move (method)
  Move(theOther: NCollection_Array1_handle_Expr_GeneralExpression): NCollection_Array1_handle_Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.First (method)
  First(): Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.ChangeFirst (method)
  ChangeFirst(): Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.Last (method)
  Last(): Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.ChangeLast (method)
  ChangeLast(): Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.Value (method)
  Value(theIndex: number): Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.ChangeValue (method)
  ChangeValue(theIndex: number): Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.At (method)
  At(theIndex: number): Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.ChangeAt (method)
  ChangeAt(theIndex: number): Expr_GeneralExpression;

  // NCollection_Array1_handle_Expr_GeneralExpression.SetValue (method)
  SetValue(theIndex: number, theItem: Expr_GeneralExpression): void;

  // NCollection_Array1_handle_Expr_GeneralExpression.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_Expr_GeneralExpression.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_Expr_GeneralExpression.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_Expr_GeneralExpression.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_Expr_GeneralExpression.delete (method)
  delete(): void;

  // NCollection_Array1_handle_Expr_GeneralExpression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_Expr_NamedUnknown: declare class NCollection_Array1_handle_Expr_NamedUnknown

  // NCollection_Array1_handle_Expr_NamedUnknown.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_Expr_NamedUnknown);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Expr_NamedUnknown, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Expr_NamedUnknown, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_Expr_NamedUnknown.Init (method)
  Init(theValue: Expr_NamedUnknown): void;

  // NCollection_Array1_handle_Expr_NamedUnknown.Size (method)
  Size(): number;

  // NCollection_Array1_handle_Expr_NamedUnknown.Length (method)
  Length(): number;

  // NCollection_Array1_handle_Expr_NamedUnknown.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_Expr_NamedUnknown.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_Expr_NamedUnknown.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_Expr_NamedUnknown.Assign (method)
  Assign(theOther: NCollection_Array1_handle_Expr_NamedUnknown): NCollection_Array1_handle_Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_Expr_NamedUnknown): NCollection_Array1_handle_Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.Move (method)
  Move(theOther: NCollection_Array1_handle_Expr_NamedUnknown): NCollection_Array1_handle_Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.First (method)
  First(): Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.ChangeFirst (method)
  ChangeFirst(): Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.Last (method)
  Last(): Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.ChangeLast (method)
  ChangeLast(): Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.Value (method)
  Value(theIndex: number): Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.ChangeValue (method)
  ChangeValue(theIndex: number): Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.At (method)
  At(theIndex: number): Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.ChangeAt (method)
  ChangeAt(theIndex: number): Expr_NamedUnknown;

  // NCollection_Array1_handle_Expr_NamedUnknown.SetValue (method)
  SetValue(theIndex: number, theItem: Expr_NamedUnknown): void;

  // NCollection_Array1_handle_Expr_NamedUnknown.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_Expr_NamedUnknown.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_Expr_NamedUnknown.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_Expr_NamedUnknown.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_Expr_NamedUnknown.delete (method)
  delete(): void;

  // NCollection_Array1_handle_Expr_NamedUnknown.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_Geom2d_BSplineCurve: declare class NCollection_Array1_handle_Geom2d_BSplineCurve

  // NCollection_Array1_handle_Geom2d_BSplineCurve.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_Geom2d_BSplineCurve);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Geom2d_BSplineCurve, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Geom2d_BSplineCurve, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Init (method)
  Init(theValue: Geom2d_BSplineCurve): void;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Size (method)
  Size(): number;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Length (method)
  Length(): number;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Assign (method)
  Assign(theOther: NCollection_Array1_handle_Geom2d_BSplineCurve): NCollection_Array1_handle_Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_Geom2d_BSplineCurve): NCollection_Array1_handle_Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Move (method)
  Move(theOther: NCollection_Array1_handle_Geom2d_BSplineCurve): NCollection_Array1_handle_Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.First (method)
  First(): Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.ChangeFirst (method)
  ChangeFirst(): Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Last (method)
  Last(): Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.ChangeLast (method)
  ChangeLast(): Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Value (method)
  Value(theIndex: number): Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.At (method)
  At(theIndex: number): Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom2d_BSplineCurve;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom2d_BSplineCurve): void;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.delete (method)
  delete(): void;

  // NCollection_Array1_handle_Geom2d_BSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_Geom2d_BezierCurve: declare class NCollection_Array1_handle_Geom2d_BezierCurve

  // NCollection_Array1_handle_Geom2d_BezierCurve.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_Geom2d_BezierCurve);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Geom2d_BezierCurve, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Geom2d_BezierCurve, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_Geom2d_BezierCurve.Init (method)
  Init(theValue: Geom2d_BezierCurve): void;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Size (method)
  Size(): number;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Length (method)
  Length(): number;

  // NCollection_Array1_handle_Geom2d_BezierCurve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Assign (method)
  Assign(theOther: NCollection_Array1_handle_Geom2d_BezierCurve): NCollection_Array1_handle_Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_Geom2d_BezierCurve): NCollection_Array1_handle_Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Move (method)
  Move(theOther: NCollection_Array1_handle_Geom2d_BezierCurve): NCollection_Array1_handle_Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.First (method)
  First(): Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.ChangeFirst (method)
  ChangeFirst(): Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Last (method)
  Last(): Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.ChangeLast (method)
  ChangeLast(): Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Value (method)
  Value(theIndex: number): Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.At (method)
  At(theIndex: number): Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom2d_BezierCurve;

  // NCollection_Array1_handle_Geom2d_BezierCurve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom2d_BezierCurve): void;

  // NCollection_Array1_handle_Geom2d_BezierCurve.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_Geom2d_BezierCurve.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_Geom2d_BezierCurve.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_Geom2d_BezierCurve.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_Geom2d_BezierCurve.delete (method)
  delete(): void;

  // NCollection_Array1_handle_Geom2d_BezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_Geom2d_Curve: declare class NCollection_Array1_handle_Geom2d_Curve

  // NCollection_Array1_handle_Geom2d_Curve.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_Geom2d_Curve);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Geom2d_Curve, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Geom2d_Curve, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_Geom2d_Curve.Init (method)
  Init(theValue: Geom2d_Curve): void;

  // NCollection_Array1_handle_Geom2d_Curve.Size (method)
  Size(): number;

  // NCollection_Array1_handle_Geom2d_Curve.Length (method)
  Length(): number;

  // NCollection_Array1_handle_Geom2d_Curve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_Geom2d_Curve.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_Geom2d_Curve.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_Geom2d_Curve.Assign (method)
  Assign(theOther: NCollection_Array1_handle_Geom2d_Curve): NCollection_Array1_handle_Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_Geom2d_Curve): NCollection_Array1_handle_Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.Move (method)
  Move(theOther: NCollection_Array1_handle_Geom2d_Curve): NCollection_Array1_handle_Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.First (method)
  First(): Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.ChangeFirst (method)
  ChangeFirst(): Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.Last (method)
  Last(): Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.ChangeLast (method)
  ChangeLast(): Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.Value (method)
  Value(theIndex: number): Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.At (method)
  At(theIndex: number): Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom2d_Curve;

  // NCollection_Array1_handle_Geom2d_Curve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom2d_Curve): void;

  // NCollection_Array1_handle_Geom2d_Curve.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_Geom2d_Curve.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_Geom2d_Curve.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_Geom2d_Curve.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_Geom2d_Curve.delete (method)
  delete(): void;

  // NCollection_Array1_handle_Geom2d_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_Geom_BSplineCurve: declare class NCollection_Array1_handle_Geom_BSplineCurve

  // NCollection_Array1_handle_Geom_BSplineCurve.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_Geom_BSplineCurve);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Geom_BSplineCurve, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Geom_BSplineCurve, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_Geom_BSplineCurve.Init (method)
  Init(theValue: Geom_BSplineCurve): void;

  // NCollection_Array1_handle_Geom_BSplineCurve.Size (method)
  Size(): number;

  // NCollection_Array1_handle_Geom_BSplineCurve.Length (method)
  Length(): number;

  // NCollection_Array1_handle_Geom_BSplineCurve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_Geom_BSplineCurve.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_Geom_BSplineCurve.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_Geom_BSplineCurve.Assign (method)
  Assign(theOther: NCollection_Array1_handle_Geom_BSplineCurve): NCollection_Array1_handle_Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_Geom_BSplineCurve): NCollection_Array1_handle_Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.Move (method)
  Move(theOther: NCollection_Array1_handle_Geom_BSplineCurve): NCollection_Array1_handle_Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.First (method)
  First(): Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.ChangeFirst (method)
  ChangeFirst(): Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.Last (method)
  Last(): Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.ChangeLast (method)
  ChangeLast(): Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.Value (method)
  Value(theIndex: number): Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.At (method)
  At(theIndex: number): Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom_BSplineCurve;

  // NCollection_Array1_handle_Geom_BSplineCurve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom_BSplineCurve): void;

  // NCollection_Array1_handle_Geom_BSplineCurve.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_Geom_BSplineCurve.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_Geom_BSplineCurve.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_Geom_BSplineCurve.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_Geom_BSplineCurve.delete (method)
  delete(): void;

  // NCollection_Array1_handle_Geom_BSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_Geom_BezierCurve: declare class NCollection_Array1_handle_Geom_BezierCurve

  // NCollection_Array1_handle_Geom_BezierCurve.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_Geom_BezierCurve);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Geom_BezierCurve, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Geom_BezierCurve, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_Geom_BezierCurve.Init (method)
  Init(theValue: Geom_BezierCurve): void;

  // NCollection_Array1_handle_Geom_BezierCurve.Size (method)
  Size(): number;

  // NCollection_Array1_handle_Geom_BezierCurve.Length (method)
  Length(): number;

  // NCollection_Array1_handle_Geom_BezierCurve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_Geom_BezierCurve.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_Geom_BezierCurve.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_Geom_BezierCurve.Assign (method)
  Assign(theOther: NCollection_Array1_handle_Geom_BezierCurve): NCollection_Array1_handle_Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_Geom_BezierCurve): NCollection_Array1_handle_Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.Move (method)
  Move(theOther: NCollection_Array1_handle_Geom_BezierCurve): NCollection_Array1_handle_Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.First (method)
  First(): Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.ChangeFirst (method)
  ChangeFirst(): Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.Last (method)
  Last(): Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.ChangeLast (method)
  ChangeLast(): Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.Value (method)
  Value(theIndex: number): Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.At (method)
  At(theIndex: number): Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom_BezierCurve;

  // NCollection_Array1_handle_Geom_BezierCurve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom_BezierCurve): void;

  // NCollection_Array1_handle_Geom_BezierCurve.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_Geom_BezierCurve.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_Geom_BezierCurve.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_Geom_BezierCurve.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_Geom_BezierCurve.delete (method)
  delete(): void;

  // NCollection_Array1_handle_Geom_BezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_Geom_Curve: declare class NCollection_Array1_handle_Geom_Curve

  // NCollection_Array1_handle_Geom_Curve.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_Geom_Curve);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Geom_Curve, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Geom_Curve, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_Geom_Curve.Init (method)
  Init(theValue: Geom_Curve): void;

  // NCollection_Array1_handle_Geom_Curve.Size (method)
  Size(): number;

  // NCollection_Array1_handle_Geom_Curve.Length (method)
  Length(): number;

  // NCollection_Array1_handle_Geom_Curve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_Geom_Curve.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_Geom_Curve.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_Geom_Curve.Assign (method)
  Assign(theOther: NCollection_Array1_handle_Geom_Curve): NCollection_Array1_handle_Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_Geom_Curve): NCollection_Array1_handle_Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.Move (method)
  Move(theOther: NCollection_Array1_handle_Geom_Curve): NCollection_Array1_handle_Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.First (method)
  First(): Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.ChangeFirst (method)
  ChangeFirst(): Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.Last (method)
  Last(): Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.ChangeLast (method)
  ChangeLast(): Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.Value (method)
  Value(theIndex: number): Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.At (method)
  At(theIndex: number): Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom_Curve;

  // NCollection_Array1_handle_Geom_Curve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom_Curve): void;

  // NCollection_Array1_handle_Geom_Curve.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_Geom_Curve.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_Geom_Curve.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_Geom_Curve.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_Geom_Curve.delete (method)
  delete(): void;

  // NCollection_Array1_handle_Geom_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_HLRAlgo_PolyData: declare class NCollection_Array1_handle_HLRAlgo_PolyData

  // NCollection_Array1_handle_HLRAlgo_PolyData.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_HLRAlgo_PolyData);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: HLRAlgo_PolyData, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: HLRAlgo_PolyData, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_HLRAlgo_PolyData.Init (method)
  Init(theValue: HLRAlgo_PolyData): void;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Size (method)
  Size(): number;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Length (method)
  Length(): number;

  // NCollection_Array1_handle_HLRAlgo_PolyData.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Assign (method)
  Assign(theOther: NCollection_Array1_handle_HLRAlgo_PolyData): NCollection_Array1_handle_HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_HLRAlgo_PolyData): NCollection_Array1_handle_HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Move (method)
  Move(theOther: NCollection_Array1_handle_HLRAlgo_PolyData): NCollection_Array1_handle_HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.First (method)
  First(): HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.ChangeFirst (method)
  ChangeFirst(): HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Last (method)
  Last(): HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.ChangeLast (method)
  ChangeLast(): HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Value (method)
  Value(theIndex: number): HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.ChangeValue (method)
  ChangeValue(theIndex: number): HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.At (method)
  At(theIndex: number): HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.ChangeAt (method)
  ChangeAt(theIndex: number): HLRAlgo_PolyData;

  // NCollection_Array1_handle_HLRAlgo_PolyData.SetValue (method)
  SetValue(theIndex: number, theItem: HLRAlgo_PolyData): void;

  // NCollection_Array1_handle_HLRAlgo_PolyData.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_HLRAlgo_PolyData.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_HLRAlgo_PolyData.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_HLRAlgo_PolyData.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_HLRAlgo_PolyData.delete (method)
  delete(): void;

  // NCollection_Array1_handle_HLRAlgo_PolyData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_HLRAlgo_PolyShellData: declare class NCollection_Array1_handle_HLRAlgo_PolyShellData

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_HLRAlgo_PolyShellData);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: HLRAlgo_PolyShellData, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: HLRAlgo_PolyShellData, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Init (method)
  Init(theValue: HLRAlgo_PolyShellData): void;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Size (method)
  Size(): number;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Length (method)
  Length(): number;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Assign (method)
  Assign(theOther: NCollection_Array1_handle_HLRAlgo_PolyShellData): NCollection_Array1_handle_HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_HLRAlgo_PolyShellData): NCollection_Array1_handle_HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Move (method)
  Move(theOther: NCollection_Array1_handle_HLRAlgo_PolyShellData): NCollection_Array1_handle_HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.First (method)
  First(): HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.ChangeFirst (method)
  ChangeFirst(): HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Last (method)
  Last(): HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.ChangeLast (method)
  ChangeLast(): HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Value (method)
  Value(theIndex: number): HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.ChangeValue (method)
  ChangeValue(theIndex: number): HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.At (method)
  At(theIndex: number): HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.ChangeAt (method)
  ChangeAt(theIndex: number): HLRAlgo_PolyShellData;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.SetValue (method)
  SetValue(theIndex: number, theItem: HLRAlgo_PolyShellData): void;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.delete (method)
  delete(): void;

  // NCollection_Array1_handle_HLRAlgo_PolyShellData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESAppli_FiniteElement: declare class NCollection_Array1_handle_IGESAppli_FiniteElement

  // NCollection_Array1_handle_IGESAppli_FiniteElement.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESAppli_FiniteElement);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESAppli_FiniteElement, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESAppli_FiniteElement, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Init (method)
  Init(theValue: IGESAppli_FiniteElement): void;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESAppli_FiniteElement): NCollection_Array1_handle_IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESAppli_FiniteElement): NCollection_Array1_handle_IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESAppli_FiniteElement): NCollection_Array1_handle_IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.First (method)
  First(): IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.ChangeFirst (method)
  ChangeFirst(): IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Last (method)
  Last(): IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.ChangeLast (method)
  ChangeLast(): IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Value (method)
  Value(theIndex: number): IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.ChangeValue (method)
  ChangeValue(theIndex: number): IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.At (method)
  At(theIndex: number): IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.ChangeAt (method)
  ChangeAt(theIndex: number): IGESAppli_FiniteElement;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.SetValue (method)
  SetValue(theIndex: number, theItem: IGESAppli_FiniteElement): void;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESAppli_FiniteElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
