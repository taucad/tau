# libcascade — BOPDS

38 top-level symbols. Signatures are verbatim typescript.

BOPDS_CommonBlock: declare class BOPDS_CommonBlock extends Standard_Transient

  constructor

  AddPaveBlock(aPB: BOPDS_PaveBlock): void;

  SetPaveBlocks(aLPB: NCollection_List_handle_BOPDS_PaveBlock): void;

  AddFace(aF: number): void;

  SetFaces(aLF: NCollection_List_int): void;

  AppendFaces(aLF: NCollection_List_int): void;

  PaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

  Faces(): NCollection_List_int;

  PaveBlock1(): BOPDS_PaveBlock;

  PaveBlockOnEdge(theIndex: number): BOPDS_PaveBlock;

  IsPaveBlockOnFace(theIndex: number): boolean;

  IsPaveBlockOnEdge(theIndex: number): boolean;

  Contains(thePB: BOPDS_PaveBlock): boolean;
  Contains(theF: number): boolean;
  Contains(thePB: BOPDS_PaveBlock): boolean;
  Contains(theF: number): boolean;

  SetEdge(theEdge: number): void;

  Edge(): number;

  Dump(): void;

  SetRealPaveBlock(thePB: BOPDS_PaveBlock): void;

  SetTolerance(theTol: number): void;

  Tolerance(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_CoupleOfPaveBlocks: declare class BOPDS_CoupleOfPaveBlocks

  constructor

  SetIndex(theIndex: number): void;

  Index(): number;

  SetIndexInterf(theIndex: number): void;

  IndexInterf(): number;

  SetPaveBlocks(thePB1: BOPDS_PaveBlock, thePB2: BOPDS_PaveBlock): void;

  // DEPRECATED
  PaveBlocks(): { thePB1: BOPDS_PaveBlock; thePB2: BOPDS_PaveBlock; [Symbol.dispose](): void };

  SetPaveBlock1(thePB: BOPDS_PaveBlock): void;

  PaveBlock1(): BOPDS_PaveBlock;

  SetPaveBlock2(thePB: BOPDS_PaveBlock): void;

  PaveBlock2(): BOPDS_PaveBlock;

  SetTolerance(theTol: number): void;

  Tolerance(): number;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_Curve: declare class BOPDS_Curve

  constructor

  SetCurve(theC: IntTools_Curve): void;

  Curve(): IntTools_Curve;

  SetBox(theBox: Bnd_Box): void;

  Box(): Bnd_Box;

  ChangeBox(): Bnd_Box;

  SetPaveBlocks(theLPB: NCollection_List_handle_BOPDS_PaveBlock): void;

  PaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

  ChangePaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

  InitPaveBlock1(): void;

  ChangePaveBlock1(): BOPDS_PaveBlock;

  TechnoVertices(): NCollection_List_int;

  ChangeTechnoVertices(): NCollection_List_int;

  HasEdge(): boolean;

  SetTolerance(theTol: number): void;

  Tolerance(): number;

  TangentialTolerance(): number;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_DS: declare class BOPDS_DS

  constructor

  Clear(): void;

  Allocator(): NCollection_BaseAllocator;

  SetArguments(theLS: NCollection_List_TopoDS_Shape): void;

  Arguments(): NCollection_List_TopoDS_Shape;

  Init(theFuzz?: number): void;

  NbShapes(): number;

  NbSourceShapes(): number;

  NbRanges(): number;

  Range(theIndex: number): BOPDS_IndexRange;

  Rank(theIndex: number): number;

  IsNewShape(theIndex: number): boolean;

  Append(theSI: BOPDS_ShapeInfo): number;
  Append(theS: TopoDS_Shape): number;
  Append(theSI: BOPDS_ShapeInfo): number;
  Append(theS: TopoDS_Shape): number;

  ShapeInfo(theIndex: number): BOPDS_ShapeInfo;

  ChangeShapeInfo(theIndex: number): BOPDS_ShapeInfo;

  Shape(theIndex: number): TopoDS_Shape;

  Index(theS: TopoDS_Shape): number;

  PaveBlocksPool(): NCollection_DynamicArray_NCollection_List_handle_BOPDS_PaveBlock;

  ChangePaveBlocksPool(): NCollection_DynamicArray_NCollection_List_handle_BOPDS_PaveBlock;

  HasPaveBlocks(theIndex: number): boolean;

  PaveBlocks(theIndex: number): NCollection_List_handle_BOPDS_PaveBlock;

  ChangePaveBlocks(theIndex: number): NCollection_List_handle_BOPDS_PaveBlock;

  UpdatePaveBlocks(): void;

  UpdatePaveBlock(thePB: BOPDS_PaveBlock): void;

  UpdateCommonBlock(theCB: BOPDS_CommonBlock, theFuzz: number): void;

  IsCommonBlock(thePB: BOPDS_PaveBlock): boolean;

  CommonBlock(thePB: BOPDS_PaveBlock): BOPDS_CommonBlock;

  SetCommonBlock(thePB: BOPDS_PaveBlock, theCB: BOPDS_CommonBlock): void;

  RealPaveBlock(thePB: BOPDS_PaveBlock): BOPDS_PaveBlock;

  IsCommonBlockOnEdge(thePB: BOPDS_PaveBlock): boolean;

  FaceInfoPool(): NCollection_DynamicArray_BOPDS_FaceInfo;

  HasFaceInfo(theIndex: number): boolean;

  FaceInfo(theIndex: number): BOPDS_FaceInfo;

  ChangeFaceInfo(theIndex: number): BOPDS_FaceInfo;

  UpdateFaceInfoIn(theIndex: number): void;
  UpdateFaceInfoIn(theFaces: NCollection_Map_int): void;
  UpdateFaceInfoIn(theIndex: number): void;
  UpdateFaceInfoIn(theFaces: NCollection_Map_int): void;

  UpdateFaceInfoOn(theIndex: number): void;
  UpdateFaceInfoOn(theFaces: NCollection_Map_int): void;
  UpdateFaceInfoOn(theIndex: number): void;
  UpdateFaceInfoOn(theFaces: NCollection_Map_int): void;

  FaceInfoOn(theIndex: number, theMPB: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theMVP: NCollection_Map_int): void;

  FaceInfoIn(theIndex: number, theMPB: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theMVP: NCollection_Map_int): void;

  AloneVertices(theFaceIndex: number, theVertexList: NCollection_List_int): void;

  RefineFaceInfoOn(): void;

  RefineFaceInfoIn(): void;

  SubShapesOnIn(theFaceIndex1: number, theFaceIndex2: number, theMVOnIn: NCollection_Map_int, theMVCommon: NCollection_Map_int, thePBOnIn: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theCommonPaveBlocks: NCollection_Map_handle_BOPDS_PaveBlock): void;

  SharedEdges(theFaceIndex1: number, theFaceIndex2: number, theEdgeList: NCollection_List_int, theAllocator: NCollection_BaseAllocator): void;

  ShapesSD(): NCollection_DataMap_int_int;

  AddShapeSD(theIndex: number, theIndexSD: number): void;

  HasShapeSD(theIndex: number, theIndexSD?: number): { returnValue: boolean; theIndexSD: number };

  GetSameDomainIndex(theIndex: number): number;

  InterfVV(): NCollection_DynamicArray_BOPDS_InterfVV;

  InterfVE(): NCollection_DynamicArray_BOPDS_InterfVE;

  InterfVF(): NCollection_DynamicArray_BOPDS_InterfVF;

  InterfEE(): NCollection_DynamicArray_BOPDS_InterfEE;

  InterfEF(): NCollection_DynamicArray_BOPDS_InterfEF;

  InterfFF(): NCollection_DynamicArray_BOPDS_InterfFF;

  InterfVZ(): NCollection_DynamicArray_BOPDS_InterfVZ;

  InterfEZ(): NCollection_DynamicArray_BOPDS_InterfEZ;

  InterfFZ(): NCollection_DynamicArray_BOPDS_InterfFZ;

  InterfZZ(): NCollection_DynamicArray_BOPDS_InterfZZ;

  static NbInterfTypes(): number;

  AddInterf(theI1: number, theI2: number): boolean;

  HasInterf(theI: number): boolean;
  HasInterf(theI1: number, theI2: number): boolean;
  HasInterf(theI: number): boolean;
  HasInterf(theI1: number, theI2: number): boolean;

  HasInterfShapeSubShapes(theIndex1: number, theIndex2: number, theAnyInterference?: boolean): boolean;

  HasInterfSubShapes(theIndex1: number, theIndex2: number): boolean;

  Interferences(): NCollection_Map_BOPDS_Pair;

  Dump(): void;

  IsSubShape(theCandidate: number, theParent: number): boolean;

  Paves(theIndex: number, theLP: NCollection_List_BOPDS_Pave): void;

  UpdatePaveBlocksWithSDVertices(): void;

  UpdatePaveBlockWithSDVertices(thePB: BOPDS_PaveBlock): void;

  UpdateCommonBlockWithSDVertices(theCB: BOPDS_CommonBlock): void;

  InitPaveBlocksForVertex(theNV: number): void;

  ReleasePaveBlocks(): void;

  IsValidShrunkData(thePB: BOPDS_PaveBlock): boolean;

  BuildBndBoxSolid(theIndex: number, theBox: Bnd_Box, theCheckInverted: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_FaceInfo: declare class BOPDS_FaceInfo

  constructor

  Clear(): void;

  SetIndex(theI: number): void;

  Index(): number;

  PaveBlocksIn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  ChangePaveBlocksIn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  VerticesIn(): NCollection_Map_int;

  ChangeVerticesIn(): NCollection_Map_int;

  PaveBlocksOn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  ChangePaveBlocksOn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  VerticesOn(): NCollection_Map_int;

  ChangeVerticesOn(): NCollection_Map_int;

  PaveBlocksSc(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  ChangePaveBlocksSc(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  VerticesSc(): NCollection_Map_int;

  ChangeVerticesSc(): NCollection_Map_int;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_IndexRange: declare class BOPDS_IndexRange

  constructor

  SetFirst(theI1: number): void;

  SetLast(theI2: number): void;

  First(): number;

  Last(): number;

  SetIndices(theI1: number, theI2: number): void;

  Indices(theI1?: number, theI2?: number): { theI1: number; theI2: number };

  Contains(theIndex: number): boolean;

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_Interf: declare class BOPDS_Interf

  SetIndices(theIndex1: number, theIndex2: number): void;

  Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

  SetIndex1(theIndex: number): void;

  SetIndex2(theIndex: number): void;

  Index1(): number;

  Index2(): number;

  OppositeIndex(theI: number): number;

  Contains(theIndex: number): boolean;

  SetIndexNew(theIndex: number): void;

  IndexNew(): number;

  HasIndexNew(theIndex?: number): { returnValue: boolean; theIndex: number };
  HasIndexNew(): boolean;
  HasIndexNew(theIndex?: number): { returnValue: boolean; theIndex: number };
  HasIndexNew(): boolean;

  GetIndexNew(): number | null | undefined;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfEE: declare class BOPDS_InterfEE extends BOPDS_Interf

  constructor

  SetCommonPart(theCP: IntTools_CommonPrt): void;

  CommonPart(): IntTools_CommonPrt;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfEF: declare class BOPDS_InterfEF extends BOPDS_Interf

  constructor

  SetCommonPart(theCP: IntTools_CommonPrt): void;

  CommonPart(): IntTools_CommonPrt;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfEZ: declare class BOPDS_InterfEZ extends BOPDS_Interf

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfFF: declare class BOPDS_InterfFF extends BOPDS_Interf

  constructor

  Init(theNbCurves: number, theNbPoints: number): void;

  SetTangentFaces(theFlag: boolean): void;

  TangentFaces(): boolean;

  Curves(): NCollection_DynamicArray_BOPDS_Curve;

  ChangeCurves(): NCollection_DynamicArray_BOPDS_Curve;

  Points(): NCollection_DynamicArray_BOPDS_Point;

  ChangePoints(): NCollection_DynamicArray_BOPDS_Point;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfFZ: declare class BOPDS_InterfFZ extends BOPDS_Interf

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfVE: declare class BOPDS_InterfVE extends BOPDS_Interf

  constructor

  SetParameter(theT: number): void;

  Parameter(): number;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfVF: declare class BOPDS_InterfVF extends BOPDS_Interf

  constructor

  SetUV(theU: number, theV: number): void;

  UV(theU?: number, theV?: number): { theU: number; theV: number };

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfVV: declare class BOPDS_InterfVV extends BOPDS_Interf

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfVZ: declare class BOPDS_InterfVZ extends BOPDS_Interf

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_InterfZZ: declare class BOPDS_InterfZZ extends BOPDS_Interf

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_Pair: declare class BOPDS_Pair

  constructor

  SetIndices(theIndex1: number, theIndex2: number): void;

  Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

  IsEqual(theOther: BOPDS_Pair): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_Pave: declare class BOPDS_Pave

  constructor

  SetIndex(theIndex: number): void;

  Index(): number;

  SetParameter(theParameter: number): void;

  Parameter(): number;

  Contents(theIndex?: number, theParameter?: number): { theIndex: number; theParameter: number };

  IsLess(theOther: BOPDS_Pave): boolean;

  IsEqual(theOther: BOPDS_Pave): boolean;

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_PaveBlock: declare class BOPDS_PaveBlock extends Standard_Transient

  constructor

  SetPave1(thePave: BOPDS_Pave): void;

  Pave1(): BOPDS_Pave;

  SetPave2(thePave: BOPDS_Pave): void;

  Pave2(): BOPDS_Pave;

  SetEdge(theEdge: number): void;

  Edge(): number;

  HasEdge(): boolean;
  HasEdge(theEdge?: number): { returnValue: boolean; theEdge: number };
  HasEdge(): boolean;
  HasEdge(theEdge?: number): { returnValue: boolean; theEdge: number };

  SetOriginalEdge(theEdge: number): void;

  OriginalEdge(): number;

  IsSplitEdge(): boolean;

  Range(theT1?: number, theT2?: number): { theT1: number; theT2: number };

  HasSameBounds(theOther: BOPDS_PaveBlock): boolean;

  Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

  IsToUpdate(): boolean;

  AppendExtPave(thePave: BOPDS_Pave): void;

  AppendExtPave1(thePave: BOPDS_Pave): void;

  RemoveExtPave(theVertNum: number): void;

  ExtPaves(): NCollection_List_BOPDS_Pave;

  ChangeExtPaves(): NCollection_List_BOPDS_Pave;

  Update(theLPB: NCollection_List_handle_BOPDS_PaveBlock, theFlag: boolean): void;

  ContainsParameter(thePrm: number, theTol: number, theInd?: number): { returnValue: boolean; theInd: number };

  SetShrunkData(theTS1: number, theTS2: number, theBox: Bnd_Box, theIsSplittable: boolean): void;

  ShrunkData(theTS1: number, theTS2: number, theBox: Bnd_Box, theIsSplittable?: boolean): { theTS1: number; theTS2: number; theIsSplittable: boolean };

  HasShrunkData(): boolean;

  Dump(): void;

  IsSplittable(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_Point: declare class BOPDS_Point

  constructor

  SetPnt(thePnt: gp_Pnt): void;

  Pnt(): gp_Pnt;

  SetPnt2D1(thePnt: gp_Pnt2d): void;

  Pnt2D1(): gp_Pnt2d;

  SetPnt2D2(thePnt: gp_Pnt2d): void;

  Pnt2D2(): gp_Pnt2d;

  SetIndex(theIndex: number): void;

  Index(): number;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_ShapeInfo: declare class BOPDS_ShapeInfo

  constructor

  SetShape(theS: TopoDS_Shape): void;

  Shape(): TopoDS_Shape;

  SetShapeType(theType: TopAbs_ShapeEnum): void;

  ShapeType(): TopAbs_ShapeEnum;

  SetBox(theBox: Bnd_Box): void;

  Box(): Bnd_Box;

  ChangeBox(): Bnd_Box;

  SubShapes(): NCollection_List_int;

  ChangeSubShapes(): NCollection_List_int;

  HasSubShape(theI: number): boolean;

  HasReference(): boolean;

  SetReference(theI: number): void;

  Reference(): number;

  HasBRep(): boolean;

  IsInterfering(): boolean;

  HasFlag(): boolean;
  HasFlag(theFlag?: number): { returnValue: boolean; theFlag: number };
  HasFlag(): boolean;
  HasFlag(theFlag?: number): { returnValue: boolean; theFlag: number };

  SetFlag(theI: number): void;

  Flag(): number;

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_SubIterator: declare class BOPDS_SubIterator

  constructor

  SetDS(pDS: BOPDS_DS): void;

  DS(): BOPDS_DS;

  SetSubSet1(theLI: NCollection_List_int): void;

  SubSet1(): NCollection_List_int;

  SetSubSet2(theLI: NCollection_List_int): void;

  SubSet2(): NCollection_List_int;

  Initialize(): void;

  More(): boolean;

  Next(): void;

  Value(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

  Prepare(): void;

  ExpectedLength(): number;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_Tools: declare class BOPDS_Tools

  constructor

  static TypeToInteger(theT1: TopAbs_ShapeEnum, theT2: TopAbs_ShapeEnum): number;
  static TypeToInteger(theT: TopAbs_ShapeEnum): number;
  static TypeToInteger(theT1: TopAbs_ShapeEnum, theT2: TopAbs_ShapeEnum): number;
  static TypeToInteger(theT: TopAbs_ShapeEnum): number;

  static HasBRep(theT: TopAbs_ShapeEnum): boolean;

  static IsInterfering(theT: TopAbs_ShapeEnum): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BOPDS_ListOfPave: NCollection_List_BOPDS_Pave

BOPDS_VectorOfCurve: NCollection_DynamicArray_BOPDS_Curve

BOPDS_VectorOfFaceInfo: NCollection_DynamicArray_BOPDS_FaceInfo

BOPDS_VectorOfInterfEE: NCollection_DynamicArray_BOPDS_InterfEE

BOPDS_VectorOfInterfEF: NCollection_DynamicArray_BOPDS_InterfEF

BOPDS_VectorOfInterfEZ: NCollection_DynamicArray_BOPDS_InterfEZ

BOPDS_VectorOfInterfFF: NCollection_DynamicArray_BOPDS_InterfFF

BOPDS_VectorOfInterfFZ: NCollection_DynamicArray_BOPDS_InterfFZ

BOPDS_VectorOfInterfVE: NCollection_DynamicArray_BOPDS_InterfVE

BOPDS_VectorOfInterfVF: NCollection_DynamicArray_BOPDS_InterfVF

BOPDS_VectorOfInterfVV: NCollection_DynamicArray_BOPDS_InterfVV

BOPDS_VectorOfInterfVZ: NCollection_DynamicArray_BOPDS_InterfVZ

BOPDS_VectorOfInterfZZ: NCollection_DynamicArray_BOPDS_InterfZZ

BOPDS_VectorOfPoint: NCollection_DynamicArray_BOPDS_Point
