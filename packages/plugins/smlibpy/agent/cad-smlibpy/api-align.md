# smlibpy — align

1 top-level symbols. Signatures are verbatim python.

# Category: align
# How a new shape sits relative to the origin along an axis
# Remarks: ``MIN`` puts the shape's lower bound at the origin, ``CENTER`` centers it, ``MAX`` puts its upper bound at the origin. Constructors take one value for all axes or one per axis: ``Box(10, 10, 2, align=(Align.CENTER, Align.CENTER, Align.MIN))`` stands the box on the XY plane.
# smlibpy.align.Align (enum)
class Align(Enum)

  MIN

  CENTER

  MAX
