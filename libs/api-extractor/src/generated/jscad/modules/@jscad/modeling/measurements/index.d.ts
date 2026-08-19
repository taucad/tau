import type { Geometry, RecursiveArray, Vec3 } from '@jscad/modeling';

export type Centroid = [
    number,
    number,
    number
];
export declare function measureAggregateArea(...geometries: RecursiveArray<Geometry>): number;
export declare function measureAggregateBoundingBox(...geometries: RecursiveArray<Geometry>): BoundingBox;
export declare function measureAggregateEpsilon(...geometries: RecursiveArray<Geometry>): number;
export declare function measureAggregateVolume(...geometries: RecursiveArray<Geometry>): number;
export declare function measureArea(geometry: Geometry): number;
export declare function measureArea(geometry: any): 0;
export declare function measureArea(...geometries: RecursiveArray<Geometry | any>): Array<number>;
export declare function measureBoundingBox(geometry: Geometry): BoundingBox;
export declare function measureBoundingBox(geometry: any): [
    [
        0,
        0,
        0
    ],
    [
        0,
        0,
        0
    ]
];
export declare function measureBoundingBox(...geometries: RecursiveArray<Geometry | any>): Array<BoundingBox>;
export declare function measureBoundingSphere(geometry: Geometry): [
    Centroid,
    number
];
export declare function measureBoundingSphere(...geometries: RecursiveArray<Geometry>): [
    Centroid,
    number
][];
export declare function measureCenter(geometry: Geometry): [
    number,
    number,
    number
];
export declare function measureCenter(...geometries: RecursiveArray<Geometry>): [
    number,
    number,
    number
][];
export declare function measureCenterOfMass(geometry: Geometry): [
    number,
    number,
    number
];
export declare function measureCenterOfMass(...geometries: RecursiveArray<Geometry>): [
    number,
    number,
    number
][];
export declare function measureDimensions(geometry: Geometry): [
    number,
    number,
    number
];
export declare function measureDimensions(...geometries: RecursiveArray<Geometry>): [
    number,
    number,
    number
][];
export declare function measureEpsilon(geometry: Geometry): number;
export declare function measureEpsilon(geometry: any): 0;
export declare function measureEpsilon(...geometries: RecursiveArray<Geometry | any>): Array<number>;
export declare function measureVolume(geometry: Geometry): number;
export declare function measureVolume(geometry: any): 0;
export declare function measureVolume(...geometries: RecursiveArray<Geometry | any>): Array<number>;
export type BoundingBox = [
    Vec3,
    Vec3
];
