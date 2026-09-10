# libcascade — BRepIntCurveSurface

1 top-level symbols. Signatures are verbatim typescript.

// Computes the intersection between a face and a curve
BRepIntCurveSurface_Inter: declare class BRepIntCurveSurface_Inter

constructor

// Method to find intersections of specified curve with loaded shape
Init(theCurve: GeomAdaptor_Curve): void;
Init(theShape: TopoDS_Shape, theCurve: GeomAdaptor_Curve, theTol: number): void;
Init(theShape: TopoDS_Shape, theLine: gp_Lin, theTol: number): void;
Init(theCurve: GeomAdaptor_Curve): void;
Init(theShape: TopoDS_Shape, theCurve: GeomAdaptor_Curve, theTol: number): void;
Init(theShape: TopoDS_Shape, theLine: gp_Lin, theTol: number): void;
Init(theCurve: GeomAdaptor_Curve): void;
Init(theShape: TopoDS_Shape, theCurve: GeomAdaptor_Curve, theTol: number): void;
Init(theShape: TopoDS_Shape, theLine: gp_Lin, theTol: number): void;

// Load the Shape, and initialize the tolerance used for the classification
Load(theShape: TopoDS_Shape, theTol: number): void;

// returns True if there is a current face
More(): boolean;

// Sets the next intersection point to check
Next(): void;

// returns the current geometric Point
Pnt(): gp_Pnt;

// returns the U parameter of the current point on the current face
U(): number;

// returns the V parameter of the current point on the current face
V(): number;

// returns the parameter of the current point on the curve
W(): number;

// returns the current state (IN or ON)
State(): TopAbs_State;

// returns the transition of the line on the surface (IN or OUT or UNKNOWN)
Transition(): IntCurveSurface_TransitionOnCurve;

// returns the current face
Face(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
