/**
 * A1 mini plates in the printable frame: X right, Y rear, Z up, top at zero.
 * Independent parametric sheet-metal construction; dimensions from Bambu's
 * A1M bed model and FAP009 product render, documented in the Mini blueprint.
 * No upstream triangles, artwork or fonts are redistributed.
 */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- The export kernel supplies Replicad.
import { draw, drawCircle, drawRoundedRectangle, drawText, makeCompound } from 'replicad';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Kernel-provided model types.
import type { AnyShape, Drawing } from 'replicad';

export const defaultParams = { plate: 'textured-pei' as 'textured-pei' | 'high-temperature' };

/**
 * The 184 mm sheet, rear locating tabs, front grip and three pierced holes.
 * @returns The pierced sheet profile.
 */
const sheetOutline = (): Drawing => {
  const pen = draw([-2, -2])
    .lineTo([49.35, -2])
    .customCorner(3.566)
    .lineTo([56.48, -9.132])
    .customCorner(3.566)
    .lineTo([182, -9.132])
    .customCorner(2)
    .lineTo([182, 182])
    .customCorner(2)
    .lineTo([148.1, 182])
    .customCorner(2)
    .lineTo([142.101, 187.999])
    .customCorner(3)
    .lineTo([119.099, 187.999])
    .customCorner(3)
    .lineTo([113.1, 182])
    .customCorner(4)
    .lineTo([66.9, 182])
    .customCorner(4)
    .lineTo([60.901, 187.999])
    .customCorner(3)
    .lineTo([37.899, 187.999])
    .customCorner(3)
    .lineTo([31.9, 182])
    .customCorner(2)
    .lineTo([-2, 182])
    .customCorner(2)
    .closeWithCustomCorner(2);
  let sheet = pen;
  const cutouts = [
    drawCircle(1.5).translate(57.958, -5.566),
    draw([162.264, -2.814])
      .lineTo([167.52, -2.814])
      .customCorner(0.294)
      .lineTo([171.632, -6.932])
      .customCorner(0.294)
      .lineTo([162.264, -6.932])
      .customCorner(0.294)
      .closeWithCustomCorner(0.294),
    draw([170.432, -2.814])
      .lineTo([179.8, -2.814])
      .customCorner(0.294)
      .lineTo([179.8, -6.932])
      .customCorner(0.294)
      .lineTo([174.55, -6.932])
      .customCorner(0.294)
      .closeWithCustomCorner(0.294),
  ];
  for (const hole of cutouts) {
    sheet = sheet.cut(hole);
  }
  return sheet;
};

/**
 * Fits independently generated Geist glyphs to a measured printed run.
 * @param text - Printed label.
 * @param width - Run width in millimetres.
 * @param height - Glyph height in millimetres.
 * @returns Fitted glyph outlines.
 */
const label = (text: string, width: number, height: number): Drawing => {
  const textDrawing = drawText(text, { fontSize: 10 });
  const [[x0, y0], [x1, y1]] = textDrawing.boundingBox.bounds;
  const scale = height / (y1 - y0);
  return textDrawing
    .translate(-x0, -y0)
    .scale(scale, [0, 0])
    .stretch(width / ((x1 - x0) * scale), [0, 1], [0, 0]);
};

/**
 * Ink is a face above the coating, as on the X1C assets.
 * @param drawing - Marking outline.
 * @param z - Height above the surface in millimetres.
 * @returns Ink faces.
 */
const film = (drawing: Drawing, z = 0.02): AnyShape => {
  const sketch = drawing.sketchOnPlane('XY', z);
  return 'faces' in sketch ? sketch.faces() : sketch.face();
};

/**
 * Builds steel, two coated faces and the plate's printed markings.
 * @param params - Selected surface.
 * @returns Named material shapes for the existing GLB exporter.
 */
export default function main(params = defaultParams): Array<
  Readonly<{
    shape: AnyShape;
    name: string;
    color: string;
    roughness: number;
    metalness: number;
  }>
> {
  const textured = params.plate === 'textured-pei';
  const coat = textured ? 0.075 : 0.175;
  const color = textured ? '#C4A168' : '#282A2E';
  const thickness = 0.4 + coat * 2;
  const sheet = sheetOutline();
  const material = { roughness: textured ? 0.9 : 0.65, metalness: 0 };
  const edgeName = label(textured ? 'Bambu Textured PEI Plate' : 'Bambu Smooth PEI Plate', 104, 4.2)
    .rotate(-90, [0, 0])
    .translate(3.5, 171);
  const band = drawRoundedRectangle(76, 5.2, 0.2).translate(100.5, -5.4);
  const text = label('PLA/PETG/TPU', 35, 2.5).translate(65, -6.55);
  const warning = draw([167, 3])
    .lineTo([179, 3])
    .lineTo([173, 13.4])
    .close()
    .cut(draw([168.4, 3.8]).lineTo([177.6, 3.8]).lineTo([173, 11.8]).close());
  const waves = [0, 1, 2].map((index) =>
    draw([170 + index * 2, 5])
      .lineTo([171 + index * 2, 6.5])
      .lineTo([170 + index * 2, 8])
      .lineTo([170.4 + index * 2, 8])
      .lineTo([171.4 + index * 2, 6.5])
      .lineTo([170.4 + index * 2, 5])
      .close(),
  );
  const placement = [142, 155].flatMap((x) => [
    draw([x, -4])
      .lineTo([x + 1.5, -2.9])
      .lineTo([x + 3, -4])
      .close(),
    drawRoundedRectangle(1, 2, 0).translate(x + 1.5, -5),
    drawRoundedRectangle(2.8, 0.4, 0).translate(x + 1.5, -6.6),
  ]);
  const plateIcon = drawRoundedRectangle(5.4, 5, 0)
    .translate(150, -5.4)
    .cut(drawRoundedRectangle(4.6, 4.2, 0).translate(150, -5.4));
  // ponytail: brand outline is reconstructed from the product silhouette; ink tolerances are ±1 mm.
  const brand = [
    [
      [64, 128],
      [88, 128],
      [88, 97],
      [64, 85],
    ],
    [
      [92, 128],
      [116, 128],
      [116, 97],
      [92, 106],
    ],
    [
      [64, 81],
      [88, 93],
      [88, 58],
      [64, 58],
    ],
    [
      [92, 102],
      [116, 93],
      [116, 58],
      [92, 58],
    ],
  ].map((points) => {
    const [first, ...rest] = points;
    const pen = draw(first as [number, number]);
    for (const point of rest) {
      pen.lineTo(point as [number, number]);
    }
    const polygon = pen.close();
    return polygon.cut(polygon.offset(-0.5));
  });
  return [
    {
      shape: sheet.sketchOnPlane('XY', -coat - 0.4).extrude(0.4),
      name: 'steel',
      color: '#9A9A9A',
      roughness: 0.45,
      metalness: 0.8,
    },
    { shape: sheet.sketchOnPlane('XY', -coat).extrude(coat), name: 'surface', color, ...material },
    { shape: sheet.sketchOnPlane('XY', -thickness).extrude(coat), name: 'underside', color, ...material },
    { shape: film(band), name: 'marking-band', color: '#CECECE', ...material },
    { shape: film(text, 0.04), name: 'marking-text', color, ...material },
    {
      shape: makeCompound([edgeName, warning, ...waves, ...placement, plateIcon, ...brand].map((ink) => film(ink))),
      name: 'marking-ink',
      color: '#CECECE',
      ...material,
    },
  ];
}
