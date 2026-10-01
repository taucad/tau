import type { GeoSpecPlanarFaceExpectation, GeoSpecVoidContinuityExpectation } from 'geospec';

/** Authored numeric domain; values enumerate discrete selections. @internal */
export type ParameterDomain = {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
  readonly values?: readonly number[];
};

/** Kernel-neutral engineering acceptance for one parameter case. @internal */
export type PartExpectations = {
  readonly bounds: { readonly x: number; readonly y: number; readonly z: number };
  readonly solids: number;
  readonly planes?: readonly GeoSpecPlanarFaceExpectation[];
  readonly voids?: readonly GeoSpecVoidContinuityExpectation[];
  readonly volume?: { readonly min: number; readonly max: number };
  readonly holes?: ReadonlyArray<{
    readonly diameter: number;
    readonly center: { readonly x: number; readonly y: number; readonly z?: number };
    readonly axis: 'x' | 'y' | 'z';
  }>;
};

/** One qualified parameter combination, merged over the part defaults. @internal */
export type PartCase = {
  readonly name: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly expectations: PartExpectations;
};

/** Build-time family definition; this module is never initialized by catalog browsing. @internal */
export type PartDefinition = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly design: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly domains: Readonly<Record<string, ParameterDomain>>;
  readonly cases: readonly PartCase[];
  readonly expectations: PartExpectations;
  readonly fidelity: string;
};
