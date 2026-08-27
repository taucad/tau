// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';

const projects = [
  {
    id: 'project-one',
    name: 'Bracket Assembly',
    lastActivityAt: 2,
    slugs: { workspaceSlug: 'home', projectSlug: 'Bracket Assembly' },
  },
  { id: 'project-unresolved', name: 'Unresolved', lastActivityAt: 3 },
];
const chats = [
  {
    id: 'chat/one',
    resourceId: 'project-one',
    name: 'Refine gusset',
    createdAt: 1,
    updatedAt: 4,
  },
];
let registered: CommandPaletteItem[] = [];

vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects }) }));
vi.mock('#hooks/use-all-chats.js', () => ({ useAllChats: () => ({ chats }) }));
vi.mock('#components/layout/command-palette.js', () => ({
  useCommandPaletteItems: (_id: string, factory: () => CommandPaletteItem[]) => {
    registered = factory();
  },
}));

const { ProjectNavigationCommandItems } = await import('#components/nav/project-navigation-command-items.js');

describe('ProjectNavigationCommandItems', () => {
  it('registers canonical project and chat destinations searchable by both labels', () => {
    registered = [];
    render(<ProjectNavigationCommandItems />);

    expect(registered).toHaveLength(2);
    expect(registered[0]).toMatchObject({
      id: 'project-project-one',
      searchValue: 'Bracket Assembly',
      link: '/w/home/Bracket%20Assembly',
    });
    expect(registered[1]).toMatchObject({
      id: 'chat-chat/one',
      searchValue: 'Refine gusset Bracket Assembly',
      link: '/w/home/Bracket%20Assembly?chat=chat%2Fone',
    });
  });
});
