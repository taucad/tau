import {
  differenceCapPolygon as differenceCapPolygonImpl,
  measureCapMultiPolygonArea,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
import type { PackedSectionCapPart } from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import {
  colorsForSectionCapTint,
  sectionCapOverlapBaseHex,
  sectionCapOverlapStripeHex,
  stripeAxisForAngle,
} from '#components/geometry/graphics/three/utils/section-cap-style.js';
import { resolveStripedAppearance } from '#components/geometry/graphics/three/materials/striped-material-resolve-appearance.js';
import type {
  CapMultiPolygon,
  SectionCapDiagnostic,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';
import type { SectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type { SectionCapBooleanDebugSink } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';

export { sectionCapOverlapBaseHex, sectionCapOverlapStripeHex };

export type SectionCapRenderableSource = Readonly<{
  sourceKey: string;
  sourcePolygon: CapMultiPolygon;
  overlapPolygon: CapMultiPolygon | undefined;
  visibleOverlapPolygon: CapMultiPolygon | undefined;
  tintHex: number;
}>;

export type BuildSectionCapRenderPartsOptions = Readonly<{
  sources: readonly SectionCapRenderableSource[];
  stripeFrequency: number;
  stripeWidth: number;
  stripeAngle?: number;
  differenceCapPolygon?: typeof differenceCapPolygonImpl;
  booleanOperations?: SectionCapBooleanOperations;
  debugSink?: SectionCapBooleanDebugSink;
}>;

export type BuildSectionCapRenderPartsResult = Readonly<{
  partsBySourceKey: Map<string, PackedSectionCapPart[]>;
  diagnostics: SectionCapDiagnostic[];
  renderedOverlapArea: number;
  splitFailed: boolean;
}>;

const normalPart = (
  multiPolygon: CapMultiPolygon,
  colors: Readonly<{ baseColor: number; stripeColor: number }>,
  stripeAxis: readonly [number, number],
): PackedSectionCapPart => ({
  multiPolygon,
  baseColor: colors.baseColor,
  stripeColor: colors.stripeColor,
  patternStrength: 1,
  stripeAxis,
  regionKind: 'normal',
});

const overlapPart = (
  multiPolygon: CapMultiPolygon,
  colors: Readonly<{ baseColor: number; stripeColor: number }>,
  stripeAxis: readonly [number, number],
): PackedSectionCapPart => ({
  multiPolygon,
  baseColor: colors.baseColor,
  stripeColor: colors.stripeColor,
  patternStrength: 1,
  stripeAxis,
  regionKind: 'overlap',
});

const buildNormalOnlyParts = (options: {
  sources: readonly SectionCapRenderableSource[];
  stripeFrequency: number;
  stripeWidth: number;
  stripeAxis: readonly [number, number];
}): Map<string, PackedSectionCapPart[]> => {
  const partsBySourceKey = new Map<string, PackedSectionCapPart[]>();
  for (const source of options.sources) {
    partsBySourceKey.set(source.sourceKey, [
      normalPart(
        source.sourcePolygon,
        colorsForSectionCapTint(source.tintHex, options.stripeFrequency, options.stripeWidth),
        options.stripeAxis,
      ),
    ]);
  }

  return partsBySourceKey;
};

export const buildSectionCapRenderParts = (
  options: BuildSectionCapRenderPartsOptions,
): BuildSectionCapRenderPartsResult => {
  const diagnostics: SectionCapDiagnostic[] = [];
  const normalPolygonBySourceKey = new Map<string, CapMultiPolygon>();
  let splitFailed = false;
  const differenceCapPolygon =
    options.differenceCapPolygon ?? options.booleanOperations?.differenceCapPolygon ?? differenceCapPolygonImpl;
  const stripeAppearance = resolveStripedAppearance({
    stripeFrequency: options.stripeFrequency,
    stripeWidth: options.stripeWidth,
    stripeAngle: options.stripeAngle,
  });
  const normalStripeAxis = stripeAxisForAngle(stripeAppearance.stripeAngle);
  const overlapStripeAxis = stripeAxisForAngle(stripeAppearance.stripeAngle + Math.PI / 2);

  for (const source of options.sources) {
    if (!source.overlapPolygon || source.overlapPolygon.length === 0) {
      normalPolygonBySourceKey.set(source.sourceKey, source.sourcePolygon);
      continue;
    }

    const difference = differenceCapPolygon(source.sourcePolygon, [source.overlapPolygon], options.debugSink);
    diagnostics.push(...difference.diagnostics.map((diagnostic) => ({ ...diagnostic, sourceKey: source.sourceKey })));
    if (difference.diagnostics.length > 0) {
      splitFailed = true;
      continue;
    }

    normalPolygonBySourceKey.set(source.sourceKey, difference.multiPolygon);
  }

  if (splitFailed) {
    diagnostics.push({
      code: 'section-cap-overlap-split-failed',
      message: 'Skipped section-cap overlap diagnostics because exact source splitting failed.',
    });

    return {
      partsBySourceKey: buildNormalOnlyParts({
        sources: options.sources,
        stripeFrequency: options.stripeFrequency,
        stripeWidth: options.stripeWidth,
        stripeAxis: normalStripeAxis,
      }),
      diagnostics,
      renderedOverlapArea: 0,
      splitFailed,
    };
  }

  const overlapColors = {
    baseColor: sectionCapOverlapBaseHex,
    stripeColor: sectionCapOverlapStripeHex,
  };
  const partsBySourceKey = new Map<string, PackedSectionCapPart[]>();
  let renderedOverlapArea = 0;

  for (const source of options.sources) {
    const normalColors = colorsForSectionCapTint(source.tintHex, options.stripeFrequency, options.stripeWidth);
    const parts: PackedSectionCapPart[] = [];
    const normalPolygon = normalPolygonBySourceKey.get(source.sourceKey) ?? source.sourcePolygon;
    if (normalPolygon.length > 0) {
      parts.push(normalPart(normalPolygon, normalColors, normalStripeAxis));
    }

    if (source.visibleOverlapPolygon && source.visibleOverlapPolygon.length > 0) {
      parts.push(overlapPart(source.visibleOverlapPolygon, overlapColors, overlapStripeAxis));
      renderedOverlapArea += measureCapMultiPolygonArea(source.visibleOverlapPolygon);
    }

    partsBySourceKey.set(source.sourceKey, parts);
  }

  return {
    partsBySourceKey,
    diagnostics,
    renderedOverlapArea,
    splitFailed,
  };
};
