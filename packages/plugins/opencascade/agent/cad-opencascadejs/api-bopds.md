# libcascade — BOPDS

38 top-level symbols. Signatures are verbatim typescript.

BOPDS_CommonBlock: declare class BOPDS_CommonBlock extends Standard_Transient

  // BOPDS_CommonBlock.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_CommonBlock.AddPaveBlock (method)
  AddPaveBlock(aPB: BOPDS_PaveBlock): void;

  // BOPDS_CommonBlock.SetPaveBlocks (method)
  SetPaveBlocks(aLPB: NCollection_List_handle_BOPDS_PaveBlock): void;

  // BOPDS_CommonBlock.AddFace (method)
  AddFace(aF: number): void;

  // BOPDS_CommonBlock.SetFaces (method)
  SetFaces(aLF: NCollection_List_int): void;

  // BOPDS_CommonBlock.AppendFaces (method)
  AppendFaces(aLF: NCollection_List_int): void;

  // BOPDS_CommonBlock.PaveBlocks (method)
  PaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

  // BOPDS_CommonBlock.Faces (method)
  Faces(): NCollection_List_int;

  // BOPDS_CommonBlock.PaveBlock1 (method)
  PaveBlock1(): BOPDS_PaveBlock;

  // BOPDS_CommonBlock.PaveBlockOnEdge (method)
  PaveBlockOnEdge(theIndex: number): BOPDS_PaveBlock;

  // BOPDS_CommonBlock.IsPaveBlockOnFace (method)
  IsPaveBlockOnFace(theIndex: number): boolean;

  // BOPDS_CommonBlock.IsPaveBlockOnEdge (method)
  IsPaveBlockOnEdge(theIndex: number): boolean;

  // BOPDS_CommonBlock.Contains (method)
  Contains(thePB: BOPDS_PaveBlock): boolean;
  Contains(theF: number): boolean;

  // BOPDS_CommonBlock.SetEdge (method)
  SetEdge(theEdge: number): void;

  // BOPDS_CommonBlock.Edge (method)
  Edge(): number;

  // BOPDS_CommonBlock.Dump (method)
  Dump(): void;

  // BOPDS_CommonBlock.SetRealPaveBlock (method)
  SetRealPaveBlock(thePB: BOPDS_PaveBlock): void;

  // BOPDS_CommonBlock.SetTolerance (method)
  SetTolerance(theTol: number): void;

  // BOPDS_CommonBlock.Tolerance (method)
  Tolerance(): number;

  // BOPDS_CommonBlock.get_type_name (method)
  static get_type_name(): string;

  // BOPDS_CommonBlock.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BOPDS_CommonBlock.DynamicType (method)
  DynamicType(): Standard_Type;

  // BOPDS_CommonBlock.delete (method)
  delete(): void;

  // BOPDS_CommonBlock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_CoupleOfPaveBlocks: declare class BOPDS_CoupleOfPaveBlocks

  // BOPDS_CoupleOfPaveBlocks.constructor (constructor)
  constructor();
  constructor(thePB1: BOPDS_PaveBlock, thePB2: BOPDS_PaveBlock);

  // BOPDS_CoupleOfPaveBlocks.SetIndex (method)
  SetIndex(theIndex: number): void;

  // BOPDS_CoupleOfPaveBlocks.Index (method)
  Index(): number;

  // BOPDS_CoupleOfPaveBlocks.SetIndexInterf (method)
  SetIndexInterf(theIndex: number): void;

  // BOPDS_CoupleOfPaveBlocks.IndexInterf (method)
  IndexInterf(): number;

  // BOPDS_CoupleOfPaveBlocks.SetPaveBlocks (method)
  SetPaveBlocks(thePB1: BOPDS_PaveBlock, thePB2: BOPDS_PaveBlock): void;

  // DEPRECATED
  // BOPDS_CoupleOfPaveBlocks.PaveBlocks (method)
  PaveBlocks(): { thePB1: BOPDS_PaveBlock; thePB2: BOPDS_PaveBlock; [Symbol.dispose](): void };

  // BOPDS_CoupleOfPaveBlocks.SetPaveBlock1 (method)
  SetPaveBlock1(thePB: BOPDS_PaveBlock): void;

  // BOPDS_CoupleOfPaveBlocks.PaveBlock1 (method)
  PaveBlock1(): BOPDS_PaveBlock;

  // BOPDS_CoupleOfPaveBlocks.SetPaveBlock2 (method)
  SetPaveBlock2(thePB: BOPDS_PaveBlock): void;

  // BOPDS_CoupleOfPaveBlocks.PaveBlock2 (method)
  PaveBlock2(): BOPDS_PaveBlock;

  // BOPDS_CoupleOfPaveBlocks.SetTolerance (method)
  SetTolerance(theTol: number): void;

  // BOPDS_CoupleOfPaveBlocks.Tolerance (method)
  Tolerance(): number;

  // BOPDS_CoupleOfPaveBlocks.delete (method)
  delete(): void;

  // BOPDS_CoupleOfPaveBlocks.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_Curve: declare class BOPDS_Curve

  // BOPDS_Curve.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_Curve.SetCurve (method)
  SetCurve(theC: IntTools_Curve): void;

  // BOPDS_Curve.Curve (method)
  Curve(): IntTools_Curve;

  // BOPDS_Curve.SetBox (method)
  SetBox(theBox: Bnd_Box): void;

  // BOPDS_Curve.Box (method)
  Box(): Bnd_Box;

  // BOPDS_Curve.ChangeBox (method)
  ChangeBox(): Bnd_Box;

  // BOPDS_Curve.SetPaveBlocks (method)
  SetPaveBlocks(theLPB: NCollection_List_handle_BOPDS_PaveBlock): void;

  // BOPDS_Curve.PaveBlocks (method)
  PaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

  // BOPDS_Curve.ChangePaveBlocks (method)
  ChangePaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

  // BOPDS_Curve.InitPaveBlock1 (method)
  InitPaveBlock1(): void;

  // BOPDS_Curve.ChangePaveBlock1 (method)
  ChangePaveBlock1(): BOPDS_PaveBlock;

  // BOPDS_Curve.TechnoVertices (method)
  TechnoVertices(): NCollection_List_int;

  // BOPDS_Curve.ChangeTechnoVertices (method)
  ChangeTechnoVertices(): NCollection_List_int;

  // BOPDS_Curve.HasEdge (method)
  HasEdge(): boolean;

  // BOPDS_Curve.SetTolerance (method)
  SetTolerance(theTol: number): void;

  // BOPDS_Curve.Tolerance (method)
  Tolerance(): number;

  // BOPDS_Curve.TangentialTolerance (method)
  TangentialTolerance(): number;

  // BOPDS_Curve.delete (method)
  delete(): void;

  // BOPDS_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_DS: declare class BOPDS_DS

  // BOPDS_DS.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_DS.Clear (method)
  Clear(): void;

  // BOPDS_DS.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // BOPDS_DS.SetArguments (method)
  SetArguments(theLS: NCollection_List_TopoDS_Shape): void;

  // BOPDS_DS.Arguments (method)
  Arguments(): NCollection_List_TopoDS_Shape;

  // BOPDS_DS.Init (method)
  Init(theFuzz?: number): void;

  // BOPDS_DS.NbShapes (method)
  NbShapes(): number;

  // BOPDS_DS.NbSourceShapes (method)
  NbSourceShapes(): number;

  // BOPDS_DS.NbRanges (method)
  NbRanges(): number;

  // BOPDS_DS.Range (method)
  Range(theIndex: number): BOPDS_IndexRange;

  // BOPDS_DS.Rank (method)
  Rank(theIndex: number): number;

  // BOPDS_DS.IsNewShape (method)
  IsNewShape(theIndex: number): boolean;

  // BOPDS_DS.Append (method)
  Append(theSI: BOPDS_ShapeInfo): number;
  Append(theS: TopoDS_Shape): number;

  // BOPDS_DS.ShapeInfo (method)
  ShapeInfo(theIndex: number): BOPDS_ShapeInfo;

  // BOPDS_DS.ChangeShapeInfo (method)
  ChangeShapeInfo(theIndex: number): BOPDS_ShapeInfo;

  // BOPDS_DS.Shape (method)
  Shape(theIndex: number): TopoDS_Shape;

  // BOPDS_DS.Index (method)
  Index(theS: TopoDS_Shape): number;

  // BOPDS_DS.PaveBlocksPool (method)
  PaveBlocksPool(): NCollection_DynamicArray_NCollection_List_handle_BOPDS_PaveBlock;

  // BOPDS_DS.ChangePaveBlocksPool (method)
  ChangePaveBlocksPool(): NCollection_DynamicArray_NCollection_List_handle_BOPDS_PaveBlock;

  // BOPDS_DS.HasPaveBlocks (method)
  HasPaveBlocks(theIndex: number): boolean;

  // BOPDS_DS.PaveBlocks (method)
  PaveBlocks(theIndex: number): NCollection_List_handle_BOPDS_PaveBlock;

  // BOPDS_DS.ChangePaveBlocks (method)
  ChangePaveBlocks(theIndex: number): NCollection_List_handle_BOPDS_PaveBlock;

  // BOPDS_DS.UpdatePaveBlocks (method)
  UpdatePaveBlocks(): void;

  // BOPDS_DS.UpdatePaveBlock (method)
  UpdatePaveBlock(thePB: BOPDS_PaveBlock): void;

  // BOPDS_DS.UpdateCommonBlock (method)
  UpdateCommonBlock(theCB: BOPDS_CommonBlock, theFuzz: number): void;

  // BOPDS_DS.IsCommonBlock (method)
  IsCommonBlock(thePB: BOPDS_PaveBlock): boolean;

  // BOPDS_DS.CommonBlock (method)
  CommonBlock(thePB: BOPDS_PaveBlock): BOPDS_CommonBlock;

  // BOPDS_DS.SetCommonBlock (method)
  SetCommonBlock(thePB: BOPDS_PaveBlock, theCB: BOPDS_CommonBlock): void;

  // BOPDS_DS.RealPaveBlock (method)
  RealPaveBlock(thePB: BOPDS_PaveBlock): BOPDS_PaveBlock;

  // BOPDS_DS.IsCommonBlockOnEdge (method)
  IsCommonBlockOnEdge(thePB: BOPDS_PaveBlock): boolean;

  // BOPDS_DS.FaceInfoPool (method)
  FaceInfoPool(): NCollection_DynamicArray_BOPDS_FaceInfo;

  // BOPDS_DS.HasFaceInfo (method)
  HasFaceInfo(theIndex: number): boolean;

  // BOPDS_DS.FaceInfo (method)
  FaceInfo(theIndex: number): BOPDS_FaceInfo;

  // BOPDS_DS.ChangeFaceInfo (method)
  ChangeFaceInfo(theIndex: number): BOPDS_FaceInfo;

  // BOPDS_DS.UpdateFaceInfoIn (method)
  UpdateFaceInfoIn(theIndex: number): void;
  UpdateFaceInfoIn(theFaces: NCollection_Map_int): void;

  // BOPDS_DS.UpdateFaceInfoOn (method)
  UpdateFaceInfoOn(theIndex: number): void;
  UpdateFaceInfoOn(theFaces: NCollection_Map_int): void;

  // BOPDS_DS.FaceInfoOn (method)
  FaceInfoOn(theIndex: number, theMPB: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theMVP: NCollection_Map_int): void;

  // BOPDS_DS.FaceInfoIn (method)
  FaceInfoIn(theIndex: number, theMPB: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theMVP: NCollection_Map_int): void;

  // BOPDS_DS.AloneVertices (method)
  AloneVertices(theFaceIndex: number, theVertexList: NCollection_List_int): void;

  // BOPDS_DS.RefineFaceInfoOn (method)
  RefineFaceInfoOn(): void;

  // BOPDS_DS.RefineFaceInfoIn (method)
  RefineFaceInfoIn(): void;

  // BOPDS_DS.SubShapesOnIn (method)
  SubShapesOnIn(theFaceIndex1: number, theFaceIndex2: number, theMVOnIn: NCollection_Map_int, theMVCommon: NCollection_Map_int, thePBOnIn: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theCommonPaveBlocks: NCollection_Map_handle_BOPDS_PaveBlock): void;

  // BOPDS_DS.SharedEdges (method)
  SharedEdges(theFaceIndex1: number, theFaceIndex2: number, theEdgeList: NCollection_List_int, theAllocator: NCollection_BaseAllocator): void;

  // BOPDS_DS.ShapesSD (method)
  ShapesSD(): NCollection_DataMap_int_int;

  // BOPDS_DS.AddShapeSD (method)
  AddShapeSD(theIndex: number, theIndexSD: number): void;

  // BOPDS_DS.HasShapeSD (method)
  HasShapeSD(theIndex: number, theIndexSD?: number): { returnValue: boolean; theIndexSD: number };

  // BOPDS_DS.GetSameDomainIndex (method)
  GetSameDomainIndex(theIndex: number): number;

  // BOPDS_DS.InterfVV (method)
  InterfVV(): NCollection_DynamicArray_BOPDS_InterfVV;

  // BOPDS_DS.InterfVE (method)
  InterfVE(): NCollection_DynamicArray_BOPDS_InterfVE;

  // BOPDS_DS.InterfVF (method)
  InterfVF(): NCollection_DynamicArray_BOPDS_InterfVF;

  // BOPDS_DS.InterfEE (method)
  InterfEE(): NCollection_DynamicArray_BOPDS_InterfEE;

  // BOPDS_DS.InterfEF (method)
  InterfEF(): NCollection_DynamicArray_BOPDS_InterfEF;

  // BOPDS_DS.InterfFF (method)
  InterfFF(): NCollection_DynamicArray_BOPDS_InterfFF;

  // BOPDS_DS.InterfVZ (method)
  InterfVZ(): NCollection_DynamicArray_BOPDS_InterfVZ;

  // BOPDS_DS.InterfEZ (method)
  InterfEZ(): NCollection_DynamicArray_BOPDS_InterfEZ;

  // BOPDS_DS.InterfFZ (method)
  InterfFZ(): NCollection_DynamicArray_BOPDS_InterfFZ;

  // BOPDS_DS.InterfZZ (method)
  InterfZZ(): NCollection_DynamicArray_BOPDS_InterfZZ;

  // BOPDS_DS.NbInterfTypes (method)
  static NbInterfTypes(): number;

  // BOPDS_DS.AddInterf (method)
  AddInterf(theI1: number, theI2: number): boolean;

  // BOPDS_DS.HasInterf (method)
  HasInterf(theI: number): boolean;
  HasInterf(theI1: number, theI2: number): boolean;

  // BOPDS_DS.HasInterfShapeSubShapes (method)
  HasInterfShapeSubShapes(theIndex1: number, theIndex2: number, theAnyInterference?: boolean): boolean;

  // BOPDS_DS.HasInterfSubShapes (method)
  HasInterfSubShapes(theIndex1: number, theIndex2: number): boolean;

  // BOPDS_DS.Interferences (method)
  Interferences(): NCollection_Map_BOPDS_Pair;

  // BOPDS_DS.Dump (method)
  Dump(): void;

  // BOPDS_DS.IsSubShape (method)
  IsSubShape(theCandidate: number, theParent: number): boolean;

  // BOPDS_DS.Paves (method)
  Paves(theIndex: number, theLP: NCollection_List_BOPDS_Pave): void;

  // BOPDS_DS.UpdatePaveBlocksWithSDVertices (method)
  UpdatePaveBlocksWithSDVertices(): void;

  // BOPDS_DS.UpdatePaveBlockWithSDVertices (method)
  UpdatePaveBlockWithSDVertices(thePB: BOPDS_PaveBlock): void;

  // BOPDS_DS.UpdateCommonBlockWithSDVertices (method)
  UpdateCommonBlockWithSDVertices(theCB: BOPDS_CommonBlock): void;

  // BOPDS_DS.InitPaveBlocksForVertex (method)
  InitPaveBlocksForVertex(theNV: number): void;

  // BOPDS_DS.ReleasePaveBlocks (method)
  ReleasePaveBlocks(): void;

  // BOPDS_DS.IsValidShrunkData (method)
  IsValidShrunkData(thePB: BOPDS_PaveBlock): boolean;

  // BOPDS_DS.BuildBndBoxSolid (method)
  BuildBndBoxSolid(theIndex: number, theBox: Bnd_Box, theCheckInverted: boolean): void;

  // BOPDS_DS.delete (method)
  delete(): void;

  // BOPDS_DS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_FaceInfo: declare class BOPDS_FaceInfo

  // BOPDS_FaceInfo.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_FaceInfo.Clear (method)
  Clear(): void;

  // BOPDS_FaceInfo.SetIndex (method)
  SetIndex(theI: number): void;

  // BOPDS_FaceInfo.Index (method)
  Index(): number;

  // BOPDS_FaceInfo.PaveBlocksIn (method)
  PaveBlocksIn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  // BOPDS_FaceInfo.ChangePaveBlocksIn (method)
  ChangePaveBlocksIn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  // BOPDS_FaceInfo.VerticesIn (method)
  VerticesIn(): NCollection_Map_int;

  // BOPDS_FaceInfo.ChangeVerticesIn (method)
  ChangeVerticesIn(): NCollection_Map_int;

  // BOPDS_FaceInfo.PaveBlocksOn (method)
  PaveBlocksOn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  // BOPDS_FaceInfo.ChangePaveBlocksOn (method)
  ChangePaveBlocksOn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  // BOPDS_FaceInfo.VerticesOn (method)
  VerticesOn(): NCollection_Map_int;

  // BOPDS_FaceInfo.ChangeVerticesOn (method)
  ChangeVerticesOn(): NCollection_Map_int;

  // BOPDS_FaceInfo.PaveBlocksSc (method)
  PaveBlocksSc(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  // BOPDS_FaceInfo.ChangePaveBlocksSc (method)
  ChangePaveBlocksSc(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

  // BOPDS_FaceInfo.VerticesSc (method)
  VerticesSc(): NCollection_Map_int;

  // BOPDS_FaceInfo.ChangeVerticesSc (method)
  ChangeVerticesSc(): NCollection_Map_int;

  // BOPDS_FaceInfo.delete (method)
  delete(): void;

  // BOPDS_FaceInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_IndexRange: declare class BOPDS_IndexRange

  // BOPDS_IndexRange.constructor (constructor)
  constructor();
  constructor(theI1: number, theI2: number);

  // BOPDS_IndexRange.SetFirst (method)
  SetFirst(theI1: number): void;

  // BOPDS_IndexRange.SetLast (method)
  SetLast(theI2: number): void;

  // BOPDS_IndexRange.First (method)
  First(): number;

  // BOPDS_IndexRange.Last (method)
  Last(): number;

  // BOPDS_IndexRange.SetIndices (method)
  SetIndices(theI1: number, theI2: number): void;

  // BOPDS_IndexRange.Indices (method)
  Indices(theI1?: number, theI2?: number): { theI1: number; theI2: number };

  // BOPDS_IndexRange.Contains (method)
  Contains(theIndex: number): boolean;

  // BOPDS_IndexRange.Dump (method)
  Dump(): void;

  // BOPDS_IndexRange.delete (method)
  delete(): void;

  // BOPDS_IndexRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_Interf: declare class BOPDS_Interf

  // BOPDS_Interf.SetIndices (method)
  SetIndices(theIndex1: number, theIndex2: number): void;

  // BOPDS_Interf.Indices (method)
  Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

  // BOPDS_Interf.SetIndex1 (method)
  SetIndex1(theIndex: number): void;

  // BOPDS_Interf.SetIndex2 (method)
  SetIndex2(theIndex: number): void;

  // BOPDS_Interf.Index1 (method)
  Index1(): number;

  // BOPDS_Interf.Index2 (method)
  Index2(): number;

  // BOPDS_Interf.OppositeIndex (method)
  OppositeIndex(theI: number): number;

  // BOPDS_Interf.Contains (method)
  Contains(theIndex: number): boolean;

  // BOPDS_Interf.SetIndexNew (method)
  SetIndexNew(theIndex: number): void;

  // BOPDS_Interf.IndexNew (method)
  IndexNew(): number;

  // BOPDS_Interf.HasIndexNew (method)
  HasIndexNew(theIndex?: number): { returnValue: boolean; theIndex: number };
  HasIndexNew(): boolean;

  // BOPDS_Interf.GetIndexNew (method)
  GetIndexNew(): number | null | undefined;

  // BOPDS_Interf.delete (method)
  delete(): void;

  // BOPDS_Interf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfEE: declare class BOPDS_InterfEE extends BOPDS_Interf

  // BOPDS_InterfEE.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfEE.SetCommonPart (method)
  SetCommonPart(theCP: IntTools_CommonPrt): void;

  // BOPDS_InterfEE.CommonPart (method)
  CommonPart(): IntTools_CommonPrt;

  // BOPDS_InterfEE.delete (method)
  delete(): void;

  // BOPDS_InterfEE.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfEF: declare class BOPDS_InterfEF extends BOPDS_Interf

  // BOPDS_InterfEF.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfEF.SetCommonPart (method)
  SetCommonPart(theCP: IntTools_CommonPrt): void;

  // BOPDS_InterfEF.CommonPart (method)
  CommonPart(): IntTools_CommonPrt;

  // BOPDS_InterfEF.delete (method)
  delete(): void;

  // BOPDS_InterfEF.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfEZ: declare class BOPDS_InterfEZ extends BOPDS_Interf

  // BOPDS_InterfEZ.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfEZ.delete (method)
  delete(): void;

  // BOPDS_InterfEZ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfFF: declare class BOPDS_InterfFF extends BOPDS_Interf

  // BOPDS_InterfFF.constructor (constructor)
  constructor();

  // BOPDS_InterfFF.Init (method)
  Init(theNbCurves: number, theNbPoints: number): void;

  // BOPDS_InterfFF.SetTangentFaces (method)
  SetTangentFaces(theFlag: boolean): void;

  // BOPDS_InterfFF.TangentFaces (method)
  TangentFaces(): boolean;

  // BOPDS_InterfFF.Curves (method)
  Curves(): NCollection_DynamicArray_BOPDS_Curve;

  // BOPDS_InterfFF.ChangeCurves (method)
  ChangeCurves(): NCollection_DynamicArray_BOPDS_Curve;

  // BOPDS_InterfFF.Points (method)
  Points(): NCollection_DynamicArray_BOPDS_Point;

  // BOPDS_InterfFF.ChangePoints (method)
  ChangePoints(): NCollection_DynamicArray_BOPDS_Point;

  // BOPDS_InterfFF.delete (method)
  delete(): void;

  // BOPDS_InterfFF.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfFZ: declare class BOPDS_InterfFZ extends BOPDS_Interf

  // BOPDS_InterfFZ.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfFZ.delete (method)
  delete(): void;

  // BOPDS_InterfFZ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfVE: declare class BOPDS_InterfVE extends BOPDS_Interf

  // BOPDS_InterfVE.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfVE.SetParameter (method)
  SetParameter(theT: number): void;

  // BOPDS_InterfVE.Parameter (method)
  Parameter(): number;

  // BOPDS_InterfVE.delete (method)
  delete(): void;

  // BOPDS_InterfVE.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfVF: declare class BOPDS_InterfVF extends BOPDS_Interf

  // BOPDS_InterfVF.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfVF.SetUV (method)
  SetUV(theU: number, theV: number): void;

  // BOPDS_InterfVF.UV (method)
  UV(theU?: number, theV?: number): { theU: number; theV: number };

  // BOPDS_InterfVF.delete (method)
  delete(): void;

  // BOPDS_InterfVF.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfVV: declare class BOPDS_InterfVV extends BOPDS_Interf

  // BOPDS_InterfVV.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfVV.delete (method)
  delete(): void;

  // BOPDS_InterfVV.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfVZ: declare class BOPDS_InterfVZ extends BOPDS_Interf

  // BOPDS_InterfVZ.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfVZ.delete (method)
  delete(): void;

  // BOPDS_InterfVZ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_InterfZZ: declare class BOPDS_InterfZZ extends BOPDS_Interf

  // BOPDS_InterfZZ.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_InterfZZ.delete (method)
  delete(): void;

  // BOPDS_InterfZZ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_Pair: declare class BOPDS_Pair

  // BOPDS_Pair.constructor (constructor)
  constructor();
  constructor(theIndex1: number, theIndex2: number);

  // BOPDS_Pair.SetIndices (method)
  SetIndices(theIndex1: number, theIndex2: number): void;

  // BOPDS_Pair.Indices (method)
  Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

  // BOPDS_Pair.IsEqual (method)
  IsEqual(theOther: BOPDS_Pair): boolean;

  // BOPDS_Pair.delete (method)
  delete(): void;

  // BOPDS_Pair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_Pave: declare class BOPDS_Pave

  // BOPDS_Pave.constructor (constructor)
  constructor();
  constructor(theIndex: number, theParameter: number);

  // BOPDS_Pave.SetIndex (method)
  SetIndex(theIndex: number): void;

  // BOPDS_Pave.Index (method)
  Index(): number;

  // BOPDS_Pave.SetParameter (method)
  SetParameter(theParameter: number): void;

  // BOPDS_Pave.Parameter (method)
  Parameter(): number;

  // BOPDS_Pave.Contents (method)
  Contents(theIndex?: number, theParameter?: number): { theIndex: number; theParameter: number };

  // BOPDS_Pave.IsLess (method)
  IsLess(theOther: BOPDS_Pave): boolean;

  // BOPDS_Pave.IsEqual (method)
  IsEqual(theOther: BOPDS_Pave): boolean;

  // BOPDS_Pave.Dump (method)
  Dump(): void;

  // BOPDS_Pave.delete (method)
  delete(): void;

  // BOPDS_Pave.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_PaveBlock: declare class BOPDS_PaveBlock extends Standard_Transient

  // BOPDS_PaveBlock.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_PaveBlock.SetPave1 (method)
  SetPave1(thePave: BOPDS_Pave): void;

  // BOPDS_PaveBlock.Pave1 (method)
  Pave1(): BOPDS_Pave;

  // BOPDS_PaveBlock.SetPave2 (method)
  SetPave2(thePave: BOPDS_Pave): void;

  // BOPDS_PaveBlock.Pave2 (method)
  Pave2(): BOPDS_Pave;

  // BOPDS_PaveBlock.SetEdge (method)
  SetEdge(theEdge: number): void;

  // BOPDS_PaveBlock.Edge (method)
  Edge(): number;

  // BOPDS_PaveBlock.HasEdge (method)
  HasEdge(): boolean;
  HasEdge(theEdge?: number): { returnValue: boolean; theEdge: number };

  // BOPDS_PaveBlock.SetOriginalEdge (method)
  SetOriginalEdge(theEdge: number): void;

  // BOPDS_PaveBlock.OriginalEdge (method)
  OriginalEdge(): number;

  // BOPDS_PaveBlock.IsSplitEdge (method)
  IsSplitEdge(): boolean;

  // BOPDS_PaveBlock.Range (method)
  Range(theT1?: number, theT2?: number): { theT1: number; theT2: number };

  // BOPDS_PaveBlock.HasSameBounds (method)
  HasSameBounds(theOther: BOPDS_PaveBlock): boolean;

  // BOPDS_PaveBlock.Indices (method)
  Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

  // BOPDS_PaveBlock.IsToUpdate (method)
  IsToUpdate(): boolean;

  // BOPDS_PaveBlock.AppendExtPave (method)
  AppendExtPave(thePave: BOPDS_Pave): void;

  // BOPDS_PaveBlock.AppendExtPave1 (method)
  AppendExtPave1(thePave: BOPDS_Pave): void;

  // BOPDS_PaveBlock.RemoveExtPave (method)
  RemoveExtPave(theVertNum: number): void;

  // BOPDS_PaveBlock.ExtPaves (method)
  ExtPaves(): NCollection_List_BOPDS_Pave;

  // BOPDS_PaveBlock.ChangeExtPaves (method)
  ChangeExtPaves(): NCollection_List_BOPDS_Pave;

  // BOPDS_PaveBlock.Update (method)
  Update(theLPB: NCollection_List_handle_BOPDS_PaveBlock, theFlag: boolean): void;

  // BOPDS_PaveBlock.ContainsParameter (method)
  ContainsParameter(thePrm: number, theTol: number, theInd?: number): { returnValue: boolean; theInd: number };

  // BOPDS_PaveBlock.SetShrunkData (method)
  SetShrunkData(theTS1: number, theTS2: number, theBox: Bnd_Box, theIsSplittable: boolean): void;

  // BOPDS_PaveBlock.ShrunkData (method)
  ShrunkData(theTS1: number, theTS2: number, theBox: Bnd_Box, theIsSplittable?: boolean): { theTS1: number; theTS2: number; theIsSplittable: boolean };

  // BOPDS_PaveBlock.HasShrunkData (method)
  HasShrunkData(): boolean;

  // BOPDS_PaveBlock.Dump (method)
  Dump(): void;

  // BOPDS_PaveBlock.IsSplittable (method)
  IsSplittable(): boolean;

  // BOPDS_PaveBlock.get_type_name (method)
  static get_type_name(): string;

  // BOPDS_PaveBlock.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BOPDS_PaveBlock.DynamicType (method)
  DynamicType(): Standard_Type;

  // BOPDS_PaveBlock.delete (method)
  delete(): void;

  // BOPDS_PaveBlock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_Point: declare class BOPDS_Point

  // BOPDS_Point.constructor (constructor)
  constructor();

  // BOPDS_Point.SetPnt (method)
  SetPnt(thePnt: gp_Pnt): void;

  // BOPDS_Point.Pnt (method)
  Pnt(): gp_Pnt;

  // BOPDS_Point.SetPnt2D1 (method)
  SetPnt2D1(thePnt: gp_Pnt2d): void;

  // BOPDS_Point.Pnt2D1 (method)
  Pnt2D1(): gp_Pnt2d;

  // BOPDS_Point.SetPnt2D2 (method)
  SetPnt2D2(thePnt: gp_Pnt2d): void;

  // BOPDS_Point.Pnt2D2 (method)
  Pnt2D2(): gp_Pnt2d;

  // BOPDS_Point.SetIndex (method)
  SetIndex(theIndex: number): void;

  // BOPDS_Point.Index (method)
  Index(): number;

  // BOPDS_Point.delete (method)
  delete(): void;

  // BOPDS_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_ShapeInfo: declare class BOPDS_ShapeInfo

  // BOPDS_ShapeInfo.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_ShapeInfo.SetShape (method)
  SetShape(theS: TopoDS_Shape): void;

  // BOPDS_ShapeInfo.Shape (method)
  Shape(): TopoDS_Shape;

  // BOPDS_ShapeInfo.SetShapeType (method)
  SetShapeType(theType: TopAbs_ShapeEnum): void;

  // BOPDS_ShapeInfo.ShapeType (method)
  ShapeType(): TopAbs_ShapeEnum;

  // BOPDS_ShapeInfo.SetBox (method)
  SetBox(theBox: Bnd_Box): void;

  // BOPDS_ShapeInfo.Box (method)
  Box(): Bnd_Box;

  // BOPDS_ShapeInfo.ChangeBox (method)
  ChangeBox(): Bnd_Box;

  // BOPDS_ShapeInfo.SubShapes (method)
  SubShapes(): NCollection_List_int;

  // BOPDS_ShapeInfo.ChangeSubShapes (method)
  ChangeSubShapes(): NCollection_List_int;

  // BOPDS_ShapeInfo.HasSubShape (method)
  HasSubShape(theI: number): boolean;

  // BOPDS_ShapeInfo.HasReference (method)
  HasReference(): boolean;

  // BOPDS_ShapeInfo.SetReference (method)
  SetReference(theI: number): void;

  // BOPDS_ShapeInfo.Reference (method)
  Reference(): number;

  // BOPDS_ShapeInfo.HasBRep (method)
  HasBRep(): boolean;

  // BOPDS_ShapeInfo.IsInterfering (method)
  IsInterfering(): boolean;

  // BOPDS_ShapeInfo.HasFlag (method)
  HasFlag(): boolean;
  HasFlag(theFlag?: number): { returnValue: boolean; theFlag: number };

  // BOPDS_ShapeInfo.SetFlag (method)
  SetFlag(theI: number): void;

  // BOPDS_ShapeInfo.Flag (method)
  Flag(): number;

  // BOPDS_ShapeInfo.Dump (method)
  Dump(): void;

  // BOPDS_ShapeInfo.delete (method)
  delete(): void;

  // BOPDS_ShapeInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_SubIterator: declare class BOPDS_SubIterator

  // BOPDS_SubIterator.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPDS_SubIterator.SetDS (method)
  SetDS(pDS: BOPDS_DS): void;

  // BOPDS_SubIterator.DS (method)
  DS(): BOPDS_DS;

  // BOPDS_SubIterator.SetSubSet1 (method)
  SetSubSet1(theLI: NCollection_List_int): void;

  // BOPDS_SubIterator.SubSet1 (method)
  SubSet1(): NCollection_List_int;

  // BOPDS_SubIterator.SetSubSet2 (method)
  SetSubSet2(theLI: NCollection_List_int): void;

  // BOPDS_SubIterator.SubSet2 (method)
  SubSet2(): NCollection_List_int;

  // BOPDS_SubIterator.Initialize (method)
  Initialize(): void;

  // BOPDS_SubIterator.More (method)
  More(): boolean;

  // BOPDS_SubIterator.Next (method)
  Next(): void;

  // BOPDS_SubIterator.Value (method)
  Value(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

  // BOPDS_SubIterator.Prepare (method)
  Prepare(): void;

  // BOPDS_SubIterator.ExpectedLength (method)
  ExpectedLength(): number;

  // BOPDS_SubIterator.delete (method)
  delete(): void;

  // BOPDS_SubIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPDS_Tools: declare class BOPDS_Tools

  // BOPDS_Tools.constructor (constructor)
  constructor();

  // BOPDS_Tools.TypeToInteger (method)
  static TypeToInteger(theT1: TopAbs_ShapeEnum, theT2: TopAbs_ShapeEnum): number;
  static TypeToInteger(theT: TopAbs_ShapeEnum): number;

  // BOPDS_Tools.HasBRep (method)
  static HasBRep(theT: TopAbs_ShapeEnum): boolean;

  // BOPDS_Tools.IsInterfering (method)
  static IsInterfering(theT: TopAbs_ShapeEnum): boolean;

  // BOPDS_Tools.delete (method)
  delete(): void;

  // BOPDS_Tools.[Symbol.dispose] (method)
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
