// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UIMatch } from 'react-router';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';

let registered: CommandPaletteItem[] = [];
const environment = vi.hoisted(() => ({ TAU_DEBUG: false }));

vi.mock('#environment.config.js', () => ({ ENV: environment }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: undefined }) }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('#hooks/use-auth-links.js', () => ({ useAuthLinks: () => ({ signIn: '/in', signOut: '/out' }) }));
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ isOpen: false, section: 'general', open: vi.fn(), close: vi.fn() }),
}));
vi.mock('#components/layout/command-palette.js', () => ({
  useCommandPaletteItems: (_id: string, factory: () => CommandPaletteItem[]) => {
    registered = factory();
  },
}));

const { RootCommandPaletteItems } = await import('#root-command-items.js');

describe('RootCommandPaletteItems', () => {
  it('registers global actions without duplicating project navigation', () => {
    registered = [];
    render(<RootCommandPaletteItems match={{ id: 'root' } as UIMatch} />);

    expect(registered.map((item) => item.id)).toEqual([
      'new-project-from-prompt',
      'new-project-from-code',
      'all-projects',
      'open-settings',
      'geospec-performance',
      'sign-in',
      'sign-out',
    ]);
    expect(registered.some((item) => item.id.startsWith('recent-project-'))).toBe(false);
  });

  it.each([false, true])('should expose the GeoSpec lab only with TAU_DEBUG=%s', (enabled) => {
    environment.TAU_DEBUG = enabled;
    render(<RootCommandPaletteItems match={{ id: 'root' } as UIMatch} />);
    expect(registered.find(({ id }) => id === 'geospec-performance')).toMatchObject({
      link: '/debug/geospec',
      visible: enabled,
    });
    environment.TAU_DEBUG = false;
  });
});
