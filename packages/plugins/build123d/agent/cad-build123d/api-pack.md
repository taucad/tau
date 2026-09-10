# build123d — pack

1 top-level symbols. Signatures are verbatim python.

// Pack objects in a squarish area in Plane.XY
pack(objects: Collection[Shape], padding: float, align_z: bool = False) -> Collection[Shape]
// objects: objects to arrange
// padding: space between objects
// align_z: align shape bottoms to Plane.XY
