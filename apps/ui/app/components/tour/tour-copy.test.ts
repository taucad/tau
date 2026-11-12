import { describe, expect, it } from 'vitest';
import type { TourStepId } from '@taucad/preferences';
import { formatList, tourPaletteHint, tourTipCopy, tourTipLabel } from '#components/tour/tour-copy.js';
import type { TourCopyInput } from '#components/tour/tour-copy.js';

/** A hobbyist with a 3D printer who answered nothing about their tools. */
const printer: TourCopyInput = {
  mode: 'guided',
  arrival: 'empty',
  goals: ['printing'],
  mapping: 'tau',
  gizmo: 'cube',
  formats: ['STEP', 'STL', '3MF'],
  host: 'browser',
  hasTestRun: true,
};

/** An electronics engineer coming from a tool whose mouse is middle-drag orbit, with the axes gizmo. */
const electronics: TourCopyInput = {
  ...printer,
  goals: ['electronics'],
  mapping: 'middle-shift',
  gizmo: 'axes',
};

/** A product designer on a laptop trackpad, in the desktop app. */
const product: TourCopyInput = {
  ...printer,
  goals: ['product', 'mechanical'],
  mapping: 'trackpad',
  gizmo: 'axis-balls',
  host: 'desktop',
};

const steps: readonly TourStepId[] = ['ask', 'look', 'adjust', 'verify', 'build'];

describe('tourTipCopy', () => {
  it('keeps every tip to three sentences or fewer, for every persona and mode', () => {
    for (const persona of [printer, electronics, product]) {
      for (const mode of ['guided', 'replay'] as const) {
        for (const step of steps) {
          expect(tourTipCopy(step, { ...persona, mode }).text.length).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('titles tip 1 by how the project was reached', () => {
    expect(tourTipCopy('ask', printer)).toMatchObject({
      title: 'Describe what you want',
      tryIt: 'Press Send to build this example',
    });
    expect(tourTipCopy('ask', { ...printer, arrival: 'prompt' })).toMatchObject({
      title: 'Tau is building your part',
      tryIt: 'The next tip appears when the model does',
    });
    expect(tourTipCopy('ask', { ...printer, arrival: 'prompt', mode: 'replay' }).title).toBe('Describe what you want');
  });

  it('swaps tip 1’s third sentence for people who make electronics or products', () => {
    expect(tourTipCopy('ask', printer).text[2]).toBe('You can pick a kernel yourself from the Auto menu.');
    expect(tourTipCopy('ask', electronics).text[2]).toBe(
      'A board and its enclosure can live in one project; each model has its own kernel.',
    );
    expect(tourTipCopy('ask', product).text[2]).toBe(
      'A board and its enclosure can live in one project; each model has its own kernel.',
    );
  });

  it('shows the person’s own bindings and gizmo sentence in tip 2', () => {
    const tau = tourTipCopy('look', printer);
    expect(tau.bindings?.orbit[0]).toEqual(['Left drag']);
    expect(tau.text).toEqual(['Click the cube in the corner to snap to a standard view.']);
    expect(tau.link).toBe('Change controls');

    const middle = tourTipCopy('look', electronics);
    expect(middle.bindings?.orbit[0]).not.toEqual(tau.bindings?.orbit[0]);
    expect(middle.text).toEqual(['Press F to fit the model in view.']);

    const trackpad = tourTipCopy('look', product);
    expect(trackpad.bindings?.pan.flat().join(' ')).toMatch(/scroll/iu);
    expect(trackpad.text).toEqual(['Click the axis balls in the corner to snap to a standard view.']);
    expect(tourTipCopy('look', { ...printer, gizmo: 'none' }).text).toEqual(['Press F to fit the model in view.']);
  });

  it('offers a check from the composer when there is no test run', () => {
    expect(tourTipCopy('verify', printer)).toMatchObject({ tryIt: 'Open this row to see each check' });
    expect(tourTipCopy('verify', printer).action).toBeUndefined();
    expect(tourTipCopy('verify', { ...printer, hasTestRun: false })).toMatchObject({
      action: 'Ask Tau to check it',
      tryIt: 'Ask for a check when you want one',
    });
  });

  it('lists only the formats the active entry offers in tip 5, and the folder line on desktop', () => {
    expect(tourTipCopy('build', printer).text).toEqual([
      'Export writes the formats this model’s kernel offers: STEP, STL and 3MF.',
      'The source stays in the project, so you can revise the part after testing it.',
    ]);
    expect(tourTipCopy('build', { ...product, formats: ['STL'] }).text).toEqual([
      'Export writes the formats this model’s kernel offers: STL.',
      'Save it to a folder or straight into the project.',
      'The source stays in the project, so you can revise the part after testing it.',
    ]);
  });

  it('shows the line under the text only in a guided tour', () => {
    for (const step of steps) {
      expect(tourTipCopy(step, printer).tryIt).toBeDefined();
      expect(tourTipCopy(step, { ...printer, mode: 'replay' }).tryIt).toBeUndefined();
    }
  });
});

describe('tour chrome copy', () => {
  it('names the tip and its position, and shows the palette path for the platform', () => {
    expect(tourTipLabel(1, 'Look around')).toBe('Tour tip 2 of 5: Look around');
    expect(tourPaletteHint('mac')).toBe('⌘K, then Go to tour tip');
    expect(tourPaletteHint('other')).toBe('Ctrl K, then Go to tour tip');
    expect(formatList(['STEP', 'STL'])).toBe('STEP and STL');
  });
});
