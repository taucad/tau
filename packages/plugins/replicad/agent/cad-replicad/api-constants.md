# replicad — Constants

5 top-level symbols. Signatures are verbatim typescript.

AXIS_NAMES: readonly ["X", "Y", "Z", "-X", "-Y", "-Z"]

DEG2RAD: number

// Finder clauses by how their arguments describe them, for a cache that records finder callbacks instead of running them opaquely
finderClauses: {
    readonly value: readonly ["inList", "atAngleWith", "atDistance", "containsPoint", "near", "withinDistance", "inBox", "inShape", "inDirection", "ofLength", "ofCurveType", "parallelTo", "inPlane", "ofSurfaceType", "atPoint", "ofAngle"];
    readonly combinator: readonly ["and", "not", "either"];
    readonly predicate: readonly ["when"];
}

  readonly value: readonly ["inList", "atAngleWith", "atDistance", "containsPoint", "near", "withinDistance", "inBox", "inShape", "inDirection", "ofLength", "ofCurveType", "parallelTo", "inPlane", "ofSurfaceType", "atPoint", "ofAngle"]

  readonly combinator: readonly ["and", "not", "either"]

  readonly predicate: readonly ["when"]

HASH_CODE_MAX: 2147483647

RAD2DEG: number
