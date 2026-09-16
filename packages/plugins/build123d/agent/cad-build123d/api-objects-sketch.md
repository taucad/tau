# build123d — objects_sketch

14 top-level symbols. Signatures are verbatim python.

// BaseSketchObject
BaseSketchObject

  BaseSketchObject(obj: Compound | Face, rotation: float = 0, align: Align | tuple[Align, Align] | None = None, mode: Mode = Mode.ADD)
  //   obj: OCCT Compound or shapes
  //   rotation: angle to rotate object
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
Circle

  Circle(radius: float, arc_size: float = 360.0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  //   radius: circle radius
  //   arc_size: angular size of sector
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
Ellipse

  Ellipse(x_radius: float, y_radius: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  //   x_radius: x radius of the ellipse (along the x-axis of plane)
  //   y_radius: y radius of the ellipse (along the y-axis of plane)
  //   rotation: angle to rotate object
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
Polygon

  Polygon(*pts: VectorLike | Iterable[VectorLike], rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.NONE, Align.NONE), mode: Mode = Mode.ADD)
  //   pts: sequence of points defining the vertices of the polygon
  //   rotation: angle to rotate object
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
Rectangle

  Rectangle(width: float, height: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  //   width: rectangle width
  //   height: rectangle height
  //   rotation: angle to rotate object
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
RectangleRounded

  RectangleRounded(width: float, height: float, radius: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  //   width: rectangle width
  //   height: rectangle height
  //   radius: fillet radius
  //   rotation: angle to rotate object
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
RegularPolygon

  RegularPolygon(radius: float, side_count: int, major_radius: bool = True, rotation: float = 0, align: tuple[Align, Align] = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  //   radius: construction radius
  //   side_count: number of sides
  //   major_radius: If True the radius is the major radius (circumscribed circle), else the radius is the minor radius (inscribed circle)
  //   rotation: angle to rotate object
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
SlotArc

  SlotArc(arc: Edge | Wire, height: float, rotation: float = 0, mode: Mode = Mode.ADD)
  //   arc: center line of slot
  //   height: diameter of end arcs
  //   rotation: angle to rotate object
  //   mode: combination mode

// Sketch Object
SlotCenterPoint

  SlotCenterPoint(center: VectorLike, point: VectorLike, height: float, rotation: float = 0, mode: Mode = Mode.ADD)
  //   center: center point
  //   point: center of arc point
  //   height: diameter of end arcs
  //   rotation: angle to rotate object
  //   mode: combination mode

// Sketch Object
SlotCenterToCenter

  SlotCenterToCenter(center_separation: float, height: float, rotation: float = 0, mode: Mode = Mode.ADD)
  //   center_separation: distance between arc centers
  //   height: diameter of end arcs
  //   rotation: angle to rotate object
  //   mode: combination mode

// Sketch Object
SlotOverall

  SlotOverall(width: float, height: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  //   width: overall width of slot
  //   height: diameter of end arcs
  //   rotation: angle to rotate object
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
Text

  Text(txt: str, font_size: float, font: str = 'Arial', font_path: PathLike[str] | str | None = None, font_style: FontStyle = FontStyle.REGULAR, text_align: tuple[TextAlign, TextAlign] = (TextAlign.CENTER, TextAlign.CENTER), align: Align | tuple[Align, Align] | None = None, path: Edge | Wire | None = None, position_on_path: float = 0.0, single_line_width: float | None = None, rotation: float = 0.0, mode: Mode = Mode.ADD)
  //   txt: text to render
  //   font_size: size of the font in model units
  //   font: font name
  //   font_path: system path to font file
  //   font_style: font style, REGULAR, BOLD, BOLDITALIC, or ITALIC
  //   text_align: horizontal text align LEFT, CENTER, or RIGHT
  //   align: align MIN, CENTER, or MAX of object
  //   path: path for text to follow
  //   position_on_path: the relative location on path to position the text, values must be between 0.0 and 1.0
  //   single_line_width: width of outlined single line font
  //   rotation: angle to rotate object
  //   mode: combination mode

// Sketch Object
Trapezoid

  Trapezoid(width: float, height: float, left_side_angle: float, right_side_angle: float | None = None, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
  //   width: trapezoid major width
  //   height: trapezoid height
  //   left_side_angle: bottom left interior angle
  //   right_side_angle: bottom right interior angle
  //   rotation: angle to rotate object
  //   align: align MIN, CENTER, or MAX of object
  //   mode: combination mode

// Sketch Object
Triangle

  Triangle(a: float | None = None, b: float | None = None, c: float | None = None, A: float | None = None, B: float | None = None, C: float | None = None, align: Align | tuple[Align, Align] | None = None, rotation: float = 0, mode: Mode = Mode.ADD)
  //   a: side 'a' length
  //   b: side 'b' length
  //   c: side 'c' length
  //   A: interior angle 'A'
  //   B: interior angle 'B'
  //   C: interior angle 'C'
  //   align: align MIN, CENTER, or MAX of object
  //   rotation: angle to rotate object
  //   mode: combination mode
