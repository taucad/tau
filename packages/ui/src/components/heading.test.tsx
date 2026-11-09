// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Heading } from '#components/heading.js';
import { headingVariants } from '#components/heading.variants.js';
import type { HeadingVariant } from '#components/heading.variants.js';

/** The scale as UI Policy §3 states it: every role carries its size and weight together. */
const scale: ReadonlyArray<readonly [HeadingVariant, readonly string[]]> = [
  ['display', ['text-3xl', 'md:text-5xl', 'font-medium', 'tracking-tight']],
  ['page', ['text-4xl', 'leading-[1.1]', 'font-medium', 'tracking-tight']],
  ['section', ['text-2xl', 'font-semibold', 'tracking-tight']],
  ['title', ['text-lg', 'font-semibold']],
  ['item', ['text-base', 'font-semibold']],
  ['label', ['text-sm', 'font-medium']],
  ['overline', ['text-xs', 'font-medium']],
];

describe('headingVariants', () => {
  it.each(scale)('should give the %s role its size and weight together', (variant, classes) => {
    expect(headingVariants({ variant }).split(' ').toSorted()).toEqual(classes.toSorted());
  });
});

describe('Heading', () => {
  it.each([1, 2, 3, 4, 5, 6] as const)('should render level %i as its own heading element', (level) => {
    render(
      <Heading level={level} variant='label'>
        Materials
      </Heading>,
    );

    const heading = screen.getByRole('heading', { level, name: 'Materials' });
    expect(heading.tagName).toBe(`H${level}`);
    expect(heading).toHaveClass('text-sm', 'font-medium');
  });

  it('should keep the look when only the level changes', () => {
    render(
      <>
        <Heading level={1} variant='label'>
          Bracket
        </Heading>
        <Heading level={4} variant='label'>
          Notes
        </Heading>
      </>,
    );

    expect(screen.getByRole('heading', { level: 1 }).className).toBe(
      screen.getByRole('heading', { level: 4 }).className,
    );
  });

  it('should keep the level when only the look changes', () => {
    render(
      <>
        <Heading level={2} variant='section'>
          Projects
        </Heading>
        <Heading level={2} variant='overline'>
          Recent
        </Heading>
      </>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Projects' })).toHaveClass('text-2xl', 'font-semibold');
    expect(screen.getByRole('heading', { level: 2, name: 'Recent' })).toHaveClass('text-xs', 'font-medium');
  });

  it('should name its role and pass layout classes and heading properties through', () => {
    render(
      <Heading level={2} variant='item' id='bracket-title' className='line-clamp-2 text-muted-foreground'>
        Bracket
      </Heading>,
    );

    const heading = screen.getByRole('heading', { level: 2, name: 'Bracket' });
    expect(heading).toHaveAttribute('id', 'bracket-title');
    expect(heading).toHaveAttribute('data-slot', 'heading');
    expect(heading).toHaveAttribute('data-variant', 'item');
    expect(heading).toHaveClass('text-base', 'font-semibold', 'line-clamp-2', 'text-muted-foreground');
  });
});
