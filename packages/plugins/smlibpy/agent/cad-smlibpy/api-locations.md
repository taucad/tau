# smlibpy — locations

4 top-level symbols. Signatures are verbatim python.

# Category: locations
# A rectangular grid in the XY plane, centered on the origin unless ``centered=False``
# smlibpy.locations.GridLocations (function)
GridLocations(x_spacing: float, y_spacing: float, x_count: int, y_count: int, *, centered: bool = True) -> Locations

# Category: locations
# A honeycomb pattern
# smlibpy.locations.HexLocations (function)
HexLocations(spacing: float, x_count: int, y_count: int, *, centered: bool = True) -> Locations

# Category: locations
# A list of locations
# Remarks: planes, faces (their center planes) or vertices.
# smlibpy.locations.Locations (class)
class Locations(list)

  # smlibpy.locations.Locations.__init__ (constructor)
  Locations(*items: Any)

  # Return self*value
  # smlibpy.locations.Locations.__mul__ (method)
  __mul__(other: Any) -> Any  # Locations * other

  # Return value*self
  # smlibpy.locations.Locations.__rmul__ (method)
  __rmul__(other: Any) -> Any  # other * Locations

  # The pattern placed onto a plane or face
  # smlibpy.locations.Locations.on (method)
  on(target: Any) -> Locations

  points: list[Vector]

# Category: locations
# ``count`` locations on a circle of ``radius`` in the XY plane
# Remarks: With ``rotate`` the copies turn with the pattern (their X axis points outward). A full circle (``angular_range=360``) spaces them evenly without repeating the start.
# smlibpy.locations.PolarLocations (function)
PolarLocations(radius: float, count: int, *, start_angle: float = 0.0, angular_range: float = 360.0, rotate: bool = True) -> Locations
