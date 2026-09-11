# libcascade — BRepIntCurveSurface

1 top-level symbols. Signatures are verbatim typescript.

BRepIntCurveSurface_Inter: declare class BRepIntCurveSurface_Inter

constructor

Init(theCurve: GeomAdaptor_Curve): void;
Init(theShape: TopoDS_Shape, theCurve: GeomAdaptor_Curve, theTol: number): void;
Init(theShape: TopoDS_Shape, theLine: gp_Lin, theTol: number): void;
Init(theCurve: GeomAdaptor_Curve): void;
Init(theShape: TopoDS_Shape, theCurve: GeomAdaptor_Curve, theTol: number): void;
Init(theShape: TopoDS_Shape, theLine: gp_Lin, theTol: number): void;
Init(theCurve: GeomAdaptor_Curve): void;
Init(theShape: TopoDS_Shape, theCurve: GeomAdaptor_Curve, theTol: number): void;
Init(theShape: TopoDS_Shape, theLine: gp_Lin, theTol: number): void;

Load(theShape: TopoDS_Shape, theTol: number): void;

More(): boolean;

Next(): void;

Pnt(): gp_Pnt;

U(): number;

V(): number;

W(): number;

State(): TopAbs_State;

Transition(): IntCurveSurface_TransitionOnCurve;

Face(): TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;
