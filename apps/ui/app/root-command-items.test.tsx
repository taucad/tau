// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UIMatch } from 'react-router';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';

let registered: CommandPaletteItem[] = [];

vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: undefined }) }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('#hooks/use-auth-links.js', () => ({ useAuthLinks: () => ({ signIn: '/in', signOut: '/out' }) }));
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ isOpen: false, section: 'general', open: vi.fn(), close: vi.fn() }),
}));
const flags = vi.hoisted(() => ({ onboarding: false }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: (flag: string) => flag === 'onboarding' && flags.onboarding }));
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
      'set-up-tau',
      'sign-in',
      'sign-out',
    ]);
    expect(registered.some((item) => item.id.startsWith('recent-project-'))).toBe(false);
  });

  /* The palette lists Set up Tau only with onboarding on. */
  it.each([
    { isEnabled: true, visible: true },
    { isEnabled: false, visible: false },
  ])('lists Set up Tau when onboarding is $isEnabled', ({ isEnabled, visible }) => {
    flags.onboarding = isEnabled;
    render(<RootCommandPaletteItems match={{ id: 'root' } as UIMatch} />);

    const item = registered.find(({ id }) => id === 'set-up-tau');
    expect(item).toEqual(expect.objectContaining({ label: 'Set up Tau', link: '/welcome?entry=palette', visible }));
  });
});
