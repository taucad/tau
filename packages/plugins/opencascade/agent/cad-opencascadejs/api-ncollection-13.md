# libcascade — NCollection (13)

13 top-level symbols. Signatures are verbatim typescript.

NCollection_Array1_handle_StepShape_ConnectedFaceSet: declare class NCollection_Array1_handle_StepShape_ConnectedFaceSet

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepShape_ConnectedFaceSet);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_ConnectedFaceSet, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_ConnectedFaceSet, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Init (method)
  Init(theValue: StepShape_ConnectedFaceSet): void;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepShape_ConnectedFaceSet): NCollection_Array1_handle_StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepShape_ConnectedFaceSet): NCollection_Array1_handle_StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Move (method)
  Move(theOther: NCollection_Array1_handle_StepShape_ConnectedFaceSet): NCollection_Array1_handle_StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.First (method)
  First(): StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.ChangeFirst (method)
  ChangeFirst(): StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Last (method)
  Last(): StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.ChangeLast (method)
  ChangeLast(): StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Value (method)
  Value(theIndex: number): StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.At (method)
  At(theIndex: number): StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_ConnectedFaceSet;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_ConnectedFaceSet): void;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepShape_ConnectedFaceSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepShape_Edge: declare class NCollection_Array1_handle_StepShape_Edge

  // NCollection_Array1_handle_StepShape_Edge.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepShape_Edge);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_Edge, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_Edge, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepShape_Edge.Init (method)
  Init(theValue: StepShape_Edge): void;

  // NCollection_Array1_handle_StepShape_Edge.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepShape_Edge.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepShape_Edge.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepShape_Edge.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepShape_Edge.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepShape_Edge.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepShape_Edge): NCollection_Array1_handle_StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepShape_Edge): NCollection_Array1_handle_StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.Move (method)
  Move(theOther: NCollection_Array1_handle_StepShape_Edge): NCollection_Array1_handle_StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.First (method)
  First(): StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.ChangeFirst (method)
  ChangeFirst(): StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.Last (method)
  Last(): StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.ChangeLast (method)
  ChangeLast(): StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.Value (method)
  Value(theIndex: number): StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.At (method)
  At(theIndex: number): StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_Edge;

  // NCollection_Array1_handle_StepShape_Edge.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_Edge): void;

  // NCollection_Array1_handle_StepShape_Edge.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepShape_Edge.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepShape_Edge.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepShape_Edge.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepShape_Edge.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepShape_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepShape_Face: declare class NCollection_Array1_handle_StepShape_Face

  // NCollection_Array1_handle_StepShape_Face.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepShape_Face);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_Face, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_Face, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepShape_Face.Init (method)
  Init(theValue: StepShape_Face): void;

  // NCollection_Array1_handle_StepShape_Face.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepShape_Face.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepShape_Face.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepShape_Face.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepShape_Face.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepShape_Face.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepShape_Face): NCollection_Array1_handle_StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepShape_Face): NCollection_Array1_handle_StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.Move (method)
  Move(theOther: NCollection_Array1_handle_StepShape_Face): NCollection_Array1_handle_StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.First (method)
  First(): StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.ChangeFirst (method)
  ChangeFirst(): StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.Last (method)
  Last(): StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.ChangeLast (method)
  ChangeLast(): StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.Value (method)
  Value(theIndex: number): StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.At (method)
  At(theIndex: number): StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_Face;

  // NCollection_Array1_handle_StepShape_Face.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_Face): void;

  // NCollection_Array1_handle_StepShape_Face.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepShape_Face.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepShape_Face.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepShape_Face.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepShape_Face.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepShape_Face.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepShape_FaceBound: declare class NCollection_Array1_handle_StepShape_FaceBound

  // NCollection_Array1_handle_StepShape_FaceBound.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepShape_FaceBound);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_FaceBound, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_FaceBound, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepShape_FaceBound.Init (method)
  Init(theValue: StepShape_FaceBound): void;

  // NCollection_Array1_handle_StepShape_FaceBound.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepShape_FaceBound.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepShape_FaceBound.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepShape_FaceBound.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepShape_FaceBound.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepShape_FaceBound.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepShape_FaceBound): NCollection_Array1_handle_StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepShape_FaceBound): NCollection_Array1_handle_StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.Move (method)
  Move(theOther: NCollection_Array1_handle_StepShape_FaceBound): NCollection_Array1_handle_StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.First (method)
  First(): StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.ChangeFirst (method)
  ChangeFirst(): StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.Last (method)
  Last(): StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.ChangeLast (method)
  ChangeLast(): StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.Value (method)
  Value(theIndex: number): StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.At (method)
  At(theIndex: number): StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_FaceBound;

  // NCollection_Array1_handle_StepShape_FaceBound.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_FaceBound): void;

  // NCollection_Array1_handle_StepShape_FaceBound.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepShape_FaceBound.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepShape_FaceBound.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepShape_FaceBound.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepShape_FaceBound.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepShape_FaceBound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepShape_OrientedClosedShell: declare class NCollection_Array1_handle_StepShape_OrientedClosedShell

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepShape_OrientedClosedShell);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_OrientedClosedShell, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_OrientedClosedShell, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Init (method)
  Init(theValue: StepShape_OrientedClosedShell): void;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepShape_OrientedClosedShell): NCollection_Array1_handle_StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepShape_OrientedClosedShell): NCollection_Array1_handle_StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Move (method)
  Move(theOther: NCollection_Array1_handle_StepShape_OrientedClosedShell): NCollection_Array1_handle_StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.First (method)
  First(): StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.ChangeFirst (method)
  ChangeFirst(): StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Last (method)
  Last(): StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.ChangeLast (method)
  ChangeLast(): StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Value (method)
  Value(theIndex: number): StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.At (method)
  At(theIndex: number): StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_OrientedClosedShell;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_OrientedClosedShell): void;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepShape_OrientedClosedShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepShape_OrientedEdge: declare class NCollection_Array1_handle_StepShape_OrientedEdge

  // NCollection_Array1_handle_StepShape_OrientedEdge.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepShape_OrientedEdge);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_OrientedEdge, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_OrientedEdge, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepShape_OrientedEdge.Init (method)
  Init(theValue: StepShape_OrientedEdge): void;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepShape_OrientedEdge.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepShape_OrientedEdge): NCollection_Array1_handle_StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepShape_OrientedEdge): NCollection_Array1_handle_StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Move (method)
  Move(theOther: NCollection_Array1_handle_StepShape_OrientedEdge): NCollection_Array1_handle_StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.First (method)
  First(): StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.ChangeFirst (method)
  ChangeFirst(): StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Last (method)
  Last(): StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.ChangeLast (method)
  ChangeLast(): StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Value (method)
  Value(theIndex: number): StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.At (method)
  At(theIndex: number): StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_OrientedEdge;

  // NCollection_Array1_handle_StepShape_OrientedEdge.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_OrientedEdge): void;

  // NCollection_Array1_handle_StepShape_OrientedEdge.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepShape_OrientedEdge.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepShape_OrientedEdge.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepShape_OrientedEdge.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepShape_OrientedEdge.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepShape_OrientedEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepVisual_CurveStyleFontPattern: declare class NCollection_Array1_handle_StepVisual_CurveStyleFontPattern

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepVisual_CurveStyleFontPattern, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepVisual_CurveStyleFontPattern, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Init (method)
  Init(theValue: StepVisual_CurveStyleFontPattern): void;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern): NCollection_Array1_handle_StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern): NCollection_Array1_handle_StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Move (method)
  Move(theOther: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern): NCollection_Array1_handle_StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.First (method)
  First(): StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.ChangeFirst (method)
  ChangeFirst(): StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Last (method)
  Last(): StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.ChangeLast (method)
  ChangeLast(): StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Value (method)
  Value(theIndex: number): StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.ChangeValue (method)
  ChangeValue(theIndex: number): StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.At (method)
  At(theIndex: number): StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.ChangeAt (method)
  ChangeAt(theIndex: number): StepVisual_CurveStyleFontPattern;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.SetValue (method)
  SetValue(theIndex: number, theItem: StepVisual_CurveStyleFontPattern): void;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepVisual_CurveStyleFontPattern.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepVisual_PresentationStyleAssignment: declare class NCollection_Array1_handle_StepVisual_PresentationStyleAssignment

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepVisual_PresentationStyleAssignment, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepVisual_PresentationStyleAssignment, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Init (method)
  Init(theValue: StepVisual_PresentationStyleAssignment): void;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment): NCollection_Array1_handle_StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment): NCollection_Array1_handle_StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Move (method)
  Move(theOther: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment): NCollection_Array1_handle_StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.First (method)
  First(): StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.ChangeFirst (method)
  ChangeFirst(): StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Last (method)
  Last(): StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.ChangeLast (method)
  ChangeLast(): StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Value (method)
  Value(theIndex: number): StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.ChangeValue (method)
  ChangeValue(theIndex: number): StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.At (method)
  At(theIndex: number): StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.ChangeAt (method)
  ChangeAt(theIndex: number): StepVisual_PresentationStyleAssignment;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.SetValue (method)
  SetValue(theIndex: number, theItem: StepVisual_PresentationStyleAssignment): void;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepVisual_PresentationStyleAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepVisual_TessellatedItem: declare class NCollection_Array1_handle_StepVisual_TessellatedItem

  // NCollection_Array1_handle_StepVisual_TessellatedItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepVisual_TessellatedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepVisual_TessellatedItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepVisual_TessellatedItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Init (method)
  Init(theValue: StepVisual_TessellatedItem): void;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepVisual_TessellatedItem): NCollection_Array1_handle_StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepVisual_TessellatedItem): NCollection_Array1_handle_StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Move (method)
  Move(theOther: NCollection_Array1_handle_StepVisual_TessellatedItem): NCollection_Array1_handle_StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.First (method)
  First(): StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.ChangeFirst (method)
  ChangeFirst(): StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Last (method)
  Last(): StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.ChangeLast (method)
  ChangeLast(): StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Value (method)
  Value(theIndex: number): StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.At (method)
  At(theIndex: number): StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepVisual_TessellatedItem;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepVisual_TessellatedItem): void;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepVisual_TessellatedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_StepVisual_TessellatedStructuredItem: declare class NCollection_Array1_handle_StepVisual_TessellatedStructuredItem

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepVisual_TessellatedStructuredItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepVisual_TessellatedStructuredItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Init (method)
  Init(theValue: StepVisual_TessellatedStructuredItem): void;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Size (method)
  Size(): number;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Length (method)
  Length(): number;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Assign (method)
  Assign(theOther: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem): NCollection_Array1_handle_StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem): NCollection_Array1_handle_StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Move (method)
  Move(theOther: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem): NCollection_Array1_handle_StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.First (method)
  First(): StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.ChangeFirst (method)
  ChangeFirst(): StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Last (method)
  Last(): StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.ChangeLast (method)
  ChangeLast(): StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Value (method)
  Value(theIndex: number): StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.At (method)
  At(theIndex: number): StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepVisual_TessellatedStructuredItem;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepVisual_TessellatedStructuredItem): void;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.delete (method)
  delete(): void;

  // NCollection_Array1_handle_StepVisual_TessellatedStructuredItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_TCollection_HAsciiString: declare class NCollection_Array1_handle_TCollection_HAsciiString

  // NCollection_Array1_handle_TCollection_HAsciiString.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_TCollection_HAsciiString);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: TCollection_HAsciiString, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: TCollection_HAsciiString, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_TCollection_HAsciiString.Init (method)
  Init(theValue: TCollection_HAsciiString): void;

  // NCollection_Array1_handle_TCollection_HAsciiString.Size (method)
  Size(): number;

  // NCollection_Array1_handle_TCollection_HAsciiString.Length (method)
  Length(): number;

  // NCollection_Array1_handle_TCollection_HAsciiString.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_TCollection_HAsciiString.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_TCollection_HAsciiString.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_TCollection_HAsciiString.Assign (method)
  Assign(theOther: NCollection_Array1_handle_TCollection_HAsciiString): NCollection_Array1_handle_TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_TCollection_HAsciiString): NCollection_Array1_handle_TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.Move (method)
  Move(theOther: NCollection_Array1_handle_TCollection_HAsciiString): NCollection_Array1_handle_TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.First (method)
  First(): TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.ChangeFirst (method)
  ChangeFirst(): TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.Last (method)
  Last(): TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.ChangeLast (method)
  ChangeLast(): TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.Value (method)
  Value(theIndex: number): TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.ChangeValue (method)
  ChangeValue(theIndex: number): TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.At (method)
  At(theIndex: number): TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.ChangeAt (method)
  ChangeAt(theIndex: number): TCollection_HAsciiString;

  // NCollection_Array1_handle_TCollection_HAsciiString.SetValue (method)
  SetValue(theIndex: number, theItem: TCollection_HAsciiString): void;

  // NCollection_Array1_handle_TCollection_HAsciiString.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_TCollection_HAsciiString.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_TCollection_HAsciiString.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_TCollection_HAsciiString.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_TCollection_HAsciiString.delete (method)
  delete(): void;

  // NCollection_Array1_handle_TCollection_HAsciiString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_int: declare class NCollection_Array1_int

  // NCollection_Array1_int.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_int);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: number, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: number, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_int.Init (method)
  Init(theValue: number): void;

  // NCollection_Array1_int.Size (method)
  Size(): number;

  // NCollection_Array1_int.Length (method)
  Length(): number;

  // NCollection_Array1_int.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_int.Lower (method)
  Lower(): number;

  // NCollection_Array1_int.Upper (method)
  Upper(): number;

  // NCollection_Array1_int.Assign (method)
  Assign(theOther: NCollection_Array1_int): NCollection_Array1_int;

  // NCollection_Array1_int.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_int): NCollection_Array1_int;

  // NCollection_Array1_int.Move (method)
  Move(theOther: NCollection_Array1_int): NCollection_Array1_int;

  // NCollection_Array1_int.First (method)
  First(): number;

  // NCollection_Array1_int.ChangeFirst (method)
  ChangeFirst(): number;

  // NCollection_Array1_int.Last (method)
  Last(): number;

  // NCollection_Array1_int.ChangeLast (method)
  ChangeLast(): number;

  // NCollection_Array1_int.Value (method)
  Value(theIndex: number): number;

  // NCollection_Array1_int.ChangeValue (method)
  ChangeValue(theIndex: number): number;

  // NCollection_Array1_int.At (method)
  At(theIndex: number): number;

  // NCollection_Array1_int.ChangeAt (method)
  ChangeAt(theIndex: number): number;

  // NCollection_Array1_int.SetValue (method)
  SetValue(theIndex: number, theItem: number): void;

  // NCollection_Array1_int.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_int.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_int.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_int.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_int.delete (method)
  delete(): void;

  // NCollection_Array1_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_unsignedchar: declare class NCollection_Array1_unsignedchar

  // NCollection_Array1_unsignedchar.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_unsignedchar);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: string, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: string, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_unsignedchar.Init (method)
  Init(theValue: string): void;

  // NCollection_Array1_unsignedchar.Size (method)
  Size(): number;

  // NCollection_Array1_unsignedchar.Length (method)
  Length(): number;

  // NCollection_Array1_unsignedchar.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_unsignedchar.Lower (method)
  Lower(): number;

  // NCollection_Array1_unsignedchar.Upper (method)
  Upper(): number;

  // NCollection_Array1_unsignedchar.Assign (method)
  Assign(theOther: NCollection_Array1_unsignedchar): NCollection_Array1_unsignedchar;

  // NCollection_Array1_unsignedchar.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_unsignedchar): NCollection_Array1_unsignedchar;

  // NCollection_Array1_unsignedchar.Move (method)
  Move(theOther: NCollection_Array1_unsignedchar): NCollection_Array1_unsignedchar;

  // NCollection_Array1_unsignedchar.First (method)
  First(): string;

  // NCollection_Array1_unsignedchar.ChangeFirst (method)
  ChangeFirst(): string;

  // NCollection_Array1_unsignedchar.Last (method)
  Last(): string;

  // NCollection_Array1_unsignedchar.ChangeLast (method)
  ChangeLast(): string;

  // NCollection_Array1_unsignedchar.Value (method)
  Value(theIndex: number): string;

  // NCollection_Array1_unsignedchar.ChangeValue (method)
  ChangeValue(theIndex: number): string;

  // NCollection_Array1_unsignedchar.At (method)
  At(theIndex: number): string;

  // NCollection_Array1_unsignedchar.ChangeAt (method)
  ChangeAt(theIndex: number): string;

  // NCollection_Array1_unsignedchar.SetValue (method)
  SetValue(theIndex: number, theItem: string): void;

  // NCollection_Array1_unsignedchar.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_unsignedchar.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_unsignedchar.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_unsignedchar.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_unsignedchar.delete (method)
  delete(): void;

  // NCollection_Array1_unsignedchar.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
