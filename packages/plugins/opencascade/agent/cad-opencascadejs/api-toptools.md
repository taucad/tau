# libcascade — TopTools

21 top-level symbols. Signatures are verbatim typescript.

TopTools: declare class TopTools

  // TopTools.constructor (constructor)
  constructor();

  // TopTools.Dummy (method)
  static Dummy(I: number): void;

  // TopTools.delete (method)
  delete(): void;

  // TopTools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopTools_FormatVersion: typeof TopTools_FormatVersion[keyof typeof TopTools_FormatVersion]

  readonly TopTools_FormatVersion_VERSION_1: 'TopTools_FormatVersion_VERSION_1'

  readonly TopTools_FormatVersion_VERSION_2: 'TopTools_FormatVersion_VERSION_2'

  readonly TopTools_FormatVersion_VERSION_3: 'TopTools_FormatVersion_VERSION_3'

  readonly TopTools_FormatVersion_CURRENT: 'TopTools_FormatVersion_CURRENT'

TopTools_LocationSet: declare class TopTools_LocationSet

  // TopTools_LocationSet.constructor (constructor)
  constructor();

  // TopTools_LocationSet.Clear (method)
  Clear(): void;

  // TopTools_LocationSet.Add (method)
  Add(L: TopLoc_Location): number;

  // TopTools_LocationSet.Location (method)
  Location(I: number): TopLoc_Location;

  // TopTools_LocationSet.Index (method)
  Index(L: TopLoc_Location): number;

  // TopTools_LocationSet.delete (method)
  delete(): void;

  // TopTools_LocationSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopTools_ShapeMapHasher: declare class TopTools_ShapeMapHasher

  // TopTools_ShapeMapHasher.constructor (constructor)
  constructor();

  // TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopTools_ShapeSet: declare class TopTools_ShapeSet

  // TopTools_ShapeSet.constructor (constructor)
  constructor();

  // TopTools_ShapeSet.SetFormatNb (method)
  SetFormatNb(theFormatNb: number): void;

  // TopTools_ShapeSet.FormatNb (method)
  FormatNb(): number;

  // TopTools_ShapeSet.Clear (method)
  Clear(): void;

  // TopTools_ShapeSet.Add (method)
  Add(S: TopoDS_Shape): number;

  // TopTools_ShapeSet.Shape (method)
  Shape(I: number): TopoDS_Shape;

  // TopTools_ShapeSet.Index (method)
  Index(S: TopoDS_Shape): number;

  // TopTools_ShapeSet.Locations (method)
  Locations(): TopTools_LocationSet;

  // TopTools_ShapeSet.ChangeLocations (method)
  ChangeLocations(): TopTools_LocationSet;

  // TopTools_ShapeSet.DumpExtent (method)
  DumpExtent(S: TCollection_AsciiString): void;

  // TopTools_ShapeSet.AddGeometry (method)
  AddGeometry(S: TopoDS_Shape): void;

  // TopTools_ShapeSet.AddShapes (method)
  AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  // TopTools_ShapeSet.Check (method)
  Check(T: TopAbs_ShapeEnum, S: TopoDS_Shape): void;

  // TopTools_ShapeSet.NbShapes (method)
  NbShapes(): number;

  // TopTools_ShapeSet.delete (method)
  delete(): void;

  // TopTools_ShapeSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopTools_Array1OfShape: NCollection_Array1_TopoDS_Shape

TopTools_Array2OfShape: NCollection_Array2_TopoDS_Shape

TopTools_DataMapOfShapeBox: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher

TopTools_DataMapOfShapeListOfShape: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_DataMapOfShapeReal: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher

TopTools_DataMapOfShapeShape: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_HArray1OfShape: NCollection_HArray1_TopoDS_Shape

TopTools_HArray2OfShape: NCollection_HArray2_TopoDS_Shape

TopTools_HSequenceOfShape: NCollection_HSequence_TopoDS_Shape

TopTools_IndexedDataMapOfShapeListOfShape: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_IndexedDataMapOfShapeReal: NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher

TopTools_IndexedMapOfShape: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_ListOfListOfShape: NCollection_List_NCollection_List_TopoDS_Shape

TopTools_ListOfShape: NCollection_List_TopoDS_Shape

TopTools_MapOfShape: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_SequenceOfShape: NCollection_Sequence_TopoDS_Shape
