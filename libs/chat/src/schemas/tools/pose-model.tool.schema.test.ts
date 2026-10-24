import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  capturePoseSchema,
  poseModelDescription,
  poseModelInputSchema,
} from '#schemas/tools/pose-model.tool.schema.js';

describe('poseModelInputSchema', () => {
  it('should take an animation action, coordinates, or neither to read the pose', () => {
    expect(poseModelInputSchema.parse({ animation: { id: 'four-sun-turns', action: 'seek', time: 2 } })).toEqual({
      animation: { id: 'four-sun-turns', action: 'seek', time: 2 },
    });
    expect(poseModelInputSchema.parse({ targetFile: 'main.ts', coordinates: { sun: 90 } })).toEqual({
      targetFile: 'main.ts',
      coordinates: { sun: 90 },
    });
    expect(poseModelInputSchema.parse({})).toEqual({});
  });

  it.each([
    [{ animation: { id: 'spin', action: 'seek' } }, 'seek needs time, in seconds into the animation.'],
    [
      { animation: { id: 'spin', action: 'play' }, coordinates: { sun: 1 } },
      'Send animation or coordinates, not both: an animation sets the coordinates it drives.',
    ],
  ])('should refuse %j with one sentence', (input, message) => {
    const result = poseModelInputSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([message]);
  });

  it('should send coordinates to providers without propertyNames', () => {
    const schema = z.toJSONSchema(poseModelInputSchema, { io: 'input' });

    expect(JSON.stringify(schema)).not.toContain('propertyNames');
  });

  it('should keep its description under 150 words', () => {
    expect(poseModelDescription.split(/\s+/u).length).toBeLessThanOrEqual(150);
  });
});

describe('capturePoseSchema', () => {
  it('should take an animation at a time or driver coordinates, and nothing else', () => {
    expect(capturePoseSchema.parse({ animation: { id: 'four-sun-turns', time: 2 } })).toEqual({
      animation: { id: 'four-sun-turns', time: 2 },
    });
    expect(capturePoseSchema.parse({ coordinates: { sun: 90 } })).toEqual({ coordinates: { sun: 90 } });
    expect(capturePoseSchema.safeParse({ animation: { id: 'spin', action: 'play' } }).success).toBe(false);
  });
});
