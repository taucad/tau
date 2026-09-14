# libcascade — NCollection (27)

11 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif: declare class NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: XCAFDimTolObjects_DatumSingleModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
  Append(theItem: XCAFDimTolObjects_DatumSingleModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  Prepend(theItem: XCAFDimTolObjects_DatumSingleModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
  Prepend(theItem: XCAFDimTolObjects_DatumSingleModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  First(): XCAFDimTolObjects_DatumSingleModif;

  ChangeFirst(): XCAFDimTolObjects_DatumSingleModif;

  Last(): XCAFDimTolObjects_DatumSingleModif;

  ChangeLast(): XCAFDimTolObjects_DatumSingleModif;

  Value(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

  ChangeValue(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

  SetValue(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;

  At(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

  ChangeAt(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_XCAFDimTolObjects_DimensionModif: declare class NCollection_Sequence_XCAFDimTolObjects_DimensionModif extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): NCollection_Sequence_XCAFDimTolObjects_DimensionModif;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: XCAFDimTolObjects_DimensionModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
  Append(theItem: XCAFDimTolObjects_DimensionModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  Prepend(theItem: XCAFDimTolObjects_DimensionModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
  Prepend(theItem: XCAFDimTolObjects_DimensionModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  First(): XCAFDimTolObjects_DimensionModif;

  ChangeFirst(): XCAFDimTolObjects_DimensionModif;

  Last(): XCAFDimTolObjects_DimensionModif;

  ChangeLast(): XCAFDimTolObjects_DimensionModif;

  Value(theIndex: number): XCAFDimTolObjects_DimensionModif;

  ChangeValue(theIndex: number): XCAFDimTolObjects_DimensionModif;

  SetValue(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;

  At(theIndex: number): XCAFDimTolObjects_DimensionModif;

  ChangeAt(theIndex: number): XCAFDimTolObjects_DimensionModif;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif: declare class NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
  Append(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  Prepend(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
  Prepend(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  First(): XCAFDimTolObjects_GeomToleranceModif;

  ChangeFirst(): XCAFDimTolObjects_GeomToleranceModif;

  Last(): XCAFDimTolObjects_GeomToleranceModif;

  ChangeLast(): XCAFDimTolObjects_GeomToleranceModif;

  Value(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

  ChangeValue(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

  SetValue(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;

  At(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

  ChangeAt(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_bool: declare class NCollection_Sequence_bool extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_bool): NCollection_Sequence_bool;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: boolean): void;
  Append(theSeq: NCollection_Sequence_bool): void;
  Append(theItem: boolean): void;
  Append(theSeq: NCollection_Sequence_bool): void;

  Prepend(theItem: boolean): void;
  Prepend(theSeq: NCollection_Sequence_bool): void;
  Prepend(theItem: boolean): void;
  Prepend(theSeq: NCollection_Sequence_bool): void;

  InsertBefore(theIndex: number, theItem: boolean): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_bool): void;
  InsertBefore(theIndex: number, theItem: boolean): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_bool): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_bool): void;
  InsertAfter(theIndex: number, theItem: boolean): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_bool): void;
  InsertAfter(theIndex: number, theItem: boolean): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_bool): void;

  First(): boolean;

  ChangeFirst(): boolean;

  Last(): boolean;

  ChangeLast(): boolean;

  Value(theIndex: number): boolean;

  ChangeValue(theIndex: number): boolean;

  SetValue(theIndex: number, theItem: boolean): void;

  At(theIndex: number): boolean;

  ChangeAt(theIndex: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_double: declare class NCollection_Sequence_double extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_double): NCollection_Sequence_double;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: number): void;
  Append(theSeq: NCollection_Sequence_double): void;
  Append(theItem: number): void;
  Append(theSeq: NCollection_Sequence_double): void;

  Prepend(theItem: number): void;
  Prepend(theSeq: NCollection_Sequence_double): void;
  Prepend(theItem: number): void;
  Prepend(theSeq: NCollection_Sequence_double): void;

  InsertBefore(theIndex: number, theItem: number): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_double): void;
  InsertBefore(theIndex: number, theItem: number): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_double): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_double): void;
  InsertAfter(theIndex: number, theItem: number): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_double): void;
  InsertAfter(theIndex: number, theItem: number): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_double): void;

  First(): number;

  ChangeFirst(): number;

  Last(): number;

  ChangeLast(): number;

  Value(theIndex: number): number;

  ChangeValue(theIndex: number): number;

  SetValue(theIndex: number, theItem: number): void;

  At(theIndex: number): number;

  ChangeAt(theIndex: number): number;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_gp_Pnt: declare class NCollection_Sequence_gp_Pnt extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_gp_Pnt): NCollection_Sequence_gp_Pnt;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: gp_Pnt): void;
  Append(theSeq: NCollection_Sequence_gp_Pnt): void;
  Append(theItem: gp_Pnt): void;
  Append(theSeq: NCollection_Sequence_gp_Pnt): void;

  Prepend(theItem: gp_Pnt): void;
  Prepend(theSeq: NCollection_Sequence_gp_Pnt): void;
  Prepend(theItem: gp_Pnt): void;
  Prepend(theSeq: NCollection_Sequence_gp_Pnt): void;

  InsertBefore(theIndex: number, theItem: gp_Pnt): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;
  InsertBefore(theIndex: number, theItem: gp_Pnt): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;
  InsertAfter(theIndex: number, theItem: gp_Pnt): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;
  InsertAfter(theIndex: number, theItem: gp_Pnt): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;

  First(): gp_Pnt;

  ChangeFirst(): gp_Pnt;

  Last(): gp_Pnt;

  ChangeLast(): gp_Pnt;

  Value(theIndex: number): gp_Pnt;

  ChangeValue(theIndex: number): gp_Pnt;

  SetValue(theIndex: number, theItem: gp_Pnt): void;

  At(theIndex: number): gp_Pnt;

  ChangeAt(theIndex: number): gp_Pnt;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_gp_Pnt2d: declare class NCollection_Sequence_gp_Pnt2d extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_gp_Pnt2d): NCollection_Sequence_gp_Pnt2d;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: gp_Pnt2d): void;
  Append(theSeq: NCollection_Sequence_gp_Pnt2d): void;
  Append(theItem: gp_Pnt2d): void;
  Append(theSeq: NCollection_Sequence_gp_Pnt2d): void;

  Prepend(theItem: gp_Pnt2d): void;
  Prepend(theSeq: NCollection_Sequence_gp_Pnt2d): void;
  Prepend(theItem: gp_Pnt2d): void;
  Prepend(theSeq: NCollection_Sequence_gp_Pnt2d): void;

  InsertBefore(theIndex: number, theItem: gp_Pnt2d): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;
  InsertBefore(theIndex: number, theItem: gp_Pnt2d): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;
  InsertAfter(theIndex: number, theItem: gp_Pnt2d): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;
  InsertAfter(theIndex: number, theItem: gp_Pnt2d): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;

  First(): gp_Pnt2d;

  ChangeFirst(): gp_Pnt2d;

  Last(): gp_Pnt2d;

  ChangeLast(): gp_Pnt2d;

  Value(theIndex: number): gp_Pnt2d;

  ChangeValue(theIndex: number): gp_Pnt2d;

  SetValue(theIndex: number, theItem: gp_Pnt2d): void;

  At(theIndex: number): gp_Pnt2d;

  ChangeAt(theIndex: number): gp_Pnt2d;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_gp_Trsf: declare class NCollection_Sequence_gp_Trsf extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_gp_Trsf): NCollection_Sequence_gp_Trsf;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: gp_Trsf): void;
  Append(theSeq: NCollection_Sequence_gp_Trsf): void;
  Append(theItem: gp_Trsf): void;
  Append(theSeq: NCollection_Sequence_gp_Trsf): void;

  Prepend(theItem: gp_Trsf): void;
  Prepend(theSeq: NCollection_Sequence_gp_Trsf): void;
  Prepend(theItem: gp_Trsf): void;
  Prepend(theSeq: NCollection_Sequence_gp_Trsf): void;

  InsertBefore(theIndex: number, theItem: gp_Trsf): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;
  InsertBefore(theIndex: number, theItem: gp_Trsf): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;
  InsertAfter(theIndex: number, theItem: gp_Trsf): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;
  InsertAfter(theIndex: number, theItem: gp_Trsf): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;

  First(): gp_Trsf;

  ChangeFirst(): gp_Trsf;

  Last(): gp_Trsf;

  ChangeLast(): gp_Trsf;

  Value(theIndex: number): gp_Trsf;

  ChangeValue(theIndex: number): gp_Trsf;

  SetValue(theIndex: number, theItem: gp_Trsf): void;

  At(theIndex: number): gp_Trsf;

  ChangeAt(theIndex: number): gp_Trsf;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_gp_XY: declare class NCollection_Sequence_gp_XY extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_gp_XY): NCollection_Sequence_gp_XY;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: gp_XY): void;
  Append(theSeq: NCollection_Sequence_gp_XY): void;
  Append(theItem: gp_XY): void;
  Append(theSeq: NCollection_Sequence_gp_XY): void;

  Prepend(theItem: gp_XY): void;
  Prepend(theSeq: NCollection_Sequence_gp_XY): void;
  Prepend(theItem: gp_XY): void;
  Prepend(theSeq: NCollection_Sequence_gp_XY): void;

  InsertBefore(theIndex: number, theItem: gp_XY): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;
  InsertBefore(theIndex: number, theItem: gp_XY): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;
  InsertAfter(theIndex: number, theItem: gp_XY): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;
  InsertAfter(theIndex: number, theItem: gp_XY): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;

  First(): gp_XY;

  ChangeFirst(): gp_XY;

  Last(): gp_XY;

  ChangeLast(): gp_XY;

  Value(theIndex: number): gp_XY;

  ChangeValue(theIndex: number): gp_XY;

  SetValue(theIndex: number, theItem: gp_XY): void;

  At(theIndex: number): gp_XY;

  ChangeAt(theIndex: number): gp_XY;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_ChFiDS_SurfData: declare class NCollection_Sequence_handle_ChFiDS_SurfData extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_ChFiDS_SurfData): NCollection_Sequence_handle_ChFiDS_SurfData;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: ChFiDS_SurfData): void;
  Append(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
  Append(theItem: ChFiDS_SurfData): void;
  Append(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

  Prepend(theItem: ChFiDS_SurfData): void;
  Prepend(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
  Prepend(theItem: ChFiDS_SurfData): void;
  Prepend(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

  InsertBefore(theIndex: number, theItem: ChFiDS_SurfData): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
  InsertBefore(theIndex: number, theItem: ChFiDS_SurfData): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
  InsertAfter(theIndex: number, theItem: ChFiDS_SurfData): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
  InsertAfter(theIndex: number, theItem: ChFiDS_SurfData): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

  First(): ChFiDS_SurfData;

  ChangeFirst(): ChFiDS_SurfData;

  Last(): ChFiDS_SurfData;

  ChangeLast(): ChFiDS_SurfData;

  Value(theIndex: number): ChFiDS_SurfData;

  ChangeValue(theIndex: number): ChFiDS_SurfData;

  SetValue(theIndex: number, theItem: ChFiDS_SurfData): void;

  At(theIndex: number): ChFiDS_SurfData;

  ChangeAt(theIndex: number): ChFiDS_SurfData;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Expr_GeneralExpression: declare class NCollection_Sequence_handle_Expr_GeneralExpression extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Expr_GeneralExpression): NCollection_Sequence_handle_Expr_GeneralExpression;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Expr_GeneralExpression): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
  Append(theItem: Expr_GeneralExpression): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

  Prepend(theItem: Expr_GeneralExpression): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
  Prepend(theItem: Expr_GeneralExpression): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

  InsertBefore(theIndex: number, theItem: Expr_GeneralExpression): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
  InsertBefore(theIndex: number, theItem: Expr_GeneralExpression): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
  InsertAfter(theIndex: number, theItem: Expr_GeneralExpression): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
  InsertAfter(theIndex: number, theItem: Expr_GeneralExpression): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

  First(): Expr_GeneralExpression;

  ChangeFirst(): Expr_GeneralExpression;

  Last(): Expr_GeneralExpression;

  ChangeLast(): Expr_GeneralExpression;

  Value(theIndex: number): Expr_GeneralExpression;

  ChangeValue(theIndex: number): Expr_GeneralExpression;

  SetValue(theIndex: number, theItem: Expr_GeneralExpression): void;

  At(theIndex: number): Expr_GeneralExpression;

  ChangeAt(theIndex: number): Expr_GeneralExpression;

  delete(): void;

  [Symbol.dispose](): void;
