import {
  CompoundSketch,
  draw,
  drawCircle,
  drawRoundedRectangle,
  drawText,
  makeCompound,
  type Drawing,
  type ShapeConfig,
  type Shape3D,
  type Sketch,
} from 'replicad';
import { defaultParams } from './params.js';
import logoSvg from './assets/logo.svg' with { type: 'text' };

export { defaultParams };

type P2 = [number, number];

type SvgSegment =
  | { type: 'line'; end: P2 }
  | { type: 'arc'; end: P2; midpoint: P2 };

type SvgSubpath = {
  start: P2;
  segments: SvgSegment[];
};

type CircularArcInput = {
  start: P2;
  end: P2;
  radius: number;
  largeArc: boolean;
  sweep: boolean;
};

function circularArcMidpoint({
  start,
  end,
  radius,
  largeArc,
  sweep,
}: CircularArcInput): P2 {
  const delta: P2 = [end[0] - start[0], end[1] - start[1]];
  const chord = Math.hypot(...delta);
  if (chord === 0 || radius < chord / 2) {
    throw new Error('Unsupported SVG: invalid circular arc geometry.');
  }

  const chordMidpoint: P2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const centerDistance = Math.sqrt(Math.max(0, radius ** 2 - (chord / 2) ** 2));
  const centerSign = largeArc === sweep ? -1 : 1;
  const center: P2 = [
    chordMidpoint[0] - (delta[1] / chord) * centerDistance * centerSign,
    chordMidpoint[1] + (delta[0] / chord) * centerDistance * centerSign,
  ];
  const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);
  let sweepAngle = endAngle - startAngle;

  if (sweep && sweepAngle < 0) {
    sweepAngle += Math.PI * 2;
  } else if (!sweep && sweepAngle > 0) {
    sweepAngle -= Math.PI * 2;
  }

  const midpointAngle = startAngle + sweepAngle / 2;
  return [
    center[0] + radius * Math.cos(midpointAngle),
    center[1] + radius * Math.sin(midpointAngle),
  ];
}

function parseSvgPath(d: string): SvgSubpath[] {
  const tokens: Array<string | number> = [];
  const re = /([A-Za-z])|(-?\d*\.?\d+(?:e[+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      tokens.push(m[1]);
    } else if (m[2]) {
      tokens.push(Number.parseFloat(m[2]));
    }
  }

  const subpaths: SvgSubpath[] = [];
  let current: P2 = [0, 0];
  let path: SvgSubpath | undefined;
  let lastCmd = '';
  let index = 0;

  while (index < tokens.length) {
    let cmd: string;
    if (typeof tokens[index] === 'string') {
      cmd = tokens[index++] as string;
    } else {
      cmd = lastCmd === 'M' ? 'L' : lastCmd;
    }

    switch (cmd) {
      case 'M': {
        const x = tokens[index++] as number;
        const y = tokens[index++] as number;
        if (path) {
          subpaths.push(path);
        }
        current = [x, y];
        path = { start: current, segments: [] };
        break;
      }
      case 'L': {
        current = [tokens[index++] as number, tokens[index++] as number];
        path?.segments.push({ type: 'line', end: current });
        break;
      }
      case 'A': {
        const radiusX = tokens[index++] as number;
        const radiusY = tokens[index++] as number;
        const rotation = tokens[index++] as number;
        const largeArcFlag = tokens[index++] as number;
        const sweepFlag = tokens[index++] as number;
        const end: P2 = [tokens[index++] as number, tokens[index++] as number];
        if (radiusX !== radiusY || rotation !== 0) {
          throw new Error(
            'Unsupported SVG: logo arcs must be unrotated circles.',
          );
        }

        path?.segments.push({
          type: 'arc',
          end,
          midpoint: circularArcMidpoint({
            start: current,
            end,
            radius: radiusX,
            largeArc: largeArcFlag === 1,
            sweep: sweepFlag === 1,
          }),
        });
        current = end;
        break;
      }
      case 'Z': {
        if (path) {
          subpaths.push(path);
          current = path.start;
        }
        path = undefined;
        break;
      }
      default: {
        throw new Error(`Unsupported SVG path command: ${cmd}`);
      }
    }
    lastCmd = cmd;
  }
  if (path) {
    subpaths.push(path);
  }
  return subpaths;
}

function drawingFromPath(path: SvgSubpath): Drawing {
  const pen = draw(path.start);
  for (const segment of path.segments) {
    if (segment.type === 'arc') {
      pen.threePointsArcTo(segment.end, segment.midpoint);
    } else {
      pen.lineTo(segment.end);
    }
  }
  return pen.close();
}

function leftAlignDrawing(
  drawing: Drawing,
  leftX: number,
  centerY: number,
): Drawing {
  const [[minX, minY], [, maxY]] = drawing.boundingBox.bounds;
  return drawing.translate(leftX - minX, centerY - (minY + maxY) / 2);
}

function splitTextAfterDot(text: string): string[] {
  const explicitLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (explicitLines.length > 1) {
    return explicitLines;
  }

  const dotIndex = text.indexOf('.');
  if (dotIndex !== -1 && dotIndex < text.length - 1) {
    return [
      text.slice(0, dotIndex + 1).trim(),
      text.slice(dotIndex + 1).trim(),
    ];
  }

  if (explicitLines.length === 1) {
    return explicitLines;
  }

  throw new Error('Back text must include at least one visible character.');
}

function compoundShape3D(shapes: readonly Shape3D[], label: string): Shape3D {
  const shape = makeCompound(shapes.map((solid) => solid.clone()));
  if (!('asShape3D' in shape)) {
    throw new Error(`${label} did not produce 3D geometry.`);
  }

  return shape.asShape3D();
}

function createBackText(p = defaultParams): Shape3D {
  const lines = splitTextAfterDot(p.backText);
  const linePitch = p.backTextFontSize + p.backTextLineGap;
  const firstLineOffset = ((lines.length - 1) * linePitch) / 2;
  const lineDrawings = lines.map((line) =>
    drawText(line, { fontSize: p.backTextFontSize }),
  );
  const maxLineWidth = Math.max(
    ...lineDrawings.map((lineDrawing) => lineDrawing.boundingBox.width),
  );
  const visibleLeftX = p.backTextCenterX - maxLineWidth / 2;
  const lineSolids = lineDrawings.map((lineDrawing, index) => {
    const lineCenterY = p.backTextCenterY + firstLineOffset - index * linePitch;
    const text = leftAlignDrawing(
      lineDrawing,
      visibleLeftX,
      lineCenterY,
    ).mirror([0, 1], [p.backTextCenterX, lineCenterY], 'plane');

    return text.sketchOnPlane('XY').extrude(p.backTextHeight);
  });

  return compoundShape3D(lineSolids, 'Back URL');
}

export default function main(p = defaultParams): ShapeConfig[] {
  const pathData = /<path[^>]*\sd=(?:"([^"]+)"|'([^']+)')/
    .exec(logoSvg)
    ?.slice(1)
    .find(Boolean);
  if (!pathData) {
    throw new Error('Unsupported SVG: expected a path with d data.');
  }
  const subpaths = parseSvgPath(pathData).filter(
    (path) => path.segments.length >= 2,
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const subpath of subpaths) {
    const [[pathMinX, pathMinY], [pathMaxX, pathMaxY]] =
      drawingFromPath(subpath).boundingBox.bounds;
    minX = Math.min(minX, pathMinX);
    maxX = Math.max(maxX, pathMaxX);
    minY = Math.min(minY, pathMinY);
    maxY = Math.max(maxY, pathMaxY);
  }
  const cX = (minX + maxX) / 2;
  const cY = (minY + maxY) / 2;
  const bbW = maxX - minX;
  const bbH = maxY - minY;
  const scale = p.logoSize / Math.max(bbW, bbH);

  const transformPoint = ([x, y]: P2): P2 => [
    (x - cX) * scale,
    p.logoCenterY - (y - cY) * scale,
  ];
  const logoSubpaths = subpaths.map(
    (subpath): SvgSubpath => ({
      start: transformPoint(subpath.start),
      segments: subpath.segments.map((segment): SvgSegment => {
        if (segment.type === 'arc') {
          return {
            type: 'arc',
            end: transformPoint(segment.end),
            midpoint: transformPoint(segment.midpoint),
          };
        }

        return { type: 'line', end: transformPoint(segment.end) };
      }),
    }),
  );

  const firstLogoSubpath = logoSubpaths[0];
  if (!firstLogoSubpath) {
    throw new Error('Unsupported SVG: expected at least one drawable subpath.');
  }

  const logoSolids = [firstLogoSubpath, ...logoSubpaths.slice(1)].map(
    (subpath) =>
      drawingFromPath(subpath)
        .sketchOnPlane('XY', p.tabletHeight)
        .extrude(p.logoHeight),
  );
  const logoBase = compoundShape3D(logoSolids, 'Logo');
  const logoTopZ = p.tabletHeight + p.logoHeight;
  const logo =
    p.logoChamferSize > 0
      ? logoBase.chamfer(p.logoChamferSize, (edge) =>
          edge.inPlane('XY', logoTopZ),
        )
      : logoBase;

  const tabletOuterSketch = drawRoundedRectangle(
    p.tabletSize,
    p.tabletSize,
    p.cornerRadius,
  ).sketchOnPlane('XY') as Sketch;
  const keyringHoleSketch = drawCircle(p.holeRadius)
    .translate(p.holeCenterX, p.holeCenterY)
    .sketchOnPlane('XY') as Sketch;
  let tablet = new CompoundSketch([
    tabletOuterSketch,
    keyringHoleSketch,
  ]).extrude(p.tabletHeight);

  if (p.edgeFilletRadius > 0) {
    tablet = tablet.fillet(p.edgeFilletRadius, (edge) =>
      edge
        .either([
          (finder) => finder.inPlane('XY', 0),
          (finder) => finder.inPlane('XY', p.tabletHeight),
        ])
        .not((finder) =>
          finder
            .ofCurveType('CIRCLE')
            .ofLength((length) => length > p.holeRadius * 2),
        ),
    );
  }

  if (p.holeFilletRadius > 0) {
    tablet = tablet.fillet(p.holeFilletRadius, (edge) =>
      edge
        .either([
          (finder) => finder.inPlane('XY', 0),
          (finder) => finder.inPlane('XY', p.tabletHeight),
        ])
        .ofCurveType('CIRCLE')
        .ofLength((length) => length > p.holeRadius * 2),
    );
  }

  const backText = createBackText(p);
  tablet = tablet.cutAll([backText]);

  return [
    { shape: tablet, color: p.tabletColor, name: 'Tablet' },
    { shape: logo, color: p.logoColor, name: 'Logo' },
    { shape: backText, color: p.backTextColor, name: 'Back URL' },
  ];
}
