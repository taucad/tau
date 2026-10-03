# libcascade — NCollection (30)

13 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_handle_Expr_NamedExpression: declare class NCollection_Sequence_handle_Expr_NamedExpression extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Expr_NamedExpression.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Expr_NamedExpression);

  // NCollection_Sequence_handle_Expr_NamedExpression.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Expr_NamedExpression.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Expr_NamedExpression.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Expr_NamedExpression.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Expr_NamedExpression): NCollection_Sequence_handle_Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.Append (method)
  Append(theItem: Expr_NamedExpression): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.Prepend (method)
  Prepend(theItem: Expr_NamedExpression): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Expr_NamedExpression): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
  InsertAfter(theIndex: number, theItem: Expr_NamedExpression): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.First (method)
  First(): Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.ChangeFirst (method)
  ChangeFirst(): Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.Last (method)
  Last(): Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.ChangeLast (method)
  ChangeLast(): Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.Value (method)
  Value(theIndex: number): Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.ChangeValue (method)
  ChangeValue(theIndex: number): Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.SetValue (method)
  SetValue(theIndex: number, theItem: Expr_NamedExpression): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.At (method)
  At(theIndex: number): Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.ChangeAt (method)
  ChangeAt(theIndex: number): Expr_NamedExpression;

  // NCollection_Sequence_handle_Expr_NamedExpression.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Expr_NamedExpression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Expr_NamedFunction: declare class NCollection_Sequence_handle_Expr_NamedFunction extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Expr_NamedFunction.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Expr_NamedFunction);

  // NCollection_Sequence_handle_Expr_NamedFunction.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Expr_NamedFunction.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Expr_NamedFunction.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Expr_NamedFunction.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Expr_NamedFunction): NCollection_Sequence_handle_Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.Append (method)
  Append(theItem: Expr_NamedFunction): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.Prepend (method)
  Prepend(theItem: Expr_NamedFunction): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Expr_NamedFunction): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
  InsertAfter(theIndex: number, theItem: Expr_NamedFunction): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.First (method)
  First(): Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.ChangeFirst (method)
  ChangeFirst(): Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.Last (method)
  Last(): Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.ChangeLast (method)
  ChangeLast(): Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.Value (method)
  Value(theIndex: number): Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.ChangeValue (method)
  ChangeValue(theIndex: number): Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.SetValue (method)
  SetValue(theIndex: number, theItem: Expr_NamedFunction): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.At (method)
  At(theIndex: number): Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.ChangeAt (method)
  ChangeAt(theIndex: number): Expr_NamedFunction;

  // NCollection_Sequence_handle_Expr_NamedFunction.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Expr_NamedFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom2d_BoundedCurve: declare class NCollection_Sequence_handle_Geom2d_BoundedCurve extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Geom2d_BoundedCurve);

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Geom2d_BoundedCurve): NCollection_Sequence_handle_Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Append (method)
  Append(theItem: Geom2d_BoundedCurve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Prepend (method)
  Prepend(theItem: Geom2d_BoundedCurve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Geom2d_BoundedCurve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
  InsertAfter(theIndex: number, theItem: Geom2d_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.First (method)
  First(): Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.ChangeFirst (method)
  ChangeFirst(): Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Last (method)
  Last(): Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.ChangeLast (method)
  ChangeLast(): Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.Value (method)
  Value(theIndex: number): Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom2d_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.At (method)
  At(theIndex: number): Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom2d_BoundedCurve;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Geom2d_BoundedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom2d_Curve: declare class NCollection_Sequence_handle_Geom2d_Curve extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Geom2d_Curve.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Geom2d_Curve);

  // NCollection_Sequence_handle_Geom2d_Curve.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Geom2d_Curve.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Geom2d_Curve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Geom2d_Curve.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Geom2d_Curve.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Geom2d_Curve.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Geom2d_Curve.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Geom2d_Curve): NCollection_Sequence_handle_Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Geom2d_Curve.Append (method)
  Append(theItem: Geom2d_Curve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

  // NCollection_Sequence_handle_Geom2d_Curve.Prepend (method)
  Prepend(theItem: Geom2d_Curve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

  // NCollection_Sequence_handle_Geom2d_Curve.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Geom2d_Curve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

  // NCollection_Sequence_handle_Geom2d_Curve.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
  InsertAfter(theIndex: number, theItem: Geom2d_Curve): void;

  // NCollection_Sequence_handle_Geom2d_Curve.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

  // NCollection_Sequence_handle_Geom2d_Curve.First (method)
  First(): Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.ChangeFirst (method)
  ChangeFirst(): Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.Last (method)
  Last(): Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.ChangeLast (method)
  ChangeLast(): Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.Value (method)
  Value(theIndex: number): Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom2d_Curve): void;

  // NCollection_Sequence_handle_Geom2d_Curve.At (method)
  At(theIndex: number): Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom2d_Curve;

  // NCollection_Sequence_handle_Geom2d_Curve.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Geom2d_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom2d_Geometry: declare class NCollection_Sequence_handle_Geom2d_Geometry extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Geom2d_Geometry.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Geom2d_Geometry);

  // NCollection_Sequence_handle_Geom2d_Geometry.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Geom2d_Geometry.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Geom2d_Geometry.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Geom2d_Geometry.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Geom2d_Geometry): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.Append (method)
  Append(theItem: Geom2d_Geometry): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.Prepend (method)
  Prepend(theItem: Geom2d_Geometry): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Geom2d_Geometry): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
  InsertAfter(theIndex: number, theItem: Geom2d_Geometry): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.First (method)
  First(): Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.ChangeFirst (method)
  ChangeFirst(): Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.Last (method)
  Last(): Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.ChangeLast (method)
  ChangeLast(): Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.Value (method)
  Value(theIndex: number): Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.ChangeValue (method)
  ChangeValue(theIndex: number): Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.SetValue (method)
  SetValue(theIndex: number, theItem: Geom2d_Geometry): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.At (method)
  At(theIndex: number): Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.ChangeAt (method)
  ChangeAt(theIndex: number): Geom2d_Geometry;

  // NCollection_Sequence_handle_Geom2d_Geometry.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Geom2d_Geometry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom_BoundedCurve: declare class NCollection_Sequence_handle_Geom_BoundedCurve extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Geom_BoundedCurve.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Geom_BoundedCurve);

  // NCollection_Sequence_handle_Geom_BoundedCurve.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Geom_BoundedCurve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Geom_BoundedCurve): NCollection_Sequence_handle_Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Append (method)
  Append(theItem: Geom_BoundedCurve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Prepend (method)
  Prepend(theItem: Geom_BoundedCurve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Geom_BoundedCurve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
  InsertAfter(theIndex: number, theItem: Geom_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.First (method)
  First(): Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.ChangeFirst (method)
  ChangeFirst(): Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Last (method)
  Last(): Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.ChangeLast (method)
  ChangeLast(): Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.Value (method)
  Value(theIndex: number): Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom_BoundedCurve): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.At (method)
  At(theIndex: number): Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom_BoundedCurve;

  // NCollection_Sequence_handle_Geom_BoundedCurve.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Geom_BoundedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom_Curve: declare class NCollection_Sequence_handle_Geom_Curve extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Geom_Curve.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Geom_Curve);

  // NCollection_Sequence_handle_Geom_Curve.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Geom_Curve.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Geom_Curve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Geom_Curve.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Geom_Curve.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Geom_Curve.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Geom_Curve.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Geom_Curve): NCollection_Sequence_handle_Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Geom_Curve.Append (method)
  Append(theItem: Geom_Curve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom_Curve): void;

  // NCollection_Sequence_handle_Geom_Curve.Prepend (method)
  Prepend(theItem: Geom_Curve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom_Curve): void;

  // NCollection_Sequence_handle_Geom_Curve.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Geom_Curve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;

  // NCollection_Sequence_handle_Geom_Curve.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;
  InsertAfter(theIndex: number, theItem: Geom_Curve): void;

  // NCollection_Sequence_handle_Geom_Curve.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;

  // NCollection_Sequence_handle_Geom_Curve.First (method)
  First(): Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.ChangeFirst (method)
  ChangeFirst(): Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.Last (method)
  Last(): Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.ChangeLast (method)
  ChangeLast(): Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.Value (method)
  Value(theIndex: number): Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.ChangeValue (method)
  ChangeValue(theIndex: number): Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.SetValue (method)
  SetValue(theIndex: number, theItem: Geom_Curve): void;

  // NCollection_Sequence_handle_Geom_Curve.At (method)
  At(theIndex: number): Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.ChangeAt (method)
  ChangeAt(theIndex: number): Geom_Curve;

  // NCollection_Sequence_handle_Geom_Curve.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Geom_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_IFSelect_Selection: declare class NCollection_Sequence_handle_IFSelect_Selection extends NCollection_BaseSequence

  // NCollection_Sequence_handle_IFSelect_Selection.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_IFSelect_Selection);

  // NCollection_Sequence_handle_IFSelect_Selection.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_IFSelect_Selection.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_IFSelect_Selection.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_IFSelect_Selection.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_IFSelect_Selection.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_IFSelect_Selection.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_IFSelect_Selection.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_IFSelect_Selection): NCollection_Sequence_handle_IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_IFSelect_Selection.Append (method)
  Append(theItem: IFSelect_Selection): void;
  Append(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

  // NCollection_Sequence_handle_IFSelect_Selection.Prepend (method)
  Prepend(theItem: IFSelect_Selection): void;
  Prepend(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

  // NCollection_Sequence_handle_IFSelect_Selection.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: IFSelect_Selection): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

  // NCollection_Sequence_handle_IFSelect_Selection.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
  InsertAfter(theIndex: number, theItem: IFSelect_Selection): void;

  // NCollection_Sequence_handle_IFSelect_Selection.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

  // NCollection_Sequence_handle_IFSelect_Selection.First (method)
  First(): IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.ChangeFirst (method)
  ChangeFirst(): IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.Last (method)
  Last(): IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.ChangeLast (method)
  ChangeLast(): IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.Value (method)
  Value(theIndex: number): IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.ChangeValue (method)
  ChangeValue(theIndex: number): IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.SetValue (method)
  SetValue(theIndex: number, theItem: IFSelect_Selection): void;

  // NCollection_Sequence_handle_IFSelect_Selection.At (method)
  At(theIndex: number): IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.ChangeAt (method)
  ChangeAt(theIndex: number): IFSelect_Selection;

  // NCollection_Sequence_handle_IFSelect_Selection.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_IFSelect_Selection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_IntPatch_Line: declare class NCollection_Sequence_handle_IntPatch_Line extends NCollection_BaseSequence

  // NCollection_Sequence_handle_IntPatch_Line.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_IntPatch_Line);

  // NCollection_Sequence_handle_IntPatch_Line.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_IntPatch_Line.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_IntPatch_Line.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_IntPatch_Line.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_IntPatch_Line.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_IntPatch_Line.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_IntPatch_Line.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_IntPatch_Line): NCollection_Sequence_handle_IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_IntPatch_Line.Append (method)
  Append(theItem: IntPatch_Line): void;
  Append(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

  // NCollection_Sequence_handle_IntPatch_Line.Prepend (method)
  Prepend(theItem: IntPatch_Line): void;
  Prepend(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

  // NCollection_Sequence_handle_IntPatch_Line.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: IntPatch_Line): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

  // NCollection_Sequence_handle_IntPatch_Line.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
  InsertAfter(theIndex: number, theItem: IntPatch_Line): void;

  // NCollection_Sequence_handle_IntPatch_Line.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

  // NCollection_Sequence_handle_IntPatch_Line.First (method)
  First(): IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.ChangeFirst (method)
  ChangeFirst(): IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.Last (method)
  Last(): IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.ChangeLast (method)
  ChangeLast(): IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.Value (method)
  Value(theIndex: number): IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.ChangeValue (method)
  ChangeValue(theIndex: number): IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.SetValue (method)
  SetValue(theIndex: number, theItem: IntPatch_Line): void;

  // NCollection_Sequence_handle_IntPatch_Line.At (method)
  At(theIndex: number): IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.ChangeAt (method)
  ChangeAt(theIndex: number): IntPatch_Line;

  // NCollection_Sequence_handle_IntPatch_Line.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_IntPatch_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_MAT2d_Connexion: declare class NCollection_Sequence_handle_MAT2d_Connexion extends NCollection_BaseSequence

  // NCollection_Sequence_handle_MAT2d_Connexion.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_MAT2d_Connexion);

  // NCollection_Sequence_handle_MAT2d_Connexion.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_MAT2d_Connexion.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_MAT2d_Connexion.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_MAT2d_Connexion.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_MAT2d_Connexion): NCollection_Sequence_handle_MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.Append (method)
  Append(theItem: MAT2d_Connexion): void;
  Append(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.Prepend (method)
  Prepend(theItem: MAT2d_Connexion): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: MAT2d_Connexion): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
  InsertAfter(theIndex: number, theItem: MAT2d_Connexion): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.First (method)
  First(): MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.ChangeFirst (method)
  ChangeFirst(): MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.Last (method)
  Last(): MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.ChangeLast (method)
  ChangeLast(): MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.Value (method)
  Value(theIndex: number): MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.ChangeValue (method)
  ChangeValue(theIndex: number): MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.SetValue (method)
  SetValue(theIndex: number, theItem: MAT2d_Connexion): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.At (method)
  At(theIndex: number): MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.ChangeAt (method)
  ChangeAt(theIndex: number): MAT2d_Connexion;

  // NCollection_Sequence_handle_MAT2d_Connexion.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_MAT2d_Connexion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_MAT_Arc: declare class NCollection_Sequence_handle_MAT_Arc extends NCollection_BaseSequence

  // NCollection_Sequence_handle_MAT_Arc.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_MAT_Arc);

  // NCollection_Sequence_handle_MAT_Arc.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_MAT_Arc.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_MAT_Arc.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_MAT_Arc.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_MAT_Arc.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_MAT_Arc.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_MAT_Arc.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_MAT_Arc): NCollection_Sequence_handle_MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_MAT_Arc.Append (method)
  Append(theItem: MAT_Arc): void;
  Append(theSeq: NCollection_Sequence_handle_MAT_Arc): void;

  // NCollection_Sequence_handle_MAT_Arc.Prepend (method)
  Prepend(theItem: MAT_Arc): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT_Arc): void;

  // NCollection_Sequence_handle_MAT_Arc.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: MAT_Arc): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;

  // NCollection_Sequence_handle_MAT_Arc.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;
  InsertAfter(theIndex: number, theItem: MAT_Arc): void;

  // NCollection_Sequence_handle_MAT_Arc.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;

  // NCollection_Sequence_handle_MAT_Arc.First (method)
  First(): MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.ChangeFirst (method)
  ChangeFirst(): MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.Last (method)
  Last(): MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.ChangeLast (method)
  ChangeLast(): MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.Value (method)
  Value(theIndex: number): MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.ChangeValue (method)
  ChangeValue(theIndex: number): MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.SetValue (method)
  SetValue(theIndex: number, theItem: MAT_Arc): void;

  // NCollection_Sequence_handle_MAT_Arc.At (method)
  At(theIndex: number): MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.ChangeAt (method)
  ChangeAt(theIndex: number): MAT_Arc;

  // NCollection_Sequence_handle_MAT_Arc.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_MAT_Arc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_MAT_BasicElt: declare class NCollection_Sequence_handle_MAT_BasicElt extends NCollection_BaseSequence

  // NCollection_Sequence_handle_MAT_BasicElt.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_MAT_BasicElt);

  // NCollection_Sequence_handle_MAT_BasicElt.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_MAT_BasicElt.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_MAT_BasicElt.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_MAT_BasicElt.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_MAT_BasicElt.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_MAT_BasicElt.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_MAT_BasicElt.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_MAT_BasicElt): NCollection_Sequence_handle_MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_MAT_BasicElt.Append (method)
  Append(theItem: MAT_BasicElt): void;
  Append(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

  // NCollection_Sequence_handle_MAT_BasicElt.Prepend (method)
  Prepend(theItem: MAT_BasicElt): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

  // NCollection_Sequence_handle_MAT_BasicElt.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: MAT_BasicElt): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

  // NCollection_Sequence_handle_MAT_BasicElt.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
  InsertAfter(theIndex: number, theItem: MAT_BasicElt): void;

  // NCollection_Sequence_handle_MAT_BasicElt.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

  // NCollection_Sequence_handle_MAT_BasicElt.First (method)
  First(): MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.ChangeFirst (method)
  ChangeFirst(): MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.Last (method)
  Last(): MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.ChangeLast (method)
  ChangeLast(): MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.Value (method)
  Value(theIndex: number): MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.ChangeValue (method)
  ChangeValue(theIndex: number): MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.SetValue (method)
  SetValue(theIndex: number, theItem: MAT_BasicElt): void;

  // NCollection_Sequence_handle_MAT_BasicElt.At (method)
  At(theIndex: number): MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.ChangeAt (method)
  ChangeAt(theIndex: number): MAT_BasicElt;

  // NCollection_Sequence_handle_MAT_BasicElt.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_MAT_BasicElt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt: declare class NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt extends NCollection_BaseSequence

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt);

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Append (method)
  Append(theItem: unknown): void;
  Append(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Prepend (method)
  Prepend(theItem: unknown): void;
  Prepend(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: unknown): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
  InsertAfter(theIndex: number, theItem: unknown): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.First (method)
  First(): unknown;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.ChangeFirst (method)
  ChangeFirst(): unknown;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Last (method)
  Last(): unknown;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.ChangeLast (method)
  ChangeLast(): unknown;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.Value (method)
  Value(theIndex: number): unknown;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.ChangeValue (method)
  ChangeValue(theIndex: number): unknown;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.SetValue (method)
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.At (method)
  At(theIndex: number): unknown;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.ChangeAt (method)
  ChangeAt(theIndex: number): unknown;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
