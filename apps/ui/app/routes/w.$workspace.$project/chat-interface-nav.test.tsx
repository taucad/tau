// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { createStaticDataSource } from '@taucad/workbench-panes/files/file-selector';
import type { DockviewApi, DockviewPanelApi, IDockviewPanel } from 'dockview-react';
import { mock } from 'vitest-mock-extended';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { ChatInterfaceNav, chatTabs } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import type { MobilePanelId } from '#constants/editor.constants.js';

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));

const flags = vi.hoisted(() => ({ machines: false, tauDebug: false }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: 'machines' | 'tauDebug') => flags[flag],
}));

describe('mobile workbench navigation', () => {
  it('restores the model and keeps Files reachable through All', () => {
    const onTabChange = vi.fn<(id: MobilePanelId) => void>();
    render(<ChatInterfaceNav activeTab='chat' onTabChange={onTabChange} />);
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });
    expect(within(navigation).queryByRole('button', { name: 'Files' })).not.toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole('button', { name: 'Model' }));
    expect(onTabChange).toHaveBeenLastCalledWith('viewer');
    fireEvent.click(within(navigation).getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(onTabChange).toHaveBeenLastCalledWith('files');
  });
});

describe('mobile secondary surfaces', () => {
  it('keeps Share available', () => {
    expect(chatTabs.find(({ id }) => id === 'share')?.label).toBe('Share');
  });
  it('keeps revision history available under its workbench title', () => {
    expect(chatTabs.find(({ id }) => id === 'revisions')?.label).toBe('Revisions');
  });
});

/** The nav as the shell drives it: the selected surface comes back as activeTab. */
function ControlledNav({ initial = 'chat' }: { readonly initial?: MobilePanelId }): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<MobilePanelId>(initial);
  return (
    <>
      <ChatInterfaceNav activeTab={activeTab} onTabChange={setActiveTab} />
      <output aria-label='Active surface'>{activeTab}</output>
    </>
  );
}

describe('All surfaces', () => {
  it('should list only the secondary surfaces, by their workbench titles, grouped as the desktop launcher', () => {
    flags.machines = true;
    flags.tauDebug = true;
    render(<ControlledNav />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'All' }));

    const sheet = screen.getByRole('dialog', { name: 'All surfaces' });
    const groups = Object.fromEntries(
      within(sheet)
        .getAllByRole('region')
        .map((group) => [
          group.getAttribute('aria-label') ?? within(group).getByRole('heading').textContent,
          within(group)
            .getAllByRole('button')
            .map((button) => button.textContent),
        ]),
    );
    expect(groups).toEqual({
      Design: ['Model tree', 'Kinematics', 'Print'],
      Activity: ['Revisions', 'Agents'],
      Project: ['Files', 'Editor', 'Export', 'Share', 'Details'],
      Diagnostics: ['Telemetry', 'Console'],
    });
    for (const primary of ['Chat', 'Parameters', 'Model']) {
      expect(within(sheet).queryByRole('button', { name: primary })).not.toBeInTheDocument();
    }
  });

  it.each([
    [undefined, ['Revisions', 'Agents']],
    ['desktop', ['Browser', 'Revisions', 'Agents']],
  ] as const)(
    'should list Browser only in the desktop app and Jobs nowhere (TAU_TARGET=%s)',
    (buildTarget, activity) => {
      vi.stubEnv('TAU_TARGET', buildTarget);
      onTestFinished(() => {
        vi.unstubAllEnvs();
      });
      render(<ControlledNav />);
      fireEvent.click(
        within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'All' }),
      );

      const group = within(screen.getByRole('dialog', { name: 'All surfaces' })).getByRole('region', {
        name: 'Activity',
      });
      expect(
        within(group)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(activity);
    },
  );

  it('should hide Print without Machines and the diagnostics without debug mode, as the desktop launcher does', () => {
    flags.machines = false;
    flags.tauDebug = false;
    render(<ControlledNav />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'All' }));

    const sheet = screen.getByRole('dialog', { name: 'All surfaces' });
    expect(within(sheet).getByRole('button', { name: 'Model tree' })).toBeInTheDocument();
    for (const gated of ['Print', 'Telemetry', 'Console']) {
      expect(within(sheet).queryByRole('button', { name: gated })).not.toBeInTheDocument();
    }
    expect(within(sheet).queryByRole('heading', { name: 'Diagnostics' })).not.toBeInTheDocument();
  });

  it('should move focus into All as it opens, so a keyboard user is inside the modal sheet', async () => {
    render(<ControlledNav />);
    const all = within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'All' });
    all.focus();
    fireEvent.click(all);

    const sheet = await screen.findByRole('dialog', { name: 'All surfaces' });
    await waitFor(() => {
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it('should return focus to All when All is dismissed with Escape', async () => {
    render(<ControlledNav />);
    const all = within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'All' });
    all.focus();
    fireEvent.click(all);
    const sheet = await screen.findByRole('dialog', { name: 'All surfaces' });

    fireEvent.keyDown(sheet, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'All surfaces' })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(all);
    });
  });

  it('should mark the selected surface in the nav and in All, and close All once a surface is chosen', async () => {
    render(<ControlledNav />);
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });
    fireEvent.click(within(navigation).getByRole('button', { name: 'All' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'All surfaces' })).getByRole('button', { name: 'Revisions' }),
    );

    expect(screen.getByRole('status', { name: 'Active surface' })).toHaveTextContent('revisions');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'All surfaces' })).not.toBeInTheDocument();
    });
    // A secondary surface is reached through All, so All carries the selection in the nav.
    expect(within(navigation).getByRole('button', { name: 'All' })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('button', { name: 'Chat' })).not.toHaveAttribute('aria-current');

    fireEvent.click(within(navigation).getByRole('button', { name: 'All' }));
    const sheet = screen.getByRole('dialog', { name: 'All surfaces' });
    expect(within(sheet).getByRole('button', { name: 'Revisions' })).toHaveAttribute('aria-current', 'page');
    expect(within(sheet).getByRole('button', { name: 'Files' })).not.toHaveAttribute('aria-current');
  });

  it('should lay the sheet out in columns of at least 8rem, so a title is not clipped at 320px', () => {
    render(<ControlledNav />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'All' }));

    for (const name of ['Files', 'Model tree', 'Revisions']) {
      const grid = within(screen.getByRole('dialog', { name: 'All surfaces' })).getByRole('button', {
        name,
      }).parentElement!;
      expect(grid).toHaveClass('grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]');
      expect(grid).not.toHaveClass('grid-cols-3');
    }
    for (const button of within(screen.getByRole('dialog', { name: 'All surfaces' })).getAllByRole('button')) {
      // The touch size: 44px rows, past the 40px floor for primary targets (I3).
      expect(button).toHaveClass('h-11');
    }
  });
});

describe('mobile navigation height', () => {
  it('should fit 40px targets in the bar and keep them above the home indicator', () => {
    render(<ChatInterfaceNav activeTab='chat' onTabChange={vi.fn()} />);
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });

    // 1px top border + 1px + 40px + 2px is the 44px --nav-height; the inset is added below the buttons.
    expect(navigation).toHaveClass(
      '[--nav-height:calc(var(--spacing)*11)]',
      'h-(--nav-offset)',
      'border-t',
      'pt-px',
      'pb-[calc(var(--spacing)*0.5_+_env(safe-area-inset-bottom))]',
    );
    for (const button of within(navigation).getAllByRole('button')) {
      expect(button).toHaveClass('h-10');
      expect(button).not.toHaveClass('min-h-11');
    }
  });
});

// Preserve the flat edge and single selected frame from current main after moving to the shared nav.
describe('mobile navigation frame', () => {
  it('should render a flat bar and one border around the active destination', () => {
    render(<ChatInterfaceNav activeTab='chat' onTabChange={vi.fn()} />);
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });
    expect(navigation).toHaveClass('rounded-none', 'border-t', 'border-x-0', 'border-b-0');
    const selected = within(navigation).getByRole('button', { name: 'Chat' });
    expect(selected).toHaveAttribute('aria-current', 'page');
    expect(selected).toHaveClass('border-border', 'bg-background');
    expect(selected.querySelector('[data-slot=tabs-active-indicator]')).toBeNull();
  });
});

describe('Chat cue (I5)', () => {
  it('should mark Chat while a decision waits there and another surface has the sheet, keeping its name', () => {
    const { rerender } = render(
      <ChatInterfaceNav
        activeTab='parameters'
        chatCue={{ tone: 'attention', description: 'A chat needs you' }}
        onTabChange={vi.fn()}
      />,
    );
    const chat = within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'Chat' });
    expect(chat).toHaveAccessibleName('Chat');
    expect(chat).toHaveAccessibleDescription('A chat needs you');
    expect(chat.querySelector('[data-slot=destination-cue]')).toHaveAttribute('data-tone', 'attention');

    // On the chat itself the decision is in view; the nav says nothing more (I4).
    rerender(
      <ChatInterfaceNav
        activeTab='chat'
        chatCue={{ tone: 'attention', description: 'A chat needs you' }}
        onTabChange={vi.fn()}
      />,
    );
    const shown = within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'Chat' });
    expect(shown).not.toHaveAccessibleDescription();
    expect(shown.querySelector('[data-slot=destination-cue]')).toBeNull();
  });
});

it('selects existing same-file views and releases the previous viewer subscriptions', async () => {
  const frontApi = mock<DockviewPanelApi>({ setActive: vi.fn() });
  const rightApi = mock<DockviewPanelApi>({ setActive: vi.fn() });
  Object.defineProperty(frontApi, 'title', { value: 'main.ts' });
  Object.defineProperty(rightApi, 'title', { value: 'main.ts' });
  const front = mock<IDockviewPanel>({ id: 'front' });
  const right = mock<IDockviewPanel>({ id: 'right' });
  Object.defineProperty(front, 'api', { value: frontApi });
  Object.defineProperty(right, 'api', { value: rightApi });
  const api = mock<DockviewApi>();
  const dispose = vi.fn();
  for (const event of [
    'onDidAddPanel',
    'onDidRemovePanel',
    'onDidActivePanelChange',
    'onDidLayoutFromJSON',
    'onDidLayoutChange',
  ] as const) {
    Object.defineProperty(api, event, { value: () => ({ dispose }) });
  }
  Object.defineProperties(api, { panels: { value: [front, right] }, activePanel: { value: front } });
  const onTabChange = vi.fn();
  const view = render(
    <ChatInterfaceNav
      activeTab='viewer'
      onTabChange={onTabChange}
      viewerApi={api}
      viewerNames={
        new Map([
          ['front', 'Front inspection'],
          ['right', 'Right inspection'],
        ])
      }
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  const choices = within(screen.getByRole('region', { name: 'Views' }));
  expect(choices.getByRole('button', { name: 'Front inspection · main.ts' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(choices.getByRole('button', { name: 'Right inspection · main.ts' }));
  expect(rightApi.setActive).toHaveBeenCalledOnce();
  expect(frontApi.setActive).not.toHaveBeenCalled();
  expect(onTabChange).toHaveBeenLastCalledWith('viewer');
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'All surfaces' })).not.toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Model' })).toHaveFocus();
  });
  view.rerender(<ChatInterfaceNav activeTab='viewer' onTabChange={onTabChange} />);
  expect(dispose).toHaveBeenCalledTimes(5);
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(screen.queryByRole('region', { name: 'Views' })).not.toBeInTheDocument();
});

it.each([0, 1])('keeps the real file picker available with %i viewer panels', async (count) => {
  const panelApi = mock<DockviewPanelApi>();
  Object.defineProperty(panelApi, 'title', { value: 'main.ts' });
  const panel = mock<IDockviewPanel>({ id: 'existing' });
  Object.defineProperty(panel, 'api', { value: panelApi });
  const api = mock<DockviewApi>();
  for (const event of [
    'onDidAddPanel',
    'onDidRemovePanel',
    'onDidActivePanelChange',
    'onDidLayoutFromJSON',
    'onDidLayoutChange',
  ] as const) {
    Object.defineProperty(api, event, { value: () => ({ dispose: vi.fn() }) });
  }
  Object.defineProperty(api, 'panels', { value: count === 0 ? [] : [panel] });
  const openFile = vi.fn();
  const onTabChange = vi.fn();
  render(
    <ChatInterfaceNav
      activeTab='viewer'
      viewerApi={api}
      onTabChange={onTabChange}
      fileActions={{ openFile, dataSource: createStaticDataSource([{ path: 'main.ts' }]) }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
  const picker = await screen.findByRole('dialog', { name: 'Open File' });
  fireEvent.click(await within(picker).findByRole('option', { name: 'main.ts' }));
  expect(openFile).toHaveBeenCalledExactlyOnceWith('main.ts');
  expect(onTabChange).toHaveBeenLastCalledWith('viewer');
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Model' })).toHaveFocus();
  });
});
