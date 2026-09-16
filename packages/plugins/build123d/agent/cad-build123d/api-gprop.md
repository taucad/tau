# build123d — GProp

1 top-level symbols. Signatures are verbatim python.

// Implements a general mechanism to compute the global properties of a "compound geometric system" in 3d space by composition of the global properties of "elementary geometric entities" such as (curve, surface, solid, set of points)
GProp_GProps

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GProp.GProp_GProps) -> None
  __init__(self: OCP.OCP.GProp.GProp_GProps, SystemLocation: OCP.OCP.gp.gp_Pnt) -> None

  // Add(self
  Add(self: OCP.OCP.GProp.GProp_GProps, Item: OCP.OCP.GProp.GProp_GProps, Density: float = 1.0) -> None

  // Mass(self
  Mass(self: OCP.OCP.GProp.GProp_GProps) -> float

  // CentreOfMass(self
  CentreOfMass(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.gp.gp_Pnt

  // MatrixOfInertia(self
  MatrixOfInertia(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.gp.gp_Mat

  // MomentOfInertia(self
  MomentOfInertia(self: OCP.OCP.GProp.GProp_GProps, A: OCP.OCP.gp.gp_Ax1) -> float

  // PrincipalProperties(self
  PrincipalProperties(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.GProp.GProp_PrincipalProps

  // RadiusOfGyration(self
  RadiusOfGyration(self: OCP.OCP.GProp.GProp_GProps, A: OCP.OCP.gp.gp_Ax1) -> float

  // StaticMoments(self
  StaticMoments(self: OCP.OCP.GProp.GProp_GProps) -> tuple[float, float, float]
