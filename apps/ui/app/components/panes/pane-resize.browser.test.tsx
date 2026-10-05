import '#styles/global.css';
import 'allotment/dist/style.css';
import 'dockview-react/dist/styles/dockview.css';
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import type { AllotmentHandle } from 'allotment';
import type { DockviewApi, IDockviewPanelProps, IPaneviewPanelProps, PaneviewApi } from 'dockview-react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Allotment } from '#components/panes/allotment.js';
import { Dockview } from '#components/panes/dockview.js';
import { Paneview } from '#components/panes/paneview.js';
import {
  PaneviewHeader,
  paneviewAttachedBodyClassName,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#components/panes/paneview-header.js';

declare module 'vitest/internal/browser' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Augments the installed browser command registry.
  interface BrowserCommands {
    resizePointer(phase: 'down' | 'move' | 'up', point: { x: number; y: number }): Promise<void>;
    resizeTouch(phase: 'start' | 'cancel', point: { x: number; y: number }): Promise<void>;
    resizeEnvironment(reduced: boolean, coarse: boolean): Promise<void>;
  }
}

const SectionHeader = ({ api, params }: IPaneviewPanelProps<{ title: string }>): React.JSX.Element => (
  <PaneviewHeader api={api} title={params.title} />
);
const SectionBody = ({ params }: IPaneviewPanelProps<{ title: string }>): React.JSX.Element => (
  <section aria-label={params.title} className={`${paneviewAttachedBodyClassName} h-full`}>
    Section content
  </section>
);
const DockBody = (): React.JSX.Element => <div className='h-full bg-background'>Pane content</div>;
const sectionComponents = { body: SectionBody };
const sectionHeaders = { header: SectionHeader };
const dockComponents = { body: DockBody };
const ComposedSections = ({
  params,
}: IDockviewPanelProps<{ ready: (api: PaneviewApi) => void }>): React.JSX.Element => (
  <Paneview
    className={paneviewAttachedSurfaceStyleOverrides}
    components={sectionComponents}
    headerComponents={sectionHeaders}
    onReady={({ api }) => {
      for (const title of ['main.py', 'Properties']) {
        api.addPanel({
          id: title,
          title,
          component: 'body',
          headerComponent: 'header',
          headerSize: paneviewHeaderSize,
          minimumBodySize: 80,
          isExpanded: true,
          size: 200,
          params: { title },
        });
      }
      params.ready(api);
    }}
  />
);
const composedComponents = { sections: ComposedSections, body: DockBody };
const size = { width: 800, height: 600 };

beforeEach(async () => {
  await page.viewport(1000, 800);
});

afterEach(async () => {
  await commands.resizePointer('up', { x: 0, y: 0 });
  await commands.resizeEnvironment(false, false);
  cleanup();
  document.documentElement.className = '';
  document.documentElement.style.removeProperty('--primary');
  document.documentElement.style.fontSize = '';
});

async function separator(name: RegExp): Promise<HTMLElement> {
  const sash = await screen.findByRole('separator', { name });
  await waitFor(() => {
    expect(Number(sash.getAttribute('aria-valuenow'))).toBeGreaterThan(100);
  });
  return sash;
}

async function drag(sash: HTMLElement): Promise<void> {
  const rect = sash.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const vertical = sash.getAttribute('aria-orientation') === 'vertical';
  const initial = Number(sash.getAttribute('aria-valuenow'));
  await commands.resizePointer('down', { x, y });
  expect(sash.dataset['resizeDragging']).toBe('true');
  const paint = getComputedStyle(sash, '::after');
  expect(paint.content).not.toBe('none');
  expect(paint.visibility).toBe('visible');
  expect(paint.opacity).toBe('1');
  expect(vertical ? paint.width : paint.height).toBe('2px');
  await commands.resizePointer('move', { x: x + (vertical ? 40 : 0), y: y + (vertical ? 0 : 40) });
  await waitFor(() => {
    expect(Number(sash.getAttribute('aria-valuenow'))).toBeGreaterThan(initial + 25);
  });
  await commands.resizePointer('up', { x: x + 40, y: y + 40 });
  expect(sash.dataset['resizeDragging']).toBeUndefined();
}

describe('native pane resize boundaries', () => {
  it.each([false, true])('should resize outer panes with pointer and keyboard in vertical=%s', async (vertical) => {
    const persisted = vi.fn();
    const ref = createRef<AllotmentHandle>();
    const fixture = (visible = true): React.JSX.Element => (
      <div style={size}>
        <Allotment ref={ref} vertical={vertical} paneLabels={['Chat', 'Viewer']} onDragEnd={persisted}>
          <Allotment.Pane minSize={100} maxSize={500} preferredSize={200} visible={visible}>
            Chat
          </Allotment.Pane>
          <Allotment.Pane minSize={100}>Viewer</Allotment.Pane>
        </Allotment>
      </div>
    );
    const view = render(fixture());
    const sash = await separator(/Resize Chat and Viewer panes/);
    expect(sash.getAttribute('aria-orientation')).toBe(vertical ? 'horizontal' : 'vertical');
    await drag(sash);
    const value = Number(sash.getAttribute('aria-valuenow'));
    sash.focus();
    await userEvent.keyboard(vertical ? '{ArrowDown}' : '{ArrowRight}');
    await waitFor(() => {
      expect(Number(sash.getAttribute('aria-valuenow'))).toBe(value + 8);
    });
    expect(persisted).toHaveBeenCalled();
    expect(getComputedStyle(sash).outlineStyle).not.toBe('none');
    await userEvent.keyboard('{Home}');
    await waitFor(() => {
      expect(sash.getAttribute('aria-valuenow')).toBe(sash.getAttribute('aria-valuemin'));
    });
    await userEvent.keyboard('{End}');
    await waitFor(() => {
      expect(sash.getAttribute('aria-valuenow')).toBe(sash.getAttribute('aria-valuemax'));
    });
    await userEvent.dblClick(sash);
    await waitFor(() => {
      expect(sash.getAttribute('aria-valuenow')).toBe('200');
    });
    view.rerender(fixture(false));
    await waitFor(() => {
      expect(sash.getAttribute('aria-disabled')).toBe('true');
    });
    expect(sash.tabIndex).toBe(-1);
    view.rerender(fixture());
    await waitFor(() => {
      expect(sash.getAttribute('aria-disabled')).toBe('false');
    });
    ref.current?.resize([230, (vertical ? size.height : size.width) - 230]);
    await waitFor(() => {
      expect(sash.getAttribute('aria-valuenow')).toBe('230');
    });
  });

  it('should click an overlapping shared menu above a native section sash and retain real resizing', async () => {
    let sectionApi: PaneviewApi | undefined;
    render(
      <TooltipProvider>
        <div style={size}>
          <Dockview
            components={composedComponents}
            onReady={({ api }) => {
              api.addPanel({
                id: 'model',
                title: 'Model',
                component: 'sections',
                params: {
                  ready: (value: PaneviewApi) => {
                    sectionApi = value;
                  },
                },
              });
            }}
          />
        </div>
      </TooltipProvider>,
    );
    const sash = await separator(/Resize main.py and Properties sections/);
    if (!sectionApi) {
      throw new Error('Expected the actual nested Model section owner.');
    }
    const api = sectionApi;
    const rect = sash.getBoundingClientRect();
    const selected = vi.fn<() => void>();
    const menu = (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            style={{
              position: 'fixed',
              left: rect.right + 16,
              top: rect.top + rect.height / 2,
              transform: 'translateY(-50%)',
            }}
          >
            Part actions
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='left' align='center'>
          <DropdownMenuItem onSelect={selected}>Focus on part</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    render(menu);
    await userEvent.click(screen.getByRole('button', { name: 'Part actions' }));
    const item = await screen.findByRole('menuitem', { name: 'Focus on part' });
    await waitFor(() => {
      const positioned = item.getBoundingClientRect();
      const centerY = positioned.top + positioned.height / 2;
      expect(centerY).toBeGreaterThanOrEqual(rect.top);
      expect(centerY).toBeLessThan(rect.bottom);
    });
    const positioned = item.getBoundingClientRect();
    const point = { x: positioned.left + positioned.width / 2, y: positioned.top + positioned.height / 2 };
    expect(point.x).toBeGreaterThan(rect.left);
    expect(point.x).toBeLessThan(rect.right);
    const hit = document.elementFromPoint(point.x, point.y);
    expect(hit !== null && item.contains(hit)).toBe(true);
    const layout = api.toJSON();
    const value = sash.getAttribute('aria-valuenow');
    await userEvent.click(item);
    expect(selected).toHaveBeenCalledOnce();
    expect(api.toJSON()).toEqual(layout);
    expect(sash.getAttribute('aria-valuenow')).toBe(value);
    expect(sash.dataset['resizeDragging']).toBeUndefined();
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Focus on part' })).toBeNull();
    });
    await drag(sash);
    const moved = Number(sash.getAttribute('aria-valuenow'));
    sash.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(Number(sash.getAttribute('aria-valuenow'))).toBe(moved + 8);
    });
    expect(getComputedStyle(sash, '::after').opacity).toBe('1');
    expect(sash.getAttribute('aria-disabled')).toBe('false');
    expect(selected).toHaveBeenCalledOnce();
  });

  it('should resize both Dockview axes and retain sizes through native restoration', async () => {
    let api: DockviewApi | undefined;
    render(
      <div style={size}>
        <Dockview
          components={dockComponents}
          onReady={(event) => {
            api = event.api;
            const first = api.addPanel({ id: 'code', title: 'Code', component: 'body', minimumWidth: 100 });
            api.addPanel({
              id: 'model',
              title: 'Model',
              component: 'body',
              position: { referencePanel: first.id, direction: 'right' },
              minimumWidth: 100,
            });
            api.addPanel({
              id: 'parameters',
              title: 'Parameters',
              component: 'body',
              position: { referencePanel: first.id, direction: 'below' },
              minimumHeight: 80,
            });
          }}
        />
      </div>,
    );
    api!.addPanel({
      id: 'console',
      title: 'Console',
      component: 'body',
      position: { referencePanel: 'code', direction: 'right' },
      minimumWidth: 120,
    });
    const column = await separator(/Resize Code, Parameters, Console and Model panes/);
    expect(Number(column.getAttribute('aria-valuemin'))).toBe(220);
    const row = await separator(/Resize Code, Console and Parameters panes/);
    await drag(column);
    await drag(row);
    // Native sizing and focus changes must finish before the next axis.
    /* oxlint-disable no-await-in-loop -- Sequential native interaction acceptance. */
    for (const sash of [column, row]) {
      const initial = Number(sash.getAttribute('aria-valuenow'));
      sash.focus();
      await userEvent.keyboard(sash === column ? '{ArrowRight}' : '{ArrowDown}');
      await waitFor(() => {
        expect(Number(sash.getAttribute('aria-valuenow'))).toBe(initial + 8);
      });
    }
    /* oxlint-enable no-await-in-loop -- Sequential native interactions complete. */
    const layout = api!.toJSON();
    const widths = api!.groups
      .map((group) => ({ title: group.activePanel?.title ?? group.id, width: group.width }))
      .sort((a, b) => a.title.localeCompare(b.title));
    api!.fromJSON(layout);
    await waitFor(() => {
      expect(
        api!.groups
          .map((group) => ({ title: group.activePanel?.title ?? group.id, width: group.width }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      ).toEqual(widths);
    });
    const restored = await separator(/Resize .*Code.* and Model panes/);
    expect(restored.getAttribute('aria-disabled')).toBe('false');
  });

  it.each(['', 'dark', 'dark black', 'high-contrast', 'dark high-contrast'])(
    'should center subtle section pills and preserve disclosure in theme %s',
    async (theme) => {
      document.documentElement.className = theme;
      let api: PaneviewApi | undefined;
      render(
        <TooltipProvider>
          <div style={{ width: 320, height: 600 }}>
            <Paneview
              className={paneviewAttachedSurfaceStyleOverrides}
              components={sectionComponents}
              headerComponents={sectionHeaders}
              onReady={(event) => {
                api = event.api;
                for (const title of ['main.py', 'Properties', 'carrier.py']) {
                  api.addPanel({
                    id: title,
                    title,
                    component: 'body',
                    headerComponent: 'header',
                    headerSize: paneviewHeaderSize,
                    minimumBodySize: 80,
                    isExpanded: true,
                    size: 190,
                    params: { title },
                  });
                }
              }}
            />
          </div>
        </TooltipProvider>,
      );
      const sash = await separator(/Resize main.py and Properties sections/);
      const rect = sash.getBoundingClientRect();
      const headers = screen.getAllByRole('button', { name: /main.py|Properties|carrier.py/ });
      const before = headers[0]!.closest<HTMLElement>('.dv-view')!.getBoundingClientRect();
      const nextHeader = headers[1]!.closest<HTMLElement>('[data-slot=paneview-header]')!.getBoundingClientRect();
      expect(rect.y).toBeCloseTo(before.bottom, 0);
      expect(nextHeader.top - before.bottom).toBe(8);
      expect(rect.y + rect.height / 2).toBe(before.bottom + 4);
      const idle = getComputedStyle(sash, '::after');
      expect(idle.width).toBe('48px');
      expect(idle.height).toBe('2px');
      await commands.resizePointer('move', { x: rect.x + 32, y: rect.y - 32 });
      await waitFor(() => {
        expect(getComputedStyle(sash, '::after').opacity).toBe('0');
      });
      const idleColor = idle.backgroundColor;
      document.documentElement.style.setProperty('--primary', 'red');
      expect(getComputedStyle(sash, '::after').backgroundColor).toBe(idleColor);
      // The whole divider gap reveals the pill, including points away from its center paint.
      await commands.resizePointer('move', { x: rect.x + 32, y: rect.y + 1 });
      await waitFor(() => {
        expect(getComputedStyle(sash, '::after').opacity).toBe('1');
      });
      const hoverColor = getComputedStyle(sash, '::after').backgroundColor;
      if (!theme.includes('high-contrast')) {
        expect(hoverColor).not.toBe(idleColor);
      }
      await commands.resizePointer('move', { x: rect.x + 32, y: rect.y - 32 });
      await waitFor(() => {
        expect(getComputedStyle(sash, '::after').opacity).toBe('0');
      });
      const initial = Number(sash.getAttribute('aria-valuenow'));
      await commands.resizePointer('down', { x: rect.x + rect.width / 2, y: rect.y + 4 });
      expect(getComputedStyle(sash, '::after').opacity).toBe('1');
      expect(getComputedStyle(sash, '::after').transform).toContain('1.33333');
      await commands.resizePointer('move', { x: rect.x + rect.width / 2, y: rect.y + 36 });
      await waitFor(() => {
        expect(Number(sash.getAttribute('aria-valuenow'))).toBeGreaterThan(initial + 20);
      });
      expect(getComputedStyle(sash, '::after').opacity).toBe('1');
      await commands.resizePointer('up', { x: 0, y: 0 });
      sash.focus();
      const moved = Number(sash.getAttribute('aria-valuenow'));
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => {
        expect(Number(sash.getAttribute('aria-valuenow'))).toBe(moved - 8);
        expect(getComputedStyle(sash, '::after').opacity).toBe('1');
      });
      await commands.resizeEnvironment(true, true);
      expect(matchMedia('(pointer: coarse)').matches).toBe(true);
      expect(Number.parseFloat(getComputedStyle(sash, '::before').top)).toBeLessThanOrEqual(-8);
      expect(getComputedStyle(sash, '::after').transitionDuration).toBe('1e-05s');
      await page.screenshot({
        element: screen.getAllByText('Section content')[0]!.closest<HTMLElement>('[data-resize-owner]')!,
        path: `../../../../../out/test-results/pane-resize/section-${theme.replaceAll(' ', '-') || 'light'}.png`,
      });
      api!.panels[0]!.api.setExpanded(false);
      api!.panels[1]!.api.setExpanded(false);
      await waitFor(() => {
        expect(sash.getAttribute('aria-disabled')).toBe('true');
      });
      expect(getComputedStyle(sash, '::after').opacity).toBe('0');
      await waitFor(() => {
        expect(screen.queryByRole('region', { name: 'main.py' })).toBeNull();
      });
      api!.panels[0]!.api.setExpanded(true);
      await waitFor(() => {
        expect(sash.getAttribute('aria-disabled')).toBe('false');
      });
    },
  );

  it('should keep nested section paint isolated at 200% text and expose coarse targets for all engines', async () => {
    document.documentElement.style.fontSize = '200%';
    let sectionApi: PaneviewApi | undefined;
    render(
      <TooltipProvider>
        <div style={size}>
          <Allotment paneLabels={['Sidebar', 'Content']}>
            <Allotment.Pane minSize={80}>Sidebar</Allotment.Pane>
            <Allotment.Pane minSize={400}>
              <Dockview
                components={composedComponents}
                onReady={({ api }) => {
                  const model = api.addPanel({
                    id: 'model',
                    title: 'Model',
                    component: 'sections',
                    params: {
                      ready: (value: PaneviewApi) => {
                        sectionApi = value;
                      },
                    },
                  });
                  api.addPanel({
                    id: 'code',
                    title: 'Code',
                    component: 'body',
                    position: { referencePanel: model.id, direction: 'right' },
                  });
                }}
              />
            </Allotment.Pane>
          </Allotment>
        </div>
      </TooltipProvider>,
    );
    const section = await separator(/Resize main.py and Properties sections/);
    const dock = await separator(/Resize Model and Code panes/);
    const outer = await separator(/Resize Sidebar and Content panes/);
    expect(getComputedStyle(section, '::after').backgroundImage).toBe('none');
    await userEvent.hover(dock);
    expect(getComputedStyle(dock, '::after').backgroundImage).toContain('linear-gradient');
    expect(getComputedStyle(dock, '::after').content).not.toBe('none');
    expect(getComputedStyle(dock, '::after').visibility).toBe('visible');
    const header = screen
      .getByRole('button', { name: 'Properties' })
      .closest<HTMLElement>('[data-slot=paneview-header]')!
      .getBoundingClientRect();
    const body = screen
      .getByRole('button', { name: 'main.py' })
      .closest<HTMLElement>('.dv-view')!
      .getBoundingClientRect();
    const rect = section.getBoundingClientRect();
    expect(header.top - body.bottom).toBe(16);
    expect(rect.top + rect.height / 2).toBe(body.bottom + 8);
    section.focus();
    const before = Number(section.getAttribute('aria-valuenow'));
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(Number(section.getAttribute('aria-valuenow'))).toBe(before + 8);
    });
    await commands.resizeEnvironment(true, true);
    expect(getComputedStyle(outer, '::before').pointerEvents).toBe('auto');
    expect(Number.parseFloat(getComputedStyle(outer, '::before').width)).toBeGreaterThanOrEqual(24);
    expect(Number.parseFloat(getComputedStyle(dock, '::before').left)).toBeLessThanOrEqual(-10);
    const layout = sectionApi!.toJSON();
    sectionApi!.fromJSON(layout);
    const restored = await separator(/Resize main.py and Properties sections/);
    expect(restored.getAttribute('aria-valuenow')).toBe(String(before + 8));
    await page.screenshot({
      element: outer.closest<HTMLElement>('[data-resize-owner]')!,
      path: '../../../../../out/test-results/pane-resize/composed-text-200-percent.png',
    });
  });

  it('should clear pressed feedback on every termination path and unmount', async () => {
    const view = render(
      <div style={size}>
        <Allotment paneLabels={['Sidebar', 'Content']}>
          <Allotment.Pane>Sidebar</Allotment.Pane>
          <Allotment.Pane>Content</Allotment.Pane>
        </Allotment>
      </div>,
    );
    const sash = await separator(/Resize Sidebar and Content/);
    const rect = sash.getBoundingClientRect();
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    /* oxlint-disable no-await-in-loop -- Each termination starts a new real pointer gesture. */
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'contextmenu']) {
      await commands.resizePointer('down', point);
      expect(sash.dataset['resizeDragging']).toBe('true');
      if (event === 'pointerup') {
        await commands.resizePointer('up', point);
      } else {
        document.dispatchEvent(new Event(event));
      }
      expect(sash.dataset['resizeDragging']).toBeUndefined();
      const value = sash.getAttribute('aria-valuenow');
      await commands.resizePointer('move', { x: point.x + 20, y: point.y + 20 });
      expect(sash.getAttribute('aria-valuenow')).toBe(value);
      await commands.resizePointer('up', point);
    }
    /* oxlint-enable no-await-in-loop -- Sequential native interactions complete. */
    await commands.resizePointer('down', point);
    globalThis.dispatchEvent(new Event('blur'));
    expect(sash.dataset['resizeDragging']).toBeUndefined();
    await commands.resizePointer('up', point);
    await commands.resizeEnvironment(false, true);
    await commands.resizeTouch('start', point);
    expect(sash.dataset['resizeDragging']).toBe('true');
    await commands.resizeTouch('cancel', point);
    expect(sash.dataset['resizeDragging']).toBeUndefined();
    await commands.resizeEnvironment(false, false);
    await commands.resizePointer('down', point);
    view.unmount();
    expect(sash.dataset['resizeDragging']).toBeUndefined();
    fireEvent.pointerDown(sash, { button: 0 });
    expect(sash.dataset['resizeDragging']).toBeUndefined();
  });
});
