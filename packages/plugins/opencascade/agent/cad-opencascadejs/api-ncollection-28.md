# libcascade — NCollection (28)

13 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_IntSurf_PathPoint: declare class NCollection_Sequence_IntSurf_PathPoint extends NCollection_BaseSequence

  // NCollection_Sequence_IntSurf_PathPoint.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: unknown);

  // NCollection_Sequence_IntSurf_PathPoint.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_IntSurf_PathPoint.Upper (method)
  Upper(): number;

  // NCollection_Sequence_IntSurf_PathPoint.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_IntSurf_PathPoint.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_IntSurf_PathPoint.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_IntSurf_PathPoint.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_IntSurf_PathPoint.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_Sequence_IntSurf_PathPoint.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_IntSurf_PathPoint.Append (method)
  Append(theItem: IntSurf_PathPoint): void;
  Append(theSeq: unknown): void;

  // NCollection_Sequence_IntSurf_PathPoint.Prepend (method)
  Prepend(theItem: IntSurf_PathPoint): void;
  Prepend(theSeq: unknown): void;

  // NCollection_Sequence_IntSurf_PathPoint.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: IntSurf_PathPoint): void;
  InsertBefore(theIndex: number, theSeq: unknown): void;

  // NCollection_Sequence_IntSurf_PathPoint.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: unknown): void;
  InsertAfter(theIndex: number, theItem: IntSurf_PathPoint): void;

  // NCollection_Sequence_IntSurf_PathPoint.Split (method)
  Split(theIndex: number, theSeq: unknown): void;

  // NCollection_Sequence_IntSurf_PathPoint.First (method)
  First(): IntSurf_PathPoint;

  // NCollection_Sequence_IntSurf_PathPoint.ChangeFirst (method)
  ChangeFirst(): IntSurf_PathPoint;

  // NCollection_Sequence_IntSurf_PathPoint.Last (method)
  Last(): IntSurf_PathPoint;

  // NCollection_Sequence_IntSurf_PathPoint.ChangeLast (method)
  ChangeLast(): IntSurf_PathPoint;

  // NCollection_Sequence_IntSurf_PathPoint.Value (method)
  Value(theIndex: number): IntSurf_PathPoint;

  // NCollection_Sequence_IntSurf_PathPoint.ChangeValue (method)
  ChangeValue(theIndex: number): IntSurf_PathPoint;

  // NCollection_Sequence_IntSurf_PathPoint.SetValue (method)
  SetValue(theIndex: number, theItem: IntSurf_PathPoint): void;

  // NCollection_Sequence_IntSurf_PathPoint.At (method)
  At(theIndex: number): IntSurf_PathPoint;

  // NCollection_Sequence_IntSurf_PathPoint.ChangeAt (method)
  ChangeAt(theIndex: number): IntSurf_PathPoint;

  // NCollection_Sequence_IntSurf_PathPoint.delete (method)
  delete(): void;

  // NCollection_Sequence_IntSurf_PathPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_IntTools_CommonPrt: declare class NCollection_Sequence_IntTools_CommonPrt extends NCollection_BaseSequence

  // NCollection_Sequence_IntTools_CommonPrt.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_IntTools_CommonPrt);

  // NCollection_Sequence_IntTools_CommonPrt.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_IntTools_CommonPrt.Upper (method)
  Upper(): number;

  // NCollection_Sequence_IntTools_CommonPrt.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_IntTools_CommonPrt.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_IntTools_CommonPrt.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_IntTools_CommonPrt.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_IntTools_CommonPrt.Assign (method)
  Assign(theOther: NCollection_Sequence_IntTools_CommonPrt): NCollection_Sequence_IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_IntTools_CommonPrt.Append (method)
  Append(theItem: IntTools_CommonPrt): void;
  Append(theSeq: NCollection_Sequence_IntTools_CommonPrt): void;

  // NCollection_Sequence_IntTools_CommonPrt.Prepend (method)
  Prepend(theItem: IntTools_CommonPrt): void;
  Prepend(theSeq: NCollection_Sequence_IntTools_CommonPrt): void;

  // NCollection_Sequence_IntTools_CommonPrt.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: IntTools_CommonPrt): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_CommonPrt): void;

  // NCollection_Sequence_IntTools_CommonPrt.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_CommonPrt): void;
  InsertAfter(theIndex: number, theItem: IntTools_CommonPrt): void;

  // NCollection_Sequence_IntTools_CommonPrt.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_CommonPrt): void;

  // NCollection_Sequence_IntTools_CommonPrt.First (method)
  First(): IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.ChangeFirst (method)
  ChangeFirst(): IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.Last (method)
  Last(): IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.ChangeLast (method)
  ChangeLast(): IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.Value (method)
  Value(theIndex: number): IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.ChangeValue (method)
  ChangeValue(theIndex: number): IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.SetValue (method)
  SetValue(theIndex: number, theItem: IntTools_CommonPrt): void;

  // NCollection_Sequence_IntTools_CommonPrt.At (method)
  At(theIndex: number): IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.ChangeAt (method)
  ChangeAt(theIndex: number): IntTools_CommonPrt;

  // NCollection_Sequence_IntTools_CommonPrt.delete (method)
  delete(): void;

  // NCollection_Sequence_IntTools_CommonPrt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_IntTools_Curve: declare class NCollection_Sequence_IntTools_Curve extends NCollection_BaseSequence

  // NCollection_Sequence_IntTools_Curve.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_IntTools_Curve);

  // NCollection_Sequence_IntTools_Curve.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_IntTools_Curve.Upper (method)
  Upper(): number;

  // NCollection_Sequence_IntTools_Curve.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_IntTools_Curve.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_IntTools_Curve.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_IntTools_Curve.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_IntTools_Curve.Assign (method)
  Assign(theOther: NCollection_Sequence_IntTools_Curve): NCollection_Sequence_IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_IntTools_Curve.Append (method)
  Append(theItem: IntTools_Curve): void;
  Append(theSeq: NCollection_Sequence_IntTools_Curve): void;

  // NCollection_Sequence_IntTools_Curve.Prepend (method)
  Prepend(theItem: IntTools_Curve): void;
  Prepend(theSeq: NCollection_Sequence_IntTools_Curve): void;

  // NCollection_Sequence_IntTools_Curve.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: IntTools_Curve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Curve): void;

  // NCollection_Sequence_IntTools_Curve.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Curve): void;
  InsertAfter(theIndex: number, theItem: IntTools_Curve): void;

  // NCollection_Sequence_IntTools_Curve.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_Curve): void;

  // NCollection_Sequence_IntTools_Curve.First (method)
  First(): IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.ChangeFirst (method)
  ChangeFirst(): IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.Last (method)
  Last(): IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.ChangeLast (method)
  ChangeLast(): IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.Value (method)
  Value(theIndex: number): IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.ChangeValue (method)
  ChangeValue(theIndex: number): IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.SetValue (method)
  SetValue(theIndex: number, theItem: IntTools_Curve): void;

  // NCollection_Sequence_IntTools_Curve.At (method)
  At(theIndex: number): IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.ChangeAt (method)
  ChangeAt(theIndex: number): IntTools_Curve;

  // NCollection_Sequence_IntTools_Curve.delete (method)
  delete(): void;

  // NCollection_Sequence_IntTools_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_IntTools_PntOn2Faces: declare class NCollection_Sequence_IntTools_PntOn2Faces extends NCollection_BaseSequence

  // NCollection_Sequence_IntTools_PntOn2Faces.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_IntTools_PntOn2Faces);

  // NCollection_Sequence_IntTools_PntOn2Faces.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_IntTools_PntOn2Faces.Upper (method)
  Upper(): number;

  // NCollection_Sequence_IntTools_PntOn2Faces.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_IntTools_PntOn2Faces.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.Assign (method)
  Assign(theOther: NCollection_Sequence_IntTools_PntOn2Faces): NCollection_Sequence_IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.Append (method)
  Append(theItem: IntTools_PntOn2Faces): void;
  Append(theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.Prepend (method)
  Prepend(theItem: IntTools_PntOn2Faces): void;
  Prepend(theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: IntTools_PntOn2Faces): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;
  InsertAfter(theIndex: number, theItem: IntTools_PntOn2Faces): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.First (method)
  First(): IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.ChangeFirst (method)
  ChangeFirst(): IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.Last (method)
  Last(): IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.ChangeLast (method)
  ChangeLast(): IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.Value (method)
  Value(theIndex: number): IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.ChangeValue (method)
  ChangeValue(theIndex: number): IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.SetValue (method)
  SetValue(theIndex: number, theItem: IntTools_PntOn2Faces): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.At (method)
  At(theIndex: number): IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.ChangeAt (method)
  ChangeAt(theIndex: number): IntTools_PntOn2Faces;

  // NCollection_Sequence_IntTools_PntOn2Faces.delete (method)
  delete(): void;

  // NCollection_Sequence_IntTools_PntOn2Faces.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_IntTools_Range: declare class NCollection_Sequence_IntTools_Range extends NCollection_BaseSequence

  // NCollection_Sequence_IntTools_Range.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_IntTools_Range);

  // NCollection_Sequence_IntTools_Range.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_IntTools_Range.Upper (method)
  Upper(): number;

  // NCollection_Sequence_IntTools_Range.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_IntTools_Range.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_IntTools_Range.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_IntTools_Range.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_IntTools_Range.Assign (method)
  Assign(theOther: NCollection_Sequence_IntTools_Range): NCollection_Sequence_IntTools_Range;

  // NCollection_Sequence_IntTools_Range.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_IntTools_Range.Append (method)
  Append(theItem: IntTools_Range): void;
  Append(theSeq: NCollection_Sequence_IntTools_Range): void;

  // NCollection_Sequence_IntTools_Range.Prepend (method)
  Prepend(theItem: IntTools_Range): void;
  Prepend(theSeq: NCollection_Sequence_IntTools_Range): void;

  // NCollection_Sequence_IntTools_Range.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: IntTools_Range): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Range): void;

  // NCollection_Sequence_IntTools_Range.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Range): void;
  InsertAfter(theIndex: number, theItem: IntTools_Range): void;

  // NCollection_Sequence_IntTools_Range.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_Range): void;

  // NCollection_Sequence_IntTools_Range.First (method)
  First(): IntTools_Range;

  // NCollection_Sequence_IntTools_Range.ChangeFirst (method)
  ChangeFirst(): IntTools_Range;

  // NCollection_Sequence_IntTools_Range.Last (method)
  Last(): IntTools_Range;

  // NCollection_Sequence_IntTools_Range.ChangeLast (method)
  ChangeLast(): IntTools_Range;

  // NCollection_Sequence_IntTools_Range.Value (method)
  Value(theIndex: number): IntTools_Range;

  // NCollection_Sequence_IntTools_Range.ChangeValue (method)
  ChangeValue(theIndex: number): IntTools_Range;

  // NCollection_Sequence_IntTools_Range.SetValue (method)
  SetValue(theIndex: number, theItem: IntTools_Range): void;

  // NCollection_Sequence_IntTools_Range.At (method)
  At(theIndex: number): IntTools_Range;

  // NCollection_Sequence_IntTools_Range.ChangeAt (method)
  ChangeAt(theIndex: number): IntTools_Range;

  // NCollection_Sequence_IntTools_Range.delete (method)
  delete(): void;

  // NCollection_Sequence_IntTools_Range.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_IntTools_Root: declare class NCollection_Sequence_IntTools_Root extends NCollection_BaseSequence

  // NCollection_Sequence_IntTools_Root.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_IntTools_Root);

  // NCollection_Sequence_IntTools_Root.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_IntTools_Root.Upper (method)
  Upper(): number;

  // NCollection_Sequence_IntTools_Root.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_IntTools_Root.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_IntTools_Root.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_IntTools_Root.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_IntTools_Root.Assign (method)
  Assign(theOther: NCollection_Sequence_IntTools_Root): NCollection_Sequence_IntTools_Root;

  // NCollection_Sequence_IntTools_Root.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_IntTools_Root.Append (method)
  Append(theItem: IntTools_Root): void;
  Append(theSeq: NCollection_Sequence_IntTools_Root): void;

  // NCollection_Sequence_IntTools_Root.Prepend (method)
  Prepend(theItem: IntTools_Root): void;
  Prepend(theSeq: NCollection_Sequence_IntTools_Root): void;

  // NCollection_Sequence_IntTools_Root.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: IntTools_Root): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Root): void;

  // NCollection_Sequence_IntTools_Root.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Root): void;
  InsertAfter(theIndex: number, theItem: IntTools_Root): void;

  // NCollection_Sequence_IntTools_Root.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_Root): void;

  // NCollection_Sequence_IntTools_Root.First (method)
  First(): IntTools_Root;

  // NCollection_Sequence_IntTools_Root.ChangeFirst (method)
  ChangeFirst(): IntTools_Root;

  // NCollection_Sequence_IntTools_Root.Last (method)
  Last(): IntTools_Root;

  // NCollection_Sequence_IntTools_Root.ChangeLast (method)
  ChangeLast(): IntTools_Root;

  // NCollection_Sequence_IntTools_Root.Value (method)
  Value(theIndex: number): IntTools_Root;

  // NCollection_Sequence_IntTools_Root.ChangeValue (method)
  ChangeValue(theIndex: number): IntTools_Root;

  // NCollection_Sequence_IntTools_Root.SetValue (method)
  SetValue(theIndex: number, theItem: IntTools_Root): void;

  // NCollection_Sequence_IntTools_Root.At (method)
  At(theIndex: number): IntTools_Root;

  // NCollection_Sequence_IntTools_Root.ChangeAt (method)
  ChangeAt(theIndex: number): IntTools_Root;

  // NCollection_Sequence_IntTools_Root.delete (method)
  delete(): void;

  // NCollection_Sequence_IntTools_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry: declare class NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry extends NCollection_BaseSequence

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry);

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Upper (method)
  Upper(): number;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Assign (method)
  Assign(theOther: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Append (method)
  Append(theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
  Append(theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Prepend (method)
  Prepend(theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
  Prepend(theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;
  InsertAfter(theIndex: number, theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.First (method)
  First(): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.ChangeFirst (method)
  ChangeFirst(): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Last (method)
  Last(): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.ChangeLast (method)
  ChangeLast(): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.Value (method)
  Value(theIndex: number): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.ChangeValue (method)
  ChangeValue(theIndex: number): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.SetValue (method)
  SetValue(theIndex: number, theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.At (method)
  At(theIndex: number): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.ChangeAt (method)
  ChangeAt(theIndex: number): NCollection_Sequence_handle_Geom2d_Geometry;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.delete (method)
  delete(): void;

  // NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_PCDM_Reference: declare class NCollection_Sequence_PCDM_Reference extends NCollection_BaseSequence

  // NCollection_Sequence_PCDM_Reference.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_PCDM_Reference);

  // NCollection_Sequence_PCDM_Reference.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_PCDM_Reference.Upper (method)
  Upper(): number;

  // NCollection_Sequence_PCDM_Reference.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_PCDM_Reference.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_PCDM_Reference.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_PCDM_Reference.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_PCDM_Reference.Assign (method)
  Assign(theOther: NCollection_Sequence_PCDM_Reference): NCollection_Sequence_PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_PCDM_Reference.Append (method)
  Append(theItem: PCDM_Reference): void;
  Append(theSeq: NCollection_Sequence_PCDM_Reference): void;

  // NCollection_Sequence_PCDM_Reference.Prepend (method)
  Prepend(theItem: PCDM_Reference): void;
  Prepend(theSeq: NCollection_Sequence_PCDM_Reference): void;

  // NCollection_Sequence_PCDM_Reference.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: PCDM_Reference): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_PCDM_Reference): void;

  // NCollection_Sequence_PCDM_Reference.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_PCDM_Reference): void;
  InsertAfter(theIndex: number, theItem: PCDM_Reference): void;

  // NCollection_Sequence_PCDM_Reference.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_PCDM_Reference): void;

  // NCollection_Sequence_PCDM_Reference.First (method)
  First(): PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.ChangeFirst (method)
  ChangeFirst(): PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.Last (method)
  Last(): PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.ChangeLast (method)
  ChangeLast(): PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.Value (method)
  Value(theIndex: number): PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.ChangeValue (method)
  ChangeValue(theIndex: number): PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.SetValue (method)
  SetValue(theIndex: number, theItem: PCDM_Reference): void;

  // NCollection_Sequence_PCDM_Reference.At (method)
  At(theIndex: number): PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.ChangeAt (method)
  ChangeAt(theIndex: number): PCDM_Reference;

  // NCollection_Sequence_PCDM_Reference.delete (method)
  delete(): void;

  // NCollection_Sequence_PCDM_Reference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_Plate_PinpointConstraint: declare class NCollection_Sequence_Plate_PinpointConstraint extends NCollection_BaseSequence

  // NCollection_Sequence_Plate_PinpointConstraint.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_Plate_PinpointConstraint);

  // NCollection_Sequence_Plate_PinpointConstraint.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_Plate_PinpointConstraint.Upper (method)
  Upper(): number;

  // NCollection_Sequence_Plate_PinpointConstraint.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_Plate_PinpointConstraint.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_Plate_PinpointConstraint.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_Plate_PinpointConstraint.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_Plate_PinpointConstraint.Assign (method)
  Assign(theOther: NCollection_Sequence_Plate_PinpointConstraint): NCollection_Sequence_Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_Plate_PinpointConstraint.Append (method)
  Append(theItem: Plate_PinpointConstraint): void;
  Append(theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;

  // NCollection_Sequence_Plate_PinpointConstraint.Prepend (method)
  Prepend(theItem: Plate_PinpointConstraint): void;
  Prepend(theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;

  // NCollection_Sequence_Plate_PinpointConstraint.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Plate_PinpointConstraint): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;

  // NCollection_Sequence_Plate_PinpointConstraint.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;
  InsertAfter(theIndex: number, theItem: Plate_PinpointConstraint): void;

  // NCollection_Sequence_Plate_PinpointConstraint.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;

  // NCollection_Sequence_Plate_PinpointConstraint.First (method)
  First(): Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.ChangeFirst (method)
  ChangeFirst(): Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.Last (method)
  Last(): Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.ChangeLast (method)
  ChangeLast(): Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.Value (method)
  Value(theIndex: number): Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.ChangeValue (method)
  ChangeValue(theIndex: number): Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.SetValue (method)
  SetValue(theIndex: number, theItem: Plate_PinpointConstraint): void;

  // NCollection_Sequence_Plate_PinpointConstraint.At (method)
  At(theIndex: number): Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.ChangeAt (method)
  ChangeAt(theIndex: number): Plate_PinpointConstraint;

  // NCollection_Sequence_Plate_PinpointConstraint.delete (method)
  delete(): void;

  // NCollection_Sequence_Plate_PinpointConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_RWGltf_GltfPrimArrayData: declare class NCollection_Sequence_RWGltf_GltfPrimArrayData extends NCollection_BaseSequence

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_RWGltf_GltfPrimArrayData);

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Upper (method)
  Upper(): number;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Assign (method)
  Assign(theOther: NCollection_Sequence_RWGltf_GltfPrimArrayData): NCollection_Sequence_RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Append (method)
  Append(theItem: RWGltf_GltfPrimArrayData): void;
  Append(theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Prepend (method)
  Prepend(theItem: RWGltf_GltfPrimArrayData): void;
  Prepend(theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: RWGltf_GltfPrimArrayData): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;
  InsertAfter(theIndex: number, theItem: RWGltf_GltfPrimArrayData): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.First (method)
  First(): RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.ChangeFirst (method)
  ChangeFirst(): RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Last (method)
  Last(): RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.ChangeLast (method)
  ChangeLast(): RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.Value (method)
  Value(theIndex: number): RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.ChangeValue (method)
  ChangeValue(theIndex: number): RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.SetValue (method)
  SetValue(theIndex: number, theItem: RWGltf_GltfPrimArrayData): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.At (method)
  At(theIndex: number): RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.ChangeAt (method)
  ChangeAt(theIndex: number): RWGltf_GltfPrimArrayData;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.delete (method)
  delete(): void;

  // NCollection_Sequence_RWGltf_GltfPrimArrayData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_ShapeFix_WireSegment: declare class NCollection_Sequence_ShapeFix_WireSegment extends NCollection_BaseSequence

  // NCollection_Sequence_ShapeFix_WireSegment.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_ShapeFix_WireSegment);

  // NCollection_Sequence_ShapeFix_WireSegment.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_ShapeFix_WireSegment.Upper (method)
  Upper(): number;

  // NCollection_Sequence_ShapeFix_WireSegment.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_ShapeFix_WireSegment.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_ShapeFix_WireSegment.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_ShapeFix_WireSegment.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_ShapeFix_WireSegment.Assign (method)
  Assign(theOther: NCollection_Sequence_ShapeFix_WireSegment): NCollection_Sequence_ShapeFix_WireSegment;

  // NCollection_Sequence_ShapeFix_WireSegment.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_ShapeFix_WireSegment.Append (method)
  Append(theItem: unknown): void;
  Append(theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;

  // NCollection_Sequence_ShapeFix_WireSegment.Prepend (method)
  Prepend(theItem: unknown): void;
  Prepend(theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;

  // NCollection_Sequence_ShapeFix_WireSegment.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: unknown): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;

  // NCollection_Sequence_ShapeFix_WireSegment.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;
  InsertAfter(theIndex: number, theItem: unknown): void;

  // NCollection_Sequence_ShapeFix_WireSegment.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;

  // NCollection_Sequence_ShapeFix_WireSegment.First (method)
  First(): unknown;

  // NCollection_Sequence_ShapeFix_WireSegment.ChangeFirst (method)
  ChangeFirst(): unknown;

  // NCollection_Sequence_ShapeFix_WireSegment.Last (method)
  Last(): unknown;

  // NCollection_Sequence_ShapeFix_WireSegment.ChangeLast (method)
  ChangeLast(): unknown;

  // NCollection_Sequence_ShapeFix_WireSegment.Value (method)
  Value(theIndex: number): unknown;

  // NCollection_Sequence_ShapeFix_WireSegment.ChangeValue (method)
  ChangeValue(theIndex: number): unknown;

  // NCollection_Sequence_ShapeFix_WireSegment.SetValue (method)
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Sequence_ShapeFix_WireSegment.At (method)
  At(theIndex: number): unknown;

  // NCollection_Sequence_ShapeFix_WireSegment.ChangeAt (method)
  ChangeAt(theIndex: number): unknown;

  // NCollection_Sequence_ShapeFix_WireSegment.delete (method)
  delete(): void;

  // NCollection_Sequence_ShapeFix_WireSegment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_TCollection_AsciiString: declare class NCollection_Sequence_TCollection_AsciiString extends NCollection_BaseSequence

  // NCollection_Sequence_TCollection_AsciiString.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_TCollection_AsciiString);

  // NCollection_Sequence_TCollection_AsciiString.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_TCollection_AsciiString.Upper (method)
  Upper(): number;

  // NCollection_Sequence_TCollection_AsciiString.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_TCollection_AsciiString.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_TCollection_AsciiString.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_TCollection_AsciiString.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_TCollection_AsciiString.Assign (method)
  Assign(theOther: NCollection_Sequence_TCollection_AsciiString): NCollection_Sequence_TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_TCollection_AsciiString.Append (method)
  Append(theItem: TCollection_AsciiString): void;
  Append(theSeq: NCollection_Sequence_TCollection_AsciiString): void;

  // NCollection_Sequence_TCollection_AsciiString.Prepend (method)
  Prepend(theItem: TCollection_AsciiString): void;
  Prepend(theSeq: NCollection_Sequence_TCollection_AsciiString): void;

  // NCollection_Sequence_TCollection_AsciiString.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TCollection_AsciiString): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;

  // NCollection_Sequence_TCollection_AsciiString.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;
  InsertAfter(theIndex: number, theItem: TCollection_AsciiString): void;

  // NCollection_Sequence_TCollection_AsciiString.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;

  // NCollection_Sequence_TCollection_AsciiString.First (method)
  First(): TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.ChangeFirst (method)
  ChangeFirst(): TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.Last (method)
  Last(): TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.ChangeLast (method)
  ChangeLast(): TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.Value (method)
  Value(theIndex: number): TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.ChangeValue (method)
  ChangeValue(theIndex: number): TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.SetValue (method)
  SetValue(theIndex: number, theItem: TCollection_AsciiString): void;

  // NCollection_Sequence_TCollection_AsciiString.At (method)
  At(theIndex: number): TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.ChangeAt (method)
  ChangeAt(theIndex: number): TCollection_AsciiString;

  // NCollection_Sequence_TCollection_AsciiString.delete (method)
  delete(): void;

  // NCollection_Sequence_TCollection_AsciiString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_TCollection_ExtendedString: declare class NCollection_Sequence_TCollection_ExtendedString extends NCollection_BaseSequence

  // NCollection_Sequence_TCollection_ExtendedString.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_TCollection_ExtendedString);

  // NCollection_Sequence_TCollection_ExtendedString.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_TCollection_ExtendedString.Upper (method)
  Upper(): number;

  // NCollection_Sequence_TCollection_ExtendedString.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_TCollection_ExtendedString.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_TCollection_ExtendedString.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_TCollection_ExtendedString.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_TCollection_ExtendedString.Assign (method)
  Assign(theOther: NCollection_Sequence_TCollection_ExtendedString): NCollection_Sequence_TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_TCollection_ExtendedString.Append (method)
  Append(theItem: TCollection_ExtendedString): void;
  Append(theSeq: NCollection_Sequence_TCollection_ExtendedString): void;

  // NCollection_Sequence_TCollection_ExtendedString.Prepend (method)
  Prepend(theItem: TCollection_ExtendedString): void;
  Prepend(theSeq: NCollection_Sequence_TCollection_ExtendedString): void;

  // NCollection_Sequence_TCollection_ExtendedString.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TCollection_ExtendedString): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TCollection_ExtendedString): void;

  // NCollection_Sequence_TCollection_ExtendedString.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TCollection_ExtendedString): void;
  InsertAfter(theIndex: number, theItem: TCollection_ExtendedString): void;

  // NCollection_Sequence_TCollection_ExtendedString.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_TCollection_ExtendedString): void;

  // NCollection_Sequence_TCollection_ExtendedString.First (method)
  First(): TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.ChangeFirst (method)
  ChangeFirst(): TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.Last (method)
  Last(): TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.ChangeLast (method)
  ChangeLast(): TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.Value (method)
  Value(theIndex: number): TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.ChangeValue (method)
  ChangeValue(theIndex: number): TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.SetValue (method)
  SetValue(theIndex: number, theItem: TCollection_ExtendedString): void;

  // NCollection_Sequence_TCollection_ExtendedString.At (method)
  At(theIndex: number): TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.ChangeAt (method)
  ChangeAt(theIndex: number): TCollection_ExtendedString;

  // NCollection_Sequence_TCollection_ExtendedString.delete (method)
  delete(): void;

  // NCollection_Sequence_TCollection_ExtendedString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
