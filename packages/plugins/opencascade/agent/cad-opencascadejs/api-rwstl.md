# libcascade — RWStl

2 top-level symbols. Signatures are verbatim typescript.

RWStl: declare class RWStl

  // RWStl.constructor (constructor)
  constructor();

  // RWStl.ReadFile (method)
  static ReadFile(theFile: string, theProgress: Message_ProgressRange): Poly_Triangulation;
  static ReadFile(theFile: string, theMergeAngle: number, theProgress: Message_ProgressRange): Poly_Triangulation;
  static ReadFile(theFile: string, theMergeAngle: number, theTriangList: NCollection_Sequence_handle_Poly_Triangulation, theProgress: Message_ProgressRange): void;

  // RWStl.delete (method)
  delete(): void;

  // RWStl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWStl_Reader: declare class RWStl_Reader extends Standard_Transient

  // RWStl_Reader.get_type_name (method)
  static get_type_name(): string;

  // RWStl_Reader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWStl_Reader.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWStl_Reader.Read (method)
  Read(theFile: string, theProgress: Message_ProgressRange): boolean;

  // RWStl_Reader.AddNode (method)
  AddNode(thePnt: gp_XYZ): number;

  // RWStl_Reader.AddTriangle (method)
  AddTriangle(theN1: number, theN2: number, theN3: number): void;

  // RWStl_Reader.AddSolid (method)
  AddSolid(): void;

  // RWStl_Reader.MergeAngle (method)
  MergeAngle(): number;

  // RWStl_Reader.SetMergeAngle (method)
  SetMergeAngle(theAngleRad: number): void;

  // RWStl_Reader.MergeTolerance (method)
  MergeTolerance(): number;

  // RWStl_Reader.SetMergeTolerance (method)
  SetMergeTolerance(theTolerance: number): void;

  // RWStl_Reader.delete (method)
  delete(): void;

  // RWStl_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
