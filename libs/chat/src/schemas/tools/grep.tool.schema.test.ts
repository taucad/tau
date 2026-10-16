import { describe, expect, it } from 'vitest';
import { grepInputSchema } from '#schemas/tools/grep.tool.schema.js';

const messageFor = (pattern: string): string | undefined => {
  const result = grepInputSchema.safeParse({ pattern });
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe('grepInputSchema pattern', () => {
  it.each([
    'component|island|shells|split',
    String.raw`translat|shift|  [a-zA-Z]+\(options`,
    String.raw`export const \w+`,
  ])('accepts the valid, safe pattern %s', (pattern) => {
    expect(grepInputSchema.safeParse({ pattern }).success).toBe(true);
  });

  it('names an inline flag group as unsupported syntax and points to caseSensitive', () => {
    const message = messageFor('(?i)component|island');

    expect(message).toContain('Inline flags such as (?i) are not JavaScript regex syntax');
    expect(message).toContain('caseSensitive: false');
    expect(message).not.toContain('backtracking');
  });

  it('reports other invalid syntax with the compiler message', () => {
    expect(messageFor('foo(')).toMatch(/^The pattern is not a valid JavaScript regular expression: .+\.$/u);
  });

  it('still refuses nested quantifiers as a backtracking risk', () => {
    expect(messageFor('(a+)+$')).toContain('catastrophic backtracking');
  });
});
