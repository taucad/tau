/**
 * Bambu Lab X1-Carbon build plates: Cool, Engineering, High Temp (Smooth PEI)
 * and Textured PEI (gold).
 *
 * Clean-room model from `docs/research/artifacts/x1c-build-plates/spec.md`
 * only. Frame: millimetres; X right, Y toward the rear, Z up; origin at the
 * printable area's front-left corner; Z = 0 on the print (top) surface with
 * the plate below it. Printed markings are single faces 0.02 or 0.04 mm above
 * that surface.
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

/** Label band Y range on the current plates (§3 "Common front label band": y≈257.1–263.0 from the rear). */
const currentBandY = { minY: bodyMax - 263, maxY: bodyMax - 257.1 };
/** Hairline along the body/lip boundary (§3: y≈256.7), 0.3 mm wide (assumed); its X extent is per plate. */
const hairlineSpec = { centerY: bodyMax - 256.7, width: 0.3 };
/** The current plates' hairline X extent (§3: x≈60–250). */
const currentHairline = [59.5, 249.5] as const;
/**
 * Colour of the plate-detection codes.
 *
 * ponytail: each code is modelled as a neutral dark block, not a code
 * pattern; the real ArUco ids are unverified (§6.4).
 */
const codeColor = '#1E1E1E';
/** "Place plate this way" icon triplet (§3: Engineering x≈204–220). */
const iconsMinX = 203.5;

/** An axis-aligned rectangle in the plate frame. */
type Box = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;

/** The current plates' code: a 5 mm square centred at x = 87 on the band (§3: ~5 mm square, Engineering x≈84–91). */
const currentCode: Box = { minX: 84.5, maxX: 89.5, minY: currentBandY.minY + 0.45, maxY: currentBandY.maxY - 0.45 };

/** A text run fitted to `height`, and stretched to `width` when the plate's wider typeface was measured. */
type TextBox = Readonly<{ text: string; minX: number; centerY: number; height: number; width?: number }>;

/** A text run along the left edge, reading from rear to front: its glyph band starts at `minX`, its first glyph at `maxY`. */
type EdgeRun = Readonly<{ text: string; minX: number; height: number; maxY: number; length: number }>;

/**
 * Plate-name glyph band along the left edge of the PEI plates (§3: x≈6.4–11.6, cap ≈5 mm; the full
 * name runs ≈106 mm from y≈18 behind the rear edge).
 *
 * The brand word is independently typeset in Geist, so each name starts where its first remaining word stood
 * and keeps that word's length, both taken from Geist's advance widths.
 */
const peiEdgeName = { minX: 5.9, height: 5.2 };

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
  /** The label band in the lip. */
  band: Box;
  /** Text left unprinted in the band, so it shows the surface colour. */
  bandText: readonly TextBox[];
  /** Whether the band carries the "place plate this way" pictogram. */
  placementIcons: boolean;
  /** Plate-detection code footprints. */
  codes: readonly Box[];
  /** X extent of the hairline along the body/lip boundary. */
  hairline: readonly [minX: number, maxX: number];
  /** Ink runs along the left edge. */
  edgeText: readonly EdgeRun[];
  /** Any other ink on the bare surface. */
  ink?: () => Drawing[];
}>;

/** Textured PEI and Smooth PEI share the band layout (§3 "Band text strings", measured on FAP033). */
const peiBandText: readonly TextBox[] = [
  { text: 'PLA/ABS/PETG', minX: 101, centerY: -3.55, height: 2.6, width: 35.5 },
  { text: 'HOT', minX: 177.5, centerY: -2.3, height: 1.7, width: 7.5 },
  { text: 'SURFACE', minX: 177.5, centerY: -4.8, height: 1.7, width: 18 },
];

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
 * Draws an axis-aligned rectangle.
 *
 * @param box - Its extent.
 * @param radius - Its corner radius; square corners when omitted.
 * @returns The rectangle.
 */
const drawBox = ({ minX, maxX, minY, maxY }: Box, radius?: number): Drawing =>
  drawRoundedRectangle(maxX - minX, maxY - minY, radius).translate((minX + maxX) / 2, (minY + maxY) / 2);

/** The Cool Plate's band (§8): lower and taller than the current plates' band. */
const coolBand: Box = { minX: 80.8, maxX: 138.6, minY: -8.3, maxY: -1.4 };

/**
 * Draws the Cool Plate's other ink (§8): the 45° stripes that continue its
 * band, the glue-stick pictogram and note, and the bar between the edge name
 * and its note.
 *
 * @returns The ink outlines.
 */
const drawCoolInk = (): Drawing[] => {
  const { minY, maxY } = coolBand;
  const stripeZone = drawBox({ minX: coolBand.maxX, maxX: 172.7, minY, maxY });
  // 2 mm stripes every 3.92 mm; each rises at 45° from `x` on the band's front edge.
  const stripes = Array.from({ length: 11 }, (_, index) => {
    const x = 131.48 + 3.92 * index;
    return draw([x, minY])
      .lineTo([x + 2, minY])
      .lineTo([x + 2 + maxY - minY, maxY])
      .lineTo([x + maxY - minY, maxY])
      .close()
      .intersect(stripeZone);
  });
  // ponytail: the pictogram is a plain tilted bar outline over a base stroke, not the printed glyph.
  const bar = drawRoundedRectangle(6.9, 2.4, 0.5);
  return [
    ...stripes,
    bar
      .cut(drawRoundedRectangle(6.2, 1.7, 0.2))
      .rotate(35)
      .translate(179, -4.7),
    drawBox({ minX: 176.4, maxX: 183, minY: -8.15, maxY: -7.75 }),
    // ponytail: the Chinese line beneath is omitted; the Geist font has no CJK glyphs.
    drawLabel({ text: 'GLUE STICK CAN HELP.', minX: 184.9, centerY: -4.33, height: 1.8, width: 30.3 }),
    drawBox({ minX: 4.4, maxX: 9.5, minY: 170.2, maxY: 170.5 }),
  ];
};

const plates: Readonly<Record<PlateId, PlateSpec>> = {
  /*
   * Legacy PC-film sticker on Engineering Plate steel: 0.5 + 0.3 mm film (§0,
   * low confidence). Colour, finish and markings are measured from the
   * official product render (§8): smooth near-black #2F3030 film with
   * light-grey #D4D7D7 ink; the name and a cleaning note along the left edge;
   * a band of two codes and "PLA" that runs into 45° stripes, then a
   * glue-stick note. The brand word before the name is omitted (trademark),
   * as are the Chinese lines (the Geist font has no CJK glyphs).
   */
  cool: {
    surfaceThickness: 0.3,
    steelThickness,
    undersideThickness: 0,
    surfaceCoversTab: false,
    surfaceColor: '#2F3030',
    roughness: 0.3,
    inkColor: '#D4D7D7',
    bandColor: '#D4D7D7',
    band: coolBand,
    bandText: [{ text: 'PLA', minX: 97.8, centerY: -4.8, height: 3, width: 8.6 }],
    placementIcons: false,
    codes: [
      { minX: 82.6, maxX: 86.75, minY: -7.55, maxY: -2.2 },
      { minX: 88.75, maxX: 94.1, minY: -7.55, maxY: -2.2 },
    ],
    hairline: [72.5, 216.2],
    edgeText: [
      { text: 'Cool Plate', minX: 4.45, height: 5.4, maxY: 213.8, length: 39.6 },
      { text: 'USE DETERGENT TO CLEAN THE SURFACE', minX: 7.65, height: 1.65, maxY: 166.2, length: 56.4 },
    ],
    ink: drawCoolInk,
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
    band: { minX: 92.7, maxX: 220.9, ...currentBandY },
    bandText: [
      { text: 'Engineering Plate', minX: 100.1, centerY: -3.55, height: 3.3, width: 40.9 },
      // ponytail: the Chinese line beneath is omitted; the Geist font has no CJK glyphs.
      { text: 'APPLY GLUE STICK BEFORE PRINTING', minX: 151.5, centerY: -2.6, height: 1.6, width: 50 },
    ],
    placementIcons: true,
    codes: [currentCode],
    hairline: currentHairline,
    edgeText: [],
  },
  /*
   * Double-sided "Bambu Smooth PEI Plate" visualization: two 0.125 mm PEI sheets
   * plus estimated 0.05 mm adhesive on each side of 0.5 mm steel (§0), black fine matte #282A2E (§2); the sheet
   * stops at the body so the tab shows steel. Grey ink on black (§3).
   */
  'high-temperature': {
    surfaceThickness: 0.175,
    steelThickness,
    undersideThickness: 0.175,
    surfaceCoversTab: false,
    surfaceColor: '#282A2E',
    roughness: 0.7,
    inkColor: '#56585D',
    bandColor: '#3E4045',
    band: { minX: 90.9, maxX: 222.9, ...currentBandY },
    bandText: peiBandText,
    placementIcons: true,
    codes: [currentCode],
    hairline: currentHairline,
    edgeText: [{ text: 'Bambu Smooth PEI Plate', ...peiEdgeName, maxY: bodyMax - 18, length: 106 }],
  },
  /*
   * Current gold generation: 0.075 mm PEI powder on both faces of 0.5 mm steel
   * (§0), #C4A168 (§2), light-grey #CECECE ink and band (§3).
   *
   * The center outline is independently reconstructed; placement is approximate.
   * Powder grain is supplied by the viewer's physical material, not BRep facets.
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
    band: { minX: 90.9, maxX: 222.9, ...currentBandY },
    bandText: peiBandText,
    placementIcons: true,
    codes: [currentCode],
    hairline: currentHairline,
    edgeText: [{ text: 'Bambu Textured PEI Plate', ...peiEdgeName, maxY: bodyMax - 18, length: 106 }],
  },
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
 * Draws a text run along the left edge, reading from rear to front (§3 "Plate name along the left edge").
 *
 * @param run - The run's text, glyph band and extent.
 * @returns The rotated glyph outlines.
 */
const drawEdgeRun = ({ text, minX, height, maxY, length }: EdgeRun): Drawing => {
  const run = drawLabel({ text, minX: 0, centerY: 0, height, width: length }).rotate(-90, [0, 0]);
  const [[x0], [, y1]] = run.boundingBox.bounds;
  return run.translate(minX - x0, maxY - y1);
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

  // Band text and icons show the plate's own colour through the band's ink (§3, FAP033/FAP042).
  const bandText = [
    ...spec.bandText.map((box) => drawLabel(box)),
    ...(spec.placementIcons ? drawPlacementIcons() : []),
  ];
  const [hairlineMinX, hairlineMaxX] = spec.hairline;
  const hairline = drawBox({
    minX: hairlineMinX,
    maxX: hairlineMaxX,
    minY: hairlineSpec.centerY - hairlineSpec.width / 2,
    maxY: hairlineSpec.centerY + hairlineSpec.width / 2,
  });
  const centerBrand =
    params.plate === 'textured-pei'
      ? [
          [
            [91, 174],
            [125, 174],
            [125, 130],
            [91, 113],
          ],
          [
            [131, 174],
            [165, 174],
            [165, 130],
            [131, 143],
          ],
          [
            [91, 107],
            [125, 124],
            [125, 75],
            [91, 75],
          ],
          [
            [131, 137],
            [165, 124],
            [165, 75],
            [131, 75],
          ],
        ].map((points) => {
          const [first, ...rest] = points;
          const pen = draw(first as [number, number]);
          for (const point of rest) {
            pen.lineTo(point as [number, number]);
          }
          const outline = pen.close();
          return outline.cut(outline.offset(-0.5));
        })
      : [];
  const ink = [...centerBrand, hairline, ...spec.edgeText.map((run) => drawEdgeRun(run)), ...(spec.ink?.() ?? [])];

  const shapes: ModelShape[] = [
    {
      shape: slab(sheet, steelBottom, spec.steelThickness),
      name: 'steel',
      color: steelColor,
      roughness: 0.45,
      metalness: 0.8,
    },
    { shape: slab(coat, steelTop, spec.surfaceThickness), name: 'surface', color: spec.surfaceColor, ...material },
    { shape: film(drawBox(spec.band)), name: 'marking-band', color: spec.bandColor, ...material },
    {
      shape: makeCompound(bandText.map((drawing) => film(drawing, 2))),
      name: 'marking-text',
      color: spec.surfaceColor,
      ...material,
    },
    // A layer up, like the band text: the Cool Plate's codes lie on its band.
    {
      shape: makeCompound(spec.codes.map((code) => film(drawBox(code, 0.3), 2))),
      name: 'marking-code',
      color: codeColor,
      ...material,
    },
    {
      shape: makeCompound(ink.map((drawing) => film(drawing))),
      name: 'marking-ink',
      color: spec.inkColor,
      ...material,
    },
  ];
  if (spec.undersideThickness > 0) {
    shapes.push({
      shape: slab(coat, steelBottom - spec.undersideThickness, spec.undersideThickness),
      name: 'underside',
      color: spec.surfaceColor,
      ...material,
    });
  }

  return shapes;
}
