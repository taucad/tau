import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Collapsible, CollapsibleContent } from '#components/collapsible.js';

describe('CollapsibleContent', () => {
  it('should retarget its opening animation to content that grew after it was measured', () => {
    render(
      <Collapsible open>
        <CollapsibleContent>Loaded later</CollapsibleContent>
      </Collapsible>,
    );
    const content = screen.getByText('Loaded later');
    // Nothing is laid out in jsdom: stand in for the content's grown height and a running open animation.
    Object.defineProperty(content, 'scrollHeight', { value: 340 });
    Object.defineProperty(content, 'getAnimations', { value: () => ['collapsible-down'] });

    fireEvent.animationStart(content);

    expect(content.style.getPropertyValue('--radix-collapsible-content-height')).toBe('340px');
  });
});
