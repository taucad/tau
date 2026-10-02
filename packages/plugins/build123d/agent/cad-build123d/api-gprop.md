# build123d — GProp

1 top-level symbols. Signatures are verbatim python.

// Category: GProp
// Implements a general mechanism to compute the global properties of a "compound geometric system" in 3d space by composition of the global properties of "elementary geometric entities" such as (curve, surface, solid, set of points)
GProp_GProps

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.GProp.GProp_GProps) -> None 2. __init__(self: OCP.OCP.GProp.GProp_GProps, SystemLocation: OCP.OCP.gp.gp_Pnt) -> None
  // OCP.OCP.GProp.GProp_GProps.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GProp.GProp_GProps) -> None
  __init__(self: OCP.OCP.GProp.GProp_GProps, SystemLocation: OCP.OCP.gp.gp_Pnt) -> None

  // Add(self
  // Remarks: Either - initializes the global properties retained by this framework from those retained by the framework Item, or - brings together the global properties still retained by this framework with those retained by the framework Item. The value Density, which is 1.0 by default, is used as the density of the system analysed by Item. Sometimes the density will have already been given at the time of construction of the framework Item. This may be the case for example, if Item is a GProp_PGProps framework built to compute the global properties of a set of points ; or another GProp_GProps object which already retains composite global properties. In these cases the real density was perhaps already taken into account at the time of construction of Item. Note that this is not checked: if the density of parts of the system is taken into account two or more times, results of the computation will be false. Notes : - The point relative to which the inertia of Item is computed (i.e. the reference point of Item) may be different from the reference point in this framework. Huygens' theorem is applied automatically to transfer inertia values to the reference point in this framework. - The function Add is used once per component of the system. After that, you use the interrogation functions available to access values computed for the system. - The system whose global properties are already brought together by this framework is referred to as the current system. However, the current system is not retained by this framework, which maintains only its global properties. Exceptions Standard_DomainError if Density is less than or equal to gp::Resolution().
  // OCP.OCP.GProp.GProp_GProps.Add (method)
  Add(self: OCP.OCP.GProp.GProp_GProps, Item: OCP.OCP.GProp.GProp_GProps, Density: float = 1.0) -> None

  // Mass(self
  // Remarks: Returns the mass of the current system. If no density is attached to the components of the current system the returned value corresponds to : - the total length of the edges of the current system if this framework retains only linear properties, as is the case for example, when using only the LinearProperties function to combine properties of lines from shapes, or - the total area of the faces of the current system if this framework retains only surface properties, as is the case for example, when using only the SurfaceProperties function to combine properties of surfaces from shapes, or - the total volume of the solids of the current system if this framework retains only volume properties, as is the case for example, when using only the VolumeProperties function to combine properties of volumes from solids. Warning A length, an area, or a volume is computed in the current data unit system. The mass of a single object is obtained by multiplying its length, its area or its volume by the given density. You must be consistent with respect to the units used.
  // OCP.OCP.GProp.GProp_GProps.Mass (method)
  Mass(self: OCP.OCP.GProp.GProp_GProps) -> float

  // CentreOfMass(self
  // Remarks: Returns the center of mass of the current system. If the gravitational field is uniform, it is the center of gravity. The coordinates returned for the center of mass are expressed in the absolute Cartesian coordinate system.
  // OCP.OCP.GProp.GProp_GProps.CentreOfMass (method)
  CentreOfMass(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.gp.gp_Pnt

  // MatrixOfInertia(self
  // Remarks: returns the matrix of inertia. It is a symmetrical matrix. The coefficients of the matrix are the quadratic moments of inertia.
  // OCP.OCP.GProp.GProp_GProps.MatrixOfInertia (method)
  MatrixOfInertia(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.gp.gp_Mat

  // MomentOfInertia(self
  // Remarks: computes the moment of inertia of the material system about the axis A.
  // OCP.OCP.GProp.GProp_GProps.MomentOfInertia (method)
  MomentOfInertia(self: OCP.OCP.GProp.GProp_GProps, A: OCP.OCP.gp.gp_Ax1) -> float

  // PrincipalProperties(self
  // Remarks: Computes the principal properties of inertia of the current system. There is always a set of axes for which the products of inertia of a geometric system are equal to 0; i.e. the matrix of inertia of the system is diagonal. These axes are the principal axes of inertia. Their origin is coincident with the center of mass of the system. The associated moments are called the principal moments of inertia. This function computes the eigen values and the eigen vectors of the matrix of inertia of the system. Results are stored by using a presentation framework of principal properties of inertia (GProp_PrincipalProps object) which may be queried to access the value sought.
  // OCP.OCP.GProp.GProp_GProps.PrincipalProperties (method)
  PrincipalProperties(self: OCP.OCP.GProp.GProp_GProps) -> OCP.OCP.GProp.GProp_PrincipalProps

  // RadiusOfGyration(self
  // Remarks: Returns the radius of gyration of the current system about the axis A.
  // OCP.OCP.GProp.GProp_GProps.RadiusOfGyration (method)
  RadiusOfGyration(self: OCP.OCP.GProp.GProp_GProps, A: OCP.OCP.gp.gp_Ax1) -> float

  // StaticMoments(self
  // Remarks: Returns Ix, Iy, Iz, the static moments of inertia of the current system; i.e. the moments of inertia about the three axes of the Cartesian coordinate system.
  // OCP.OCP.GProp.GProp_GProps.StaticMoments (method)
  StaticMoments(self: OCP.OCP.GProp.GProp_GProps) -> tuple[float, float, float]
