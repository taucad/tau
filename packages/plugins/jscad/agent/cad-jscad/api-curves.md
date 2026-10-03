# @jscad/modeling — curves

1 top-level symbols. Signatures are verbatim typescript.

curves

  bezier

    // curves.bezier.create (function)
    declare function create(points: Array<number> | Array<Array<number>>): Bezier

    // curves.bezier.tangentAt (function)
    declare function tangentAt(t: number, bezier: Bezier): Array<number> | number

    // curves.bezier.valueAt (function)
    declare function valueAt(t: number, bezier: Bezier): Array<number> | number

    // curves.bezier.lengths (function)
    declare function lengths(segments: number, bezier: Bezier): Array<number>

    // curves.bezier.length (function)
    declare function length(segments: number, bezier: Bezier): number

    // curves.bezier.arcLengthToT (function)
    declare function arcLengthToT(options: ArcLengthToTOptions, bezier: Bezier): number

    Bezier: declare interface Bezier

      points: Array<number> | Array<Array<number>>

      pointType: string

      dimensions: number

      permutations: Array<number>

      tangentPermutations: Array<number>
