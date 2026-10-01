# @jscad/modeling — utils

1 top-level symbols. Signatures are verbatim typescript.

utils

  // utils.areAllShapesTheSameType (function)
  declare function areAllShapesTheSameType(shapes: Array<Geometry>): boolean

  // utils.degToRad (function)
  declare function degToRad(degrees: number): number

  // utils.flatten (function)
  declare function flatten<T>(arr: RecursiveArray<T>): Array<T>

  // utils.fnNumberSort (function)
  declare function fnNumberSort(a: number, b: number): number

  // utils.insertSorted (function)
  declare function insertSorted<T>(array: Array<T>, element: T, comparefunc: (a: T, b: T) => number): void

  // utils.radiusToSegments (function)
  declare function radiusToSegments(radius: number, minimumLength?: number, minimumAngle?: number): number

  // utils.radToDeg (function)
  declare function radToDeg(radians: number): number
