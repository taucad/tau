import { describe, expect, it } from 'vitest';
import { annotationLimits } from '@taucad/chat/annotations';
import type { AnnotationMark, MessageAnnotations } from '@taucad/chat/annotations';
import {
  addPictureComment,
  annotatedImageOf,
  extendMark,
  grabMark,
  liftMark,
  markSpan,
  modelAnchorOf,
  movePictureComment,
  shiftMark,
  startMark,
  withImage,
} from '#components/comments/markup-marks.js';

const size = { width: 1000, height: 500 };
const reach = { size, slop: 8 };

describe('drawing a mark', () => {
  it('should start every tool as a point and reach the pointer', () => {
    expect(extendMark(startMark('arrow', [0.1, 0.1]), [0.5, 0.5], size)).toEqual({
      kind: 'arrow',
      from: { at: [0.1, 0.1] },
      to: { at: [0.5, 0.5] },
    });
    expect(extendMark(startMark('rectangle', [0.1, 0.1]), [0.3, 0.2], size)).toEqual({
      kind: 'rectangle',
      from: [0.1, 0.1],
      to: [0.3, 0.2],
    });
  });

  it('should skip pen points closer than a few pixels and thin a long stroke', () => {
    const pen = startMark('pen', [0, 0]);
    expect(extendMark(pen, [0.001, 0], size)).toBe(pen);
    let stroke: AnnotationMark = pen;
    for (let step = 1; step <= 300; step++) {
      stroke = extendMark(stroke, [step / 300, 0.5], size);
    }
    expect(stroke.kind === 'pen' ? stroke.points.length : 0).toBeLessThanOrEqual(annotationLimits.penPoints);
    expect(stroke.kind === 'pen' && stroke.points.at(-1)).toEqual([1, 0.5]);
  });

  it('should measure a slip as a short span', () => {
    expect(markSpan(startMark('line', [0.5, 0.5]), size)).toBe(0);
    expect(markSpan(extendMark(startMark('line', [0, 0]), [0.1, 0], size), size)).toBeCloseTo(100);
  });
});

describe('grabMark', () => {
  const arrow: AnnotationMark = { kind: 'arrow', from: { at: [0.1, 0.5] }, to: { at: [0.5, 0.5] } };
  const box: AnnotationMark = { kind: 'rectangle', from: [0.2, 0.2], to: [0.4, 0.8] };

  it('should take one end of an arrow near it, and the whole arrow along its shaft', () => {
    expect(grabMark([arrow], [0.502, 0.5], reach)).toEqual({ index: 0, grip: 'to' });
    expect(grabMark([arrow], [0.1, 0.505], reach)).toEqual({ index: 0, grip: 'from' });
    expect(grabMark([arrow], [0.3, 0.505], reach)).toEqual({ index: 0, grip: 'all' });
  });

  it('should take the topmost mark, and nothing on clear image or inside a shape', () => {
    expect(grabMark([arrow, box], [0.2, 0.5], reach)).toEqual({ index: 1, grip: 'all' });
    expect(grabMark([arrow, box], [0.3, 0.3], reach)).toBeUndefined();
    expect(grabMark([arrow, box], [0.9, 0.1], reach)).toBeUndefined();
  });
});

describe('shiftMark', () => {
  it('should move one end alone, or the whole mark, and keep it on the image', () => {
    const line: AnnotationMark = { kind: 'line', from: { at: [0.1, 0.1] }, to: { at: [0.5, 0.5] } };
    expect(shiftMark(line, 'to', [0.1, 0])).toEqual({ kind: 'line', from: { at: [0.1, 0.1] }, to: { at: [0.6, 0.5] } });
    expect(shiftMark(line, 'all', [-0.3, 0])).toEqual({ kind: 'line', from: { at: [0, 0.1] }, to: { at: [0.2, 0.5] } });
  });
});

describe('the draft record in mark up', () => {
  const image = { id: 'img-1', width: 1000, height: 500, attachment: 'blob:a', marks: [] };

  it('should add an image the first time it is marked, then update it in place', () => {
    const first = withImage(undefined, { ...image, marks: [startMark('line', [0, 0])] });
    expect(annotatedImageOf(first, 'blob:a')?.marks).toHaveLength(1);
    const second = withImage(first, { ...image, marks: [] });
    expect(second.images).toEqual([{ ...image, marks: [] }]);
  });

  it('should pin a comment on the picture, and move it there, but not a model pin', () => {
    const base = withImage(undefined, image);
    const { annotations, number } = addPictureComment(base, 'img-1', [0.2, 1.4]);
    expect(number).toBe(1);
    expect(annotations.comments).toEqual([{ number: 1, text: '', image: 'img-1', at: [0.2, 1] }]);
    expect(movePictureComment(annotations, 1, [0.6, 0.6]).comments[0]?.at).toEqual([0.6, 0.6]);
    const modelPin: MessageAnnotations = {
      ...annotations,
      comments: [{ number: 2, text: 'x', image: 'img-1', model: { point: [0, 0, 0] } }],
    };
    expect(movePictureComment(modelPin, 2, [0.6, 0.6])).toEqual(modelPin);
  });
});

describe('lifting to the model (D22)', () => {
  const lifted = { point: [1, 2, 3] as const, normal: [0, 0, 1] as const, componentId: 'hub', componentLabel: 'Hub' };

  it("should lift an arrow's ends to the parts they touch, and leave an end over the background bare", () => {
    const arrow: AnnotationMark = { kind: 'arrow', from: { at: [0.1, 0.1] }, to: { at: [0.5, 0.5] } };
    const lift = (at: readonly [number, number]) => (at[0] > 0.3 ? lifted : undefined);
    expect(liftMark(arrow, lift)).toEqual({
      kind: 'arrow',
      from: { at: [0.1, 0.1] },
      to: { at: [0.5, 0.5], point: [1, 2, 3], part: { componentId: 'hub', label: 'Hub' } },
    });
  });

  it('should keep a 2D mark when no pane shows the scene, and leave shapes alone', () => {
    const line: AnnotationMark = { kind: 'line', from: { at: [0.1, 0.1], point: [0, 0, 0] }, to: { at: [0.5, 0.5] } };
    expect(liftMark(line, undefined)).toEqual({ kind: 'line', from: { at: [0.1, 0.1] }, to: { at: [0.5, 0.5] } });
    const box: AnnotationMark = { kind: 'rectangle', from: [0, 0], to: [1, 1] };
    expect(liftMark(box, () => lifted)).toBe(box);
  });

  it('should anchor a pin on the lifted surface and its part', () => {
    expect(modelAnchorOf(lifted)).toEqual({
      point: [1, 2, 3],
      normal: [0, 0, 1],
      part: { componentId: 'hub', label: 'Hub' },
    });
  });
});
