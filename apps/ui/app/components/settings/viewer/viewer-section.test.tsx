// @vitest-environment jsdom
// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@taucad/ui/components/sidebar';
import { SettingsDialog } from '#components/settings/settings-dialog.js';
import { availableSettingsSections, searchSettings, settingsSections } from '#components/settings/settings-registry.js';
import { SettingsRow } from '#components/settings/settings-item.js';

const flags = vi.hoisted(() => ({ viewerControls: false }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => flag === 'viewerControls' && flags.viewerControls,
}));
vi.mock('#components/settings/settings-content.js', () => ({
  SettingsContent: ({ section }: { readonly section: string }) => <div>Mounted {section} section</div>,
}));
vi.mock('@taucad/ui/components/keyboard', () => ({ useKeybinding: vi.fn() }));

const { scrollTo, scrollIntoView } = HTMLElement.prototype;

function Surface({ url }: { readonly url: string }): React.JSX.Element {
  return (
    <MemoryRouter initialEntries={[url]}>
      <SidebarProvider>
        <SettingsDialog />
      </SidebarProvider>
    </MemoryRouter>
  );
}

const mounted = async (): Promise<void> => {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
};

describe('Settings → Viewer behind viewerControls (V1)', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    flags.viewerControls = false;
  });
  afterAll(() => {
    HTMLElement.prototype.scrollTo = scrollTo;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it('is the first entry of the Workspace group, before Compute', () => {
    const workspace = settingsSections.filter(({ group }) => group === 'Workspace').map(({ id }) => id);
    expect(workspace[0]).toBe('viewer');
    expect(workspace[1]).toBe('compute');
  });

  it('opens Viewer from ?settings=viewer with the flag on', async () => {
    flags.viewerControls = true;
    render(<Surface url='/?settings=viewer' />);
    await mounted();
    expect(await screen.findByText('Mounted viewer section')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Viewer' })).toBeInTheDocument();
  });

  it('has no section, no navigation entry and no deep link with the flag off', async () => {
    render(<Surface url='/?settings=viewer' />);
    await mounted();
    expect(await screen.findByText('Mounted general section')).toBeInTheDocument();
    expect(screen.queryByText('Mounted viewer section')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Viewer' })).not.toBeInTheDocument();
  });

  it('keeps the section out of search with the flag off, and finds it with the flag on', async () => {
    expect(availableSettingsSections(() => false).some(({ id }) => id === 'viewer')).toBe(false);
    expect(availableSettingsSections(() => true).some(({ id }) => id === 'viewer')).toBe(true);
    expect(searchSettings('viewer')).toEqual([]);
    expect(searchSettings('grid unit')).toEqual([]);
    const on = searchSettings('grid unit', availableSettingsSections(() => true));
    expect(on.map(({ section }) => section.id)).toEqual(['viewer']);
    expect(on[0]?.entries.map(({ id }) => id)).toEqual(['viewer-grid-unit']);

    const user = userEvent.setup();
    const off = render(<Surface url='/?settings=general' />);
    await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'viewer');
    expect(screen.getByRole('status')).toHaveTextContent('No settings found');
    off.unmount();

    flags.viewerControls = true;
    render(<Surface url='/?settings=general' />);
    await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'orthographic');
    expect(screen.getByRole('status')).toHaveTextContent('1 setting found');
    expect(screen.getByRole('button', { name: 'Projection' })).toBeInTheDocument();
  });
});

describe('SettingsRow at 320 px (V12)', () => {
  it('lets a 16 rem control wrap under its label and shrink to the row', () => {
    render(
      <SettingsRow
        title='Mouse controls'
        description='Which buttons orbit, pan and zoom'
        control={<button type='button' className='w-64 max-w-full' aria-label='Mouse controls' />}
      />,
    );
    const group = screen.getByRole('group', { name: 'Mouse controls' });
    const line = group.firstElementChild!;
    const [text, control] = [...line.children];
    // The test DOM has no layout: the classes are the contract that wraps the control and keeps the page from scrolling.
    expect(line).toHaveClass('flex-wrap');
    expect(text).toHaveClass('min-w-0', 'flex-1', 'basis-48');
    expect(control).toHaveClass('min-w-0', 'max-w-full');
    expect(control).not.toHaveClass('shrink-0');
  });
});
