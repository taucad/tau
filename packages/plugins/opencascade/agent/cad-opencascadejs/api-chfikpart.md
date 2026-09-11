# libcascade — ChFiKPart

1 top-level symbols. Signatures are verbatim typescript.

ChFiKPart_ComputeData: declare class ChFiKPart_ComputeData

constructor

static Compute(DStr: unknown, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, Or1: TopAbs_Orientation, Or2: TopAbs_Orientation, Sp: ChFiDS_Spine, Iedge: number): { returnValue: boolean; Data: ChFiDS_SurfData; [Symbol.dispose](): void };

static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OrFace1: TopAbs_Orientation, OrFace2: TopAbs_Orientation, Or1: TopAbs_Orientation, Or2: TopAbs_Orientation, minRad: number, majRad: number, P1S1: gp_Pnt2d, P2S1: gp_Pnt2d, P1S2: gp_Pnt2d, P2S2: gp_Pnt2d): boolean;
static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OrFace1: TopAbs_Orientation, OrFace2: TopAbs_Orientation, Or1: TopAbs_Orientation, Or2: TopAbs_Orientation, Rad: number, PS1: gp_Pnt2d, P1S2: gp_Pnt2d, P2S2: gp_Pnt2d): boolean;
static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S: Adaptor3d_Surface, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OfS: TopAbs_Orientation, OS: TopAbs_Orientation, OS1: TopAbs_Orientation, OS2: TopAbs_Orientation, Radius: number): boolean;
static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OrFace1: TopAbs_Orientation, OrFace2: TopAbs_Orientation, Or1: TopAbs_Orientation, Or2: TopAbs_Orientation, minRad: number, majRad: number, P1S1: gp_Pnt2d, P2S1: gp_Pnt2d, P1S2: gp_Pnt2d, P2S2: gp_Pnt2d): boolean;
static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OrFace1: TopAbs_Orientation, OrFace2: TopAbs_Orientation, Or1: TopAbs_Orientation, Or2: TopAbs_Orientation, Rad: number, PS1: gp_Pnt2d, P1S2: gp_Pnt2d, P2S2: gp_Pnt2d): boolean;
static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S: Adaptor3d_Surface, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OfS: TopAbs_Orientation, OS: TopAbs_Orientation, OS1: TopAbs_Orientation, OS2: TopAbs_Orientation, Radius: number): boolean;
static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OrFace1: TopAbs_Orientation, OrFace2: TopAbs_Orientation, Or1: TopAbs_Orientation, Or2: TopAbs_Orientation, minRad: number, majRad: number, P1S1: gp_Pnt2d, P2S1: gp_Pnt2d, P1S2: gp_Pnt2d, P2S2: gp_Pnt2d): boolean;
static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OrFace1: TopAbs_Orientation, OrFace2: TopAbs_Orientation, Or1: TopAbs_Orientation, Or2: TopAbs_Orientation, Rad: number, PS1: gp_Pnt2d, P1S2: gp_Pnt2d, P2S2: gp_Pnt2d): boolean;
static ComputeCorner(DStr: unknown, Data: ChFiDS_SurfData, S: Adaptor3d_Surface, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, OfS: TopAbs_Orientation, OS: TopAbs_Orientation, OS1: TopAbs_Orientation, OS2: TopAbs_Orientation, Radius: number): boolean;

delete(): void;

[Symbol.dispose](): void;
