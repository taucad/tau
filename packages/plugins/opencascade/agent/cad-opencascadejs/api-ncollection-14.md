# libcascade — NCollection (14)

11 top-level symbols. Signatures are verbatim typescript.

NCollection_Array2_TopoDS_Shape: declare class NCollection_Array2_TopoDS_Shape

  // NCollection_Array2_TopoDS_Shape.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_TopoDS_Shape);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: TopoDS_Shape, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_TopoDS_Shape.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_TopoDS_Shape.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_TopoDS_Shape.Size (method)
  Size(): number;

  // NCollection_Array2_TopoDS_Shape.Length (method)
  Length(): number;

  // NCollection_Array2_TopoDS_Shape.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_TopoDS_Shape.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_TopoDS_Shape.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_TopoDS_Shape.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_TopoDS_Shape.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_TopoDS_Shape.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_TopoDS_Shape.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_TopoDS_Shape.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_TopoDS_Shape.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_TopoDS_Shape.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_TopoDS_Shape.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_TopoDS_Shape.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_TopoDS_Shape.Assign (method)
  Assign(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_TopoDS_Shape.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_TopoDS_Shape.Move (method)
  Move(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_TopoDS_Shape.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: TopoDS_Shape): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_TopoDS_Shape.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_TopoDS_Shape.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_TopoDS_Shape.delete (method)
  delete(): void;

  // NCollection_Array2_TopoDS_Shape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_double: declare class NCollection_Array2_double

  // NCollection_Array2_double.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_double);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: number, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_double.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_double.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_double.Size (method)
  Size(): number;

  // NCollection_Array2_double.Length (method)
  Length(): number;

  // NCollection_Array2_double.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_double.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_double.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_double.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_double.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_double.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_double.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_double.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_double.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_double.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_double.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_double.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_double.Assign (method)
  Assign(theOther: NCollection_Array2_double): NCollection_Array2_double;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_double.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_double): NCollection_Array2_double;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_double.Move (method)
  Move(theOther: NCollection_Array2_double): NCollection_Array2_double;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_double.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: number): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_double.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_double.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_double.delete (method)
  delete(): void;

  // NCollection_Array2_double.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_gp_Pnt: declare class NCollection_Array2_gp_Pnt

  // NCollection_Array2_gp_Pnt.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_gp_Pnt);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: gp_Pnt, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_gp_Pnt.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_gp_Pnt.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_gp_Pnt.Size (method)
  Size(): number;

  // NCollection_Array2_gp_Pnt.Length (method)
  Length(): number;

  // NCollection_Array2_gp_Pnt.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_gp_Pnt.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_gp_Pnt.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_gp_Pnt.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_gp_Pnt.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_gp_Pnt.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_gp_Pnt.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_gp_Pnt.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_gp_Pnt.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_gp_Pnt.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_gp_Pnt.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_gp_Pnt.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_gp_Pnt.Assign (method)
  Assign(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_gp_Pnt.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_gp_Pnt.Move (method)
  Move(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_gp_Pnt.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: gp_Pnt): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_gp_Pnt.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_gp_Pnt.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_gp_Pnt.delete (method)
  delete(): void;

  // NCollection_Array2_gp_Pnt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_gp_Pnt2d: declare class NCollection_Array2_gp_Pnt2d

  // NCollection_Array2_gp_Pnt2d.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_gp_Pnt2d);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: gp_Pnt2d, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_gp_Pnt2d.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_gp_Pnt2d.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_gp_Pnt2d.Size (method)
  Size(): number;

  // NCollection_Array2_gp_Pnt2d.Length (method)
  Length(): number;

  // NCollection_Array2_gp_Pnt2d.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_gp_Pnt2d.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_gp_Pnt2d.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_gp_Pnt2d.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_gp_Pnt2d.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_gp_Pnt2d.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_gp_Pnt2d.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_gp_Pnt2d.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_gp_Pnt2d.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_gp_Pnt2d.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_gp_Pnt2d.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_gp_Pnt2d.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_gp_Pnt2d.Assign (method)
  Assign(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_gp_Pnt2d.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_gp_Pnt2d.Move (method)
  Move(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_gp_Pnt2d.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: gp_Pnt2d): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_gp_Pnt2d.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_gp_Pnt2d.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_gp_Pnt2d.delete (method)
  delete(): void;

  // NCollection_Array2_gp_Pnt2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_gp_Vec: declare class NCollection_Array2_gp_Vec

  // NCollection_Array2_gp_Vec.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_gp_Vec);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: gp_Vec, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_gp_Vec.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_gp_Vec.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_gp_Vec.Size (method)
  Size(): number;

  // NCollection_Array2_gp_Vec.Length (method)
  Length(): number;

  // NCollection_Array2_gp_Vec.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_gp_Vec.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_gp_Vec.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_gp_Vec.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_gp_Vec.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_gp_Vec.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_gp_Vec.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_gp_Vec.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_gp_Vec.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_gp_Vec.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_gp_Vec.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_gp_Vec.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_gp_Vec.Assign (method)
  Assign(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_gp_Vec.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_gp_Vec.Move (method)
  Move(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_gp_Vec.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: gp_Vec): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_gp_Vec.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_gp_Vec.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_gp_Vec.delete (method)
  delete(): void;

  // NCollection_Array2_gp_Vec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_gp_XYZ: declare class NCollection_Array2_gp_XYZ

  // NCollection_Array2_gp_XYZ.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_gp_XYZ);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: gp_XYZ, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_gp_XYZ.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_gp_XYZ.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_gp_XYZ.Size (method)
  Size(): number;

  // NCollection_Array2_gp_XYZ.Length (method)
  Length(): number;

  // NCollection_Array2_gp_XYZ.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_gp_XYZ.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_gp_XYZ.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_gp_XYZ.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_gp_XYZ.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_gp_XYZ.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_gp_XYZ.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_gp_XYZ.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_gp_XYZ.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_gp_XYZ.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_gp_XYZ.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_gp_XYZ.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_gp_XYZ.Assign (method)
  Assign(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_gp_XYZ.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_gp_XYZ.Move (method)
  Move(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_gp_XYZ.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: gp_XYZ): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_gp_XYZ.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_gp_XYZ.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_gp_XYZ.delete (method)
  delete(): void;

  // NCollection_Array2_gp_XYZ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_handle_Geom_BezierSurface: declare class NCollection_Array2_handle_Geom_BezierSurface

  // NCollection_Array2_handle_Geom_BezierSurface.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_handle_Geom_BezierSurface);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: Geom_BezierSurface, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_handle_Geom_BezierSurface.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_Geom_BezierSurface.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_Geom_BezierSurface.Size (method)
  Size(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.Length (method)
  Length(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_handle_Geom_BezierSurface.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_handle_Geom_BezierSurface.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_handle_Geom_BezierSurface.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_handle_Geom_BezierSurface.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_handle_Geom_BezierSurface.Assign (method)
  Assign(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_handle_Geom_BezierSurface.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_handle_Geom_BezierSurface.Move (method)
  Move(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_handle_Geom_BezierSurface.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: Geom_BezierSurface): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_handle_Geom_BezierSurface.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_Geom_BezierSurface.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_Geom_BezierSurface.delete (method)
  delete(): void;

  // NCollection_Array2_handle_Geom_BezierSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_handle_Geom_Surface: declare class NCollection_Array2_handle_Geom_Surface

  // NCollection_Array2_handle_Geom_Surface.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_handle_Geom_Surface);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: Geom_Surface, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_handle_Geom_Surface.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_Geom_Surface.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_Geom_Surface.Size (method)
  Size(): number;

  // NCollection_Array2_handle_Geom_Surface.Length (method)
  Length(): number;

  // NCollection_Array2_handle_Geom_Surface.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_handle_Geom_Surface.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_handle_Geom_Surface.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_handle_Geom_Surface.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_handle_Geom_Surface.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_handle_Geom_Surface.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_handle_Geom_Surface.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_handle_Geom_Surface.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_handle_Geom_Surface.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_handle_Geom_Surface.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_handle_Geom_Surface.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_handle_Geom_Surface.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_handle_Geom_Surface.Assign (method)
  Assign(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_handle_Geom_Surface.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_handle_Geom_Surface.Move (method)
  Move(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_handle_Geom_Surface.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: Geom_Surface): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_handle_Geom_Surface.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_Geom_Surface.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_Geom_Surface.delete (method)
  delete(): void;

  // NCollection_Array2_handle_Geom_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_handle_NCollection_HArray1_double: declare class NCollection_Array2_handle_NCollection_HArray1_double

  // NCollection_Array2_handle_NCollection_HArray1_double.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_handle_NCollection_HArray1_double);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: unknown, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_handle_NCollection_HArray1_double.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.Size (method)
  Size(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.Length (method)
  Length(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_handle_NCollection_HArray1_double.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_handle_NCollection_HArray1_double.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_handle_NCollection_HArray1_double.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_handle_NCollection_HArray1_double.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_handle_NCollection_HArray1_double.Assign (method)
  Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_handle_NCollection_HArray1_double.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_handle_NCollection_HArray1_double.Move (method)
  Move(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_handle_NCollection_HArray1_double.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: unknown): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_handle_NCollection_HArray1_double.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_NCollection_HArray1_double.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_NCollection_HArray1_double.delete (method)
  delete(): void;

  // NCollection_Array2_handle_NCollection_HArray1_double.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_handle_NCollection_HArray1_int: declare class NCollection_Array2_handle_NCollection_HArray1_int

  // NCollection_Array2_handle_NCollection_HArray1_int.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_handle_NCollection_HArray1_int);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: unknown, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_handle_NCollection_HArray1_int.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.Size (method)
  Size(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.Length (method)
  Length(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_handle_NCollection_HArray1_int.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_handle_NCollection_HArray1_int.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_handle_NCollection_HArray1_int.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_handle_NCollection_HArray1_int.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_handle_NCollection_HArray1_int.Assign (method)
  Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_handle_NCollection_HArray1_int.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_handle_NCollection_HArray1_int.Move (method)
  Move(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_handle_NCollection_HArray1_int.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: unknown): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_handle_NCollection_HArray1_int.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_NCollection_HArray1_int.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_NCollection_HArray1_int.delete (method)
  delete(): void;

  // NCollection_Array2_handle_NCollection_HArray1_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_handle_Standard_Transient: declare class NCollection_Array2_handle_Standard_Transient

  // NCollection_Array2_handle_Standard_Transient.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_handle_Standard_Transient);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: Standard_Transient, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_handle_Standard_Transient.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_Standard_Transient.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_Standard_Transient.Size (method)
  Size(): number;

  // NCollection_Array2_handle_Standard_Transient.Length (method)
  Length(): number;

  // NCollection_Array2_handle_Standard_Transient.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_handle_Standard_Transient.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_handle_Standard_Transient.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_handle_Standard_Transient.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_handle_Standard_Transient.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_handle_Standard_Transient.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_handle_Standard_Transient.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_handle_Standard_Transient.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_handle_Standard_Transient.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_handle_Standard_Transient.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_handle_Standard_Transient.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_handle_Standard_Transient.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_handle_Standard_Transient.Assign (method)
  Assign(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_handle_Standard_Transient.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_handle_Standard_Transient.Move (method)
  Move(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_handle_Standard_Transient.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: Standard_Transient): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_handle_Standard_Transient.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_Standard_Transient.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_Standard_Transient.delete (method)
  delete(): void;

  // NCollection_Array2_handle_Standard_Transient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
