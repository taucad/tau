# libcascade — NCollection (28)

11 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_handle_Expr_NamedExpression: declare class NCollection_Sequence_handle_Expr_NamedExpression extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Expr_NamedExpression): NCollection_Sequence_handle_Expr_NamedExpression;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Expr_NamedExpression): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
  Append(theItem: Expr_NamedExpression): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

  Prepend(theItem: Expr_NamedExpression): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
  Prepend(theItem: Expr_NamedExpression): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

  InsertBefore(theIndex: number, theItem: Expr_NamedExpression): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
  InsertBefore(theIndex: number, theItem: Expr_NamedExpression): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
  InsertAfter(theIndex: number, theItem: Expr_NamedExpression): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
  InsertAfter(theIndex: number, theItem: Expr_NamedExpression): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

  First(): Expr_NamedExpression;

  ChangeFirst(): Expr_NamedExpression;

  Last(): Expr_NamedExpression;

  ChangeLast(): Expr_NamedExpression;

  Value(theIndex: number): Expr_NamedExpression;

  ChangeValue(theIndex: number): Expr_NamedExpression;

  SetValue(theIndex: number, theItem: Expr_NamedExpression): void;

  At(theIndex: number): Expr_NamedExpression;

  ChangeAt(theIndex: number): Expr_NamedExpression;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Expr_NamedFunction: declare class NCollection_Sequence_handle_Expr_NamedFunction extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Expr_NamedFunction): NCollection_Sequence_handle_Expr_NamedFunction;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Expr_NamedFunction): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
  Append(theItem: Expr_NamedFunction): void;
  Append(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

  Prepend(theItem: Expr_NamedFunction): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
  Prepend(theItem: Expr_NamedFunction): void;
  Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

  InsertBefore(theIndex: number, theItem: Expr_NamedFunction): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
  InsertBefore(theIndex: number, theItem: Expr_NamedFunction): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
  InsertAfter(theIndex: number, theItem: Expr_NamedFunction): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
  InsertAfter(theIndex: number, theItem: Expr_NamedFunction): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

  First(): Expr_NamedFunction;

  ChangeFirst(): Expr_NamedFunction;

  Last(): Expr_NamedFunction;

  ChangeLast(): Expr_NamedFunction;

  Value(theIndex: number): Expr_NamedFunction;

  ChangeValue(theIndex: number): Expr_NamedFunction;

  SetValue(theIndex: number, theItem: Expr_NamedFunction): void;

  At(theIndex: number): Expr_NamedFunction;

  ChangeAt(theIndex: number): Expr_NamedFunction;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom2d_BoundedCurve: declare class NCollection_Sequence_handle_Geom2d_BoundedCurve extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Geom2d_BoundedCurve): NCollection_Sequence_handle_Geom2d_BoundedCurve;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Geom2d_BoundedCurve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
  Append(theItem: Geom2d_BoundedCurve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

  Prepend(theItem: Geom2d_BoundedCurve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
  Prepend(theItem: Geom2d_BoundedCurve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

  InsertBefore(theIndex: number, theItem: Geom2d_BoundedCurve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
  InsertBefore(theIndex: number, theItem: Geom2d_BoundedCurve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
  InsertAfter(theIndex: number, theItem: Geom2d_BoundedCurve): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
  InsertAfter(theIndex: number, theItem: Geom2d_BoundedCurve): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

  First(): Geom2d_BoundedCurve;

  ChangeFirst(): Geom2d_BoundedCurve;

  Last(): Geom2d_BoundedCurve;

  ChangeLast(): Geom2d_BoundedCurve;

  Value(theIndex: number): Geom2d_BoundedCurve;

  ChangeValue(theIndex: number): Geom2d_BoundedCurve;

  SetValue(theIndex: number, theItem: Geom2d_BoundedCurve): void;

  At(theIndex: number): Geom2d_BoundedCurve;

  ChangeAt(theIndex: number): Geom2d_BoundedCurve;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom2d_Curve: declare class NCollection_Sequence_handle_Geom2d_Curve extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Geom2d_Curve): NCollection_Sequence_handle_Geom2d_Curve;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Geom2d_Curve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
  Append(theItem: Geom2d_Curve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

  Prepend(theItem: Geom2d_Curve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
  Prepend(theItem: Geom2d_Curve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

  InsertBefore(theIndex: number, theItem: Geom2d_Curve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
  InsertBefore(theIndex: number, theItem: Geom2d_Curve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
  InsertAfter(theIndex: number, theItem: Geom2d_Curve): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
  InsertAfter(theIndex: number, theItem: Geom2d_Curve): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

  First(): Geom2d_Curve;

  ChangeFirst(): Geom2d_Curve;

  Last(): Geom2d_Curve;

  ChangeLast(): Geom2d_Curve;

  Value(theIndex: number): Geom2d_Curve;

  ChangeValue(theIndex: number): Geom2d_Curve;

  SetValue(theIndex: number, theItem: Geom2d_Curve): void;

  At(theIndex: number): Geom2d_Curve;

  ChangeAt(theIndex: number): Geom2d_Curve;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom2d_Geometry: declare class NCollection_Sequence_handle_Geom2d_Geometry extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Geom2d_Geometry): NCollection_Sequence_handle_Geom2d_Geometry;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Geom2d_Geometry): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
  Append(theItem: Geom2d_Geometry): void;
  Append(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

  Prepend(theItem: Geom2d_Geometry): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
  Prepend(theItem: Geom2d_Geometry): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

  InsertBefore(theIndex: number, theItem: Geom2d_Geometry): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
  InsertBefore(theIndex: number, theItem: Geom2d_Geometry): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
  InsertAfter(theIndex: number, theItem: Geom2d_Geometry): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
  InsertAfter(theIndex: number, theItem: Geom2d_Geometry): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

  First(): Geom2d_Geometry;

  ChangeFirst(): Geom2d_Geometry;

  Last(): Geom2d_Geometry;

  ChangeLast(): Geom2d_Geometry;

  Value(theIndex: number): Geom2d_Geometry;

  ChangeValue(theIndex: number): Geom2d_Geometry;

  SetValue(theIndex: number, theItem: Geom2d_Geometry): void;

  At(theIndex: number): Geom2d_Geometry;

  ChangeAt(theIndex: number): Geom2d_Geometry;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom_BoundedCurve: declare class NCollection_Sequence_handle_Geom_BoundedCurve extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Geom_BoundedCurve): NCollection_Sequence_handle_Geom_BoundedCurve;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Geom_BoundedCurve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
  Append(theItem: Geom_BoundedCurve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

  Prepend(theItem: Geom_BoundedCurve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
  Prepend(theItem: Geom_BoundedCurve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

  InsertBefore(theIndex: number, theItem: Geom_BoundedCurve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
  InsertBefore(theIndex: number, theItem: Geom_BoundedCurve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
  InsertAfter(theIndex: number, theItem: Geom_BoundedCurve): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
  InsertAfter(theIndex: number, theItem: Geom_BoundedCurve): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

  First(): Geom_BoundedCurve;

  ChangeFirst(): Geom_BoundedCurve;

  Last(): Geom_BoundedCurve;

  ChangeLast(): Geom_BoundedCurve;

  Value(theIndex: number): Geom_BoundedCurve;

  ChangeValue(theIndex: number): Geom_BoundedCurve;

  SetValue(theIndex: number, theItem: Geom_BoundedCurve): void;

  At(theIndex: number): Geom_BoundedCurve;

  ChangeAt(theIndex: number): Geom_BoundedCurve;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Geom_Curve: declare class NCollection_Sequence_handle_Geom_Curve extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Geom_Curve): NCollection_Sequence_handle_Geom_Curve;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Geom_Curve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom_Curve): void;
  Append(theItem: Geom_Curve): void;
  Append(theSeq: NCollection_Sequence_handle_Geom_Curve): void;

  Prepend(theItem: Geom_Curve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom_Curve): void;
  Prepend(theItem: Geom_Curve): void;
  Prepend(theSeq: NCollection_Sequence_handle_Geom_Curve): void;

  InsertBefore(theIndex: number, theItem: Geom_Curve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;
  InsertBefore(theIndex: number, theItem: Geom_Curve): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;
  InsertAfter(theIndex: number, theItem: Geom_Curve): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;
  InsertAfter(theIndex: number, theItem: Geom_Curve): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;

  First(): Geom_Curve;

  ChangeFirst(): Geom_Curve;

  Last(): Geom_Curve;

  ChangeLast(): Geom_Curve;

  Value(theIndex: number): Geom_Curve;

  ChangeValue(theIndex: number): Geom_Curve;

  SetValue(theIndex: number, theItem: Geom_Curve): void;

  At(theIndex: number): Geom_Curve;

  ChangeAt(theIndex: number): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_IFSelect_Selection: declare class NCollection_Sequence_handle_IFSelect_Selection extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_IFSelect_Selection): NCollection_Sequence_handle_IFSelect_Selection;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: IFSelect_Selection): void;
  Append(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
  Append(theItem: IFSelect_Selection): void;
  Append(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

  Prepend(theItem: IFSelect_Selection): void;
  Prepend(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
  Prepend(theItem: IFSelect_Selection): void;
  Prepend(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

  InsertBefore(theIndex: number, theItem: IFSelect_Selection): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
  InsertBefore(theIndex: number, theItem: IFSelect_Selection): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
  InsertAfter(theIndex: number, theItem: IFSelect_Selection): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
  InsertAfter(theIndex: number, theItem: IFSelect_Selection): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

  First(): IFSelect_Selection;

  ChangeFirst(): IFSelect_Selection;

  Last(): IFSelect_Selection;

  ChangeLast(): IFSelect_Selection;

  Value(theIndex: number): IFSelect_Selection;

  ChangeValue(theIndex: number): IFSelect_Selection;

  SetValue(theIndex: number, theItem: IFSelect_Selection): void;

  At(theIndex: number): IFSelect_Selection;

  ChangeAt(theIndex: number): IFSelect_Selection;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_IntPatch_Line: declare class NCollection_Sequence_handle_IntPatch_Line extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_IntPatch_Line): NCollection_Sequence_handle_IntPatch_Line;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: IntPatch_Line): void;
  Append(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
  Append(theItem: IntPatch_Line): void;
  Append(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

  Prepend(theItem: IntPatch_Line): void;
  Prepend(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
  Prepend(theItem: IntPatch_Line): void;
  Prepend(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

  InsertBefore(theIndex: number, theItem: IntPatch_Line): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
  InsertBefore(theIndex: number, theItem: IntPatch_Line): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
  InsertAfter(theIndex: number, theItem: IntPatch_Line): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
  InsertAfter(theIndex: number, theItem: IntPatch_Line): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

  First(): IntPatch_Line;

  ChangeFirst(): IntPatch_Line;

  Last(): IntPatch_Line;

  ChangeLast(): IntPatch_Line;

  Value(theIndex: number): IntPatch_Line;

  ChangeValue(theIndex: number): IntPatch_Line;

  SetValue(theIndex: number, theItem: IntPatch_Line): void;

  At(theIndex: number): IntPatch_Line;

  ChangeAt(theIndex: number): IntPatch_Line;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_MAT2d_Connexion: declare class NCollection_Sequence_handle_MAT2d_Connexion extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_MAT2d_Connexion): NCollection_Sequence_handle_MAT2d_Connexion;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: MAT2d_Connexion): void;
  Append(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
  Append(theItem: MAT2d_Connexion): void;
  Append(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

  Prepend(theItem: MAT2d_Connexion): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
  Prepend(theItem: MAT2d_Connexion): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

  InsertBefore(theIndex: number, theItem: MAT2d_Connexion): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
  InsertBefore(theIndex: number, theItem: MAT2d_Connexion): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
  InsertAfter(theIndex: number, theItem: MAT2d_Connexion): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
  InsertAfter(theIndex: number, theItem: MAT2d_Connexion): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

  First(): MAT2d_Connexion;

  ChangeFirst(): MAT2d_Connexion;

  Last(): MAT2d_Connexion;

  ChangeLast(): MAT2d_Connexion;

  Value(theIndex: number): MAT2d_Connexion;

  ChangeValue(theIndex: number): MAT2d_Connexion;

  SetValue(theIndex: number, theItem: MAT2d_Connexion): void;

  At(theIndex: number): MAT2d_Connexion;

  ChangeAt(theIndex: number): MAT2d_Connexion;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_MAT_Arc: declare class NCollection_Sequence_handle_MAT_Arc extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_MAT_Arc): NCollection_Sequence_handle_MAT_Arc;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: MAT_Arc): void;
  Append(theSeq: NCollection_Sequence_handle_MAT_Arc): void;
  Append(theItem: MAT_Arc): void;
  Append(theSeq: NCollection_Sequence_handle_MAT_Arc): void;

  Prepend(theItem: MAT_Arc): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT_Arc): void;
  Prepend(theItem: MAT_Arc): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT_Arc): void;

  InsertBefore(theIndex: number, theItem: MAT_Arc): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;
  InsertBefore(theIndex: number, theItem: MAT_Arc): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;
  InsertAfter(theIndex: number, theItem: MAT_Arc): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;
  InsertAfter(theIndex: number, theItem: MAT_Arc): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;

  First(): MAT_Arc;

  ChangeFirst(): MAT_Arc;

  Last(): MAT_Arc;

  ChangeLast(): MAT_Arc;

  Value(theIndex: number): MAT_Arc;

  ChangeValue(theIndex: number): MAT_Arc;

  SetValue(theIndex: number, theItem: MAT_Arc): void;

  At(theIndex: number): MAT_Arc;

  ChangeAt(theIndex: number): MAT_Arc;

  delete(): void;

  [Symbol.dispose](): void;
