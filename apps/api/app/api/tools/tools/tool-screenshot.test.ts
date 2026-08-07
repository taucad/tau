import { describe, expect, it } from 'vitest';
import { screenshotToolDefinition } from '#api/tools/tools/tool-screenshot.js';

describe('screenshotToolDefinition', () => {
  it('should explain every embedded spatial annotation to the model', () => {
    expect(screenshotToolDefinition.description).toContain('View From');
    expect(screenshotToolDefinition.description).toContain('dot/cross depth notation');
    expect(screenshotToolDefinition.description).toContain('subject-center plane');
    expect(screenshotToolDefinition.description).toContain('@ center');
  });
});
