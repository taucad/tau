# libcascade — BRepIntCurveSurface

1 top-level symbols. Signatures are verbatim typescript.

BRepIntCurveSurface_Inter: declare class BRepIntCurveSurface_Inter

  // BRepIntCurveSurface_Inter.constructor (constructor)
  constructor();

  // BRepIntCurveSurface_Inter.Init (method)
  Init(theCurve: GeomAdaptor_Curve): void;
  Init(theShape: TopoDS_Shape, theCurve: GeomAdaptor_Curve, theTol: number): void;
  Init(theShape: TopoDS_Shape, theLine: gp_Lin, theTol: number): void;

  // BRepIntCurveSurface_Inter.Load (method)
  Load(theShape: TopoDS_Shape, theTol: number): void;

  // BRepIntCurveSurface_Inter.More (method)
  More(): boolean;

  // BRepIntCurveSurface_Inter.Next (method)
  Next(): void;

  // BRepIntCurveSurface_Inter.Pnt (method)
  Pnt(): gp_Pnt;

  // BRepIntCurveSurface_Inter.U (method)
  U(): number;

  // BRepIntCurveSurface_Inter.V (method)
  V(): number;

  // BRepIntCurveSurface_Inter.W (method)
  W(): number;

  // BRepIntCurveSurface_Inter.State (method)
  State(): TopAbs_State;

  // BRepIntCurveSurface_Inter.Transition (method)
  Transition(): IntCurveSurface_TransitionOnCurve;

  // BRepIntCurveSurface_Inter.Face (method)
  Face(): TopoDS_Face;

  // BRepIntCurveSurface_Inter.delete (method)
  delete(): void;

  // BRepIntCurveSurface_Inter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
