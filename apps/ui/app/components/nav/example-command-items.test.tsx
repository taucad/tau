// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { galleryProjects } from '#constants/project-examples.js';

let registered: CommandPaletteItem[] = [];

vi.mock('#components/layout/command-palette.js', () => ({
  // Example rows build their thumbnail elements when the module loads.
  CommandPaletteThumbnail: () => null,
  useCommandPaletteItems: (_id: string, factory: () => CommandPaletteItem[]) => {
    registered = factory();
  },
}));

const { ExampleCommandPaletteItems } = await import('#components/nav/example-command-items.js');

describe('ExampleCommandPaletteItems', () => {
  it('should register the gallery and one searchable example page per curated example', () => {
    registered = [];
    render(<ExampleCommandPaletteItems />);

    expect(registered[0]).toMatchObject({ label: 'Browse examples', group: 'Examples', link: '/community' });
    expect(registered.slice(1).map((item) => item.link)).toEqual(
      galleryProjects.map(({ locator }) => `/s/builtin~${locator}`),
    );
    const first = galleryProjects[0]!;
    expect(registered[1]).toMatchObject({ label: first.name, group: 'Examples' });
    expect(registered[1]?.searchValue).toContain(first.description);
  });

  it('should name and search each example by its kernel', () => {
    registered = [];
    render(<ExampleCommandPaletteItems />);

    const jscad = registered.find((item) => item.link === '/s/builtin~jscad.planetary-gear-system');
    expect(jscad?.detail).toBe('JSCAD');
    expect(jscad?.searchValue).toMatch(/ JSCAD$/u);
  });
});
