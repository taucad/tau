# libcascade — TopTools

21 top-level symbols. Signatures are verbatim typescript.

TopTools: declare class TopTools

  constructor

  static Dummy(I: number): void;

  delete(): void;

  [Symbol.dispose](): void;

TopTools_FormatVersion: typeof TopTools_FormatVersion[keyof typeof TopTools_FormatVersion]

TopTools_LocationSet: declare class TopTools_LocationSet

  constructor

  Clear(): void;

  Add(L: TopLoc_Location): number;

  Location(I: number): TopLoc_Location;

  Index(L: TopLoc_Location): number;

  delete(): void;

  [Symbol.dispose](): void;

TopTools_ShapeMapHasher: declare class TopTools_ShapeMapHasher

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopTools_ShapeSet: declare class TopTools_ShapeSet

  constructor

  SetFormatNb(theFormatNb: number): void;

  FormatNb(): number;

  Clear(): void;

  Add(S: TopoDS_Shape): number;

  Shape(I: number): TopoDS_Shape;

  Index(S: TopoDS_Shape): number;

  Locations(): TopTools_LocationSet;

  ChangeLocations(): TopTools_LocationSet;

  DumpExtent(S: TCollection_AsciiString): void;

  AddGeometry(S: TopoDS_Shape): void;

  AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  Check(T: TopAbs_ShapeEnum, S: TopoDS_Shape): void;

  NbShapes(): number;

  delete(): void;

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
