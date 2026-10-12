# build123d — pack

1 top-level symbols. Signatures are verbatim python.

# Category: pack
# Pack objects in a squarish area in Plane.XY
# Remarks: Returns: Collection[Shape]: rearranged objects
# build123d.pack.pack (function)
pack(objects: Collection[Shape], padding: float, align_z: bool = False) -> Collection[Shape]
#   objects: objects to arrange
#   padding: space between objects
#   align_z: align shape bottoms to Plane.XY
