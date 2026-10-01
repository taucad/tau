# build123d — HLRAlgo

1 top-level symbols. Signatures are verbatim python.

// Implements a projector object
HLRAlgo_Projector

  // __init__(*args, **kwargs)
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> None
  __init__(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, CS: OCP.OCP.gp.gp_Ax2) -> None
  __init__(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, CS: OCP.OCP.gp.gp_Ax2, Focus: float) -> None
  __init__(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, T: OCP.OCP.gp.gp_Trsf, Persp: bool, Focus: float) -> None
  __init__(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, T: OCP.OCP.gp.gp_Trsf, Persp: bool, Focus: float, v1: OCP.OCP.gp.gp_Vec2d, v2: OCP.OCP.gp.gp_Vec2d, v3: OCP.OCP.gp.gp_Vec2d) -> None

  // Set(self
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Set (method)
  Set(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, T: OCP.OCP.gp.gp_Trsf, Persp: bool, Focus: float) -> None

  // Directions(*args, **kwargs)
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Directions (method)
  Directions(*args, **kwargs)
  Directions(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, D1: OCP.OCP.gp.gp_Vec2d, D2: OCP.OCP.gp.gp_Vec2d, D3: OCP.OCP.gp.gp_Vec2d) -> None
  Directions(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, D1: OCP.OCP.gp.gp_Vec2d, D2: OCP.OCP.gp.gp_Vec2d, D3: OCP.OCP.gp.gp_Vec2d) -> None

  // Scaled(self
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Scaled (method)
  Scaled(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, On: bool = False) -> None

  // Perspective(*args, **kwargs)
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Perspective (method)
  Perspective(*args, **kwargs)
  Perspective(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> bool
  Perspective(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> bool

  // Focus(*args, **kwargs)
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Focus (method)
  Focus(*args, **kwargs)
  Focus(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> float
  Focus(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> float

  // Transform(*args, **kwargs)
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Transform (method)
  Transform(*args, **kwargs)
  Transform(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, D: OCP.OCP.gp.gp_Vec) -> None
  Transform(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, Pnt: OCP.OCP.gp.gp_Pnt) -> None
  Transform(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, D: OCP.OCP.gp.gp_Vec) -> None
  Transform(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, Pnt: OCP.OCP.gp.gp_Pnt) -> None

  // Project(*args, **kwargs)
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Project (method)
  Project(*args, **kwargs)
  Project(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, P: OCP.OCP.gp.gp_Pnt, Pout: OCP.OCP.gp.gp_Pnt2d) -> None
  Project(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, P: OCP.OCP.gp.gp_Pnt, D1: OCP.OCP.gp.gp_Vec, Pout: OCP.OCP.gp.gp_Pnt2d, D1out: OCP.OCP.gp.gp_Vec2d) -> None
  Project(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, P: OCP.OCP.gp.gp_Pnt) -> tuple[float, float, float]

  // Shoot(self
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Shoot (method)
  Shoot(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector, X: float, Y: float) -> OCP.OCP.gp.gp_Lin

  // Transformation(self
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.Transformation (method)
  Transformation(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> OCP.OCP.gp.gp_Trsf

  // InvertedTransformation(*args, **kwargs)
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.InvertedTransformation (method)
  InvertedTransformation(*args, **kwargs)
  InvertedTransformation(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> OCP.OCP.gp.gp_Trsf
  InvertedTransformation(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> OCP.OCP.gp.gp_Trsf

  // FullTransformation(*args, **kwargs)
  // OCP.OCP.HLRAlgo.HLRAlgo_Projector.FullTransformation (method)
  FullTransformation(*args, **kwargs)
  FullTransformation(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> OCP.OCP.gp.gp_Trsf
  FullTransformation(self: OCP.OCP.HLRAlgo.HLRAlgo_Projector) -> OCP.OCP.gp.gp_Trsf
