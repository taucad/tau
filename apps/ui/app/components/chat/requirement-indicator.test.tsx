// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RequirementIndicator } from '#components/chat/requirement-indicator.js';

afterEach(() => {
  cleanup();
});

describe('RequirementIndicator', () => {
  it('should name passed, failed and undecided counts, each beside its own glyph', () => {
    const { container } = render(<RequirementIndicator passedCount={5} failedCount={1} undecidedCount={4} />);

    expect(container.textContent).toBe('5 passed1 failed4 not decided');
    expect(container.querySelectorAll('svg')).toHaveLength(3);
  });

  it('should omit a zero count and its glyph', () => {
    const { container } = render(<RequirementIndicator passedCount={5} failedCount={0} undecidedCount={5} />);

    expect(container.textContent).toBe('5 passed5 not decided');
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });
});
