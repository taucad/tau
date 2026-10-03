# libcascade — NCollection (29)

13 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_TDF_Label: declare class NCollection_Sequence_TDF_Label extends NCollection_BaseSequence

  // NCollection_Sequence_TDF_Label.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_TDF_Label);

  // NCollection_Sequence_TDF_Label.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_TDF_Label.Upper (method)
  Upper(): number;

  // NCollection_Sequence_TDF_Label.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_TDF_Label.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_TDF_Label.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_TDF_Label.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_TDF_Label.Assign (method)
  Assign(theOther: NCollection_Sequence_TDF_Label): NCollection_Sequence_TDF_Label;

  // NCollection_Sequence_TDF_Label.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_TDF_Label.Append (method)
  Append(theItem: TDF_Label): void;
  Append(theSeq: NCollection_Sequence_TDF_Label): void;

  // NCollection_Sequence_TDF_Label.Prepend (method)
  Prepend(theItem: TDF_Label): void;
  Prepend(theSeq: NCollection_Sequence_TDF_Label): void;

  // NCollection_Sequence_TDF_Label.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TDF_Label): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TDF_Label): void;

  // NCollection_Sequence_TDF_Label.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TDF_Label): void;
  InsertAfter(theIndex: number, theItem: TDF_Label): void;

  // NCollection_Sequence_TDF_Label.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_TDF_Label): void;

  // NCollection_Sequence_TDF_Label.First (method)
  First(): TDF_Label;

  // NCollection_Sequence_TDF_Label.ChangeFirst (method)
  ChangeFirst(): TDF_Label;

  // NCollection_Sequence_TDF_Label.Last (method)
  Last(): TDF_Label;

  // NCollection_Sequence_TDF_Label.ChangeLast (method)
  ChangeLast(): TDF_Label;

  // NCollection_Sequence_TDF_Label.Value (method)
  Value(theIndex: number): TDF_Label;

  // NCollection_Sequence_TDF_Label.ChangeValue (method)
  ChangeValue(theIndex: number): TDF_Label;

  // NCollection_Sequence_TDF_Label.SetValue (method)
  SetValue(theIndex: number, theItem: TDF_Label): void;

  // NCollection_Sequence_TDF_Label.At (method)
  At(theIndex: number): TDF_Label;

  // NCollection_Sequence_TDF_Label.ChangeAt (method)
  ChangeAt(theIndex: number): TDF_Label;

  // NCollection_Sequence_TDF_Label.delete (method)
  delete(): void;

  // NCollection_Sequence_TDF_Label.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_TopoDS_Shape: declare class NCollection_Sequence_TopoDS_Shape extends NCollection_BaseSequence

  // NCollection_Sequence_TopoDS_Shape.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_TopoDS_Shape);

  // NCollection_Sequence_TopoDS_Shape.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_TopoDS_Shape.Upper (method)
  Upper(): number;

  // NCollection_Sequence_TopoDS_Shape.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_TopoDS_Shape.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_TopoDS_Shape.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_TopoDS_Shape.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_TopoDS_Shape.Assign (method)
  Assign(theOther: NCollection_Sequence_TopoDS_Shape): NCollection_Sequence_TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_TopoDS_Shape.Append (method)
  Append(theItem: TopoDS_Shape): void;
  Append(theSeq: NCollection_Sequence_TopoDS_Shape): void;

  // NCollection_Sequence_TopoDS_Shape.Prepend (method)
  Prepend(theItem: TopoDS_Shape): void;
  Prepend(theSeq: NCollection_Sequence_TopoDS_Shape): void;

  // NCollection_Sequence_TopoDS_Shape.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TopoDS_Shape): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TopoDS_Shape): void;

  // NCollection_Sequence_TopoDS_Shape.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TopoDS_Shape): void;
  InsertAfter(theIndex: number, theItem: TopoDS_Shape): void;

  // NCollection_Sequence_TopoDS_Shape.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_TopoDS_Shape): void;

  // NCollection_Sequence_TopoDS_Shape.First (method)
  First(): TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.ChangeFirst (method)
  ChangeFirst(): TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.Last (method)
  Last(): TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.ChangeLast (method)
  ChangeLast(): TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.Value (method)
  Value(theIndex: number): TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.ChangeValue (method)
  ChangeValue(theIndex: number): TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.SetValue (method)
  SetValue(theIndex: number, theItem: TopoDS_Shape): void;

  // NCollection_Sequence_TopoDS_Shape.At (method)
  At(theIndex: number): TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.ChangeAt (method)
  ChangeAt(theIndex: number): TopoDS_Shape;

  // NCollection_Sequence_TopoDS_Shape.delete (method)
  delete(): void;

  // NCollection_Sequence_TopoDS_Shape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif: declare class NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif extends NCollection_BaseSequence

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif);

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Upper (method)
  Upper(): number;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Assign (method)
  Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Append (method)
  Append(theItem: XCAFDimTolObjects_DatumSingleModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Prepend (method)
  Prepend(theItem: XCAFDimTolObjects_DatumSingleModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.First (method)
  First(): XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.ChangeFirst (method)
  ChangeFirst(): XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Last (method)
  Last(): XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.ChangeLast (method)
  ChangeLast(): XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.Value (method)
  Value(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.ChangeValue (method)
  ChangeValue(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.SetValue (method)
  SetValue(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.At (method)
  At(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.ChangeAt (method)
  ChangeAt(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.delete (method)
  delete(): void;

  // NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_XCAFDimTolObjects_DimensionModif: declare class NCollection_Sequence_XCAFDimTolObjects_DimensionModif extends NCollection_BaseSequence

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_XCAFDimTolObjects_DimensionModif);

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Upper (method)
  Upper(): number;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Assign (method)
  Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): NCollection_Sequence_XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Append (method)
  Append(theItem: XCAFDimTolObjects_DimensionModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Prepend (method)
  Prepend(theItem: XCAFDimTolObjects_DimensionModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.First (method)
  First(): XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.ChangeFirst (method)
  ChangeFirst(): XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Last (method)
  Last(): XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.ChangeLast (method)
  ChangeLast(): XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.Value (method)
  Value(theIndex: number): XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.ChangeValue (method)
  ChangeValue(theIndex: number): XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.SetValue (method)
  SetValue(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.At (method)
  At(theIndex: number): XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.ChangeAt (method)
  ChangeAt(theIndex: number): XCAFDimTolObjects_DimensionModif;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.delete (method)
  delete(): void;

  // NCollection_Sequence_XCAFDimTolObjects_DimensionModif.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif: declare class NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif extends NCollection_BaseSequence

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif);

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Upper (method)
  Upper(): number;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Assign (method)
  Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Append (method)
  Append(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Prepend (method)
  Prepend(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.First (method)
  First(): XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.ChangeFirst (method)
  ChangeFirst(): XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Last (method)
  Last(): XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.ChangeLast (method)
  ChangeLast(): XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.Value (method)
  Value(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.ChangeValue (method)
  ChangeValue(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.SetValue (method)
  SetValue(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.At (method)
  At(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.ChangeAt (method)
  ChangeAt(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.delete (method)
  delete(): void;

  // NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_bool: declare class NCollection_Sequence_bool extends NCollection_BaseSequence

  // NCollection_Sequence_bool.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_bool);

  // NCollection_Sequence_bool.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_bool.Upper (method)
  Upper(): number;

  // NCollection_Sequence_bool.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_bool.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_bool.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_bool.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_bool.Assign (method)
  Assign(theOther: NCollection_Sequence_bool): NCollection_Sequence_bool;

  // NCollection_Sequence_bool.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_bool.Append (method)
  Append(theItem: boolean): void;
  Append(theSeq: NCollection_Sequence_bool): void;

  // NCollection_Sequence_bool.Prepend (method)
  Prepend(theItem: boolean): void;
  Prepend(theSeq: NCollection_Sequence_bool): void;

  // NCollection_Sequence_bool.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: boolean): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_bool): void;

  // NCollection_Sequence_bool.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_bool): void;
  InsertAfter(theIndex: number, theItem: boolean): void;

  // NCollection_Sequence_bool.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_bool): void;

  // NCollection_Sequence_bool.First (method)
  First(): boolean;

  // NCollection_Sequence_bool.ChangeFirst (method)
  ChangeFirst(): boolean;

  // NCollection_Sequence_bool.Last (method)
  Last(): boolean;

  // NCollection_Sequence_bool.ChangeLast (method)
  ChangeLast(): boolean;

  // NCollection_Sequence_bool.Value (method)
  Value(theIndex: number): boolean;

  // NCollection_Sequence_bool.ChangeValue (method)
  ChangeValue(theIndex: number): boolean;

  // NCollection_Sequence_bool.SetValue (method)
  SetValue(theIndex: number, theItem: boolean): void;

  // NCollection_Sequence_bool.At (method)
  At(theIndex: number): boolean;

  // NCollection_Sequence_bool.ChangeAt (method)
  ChangeAt(theIndex: number): boolean;

  // NCollection_Sequence_bool.delete (method)
  delete(): void;

  // NCollection_Sequence_bool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_double: declare class NCollection_Sequence_double extends NCollection_BaseSequence

  // NCollection_Sequence_double.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_double);

  // NCollection_Sequence_double.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_double.Upper (method)
  Upper(): number;

  // NCollection_Sequence_double.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_double.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_double.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_double.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_double.Assign (method)
  Assign(theOther: NCollection_Sequence_double): NCollection_Sequence_double;

  // NCollection_Sequence_double.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_double.Append (method)
  Append(theItem: number): void;
  Append(theSeq: NCollection_Sequence_double): void;

  // NCollection_Sequence_double.Prepend (method)
  Prepend(theItem: number): void;
  Prepend(theSeq: NCollection_Sequence_double): void;

  // NCollection_Sequence_double.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: number): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_double): void;

  // NCollection_Sequence_double.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_double): void;
  InsertAfter(theIndex: number, theItem: number): void;

  // NCollection_Sequence_double.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_double): void;

  // NCollection_Sequence_double.First (method)
  First(): number;

  // NCollection_Sequence_double.ChangeFirst (method)
  ChangeFirst(): number;

  // NCollection_Sequence_double.Last (method)
  Last(): number;

  // NCollection_Sequence_double.ChangeLast (method)
  ChangeLast(): number;

  // NCollection_Sequence_double.Value (method)
  Value(theIndex: number): number;

  // NCollection_Sequence_double.ChangeValue (method)
  ChangeValue(theIndex: number): number;

  // NCollection_Sequence_double.SetValue (method)
  SetValue(theIndex: number, theItem: number): void;

  // NCollection_Sequence_double.At (method)
  At(theIndex: number): number;

  // NCollection_Sequence_double.ChangeAt (method)
  ChangeAt(theIndex: number): number;

  // NCollection_Sequence_double.delete (method)
  delete(): void;

  // NCollection_Sequence_double.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_gp_Pnt: declare class NCollection_Sequence_gp_Pnt extends NCollection_BaseSequence

  // NCollection_Sequence_gp_Pnt.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_gp_Pnt);

  // NCollection_Sequence_gp_Pnt.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_gp_Pnt.Upper (method)
  Upper(): number;

  // NCollection_Sequence_gp_Pnt.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_gp_Pnt.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_gp_Pnt.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_gp_Pnt.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_gp_Pnt.Assign (method)
  Assign(theOther: NCollection_Sequence_gp_Pnt): NCollection_Sequence_gp_Pnt;

  // NCollection_Sequence_gp_Pnt.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_gp_Pnt.Append (method)
  Append(theItem: gp_Pnt): void;
  Append(theSeq: NCollection_Sequence_gp_Pnt): void;

  // NCollection_Sequence_gp_Pnt.Prepend (method)
  Prepend(theItem: gp_Pnt): void;
  Prepend(theSeq: NCollection_Sequence_gp_Pnt): void;

  // NCollection_Sequence_gp_Pnt.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: gp_Pnt): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;

  // NCollection_Sequence_gp_Pnt.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;
  InsertAfter(theIndex: number, theItem: gp_Pnt): void;

  // NCollection_Sequence_gp_Pnt.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;

  // NCollection_Sequence_gp_Pnt.First (method)
  First(): gp_Pnt;

  // NCollection_Sequence_gp_Pnt.ChangeFirst (method)
  ChangeFirst(): gp_Pnt;

  // NCollection_Sequence_gp_Pnt.Last (method)
  Last(): gp_Pnt;

  // NCollection_Sequence_gp_Pnt.ChangeLast (method)
  ChangeLast(): gp_Pnt;

  // NCollection_Sequence_gp_Pnt.Value (method)
  Value(theIndex: number): gp_Pnt;

  // NCollection_Sequence_gp_Pnt.ChangeValue (method)
  ChangeValue(theIndex: number): gp_Pnt;

  // NCollection_Sequence_gp_Pnt.SetValue (method)
  SetValue(theIndex: number, theItem: gp_Pnt): void;

  // NCollection_Sequence_gp_Pnt.At (method)
  At(theIndex: number): gp_Pnt;

  // NCollection_Sequence_gp_Pnt.ChangeAt (method)
  ChangeAt(theIndex: number): gp_Pnt;

  // NCollection_Sequence_gp_Pnt.delete (method)
  delete(): void;

  // NCollection_Sequence_gp_Pnt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_gp_Pnt2d: declare class NCollection_Sequence_gp_Pnt2d extends NCollection_BaseSequence

  // NCollection_Sequence_gp_Pnt2d.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_gp_Pnt2d);

  // NCollection_Sequence_gp_Pnt2d.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_gp_Pnt2d.Upper (method)
  Upper(): number;

  // NCollection_Sequence_gp_Pnt2d.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_gp_Pnt2d.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_gp_Pnt2d.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_gp_Pnt2d.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_gp_Pnt2d.Assign (method)
  Assign(theOther: NCollection_Sequence_gp_Pnt2d): NCollection_Sequence_gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_gp_Pnt2d.Append (method)
  Append(theItem: gp_Pnt2d): void;
  Append(theSeq: NCollection_Sequence_gp_Pnt2d): void;

  // NCollection_Sequence_gp_Pnt2d.Prepend (method)
  Prepend(theItem: gp_Pnt2d): void;
  Prepend(theSeq: NCollection_Sequence_gp_Pnt2d): void;

  // NCollection_Sequence_gp_Pnt2d.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: gp_Pnt2d): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;

  // NCollection_Sequence_gp_Pnt2d.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;
  InsertAfter(theIndex: number, theItem: gp_Pnt2d): void;

  // NCollection_Sequence_gp_Pnt2d.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;

  // NCollection_Sequence_gp_Pnt2d.First (method)
  First(): gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.ChangeFirst (method)
  ChangeFirst(): gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.Last (method)
  Last(): gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.ChangeLast (method)
  ChangeLast(): gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.Value (method)
  Value(theIndex: number): gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.ChangeValue (method)
  ChangeValue(theIndex: number): gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.SetValue (method)
  SetValue(theIndex: number, theItem: gp_Pnt2d): void;

  // NCollection_Sequence_gp_Pnt2d.At (method)
  At(theIndex: number): gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.ChangeAt (method)
  ChangeAt(theIndex: number): gp_Pnt2d;

  // NCollection_Sequence_gp_Pnt2d.delete (method)
  delete(): void;

  // NCollection_Sequence_gp_Pnt2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_gp_Trsf: declare class NCollection_Sequence_gp_Trsf extends NCollection_BaseSequence

  // NCollection_Sequence_gp_Trsf.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_gp_Trsf);

  // NCollection_Sequence_gp_Trsf.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_gp_Trsf.Upper (method)
  Upper(): number;

  // NCollection_Sequence_gp_Trsf.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_gp_Trsf.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_gp_Trsf.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_gp_Trsf.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_gp_Trsf.Assign (method)
  Assign(theOther: NCollection_Sequence_gp_Trsf): NCollection_Sequence_gp_Trsf;

  // NCollection_Sequence_gp_Trsf.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_gp_Trsf.Append (method)
  Append(theItem: gp_Trsf): void;
  Append(theSeq: NCollection_Sequence_gp_Trsf): void;

  // NCollection_Sequence_gp_Trsf.Prepend (method)
  Prepend(theItem: gp_Trsf): void;
  Prepend(theSeq: NCollection_Sequence_gp_Trsf): void;

  // NCollection_Sequence_gp_Trsf.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: gp_Trsf): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;

  // NCollection_Sequence_gp_Trsf.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;
  InsertAfter(theIndex: number, theItem: gp_Trsf): void;

  // NCollection_Sequence_gp_Trsf.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;

  // NCollection_Sequence_gp_Trsf.First (method)
  First(): gp_Trsf;

  // NCollection_Sequence_gp_Trsf.ChangeFirst (method)
  ChangeFirst(): gp_Trsf;

  // NCollection_Sequence_gp_Trsf.Last (method)
  Last(): gp_Trsf;

  // NCollection_Sequence_gp_Trsf.ChangeLast (method)
  ChangeLast(): gp_Trsf;

  // NCollection_Sequence_gp_Trsf.Value (method)
  Value(theIndex: number): gp_Trsf;

  // NCollection_Sequence_gp_Trsf.ChangeValue (method)
  ChangeValue(theIndex: number): gp_Trsf;

  // NCollection_Sequence_gp_Trsf.SetValue (method)
  SetValue(theIndex: number, theItem: gp_Trsf): void;

  // NCollection_Sequence_gp_Trsf.At (method)
  At(theIndex: number): gp_Trsf;

  // NCollection_Sequence_gp_Trsf.ChangeAt (method)
  ChangeAt(theIndex: number): gp_Trsf;

  // NCollection_Sequence_gp_Trsf.delete (method)
  delete(): void;

  // NCollection_Sequence_gp_Trsf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_gp_XY: declare class NCollection_Sequence_gp_XY extends NCollection_BaseSequence

  // NCollection_Sequence_gp_XY.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_gp_XY);

  // NCollection_Sequence_gp_XY.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_gp_XY.Upper (method)
  Upper(): number;

  // NCollection_Sequence_gp_XY.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_gp_XY.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_gp_XY.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_gp_XY.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_gp_XY.Assign (method)
  Assign(theOther: NCollection_Sequence_gp_XY): NCollection_Sequence_gp_XY;

  // NCollection_Sequence_gp_XY.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_gp_XY.Append (method)
  Append(theItem: gp_XY): void;
  Append(theSeq: NCollection_Sequence_gp_XY): void;

  // NCollection_Sequence_gp_XY.Prepend (method)
  Prepend(theItem: gp_XY): void;
  Prepend(theSeq: NCollection_Sequence_gp_XY): void;

  // NCollection_Sequence_gp_XY.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: gp_XY): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;

  // NCollection_Sequence_gp_XY.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;
  InsertAfter(theIndex: number, theItem: gp_XY): void;

  // NCollection_Sequence_gp_XY.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;

  // NCollection_Sequence_gp_XY.First (method)
  First(): gp_XY;

  // NCollection_Sequence_gp_XY.ChangeFirst (method)
  ChangeFirst(): gp_XY;

  // NCollection_Sequence_gp_XY.Last (method)
  Last(): gp_XY;

  // NCollection_Sequence_gp_XY.ChangeLast (method)
  ChangeLast(): gp_XY;

  // NCollection_Sequence_gp_XY.Value (method)
  Value(theIndex: number): gp_XY;

  // NCollection_Sequence_gp_XY.ChangeValue (method)
  ChangeValue(theIndex: number): gp_XY;

  // NCollection_Sequence_gp_XY.SetValue (method)
  SetValue(theIndex: number, theItem: gp_XY): void;

  // NCollection_Sequence_gp_XY.At (method)
  At(theIndex: number): gp_XY;

  // NCollection_Sequence_gp_XY.ChangeAt (method)
  ChangeAt(theIndex: number): gp_XY;

  // NCollection_Sequence_gp_XY.delete (method)
  delete(): void;

  // NCollection_Sequence_gp_XY.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_ChFiDS_SurfData: declare class NCollection_Sequence_handle_ChFiDS_SurfData extends NCollection_BaseSequence

  // NCollection_Sequence_handle_ChFiDS_SurfData.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_ChFiDS_SurfData);

  // NCollection_Sequence_handle_ChFiDS_SurfData.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_ChFiDS_SurfData.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_ChFiDS_SurfData): NCollection_Sequence_handle_ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Append (method)
  Append(theItem: ChFiDS_SurfData): void;
  Append(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Prepend (method)
  Prepend(theItem: ChFiDS_SurfData): void;
  Prepend(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: ChFiDS_SurfData): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
  InsertAfter(theIndex: number, theItem: ChFiDS_SurfData): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.First (method)
  First(): ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.ChangeFirst (method)
  ChangeFirst(): ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Last (method)
  Last(): ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.ChangeLast (method)
  ChangeLast(): ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.Value (method)
  Value(theIndex: number): ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.ChangeValue (method)
  ChangeValue(theIndex: number): ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.SetValue (method)
  SetValue(theIndex: number, theItem: ChFiDS_SurfData): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.At (method)
  At(theIndex: number): ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.ChangeAt (method)
  ChangeAt(theIndex: number): ChFiDS_SurfData;

  // NCollection_Sequence_handle_ChFiDS_SurfData.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_ChFiDS_SurfData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Expr_GeneralExpression: declare class NCollection_Sequence_handle_Expr_GeneralExpression extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Expr_GeneralExpression.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Expr_GeneralExpression);

  // NCollection_Sequence_handle_Expr_GeneralExpression.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Expr_GeneralExpression.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Expr_GeneralExpression): NCollection_Sequence_handle_Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Append (method)
  Append(theItem: Expr_GeneralExpression): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Prepend (method)
  Prepend(theItem: Expr_GeneralExpression): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Expr_GeneralExpression): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
  InsertAfter(theIndex: number, theItem: Expr_GeneralExpression): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.First (method)
  First(): Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.ChangeFirst (method)
  ChangeFirst(): Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Last (method)
  Last(): Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.ChangeLast (method)
  ChangeLast(): Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.Value (method)
  Value(theIndex: number): Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.ChangeValue (method)
  ChangeValue(theIndex: number): Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.SetValue (method)
  SetValue(theIndex: number, theItem: Expr_GeneralExpression): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.At (method)
  At(theIndex: number): Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.ChangeAt (method)
  ChangeAt(theIndex: number): Expr_GeneralExpression;

  // NCollection_Sequence_handle_Expr_GeneralExpression.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Expr_GeneralExpression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
