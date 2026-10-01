# @jscad/modeling — measurements

1 top-level symbols. Signatures are verbatim typescript.

measurements

  // measurements.measureAggregateArea (function)
  declare function measureAggregateArea(...geometries: RecursiveArray<Geometry>): number

  // measurements.measureAggregateBoundingBox (function)
  declare function measureAggregateBoundingBox(...geometries: RecursiveArray<Geometry>): BoundingBox

  // measurements.measureAggregateEpsilon (function)
  declare function measureAggregateEpsilon(...geometries: RecursiveArray<Geometry>): number

  // measurements.measureAggregateVolume (function)
  declare function measureAggregateVolume(...geometries: RecursiveArray<Geometry>): number

  // measurements.measureArea (function)
  declare function measureArea(geometry: Geometry): number
  declare function measureArea(geometry: any): 0
  declare function measureArea(...geometries: RecursiveArray<Geometry | any>): Array<number>

  // measurements.measureBoundingBox (function)
  declare function measureBoundingBox(geometry: Geometry): BoundingBox
  declare function measureBoundingBox(geometry: any): [[0, 0, 0], [0, 0, 0]]
  declare function measureBoundingBox(...geometries: RecursiveArray<Geometry | any>): Array<BoundingBox>

  // measurements.measureBoundingSphere (function)
  declare function measureBoundingSphere(geometry: Geometry): [Centroid, number]
  declare function measureBoundingSphere(...geometries: RecursiveArray<Geometry>): [Centroid, number][]

  // measurements.measureCenter (function)
  declare function measureCenter(geometry: Geometry): [number, number, number]
  declare function measureCenter(...geometries: RecursiveArray<Geometry>): [number, number, number][]

  // measurements.measureCenterOfMass (function)
  declare function measureCenterOfMass(geometry: Geometry): [number, number, number]
  declare function measureCenterOfMass(...geometries: RecursiveArray<Geometry>): [number, number, number][]

  // measurements.measureDimensions (function)
  declare function measureDimensions(geometry: Geometry): [number, number, number]
  declare function measureDimensions(...geometries: RecursiveArray<Geometry>): [number, number, number][]

  // measurements.measureEpsilon (function)
  declare function measureEpsilon(geometry: Geometry): number
  declare function measureEpsilon(geometry: any): 0
  declare function measureEpsilon(...geometries: RecursiveArray<Geometry | any>): Array<number>

  // measurements.measureVolume (function)
  declare function measureVolume(geometry: Geometry): number
  declare function measureVolume(geometry: any): 0
  declare function measureVolume(...geometries: RecursiveArray<Geometry | any>): Array<number>

  BoundingBox: [Vec3, Vec3]
