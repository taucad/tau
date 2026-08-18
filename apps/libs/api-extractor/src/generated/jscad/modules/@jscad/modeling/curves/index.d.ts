export namespace bezier {
  export interface ArcLengthToTOptions {
      distance?: Number;
      segments?: Number;
  }
  export declare function create(points: Array<number> | Array<Array<number>>): Bezier;
  export declare function tangentAt(t: number, bezier: Bezier): Array<number> | number;
  export declare function valueAt(t: number, bezier: Bezier): Array<number> | number;
  export declare function lengths(segments: number, bezier: Bezier): Array<number>;
  export declare function length(segments: number, bezier: Bezier): number;
  export declare function arcLengthToT(options: ArcLengthToTOptions, bezier: Bezier): number;
  export declare interface Bezier {
      points: Array<number> | Array<Array<number>>;
      pointType: string;
      dimensions: number;
      permutations: Array<number>;
      tangentPermutations: Array<number>;
  }
}
