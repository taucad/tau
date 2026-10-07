# kcl-std — std.view

9 top-level symbols. Signatures are verbatim kcl.

// Category: std.view
// Create a camera view that looks at the model from a standard orientation
// Remarks: The returned value stores intent, not resolved numbers: an argument you omit stays absent, and the consumer that activates the view resolves it against the model it is showing, so one view value is valid for any model. Every argument you do pass must be a finite number; an infinite or undefined value, such as one produced by dividing by zero, is an error rather than a stored value no consumer could use. Lengths are recorded in millimeters whatever unit you write them in, so `distance = 2inch` is stored as 50.8mm. The view means the same thing either way; a tool that reads the view back reports millimeters. A `distance` is a separation, so it must be greater than zero. Zero would put the camera on the point it looks at, and a negative value would put it behind that point; both are errors rather than a camera nobody can resolve. A `target` is a point, so its coordinates may be negative.
// EXPERIMENTAL
// std.view.view::oriented (function)
view::oriented(
  @orientation: Orientation,
  target?: Point3d,
  distance?: number(Length),
  projection?: Projection,
): CameraView
//   @orientation: The standard orientation the camera looks from
//   target: The point the camera looks at
//   distance: The distance from the camera to the target
//   projection: The camera projection
// Example:
//   @settings(experimentalFeatures = allow)
//   
//   isoView = view::oriented(view::Orientation::Isometric)
//   
//   frontView = view::oriented(
//     view::Orientation::Front,
//     target = [0, 0, 0],
//     distance = 500,
//     projection = view::Projection::Perspective,
//   )

// Category: std.view
// Create a camera view that looks along a custom direction
// Remarks: The returned value stores intent, not resolved numbers: an argument you omit stays absent, and the consumer that activates the view resolves it against the model it is showing, so one view value is valid for any model. `direction` and `up` set only directions: both are normalized when the view is constructed, so their magnitudes carry no information and zoom comes from `distance`. Each must be a non-zero vector, and they must not be parallel or nearly parallel to each other; such arguments are errors. Any angle above roughly 0.00006 degrees between the two is accepted, so only vectors that are parallel to within a rounding error are rejected. When that happens, choose an `up` that does not lie along `direction`. Every argument you pass must be a finite number; an infinite or undefined value, such as one produced by dividing by zero, is an error rather than a stored value no consumer could use. Lengths are recorded in millimeters whatever unit you write them in, so `distance = 2inch` is stored as 50.8mm, and a `target` coordinate is converted the same way. The view means the same thing either way; a tool that reads the view back reports millimeters. `direction` and `up` carry no unit at all, because only their ratio matters. A `distance` is a separation, so it must be greater than zero. Zero would put the camera on the point it looks at, and a negative value would put it behind that point; both are errors rather than a camera nobody can resolve. A `target` is a point, so its coordinates may be negative.
// EXPERIMENTAL
// std.view.view::directed (function)
view::directed(
  @direction: Point3d,
  up?: Point3d,
  target?: Point3d,
  distance?: number(Length),
  projection?: Projection,
): CameraView
//   @direction: The direction the camera looks, from the camera toward the target
//   up: The camera's up direction
//   target: The point the camera looks at
//   distance: The distance from the camera to the target
//   projection: The camera projection
// Example:
//   @settings(experimentalFeatures = allow)
//   
//   overheadView = view::directed([0, 1, -2])
//   
//   closeUp = view::directed(
//     [-1, -1, -0.3],
//     up = [0, 0, 1],
//     target = [0, 0, 10],
//     distance = 200,
//     projection = view::Projection::Perspective,
//   )

// Category: std.view
// Create a named view
// Remarks: A view is data, not an action. Creating one moves no camera and changes nothing about what is visible; a consumer such as the modeling app or a STEP export activates it later, which is why the same file yields the same views on every machine. The name is display text, so it may contain spaces and punctuation. It is required, because a view is identified by the name you give it and not by the variable you bind it to, so renaming a variable never renames a view. Names are unique within one file and compared exactly, which makes `Front` and `front` two different views. Four names are rejected: - the empty string, which identifies nothing; - a name of nothing but whitespace, which displays as nothing; - a name that starts or ends with whitespace, which a reader cannot see but the exact comparison above counts; - `Default View`, which is reserved for the view of the scene generated on successful execution of the program. `baseline` and `except` together decide what the view shows. You start from a clean state: `baseline` sets the visibility every object takes, and `except` lists the objects that depart from it. Every view writes its baseline out, so what a view shows can be read from the call alone: - `baseline = Visibility::Show` alone: everything is visible; - `baseline = Visibility::Show` with `except = [a, b]`: everything is visible except `a` and `b`; - `baseline = Visibility::Hide` with `except = [a, b]`: only `a` and `b` are visible; - `baseline = Visibility::Hide` alone: nothing is visible. Duplicates in `except` are dropped, so listing an object twice does the same as listing it once.
// EXPERIMENTAL
// std.view.view::named (function)
view::named(
  @name: string,
  camera: CameraView,
  baseline: Visibility,
  except?: [Solid | Sketch | GdtAnnotation; 1+],
): NamedView
//   @name: The name of the view, as a reader should see it
//   camera: The camera the view activates
//   baseline: The default visibility of every object the program creates
//   except: The objects the baseline does not apply to
// Example:
//   @settings(kclVersion = 2.0, experimentalFeatures = allow)
//   
//   // Two bodies to look at: a plate, and a boss standing on it. Declaring a
//   // view never changes what a program builds, so this part is ordinary KCL.
//   plateSketch = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 60mm, var 0mm])
//     edge2 = line(start = [var 60mm, var 0mm], end = [var 60mm, var 40mm])
//     edge3 = line(start = [var 60mm, var 40mm], end = [var 0mm, var 40mm])
//     edge4 = line(start = [var 0mm, var 40mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   plate = extrude(region(segments = [plateSketch.edge1, plateSketch.edge2]), length = 5mm)
//   
//   bossSketch = sketch(on = XY) {
//     boundary = circle(start = [var 40mm, var 20mm], center = [var 30mm, var 20mm])
//   }
//   boss = extrude(region(segments = [bossSketch.boundary]), length = 12mm)
//   
//   // This file hides the boss, so the scene generated on successful execution
//   // shows the plate alone. The views below are unaffected by this call; each
//   // one states its own visibility from scratch.
//   hide(boss)
//   
//   // 1. Everything visible.
//   //
//   // This is NOT the same as `Default View`, the view of the scene generated on
//   // successful execution of the program. A `Show` baseline shows every object
//   // the program built, including the boss that `hide(boss)` took out of that
//   // scene.
//   overview = view::named(
//     "Everything",
//     camera = view::oriented(view::Orientation::Isometric),
//     baseline = view::Visibility::Show,
//   )
//   
//   // 2. Visible by default, with one object hidden. Add to `except` to hide
//   // more.
//   plateInspection = view::named(
//     "Plate only",
//     camera = view::oriented(view::Orientation::Front, distance = 200mm),
//     baseline = view::Visibility::Show,
//     except = [boss],
//   )
//   
//   // 3. Hidden by default, with one object shown. This is the form to reach for
//   // when a view should isolate a few objects out of many, because `except`
//   // then lists what you want rather than everything you do not.
//   //
//   // This one is not assigned to a variable, which a view never requires: the
//   // display name is what identifies it.
//   view::named(
//     "Boss only",
//     camera = view::oriented(view::Orientation::Top, distance = 150mm),
//     baseline = view::Visibility::Hide,
//     except = [boss],
//   )

// Category: std.view
// A standard camera orientation for a named view
// Remarks: The six axis-aligned orientations name the side of the model the camera looks at; `Isometric` is the standard three-quarter view.
// EXPERIMENTAL
view::Orientation: type Orientation {
  | Front
  | Back
  | Left
  | Right
  | Top
  | Bottom
  | Isometric
}

// Category: std.view
// Whether the objects of a named view start visible or hidden
// Remarks: This is the view's baseline: it applies to every object, and the view's `except` list names the objects it does not apply to.
// EXPERIMENTAL
view::Visibility: type Visibility {
  | Show
  | Hide
}

// Category: std.view
// The camera projection of a named view
// EXPERIMENTAL
view::Projection: type Projection {
  | Orthographic
  | Perspective
}

// Category: std.view
// A camera viewpoint, stored as intent
// Remarks: Values of this type are opaque. Call [`view::oriented()`](/docs/kcl-std/functions/std-view-oriented) or [`view::directed()`](/docs/kcl-std/functions/std-view-directed) to produce one.
// EXPERIMENTAL
view::CameraView

// Category: std.view
// A named view
// Remarks: Values of this type are opaque. Call [`view::named()`](/docs/kcl-std/functions/std-view-named) to produce one.
// EXPERIMENTAL
view::NamedView

// Category: std.view
// Named views
// Remarks: A named view pairs a camera with a set of visible objects, so consumers such as the modeling app and STEP export can reproduce it. Build a camera by calling `view::oriented()` or `view::directed()`, then name a view by calling `view::named()`.
// EXPERIMENTAL
view
