// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { entitlementsFromTier } from '@taucad/billing';
import type { KernelPreference } from '@taucad/types/constants';
import type { KernelPickerGroup } from '#components/chat/kernel-picker-layout.js';

/*
 * The Auto-first selector (blueprint D8): it reads and writes the chat's preference through the composer, lists the
 * D8 groups with More as a sub-view, and explains a kernel this host cannot run instead of choosing it.
 */

const composer = vi.hoisted(() => ({ preference: 'auto' as KernelPreference, setActivePreference: vi.fn() }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    kernel: { preference: composer.preference, setActivePreference: composer.setActivePreference },
  }),
}));
const flags = vi.hoisted(() => ({ zooCloudDispatch: false }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => flag === 'zooCloudDispatch' && flags.zooCloudDispatch,
}));
vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: () => undefined }));
const toastInfo = vi.hoisted(() => vi.fn());
vi.mock('@taucad/ui/components/sonner', () => ({ toast: { info: toastInfo } }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: () => entitlementsFromTier('pro') }));
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ isOpen: false, section: 'general', open: vi.fn(), close: vi.fn() }),
}));

type CapturedProperties = {
  onSelect?: (id: string) => void;
  onClose?: () => void;
  value?: { id: string };
  groupedItems?: KernelPickerGroup[];
  subViews?: ReadonlyArray<{ id: string; title: string; groupedItems: KernelPickerGroup[] }>;
  shouldCloseOnSelect?: (id: string) => boolean;
};
const captured: { current: CapturedProperties } = { current: {} };
vi.mock('@taucad/ui/components/combobox-responsive', () => ({
  ComboBoxResponsive: (properties: CapturedProperties & { readonly children?: React.ReactNode }): React.JSX.Element => {
    captured.current = properties;
    return <div data-testid='combobox'>{properties.children}</div>;
  },
}));

const { KernelPreferenceSelector } = await import('#components/chat/chat-kernel-selector.js');

const renderSelector = (onSelect?: (preference: KernelPreference) => void): void => {
  render(
    <KernelPreferenceSelector onSelect={onSelect}>
      <span>pill</span>
    </KernelPreferenceSelector>,
  );
};

describe('KernelPreferenceSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    composer.preference = 'auto';
    flags.zooCloudDispatch = false;
    captured.current = {};
  });

  it('opens on Auto and the D8 top level, with the rest under More', () => {
    renderSelector();
    expect(captured.current.value?.id).toBe('auto');
    expect(captured.current.groupedItems?.map(({ name }) => name)).toEqual([
      'Automatic',
      'BRep',
      'Mesh',
      'Implicit',
      'Electronics',
    ]);
    expect(captured.current.subViews?.map(({ id, title }) => [id, title])).toEqual([['more', 'More kernels']]);
  });

  it('routes a pick through the chat preference', () => {
    const onSelect = vi.fn();
    renderSelector(onSelect);
    captured.current.onSelect?.('replicad');
    expect(composer.setActivePreference).toHaveBeenCalledWith('replicad');
    expect(onSelect).toHaveBeenCalledWith('replicad');
    captured.current.onSelect?.('auto');
    expect(composer.setActivePreference).toHaveBeenLastCalledWith('auto');
  });

  it('explains a kernel that cannot run here, keeps the menu open and chooses nothing', () => {
    renderSelector();
    expect(captured.current.shouldCloseOnSelect?.('zoo')).toBe(false);
    expect(captured.current.shouldCloseOnSelect?.('replicad')).toBe(true);
    captured.current.onSelect?.('zoo');
    expect(composer.setActivePreference).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith(expect.stringMatching(/ is not available here$/), {
      description: expect.stringContaining('not open yet') as string,
    });
  });

  it('offers Zoo once its cloud engine opens', () => {
    flags.zooCloudDispatch = true;
    renderSelector();
    const zoo = captured.current.subViews?.[0]?.groupedItems
      .flatMap(({ items }) => items)
      .find(({ id }) => id === 'zoo');
    expect(zoo?.unavailable?.badge).not.toBe('Unavailable');
  });
});
