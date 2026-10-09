# build123d — objects_part

11 top-level symbols. Signatures are verbatim python.

# Category: objects_part
# BasePartObject
# Remarks: Base class for all BuildPart objects & operations
# build123d.objects_part.BasePartObject (class)
class BasePartObject(Part)

  # build123d.objects_part.BasePartObject.__init__ (constructor)
  BasePartObject(part: Part | Solid, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] | None = None, mode: Mode = Mode.ADD)
  #   rotation: angles to rotate about axes
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_part
# Part Object
# Remarks: Create a box defined by length, width, and height.
# build123d.objects_part.Box (class)
class Box(BasePartObject)

  # build123d.objects_part.Box.__init__ (constructor)
  Box(length: float, width: float, height: float, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   length: box length
  #   width: box width
  #   height: box height
  #   rotation: angles to rotate about axes
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combine mode

# Category: objects_part
# Part Object
# Remarks: Create a cone defined by bottom radius, top radius, and height.
# build123d.objects_part.Cone (class)
class Cone(BasePartObject)

  # build123d.objects_part.Cone.__init__ (constructor)
  Cone(bottom_radius: float, top_radius: float, height: float, arc_size: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   bottom_radius: bottom radius
  #   top_radius: top radius, may be zero
  #   height: cone height
  #   arc_size: angular size of cone
  #   rotation: angles to rotate about axes
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combine mode

# Category: objects_part
# Part Object
# Remarks: Create a convex solid from the convex hull of the provided points.
# build123d.objects_part.ConvexPolyhedron (class)
class ConvexPolyhedron(BasePartObject)

  # build123d.objects_part.ConvexPolyhedron.__init__ (constructor)
  ConvexPolyhedron(points: Iterable[VectorLike], rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] | None = Align.NONE, mode: Mode = Mode.ADD)
  #   points: vertices of the polyhedron
  #   rotation: angles to rotate about axes
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combine mode

# Category: objects_part
# Part Operation
# Remarks: Create a counter bore hole defined by radius, counter bore radius, counter bore and depth.
# build123d.objects_part.CounterBoreHole (class)
class CounterBoreHole(BasePartObject)

  # build123d.objects_part.CounterBoreHole.__init__ (constructor)
  CounterBoreHole(radius: float, counter_bore_radius: float, counter_bore_depth: float, depth: float | None = None, mode: Mode = Mode.SUBTRACT)
  #   radius: hole radius
  #   counter_bore_radius: counter bore radius
  #   counter_bore_depth: counter bore depth
  #   depth: hole depth, through part if None
  #   mode: combination mode

# Category: objects_part
# Part Operation
# Remarks: Create a countersink hole defined by radius, countersink radius, countersink angle, and depth.
# build123d.objects_part.CounterSinkHole (class)
class CounterSinkHole(BasePartObject)

  # build123d.objects_part.CounterSinkHole.__init__ (constructor)
  CounterSinkHole(radius: float, counter_sink_radius: float, depth: float | None = None, counter_sink_angle: float = 82, mode: Mode = Mode.SUBTRACT)
  #   radius: hole radius
  #   counter_sink_radius: countersink radius
  #   depth: hole depth, through part if None
  #   counter_sink_angle: cone angle
  #   mode: combination mode

# Category: objects_part
# Part Object
# Remarks: Create a cylinder defined by radius and height.
# build123d.objects_part.Cylinder (class)
class Cylinder(BasePartObject)

  # build123d.objects_part.Cylinder.__init__ (constructor)
  Cylinder(radius: float, height: float, arc_size: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   radius: cylinder radius
  #   height: cylinder height
  #   arc_size: angular size of cone
  #   rotation: angles to rotate about axes
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combine mode

# Category: objects_part
# Part Operation
# Remarks: Create a hole defined by radius and depth.
# build123d.objects_part.Hole (class)
class Hole(BasePartObject)

  # build123d.objects_part.Hole.__init__ (constructor)
  Hole(radius: float, depth: float | None = None, mode: Mode = Mode.SUBTRACT)
  #   radius: hole radius
  #   depth: hole depth, through part if None
  #   mode: combination mode

# Category: objects_part
# Part Object
# Remarks: Create a sphere defined by a radius.
# build123d.objects_part.Sphere (class)
class Sphere(BasePartObject)

  # build123d.objects_part.Sphere.__init__ (constructor)
  Sphere(radius: float, arc_size1: float = -90, arc_size2: float = 90, arc_size3: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   radius: sphere radius
  #   arc_size1: angular size of bottom hemisphere
  #   arc_size2: angular size of top hemisphere
  #   arc_size3: angular revolution about pole
  #   rotation: angles to rotate about axes
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combine mode

# Category: objects_part
# Part Object
# Remarks: Create a torus defined by major and minor radii.
# build123d.objects_part.Torus (class)
class Torus(BasePartObject)

  # build123d.objects_part.Torus.__init__ (constructor)
  Torus(major_radius: float, minor_radius: float, minor_start_angle: float = 0, minor_end_angle: float = 360, major_angle: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   major_radius: major torus radius
  #   minor_radius: minor torus radius
  #   minor_start_angle: angle to start minor arc
  #   minor_end_angle: angle to end minor arc
  #   major_angle: angle to revolve minor arc
  #   rotation: angles to rotate about axes
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combine mode

# Category: objects_part
# Part Object
# Remarks: Create a wedge with a near face defined by xsize and z size, a far face defined by xmin to xmax and zmin to zmax, and a depth of ysize.
# build123d.objects_part.Wedge (class)
class Wedge(BasePartObject)

  # build123d.objects_part.Wedge.__init__ (constructor)
  Wedge(xsize: float, ysize: float, zsize: float, xmin: float, zmin: float, xmax: float, zmax: float, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   xsize: length of near face along x-axis
  #   ysize: length of part along y-axis
  #   zsize: length of near face z-axis
  #   xmin: minimum position far face along x-axis
  #   zmin: minimum position far face along z-axis
  #   xmax: maximum position far face along x-axis
  #   zmax: maximum position far face along z-axis
  #   rotation: angles to rotate about axes
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combine mode
