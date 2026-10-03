# libcascade — Sweep

3 top-level symbols. Signatures are verbatim typescript.

Sweep_NumShape: declare class Sweep_NumShape

  // Sweep_NumShape.constructor (constructor)
  constructor();
  constructor(Index: number, Type: TopAbs_ShapeEnum, Closed?: boolean, BegInf?: boolean, EndInf?: boolean);

  // Sweep_NumShape.Init (method)
  Init(Index: number, Type: TopAbs_ShapeEnum, Closed?: boolean, BegInf?: boolean, EndInf?: boolean): void;

  // Sweep_NumShape.Index (method)
  Index(): number;

  // Sweep_NumShape.Type (method)
  Type(): TopAbs_ShapeEnum;

  // Sweep_NumShape.Closed (method)
  Closed(): boolean;

  // Sweep_NumShape.BegInfinite (method)
  BegInfinite(): boolean;

  // Sweep_NumShape.EndInfinite (method)
  EndInfinite(): boolean;

  // Sweep_NumShape.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // Sweep_NumShape.delete (method)
  delete(): void;

  // Sweep_NumShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Sweep_NumShapeIterator: declare class Sweep_NumShapeIterator

  // Sweep_NumShapeIterator.constructor (constructor)
  constructor();

  // Sweep_NumShapeIterator.Init (method)
  Init(aShape: Sweep_NumShape): void;

  // Sweep_NumShapeIterator.More (method)
  More(): boolean;

  // Sweep_NumShapeIterator.Next (method)
  Next(): void;

  // Sweep_NumShapeIterator.Value (method)
  Value(): Sweep_NumShape;

  // Sweep_NumShapeIterator.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // Sweep_NumShapeIterator.delete (method)
  delete(): void;

  // Sweep_NumShapeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Sweep_NumShapeTool: declare class Sweep_NumShapeTool

  // Sweep_NumShapeTool.constructor (constructor)
  constructor(aShape: Sweep_NumShape);

  // Sweep_NumShapeTool.NbShapes (method)
  NbShapes(): number;

  // Sweep_NumShapeTool.Index (method)
  Index(aShape: Sweep_NumShape): number;

  // Sweep_NumShapeTool.Shape (method)
  Shape(anIndex: number): Sweep_NumShape;

  // Sweep_NumShapeTool.Type (method)
  Type(aShape: Sweep_NumShape): TopAbs_ShapeEnum;

  // Sweep_NumShapeTool.Orientation (method)
  Orientation(aShape: Sweep_NumShape): TopAbs_Orientation;

  // Sweep_NumShapeTool.HasFirstVertex (method)
  HasFirstVertex(): boolean;

  // Sweep_NumShapeTool.HasLastVertex (method)
  HasLastVertex(): boolean;

  // Sweep_NumShapeTool.FirstVertex (method)
  FirstVertex(): Sweep_NumShape;

  // Sweep_NumShapeTool.LastVertex (method)
  LastVertex(): Sweep_NumShape;

  // Sweep_NumShapeTool.delete (method)
  delete(): void;

  // Sweep_NumShapeTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
