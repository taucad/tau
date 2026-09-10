# @jscad/modeling — measurements

1 top-level symbols. Signatures are verbatim typescript.

measurements

declare function measureAggregateArea(...geometries: RecursiveArray<Geometry>): number

declare function measureAggregateBoundingBox(...geometries: RecursiveArray<Geometry>): BoundingBox

declare function measureAggregateEpsilon(...geometries: RecursiveArray<Geometry>): number

declare function measureAggregateVolume(...geometries: RecursiveArray<Geometry>): number

declare function measureArea(geometry: Geometry): number
declare function measureArea(geometry: any): 0
declare function measureArea(...geometries: RecursiveArray<Geometry | any>): Array<number>

declare function measureBoundingBox(geometry: Geometry): BoundingBox
declare function measureBoundingBox(geometry: any): [[0, 0, 0], [0, 0, 0]]
declare function measureBoundingBox(...geometries: RecursiveArray<Geometry | any>): Array<BoundingBox>

declare function measureBoundingSphere(geometry: Geometry): [Centroid, number]
declare function measureBoundingSphere(...geometries: RecursiveArray<Geometry>): [Centroid, number][]

declare function measureCenter(geometry: Geometry): [number, number, number]
declare function measureCenter(...geometries: RecursiveArray<Geometry>): [number, number, number][]

declare function measureCenterOfMass(geometry: Geometry): [number, number, number]
declare function measureCenterOfMass(...geometries: RecursiveArray<Geometry>): [number, number, number][]

declare function measureDimensions(geometry: Geometry): [number, number, number]
declare function measureDimensions(...geometries: RecursiveArray<Geometry>): [number, number, number][]

declare function measureEpsilon(geometry: Geometry): number
declare function measureEpsilon(geometry: any): 0
declare function measureEpsilon(...geometries: RecursiveArray<Geometry | any>): Array<number>

declare function measureVolume(geometry: Geometry): number
declare function measureVolume(geometry: any): 0
declare function measureVolume(...geometries: RecursiveArray<Geometry | any>): Array<number>

BoundingBox: [Vec3, Vec3]
