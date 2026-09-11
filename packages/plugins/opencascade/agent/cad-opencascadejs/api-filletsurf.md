# libcascade — FilletSurf

5 top-level symbols. Signatures are verbatim typescript.

FilletSurf_Builder: declare class FilletSurf_Builder

constructor

Perform(): void;

Simulate(): void;

IsDone(): FilletSurf_StatusDone;

StatusError(): FilletSurf_ErrorTypeStatus;

NbSurface(): number;

Section(IndexSurf: number, IndexSec: number): Geom_TrimmedCurve;

SurfaceFillet(Index: number): Geom_Surface;

TolApp3d(Index: number): number;

SupportFace1(Index: number): TopoDS_Face;

SupportFace2(Index: number): TopoDS_Face;

CurveOnFace1(Index: number): Geom_Curve;

CurveOnFace2(Index: number): Geom_Curve;

PCurveOnFace1(Index: number): Geom2d_Curve;

PCurve1OnFillet(Index: number): Geom2d_Curve;

PCurveOnFace2(Index: number): Geom2d_Curve;

PCurve2OnFillet(Index: number): Geom2d_Curve;

FirstParameter(): number;

LastParameter(): number;

StartSectionStatus(): FilletSurf_StatusType;

EndSectionStatus(): FilletSurf_StatusType;

NbSection(IndexSurf: number): number;

delete(): void;

[Symbol.dispose](): void;

FilletSurf_ErrorTypeStatus: typeof FilletSurf_ErrorTypeStatus[keyof typeof FilletSurf_ErrorTypeStatus]

FilletSurf_InternalBuilder: declare class FilletSurf_InternalBuilder extends ChFi3d_FilBuilder

constructor

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

NbSurface(): number;

SurfaceFillet(Index: number): Geom_Surface;

TolApp3d(Index: number): number;

SupportFace1(Index: number): TopoDS_Face;

SupportFace2(Index: number): TopoDS_Face;

CurveOnFace1(Index: number): Geom_Curve;

CurveOnFace2(Index: number): Geom_Curve;

PCurveOnFace1(Index: number): Geom2d_Curve;

PCurve1OnFillet(Index: number): Geom2d_Curve;

PCurveOnFace2(Index: number): Geom2d_Curve;

PCurve2OnFillet(Index: number): Geom2d_Curve;

FirstParameter(): number;

LastParameter(): number;

StartSectionStatus(): FilletSurf_StatusType;

EndSectionStatus(): FilletSurf_StatusType;

Simulate(): void;
Simulate(IC: number): void;
Simulate(): void;
Simulate(IC: number): void;

NbSection(IndexSurf: number): number;

Section(IndexSurf: number, IndexSec: number): Geom_TrimmedCurve;

delete(): void;

[Symbol.dispose](): void;

FilletSurf_StatusDone: typeof FilletSurf_StatusDone[keyof typeof FilletSurf_StatusDone]

FilletSurf_StatusType: typeof FilletSurf_StatusType[keyof typeof FilletSurf_StatusType]
