# libcascade — BRepMAT2d

3 top-level symbols. Signatures are verbatim typescript.

BRepMAT2d_BisectingLocus: declare class BRepMAT2d_BisectingLocus

  // BRepMAT2d_BisectingLocus.constructor (constructor)
  constructor();

  // BRepMAT2d_BisectingLocus.Compute (method)
  Compute(anExplo: BRepMAT2d_Explorer, LineIndex: number, aSide: MAT_Side, aJoinType: GeomAbs_JoinType, IsOpenResult: boolean): void;

  // BRepMAT2d_BisectingLocus.IsDone (method)
  IsDone(): boolean;

  // BRepMAT2d_BisectingLocus.Graph (method)
  Graph(): MAT_Graph;

  // BRepMAT2d_BisectingLocus.NumberOfContours (method)
  NumberOfContours(): number;

  // BRepMAT2d_BisectingLocus.NumberOfElts (method)
  NumberOfElts(IndLine: number): number;

  // BRepMAT2d_BisectingLocus.NumberOfSections (method)
  NumberOfSections(IndLine: number, Index: number): number;

  // BRepMAT2d_BisectingLocus.BasicElt (method)
  BasicElt(IndLine: number, Index: number): MAT_BasicElt;

  // BRepMAT2d_BisectingLocus.GeomElt (method)
  GeomElt(aBasicElt: MAT_BasicElt): Geom2d_Geometry;
  GeomElt(aNode: MAT_Node): gp_Pnt2d;

  // BRepMAT2d_BisectingLocus.GeomBis (method)
  GeomBis(anArc: MAT_Arc, Reverse?: boolean): { returnValue: Bisector_Bisec; Reverse: boolean; [Symbol.dispose](): void };

  // BRepMAT2d_BisectingLocus.delete (method)
  delete(): void;

  // BRepMAT2d_BisectingLocus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMAT2d_Explorer: declare class BRepMAT2d_Explorer

  // BRepMAT2d_Explorer.constructor (constructor)
  constructor();
  constructor(aFace: TopoDS_Face);

  // BRepMAT2d_Explorer.Clear (method)
  Clear(): void;

  // BRepMAT2d_Explorer.Perform (method)
  Perform(aFace: TopoDS_Face): void;

  // BRepMAT2d_Explorer.NumberOfContours (method)
  NumberOfContours(): number;

  // BRepMAT2d_Explorer.NumberOfCurves (method)
  NumberOfCurves(IndexContour: number): number;

  // BRepMAT2d_Explorer.Init (method)
  Init(IndexContour: number): void;

  // BRepMAT2d_Explorer.More (method)
  More(): boolean;

  // BRepMAT2d_Explorer.Next (method)
  Next(): void;

  // BRepMAT2d_Explorer.Value (method)
  Value(): Geom2d_Curve;

  // BRepMAT2d_Explorer.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepMAT2d_Explorer.Contour (method)
  Contour(IndexContour: number): NCollection_Sequence_handle_Geom2d_Curve;

  // BRepMAT2d_Explorer.IsModified (method)
  IsModified(aShape: TopoDS_Shape): boolean;

  // BRepMAT2d_Explorer.ModifiedShape (method)
  ModifiedShape(aShape: TopoDS_Shape): TopoDS_Shape;

  // BRepMAT2d_Explorer.GetIsClosed (method)
  GetIsClosed(): NCollection_Sequence_bool;

  // BRepMAT2d_Explorer.delete (method)
  delete(): void;

  // BRepMAT2d_Explorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMAT2d_LinkTopoBilo: declare class BRepMAT2d_LinkTopoBilo

  // BRepMAT2d_LinkTopoBilo.constructor (constructor)
  constructor();
  constructor(Explo: BRepMAT2d_Explorer, BiLo: BRepMAT2d_BisectingLocus);

  // BRepMAT2d_LinkTopoBilo.Perform (method)
  Perform(Explo: BRepMAT2d_Explorer, BiLo: BRepMAT2d_BisectingLocus): void;

  // BRepMAT2d_LinkTopoBilo.Init (method)
  Init(S: TopoDS_Shape): void;

  // BRepMAT2d_LinkTopoBilo.More (method)
  More(): boolean;

  // BRepMAT2d_LinkTopoBilo.Next (method)
  Next(): void;

  // BRepMAT2d_LinkTopoBilo.Value (method)
  Value(): MAT_BasicElt;

  // BRepMAT2d_LinkTopoBilo.GeneratingShape (method)
  GeneratingShape(aBE: MAT_BasicElt): TopoDS_Shape;

  // BRepMAT2d_LinkTopoBilo.delete (method)
  delete(): void;

  // BRepMAT2d_LinkTopoBilo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
