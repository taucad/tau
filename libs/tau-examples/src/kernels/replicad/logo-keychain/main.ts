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
import triangleSvg from './assets/logo.svg' with { type: 'text' };

export { defaultParams };

type P2 = [number, number];

function parseSvgPath(d: string): P2[][] {
  const tokens: Array<string | number> = [];
  const re = /([HLMVZhlmvz])|(-?\d*\.?\d+(?:e[+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      tokens.push(m[1]);
    } else if (m[2]) {
      tokens.push(Number.parseFloat(m[2]));
    }
  }

  const subpaths: P2[][] = [];
  let cur: P2 = [0, 0];
  let start: P2 = [0, 0];
  let path: P2[] = [];
  let lastCmd = '';
  let i = 0;

  while (i < tokens.length) {
    let cmd: string;
    if (typeof tokens[i] === 'string') {
      cmd = tokens[i++] as string;
    } else {
      cmd = lastCmd === 'M' ? 'L' : lastCmd === 'm' ? 'l' : lastCmd;
    }

    switch (cmd) {
      case 'M': {
        const x = tokens[i++] as number;
        const y = tokens[i++] as number;
        if (path.length > 0) {
          subpaths.push(path);
        }
        path = [];
        cur = [x, y];
        start = [x, y];
        path.push(cur);
        break;
      }
      case 'm': {
        const dx = tokens[i++] as number;
        const dy = tokens[i++] as number;
        if (path.length > 0) {
          subpaths.push(path);
        }
        path = [];
        cur = [cur[0] + dx, cur[1] + dy];
        start = cur;
        path.push(cur);
        break;
      }
      case 'L': {
        cur = [tokens[i++] as number, tokens[i++] as number];
        path.push(cur);
        break;
      }
      case 'l': {
        cur = [
          cur[0] + (tokens[i++] as number),
          cur[1] + (tokens[i++] as number),
        ];
        path.push(cur);
        break;
      }
      case 'H': {
        cur = [tokens[i++] as number, cur[1]];
        path.push(cur);
        break;
      }
      case 'h': {
        cur = [cur[0] + (tokens[i++] as number), cur[1]];
        path.push(cur);
        break;
      }
      case 'V': {
        cur = [cur[0], tokens[i++] as number];
        path.push(cur);
        break;
      }
      case 'v': {
        cur = [cur[0], cur[1] + (tokens[i++] as number)];
        path.push(cur);
        break;
      }
      case 'Z':
      case 'z': {
        cur = start;
        if (path.length > 0) {
          subpaths.push(path);
        }
        path = [];
        break;
      }
    }
    lastCmd = cmd;
  }
  if (path.length > 0) {
    subpaths.push(path);
  }
  return subpaths;
}

function dedupe(points: P2[]): P2[] {
  const out: P2[] = [];
  for (const pt of points) {
    const prev = out.at(-1);
    if (!prev || pt[0] !== prev[0] || pt[1] !== prev[1]) {
      out.push(pt);
    }
  }
  if (out.length > 1) {
    const first = out.at(0)!;
    const last = out.at(-1)!;
    if (first[0] === last[0] && first[1] === last[1]) {
      out.pop();
    }
  }
  return out;
}

function drawingFromPoints(points: P2[]): Drawing {
  const first = points[0];
  if (!first) {
    throw new Error('Expected at least one point to build a drawing.');
  }

  const pen = draw(first);
  for (const p of points.slice(1)) {
    pen.lineTo(p);
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
  if (dotIndex >= 0 && dotIndex < text.length - 1) {
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
  const pathMatch = /<path[^>]*\sd=(?:"([^"]+)"|'([^']+)')/.exec(triangleSvg);
  const polyMatch = /<polygon[^>]*\spoints=(?:"([^"]+)"|'([^']+)')/.exec(
    triangleSvg,
  );

  let subpaths: P2[][];
  if (pathMatch) {
    const pathData = pathMatch[1] ?? pathMatch[2];
    if (!pathData) {
      throw new Error('Unsupported SVG: path is missing d data.');
    }

    subpaths = parseSvgPath(pathData)
      .map((pts) => dedupe(pts))
      .filter((pts) => pts.length >= 3);
  } else if (polyMatch) {
    const rawPoints = polyMatch[1] ?? polyMatch[2];
    if (!rawPoints) {
      throw new Error('Unsupported SVG: polygon is missing points data.');
    }

    const pts = rawPoints
      .trim()
      .split(/\s+/)
      .map((pair: string): P2 => {
        const [x, y] = pair.split(',').map(Number);
        if (x === undefined || y === undefined) {
          throw new Error(`Unsupported SVG: invalid polygon point "${pair}".`);
        }

        return [x, y];
      });
    subpaths = [dedupe(pts)];
  } else {
    throw new Error(
      'Unsupported SVG: expected <path d="..."/> or <polygon points="..."/>.',
    );
  }

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const pts of subpaths) {
    for (const [x, y] of pts) {
      if (x < minX) {
        minX = x;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }
  const cX = (minX + maxX) / 2;
  const cY = (minY + maxY) / 2;
  const bbW = maxX - minX;
  const bbH = maxY - minY;
  const scale = p.logoSize / Math.max(bbW, bbH);

  const logoSubpaths = subpaths.map((pts) =>
    pts.map(
      ([x, y]) => [(x - cX) * scale, p.logoCenterY - (y - cY) * scale] as P2,
    ),
  );

  const firstLogoSubpath = logoSubpaths[0];
  if (!firstLogoSubpath) {
    throw new Error('Unsupported SVG: expected at least one drawable subpath.');
  }

  const logoSolids = [firstLogoSubpath, ...logoSubpaths.slice(1)].map(
    (subpath) =>
      drawingFromPoints(subpath)
        .sketchOnPlane('XY', p.tabletHeight)
        .extrude(p.logoHeight),
  );
  const logoBase = compoundShape3D(logoSolids, 'Logo');
  const logoTopZ = p.tabletHeight + p.logoHeight;
  const logo =
    p.logoChamferSize > 0
      ? logoBase.chamfer(p.logoChamferSize, (e) => e.inPlane('XY', logoTopZ))
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
    tablet = tablet.fillet(p.edgeFilletRadius, (e) =>
      e
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
    tablet = tablet.fillet(p.holeFilletRadius, (e) =>
      e
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
