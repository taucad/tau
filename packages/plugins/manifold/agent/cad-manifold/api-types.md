# manifold-3d — Types

12 top-level symbols. Signatures are verbatim typescript.

// A three dimensional box, aligned to the coordinate system
Box: {
    min: Vec3,
    max: Vec3
}

ErrorStatus: 'NoError'|'NonFiniteVertex'|'NotManifold'|
'VertexOutOfBounds'|'PropertiesWrongLength'|'MissingPositionProperties'|
'MergeVectorsDifferentLengths'|'MergeIndexOutOfBounds'|
'TransformWrongLength'|'RunIndexWrongLength'|'FaceIDWrongLength'|
'InvalidConstruction'

FillRule: 'EvenOdd'|'NonZero'|'Positive'|'Negative'

JoinType: 'Square'|'Round'|'Miter'

// 3x3 matrix stored in column-major order
Mat3: [
number,
number,
number,
number,
number,
number,
number,
number,
number,
]

// 4x4 matrix stored in column-major order
Mat4: [
number,
number,
number,
number,
number,
number,
number,
number,
number,
number,
number,
number,
number,
number,
number,
number,
]

Polygons: SimplePolygon|SimplePolygon[]

// A two dimensional rectangle, aligned to the coordinate system
Rect: {
    min: Vec2,
    max: Vec2
}

SimplePolygon: Vec2[]

Smoothness: {
    halfedge: number,
    smoothness: number
}

// A vector in two dimensional space
Vec2: [number, number]

// A vector in three dimensional space
Vec3: [number, number, number]
