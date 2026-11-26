import { describe, expect, it } from 'vitest';
import type { AnnotationCamera, MessageAnnotations } from '@taucad/chat/annotations';
import {
  isAnyPinOutOfFrame,
  nextCommentNumber,
  outdatedComments,
  placePin,
  removeComments,
  sendableAnnotations,
  setCommentText,
} from '#components/comments/draft-comments.js';
import type { PinPlacement } from '#components/comments/draft-comments.js';

const camera: AnnotationCamera = {
  frameId: 'tau:root',
  position: [1, 1, 1],
  target: [0, 0, 0],
  up: [0, 0, 1],
  projection: { kind: 'perspective', verticalFieldOfView: 45, zoom: 1 },
  clipping: { near: 0.01, far: 10 },
  aspect: 1.5,
};

const placement = (patch: Partial<PinPlacement> = {}): PinPlacement => ({
  point: [0.01, 0.02, 0.03],
  normal: [0, 0, 1],
  camera,
  scene: { path: 'main.ts', revision: 'r1', scene: 's1' },
  size: { width: 1568, height: 1045 },
  newImageId: 'img-new',
  ...patch,
});

const stored = (annotations: MessageAnnotations, id: string, attachment: string): MessageAnnotations => ({
  ...annotations,
  images: annotations.images.map((image) => (image.id === id ? { ...image, attachment } : image)),
});

describe('placePin', () => {
  it('should give the first pin number 1 and a new picture of what the viewer showed', () => {
    const placed = placePin(undefined, placement({ newImageId: 'img-1' }));

    expect(placed).toMatchObject({ number: 1, imageId: 'img-1', needsPicture: true });
    expect(placed.annotations.comments).toEqual([
      { number: 1, text: '', image: 'img-1', model: { point: [0.01, 0.02, 0.03], normal: [0, 0, 1] } },
    ]);
    expect(placed.annotations.images).toEqual([
      {
        id: 'img-1',
        width: 1568,
        height: 1045,
        forPin: true,
        marks: [],
        view: { path: 'main.ts', revision: 'r1', scene: 's1', camera },
      },
    ]);
  });

  it('should share one picture between pins placed from the same camera on the same scene', () => {
    const first = placePin(undefined, placement({ newImageId: 'img-1' }));
    const second = placePin(first.annotations, placement({ newImageId: 'img-2', point: [0.05, 0, 0] }));

    expect(second).toMatchObject({ number: 2, imageId: 'img-1', needsPicture: false });
    expect(second.annotations.images).toHaveLength(1);
  });

  it('should take another picture once the camera, the model or what is shown differs', () => {
    const first = placePin(undefined, placement({ newImageId: 'img-1' }));
    const moved = placePin(
      first.annotations,
      placement({ newImageId: 'img-2', camera: { ...camera, position: [-1, 1, 1] } }),
    );
    const rebuilt = placePin(
      first.annotations,
      placement({ newImageId: 'img-3', scene: { path: 'main.ts', revision: 'r2', scene: 's1' } }),
    );
    const hidden = placePin(
      first.annotations,
      placement({ newImageId: 'img-4', scene: { path: 'main.ts', revision: 'r1', scene: 's2' } }),
    );

    expect([moved.imageId, rebuilt.imageId, hidden.imageId]).toEqual(['img-2', 'img-3', 'img-4']);
    expect([moved.needsPicture, rebuilt.needsPicture, hidden.needsPicture]).toEqual([true, true, true]);
  });

  it('should take the newest pin picture again after a small orbit, and carry its pins onto it', () => {
    const first = placePin(undefined, placement({ newImageId: 'img-1' }));
    const drafted = stored(first.annotations, 'img-1', 'attachments/a.webp');
    const orbited = placePin(
      drafted,
      placement({ newImageId: 'img-2', point: [0.05, 0, 0], camera: { ...camera, position: [1.2, 1, 1] } }),
    );

    expect(orbited).toMatchObject({ number: 2, imageId: 'img-2', needsPicture: true });
    expect(orbited.retakenAttachment).toBe('attachments/a.webp');
    expect(orbited.annotations.images.map(({ id }) => id)).toEqual(['img-2']);
    expect(orbited.annotations.comments.map(({ number, image }) => [number, image])).toEqual([
      [1, 'img-2'],
      [2, 'img-2'],
    ]);
  });

  it('should keep the earlier picture when one of its pins would leave the frame or face away', () => {
    const first = placePin(undefined, placement({ newImageId: 'img-1' }));
    const panned = placePin(
      first.annotations,
      placement({
        newImageId: 'img-2',
        camera: { ...camera, position: [6, -4, 1], target: [5, -5, 0] },
        point: [5, -5, 0],
      }),
    );
    const below = placePin(
      placePin(undefined, placement({ newImageId: 'img-1', normal: [0, 0, -1] })).annotations,
      placement({ newImageId: 'img-3', camera: { ...camera, position: [1.2, 1, 1] } }),
    );

    expect(panned.retakenAttachment).toBeUndefined();
    expect(panned.annotations.images.map(({ id }) => id)).toEqual(['img-1', 'img-2']);
    expect(below.annotations.images.map(({ id }) => id)).toEqual(['img-1', 'img-3']);
  });

  it('should not retake a picture the person drew on', () => {
    const first = placePin(undefined, placement({ newImageId: 'img-1' }));
    const marked: MessageAnnotations = {
      ...first.annotations,
      images: first.annotations.images.map((image) => ({
        ...image,
        marks: [{ kind: 'rectangle', from: [0, 0], to: [1, 1] }],
      })),
    };
    const orbited = placePin(marked, placement({ newImageId: 'img-2', camera: { ...camera, position: [1.2, 1, 1] } }));

    expect(orbited.annotations.images.map(({ id }) => id)).toEqual(['img-1', 'img-2']);
  });

  it('should never give a number twice, even after its comment was removed', () => {
    const first = placePin(undefined, placement({ newImageId: 'img-1' }));
    const second = placePin(first.annotations, placement());
    const { annotations } = removeComments(second.annotations, (comment) => comment.number === 2);

    expect(nextCommentNumber(annotations)).toBe(3);
    expect(placePin(annotations, placement()).number).toBe(3);
  });
});

describe('removeComments', () => {
  it("should drop a pin's picture with its last pin, and keep it while another pin stands on it", () => {
    const first = placePin(undefined, placement({ newImageId: 'img-1' }));
    const second = placePin(first.annotations, placement());
    const drafted = stored(second.annotations, 'img-1', 'attachments/a.webp');

    const one = removeComments(drafted, (comment) => comment.number === 1);
    expect(one.orphanedAttachments).toEqual([]);
    expect(one.annotations.images).toHaveLength(1);

    const both = removeComments(one.annotations, (comment) => comment.number === 2);
    expect(both.orphanedAttachments).toEqual(['attachments/a.webp']);
    expect(both.annotations.images).toEqual([]);
  });
});

describe('sendableAnnotations', () => {
  it('should send only the comments that say something, trimmed, without the draft counter', () => {
    const first = placePin(undefined, placement({ newImageId: 'img-1' }));
    const second = placePin(
      first.annotations,
      placement({ newImageId: 'img-2', camera: { ...camera, position: [-1, 1, 1] } }),
    );
    const drafted = stored(
      stored(setCommentText(second.annotations, 1, '  Round this edge  '), 'img-1', 'attachments/a.webp'),
      'img-2',
      'attachments/b.webp',
    );

    const sent = sendableAnnotations(drafted);

    expect(sent.annotations.comments.map(({ number, text }) => ({ number, text }))).toEqual([
      { number: 1, text: 'Round this edge' },
    ]);
    expect(sent.annotations.images.map(({ id }) => id)).toEqual(['img-1']);
    expect(sent.annotations.nextNumber).toBeUndefined();
    expect(sent.orphanedAttachments).toEqual(['attachments/b.webp']);
  });
});

describe('outdatedComments', () => {
  const placed = placePin(undefined, placement()).annotations;
  const annotations: MessageAnnotations = {
    ...placed,
    comments: [...placed.comments, { number: 2, text: 'On the picture', image: 'img-new', at: [0.5, 0.5] }],
  };

  it('marks every comment on a picture of other geometry', () => {
    expect([...outdatedComments(annotations, annotations.comments, 'r2')]).toEqual([1, 2]);
  });

  it('marks none on the geometry the picture was taken of', () => {
    expect(outdatedComments(annotations, annotations.comments, 'r1').size).toBe(0);
  });

  it('marks none before any geometry is on screen', () => {
    expect(outdatedComments(annotations, annotations.comments, '').size).toBe(0);
  });
});

describe('isAnyPinOutOfFrame', () => {
  const pinned = (point: [number, number, number]) => [{ number: 1, text: '', image: 'img-new', model: { point } }];

  it('keeps the camera when every pin is in frame', () => {
    expect(isAnyPinOutOfFrame(camera, pinned([0, 0, 0]))).toBe(false);
  });

  it('asks for a fit when a pin is beside the frame', () => {
    expect(isAnyPinOutOfFrame(camera, pinned([5, -5, 0]))).toBe(true);
  });

  it('asks for a fit when a pin is behind the camera', () => {
    expect(isAnyPinOutOfFrame(camera, pinned([3, 3, 3]))).toBe(true);
  });

  it('never fits for a comment on the picture alone', () => {
    expect(isAnyPinOutOfFrame(camera, [{ number: 1, text: '', image: 'img-new', at: [2, 2] }])).toBe(false);
  });
});
