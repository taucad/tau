# @jscad/modeling — curves

1 top-level symbols. Signatures are verbatim typescript.

curves

bezier

    declare function create(points: Array<number> | Array<Array<number>>): Bezier

    declare function tangentAt(t: number, bezier: Bezier): Array<number> | number

    declare function valueAt(t: number, bezier: Bezier): Array<number> | number

    declare function lengths(segments: number, bezier: Bezier): Array<number>

    declare function length(segments: number, bezier: Bezier): number

    declare function arcLengthToT(options: ArcLengthToTOptions, bezier: Bezier): number

    Bezier: declare interface Bezier

      points: Array<number> | Array<Array<number>>

      pointType: string

      dimensions: number

      permutations: Array<number>

      tangentPermutations: Array<number>
