/**
 * Bambu Lab X1-Carbon build plates: Cool, Engineering, High Temp (Smooth PEI)
 * and Textured PEI (gold).
 *
 * Clean-room model from `out/research/x1c-build-plates/spec.md` only. Frame:
 * millimetres; X right, Y toward the rear, Z up; origin at the printable
 * area's front-left corner; Z = 0 on the print (top) surface with the plate
 * below it. Printed markings are
 * single faces 0.02 mm above that surface.
 *
 * Each model returns separately coloured shapes: `steel` (sheet, edges and
 * underside), `surface` (the coated top), `underside` (Textured PEI's second
 * coated face), and the `marking-*` ink films.
 */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- The Replicad kernel provides `replicad` to model sources at export time.
import { draw, drawRectangle, drawRoundedRectangle, drawText, makeCompound } from 'replicad';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Types of the kernel-provided module.
import type { AnyShape, Drawing, Shape3D } from 'replicad';
// oxlint-disable-next-line no-restricted-imports -- Model sources export by path through the CLI bundler, like libs/tau-examples kernels.
import { bodyMax, drawLipCutouts, drawPlateOutline, drawTabSlot } from './outline.js';

type PlateId = 'cool' | 'engineering' | 'high-temperature' | 'textured-pei';

export const defaultParams = { plate: 'textured-pei' as PlateId };

/** Steel sheet thickness (§0 "Steel thickness": 0.5 mm). */
const steelThickness = 0.5;
/** Raw steel edge colour (§2 "Edges/underside": #9A9A9A, assumed). */
const steelColor = '#9A9A9A';
/** Height of the printed-ink faces above the print surface, clear of the coat so they never z-fight. */
const inkHeight = 0.02;

/** Label band Y range in the lip (§3 "Common front label band": y≈257.1–263.0 from the rear). */
const bandMaxY = bodyMax - 257.1;
const bandMinY = bodyMax - 263;
/** Hairline along the body/lip boundary (§3: y≈256.7, x≈60–250), 0.3 mm wide (assumed). */
const hairlineSpec = { minX: 59.5, maxX: 249.5, centerY: bodyMax - 256.7, width: 0.3 };
/**
 * Plate-detection code footprint (§3: ~5 mm square, Engineering x≈84–91).
 *
 * ponytail: modelled as a neutral dark square, not a code pattern; the real
 * ArUco ids are unverified (§6.4).
 */
const detectionCode = { centerX: 87, size: 5, color: '#1E1E1E' };
/** "Place plate this way" icon triplet (§3: Engineering x≈204–220). */
const iconsMinX = 203.5;
/** Plate-name glyph band along the left edge (§3: x≈6.4–11.6, cap ≈5 mm, from y≈18 behind the rear edge). */
const edgeName = { minX: 5.9, height: 5.2, maxY: bodyMax - 18, length: 106 };

/** A text run fitted to `height`, and stretched to `width` when the plate's wider typeface was measured. */
type TextBox = Readonly<{ text: string; minX: number; centerY: number; height: number; width?: number }>;

type PlateSpec = Readonly<{
  /** Coated top layer thickness. */
  surfaceThickness: number;
  /** Steel below the top layer. */
  steelThickness: number;
  /** Second coated face below the steel (Textured PEI is coated on both sides). */
  undersideThickness: number;
  /** Whether the top layer covers the rear tab; stickers stop at the body (§2 "Edges/underside"). */
  surfaceCoversTab: boolean;
  surfaceColor: string;
  roughness: number;
  inkColor: string;
  bandColor: string;
  bandMinX: number;
  bandMaxX: number;
  bandText: readonly TextBox[];
  edgeName?: string;
}>;

/** Textured PEI and Smooth PEI share the band layout (§3 "Band text strings", measured on FAP033). */
const peiBandText: readonly TextBox[] = [
  { text: 'PLA/ABS/PETG', minX: 101, centerY: -3.55, height: 2.6, width: 35.5 },
  { text: 'HOT', minX: 177.5, centerY: -2.3, height: 1.7, width: 7.5 },
  { text: 'SURFACE', minX: 177.5, centerY: -4.8, height: 1.7, width: 18 },
];

const plates: Readonly<Record<PlateId, PlateSpec>> = {
  /*
   * Legacy PC-film sticker on Engineering Plate steel: 0.5 + 0.3 mm film,
   * near-black satin (§0, §2 "Cool Plate", low confidence). No official image
   * survives, so the band carries only the plate name and PLA (§4).
   */
  cool: {
    surfaceThickness: 0.3,
    steelThickness,
    undersideThickness: 0,
    surfaceCoversTab: false,
    surfaceColor: '#2B2C2F',
    roughness: 0.3,
    inkColor: '#CECECE',
    bandColor: '#CECECE',
    bandMinX: 92.7,
    bandMaxX: 220.9,
    bandText: [
      { text: 'Cool Plate', minX: 100.1, centerY: -3.55, height: 3.3 },
      { text: 'PLA', minX: 151.5, centerY: -3.55, height: 2 },
    ],
  },
  /*
   * Current powder-coated plate, 0.5 mm overall (§0). The coat depth inside
   * that 0.5 mm is unpublished; 0.05 mm is assumed. White band #E3E7EE with
   * dark text (§3, band x≈93.2–221.4).
   */
  engineering: {
    surfaceThickness: 0.05,
    steelThickness: 0.45,
    undersideThickness: 0,
    surfaceCoversTab: true,
    surfaceColor: '#2B2C2F',
    roughness: 0.4,
    inkColor: '#E3E7EE',
    bandColor: '#E3E7EE',
    bandMinX: 92.7,
    bandMaxX: 220.9,
    bandText: [
      { text: 'Engineering Plate', minX: 100.1, centerY: -3.55, height: 3.3, width: 40.9 },
      // ponytail: the Chinese line beneath is omitted; the Geist font has no CJK glyphs.
      { text: 'APPLY GLUE STICK BEFORE PRINTING', minX: 151.5, centerY: -2.6, height: 1.6, width: 50 },
    ],
  },
  /*
   * Current "Bambu Smooth PEI Plate" generation: 0.125 mm PEI sheet on 0.05 mm
   * adhesive over 0.5 mm steel (§0), black fine matte #282A2E (§2); the sheet
   * stops at the body so the tab shows steel. Grey ink on black (§3).
   */
  'high-temperature': {
    surfaceThickness: 0.175,
    steelThickness,
    undersideThickness: 0,
    surfaceCoversTab: false,
    surfaceColor: '#282A2E',
    roughness: 0.7,
    inkColor: '#56585D',
    bandColor: '#3E4045',
    bandMinX: 90.9,
    bandMaxX: 222.9,
    bandText: peiBandText,
    edgeName: 'Bambu Smooth PEI Plate',
  },
  /*
   * Current gold generation: 0.075 mm PEI powder on both faces of 0.5 mm steel
   * (§0), #C4A168 (§2), light-grey #CECECE ink and band (§3).
   *
   * ponytail: the centre outline logo of the gen-2 render is deliberately
   * omitted (trademark; §3 "Centre logo" makes it optional), as is the small
   * brand mark at the band's left end. The powder texture is a material
   * `finish`, not geometry (§2 "Textured PEI Plate").
   */
  'textured-pei': {
    surfaceThickness: 0.075,
    steelThickness,
    undersideThickness: 0.075,
    surfaceCoversTab: true,
    surfaceColor: '#C4A168',
    roughness: 0.9,
    inkColor: '#CECECE',
    bandColor: '#CECECE',
    bandMinX: 90.9,
    bandMaxX: 222.9,
    bandText: peiBandText,
    edgeName: 'Bambu Textured PEI Plate',
  },
};

/**
 * Draws a text run in Geist, the OFL font the Replicad kernel loads.
 *
 * @param box - The run's text, left edge, vertical centre, height and optional width.
 * @returns The glyph outlines, left-aligned at `minX` and centred on `centerY`.
 */
const drawLabel = ({ text, minX, centerY, height, width }: TextBox): Drawing => {
  const glyphs = drawText(text, { fontSize: 10 });
  const [[x0, y0], [x1, y1]] = glyphs.boundingBox.bounds;
  const scale = height / (y1 - y0);
  const fitted = glyphs.translate(-x0, -(y0 + y1) / 2).scale(scale, [0, 0]);
  // Replicad stretches along the normal of `direction`, so [0, 1] widens the run along X.
  const stretched = width === undefined ? fitted : fitted.stretch(width / ((x1 - x0) * scale), [0, 1], [0, 0]);
  return stretched.translate(minX, centerY);
};

/**
 * Builds an ink film: a single face, which keeps the GLB small.
 *
 * @param drawing - The film's outline.
 * @param layers - How many ink heights above the print surface it sits.
 * @returns The face (or faces) at that height.
 */
const film = (drawing: Drawing, layers = 1): AnyShape => {
  const sketch = drawing.sketchOnPlane('XY', layers * inkHeight);
  return 'faces' in sketch ? sketch.faces() : sketch.face();
};

/**
 * Draws an up-arrow over two bars, the outer glyphs of the band's placement pictogram.
 *
 * @param minX - Left edge of the 4 mm wide glyph.
 * @returns The arrow head, stem and bars.
 */
const drawArrow = (minX: number): Drawing[] => [
  draw([minX, -2.4])
    .lineTo([minX + 2, -0.9])
    .lineTo([minX + 4, -2.4])
    .close(),
  drawRectangle(2, 1.4).translate(minX + 2, -3.1),
  drawRectangle(3, 0.4).translate(minX + 2, -4.6),
  drawRectangle(3, 0.4).translate(minX + 2, -5.6),
];

/**
 * Draws the band's "place plate this way" pictogram (§3 "Icon triplet").
 *
 * @returns Arrow, plate outline and arrow.
 */
const drawPlacementIcons = (): Drawing[] => [
  ...drawArrow(iconsMinX),
  drawRectangle(4.4, 5)
    .translate(iconsMinX + 8, -3.55)
    .cut(drawRectangle(3.4, 4).translate(iconsMinX + 8, -3.55)),
  ...drawArrow(iconsMinX + 12),
];

/**
 * Extrudes one layer of the plate.
 *
 * @param drawing - The layer's outline.
 * @param bottom - Z of its underside.
 * @param thickness - Its thickness.
 * @returns The layer solid.
 */
const slab = (drawing: Drawing, bottom: number, thickness: number): Shape3D =>
  drawing.sketchOnPlane('XY', bottom).extrude(thickness);

/**
 * Cuts each hole on its own.
 *
 * @param drawing - The outline to cut.
 * @param holes - Disjoint holes.
 * @returns The outline with every hole removed.
 *
 * ponytail: Replicad 0.23 builds a face without holes when one 2D cut removes
 * several disjoint regions (a fused slot + cut-outs, or a text run), so holes
 * go one at a time and band text is a film stacked on the band.
 */
const cutEach = (drawing: Drawing, holes: readonly Drawing[]): Drawing => {
  let remaining = drawing;
  for (const hole of holes) {
    remaining = remaining.cut(hole);
  }

  return remaining;
};

/** One coloured part of the model, in the Replicad kernel's `ShapeConfig` shape. */
type ModelShape = Readonly<{ shape: AnyShape; name: string; color: string; roughness: number; metalness: number }>;

/**
 * Builds one X1C build plate.
 *
 * @param params - Which plate to build.
 * @returns The plate's coloured parts.
 */
export default function main(params = defaultParams): ModelShape[] {
  const spec = plates[params.plate];
  const holes = [drawTabSlot(), ...drawLipCutouts()];
  const sheet = cutEach(drawPlateOutline({ tab: true }), holes);
  const coat = spec.surfaceCoversTab ? sheet : cutEach(drawPlateOutline({ tab: false }), holes);
  const steelTop = -spec.surfaceThickness;
  const steelBottom = steelTop - spec.steelThickness;
  const material = { roughness: spec.roughness, metalness: 0 };

  const band = drawRectangle(spec.bandMaxX - spec.bandMinX, bandMaxY - bandMinY).translate(
    (spec.bandMinX + spec.bandMaxX) / 2,
    (bandMinY + bandMaxY) / 2,
  );
  // Band text and icons show the plate's own colour through the band's ink (§3, FAP033/FAP042).
  const bandText = [...spec.bandText.map((box) => drawLabel(box)), ...drawPlacementIcons()];
  const hairline = drawRectangle(hairlineSpec.maxX - hairlineSpec.minX, hairlineSpec.width).translate(
    (hairlineSpec.minX + hairlineSpec.maxX) / 2,
    hairlineSpec.centerY,
  );
  const code = drawRoundedRectangle(detectionCode.size, detectionCode.size, 0.3).translate(
    detectionCode.centerX,
    (bandMinY + bandMaxY) / 2,
  );

  const shapes: ModelShape[] = [
    {
      shape: slab(sheet, steelBottom, spec.steelThickness),
      name: 'steel',
      color: steelColor,
      roughness: 0.45,
      metalness: 0.8,
    },
    { shape: slab(coat, steelTop, spec.surfaceThickness), name: 'surface', color: spec.surfaceColor, ...material },
    { shape: film(band), name: 'marking-band', color: spec.bandColor, ...material },
    {
      shape: makeCompound(bandText.map((drawing) => film(drawing, 2))),
      name: 'marking-text',
      color: spec.surfaceColor,
      ...material,
    },
    { shape: film(hairline), name: 'marking-hairline', color: spec.inkColor, ...material },
    { shape: film(code), name: 'marking-code', color: detectionCode.color, ...material },
  ];
  if (spec.undersideThickness > 0) {
    shapes.push({
      shape: slab(coat, steelBottom - spec.undersideThickness, spec.undersideThickness),
      name: 'underside',
      color: spec.surfaceColor,
      ...material,
    });
  }

  if (spec.edgeName !== undefined) {
    // Rotated to read from rear to front along the left edge (§3 "Plate name along the left edge").
    const name = drawLabel({
      text: spec.edgeName,
      minX: 0,
      centerY: 0,
      height: edgeName.height,
      width: edgeName.length,
    }).rotate(-90, [0, 0]);
    const [[x0], [, y1]] = name.boundingBox.bounds;
    shapes.push({
      shape: film(name.translate(edgeName.minX - x0, edgeName.maxY - y1)),
      name: 'marking-name',
      color: spec.inkColor,
      ...material,
    });
  }

  return shapes;
}
