import { expect, it } from 'vitest';
import {
  compositeEmphasisPixels,
  measureEmphasisPixels,
} from '#graphics/three/materials/model-emphasis-pixels.test-utils.js';

it('should distinguish sparse boundary coverage from missing strokes, shifts and interior corruption', () => {
  const width = 32;
  const reference = new Uint8Array(width * width * 4);
  for (let y = 4; y < 28; y++) {
    reference[(y * width + 12) * 4] = 255;
  }
  expect(measureEmphasisPixels(reference, reference, width).maxDelta).toBe(0);
  const coverage = new Uint8Array(reference);
  coverage[(16 * width + 12) * 4] = 191; // One of four coverage samples changes at one boundary pixel.
  const sparse = measureEmphasisPixels(coverage, reference, width);
  expect(sparse.maxDelta).toBe(64);
  expect(sparse.interiorChanges).toBe(0);
  expect(sparse.maxLocalMean).toBeLessThanOrEqual(16);
  const missing = new Uint8Array(reference.length);
  expect(measureEmphasisPixels(missing, reference, width).maxLocalMean).toBeGreaterThan(16);
  const shifted = new Uint8Array(reference.length);
  for (let y = 4; y < 28; y++) {
    shifted[(y * width + 13) * 4] = 255;
  }
  expect(measureEmphasisPixels(shifted, reference, width).maxLocalMean).toBeGreaterThan(16);
  const interior = new Uint8Array(reference);
  interior[(16 * width + 24) * 4] = 64;
  expect(measureEmphasisPixels(interior, reference, width).interiorChanges).toBe(1);
});

it('should judge displayed alpha boundaries while rejecting missing, shifted and occluded strokes on both themes', () => {
  const width = 32;
  const reference = new Uint8ClampedArray(width * width * 4);
  for (let y = 4; y < 28; y++) {
    reference.set([255, 213, 74, 255], (y * width + 12) * 4);
  }
  const invisibleRgb = new Uint8ClampedArray(reference);
  invisibleRgb.set([255, 200, 255, 0], (16 * width + 24) * 4);
  const missing = new Uint8ClampedArray(reference.length);
  const shifted = new Uint8ClampedArray(reference.length);
  for (let y = 4; y < 28; y++) {
    shifted.set([255, 213, 74, 255], (y * width + 13) * 4);
  }
  const corruption = new Uint8ClampedArray(reference);
  corruption.set([255, 213, 74, 128], (16 * width + 24) * 4);
  for (const background of [0, 255]) {
    const expected = compositeEmphasisPixels(reference, background);
    const compare = (pixels: Uint8ClampedArray) =>
      measureEmphasisPixels(compositeEmphasisPixels(pixels, background), expected, width);
    expect(compare(invisibleRgb).maxDelta).toBe(0);
    expect(compare(missing).maxLocalMean).toBeGreaterThan(16);
    expect(compare(shifted).maxLocalMean).toBeGreaterThan(16);
    expect(compare(corruption).interiorChanges).toBeGreaterThan(0);
  }
});
