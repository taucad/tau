// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from '@taucad/ui/components/tabs';
import { PreviewNav } from '#routes/w.$workspace.$project_.preview/preview-nav.js';

describe('mobile preview navigation', () => {
  it('draws a flat bar with one top hairline instead of a partial rounded frame', () => {
    render(
      <Tabs value='model'>
        <PreviewNav />
      </Tabs>,
    );

    const classes = screen.getByRole('tablist').className.split(/\s+/u);
    expect(classes).toEqual(expect.arrayContaining(['border-t', 'border-x-0', 'border-b-0', 'rounded-none']));
    expect(classes.filter((name) => name.startsWith('rounded-t') || name.startsWith('rounded-b'))).toEqual([]);
  });
});
