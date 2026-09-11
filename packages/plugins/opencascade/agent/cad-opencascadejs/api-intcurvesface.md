# libcascade — IntCurvesFace

2 top-level symbols. Signatures are verbatim typescript.

IntCurvesFace_Intersector: declare class IntCurvesFace_Intersector extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Perform(L: gp_Lin, PInf: number, PSup: number): void;
Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;
Perform(L: gp_Lin, PInf: number, PSup: number): void;
Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;

SurfaceType(): GeomAbs_SurfaceType;

IsDone(): boolean;

NbPnt(): number;

UParameter(I: number): number;

VParameter(I: number): number;

WParameter(I: number): number;

Pnt(I: number): gp_Pnt;

Transition(I: number): IntCurveSurface_TransitionOnCurve;

State(I: number): TopAbs_State;

IsParallel(): boolean;

Face(): TopoDS_Face;

ClassifyUVPoint(Puv: gp_Pnt2d): TopAbs_State;

Bounding(): Bnd_Box;

SetUseBoundToler(UseBToler: boolean): void;

GetUseBoundToler(): boolean;

delete(): void;

[Symbol.dispose](): void;

IntCurvesFace_ShapeIntersector: declare class IntCurvesFace_ShapeIntersector

constructor

Load(Sh: TopoDS_Shape, Tol: number): void;

Perform(L: gp_Lin, PInf: number, PSup: number): void;
Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;
Perform(L: gp_Lin, PInf: number, PSup: number): void;
Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;

PerformNearest(L: gp_Lin, PInf: number, PSup: number): void;

IsDone(): boolean;

NbPnt(): number;

UParameter(I: number): number;

VParameter(I: number): number;

WParameter(I: number): number;

Pnt(I: number): gp_Pnt;

Transition(I: number): IntCurveSurface_TransitionOnCurve;

State(I: number): TopAbs_State;

Face(I: number): TopoDS_Face;

SortResult(): void;

delete(): void;

[Symbol.dispose](): void;
