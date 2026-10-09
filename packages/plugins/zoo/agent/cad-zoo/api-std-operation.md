# kcl-std — std.operation

2 top-level symbols. Signatures are verbatim kcl.

// Category: std.operation
// EXPERIMENTAL
// std.operation.operation::facing (function)
operation::facing(
  @solid: Solid,
  toolDiameter: number(Length),
  stepOver: number,
): number(_)
//   @solid: A solid is a collection of extruded surfaces
//   toolDiameter: A number
//   stepOver: A number
// Example:
//   @settings(defaultLengthUnit = mm, kclVersion = 2.0, experimentalFeatures = allow)
//   stockLength = 100mm
//   stockWidth = 60mm
//   stockHeight = 20mm
//   toolDiameter = 20mm
//   stepOver = 0.7
//   halfStockLength = (stockLength / 2): mm
//   halfStockWidth = (stockWidth / 2): mm
//   
//   stockProfile = sketch(on = XY) {
//    bottomEdge = line(start = [var -50mm, var -30mm], end = [var 50mm, var -30mm])
//    rightEdge = line(start = [var 50mm, var -30mm], end = [var 50mm, var 30mm])
//    topEdge = line(start = [var 50mm, var 30mm], end = [var -50mm, var 30mm])
//    leftEdge = line(start = [var -50mm, var 30mm], end = [var -50mm, var -30mm])
//   
//    coincident([bottomEdge.end, rightEdge.start])
//    coincident([rightEdge.end, topEdge.start])
//    coincident([topEdge.end, leftEdge.start])
//    coincident([leftEdge.end, bottomEdge.start])
//    horizontal(bottomEdge)
//    vertical(rightEdge)
//    horizontal(topEdge)
//    vertical(leftEdge)
//    horizontalDistance([bottomEdge.start, bottomEdge.end]) == stockLength
//    verticalDistance([rightEdge.start, rightEdge.end]) == stockWidth
//    horizontalDistance([bottomEdge.start, ORIGIN]) == halfStockLength
//    verticalDistance([bottomEdge.start, ORIGIN]) == halfStockWidth
//   }
//   
//   stockRegion = region(
//    segments = [
//      stockProfile.bottomEdge,
//      stockProfile.rightEdge
//    ],
//    intersectionIndex = -1,
//    direction = CCW,
//   )
//   stockBody = extrude(stockRegion, length = stockHeight)
//   hide(stockProfile)
//   
//   facingOperation = operation::facing(stockBody, toolDiameter = toolDiameter, stepOver = stepOver)

// Category: std.operation
operation
