# libcascade — FilletSurf

5 top-level symbols. Signatures are verbatim typescript.

FilletSurf_Builder: declare class FilletSurf_Builder

  // FilletSurf_Builder.constructor (constructor)
  constructor(S: TopoDS_Shape, E: NCollection_List_TopoDS_Shape, R: number, Ta?: number, Tapp3d?: number, Tapp2d?: number);

  // FilletSurf_Builder.Perform (method)
  Perform(): void;

  // FilletSurf_Builder.Simulate (method)
  Simulate(): void;

  // FilletSurf_Builder.IsDone (method)
  IsDone(): FilletSurf_StatusDone;

  // FilletSurf_Builder.StatusError (method)
  StatusError(): FilletSurf_ErrorTypeStatus;

  // FilletSurf_Builder.NbSurface (method)
  NbSurface(): number;

  // FilletSurf_Builder.Section (method)
  Section(IndexSurf: number, IndexSec: number): Geom_TrimmedCurve;

  // FilletSurf_Builder.SurfaceFillet (method)
  SurfaceFillet(Index: number): Geom_Surface;

  // FilletSurf_Builder.TolApp3d (method)
  TolApp3d(Index: number): number;

  // FilletSurf_Builder.SupportFace1 (method)
  SupportFace1(Index: number): TopoDS_Face;

  // FilletSurf_Builder.SupportFace2 (method)
  SupportFace2(Index: number): TopoDS_Face;

  // FilletSurf_Builder.CurveOnFace1 (method)
  CurveOnFace1(Index: number): Geom_Curve;

  // FilletSurf_Builder.CurveOnFace2 (method)
  CurveOnFace2(Index: number): Geom_Curve;

  // FilletSurf_Builder.PCurveOnFace1 (method)
  PCurveOnFace1(Index: number): Geom2d_Curve;

  // FilletSurf_Builder.PCurve1OnFillet (method)
  PCurve1OnFillet(Index: number): Geom2d_Curve;

  // FilletSurf_Builder.PCurveOnFace2 (method)
  PCurveOnFace2(Index: number): Geom2d_Curve;

  // FilletSurf_Builder.PCurve2OnFillet (method)
  PCurve2OnFillet(Index: number): Geom2d_Curve;

  // FilletSurf_Builder.FirstParameter (method)
  FirstParameter(): number;

  // FilletSurf_Builder.LastParameter (method)
  LastParameter(): number;

  // FilletSurf_Builder.StartSectionStatus (method)
  StartSectionStatus(): FilletSurf_StatusType;

  // FilletSurf_Builder.EndSectionStatus (method)
  EndSectionStatus(): FilletSurf_StatusType;

  // FilletSurf_Builder.NbSection (method)
  NbSection(IndexSurf: number): number;

  // FilletSurf_Builder.delete (method)
  delete(): void;

  // FilletSurf_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FilletSurf_ErrorTypeStatus: typeof FilletSurf_ErrorTypeStatus[keyof typeof FilletSurf_ErrorTypeStatus]

  readonly FilletSurf_EmptyList: 'FilletSurf_EmptyList'

  readonly FilletSurf_EdgeNotG1: 'FilletSurf_EdgeNotG1'

  readonly FilletSurf_FacesNotG1: 'FilletSurf_FacesNotG1'

  readonly FilletSurf_EdgeNotOnShape: 'FilletSurf_EdgeNotOnShape'

  readonly FilletSurf_NotSharpEdge: 'FilletSurf_NotSharpEdge'

  readonly FilletSurf_PbFilletCompute: 'FilletSurf_PbFilletCompute'

FilletSurf_InternalBuilder: declare class FilletSurf_InternalBuilder extends ChFi3d_FilBuilder

  // FilletSurf_InternalBuilder.constructor (constructor)
  constructor(S: TopoDS_Shape, FShape?: ChFi3d_FilletShape, Ta?: number, Tapp3d?: number, Tapp2d?: number);

  // FilletSurf_InternalBuilder.Add (method)
  Add(E: NCollection_List_TopoDS_Shape, R: number): number;
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;

  // FilletSurf_InternalBuilder.Perform (method)
  Perform(): void;

  // FilletSurf_InternalBuilder.Done (method)
  Done(): boolean;

  // FilletSurf_InternalBuilder.NbSurface (method)
  NbSurface(): number;

  // FilletSurf_InternalBuilder.SurfaceFillet (method)
  SurfaceFillet(Index: number): Geom_Surface;

  // FilletSurf_InternalBuilder.TolApp3d (method)
  TolApp3d(Index: number): number;

  // FilletSurf_InternalBuilder.SupportFace1 (method)
  SupportFace1(Index: number): TopoDS_Face;

  // FilletSurf_InternalBuilder.SupportFace2 (method)
  SupportFace2(Index: number): TopoDS_Face;

  // FilletSurf_InternalBuilder.CurveOnFace1 (method)
  CurveOnFace1(Index: number): Geom_Curve;

  // FilletSurf_InternalBuilder.CurveOnFace2 (method)
  CurveOnFace2(Index: number): Geom_Curve;

  // FilletSurf_InternalBuilder.PCurveOnFace1 (method)
  PCurveOnFace1(Index: number): Geom2d_Curve;

  // FilletSurf_InternalBuilder.PCurve1OnFillet (method)
  PCurve1OnFillet(Index: number): Geom2d_Curve;

  // FilletSurf_InternalBuilder.PCurveOnFace2 (method)
  PCurveOnFace2(Index: number): Geom2d_Curve;

  // FilletSurf_InternalBuilder.PCurve2OnFillet (method)
  PCurve2OnFillet(Index: number): Geom2d_Curve;

  // FilletSurf_InternalBuilder.FirstParameter (method)
  FirstParameter(): number;

  // FilletSurf_InternalBuilder.LastParameter (method)
  LastParameter(): number;

  // FilletSurf_InternalBuilder.StartSectionStatus (method)
  StartSectionStatus(): FilletSurf_StatusType;

  // FilletSurf_InternalBuilder.EndSectionStatus (method)
  EndSectionStatus(): FilletSurf_StatusType;

  // FilletSurf_InternalBuilder.Simulate (method)
  Simulate(): void;
  Simulate(IC: number): void;

  // FilletSurf_InternalBuilder.NbSection (method)
  NbSection(IndexSurf: number): number;

  // FilletSurf_InternalBuilder.Section (method)
  Section(IndexSurf: number, IndexSec: number): Geom_TrimmedCurve;

  // FilletSurf_InternalBuilder.delete (method)
  delete(): void;

  // FilletSurf_InternalBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FilletSurf_StatusDone: typeof FilletSurf_StatusDone[keyof typeof FilletSurf_StatusDone]

  readonly FilletSurf_IsOk: 'FilletSurf_IsOk'

  readonly FilletSurf_IsNotOk: 'FilletSurf_IsNotOk'

  readonly FilletSurf_IsPartial: 'FilletSurf_IsPartial'

FilletSurf_StatusType: typeof FilletSurf_StatusType[keyof typeof FilletSurf_StatusType]

  readonly FilletSurf_TwoExtremityOnEdge: 'FilletSurf_TwoExtremityOnEdge'

  readonly FilletSurf_OneExtremityOnEdge: 'FilletSurf_OneExtremityOnEdge'

  readonly FilletSurf_NoExtremityOnEdge: 'FilletSurf_NoExtremityOnEdge'
