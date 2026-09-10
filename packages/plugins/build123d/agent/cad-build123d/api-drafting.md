# build123d — drafting

6 top-level symbols. Signatures are verbatim python.

// Sketch Object
Arrow

Arrow(arrow*size: float, shaft_path: Edge | Wire, shaft_width: float, head_at_start: bool = True, head_type: HeadType = HeadType.CURVED, mode: Mode = Mode.ADD)
// arrow_size: arrow head tip to tail length
// shaft_path: line describing the shaft shape
// shaft_width: line width of shaft
// head_at_start: Defaults to True
// head_type: arrow head shape
// mode: \_description*

// Sketch Object
ArrowHead

ArrowHead(size: float, head_type: HeadType = HeadType.CURVED, rotation: float = 0, mode: Mode = Mode.ADD)
// size: tip to tail length
// head_type: arrow head shape
// rotation: rotation in degrees
// mode: combination mode

// Sketch Object
DimensionLine

DimensionLine(path: PathDescriptor, draft: Draft, sketch: Sketch | None = None, label: str | None = None, arrows: tuple[bool, bool] = (True, True), tolerance: float | tuple[float, float] | None = None, label_angle: bool = False, mode: Mode = Mode.ADD)
// path: a very general type of input used to describe the path the dimension line will follow
// draft: instance of Draft dataclass
// sketch: the Sketch being created to check for possible overlaps
// label: Defaults to ''
// arrows: a pair of boolean values controlling the placement of the start and end arrows
// tolerance: an optional tolerance value to add to the extracted length value
// label_angle: a flag indicating that instead of an extracted length value, the size of the circular arc extracted from the path should be displayed in degrees
// mode: combination mode

// Draft
Draft

// Are metric units being used
is_metric: bool

Draft(font_size: float = 5.0, font: str = 'Arial', font_style: FontStyle = FontStyle.REGULAR, head_type: HeadType = HeadType.CURVED, arrow_length: float = 3.0, line_width: float = 0.5, pad_around_text: float = 2.0, unit: Unit = Unit.MM, number_display: NumberDisplay = NumberDisplay.DECIMAL, display_units: bool = True, decimal_precision: int = 2, fractional_precision: int = 64, extension_gap: float = 2.0) -> NoneType
// font_size: size of the text in dimension lines and callouts
// font: font to use for text
// font_style: text style
// head_type: arrow head shape
// arrow_length: arrow head length
// line_width: thickness of all lines
// pad_around_text: amount of padding around text
// unit: measurement unit
// number_display: numbers as decimal or fractions
// display_units: control the display of units with numbers
// decimal_precision: number of decimal places when displaying numbers
// fractional_precision: maximum fraction denominator - must be a factor of 2
// extension_gap: gap between the point and start of extension line in extension_line

// Sketch Object
ExtensionLine

ExtensionLine(border: PathDescriptor, offset: float, draft: Draft, sketch: Sketch | None = None, label: str | None = None, arrows: tuple[bool, bool] = (True, True), tolerance: float | tuple[float, float] | None = None, label_angle: bool = False, measurement_direction: VectorLike | None = None, mode: Mode = Mode.ADD)
// border: a very general type of input defining the object to be dimensioned
// offset: a distance to displace the dimension line from the edge of the object
// draft: instance of Draft dataclass
// label: Defaults to ''
// arrows: a pair of boolean values controlling the placement of the start and end arrows
// tolerance: an optional tolerance value to add to the extracted length value
// label_angle: a flag indicating that instead of an extracted length value, the size of the circular arc extracted from the path should be displayed in degrees
// measurement_direction: Vector line which to project the dimension against
// mode: combination mode

// Sketch Object
TechnicalDrawing

TechnicalDrawing(designed_by: str = 'build123d', design_date: date | None = None, page_size: PageSize = PageSize.A4, title: str = 'Title', sub_title: str = 'Sub Title', drawing_number: str = 'B3D-1', sheet_number: int | None = None, drawing_scale: float = 1.0, nominal_text_size: float = 10.0, line_width: float = 0.5, mode: Mode = Mode.ADD)
// designed_by: Defaults to "build123d"
// design_date: Defaults to date.today()
// page_size: Defaults to PageSize.A4
// title: drawing title
// sub_title: drawing sub title
// drawing_number: Defaults to "B3D-1"
// sheet_number: Defaults to None
// drawing_scale: displays as 1:value
// nominal_text_size: size of title text
// line_width: Defaults to 0.5
// mode: combination mode
