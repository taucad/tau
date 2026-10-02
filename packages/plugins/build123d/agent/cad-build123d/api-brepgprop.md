# build123d — BRepGProp

2 top-level symbols. Signatures are verbatim python.

// Category: BRepGProp
// Provides global functions to compute a shape's global properties for lines, surfaces or volumes, and bring them together with the global properties already computed for a geometric system
BRepGProp

  // __init__(self
  // OCP.OCP.BRepGProp.BRepGProp.__init__ (constructor)
  __init__(self: OCP.OCP.BRepGProp.BRepGProp) -> None

  // LinearProperties_s(S
  // Remarks: Computes the linear global properties of the shape S, i.e. the global properties induced by each edge of the shape S, and brings them together with the global properties still retained by the framework LProps. If the current system of LProps was empty, its global properties become equal to the linear global properties of S. For this computation no linear density is attached to the edges. So, for example, the added mass corresponds to the sum of the lengths of the edges of S. The density of the composed systems, i.e. that of each component of the current system of LProps, and that of S which is considered to be equal to 1, must be coherent. Note that this coherence cannot be checked. You are advised to use a separate framework for each density, and then to bring these frameworks together into a global one. The point relative to which the inertia of the system is computed is the reference point of the framework LProps. Note: if your programming ensures that the framework LProps retains only linear global properties (brought together for example, by the function LinearProperties) for objects the density of which is equal to 1 (or is not defined), the function Mass will return the total length of edges of the system analysed by LProps. Warning No check is performed to verify that the shape S retains truly linear properties. If S is simply a vertex, it is not considered to present any additional global properties. SkipShared is a special flag, which allows taking in calculation shared topological entities or not. For ex., if SkipShared = True, edges, shared by two or more faces, are taken into calculation only once. If we have cube with sizes 1, 1, 1, its linear properties = 12 for SkipEdges = true and 24 for SkipEdges = false. UseTriangulation is a special flag, which defines preferable source of geometry data. If UseTriangulation = Standard_False, exact geometry objects (curves) are used, otherwise polygons of triangulation are used first.
  // OCP.OCP.BRepGProp.BRepGProp.LinearProperties_s (method)
  LinearProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LProps: OCP.OCP.GProp.GProp_GProps, SkipShared: bool = False, UseTriangulation: bool = False) -> None

  // SurfaceProperties_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SurfaceProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, SProps: OCP.OCP.GProp.GProp_GProps, SkipShared: bool = False, UseTriangulation: bool = False) -> None Computes the surface global properties of the shape S, i.e. the global properties induced by each face of the shape S, and brings them together with the global properties still retained by the framework SProps. If the current system of SProps was empty, its global properties become equal to the surface global properties of S. For this computation, no surface density is attached to the faces. Consequently, the added mass corresponds to the sum of the areas of the faces of S. The density of the component systems, i.e. that of each component of the current system of SProps, and that of S which is considered to be equal to 1, must be coherent. Note that this coherence cannot be checked. You are advised to use a framework for each different value of density, and then to bring these frameworks together into a global one. The point relative to which the inertia of the system is computed is the reference point of the framework SProps. Note : if your programming ensures that the framework SProps retains only surface global properties, brought together, for example, by the function SurfaceProperties, for objects the density of which is equal to 1 (or is not defined), the function Mass will return the total area of faces of the system analysed by SProps. Warning No check is performed to verify that the shape S retains truly surface properties. If S is simply a vertex, an edge or a wire, it is not considered to present any additional global properties. SkipShared is a special flag, which allows taking in calculation shared topological entities or not. For ex., if SkipShared = True, faces, shared by two or more shells, are taken into calculation only once. UseTriangulation is a special flag, which defines preferable source of geometry data. If UseTriangulation = Standard_False, exact geometry objects (surfaces) are used, otherwise face triangulations are used first. 2. SurfaceProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, SProps: OCP.OCP.GProp.GProp_GProps, Eps: float, SkipShared: bool = False) -> float Updates <SProps> with the shape <S>, that contains its principal properties. The surface properties of all the faces in <S> are computed. Adaptive 2D Gauss integration is used. Parameter Eps sets maximal relative error of computed mass (area) for each face. Error is calculated as Abs((M(i+1)-M(i))/M(i+1)), M(i+1) and M(i) are values for two successive steps of adaptive integration. Method returns estimation of relative error reached for whole shape. WARNING: if Eps > 0.001 algorithm performs non-adaptive integration. SkipShared is a special flag, which allows taking in calculation shared topological entities or not For ex., if SkipShared = True, faces, shared by two or more shells, are taken into calculation only once.
  // OCP.OCP.BRepGProp.BRepGProp.SurfaceProperties_s (method)
  SurfaceProperties_s(*args, **kwargs)
  SurfaceProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, SProps: OCP.OCP.GProp.GProp_GProps, SkipShared: bool = False, UseTriangulation: bool = False) -> None
  SurfaceProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, SProps: OCP.OCP.GProp.GProp_GProps, Eps: float, SkipShared: bool = False) -> float

  // VolumeProperties_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. VolumeProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, OnlyClosed: bool = False, SkipShared: bool = False, UseTriangulation: bool = False) -> None Computes the global volume properties of the solid S, and brings them together with the global properties still retained by the framework VProps. If the current system of VProps was empty, its global properties become equal to the global properties of S for volume. For this computation, no volume density is attached to the solid. Consequently, the added mass corresponds to the volume of S. The density of the component systems, i.e. that of each component of the current system of VProps, and that of S which is considered to be equal to 1, must be coherent to each other. Note that this coherence cannot be checked. You are advised to use a separate framework for each density, and then to bring these frameworks together into a global one. The point relative to which the inertia of the system is computed is the reference point of the framework VProps. Note: if your programming ensures that the framework VProps retains only global properties of volume (brought together for example, by the function VolumeProperties) for objects the density of which is equal to 1 (or is not defined), the function Mass will return the total volume of the solids of the system analysed by VProps. Warning The shape S must represent an object whose global volume properties can be computed. It may be a finite solid, or a series of finite solids all oriented in a coherent way. Nonetheless, S must be exempt of any free boundary. Note that these conditions of coherence are not checked by this algorithm, and results will be false if they are not respected. SkipShared a is special flag, which allows taking in calculation shared topological entities or not. For ex., if SkipShared = True, the volumes formed by the equal (the same TShape, location and orientation) faces are taken into calculation only once. UseTriangulation is a special flag, which defines preferable source of geometry data. If UseTriangulation = Standard_False, exact geometry objects (surfaces) are used, otherwise face triangulations are used first. 2. VolumeProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, Eps: float, OnlyClosed: bool = False, SkipShared: bool = False) -> float Updates <VProps> with the shape <S>, that contains its principal properties. The volume properties of all the FORWARD and REVERSED faces in <S> are computed. If OnlyClosed is True then computed faces must belong to closed Shells. Adaptive 2D Gauss integration is used. Parameter Eps sets maximal relative error of computed mass (volume) for each face. Error is calculated as Abs((M(i+1)-M(i))/M(i+1)), M(i+1) and M(i) are values for two successive steps of adaptive integration. Method returns estimation of relative error reached for whole shape. WARNING: if Eps > 0.001 algorithm performs non-adaptive integration. SkipShared is a special flag, which allows taking in calculation shared topological entities or not. For ex., if SkipShared = True, the volumes formed by the equal (the same TShape, location and orientation) faces are taken into calculation only once.
  // OCP.OCP.BRepGProp.BRepGProp.VolumeProperties_s (method)
  VolumeProperties_s(*args, **kwargs)
  VolumeProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, OnlyClosed: bool = False, SkipShared: bool = False, UseTriangulation: bool = False) -> None
  VolumeProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, Eps: float, OnlyClosed: bool = False, SkipShared: bool = False) -> float

  // VolumePropertiesGK_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. VolumePropertiesGK_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, Eps: float = 0.001, OnlyClosed: bool = False, IsUseSpan: bool = False, CGFlag: bool = False, IFlag: bool = False, SkipShared: bool = False) -> float Updates <VProps> with the shape <S>, that contains its principal properties. The volume properties of all the FORWARD and REVERSED faces in <S> are computed. If OnlyClosed is True then computed faces must belong to closed Shells. Adaptive 2D Gauss integration is used. Parameter IsUseSpan says if it is necessary to define spans on a face. This option has an effect only for BSpline faces. Parameter Eps sets maximal relative error of computed property for each face. Error is delivered by the adaptive Gauss-Kronrod method of integral computation that is used for properties computation. Method returns estimation of relative error reached for whole shape. Returns negative value if the computation is failed. SkipShared is a special flag, which allows taking in calculation shared topological entities or not. For ex., if SkipShared = True, the volumes formed by the equal (the same TShape, location and orientation) faces are taken into calculation only once. 2. VolumePropertiesGK_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, thePln: OCP.OCP.gp.gp_Pln, Eps: float = 0.001, OnlyClosed: bool = False, IsUseSpan: bool = False, CGFlag: bool = False, IFlag: bool = False, SkipShared: bool = False) -> float
  // OCP.OCP.BRepGProp.BRepGProp.VolumePropertiesGK_s (method)
  VolumePropertiesGK_s(*args, **kwargs)
  VolumePropertiesGK_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, Eps: float = 0.001, OnlyClosed: bool = False, IsUseSpan: bool = False, CGFlag: bool = False, IFlag: bool = False, SkipShared: bool = False) -> float
  VolumePropertiesGK_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, thePln: OCP.OCP.gp.gp_Pln, Eps: float = 0.001, OnlyClosed: bool = False, IsUseSpan: bool = False, CGFlag: bool = False, IFlag: bool = False, SkipShared: bool = False) -> float

// Category: BRepGProp
BRepGProp_Face

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.BRepGProp.BRepGProp_Face, IsUseSpan: bool = False) -> None 2. __init__(self: OCP.OCP.BRepGProp.BRepGProp_Face, F: OCP.OCP.TopoDS.TopoDS_Face, IsUseSpan: bool = False) -> None
  // OCP.OCP.BRepGProp.BRepGProp_Face.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepGProp.BRepGProp_Face, IsUseSpan: bool = False) -> None
  __init__(self: OCP.OCP.BRepGProp.BRepGProp_Face, F: OCP.OCP.TopoDS.TopoDS_Face, IsUseSpan: bool = False) -> None

  // Load(*args, **kwargs)
  // Remarks: Overloaded function. 1. Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, F: OCP.OCP.TopoDS.TopoDS_Face) -> None 2. Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool Loading the boundary arc. Returns FALSE if edge has no P-Curve. 3. Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, IsFirstParam: bool, theIsoType: OCP.OCP.GeomAbs.GeomAbs_IsoType) -> None Loading the boundary arc. This arc is either a top, bottom, left or right bound of a UV rectangle in which the parameters of surface are defined. If IsFirstParam is equal to Standard_True, the face is initialized by either left of bottom bound. Otherwise it is initialized by the top or right one. If theIsoType is equal to GeomAbs_IsoU, the face is initialized with either left or right bound. Otherwise - with either top or bottom one.
  // OCP.OCP.BRepGProp.BRepGProp_Face.Load (method)
  Load(*args, **kwargs)
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, IsFirstParam: bool, theIsoType: OCP.OCP.GeomAbs.GeomAbs_IsoType) -> None

  // VIntegrationOrder(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.VIntegrationOrder (method)
  VIntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // NaturalRestriction(*args, **kwargs)
  // Remarks: Overloaded function. 1. NaturalRestriction(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> bool Returns Standard_True if the face is not trimmed. 2. NaturalRestriction(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> bool Returns Standard_True if the face is not trimmed.
  // OCP.OCP.BRepGProp.BRepGProp_Face.NaturalRestriction (method)
  NaturalRestriction(*args, **kwargs)
  NaturalRestriction(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> bool
  NaturalRestriction(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> bool

  // Value2d(*args, **kwargs)
  // Remarks: Overloaded function. 1. Value2d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float) -> OCP.OCP.gp.gp_Pnt2d Returns the value of the boundary curve of the face. 2. Value2d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float) -> OCP.OCP.gp.gp_Pnt2d Returns the value of the boundary curve of the face.
  // OCP.OCP.BRepGProp.BRepGProp_Face.Value2d (method)
  Value2d(*args, **kwargs)
  Value2d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float) -> OCP.OCP.gp.gp_Pnt2d
  Value2d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float) -> OCP.OCP.gp.gp_Pnt2d

  // SIntOrder(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.SIntOrder (method)
  SIntOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face, Eps: float) -> int

  // SVIntSubs(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.SVIntSubs (method)
  SVIntSubs(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // SUIntSubs(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.SUIntSubs (method)
  SUIntSubs(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // UKnots(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.UKnots (method)
  UKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // VKnots(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.VKnots (method)
  VKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // LIntOrder(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.LIntOrder (method)
  LIntOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face, Eps: float) -> int

  // LIntSubs(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.LIntSubs (method)
  LIntSubs(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // LKnots(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.LKnots (method)
  LKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // UIntegrationOrder(self
  // Remarks: Returns the number of points required to do the integration in the U parametric direction with a good accuracy.
  // OCP.OCP.BRepGProp.BRepGProp_Face.UIntegrationOrder (method)
  UIntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // Normal(self
  // Remarks: Computes the point of parameter U, V on the Face <S> and the normal to the face at this point.
  // OCP.OCP.BRepGProp.BRepGProp_Face.Normal (method)
  Normal(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, VNor: OCP.OCP.gp.gp_Vec) -> None

  // FirstParameter(*args, **kwargs)
  // Remarks: Overloaded function. 1. FirstParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float Returns the parametric value of the start point of the current arc of curve. 2. FirstParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float Returns the parametric value of the start point of the current arc of curve.
  // OCP.OCP.BRepGProp.BRepGProp_Face.FirstParameter (method)
  FirstParameter(*args, **kwargs)
  FirstParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float
  FirstParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float

  // LastParameter(*args, **kwargs)
  // Remarks: Overloaded function. 1. LastParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float Returns the parametric value of the end point of the current arc of curve. 2. LastParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float Returns the parametric value of the end point of the current arc of curve.
  // OCP.OCP.BRepGProp.BRepGProp_Face.LastParameter (method)
  LastParameter(*args, **kwargs)
  LastParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float
  LastParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float

  // IntegrationOrder(self
  // Remarks: Returns the number of points required to do the integration along the parameter of curve.
  // OCP.OCP.BRepGProp.BRepGProp_Face.IntegrationOrder (method)
  IntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // D12d(*args, **kwargs)
  // Remarks: Overloaded function. 1. D12d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, P: OCP.OCP.gp.gp_Pnt2d, V1: OCP.OCP.gp.gp_Vec2d) -> None Returns the point of parameter U and the first derivative at this point of a boundary curve. 2. D12d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, P: OCP.OCP.gp.gp_Pnt2d, V1: OCP.OCP.gp.gp_Vec2d) -> None Returns the point of parameter U and the first derivative at this point of a boundary curve.
  // OCP.OCP.BRepGProp.BRepGProp_Face.D12d (method)
  D12d(*args, **kwargs)
  D12d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, P: OCP.OCP.gp.gp_Pnt2d, V1: OCP.OCP.gp.gp_Vec2d) -> None
  D12d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, P: OCP.OCP.gp.gp_Pnt2d, V1: OCP.OCP.gp.gp_Vec2d) -> None

  // Bounds(self
  // Remarks: Returns the parametric bounds of the Face.
  // OCP.OCP.BRepGProp.BRepGProp_Face.Bounds (method)
  Bounds(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> tuple[float, float, float, float]

  // GetUKnots(self
  // Remarks: Returns an array of U knots of the face. The first and last elements of the array will be theUMin and theUMax. The middle elements will be the U Knots of the face greater then theUMin and lower then theUMax in increasing order. If the face is not a BSpline, the array initialized with theUMin and theUMax only.
  // OCP.OCP.BRepGProp.BRepGProp_Face.GetUKnots (method)
  GetUKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, theUMin: float, theUMax: float, theUKnots: OCP.OCP.TColStd.TColStd_HArray1OfReal) -> tuple[()]

  // GetTKnots(self
  // Remarks: Returns an array of combination of T knots of the arc and V knots of the face. The first and last elements of the array will be theTMin and theTMax. The middle elements will be the Knots of the arc and the values of parameters of arc on which the value points have V coordinates close to V knots of face. All the parameter will be greater then theTMin and lower then theTMax in increasing order. If the face is not a BSpline, the array initialized with theTMin and theTMax only.
  // OCP.OCP.BRepGProp.BRepGProp_Face.GetTKnots (method)
  GetTKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, theTMin: float, theTMax: float, theTKnots: OCP.OCP.TColStd.TColStd_HArray1OfReal) -> tuple[()]

  // GetFace(*args, **kwargs)
  // Remarks: Overloaded function. 1. GetFace(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> OCP.OCP.TopoDS.TopoDS_Face Returns the TopoDS face. 2. GetFace(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> OCP.OCP.TopoDS.TopoDS_Face Returns the TopoDS face.
  // OCP.OCP.BRepGProp.BRepGProp_Face.GetFace (method)
  GetFace(*args, **kwargs)
  GetFace(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> OCP.OCP.TopoDS.TopoDS_Face
  GetFace(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> OCP.OCP.TopoDS.TopoDS_Face
