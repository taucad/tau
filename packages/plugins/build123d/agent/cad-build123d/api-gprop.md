# build123d — GProp

1 top-level symbols. Signatures are verbatim python.

// Implements a general mechanism to compute the global properties of a "compound geometric system" in 3d space by composition of the global properties of "elementary geometric entities" such as (curve, surface, solid, set of points)
GProp_GProps

  // __init__(*args, **kwargs)
  // OCP.OCP.GProp.GProp_GProps.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GProp.GProp_GProps) -> None
  __init__(self: OCP.OCP.GProp.GProp_GProps, SystemLocation: OCP.OCP.gp.gp_Pnt) -> None

  // Add(self
  // OCP.OCP.GProp.GProp_GProps.Add (method)
  Add(self: OCP.OCP.GProp.GProp_GProps, Item: OCP.OCP.GProp.GProp_GProps, Density: float = 1.0) -> None

  // Mass(self
  // OCP.OCP.GProp.GProp_GProps.Mass (method)
  Mass(self: OCP.OCP.GProp.GProp_GProps) -> float

  // CentreOfMass(self
  // OCP.OCP.GProp.GProp_GProps.CentreOfMass (method)
  CentreOfMass(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.gp.gp_Pnt

  // MatrixOfInertia(self
  // OCP.OCP.GProp.GProp_GProps.MatrixOfInertia (method)
  MatrixOfInertia(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.gp.gp_Mat

  // MomentOfInertia(self
  // OCP.OCP.GProp.GProp_GProps.MomentOfInertia (method)
  MomentOfInertia(self: OCP.OCP.GProp.GProp_GProps, A: OCP.OCP.gp.gp_Ax1) -> float

  // PrincipalProperties(self
  // OCP.OCP.GProp.GProp_GProps.PrincipalProperties (method)
  PrincipalProperties(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.GProp.GProp_PrincipalProps

  // RadiusOfGyration(self
  // OCP.OCP.GProp.GProp_GProps.RadiusOfGyration (method)
  RadiusOfGyration(self: OCP.OCP.GProp.GProp_GProps, A: OCP.OCP.gp.gp_Ax1) -> float

  // StaticMoments(self
  // OCP.OCP.GProp.GProp_GProps.StaticMoments (method)
  StaticMoments(self: OCP.OCP.GProp.GProp_GProps) -> tuple[float, float, float]
