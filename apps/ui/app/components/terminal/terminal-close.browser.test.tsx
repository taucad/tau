import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import '#styles/global.css';
import 'dockview-react/dist/styles/dockview.css';
import axe from 'axe-core';
import { act, cleanup, render as renderReact, screen, within } from '@testing-library/react';
import type { DockviewApi, IDockviewPanelProps } from 'dockview-react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopTerminalBridge, TerminalHostFrame } from '@taucad/types/desktop-terminal';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { Dockview } from '#components/panes/dockview.js';
import { DockviewTab } from '#components/panes/dockview-tab.js';
import { TerminalPane } from '#components/terminal/terminal-pane.js';
import { TerminalCloseContext, useDockviewTerminalCloseHost } from '#components/terminal/terminal-close.js';

const render = (ui: React.ReactNode) => renderReact(ui, { wrapper: KeyboardProvider });

/* T15 in Chromium against the real Dockview: its native tablist Delete/Backspace handler and close glyph. */

const close = vi.fn();
const hide = vi.fn();
let emit: ((frame: TerminalHostFrame) => void) | undefined;
const bridge: DesktopTerminalBridge = {
  open(_request, next) {
    emit = next;
    return { input: vi.fn(), resize: vi.fn(), ack: vi.fn(), requestAccess: vi.fn(), decideAccess: vi.fn(), close };
  },
};

function TerminalPanel({ api }: IDockviewPanelProps): React.JSX.Element {
  const closeHost = useDockviewTerminalCloseHost(api, hide);
  return (
    <TerminalCloseContext.Provider value={closeHost}>
      <TerminalPane availability={{ status: 'available', projectRoot: '/home/me/Tau/bracket', bridge }} />
    </TerminalCloseContext.Provider>
  );
}
const components = {
  notes: (): React.JSX.Element => <p className='p-3'>Notes</p>,
  terminal: TerminalPanel,
};

const prompt = '\u001B[32mme@tau\u001B[0m:\u001B[34m~/Tau/bracket\u001B[0m$ ';

const audit = async (container: HTMLElement): Promise<void> => {
  const result = await axe.run(container, { rules: { region: { enabled: false } } });
  expect(result.violations).toEqual([]);
};

const shot = async (name: string, theme: string): Promise<void> => {
  await page.screenshot({ path: `../../../../../out/t15/screenshots/${name}-${theme}.png` });
};

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  emit = undefined;
  close.mockClear();
  hide.mockClear();
});

const mount = async (theme: string, width: number): Promise<{ api: DockviewApi; container: HTMLElement }> => {
  await page.viewport(width, 520);
  document.documentElement.classList.toggle('dark', theme === 'dark');
  let api: DockviewApi | undefined;
  const { container } = render(
    <TooltipProvider>
      <div className='bg-background text-foreground' style={{ width, height: 500 }}>
        <Dockview
          components={components}
          defaultTabComponent={DockviewTab}
          onReady={(event) => {
            api = event.api;
            event.api.addPanel({ id: 'notes', component: 'notes', title: 'Notes' });
            event.api.addPanel({ id: 'workbench:terminal', component: 'terminal', title: 'Terminal' });
          }}
        />
      </div>
    </TooltipProvider>,
  );
  await vi.waitFor(() => {
    expect(api).toBeDefined();
  });
  await vi.waitFor(() => {
    expect(emit).toBeDefined();
    expect(container.querySelector('canvas')).not.toBeNull();
  });
  act(() => {
    emit?.({
      type: 'opened',
      session: { id: 's1', projectLabel: 'bracket', access: { read: [], write: [], domains: [] } },
    });
    emit?.({ type: 'output', data: `\r\n${prompt}`, offset: prompt.length + 2 });
  });
  return { api: api!, container };
};

const terminalTab = (): HTMLElement => screen.getByRole('tab', { name: 'Terminal' });
const decision = (): HTMLElement => screen.getByRole('alertdialog', { name: 'Close the Terminal in bracket?' });

describe.each(['light', 'dark'])('Terminal close in Dockview (%s)', (theme) => {
  it('holds Delete on the Terminal tab for the person, and leaves other tabs to Dockview', async () => {
    const { api, container } = await mount(theme, 375);
    terminalTab().focus();
    await userEvent.keyboard('{Delete}');

    expect(api.panels.map((panel) => panel.id)).toEqual(['notes', 'workbench:terminal']);
    expect(close).not.toHaveBeenCalled();
    expect(within(decision()).getByRole('button', { name: 'Keep open' })).toHaveFocus();
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    /* Scoped to the card: Dockview labels its group region with the active tab's title, which repeats the pane's own
     * "Terminal" region name in any workbench (a pre-existing landmark-unique finding outside this card). */
    await audit(decision());
    expect(container.contains(decision())).toBe(true);
    await shot('t15-close-decision-375', theme);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.panels).toHaveLength(2);

    terminalTab().focus();
    await userEvent.keyboard('{Backspace}');
    expect(decision()).toBeInTheDocument();
    await userEvent.click(within(decision()).getByRole('button', { name: 'Hide' }));
    expect(hide).toHaveBeenCalledOnce();
    expect(api.panels).toHaveLength(2);
    expect(close).not.toHaveBeenCalled();

    screen.getByRole('tab', { name: 'Notes' }).focus();
    await userEvent.keyboard('{Delete}');
    expect(api.panels.map((panel) => panel.id)).toEqual(['workbench:terminal']);
  });

  it('asks from the close glyph and removes the pane only on Close and stop', async () => {
    const { api } = await mount(theme, 900);
    const glyph = terminalTab().querySelector<HTMLElement>('.dv-default-tab-action')!;
    await userEvent.click(glyph);
    expect(api.panels).toHaveLength(2);
    await shot('t15-close-decision-900', theme);

    await userEvent.click(within(decision()).getByRole('button', { name: 'Close and stop' }));
    expect(close).toHaveBeenCalledOnce();
    expect(api.panels.map((panel) => panel.id)).toEqual(['notes']);
  });
});
