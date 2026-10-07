# kcl-std — std.gdt

19 top-level symbols. Signatures are verbatim kcl.

// Category: std.gdt
// GD&T datum feature
// Remarks: This is part of model-based definition (MBD).
// std.gdt.gdt::datum (function)
gdt::datum(
  face: TaggedFace,
  name: string,
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): GdtAnnotation
//   face: The face to be annotated
//   name: The name of the datum
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 8mm, var 0mm])
//     edge2 = line(start = [var 8mm, var 0mm], end = [var 8mm, var 5mm])
//     edge3 = line(start = [var 8mm, var 5mm], end = [var 0mm, var 5mm])
//     edge4 = line(start = [var 0mm, var 5mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm, tagEnd = $top)
//   
//   gdt::datum(
//     face = top,
//     name = "A",
//     framePosition = [10mm, 0mm],
//     framePlane = XZ,
//   )

// Category: std.gdt
// GD&T annotation specifying how flat faces should be
// Remarks: This is part of model-based definition (MBD).
// std.gdt.gdt::flatness (function)
gdt::flatness(
  faces: [TaggedFace; 1+],
  tolerance: number(Length),
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   faces: The faces to be annotated
//   tolerance: The amount of deviation from a perfect plane that is acceptable
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm, tagEnd = $top)
//   gdt::flatness(faces = [top], tolerance = 0.05mm, framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T annotation specifying how straight a feature must be
// Remarks: This is part of model-based definition (MBD). Straightness is a form tolerance. When applied to a planar face, every line element of the face must lie between two parallel lines separated by the given `tolerance`. When applied to an edge, the edge itself must lie within that zone. Straightness should usually be applied to edges. But depending on the view, a face normal may appear like an edge.
// std.gdt.gdt::straightness (function)
gdt::straightness(
  tolerance: number(Length),
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The amount of deviation from perfectly straight that is acceptable
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   blockSketch = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 24mm])
//     edge3 = line(start = [var 10mm, var 24mm], end = [var 0mm, var 24mm])
//     edge4 = line(start = [var 0mm, var 24mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   blockRegion = region(segments = [blockSketch.edge1, blockSketch.edge2])
//   hide(blockSketch)
//   block = extrude(blockRegion, length = 10mm)
//   gdt::straightness(edges = [blockRegion.tags.edge2], tolerance = 0.05mm)

// Category: std.gdt
// GD&T annotation specifying how circular (round) a feature must be
// Remarks: This is part of model-based definition (MBD). Circularity is a form tolerance. It controls how much a feature of revolution may deviate from a perfect circle. When applied to a circular edge, every point of the edge must lie between two concentric circles whose radii differ by the given `tolerance`. When applied to a round face, such as the wall of a cylinder or cone, every cross-section perpendicular to the axis must meet that same requirement. Circularity is a form tolerance, so it does not reference datums.
// std.gdt.gdt::circularity (function)
gdt::circularity(
  tolerance: number(Length),
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The amount of deviation from a perfect circle that is acceptable
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   cylinderSketch = sketch(on = XY) {
//     perimeter = circle(start = [var 5mm, var 0mm], center = [var 0mm, var 0mm])
//   }
//   
//   cylinderRegion = region(segments = [cylinderSketch.perimeter])
//   hide(cylinderSketch)
//   cylinder = extrude(cylinderRegion, length = 10mm)
//   gdt::circularity(edges = [cylinderRegion.tags.perimeter], tolerance = 0.05mm, framePosition = [-12mm, 8mm])

// Category: std.gdt
// GD&T annotation specifying how closely a feature must conform to a perfect cylinder
// Remarks: This is part of model-based definition (MBD). Cylindricity is a form tolerance. It controls how much a cylindrical surface may deviate from a perfect cylinder, combining roundness, straightness, and taper into a single requirement. Every point on the surface must lie between two coaxial cylinders whose radii differ by the given `tolerance`. When applied to a round face, such as the wall of a cylinder, the whole surface must meet that requirement. When applied to a circular edge, that edge must lie within the same zone. Cylindricity is a form tolerance, so it does not reference datums.
// std.gdt.gdt::cylindricity (function)
gdt::cylindricity(
  tolerance: number(Length),
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The amount of deviation from a perfect cylinder that is acceptable
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   cylinderSketch = sketch(on = XY) {
//     perimeter = circle(start = [var 5mm, var 0mm], center = [var 0mm, var 0mm])
//   }
//   
//   cylinder = extrude(region(segments = [cylinderSketch.perimeter]), length = 10mm)
//   gdt::cylindricity(faces = [cylinder.sketch.tags.perimeter], tolerance = 0.02mm, framePosition = [-12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T concentricity annotation specifying how closely a feature's median axis must align with datum references
// Remarks: This is part of MBD. Concentricity is a location tolerance for features of size. It controls the derived median points of the annotated feature relative to a datum axis. The tolerance zone is cylindrical, with a diameter equal to `tolerance`. Datum references are required. In American Society of Mechanical Engineers (ASME) Y14.5, concentricity is applied regardless of feature size (RFS) and does not use maximum material condition (MMC) or least material condition (LMC) modifiers. ASME Y14.5-2018 removed concentricity in favor of other controls such as position or runout where appropriate. ISO standards use the name coaxiality for this concept.
// std.gdt.gdt::concentricity (function)
gdt::concentricity(
  tolerance: number(Length),
  datums: [string; 1+],
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The diameter of the cylindrical tolerance zone
//   datums: The datum references to display in the feature control frame
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   datumSketch = sketch(on = XY) {
//     diameter = line(start = [var -6mm, var 0mm], end = [var 6mm, var 0mm])
//     perimeter = arc(start = [var 6mm, var 0mm], end = [var -6mm, var 0mm], center = [var 0mm, var 0mm])
//     coincident([diameter.end, perimeter.start])
//     coincident([diameter.start, perimeter.end])
//   }
//   
//   datumCylinder = extrude(region(segments = [datumSketch.diameter, datumSketch.perimeter]), length = 10mm)
//   
//   controlledSketch = sketch(on = XY) {
//     diameter = line(start = [var -3mm, var 0mm], end = [var 3mm, var 0mm])
//     perimeter = arc(start = [var -3mm, var 0mm], end = [var 3mm, var 0mm], center = [var 0mm, var 0mm])
//     coincident([diameter.start, perimeter.start])
//     coincident([diameter.end, perimeter.end])
//   }
//   
//   controlledCylinder = extrude(region(segments = [controlledSketch.diameter, controlledSketch.perimeter]), length = 10mm)
//   
//   gdt::datum(face = datumCylinder.sketch.tags.perimeter, name = "A", framePosition = [-14mm, 8mm], framePlane = XZ)
//   gdt::concentricity(faces = [controlledCylinder.sketch.tags.perimeter], tolerance = 0.05mm, datums = ["A"], framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T symmetry annotation specifying how closely a feature's median plane must align with datum references
// Remarks: This is part of model-based definition (MBD). Symmetry is a location tolerance for features of size. It controls the derived median points of opposing feature surfaces relative to a datum center plane. The tolerance zone is bounded by two parallel planes equally disposed about the datum plane, with a total width equal to `tolerance`. Datum references are required. Symmetry is the non-circular counterpart to concentricity. It is typically used where mass balance or form distribution about a datum plane matters, but it is difficult to inspect and is often replaced by position or profile controls where appropriate. In American Society of Mechanical Engineers (ASME) Y14.5, symmetry is applied regardless of feature size (RFS) and does not use maximum material condition (MMC) or least material condition (LMC) modifiers.
// std.gdt.gdt::symmetry (function)
gdt::symmetry(
  tolerance: number(Length),
  datums: [string; 1+],
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The total width of the tolerance zone between two parallel planes
//   datums: The datum references to display in the feature control frame
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   latchProfile = sketch(on = XZ) {
//     bottom = line(start = [var -20mm, var -10mm], end = [var 20mm, var -10mm])
//     datumWidthFace = line(start = [var 20mm, var -10mm], end = [var 20mm, var 10mm])
//     topRight = line(start = [var 20mm, var 10mm], end = [var 5mm, var 10mm])
//     rightGrooveWall = line(start = [var 5mm, var 10mm], end = [var 5mm, var 3mm])
//     grooveFloor = line(start = [var 5mm, var 3mm], end = [var -5mm, var 3mm])
//     leftGrooveWall = line(start = [var -5mm, var 3mm], end = [var -5mm, var 10mm])
//     topLeft = line(start = [var -5mm, var 10mm], end = [var -20mm, var 10mm])
//     leftSide = line(start = [var -20mm, var 10mm], end = [var -20mm, var -10mm])
//     coincident([bottom.end, datumWidthFace.start])
//     coincident([datumWidthFace.end, topRight.start])
//     coincident([topRight.end, rightGrooveWall.start])
//     coincident([rightGrooveWall.end, grooveFloor.start])
//     coincident([grooveFloor.end, leftGrooveWall.start])
//     coincident([leftGrooveWall.end, topLeft.start])
//     coincident([topLeft.end, leftSide.start])
//     coincident([leftSide.end, bottom.start])
//     horizontal(bottom)
//     vertical(datumWidthFace)
//     horizontal(topRight)
//     vertical(rightGrooveWall)
//     horizontal(grooveFloor)
//     vertical(leftGrooveWall)
//     horizontal(topLeft)
//     vertical(leftSide)
//   }
//   
//   latchBlockRegion = region(segments = [latchProfile.bottom, latchProfile.datumWidthFace])
//   latchBlock = extrude(latchBlockRegion, length = 12mm)
//   
//   gdt::datum(face = latchBlock.sketch.tags.bottom, name = "A", framePosition = [0mm, -16mm], framePlane = XZ)
//   gdt::symmetry(faces = [latchBlock.sketch.tags.grooveFloor], tolerance = 0.2mm, datums = ["A"], framePosition = [-24mm, 14mm], framePlane = XZ)

// Category: std.gdt
// GD&T annotation specifying circular runout relative to a datum axis
// Remarks: This is part of model-based definition (MBD). Runout controls how much a round feature may vary as it rotates around a referenced datum axis. It may be applied to circular edges or round faces, such as the wall of a cylinder. Datum references are required. Runout is applied regardless of feature size and does not use MMC or LMC.
// std.gdt.gdt::runout (function)
gdt::runout(
  tolerance: number(Length),
  datums: [string; 1+],
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The circular runout relative to the datum axis that is acceptable
//   datums: The datum references to display in the feature control frame
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   annotationPlane = offsetPlane(XZ, offset = 24mm)
//   
//   controlledSketch = sketch(on = YZ) {
//     upperPerimeter = arc(start = [var 10mm, var 0mm], end = [var -10mm, var 0mm], center = [var 0mm, var 0mm])
//     lowerPerimeter = arc(start = [var -10mm, var 0mm], end = [var 10mm, var 0mm], center = [var 0mm, var 0mm])
//     coincident([upperPerimeter.end, lowerPerimeter.start])
//     coincident([lowerPerimeter.end, upperPerimeter.start])
//   }
//   
//   controlledShaft = extrude(
//     region(segments = [controlledSketch.upperPerimeter, controlledSketch.lowerPerimeter]),
//     length = -58mm,
//     tagStart = $controlledShoulder,
//     tagEnd = $controlledFreeEnd
//   )
//   
//   controlledUpperShoulderEdge = getCommonEdge(faces = [
//     controlledShaft.sketch.tags.upperPerimeter,
//     controlledShoulder
//   ])
//   
//   datumSketch = sketch(on = YZ) {
//     perimeter = circle(start = [var 18mm, var 0mm], center = [var 0mm, var 0mm])
//   }
//   
//   datumShaft = extrude(
//     region(segments = [datumSketch.perimeter]),
//     length = 36mm,
//     tagEnd = $datumEnd
//   )
//   
//   gdt::datum(
//     face = datumShaft.sketch.tags.perimeter,
//     name = "A",
//     framePosition = [18mm, -28mm],
//     framePlane = annotationPlane,
//     leaderScale = 1.15,
//     fontSize = 6mm
//   )
//   
//   gdt::runout(
//     edges = [controlledUpperShoulderEdge],
//     tolerance = 0.2mm,
//     datums = ["A"],
//     precision = 1,
//     framePosition = [12mm, 48mm],
//     framePlane = annotationPlane,
//     leaderScale = 1.15,
//     fontSize = 6mm
//   )

// Category: std.gdt
// GD&T angularity annotation specifying how much faces or edges may deviate from an orientation at a basic angle relative to datum references
// Remarks: This is part of model-based definition (MBD). Angularity is an orientation tolerance. The specified angle is a basic dimension in the drawing or model geometry. The `tolerance` is a length controlling the size of the zone, not an angular plus-or-minus value. Provide at least one of `faces` or `edges`. Supplying both is allowed, but omitting both is an error.
// std.gdt.gdt::angularity (function)
gdt::angularity(
  tolerance: number(Length),
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  datums?: [string; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The tolerance zone size for orientation at a basic angle
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   datums: The datum references to display in the feature control frame
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   basicAngle = 30deg
//   thickness = 3.5mm
//   flangeLength = 24mm
//   bendStartX = 5mm
//   legLength = 30mm
//   legRun = legLength * cos(basicAngle)
//   legRise = legLength * sin(basicAngle)
//   normalRun = thickness * sin(basicAngle)
//   normalRise = thickness * cos(basicAngle)
//   annotationFont = 2mm
//   
//   stampedProfile = sketch(on = XY) {
//     datumFace = line(start = [var 0mm, var 0mm], end = [var 24mm, var 0mm])
//     flangeEnd = line(start = [var 24mm, var 0mm], end = [var 24mm, var 3.5mm])
//     innerFlange = line(start = [var 24mm, var 3.5mm], end = [var 5mm, var 3.5mm])
//     controlledSurface = line(start = [var 5mm, var 3.5mm], end = [var 30.98mm, var 18.5mm])
//     tabEnd = line(start = [var 30.98mm, var 18.5mm], end = [var 29.23mm, var 21.53mm])
//     outerSurface = line(start = [var 29.23mm, var 21.53mm], end = [var 3.25mm, var 6.53mm])
//     outsideBend = line(start = [var 3.25mm, var 6.53mm], end = [var 0mm, var 0mm])
//     coincident([datumFace.end, flangeEnd.start])
//     coincident([flangeEnd.end, innerFlange.start])
//     coincident([innerFlange.end, controlledSurface.start])
//     coincident([controlledSurface.end, tabEnd.start])
//     coincident([tabEnd.end, outerSurface.start])
//     coincident([outerSurface.end, outsideBend.start])
//     coincident([outsideBend.end, datumFace.start])
//     coincident([datumFace.start, ORIGIN])
//     horizontal(datumFace)
//     horizontal(innerFlange)
//     vertical(flangeEnd)
//     distance([datumFace.start, datumFace.end]) == flangeLength
//     distance([flangeEnd.start, flangeEnd.end]) == thickness
//     distance([innerFlange.start, innerFlange.end]) == flangeLength - bendStartX
//     distance([controlledSurface.start, controlledSurface.end]) == legLength
//     distance([tabEnd.start, tabEnd.end]) == thickness
//     distance([outerSurface.start, outerSurface.end]) == legLength
//     parallel([controlledSurface, outerSurface])
//     perpendicular([controlledSurface, tabEnd])
//     angle([datumFace, controlledSurface]) == basicAngle
//   }
//   
//   stampedPart = extrude(region(segments = [stampedProfile.datumFace, stampedProfile.flangeEnd]), length = 0.8mm)
//   
//   gdt::datum(face = stampedPart.sketch.tags.datumFace, name = "A", framePosition = [6mm, -4mm], framePlane = XY, fontSize = annotationFont)
//   gdt::angularity(faces = [stampedPart.sketch.tags.controlledSurface], tolerance = 0.1mm, datums = ["A"], framePosition = [-12mm, 11mm], framePlane = XZ, fontSize = annotationFont)

// Category: std.gdt
// GD&T perpendicularity annotation specifying how much faces or edges may deviate from perpendicular orientation relative to datum references
// Remarks: This is part of model-based definition (MBD).
// std.gdt.gdt::perpendicularity (function)
gdt::perpendicularity(
  tolerance: number(Length),
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  datums?: [string; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The tolerance zone size for perpendicular orientation
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   datums: The datum references to display in the feature control frame
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm, tagEnd = $top)
//   sideEdge = getCommonEdge(faces = [block.sketch.tags.edge2, top])
//   gdt::perpendicularity(edges = [sideEdge], tolerance = 0.05mm, datums = ["A"], framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T parallelism annotation specifying how much faces or edges may deviate from parallel orientation relative to datum references
// Remarks: This is part of model-based definition (MBD).
// std.gdt.gdt::parallelism (function)
gdt::parallelism(
  tolerance: number(Length),
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  datums?: [string; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The tolerance zone size for parallel orientation
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   datums: The datum references to display in the feature control frame
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm, tagEnd = $top)
//   sideEdge = getCommonEdge(faces = [block.sketch.tags.edge1, top])
//   gdt::parallelism(edges = [sideEdge], tolerance = 0.05mm, datums = ["A"], framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T position annotation specifying how much faces or edges may deviate from their ideal location
// Remarks: This is part of model-based definition (MBD).
// std.gdt.gdt::position (function)
gdt::position(
  tolerance: number(Length),
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  datums?: [string; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The positional tolerance that is acceptable
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   datums: The datum references to display in the feature control frame
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm, tagEnd = $top)
//   sideEdge = getCommonEdge(faces = [block.sketch.tags.edge2, top])
//   gdt::position(edges = [sideEdge], tolerance = 0.05mm, datums = ["A"], framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T annotation for attaching manufacturing text to faces or edges
// Remarks: This is part of model-based definition (MBD).
// std.gdt.gdt::annotation (function)
gdt::annotation(
  annotation: string,
  faces?: [TaggedFace; 1+],
  edges?: [Edge | any; 1+],
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   annotation: The annotation text to display
//   faces: The faces to be annotated
//   edges: The edges to be annotated
//   framePosition: The position of the annotation relative to the leader arrow
//   framePlane: The plane in which to display the annotation
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm, tagEnd = $top)
//   sideEdge = getCommonEdge(faces = [block.sketch.tags.edge1, top])
//   gdt::annotation(edges = [sideEdge], annotation = "Deburr edge", framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T note for adding free-floating manufacturing text that is not attached to a face or edge
// Remarks: This is part of model-based definition (MBD). Unlike `gdt::annotation`, a note has no leader and is placed directly on a plane. By default it lives on the world `XY` plane, but any plane (a standard plane like `XZ`/`YZ`, or a user-defined plane) can be supplied via `framePlane`.
// std.gdt.gdt::note (function)
gdt::note(
  note: string,
  framePlane?: Plane,
  framePosition?: Point2d,
  fontSize?: number(Length),
  annotationName?: string,
): GdtAnnotation
//   note: The note text to display
//   framePlane: The plane the note lies in
//   framePosition: The 2D position of the note within the plane, in the plane's local coordinates
//   fontSize: The model-space height to use for the note text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   // A note on the default world (XY) plane.
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm)
//   
//   gdt::note(note = "Note on XY", framePosition = [12mm, 8mm])

// Category: std.gdt
// GD&T distance annotation for displaying measured edge lengths or distances between two entities
// Remarks: This is part of model-based definition (MBD).
// std.gdt.gdt::distance (function)
gdt::distance(
  tolerance?: number(Length),
  from?: Face | TaggedFace | Edge | any,
  to?: Face | TaggedFace | Edge | any,
  edges?: [Edge | any; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The acceptable distance tolerance
//   from: The face or edge to measure from
//   to: The face or edge to measure to
//   edges: The edges whose lengths are annotated
//   precision: The number of decimal places to display
//   framePosition: The position of the distance label relative to the measured geometry
//   framePlane: The plane in which to display the distance
//   leaderScale: Scale of the distance arrows
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   @settings(kclVersion = 2.0)
//   
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm, tagEnd = $top)
//   lengthEdge = getCommonEdge(faces = [block.sketch.tags.edge1, top])
//   gdt::distance(edges = [lengthEdge], tolerance = 0.05mm, framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T profile annotation specifying how much edges or faces may deviate from their ideal shape
// Remarks: This is part of model-based definition (MBD). `gdt::profile` is kept for backwards compatibility with existing KCL programs. For new code, prefer `gdt::profileLine` when annotating edges and `gdt::profileSurface` when annotating faces. Provide exactly one of `edges` or `faces`. Passing `edges` delegates to `profileLine`; passing `faces` delegates to `profileSurface`. Passing both, or neither, is a KCL error.
// std.gdt.gdt::profile (function)
gdt::profile(
  tolerance: number(Length),
  edges?: [Edge | any; 1+],
  faces?: [TaggedFace; 1+],
  datums?: [string; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   tolerance: The amount of deviation from an ideal profile that is acceptable
//   edges: The edges to be annotated with profile of a line
//   faces: The faces to be annotated with profile of a surface
//   datums: The datum references to display in the feature control frame
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   cylinderSketch = sketch(on = XY) {
//     perimeter = circle(start = [var 5mm, var 0mm], center = [var 0mm, var 0mm])
//   }
//   
//   cylinder = extrude(region(segments = [cylinderSketch.perimeter]), length = 10mm, tagEnd = $top)
//   gdt::profile(faces = [top], tolerance = 0.05mm, framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T profile-of-a-line annotation specifying how much edges may deviate from their ideal shape
// Remarks: This is part of model-based definition (MBD). Profile of a line is a two-dimensional tolerance zone for a cross-section or edge-like profile.
// std.gdt.gdt::profileLine (function)
gdt::profileLine(
  edges: [Edge | any; 1+],
  tolerance: number(Length),
  datums?: [string; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   edges: The edges to be annotated
//   tolerance: The amount of deviation from an ideal profile that is acceptable
//   datums: The datum references to display in the feature control frame
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 4mm, tagEnd = $top)
//   profileEdge = getCommonEdge(faces = [block.sketch.tags.edge1, top])
//   gdt::profileLine(edges = [profileEdge], tolerance = 0.05mm, framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// GD&T profile-of-a-surface annotation specifying how much faces may deviate from their ideal shape
// Remarks: This is part of model-based definition (MBD). Profile of a surface is a three-dimensional tolerance zone that applies across the whole annotated surface.
// std.gdt.gdt::profileSurface (function)
gdt::profileSurface(
  faces: [TaggedFace; 1+],
  tolerance: number(Length),
  datums?: [string; 1+],
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  leaderScale?: number(_),
  fontSize?: number(Length),
  annotationName?: string,
): [GdtAnnotation; 1+]
//   faces: The faces to be annotated
//   tolerance: The amount of deviation from an ideal profile that is acceptable
//   datums: The datum references to display in the feature control frame
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   leaderScale: Visual scale of the leader dot
//   fontSize: The model-space height to use for annotation text
//   annotationName: Human-friendly name for this annotation in exports and model metadata
// Example:
//   cylinderSketch = sketch(on = XY) {
//     perimeter = circle(start = [var 5mm, var 0mm], center = [var 0mm, var 0mm])
//   }
//   
//   cylinder = extrude(region(segments = [cylinderSketch.perimeter]), length = 10mm, tagEnd = $top)
//   gdt::profileSurface(faces = [top], tolerance = 0.05mm, framePosition = [12mm, 8mm], framePlane = XZ)

// Category: std.gdt
// Functions for working with geometric dimensioning and tolerancing (GD&T)
gdt
