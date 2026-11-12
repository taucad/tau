// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { entitlementsFromTier } from '@taucad/billing';
import type { KernelPreference } from '@taucad/types/constants';
import { availableKernelConfigurations } from '#constants/available-kernel-configurations.js';

/*
 * AKS-9 acceptance on the real selector and its real combobox: typing "jscad" finds JSCAD, which lives under More,
 * and every kernel is reachable from the keyboard alone.
 */

const composer = vi.hoisted(() => ({ preference: 'auto' as KernelPreference, setActivePreference: vi.fn() }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    kernel: { preference: composer.preference, setActivePreference: composer.setActivePreference },
  }),
}));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));
vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: () => undefined }));
vi.mock('@taucad/ui/components/sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: () => entitlementsFromTier('pro') }));
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ isOpen: false, section: 'general', open: vi.fn(), close: vi.fn() }),
}));

const { KernelPreferenceSelector } = await import('#components/chat/chat-kernel-selector.js');

beforeAll(() => {
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  composer.preference = 'auto';
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const open = async () => {
  const user = userEvent.setup();
  render(
    <KernelPreferenceSelector>
      <button type='button'>Kernel pill</button>
    </KernelPreferenceSelector>,
  );
  /* Keyboard only: focus the pill and open it with Enter. */
  act(() => {
    screen.getByRole('button', { name: 'Kernel pill' }).focus();
  });
  await user.keyboard('{Enter}');
  await screen.findByRole('dialog');
  return user;
};

const highlighted = (): string | undefined =>
  within(screen.getByRole('listbox'))
    .queryAllByRole('option')
    .find((option) => option.getAttribute('aria-selected') === 'true')?.textContent ?? undefined;

describe('KernelPreferenceSelector acceptance (AKS-9)', () => {
  it('finds JSCAD under More when the person types "jscad", and picks it with Enter', async () => {
    const user = await open();
    await user.keyboard('jscad');
    const list = screen.getByRole('listbox');
    await waitFor(() => {
      expect(within(list).getByRole('option', { name: /^JSCAD/u })).toBeInTheDocument();
    });
    await user.keyboard('{Enter}');
    expect(composer.setActivePreference).toHaveBeenCalledWith('jscad');
  });

  it('reaches every row of the top level and of More with the arrow keys and Enter', async () => {
    const user = await open();
    const seen = new Set<string>();
    const walk = async (): Promise<number> => {
      const count = within(screen.getByRole('listbox')).getAllByRole('option').length;
      for (let step = 0; step < count; step++) {
        const row = highlighted();
        if (row !== undefined) {
          seen.add(row);
        }
        // oxlint-disable-next-line no-await-in-loop -- each key press depends on the highlight the last one left
        await user.keyboard('{ArrowDown}');
      }
      return count;
    };
    const topLevel = await walk();
    /* Land on More: the last row of the top level. */
    while (!highlighted()?.includes('More')) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await user.keyboard('{ArrowDown}');
    }
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /^Back to/u })).toBeInTheDocument();
    });
    await walk();

    expect(topLevel).toBeGreaterThan(1);
    const rows = [...seen].join('\n');
    for (const { name } of availableKernelConfigurations()) {
      expect(rows).toContain(name);
    }
    expect(rows).toContain('Auto');
  });
});
