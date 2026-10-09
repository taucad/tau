# build123d — objects_sketch

14 top-level symbols. Signatures are verbatim python.

# Category: objects_sketch
# BaseSketchObject
# Remarks: Base class for all BuildSketch objects
# build123d.objects_sketch.BaseSketchObject (class)
class BaseSketchObject(Sketch)

  # build123d.objects_sketch.BaseSketchObject.__init__ (constructor)
  BaseSketchObject(obj: Compound | Face, rotation: float = 0, align: Align | tuple[Align, Align] | None = None, mode: Mode = Mode.ADD)
  #   obj: OCCT Compound or shapes
  #   rotation: angle to rotate object
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a circle defined by radius.
# build123d.objects_sketch.Circle (class)
class Circle(BaseSketchObject)

  # build123d.objects_sketch.Circle.__init__ (constructor)
  Circle(radius: float, arc_size: float = 360.0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   radius: circle radius
  #   arc_size: angular size of sector
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create an ellipse defined by x- and y- radii.
# build123d.objects_sketch.Ellipse (class)
class Ellipse(BaseSketchObject)

  # build123d.objects_sketch.Ellipse.__init__ (constructor)
  Ellipse(x_radius: float, y_radius: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   x_radius: x radius of the ellipse (along the x-axis of plane)
  #   y_radius: y radius of the ellipse (along the y-axis of plane)
  #   rotation: angle to rotate object
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a polygon defined by given sequence of points. Note: the order of the points defines the resulting normal of the Face in Algebra mode, where counter-clockwise order creates an upward normal while clockwise order a downward normal. In Builder mode, the Face is added with an upward normal.
# build123d.objects_sketch.Polygon (class)
class Polygon(BaseSketchObject)

  # build123d.objects_sketch.Polygon.__init__ (constructor)
  Polygon(*pts: VectorLike | Iterable[VectorLike], rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.NONE, Align.NONE), mode: Mode = Mode.ADD)
  #   pts: sequence of points defining the vertices of the polygon
  #   rotation: angle to rotate object
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a rectangle defined by width and height.
# build123d.objects_sketch.Rectangle (class)
class Rectangle(BaseSketchObject)

  # build123d.objects_sketch.Rectangle.__init__ (constructor)
  Rectangle(width: float, height: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   width: rectangle width
  #   height: rectangle height
  #   rotation: angle to rotate object
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a rectangle defined by width and height with filleted corners.
# build123d.objects_sketch.RectangleRounded (class)
class RectangleRounded(BaseSketchObject)

  # build123d.objects_sketch.RectangleRounded.__init__ (constructor)
  RectangleRounded(width: float, height: float, radius: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   width: rectangle width
  #   height: rectangle height
  #   radius: fillet radius
  #   rotation: angle to rotate object
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a regular polygon defined by radius and side count. Use major_radius to define whether the polygon circumscribes (along the vertices) or inscribes (along the sides) the radius circle.
# build123d.objects_sketch.RegularPolygon (class)
class RegularPolygon(BaseSketchObject)

  # build123d.objects_sketch.RegularPolygon.__init__ (constructor)
  RegularPolygon(radius: float, side_count: int, major_radius: bool = True, rotation: float = 0, align: tuple[Align, Align] = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   radius: construction radius
  #   side_count: number of sides
  #   major_radius: If True the radius is the major radius (circumscribed circle), else the radius is the minor radius (inscribed circle)
  #   rotation: angle to rotate object
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a slot defined by a line and height. May be an arc, stright line, spline, etc.
# build123d.objects_sketch.SlotArc (class)
class SlotArc(BaseSketchObject)

  # build123d.objects_sketch.SlotArc.__init__ (constructor)
  SlotArc(arc: Edge | Wire, height: float, rotation: float = 0, mode: Mode = Mode.ADD)
  #   arc: center line of slot
  #   height: diameter of end arcs
  #   rotation: angle to rotate object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a slot defined by the center of the slot and the center of one end arc. The slot will be symmetric about the center point.
# build123d.objects_sketch.SlotCenterPoint (class)
class SlotCenterPoint(BaseSketchObject)

  # build123d.objects_sketch.SlotCenterPoint.__init__ (constructor)
  SlotCenterPoint(center: VectorLike, point: VectorLike, height: float, rotation: float = 0, mode: Mode = Mode.ADD)
  #   center: center point
  #   point: center of arc point
  #   height: diameter of end arcs
  #   rotation: angle to rotate object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a slot defined by the distance between the centers of the two end arcs.
# build123d.objects_sketch.SlotCenterToCenter (class)
class SlotCenterToCenter(BaseSketchObject)

  # build123d.objects_sketch.SlotCenterToCenter.__init__ (constructor)
  SlotCenterToCenter(center_separation: float, height: float, rotation: float = 0, mode: Mode = Mode.ADD)
  #   center_separation: distance between arc centers
  #   height: diameter of end arcs
  #   rotation: angle to rotate object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a slot defined by the overall width and height.
# build123d.objects_sketch.SlotOverall (class)
class SlotOverall(BaseSketchObject)

  # build123d.objects_sketch.SlotOverall.__init__ (constructor)
  SlotOverall(width: float, height: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   width: overall width of slot
  #   height: diameter of end arcs
  #   rotation: angle to rotate object
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create text defined by text string and font size. Fonts installed to the system can be specified by name and FontStyle. Fonts with subfamilies not in FontStyle should be specified with the subfamily name, e.g. "Arial Black". Alternatively, a specific font file can be specified with font_path. Use `available_fonts()` to list available font names for `font` and FontStyles. Note: on Windows, fonts must be installed with "Install for all users" to be found by name. Not all fonts have every FontStyle available, however ITALIC and BOLDITALIC will still italicize the font if the respective font file is not available. text_align specifies alignment of text inside the bounding box, while align the aligns the bounding box itself. Optionally, the Text can be positioned on a non-linear edge or wire with a path and position_on_path.
# build123d.objects_sketch.Text (class)
class Text(BaseSketchObject)

  # build123d.objects_sketch.Text.__init__ (constructor)
  Text(txt: str, font_size: float, font: str = 'Arial', font_path: PathLike[str] | str | None = None, font_style: FontStyle = FontStyle.REGULAR, text_align: tuple[TextAlign, TextAlign] = (TextAlign.CENTER, TextAlign.CENTER), align: Align | tuple[Align, Align] | None = None, path: Edge | Wire | None = None, position_on_path: float = 0.0, single_line_width: float | None = None, rotation: float = 0.0, mode: Mode = Mode.ADD)
  #   txt: text to render
  #   font_size: size of the font in model units
  #   font: font name
  #   font_path: system path to font file
  #   font_style: font style, REGULAR, BOLD, BOLDITALIC, or ITALIC
  #   text_align: horizontal text align LEFT, CENTER, or RIGHT
  #   align: align MIN, CENTER, or MAX of object
  #   path: path for text to follow
  #   position_on_path: the relative location on path to position the text, values must be between 0.0 and 1.0
  #   single_line_width: width of outlined single line font
  #   rotation: angle to rotate object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a trapezoid defined by major width, height, and interior angle(s).
# Throws: ValueError: Give angles result in an invalid trapezoid
# build123d.objects_sketch.Trapezoid (class)
class Trapezoid(BaseSketchObject)

  # build123d.objects_sketch.Trapezoid.__init__ (constructor)
  Trapezoid(width: float, height: float, left_side_angle: float, right_side_angle: float | None = None, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  #   width: trapezoid major width
  #   height: trapezoid height
  #   left_side_angle: bottom left interior angle
  #   right_side_angle: bottom right interior angle
  #   rotation: angle to rotate object
  #   align: align MIN, CENTER, or MAX of object
  #   mode: combination mode

# Category: objects_sketch
# Sketch Object
# Remarks: Create a triangle defined by one side length and any of two other side lengths or interior angles. The interior angles are opposite the side with the same designation (i.e. side 'a' is opposite angle 'A'). Side 'a' is the bottom side, followed by 'b' on the right, going counter-clockwise.
# Throws: ValueError: One length and two other values were not provided
# build123d.objects_sketch.Triangle (class)
class Triangle(BaseSketchObject)

  # build123d.objects_sketch.Triangle.__init__ (constructor)
  Triangle(*, a: float | None = None, b: float | None = None, c: float | None = None, A: float | None = None, B: float | None = None, C: float | None = None, align: Align | tuple[Align, Align] | None = None, rotation: float = 0, mode: Mode = Mode.ADD)
  #   a: side 'a' length
  #   b: side 'b' length
  #   c: side 'c' length
  #   A: interior angle 'A'
  #   B: interior angle 'B'
  #   C: interior angle 'C'
  #   align: align MIN, CENTER, or MAX of object
  #   rotation: angle to rotate object
  #   mode: combination mode
