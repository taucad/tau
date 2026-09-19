# libcascade — RWStl

2 top-level symbols. Signatures are verbatim typescript.

RWStl: declare class RWStl

  constructor

  static ReadFile(theFile: string, theProgress: Message_ProgressRange): Poly_Triangulation;
  static ReadFile(theFile: string, theMergeAngle: number, theProgress: Message_ProgressRange): Poly_Triangulation;
  static ReadFile(theFile: string, theMergeAngle: number, theTriangList: NCollection_Sequence_handle_Poly_Triangulation, theProgress: Message_ProgressRange): void;
  static ReadFile(theFile: string, theProgress: Message_ProgressRange): Poly_Triangulation;
  static ReadFile(theFile: string, theMergeAngle: number, theProgress: Message_ProgressRange): Poly_Triangulation;
  static ReadFile(theFile: string, theMergeAngle: number, theTriangList: NCollection_Sequence_handle_Poly_Triangulation, theProgress: Message_ProgressRange): void;
  static ReadFile(theFile: string, theProgress: Message_ProgressRange): Poly_Triangulation;
  static ReadFile(theFile: string, theMergeAngle: number, theProgress: Message_ProgressRange): Poly_Triangulation;
  static ReadFile(theFile: string, theMergeAngle: number, theTriangList: NCollection_Sequence_handle_Poly_Triangulation, theProgress: Message_ProgressRange): void;

  delete(): void;

  [Symbol.dispose](): void;

RWStl_Reader: declare class RWStl_Reader extends Standard_Transient

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Read(theFile: string, theProgress: Message_ProgressRange): boolean;

  AddNode(thePnt: gp_XYZ): number;

  AddTriangle(theN1: number, theN2: number, theN3: number): void;

  AddSolid(): void;

  MergeAngle(): number;

  SetMergeAngle(theAngleRad: number): void;

  MergeTolerance(): number;

  SetMergeTolerance(theTolerance: number): void;

  delete(): void;

  [Symbol.dispose](): void;
