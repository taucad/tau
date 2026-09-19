# @jscad/modeling — utils

1 top-level symbols. Signatures are verbatim typescript.

utils

  declare function areAllShapesTheSameType(shapes: Array<Geometry>): boolean

  declare function degToRad(degrees: number): number

  declare function flatten<T>(arr: RecursiveArray<T>): Array<T>

  declare function fnNumberSort(a: number, b: number): number

  declare function insertSorted<T>(array: Array<T>, element: T, comparefunc: (a: T, b: T) => number): void

  declare function radiusToSegments(radius: number, minimumLength?: number, minimumAngle?: number): number

  declare function radToDeg(radians: number): number
