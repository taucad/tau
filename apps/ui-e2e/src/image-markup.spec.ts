import { beforeEach, describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import * as target from '#support/external-target.js';

/*
 * Image mark up (comment pins charter S5 and S6) on the `/__e2e/image-markup` debug route, which marks up a drawn
 * fixture image and shows the record it keeps: by mouse, by keyboard alone and on a phone.
 */

const surface = selectors.getByRole('img', { name: /^Image with/u });
const record = selectors.getByTestId('markup-record');

const readRecord = async (): Promise<MessageAnnotations | undefined> => {
  const text = await target.textContent(record);
  // The route shows `null` while it keeps no record.
  return text && text !== 'null' ? (JSON.parse(text) as MessageAnnotations) : undefined;
};

/** A point of the image surface, as fractions of its box, in page pixels. */
const at = async (x: number, y: number): Promise<[number, number]> => {
  const box = await target.boundingBox(surface);
  if (!box) {
    throw new Error('The mark up surface has no box.');
  }
  return [box.x + box.width * x, box.y + box.height * y];
};

const dragOnSurface = async (from: [number, number], to: [number, number]): Promise<void> => {
  const [fromX, fromY] = await at(...from);
  const [toX, toY] = await at(...to);
  await target.mouseMove(fromX, fromY);
  await target.mouseDown();
  await target.mouseMove(toX, toY, { steps: 8 });
  await target.mouseUp();
};

describe('image mark up', () => {
  beforeEach(async () => {
    await target.setViewport({ width: 1280, height: 800 });
    await target.navigate('/__e2e/image-markup');
    await target.expectVisible(surface);
  });

  test('should pin a comment, draw an arrow and move its tip, all in the record', async () => {
    const [pinX, pinY] = await at(0.25, 0.5);
    await target.mouseClick(pinX, pinY);
    await target.fill(selectors.getByRole('textbox', { name: 'Comment 1' }), 'Round this corner');
    await target.keyboardPress('Enter');
    await target.expectHidden(selectors.getByRole('textbox', { name: 'Comment 1' }));

    await target.click(selectors.getByRole('button', { name: 'Arrow (A)' }));
    await dragOnSurface([0.5, 0.2], [0.7, 0.4]);
    // A drag on the arrow's tip moves that end alone (D23).
    await dragOnSurface([0.7, 0.4], [0.8, 0.6]);

    await expect
      .poll(async () => {
        const annotations = await readRecord();
        return {
          comments: annotations?.comments.map(({ number, text }) => ({ number, text })),
          marks: annotations?.images[0]?.marks.map((mark) => mark.kind),
        };
      })
      .toEqual({ comments: [{ number: 1, text: 'Round this corner' }], marks: ['arrow'] });
    const final = await readRecord();
    const arrow = final?.images[0]?.marks[0];
    if (arrow?.kind !== 'arrow') {
      throw new Error('The record has no arrow.');
    }
    // The tail stayed; the tip moved.
    expect(arrow.from.at[0]).toBeCloseTo(0.5, 1);
    expect(arrow.to.at[0]).toBeCloseTo(0.8, 1);
    expect(arrow.to.at[1]).toBeCloseTo(0.6, 1);
  });

  test('should place and nudge a pin by keyboard alone', async () => {
    await target.focus(selectors.getByRole('button', { name: 'Comment at the centre' }));
    await target.keyboardPress('Enter');
    await target.fill(selectors.getByRole('textbox', { name: 'Comment 1' }), 'Centre');
    await target.keyboardPress('Enter');
    await target.focus(selectors.getByRole('button', { name: 'Comment 1: Centre' }));
    await target.keyboardPress('Shift+ArrowRight');
    await expect
      .poll(async () => {
        const annotations = await readRecord();
        return annotations?.comments[0]?.at?.[0];
      })
      .toBeCloseTo(0.55, 2);
  });

  test('should dock the card under the picture on a phone and hide the zoom buttons', async () => {
    await target.setViewport({ width: 390, height: 844 });
    await target.expectHidden(selectors.getByRole('button', { name: 'Zoom in' }));
    const [pinX, pinY] = await at(0.5, 0.5);
    await target.mouseClick(pinX, pinY);
    const card = selectors.getByRole('group', { name: 'Comment 1' });
    await target.expectVisible(card);
    const cardBox = await target.boundingBox(card);
    const surfaceBox = await target.boundingBox(surface);
    // Docked below the picture, not over it.
    expect(cardBox && surfaceBox ? cardBox.y >= surfaceBox.y + surfaceBox.height - 1 : false).toBe(true);
    await target.fill(selectors.getByRole('textbox', { name: 'Comment 1' }), 'On a phone');
    await target.click(card.getByRole('button', { name: 'Done' }));
    await target.expectHidden(card);
    await expect
      .poll(async () => {
        const annotations = await readRecord();
        return annotations?.comments[0]?.text;
      })
      .toBe('On a phone');
  });
});
