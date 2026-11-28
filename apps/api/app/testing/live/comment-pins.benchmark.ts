import { crc32, deflateSync } from 'node:zlib';
import type { HostToolInvocation, HostToolResult, JsonValue } from '@taucad/agent-host';
import { serializeMessageAnnotations } from '@taucad/chat/annotations';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import { toolName } from '@taucad/chat/constants';

/*
 * The comment pins benchmark (charter W7): one request, three comments on three parts of a small model, sent two ways.
 *
 * - `pins`: the request as Tau sends it with pinned comments, the person's words, the flattened picture with its
 *   numbered pins, and the annotations block that names each comment's part and point.
 * - `text`: the same words as plain text, numbered as the pins are, with the same picture: everything but the block.
 *
 * The agent edits `main.ts` through scripted tools; the grade reads the final parameters. The model has two posts
 * that look alike, so "this post" is only answerable from where the pin sits.
 */

/** The model the benchmark edits: a base plate, two posts that look alike, and a cap on the right post. */
export const benchmarkSource = `import { makeBaseBox, makeCylinder } from 'replicad';

export const defaultParams = {
  baseLength: 120,
  baseWidth: 60,
  baseThickness: 8,
  postDiameter: 12,
  leftPostHeight: 50,
  rightPostHeight: 50,
  capDiameter: 40,
  capThickness: 6,
};

export default function main(p = defaultParams) {
  const base = makeBaseBox(p.baseLength, p.baseWidth, p.baseThickness);
  const leftPost = makeCylinder(p.postDiameter / 2, p.leftPostHeight, [-40, 0, p.baseThickness]);
  const rightPost = makeCylinder(p.postDiameter / 2, p.rightPostHeight, [40, 0, p.baseThickness]);
  const cap = makeCylinder(p.capDiameter / 2, p.capThickness, [40, 0, p.baseThickness + p.rightPostHeight]);
  return [
    { shape: base, name: 'Base plate' },
    { shape: leftPost, name: 'Left post' },
    { shape: rightPost, name: 'Right post' },
    { shape: cap, name: 'Cap' },
  ];
}
`;

export const benchmarkPath = 'main.ts';

type Parameters = Readonly<Record<string, number>>;

const initialParameters: Parameters = {
  baseLength: 120,
  baseWidth: 60,
  baseThickness: 8,
  postDiameter: 12,
  leftPostHeight: 50,
  rightPostHeight: 50,
  capDiameter: 40,
  capThickness: 6,
};

/** One pinned comment: what the person wrote, where on the front view it sits, and what it asks of the model. */
type BenchmarkComment = Readonly<{
  number: number;
  text: string;
  part: Readonly<{ componentId: string; label: string }>;
  /** Front-view point, model millimetres: x right, z up. */
  at: readonly [number, number];
  /** The parameter it should change, and to what. */
  expects: Readonly<{ parameter: string; value: number }>;
}>;

export const benchmarkComments: readonly BenchmarkComment[] = [
  {
    number: 1,
    text: 'Make this post 10 mm taller.',
    part: { componentId: 'left-post', label: 'Left post' },
    at: [-40, 35],
    expects: { parameter: 'leftPostHeight', value: 60 },
  },
  {
    number: 2,
    text: '2 mm thicker here.',
    part: { componentId: 'base-plate', label: 'Base plate' },
    at: [0, 4],
    expects: { parameter: 'baseThickness', value: 10 },
  },
  {
    number: 3,
    text: 'Make this 60 mm across.',
    part: { componentId: 'cap', label: 'Cap' },
    at: [40, 61],
    expects: { parameter: 'capDiameter', value: 60 },
  },
];

export const benchmarkRequest = 'Please make these changes.';

// The picture: an orthographic front view, 4 px per millimetre, drawn without a renderer.
const width = 640;
const height = 400;
const pixelsPerMillimetre = 4;
const toPixel = ([x, z]: readonly [number, number]): [number, number] => [
  Math.round(width / 2 + x * pixelsPerMillimetre),
  Math.round(height - 40 - z * pixelsPerMillimetre),
];

type Rgb = readonly [number, number, number];

/** A 3 by 5 bitmap of the digits the pins carry. */
const digits: Readonly<Record<string, readonly string[]>> = {
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
};

type Box = Readonly<{ x0: number; y0: number; x1: number; y1: number }>;

/** Paint a box of an RGB raster, clipped to it. */
const fill = (pixels: Uint8Array<ArrayBuffer>, box: Box, colour: Rgb): void => {
  for (let y = Math.max(0, Math.min(box.y0, box.y1)); y < Math.min(height, Math.max(box.y0, box.y1)); y++) {
    for (let x = Math.max(0, Math.min(box.x0, box.x1)); x < Math.min(width, Math.max(box.x0, box.x1)); x++) {
      pixels.set(colour, (y * width + x) * 3);
    }
  }
};

/** Paint a part's front face, given in model millimetres. */
const fillPart = (pixels: Uint8Array<ArrayBuffer>, box: Box, colour: Rgb): void => {
  const [x0, y0] = toPixel([box.x0, box.y0]);
  const [x1, y1] = toPixel([box.x1, box.y1]);
  fill(pixels, { x0, y0, x1, y1 }, colour);
};

/** Paint a numbered pin head as Tau flattens it: a magenta disc with a white rim and a white number. */
const drawPin = (pixels: Uint8Array<ArrayBuffer>, comment: BenchmarkComment): void => {
  const [cx, cy] = toPixel(comment.at);
  for (let y = -14; y <= 14; y++) {
    for (let x = -14; x <= 14; x++) {
      const distance = Math.hypot(x, y);
      if (distance <= 14) {
        const at = { x0: cx + x, y0: cy + y, x1: cx + x + 1, y1: cy + y + 1 };
        fill(pixels, at, distance > 12 ? [255, 255, 255] : [214, 0, 132]);
      }
    }
  }
  const glyph = digits[String(comment.number)] ?? [];
  for (const [rowIndex, row] of glyph.entries()) {
    for (const [columnIndex, bit] of [...row].entries()) {
      if (bit === '1') {
        const x = cx - 4 + columnIndex * 3;
        const y = cy - 7 + rowIndex * 3;
        fill(pixels, { x0: x, y0: y, x1: x + 3, y1: y + 3 }, [255, 255, 255]);
      }
    }
  }
};

/**
 * The front view as a PNG, with the comments' numbered pins drawn on it as Tau flattens them, or without.
 *
 * @param options - Whether to draw the pins.
 * @returns The PNG bytes.
 */
export function benchmarkPicture(options: { readonly withPins: boolean }): Uint8Array<ArrayBuffer> {
  const pixels = new Uint8Array(width * height * 3);
  fill(pixels, { x0: 0, y0: 0, x1: width, y1: height }, [236, 239, 243]);
  const p = initialParameters;
  const base = p['baseThickness']!;
  const top = base + p['rightPostHeight']!;
  fillPart(pixels, { x0: -60, y0: 0, x1: 60, y1: base }, [120, 130, 142]);
  fillPart(pixels, { x0: -46, y0: base, x1: -34, y1: base + p['leftPostHeight']! }, [150, 160, 172]);
  fillPart(pixels, { x0: 34, y0: base, x1: 46, y1: top }, [150, 160, 172]);
  fillPart(pixels, { x0: 20, y0: top, x1: 60, y1: top + p['capThickness']! }, [104, 114, 126]);
  if (options.withPins) {
    for (const comment of benchmarkComments) {
      drawPin(pixels, comment);
    }
  }
  return encodePng(pixels);
}

const chunk = (type: string, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const body = new Uint8Array([...new TextEncoder().encode(type), ...data]);
  const framed = new Uint8Array(body.length + 8);
  const view = new DataView(framed.buffer);
  view.setUint32(0, data.length);
  framed.set(body, 4);
  view.setUint32(body.length + 4, crc32(body));
  return framed;
};

const concat = (parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
};

const encodePng = (pixels: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // Bit depth.
  header[9] = 2; // RGB.
  const stride = width * 3;
  const rows = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rows.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(rows))),
    chunk('IEND', new Uint8Array(0)),
  ]);
};

export type BenchmarkArm = 'pins' | 'text';
export const benchmarkArms: readonly BenchmarkArm[] = ['pins', 'text'];

const pictureUrl = 'attachments/benchmark-front-view.png';

/** The annotations a pinned send carries: one picture of the model's front, and three model pins on it. */
export const benchmarkAnnotations = (): MessageAnnotations => ({
  version: 1,
  comments: benchmarkComments.map((comment) => ({
    number: comment.number,
    text: comment.text,
    image: 'front',
    model: {
      // Metres in tau:root; the front face of each part, facing the camera.
      point: [comment.at[0] / 1000, -0.03, comment.at[1] / 1000],
      normal: [0, -1, 0],
      part: comment.part,
    },
  })),
  images: [
    {
      id: 'front',
      attachment: pictureUrl,
      width,
      height,
      view: {
        path: benchmarkPath,
        revision: 'r1',
        scene: 'front',
        camera: {
          frameId: 'tau:root',
          position: [0, -0.4, 0.03],
          target: [0, 0, 0.03],
          up: [0, 0, 1],
          projection: { kind: 'orthographic', verticalSpan: 0.1, zoom: 1 },
          clipping: { near: 0.01, far: 1 },
          aspect: width / height,
        },
      },
      forPin: true,
      marks: [],
    },
  ],
  nextNumber: 4,
});

/**
 * The user content each arm sends, in the order Tau's composer sends it: the picture, the person's words, then (with
 * pins) the annotations block.
 *
 * @param arm - Which way the request is sent.
 * @returns The content blocks.
 */
export function benchmarkContent(arm: BenchmarkArm): JsonValue[] {
  const image = {
    type: 'image',
    mimeType: 'image/png',
    data: Buffer.from(benchmarkPicture({ withPins: true })).toString('base64'),
  };
  if (arm === 'pins') {
    const block = serializeMessageAnnotations(benchmarkAnnotations(), [pictureUrl]);
    if (block === undefined) {
      throw new Error('The benchmark annotations serialised to nothing.');
    }
    return [image, { type: 'text', text: benchmarkRequest }, { type: 'text', text: block }];
  }
  const numbered = benchmarkComments.map((comment) => `${comment.number}. ${comment.text}`).join('\n');
  return [
    image,
    {
      type: 'text',
      text: `${benchmarkRequest} The numbers match the pins in the picture.\n${numbered}`,
    },
  ];
}

/** What a run did to the model. */
export type BenchmarkGrade = Readonly<{
  /** Comments whose parameter reached its value, by number. */
  done: readonly number[];
  /** Parameters that changed though no comment asked for them. */
  collateral: readonly string[];
  /** The final source no longer declares the parameters in the form the grade reads. */
  unreadable: boolean;
}>;

const parametersOf = (source: string): Record<string, number> | undefined => {
  const block = /export const defaultParams = \{([\s\S]*?)\};/u.exec(source)?.[1];
  if (block === undefined) {
    return undefined;
  }
  const values: Record<string, number> = {};
  for (const match of block.matchAll(/(\w+)\s*:\s*(-?\d+(?:\.\d+)?)/gu)) {
    values[match[1]!] = Number(match[2]);
  }
  return values;
};

/**
 * Grade a run by the model's final parameters.
 *
 * @param source - The final `main.ts`.
 * @returns Which comments were done and what else changed.
 */
export function gradeBenchmark(source: string): BenchmarkGrade {
  const values = parametersOf(source);
  if (values === undefined || Object.keys(initialParameters).some((name) => values[name] === undefined)) {
    return { done: [], collateral: [], unreadable: true };
  }
  const asked = new Set(benchmarkComments.map((comment) => comment.expects.parameter));
  return {
    done: benchmarkComments
      .filter((comment) => Math.abs((values[comment.expects.parameter] ?? Number.NaN) - comment.expects.value) < 0.5)
      .map((comment) => comment.number),
    collateral: Object.keys(initialParameters).filter(
      (name) => !asked.has(name) && Math.abs(values[name]! - initialParameters[name]!) >= 0.01,
    ),
    unreadable: false,
  };
}

const ok = (content: Record<string, JsonValue>): HostToolResult => ({ content, isError: false });
const failed = (errorCode: string, message: string): HostToolResult => ({
  content: { errorCode, message },
  isError: true,
});
const isJsonObject = (input: JsonValue): input is Readonly<Record<string, JsonValue>> =>
  input !== null && typeof input === 'object' && !Array.isArray(input);
const field = (input: JsonValue, name: string): JsonValue | undefined =>
  isJsonObject(input) ? input[name] : undefined;
const stringField = (input: JsonValue, name: string): string | undefined => {
  const value = field(input, name);
  return typeof value === 'string' ? value : undefined;
};
const normalise = (path: string): string => path.replace(/^\.?\//u, '');

/**
 * A one-file project the agent reads and edits, with a build that always succeeds.
 *
 * @returns The project's file and the tool handler.
 */
export function createBenchmarkProject(): {
  readonly source: () => string;
  readonly handle: (invocation: HostToolInvocation) => HostToolResult;
  readonly calls: () => number;
} {
  let source = benchmarkSource;
  let calls = 0;
  // oxlint-disable-next-line complexity -- a flat dispatch over tool names
  const handle = (invocation: HostToolInvocation): HostToolResult => {
    calls += 1;
    const target = stringField(invocation.input, 'targetFile');
    const isTarget = target !== undefined && normalise(target) === benchmarkPath;
    switch (invocation.toolName) {
      case toolName.readFile: {
        return isTarget
          ? ok({ content: source, size: source.length, contentKind: 'text', totalLines: source.split('\n').length })
          : failed('FILE_NOT_FOUND', `${target ?? ''} does not exist.`);
      }
      case toolName.listDirectory:
      case toolName.globSearch: {
        return ok({ entries: [{ name: benchmarkPath, path: benchmarkPath, isFolder: false }] });
      }
      case toolName.editFile: {
        const oldString = stringField(invocation.input, 'oldString') ?? '';
        if (!isTarget || oldString === '' || !source.includes(oldString)) {
          return failed('EDIT_NOT_APPLIED', `${target ?? ''} does not contain oldString.`);
        }
        const newString = stringField(invocation.input, 'newString') ?? '';
        source =
          field(invocation.input, 'replaceAll') === true
            ? source.replaceAll(oldString, newString)
            : source.replace(oldString, newString);
        return ok({ message: `Edited ${benchmarkPath}.` });
      }
      case toolName.createFile: {
        if (!isTarget) {
          return failed('WRONG_FILE', `This project has one file, ${benchmarkPath}.`);
        }
        source = stringField(invocation.input, 'content') ?? source;
        return ok({ message: `Wrote ${benchmarkPath}.` });
      }
      case toolName.evaluateModel: {
        return ok({ success: true, message: 'The model built: 4 parts.' });
      }
      case toolName.useSkill: {
        return ok({ name: stringField(invocation.input, 'skillName') ?? '', content: 'Write replicad TypeScript.' });
      }
      default: {
        return ok({ success: true, message: 'Nothing to report in this project.' });
      }
    }
  };
  return { source: () => source, handle, calls: () => calls };
}
