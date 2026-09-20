import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokenStyles = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

const utilityBody = (utility: string): string => {
  const start = tokenStyles.indexOf(`@utility ${utility} {`);
  expect(start, `${utility} is defined`).toBeGreaterThan(-1);
  const rest = tokenStyles.slice(start);
  let depth = 0;
  for (const [index, character] of [...rest].entries()) {
    if (character === '{') {
      depth += 1;
    }
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return rest.slice(0, index + 1);
      }
    }
  }
  throw new Error(`${utility} is unterminated`);
};

describe('fade label entry point', () => {
  it('defines the geometry once, as tokens', () => {
    /* Token declarations only: the utilities below re-resolve `--fade-label-size` by design. */
    const tokenBlock = tokenStyles.slice(0, tokenStyles.indexOf('@utility'));
    const declarations = [...tokenBlock.matchAll(/(--fade-(?:label|scrim)[a-z-]*):\s*([^;]+);/g)].map(
      ([, name, value]) => `${name}: ${value?.trim()}`,
    );

    expect(declarations).toEqual([
      '--fade-label-size: 1.5rem',
      '--fade-label-size-actions: 2.625rem',
      '--fade-scrim-size: 1.5rem',
      '--fade-scrim-into: var(--accent)',
    ]);
  });

  it('masks the label at the inline end rather than clipping it', () => {
    const body = utilityBody('fade-label');

    expect(body).toContain(
      'mask-image: linear-gradient(to right, black, black calc(100% - var(--fade-label-size)), transparent)',
    );
    expect(body).toContain('white-space: nowrap');
    expect(body).toContain('overflow: hidden');
    /* An ellipsis would defeat the dissolve. */
    expect(body).not.toContain('text-overflow');
  });

  it('lets the row widen the fade once its controls are reachable', () => {
    const body = utilityBody('fade-row');

    expect(body).toContain('position: relative');
    expect(body).toContain('&:hover');
    expect(body).toContain('&:focus-within');
    expect(body).toContain('--fade-label-size: var(--fade-label-size-actions)');
  });

  it('finishes the dissolve under the trailing control', () => {
    const body = utilityBody('fade-action');

    expect(body).toContain('right: 100%');
    expect(body).toContain('pointer-events: none');
    expect(body).toContain('background-image: linear-gradient(to right, transparent, var(--fade-scrim-into))');
  });
});
