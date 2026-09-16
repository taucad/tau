# build123d — BRepGProp

2 top-level symbols. Signatures are verbatim python.

// Provides global functions to compute a shape's global properties for lines, surfaces or volumes, and bring them together with the global properties already computed for a geometric system
BRepGProp

  // __init__(self
  __init__(self: OCP.OCP.BRepGProp.BRepGProp) -> None

  // LinearProperties_s(S
  LinearProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LProps: OCP.OCP.GProp.GProp_GProps, SkipShared: bool = False, UseTriangulation: bool = False) -> None

  // SurfaceProperties_s(*args, **kwargs)
  SurfaceProperties_s(*args, **kwargs)
  SurfaceProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, SProps: OCP.OCP.GProp.GProp_GProps, SkipShared: bool = False, UseTriangulation: bool = False) -> None
  SurfaceProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, SProps: OCP.OCP.GProp.GProp_GProps, Eps: float, SkipShared: bool = False) -> float

  // VolumeProperties_s(*args, **kwargs)
  VolumeProperties_s(*args, **kwargs)
  VolumeProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, OnlyClosed: bool = False, SkipShared: bool = False, UseTriangulation: bool = False) -> None
  VolumeProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, Eps: float, OnlyClosed: bool = False, SkipShared: bool = False) -> float

  // VolumePropertiesGK_s(*args, **kwargs)
  VolumePropertiesGK_s(*args, **kwargs)
  VolumePropertiesGK_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, Eps: float = 0.001, OnlyClosed: bool = False, IsUseSpan: bool = False, CGFlag: bool = False, IFlag: bool = False, SkipShared: bool = False) -> float
  VolumePropertiesGK_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, thePln: OCP.OCP.gp.gp_Pln, Eps: float = 0.001, OnlyClosed: bool = False, IsUseSpan: bool = False, CGFlag: bool = False, IFlag: bool = False, SkipShared: bool = False) -> float

BRepGProp_Face

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepGProp.BRepGProp_Face, IsUseSpan: bool = False) -> None
  __init__(self: OCP.OCP.BRepGProp.BRepGProp_Face, F: OCP.OCP.TopoDS.TopoDS_Face, IsUseSpan: bool = False) -> None

  // Load(*args, **kwargs)
  Load(*args, **kwargs)
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, IsFirstParam: bool, theIsoType: OCP.OCP.GeomAbs.GeomAbs_IsoType) -> None

  // VIntegrationOrder(self
  VIntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // NaturalRestriction(*args, **kwargs)
  NaturalRestriction(*args, **kwargs)
  NaturalRestriction(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> bool
  NaturalRestriction(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> bool

  // Value2d(*args, **kwargs)
  Value2d(*args, **kwargs)
  Value2d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float) -> OCP.OCP.gp.gp_Pnt2d
  Value2d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float) -> OCP.OCP.gp.gp_Pnt2d

  // SIntOrder(self
  SIntOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face, Eps: float) -> int

  // SVIntSubs(self
  SVIntSubs(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // SUIntSubs(self
  SUIntSubs(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // UKnots(self
  UKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // VKnots(self
  VKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // LIntOrder(self
  LIntOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face, Eps: float) -> int

  // LIntSubs(self
  LIntSubs(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // LKnots(self
  LKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // UIntegrationOrder(self
  UIntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // Normal(self
  Normal(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, VNor: OCP.OCP.gp.gp_Vec) -> None

  // FirstParameter(*args, **kwargs)
  FirstParameter(*args, **kwargs)
  FirstParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float
  FirstParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float

  // LastParameter(*args, **kwargs)
  LastParameter(*args, **kwargs)
  LastParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float
  LastParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float

  // IntegrationOrder(self
  IntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // D12d(*args, **kwargs)
  D12d(*args, **kwargs)
  D12d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, P: OCP.OCP.gp.gp_Pnt2d, V1: OCP.OCP.gp.gp_Vec2d) -> None
  D12d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, P: OCP.OCP.gp.gp_Pnt2d, V1: OCP.OCP.gp.gp_Vec2d) -> None

  // Bounds(self
  Bounds(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> tuple[float, float, float, float]

  // GetUKnots(self
  GetUKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, theUMin: float, theUMax: float, theUKnots: OCP.OCP.TColStd.TColStd_HArray1OfReal) -> tuple[()]

  // GetTKnots(self
  GetTKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, theTMin: float, theTMax: float, theTKnots: OCP.OCP.TColStd.TColStd_HArray1OfReal) -> tuple[()]

  // GetFace(*args, **kwargs)
  GetFace(*args, **kwargs)
  GetFace(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> OCP.OCP.TopoDS.TopoDS_Face
  GetFace(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> OCP.OCP.TopoDS.TopoDS_Face
