import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The standalone geometry authoring module intentionally has no package export.
import build from './model.js';

describe('mechanical parameter admission', () => {
  it.each<{ design: string; parameters: Readonly<Record<string, number>>; message: string }>([
    { design: 'sleeve-bushing', parameters: { diameter: 30, bore: 29, length: 20 }, message: 'bore must be less' },
    { design: 'spur-gear', parameters: { module: 2, teeth: 24.5, width: 12, bore: 10 }, message: 'integer teeth' },
    { design: 'round-tube', parameters: { width: 30, length: 80, wall: 12 }, message: 'wall must be less' },
    {
      design: 'perforated-plate',
      parameters: { width: 80, depth: 60, height: 4, hole: 15 },
      message: 'load-bearing material',
    },
    { design: 'ball-bearing', parameters: { diameter: 30, bore: 12, length: 1 }, message: 'rolling elements' },
    { design: 'pipe-elbow', parameters: { diameter: 30, bore: 29, length: 60 }, message: 'wall and barb roots' },
    {
      design: 'compression-spring',
      parameters: { diameter: 24, wire: 4, pitch: 3, turns: 6 },
      message: 'clear adjacent coils',
    },
  ])('should reject impossible $design dimensions before calling the kernel', ({ design, parameters, message }) => {
    expect(() => build(parameters, design)).toThrow(RangeError);
    expect(() => build(parameters, design)).toThrow(message);
  });
});
