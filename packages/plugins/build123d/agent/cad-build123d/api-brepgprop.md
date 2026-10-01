# build123d — BRepGProp

2 top-level symbols. Signatures are verbatim python.

// Provides global functions to compute a shape's global properties for lines, surfaces or volumes, and bring them together with the global properties already computed for a geometric system
BRepGProp

  // __init__(self
  // OCP.OCP.BRepGProp.BRepGProp.__init__ (constructor)
  __init__(self: OCP.OCP.BRepGProp.BRepGProp) -> None

  // LinearProperties_s(S
  // OCP.OCP.BRepGProp.BRepGProp.LinearProperties_s (method)
  LinearProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LProps: OCP.OCP.GProp.GProp_GProps, SkipShared: bool = False, UseTriangulation: bool = False) -> None

  // SurfaceProperties_s(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp.SurfaceProperties_s (method)
  SurfaceProperties_s(*args, **kwargs)
  SurfaceProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, SProps: OCP.OCP.GProp.GProp_GProps, SkipShared: bool = False, UseTriangulation: bool = False) -> None
  SurfaceProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, SProps: OCP.OCP.GProp.GProp_GProps, Eps: float, SkipShared: bool = False) -> float

  // VolumeProperties_s(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp.VolumeProperties_s (method)
  VolumeProperties_s(*args, **kwargs)
  VolumeProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, OnlyClosed: bool = False, SkipShared: bool = False, UseTriangulation: bool = False) -> None
  VolumeProperties_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, Eps: float, OnlyClosed: bool = False, SkipShared: bool = False) -> float

  // VolumePropertiesGK_s(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp.VolumePropertiesGK_s (method)
  VolumePropertiesGK_s(*args, **kwargs)
  VolumePropertiesGK_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, Eps: float = 0.001, OnlyClosed: bool = False, IsUseSpan: bool = False, CGFlag: bool = False, IFlag: bool = False, SkipShared: bool = False) -> float
  VolumePropertiesGK_s(S: OCP.OCP.TopoDS.TopoDS_Shape, VProps: OCP.OCP.GProp.GProp_GProps, thePln: OCP.OCP.gp.gp_Pln, Eps: float = 0.001, OnlyClosed: bool = False, IsUseSpan: bool = False, CGFlag: bool = False, IFlag: bool = False, SkipShared: bool = False) -> float

BRepGProp_Face

  // __init__(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp_Face.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepGProp.BRepGProp_Face, IsUseSpan: bool = False) -> None
  __init__(self: OCP.OCP.BRepGProp.BRepGProp_Face, F: OCP.OCP.TopoDS.TopoDS_Face, IsUseSpan: bool = False) -> None

  // Load(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp_Face.Load (method)
  Load(*args, **kwargs)
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool
  Load(self: OCP.OCP.BRepGProp.BRepGProp_Face, IsFirstParam: bool, theIsoType: OCP.OCP.GeomAbs.GeomAbs_IsoType) -> None

  // VIntegrationOrder(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.VIntegrationOrder (method)
  VIntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // NaturalRestriction(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp_Face.NaturalRestriction (method)
  NaturalRestriction(*args, **kwargs)
  NaturalRestriction(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> bool
  NaturalRestriction(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> bool

  // Value2d(*args, **kwargs)
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
  // OCP.OCP.BRepGProp.BRepGProp_Face.UIntegrationOrder (method)
  UIntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // Normal(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.Normal (method)
  Normal(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, VNor: OCP.OCP.gp.gp_Vec) -> None

  // FirstParameter(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp_Face.FirstParameter (method)
  FirstParameter(*args, **kwargs)
  FirstParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float
  FirstParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float

  // LastParameter(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp_Face.LastParameter (method)
  LastParameter(*args, **kwargs)
  LastParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float
  LastParameter(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> float

  // IntegrationOrder(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.IntegrationOrder (method)
  IntegrationOrder(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> int

  // D12d(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp_Face.D12d (method)
  D12d(*args, **kwargs)
  D12d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, P: OCP.OCP.gp.gp_Pnt2d, V1: OCP.OCP.gp.gp_Vec2d) -> None
  D12d(self: OCP.OCP.BRepGProp.BRepGProp_Face, U: float, P: OCP.OCP.gp.gp_Pnt2d, V1: OCP.OCP.gp.gp_Vec2d) -> None

  // Bounds(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.Bounds (method)
  Bounds(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> tuple[float, float, float, float]

  // GetUKnots(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.GetUKnots (method)
  GetUKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, theUMin: float, theUMax: float, theUKnots: OCP.OCP.TColStd.TColStd_HArray1OfReal) -> tuple[()]

  // GetTKnots(self
  // OCP.OCP.BRepGProp.BRepGProp_Face.GetTKnots (method)
  GetTKnots(self: OCP.OCP.BRepGProp.BRepGProp_Face, theTMin: float, theTMax: float, theTKnots: OCP.OCP.TColStd.TColStd_HArray1OfReal) -> tuple[()]

  // GetFace(*args, **kwargs)
  // OCP.OCP.BRepGProp.BRepGProp_Face.GetFace (method)
  GetFace(*args, **kwargs)
  GetFace(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> OCP.OCP.TopoDS.TopoDS_Face
  GetFace(self: OCP.OCP.BRepGProp.BRepGProp_Face) -> OCP.OCP.TopoDS.TopoDS_Face
