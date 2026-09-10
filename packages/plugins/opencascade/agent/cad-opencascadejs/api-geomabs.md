# libcascade — GeomAbs

6 top-level symbols. Signatures are verbatim typescript.

// This enumeration is used in the classes BSplineCurve and BSplineSurface to describe the repartition of set of knots
GeomAbs_BSplKnotDistribution: typeof GeomAbs_BSplKnotDistribution[keyof typeof GeomAbs_BSplKnotDistribution]

// Identifies the type of a curve
GeomAbs_CurveType: typeof GeomAbs_CurveType[keyof typeof GeomAbs_CurveType]

// this enumeration describes if a curve is an U isoparaetric or V isoparametric
GeomAbs_IsoType: typeof GeomAbs_IsoType[keyof typeof GeomAbs_IsoType]

// Characterizes the type of a join, built by an algorithm for constructing parallel curves, between two consecutive arcs of a contour parallel to a given contour
GeomAbs_JoinType: typeof GeomAbs_JoinType[keyof typeof GeomAbs_JoinType]

// Provides information about the continuity of a curve
GeomAbs_Shape: typeof GeomAbs_Shape[keyof typeof GeomAbs_Shape]

GeomAbs_SurfaceType: typeof GeomAbs_SurfaceType[keyof typeof GeomAbs_SurfaceType]
