// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TileMarkup } from '#components/comments/tile-markup.js';
import { markupInk } from '#components/comments/annotation-painter.js';

const calls: Array<[string, unknown[]]> = [];
const recordingContext = new Proxy(
  {},
  {
    get:
      (_target, key: string) =>
      (...args: unknown[]) => {
        calls.push([key, args]);
      },
    set: (_target, key: string, value: unknown) => {
      calls.push([`=${key}`, [value]]);
      return true;
    },
  },
);

afterEach(() => {
  calls.length = 0;
  vi.restoreAllMocks();
});

describe('TileMarkup', () => {
  it('should draw a pin with the sent image proportions on a small canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      recordingContext as unknown as CanvasRenderingContext2D,
    );
    render(
      <TileMarkup
        image={{ id: 'img-1', width: 1600, height: 800, marks: [] }}
        comments={[{ number: 2, text: 'Here', image: 'img-1', at: [0.5, 0.5] }]}
      />,
    );
    const canvas = screen.getByTestId('tile-markup');
    // The longest side is 320 canvas pixels; the painter draws at the image's own size, scaled down.
    expect(canvas).toHaveAttribute('width', '320');
    expect(canvas).toHaveAttribute('height', '160');
    expect(calls).toContainEqual(['scale', [0.2, 0.2]]);
    expect(calls).toContainEqual(['fillText', ['2', 800, expect.any(Number)]]);
    expect(calls).toContainEqual(['=fillStyle', [markupInk]]);
  });
});
