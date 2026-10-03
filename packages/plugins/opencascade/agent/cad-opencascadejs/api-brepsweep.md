# libcascade — BRepSweep

9 top-level symbols. Signatures are verbatim typescript.

BRepSweep_Builder: declare class BRepSweep_Builder

  // BRepSweep_Builder.constructor (constructor)
  constructor(aBuilder: BRep_Builder);

  // BRepSweep_Builder.Builder (method)
  Builder(): BRep_Builder;

  // BRepSweep_Builder.MakeCompound (method)
  MakeCompound(aCompound: TopoDS_Shape): void;

  // BRepSweep_Builder.MakeCompSolid (method)
  MakeCompSolid(aCompSolid: TopoDS_Shape): void;

  // BRepSweep_Builder.MakeSolid (method)
  MakeSolid(aSolid: TopoDS_Shape): void;

  // BRepSweep_Builder.MakeShell (method)
  MakeShell(aShell: TopoDS_Shape): void;

  // BRepSweep_Builder.MakeWire (method)
  MakeWire(aWire: TopoDS_Shape): void;

  // BRepSweep_Builder.Add (method)
  Add(aShape1: TopoDS_Shape, aShape2: TopoDS_Shape, Orient: TopAbs_Orientation): void;
  Add(aShape1: TopoDS_Shape, aShape2: TopoDS_Shape): void;

  // BRepSweep_Builder.delete (method)
  delete(): void;

  // BRepSweep_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepSweep_Iterator: declare class BRepSweep_Iterator

  // BRepSweep_Iterator.constructor (constructor)
  constructor();

  // BRepSweep_Iterator.Init (method)
  Init(aShape: TopoDS_Shape): void;

  // BRepSweep_Iterator.More (method)
  More(): boolean;

  // BRepSweep_Iterator.Next (method)
  Next(): void;

  // BRepSweep_Iterator.Value (method)
  Value(): TopoDS_Shape;

  // BRepSweep_Iterator.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // BRepSweep_Iterator.delete (method)
  delete(): void;

  // BRepSweep_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepSweep_NumLinearRegularSweep: declare class BRepSweep_NumLinearRegularSweep

  // BRepSweep_NumLinearRegularSweep.MakeEmptyVertex (method)
  MakeEmptyVertex(aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_NumLinearRegularSweep.MakeEmptyDirectingEdge (method)
  MakeEmptyDirectingEdge(aGenV: TopoDS_Shape, aDirE: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_NumLinearRegularSweep.MakeEmptyGeneratingEdge (method)
  MakeEmptyGeneratingEdge(aGenE: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_NumLinearRegularSweep.SetParameters (method)
  SetParameters(aNewFace: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenF: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

  // BRepSweep_NumLinearRegularSweep.SetDirectingParameter (method)
  SetDirectingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape): void;

  // BRepSweep_NumLinearRegularSweep.SetGeneratingParameter (method)
  SetGeneratingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

  // BRepSweep_NumLinearRegularSweep.MakeEmptyFace (method)
  MakeEmptyFace(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_NumLinearRegularSweep.SetPCurve (method)
  SetPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenF: TopoDS_Shape, aGenE: TopoDS_Shape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_NumLinearRegularSweep.SetGeneratingPCurve (method)
  SetGeneratingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_NumLinearRegularSweep.SetDirectingPCurve (method)
  SetDirectingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_NumLinearRegularSweep.DirectSolid (method)
  DirectSolid(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopAbs_Orientation;

  // BRepSweep_NumLinearRegularSweep.GGDShapeIsToAdd (method)
  GGDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_NumLinearRegularSweep.GDDShapeIsToAdd (method)
  GDDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aDirS: Sweep_NumShape, aSubDirS: Sweep_NumShape): boolean;

  // BRepSweep_NumLinearRegularSweep.SeparatedWires (method)
  SeparatedWires(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_NumLinearRegularSweep.SplitShell (method)
  SplitShell(aNewShape: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_NumLinearRegularSweep.SetContinuity (method)
  SetContinuity(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): void;

  // BRepSweep_NumLinearRegularSweep.HasShape (method)
  HasShape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_NumLinearRegularSweep.IsInvariant (method)
  IsInvariant(aGenS: TopoDS_Shape): boolean;

  // BRepSweep_NumLinearRegularSweep.Shape (method)
  Shape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;
  Shape(aGenS: TopoDS_Shape): TopoDS_Shape;
  Shape(): TopoDS_Shape;

  // BRepSweep_NumLinearRegularSweep.IsUsed (method)
  IsUsed(aGenS: TopoDS_Shape): boolean;

  // BRepSweep_NumLinearRegularSweep.GenIsUsed (method)
  GenIsUsed(theS: TopoDS_Shape): boolean;

  // BRepSweep_NumLinearRegularSweep.FirstShape (method)
  FirstShape(): TopoDS_Shape;
  FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_NumLinearRegularSweep.LastShape (method)
  LastShape(): TopoDS_Shape;
  LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_NumLinearRegularSweep.Closed (method)
  Closed(): boolean;

  // BRepSweep_NumLinearRegularSweep.delete (method)
  delete(): void;

  // BRepSweep_NumLinearRegularSweep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepSweep_Prism: declare class BRepSweep_Prism

  // BRepSweep_Prism.constructor (constructor)
  constructor(S: TopoDS_Shape, V: gp_Vec, Copy?: boolean, Canonize?: boolean);
  constructor(S: TopoDS_Shape, D: gp_Dir, Inf?: boolean, Copy?: boolean, Canonize?: boolean);

  // BRepSweep_Prism.Shape (method)
  Shape(): TopoDS_Shape;
  Shape(aGenS: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_Prism.FirstShape (method)
  FirstShape(): TopoDS_Shape;
  FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_Prism.LastShape (method)
  LastShape(): TopoDS_Shape;
  LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_Prism.Vec (method)
  Vec(): gp_Vec;

  // BRepSweep_Prism.IsUsed (method)
  IsUsed(aGenS: TopoDS_Shape): boolean;

  // BRepSweep_Prism.GenIsUsed (method)
  GenIsUsed(theS: TopoDS_Shape): boolean;

  // BRepSweep_Prism.delete (method)
  delete(): void;

  // BRepSweep_Prism.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepSweep_Revol: declare class BRepSweep_Revol

  // BRepSweep_Revol.constructor (constructor)
  constructor(S: TopoDS_Shape, A: gp_Ax1, C?: boolean);
  constructor(S: TopoDS_Shape, A: gp_Ax1, D: number, C?: boolean);

  // BRepSweep_Revol.Shape (method)
  Shape(): TopoDS_Shape;
  Shape(aGenS: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_Revol.FirstShape (method)
  FirstShape(): TopoDS_Shape;
  FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_Revol.LastShape (method)
  LastShape(): TopoDS_Shape;
  LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_Revol.Axe (method)
  Axe(): gp_Ax1;

  // BRepSweep_Revol.Angle (method)
  Angle(): number;

  // BRepSweep_Revol.IsUsed (method)
  IsUsed(aGenS: TopoDS_Shape): boolean;

  // BRepSweep_Revol.delete (method)
  delete(): void;

  // BRepSweep_Revol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepSweep_Rotation: declare class BRepSweep_Rotation extends BRepSweep_Trsf

  // BRepSweep_Rotation.constructor (constructor)
  constructor(S: TopoDS_Shape, N: Sweep_NumShape, L: TopLoc_Location, A: gp_Ax1, D: number, C: boolean);

  // BRepSweep_Rotation.MakeEmptyVertex (method)
  MakeEmptyVertex(aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Rotation.MakeEmptyDirectingEdge (method)
  MakeEmptyDirectingEdge(aGenV: TopoDS_Shape, aDirE: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Rotation.MakeEmptyGeneratingEdge (method)
  MakeEmptyGeneratingEdge(aGenE: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Rotation.SetParameters (method)
  SetParameters(aNewFace: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenF: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Rotation.SetDirectingParameter (method)
  SetDirectingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Rotation.SetGeneratingParameter (method)
  SetGeneratingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Rotation.MakeEmptyFace (method)
  MakeEmptyFace(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Rotation.SetPCurve (method)
  SetPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenF: TopoDS_Shape, aGenE: TopoDS_Shape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Rotation.SetGeneratingPCurve (method)
  SetGeneratingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Rotation.SetDirectingPCurve (method)
  SetDirectingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Rotation.DirectSolid (method)
  DirectSolid(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopAbs_Orientation;

  // BRepSweep_Rotation.GGDShapeIsToAdd (method)
  GGDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Rotation.GDDShapeIsToAdd (method)
  GDDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aDirS: Sweep_NumShape, aSubDirS: Sweep_NumShape): boolean;

  // BRepSweep_Rotation.SeparatedWires (method)
  SeparatedWires(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Rotation.SplitShell (method)
  SplitShell(aNewShape: TopoDS_Shape): TopoDS_Shape;

  // BRepSweep_Rotation.HasShape (method)
  HasShape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Rotation.IsInvariant (method)
  IsInvariant(aGenS: TopoDS_Shape): boolean;

  // BRepSweep_Rotation.Axe (method)
  Axe(): gp_Ax1;

  // BRepSweep_Rotation.Angle (method)
  Angle(): number;

  // BRepSweep_Rotation.delete (method)
  delete(): void;

  // BRepSweep_Rotation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepSweep_Tool: declare class BRepSweep_Tool

  // BRepSweep_Tool.constructor (constructor)
  constructor(aShape: TopoDS_Shape);

  // BRepSweep_Tool.NbShapes (method)
  NbShapes(): number;

  // BRepSweep_Tool.Index (method)
  Index(aShape: TopoDS_Shape): number;

  // BRepSweep_Tool.Shape (method)
  Shape(anIndex: number): TopoDS_Shape;

  // BRepSweep_Tool.Type (method)
  Type(aShape: TopoDS_Shape): TopAbs_ShapeEnum;

  // BRepSweep_Tool.Orientation (method)
  Orientation(aShape: TopoDS_Shape): TopAbs_Orientation;

  // BRepSweep_Tool.SetOrientation (method)
  SetOrientation(aShape: TopoDS_Shape, Or: TopAbs_Orientation): void;

  // BRepSweep_Tool.delete (method)
  delete(): void;

  // BRepSweep_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepSweep_Translation: declare class BRepSweep_Translation extends BRepSweep_Trsf

  // BRepSweep_Translation.constructor (constructor)
  constructor(S: TopoDS_Shape, N: Sweep_NumShape, L: TopLoc_Location, V: gp_Vec, C: boolean, Canonize?: boolean);

  // BRepSweep_Translation.MakeEmptyVertex (method)
  MakeEmptyVertex(aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Translation.MakeEmptyDirectingEdge (method)
  MakeEmptyDirectingEdge(aGenV: TopoDS_Shape, aDirE: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Translation.MakeEmptyGeneratingEdge (method)
  MakeEmptyGeneratingEdge(aGenE: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Translation.SetParameters (method)
  SetParameters(aNewFace: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenF: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Translation.SetDirectingParameter (method)
  SetDirectingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Translation.SetGeneratingParameter (method)
  SetGeneratingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Translation.MakeEmptyFace (method)
  MakeEmptyFace(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Translation.SetPCurve (method)
  SetPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenF: TopoDS_Shape, aGenE: TopoDS_Shape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Translation.SetGeneratingPCurve (method)
  SetGeneratingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Translation.SetDirectingPCurve (method)
  SetDirectingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Translation.DirectSolid (method)
  DirectSolid(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopAbs_Orientation;

  // BRepSweep_Translation.GGDShapeIsToAdd (method)
  GGDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Translation.GDDShapeIsToAdd (method)
  GDDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aDirS: Sweep_NumShape, aSubDirS: Sweep_NumShape): boolean;

  // BRepSweep_Translation.SeparatedWires (method)
  SeparatedWires(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Translation.HasShape (method)
  HasShape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Translation.IsInvariant (method)
  IsInvariant(aGenS: TopoDS_Shape): boolean;

  // BRepSweep_Translation.Vec (method)
  Vec(): gp_Vec;

  // BRepSweep_Translation.delete (method)
  delete(): void;

  // BRepSweep_Translation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepSweep_Trsf: declare class BRepSweep_Trsf extends BRepSweep_NumLinearRegularSweep

  // BRepSweep_Trsf.Init (method)
  Init(): void;

  // BRepSweep_Trsf.Process (method)
  Process(aGenS: TopoDS_Shape, aDirV: Sweep_NumShape): boolean;

  // BRepSweep_Trsf.MakeEmptyVertex (method)
  MakeEmptyVertex(aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Trsf.MakeEmptyDirectingEdge (method)
  MakeEmptyDirectingEdge(aGenV: TopoDS_Shape, aDirE: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Trsf.MakeEmptyGeneratingEdge (method)
  MakeEmptyGeneratingEdge(aGenE: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Trsf.SetParameters (method)
  SetParameters(aNewFace: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenF: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Trsf.SetDirectingParameter (method)
  SetDirectingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Trsf.SetGeneratingParameter (method)
  SetGeneratingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

  // BRepSweep_Trsf.MakeEmptyFace (method)
  MakeEmptyFace(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;

  // BRepSweep_Trsf.SetPCurve (method)
  SetPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenF: TopoDS_Shape, aGenE: TopoDS_Shape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Trsf.SetGeneratingPCurve (method)
  SetGeneratingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Trsf.SetDirectingPCurve (method)
  SetDirectingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, orien: TopAbs_Orientation): void;

  // BRepSweep_Trsf.GGDShapeIsToAdd (method)
  GGDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Trsf.GDDShapeIsToAdd (method)
  GDDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aDirS: Sweep_NumShape, aSubDirS: Sweep_NumShape): boolean;

  // BRepSweep_Trsf.SeparatedWires (method)
  SeparatedWires(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Trsf.HasShape (method)
  HasShape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

  // BRepSweep_Trsf.IsInvariant (method)
  IsInvariant(aGenS: TopoDS_Shape): boolean;

  // BRepSweep_Trsf.SetContinuity (method)
  SetContinuity(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): void;

  // BRepSweep_Trsf.delete (method)
  delete(): void;

  // BRepSweep_Trsf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
