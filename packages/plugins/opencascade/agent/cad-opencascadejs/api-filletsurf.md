# libcascade — FilletSurf

5 top-level symbols. Signatures are verbatim typescript.

// API giving the following geometric information about fillets list of corresponding NUBS surfaces for each surface
FilletSurf_Builder: declare class FilletSurf_Builder

constructor

// --Purpose computation of the fillet (list of NUBS)
Perform(): void;

Simulate(): void;

// gives the status about the computation of the fillet returns
IsDone(): FilletSurf_StatusDone;

// gives information about error status if IsDone=IsNotOk returns EdgeNotG1
StatusError(): FilletSurf_ErrorTypeStatus;

// gives the number of NUBS surfaces of the Fillet
NbSurface(): number;

// Returns the arc of the section of index IndexSec of surface of index IndexSurf
Section(IndexSurf: number, IndexSec: number): Geom_TrimmedCurve;
// IndexSurf: 1-based surface index
// IndexSec: 1-based section index

// gives the NUBS surface of index Index
SurfaceFillet(Index: number): Geom_Surface;

// gives the 3d tolerance reached during approximation of surface of index Index
TolApp3d(Index: number): number;

// gives the first support face relative to SurfaceFillet(Index)
SupportFace1(Index: number): TopoDS_Face;

// gives the second support face relative to SurfaceFillet(Index)
SupportFace2(Index: number): TopoDS_Face;

// gives the 3d curve of SurfaceFillet(Index) on SupportFace1(Index)
CurveOnFace1(Index: number): Geom_Curve;

// gives the 3d curve of SurfaceFillet(Index) on SupportFace2(Index)
CurveOnFace2(Index: number): Geom_Curve;

// gives the PCurve associated to CurvOnSup1(Index) on the support face
PCurveOnFace1(Index: number): Geom2d_Curve;

// gives the PCurve associated to CurveOnFace1(Index) on the Fillet
PCurve1OnFillet(Index: number): Geom2d_Curve;

// gives the PCurve associated to CurveOnSup2(Index) on the support face
PCurveOnFace2(Index: number): Geom2d_Curve;

// gives the PCurve associated to CurveOnSup2(Index) on the fillet
PCurve2OnFillet(Index: number): Geom2d_Curve;

// gives the parameter of the fillet on the first edge
FirstParameter(): number;

// gives the parameter of the fillet on the last edge
LastParameter(): number;

StartSectionStatus(): FilletSurf_StatusType;

EndSectionStatus(): FilletSurf_StatusType;

NbSection(IndexSurf: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

FilletSurf_ErrorTypeStatus: typeof FilletSurf_ErrorTypeStatus[keyof typeof FilletSurf_ErrorTypeStatus]

// This class is private
FilletSurf_InternalBuilder: declare class FilletSurf_InternalBuilder extends ChFi3d_FilBuilder

constructor

// Initializes the contour with a list of Edges 0
Add(E: NCollection_List_TopoDS_Shape, R: number): number;
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;
Add(E: NCollection_List_TopoDS_Shape, R: number): number;
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;
Add(E: NCollection_List_TopoDS_Shape, R: number): number;
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;

Perform(): void;

Done(): boolean;

// gives the number of NUBS surfaces of the Fillet
NbSurface(): number;

// gives the NUBS surface of index Index
SurfaceFillet(Index: number): Geom_Surface;

// gives the 3d tolerance reached during approximation of the surface of index Index
TolApp3d(Index: number): number;

// gives the first support face relative to SurfaceFillet(Index)
SupportFace1(Index: number): TopoDS_Face;

// gives the second support face relative to SurfaceFillet(Index)
SupportFace2(Index: number): TopoDS_Face;

// gives the 3d curve of SurfaceFillet(Index) on SupportFace1(Index)
CurveOnFace1(Index: number): Geom_Curve;

// gives the 3d curve of SurfaceFillet(Index) on SupportFace2(Index)
CurveOnFace2(Index: number): Geom_Curve;

// gives the PCurve associated to CurvOnSup1(Index) on the support face
PCurveOnFace1(Index: number): Geom2d_Curve;

// gives the PCurve associated to CurveOnFace1(Index) on the Fillet
PCurve1OnFillet(Index: number): Geom2d_Curve;

// gives the PCurve associated to CurveOnSup2(Index) on the support face
PCurveOnFace2(Index: number): Geom2d_Curve;

// gives the PCurve associated to CurveOnSup2(Index) on the fillet
PCurve2OnFillet(Index: number): Geom2d_Curve;

// gives the parameter of the fillet on the first edge
FirstParameter(): number;

// gives the parameter of the fillet on the last edge
LastParameter(): number;

StartSectionStatus(): FilletSurf_StatusType;

EndSectionStatus(): FilletSurf_StatusType;

Simulate(): void;
Simulate(IC: number): void;
Simulate(): void;
Simulate(IC: number): void;

NbSection(IndexSurf: number): number;

// Returns the arc of the section of index IndexSec of surface of index IndexSurf
Section(IndexSurf: number, IndexSec: number): Geom_TrimmedCurve;
// IndexSurf: 1-based surface index
// IndexSec: 1-based section index

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

FilletSurf_StatusDone: typeof FilletSurf_StatusDone[keyof typeof FilletSurf_StatusDone]

FilletSurf_StatusType: typeof FilletSurf_StatusType[keyof typeof FilletSurf_StatusType]
