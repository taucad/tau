# libcascade — IntTools (2)

9 top-level symbols. Signatures are verbatim typescript.

IntTools_TopolTool: declare class IntTools_TopolTool extends Adaptor3d_TopolTool

  constructor

  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;
  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;
  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;

  ComputeSamplePoints(): void;

  NbSamplesU(): number;

  NbSamplesV(): number;

  NbSamples(): number;

  SamplePoint(Index: number, P2d: gp_Pnt2d, P3d: gp_Pnt): void;

  SamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IntTools_WLineTool: declare class IntTools_WLineTool

  constructor

  static NotUseSurfacesForApprox(aF1: TopoDS_Face, aF2: TopoDS_Face, WL: IntPatch_WLine, ifprm: number, ilprm: number): boolean;

  static DecompositionOfWLine(theWLine: IntPatch_WLine, theSurface1: GeomAdaptor_Surface, theSurface2: GeomAdaptor_Surface, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theLConstructor: GeomInt_LineConstructor, theAvoidLConstructor: boolean, theTol: number, theNewLines: NCollection_Sequence_handle_IntPatch_Line, argNo9: IntTools_Context): boolean;

  delete(): void;

  [Symbol.dispose](): void;

IntTools_ListOfCurveRangeSample: NCollection_List_IntTools_CurveRangeSample

IntTools_ListOfSurfaceRangeSample: NCollection_List_IntTools_SurfaceRangeSample

IntTools_SequenceOfCommonPrts: NCollection_Sequence_IntTools_CommonPrt

IntTools_SequenceOfCurves: NCollection_Sequence_IntTools_Curve

IntTools_SequenceOfPntOn2Faces: NCollection_Sequence_IntTools_PntOn2Faces

IntTools_SequenceOfRanges: NCollection_Sequence_IntTools_Range

IntTools_SequenceOfRoots: NCollection_Sequence_IntTools_Root
