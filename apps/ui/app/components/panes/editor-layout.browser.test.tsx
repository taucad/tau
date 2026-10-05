import '#styles/global.css';
import 'dockview-react/dist/styles/dockview.css';
import 'allotment/dist/style.css';
import { cleanup, render } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DockviewApi, IDockviewHeaderActionsProps } from 'dockview-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { Allotment } from '#components/panes/allotment.js';
import { Dockview } from '#components/panes/dockview.js';
import { useIsTopLeftGroup, useIsTopRightGroup } from '#components/panes/use-is-top-right-group.js';

const Content = (): React.JSX.Element => <textarea aria-label='Persistent editor' defaultValue='Keep this draft' />;
const components = { content: Content };
const CornerActions = ({ group, containerApi }: IDockviewHeaderActionsProps): React.JSX.Element => {
  const left = useIsTopLeftGroup(group, containerApi);
  const right = useIsTopRightGroup(group, containerApi);
  return (
    <>
      {right ? (
        <button data-corner='right' type='button'>
          Actions
        </button>
      ) : null}
      {left ? <span data-corner='left'>Chat</span> : null}
    </>
  );
};

const createPanels = (api: DockviewApi): void => {
  for (let index = 0; index < 6; index += 1) {
    api.addPanel({ id: `tab-${index}`, component: 'content', title: `File ${index}.tsx` });
  }
};

const Fixture = ({ ready }: { readonly ready: (api: DockviewApi) => void }): React.JSX.Element => {
  const [workbench, setWorkbench] = useState(true);
  const [chat, setChat] = useState(true);
  return (
    <TooltipProvider>
      <button
        type='button'
        onClick={() => {
          setWorkbench(!workbench);
        }}
      >
        Toggle workbench
      </button>
      <button
        type='button'
        onClick={() => {
          setChat(!chat);
        }}
      >
        Toggle chat
      </button>
      <div data-testid='layout-frame' style={{ width: 1100, height: 400 }}>
        <Allotment paneLabels={['Chat', 'Viewer', 'Workbench']} proportionalLayout={false}>
          <Allotment.Pane visible={chat} preferredSize={200} minSize={150}>
            <div>Chat history</div>
          </Allotment.Pane>
          <Allotment.Pane minSize={200}>
            <Dockview
              components={components}
              rightHeaderActionsComponent={CornerActions}
              onReady={({ api }) => {
                createPanels(api);
                ready(api);
              }}
            />
          </Allotment.Pane>
          <Allotment.Pane visible={workbench} preferredSize={350} minSize={200}>
            <div>Workbench</div>
          </Allotment.Pane>
        </Allotment>
      </div>
    </TooltipProvider>
  );
};

const frame = async (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

// Mutate inside a frame, then sample the next frame before deferred resize jobs.
// A prepaint ResizeObserver must already have delivered the new geometry.
const afterLayout = async (change: () => void): Promise<void> => {
  await frame();
  change();
  await frame();
};

afterEach(cleanup);

describe('editor chrome layout stability in Chromium', () => {
  it('should settle nested pane bounds before the next frame during toggles and continuous resize', async () => {
    await page.viewport(1300, 650);
    let api: DockviewApi | undefined;
    const view = render(
      <Fixture
        ready={(value) => {
          api = value;
        }}
      />,
    );
    await vi.waitFor(() => {
      expect(api?.width).toBeGreaterThan(0);
    });
    const root = view.getByTestId('layout-frame');
    const dockview = root.querySelector<HTMLElement>('.dv-dockview')!;
    await frame();
    await frame();
    const errors: string[] = [];
    const onError = (event: ErrorEvent): void => {
      errors.push(event.message);
    };
    globalThis.addEventListener('error', onError);
    try {
      const samples: Array<{ actual: number; expected: number; corners: number }> = [];
      /* oxlint-disable eslint/no-await-in-loop -- Each transition must settle and be sampled before the next mutation. */
      for (const width of [1050, 980, 900, 1100, 1000, 1200, 850, 1150]) {
        await afterLayout(() => {
          root.style.width = `${width}px`;
        });
        samples.push({
          actual: api!.width,
          expected: Math.round(dockview.parentElement!.clientWidth),
          corners: dockview.querySelectorAll('[data-corner=right]').length,
        });
      }
      /* oxlint-enable eslint/no-await-in-loop */
      /* oxlint-disable eslint/no-await-in-loop -- Each transition must settle and be sampled before the next mutation. */
      for (const name of ['Toggle workbench', 'Toggle workbench', 'Toggle chat', 'Toggle chat']) {
        await afterLayout(() => {
          flushSync(() => {
            view.getByRole('button', { name }).click();
          });
        });
        samples.push({
          actual: api!.width,
          expected: Math.round(dockview.parentElement!.clientWidth),
          corners: dockview.querySelectorAll('[data-corner=right]').length,
        });
      }
      /* oxlint-enable eslint/no-await-in-loop */
      expect(samples.map(({ actual, expected }) => actual - expected)).toEqual(samples.map(() => 0));
      expect(samples.map(({ corners }) => corners)).toEqual(samples.map(() => 1));
      expect(errors.filter((message) => message.includes('ResizeObserver'))).toEqual([]);
    } finally {
      globalThis.removeEventListener('error', onError);
    }
  });

  it('should lay out a resized Dockview in its parent resize delivery', async () => {
    let api: DockviewApi | undefined;
    const view = render(
      <TooltipProvider>
        <div data-testid='direct-frame' style={{ width: 800, height: 300 }}>
          <Dockview
            components={components}
            onReady={(event) => {
              api = event.api;
              createPanels(event.api);
            }}
          />
        </div>
      </TooltipProvider>,
    );
    await vi.waitFor(() => {
      expect(api?.width).toBe(800);
    });
    const root = view.getByTestId('direct-frame');
    await afterLayout(() => {
      root.style.width = '350px';
    });
    expect(api!.width).toBe(350);
  });

  it('should resize and reopen a hidden Dockview without remounting its editor in StrictMode', async () => {
    let api: DockviewApi | undefined;
    const view = render(
      <StrictMode>
        <TooltipProvider>
          <div data-testid='hidden-frame' style={{ width: 800, height: 300 }}>
            <Dockview
              components={components}
              rightHeaderActionsComponent={CornerActions}
              onReady={(event) => {
                api = event.api;
                createPanels(event.api);
              }}
            />
          </div>
        </TooltipProvider>
      </StrictMode>,
    );
    await vi.waitFor(() => {
      expect(api?.width).toBe(800);
    });
    const root = view.getByTestId('hidden-frame');
    const editor = root.querySelector('textarea')!;
    editor.value = 'Unsaved work';
    editor.focus();
    await afterLayout(() => {
      root.style.width = '650px';
    });
    expect(api!.width).toBe(650);
    expect(document.activeElement).toBe(editor);
    expect(root.querySelector('textarea')).toBe(editor);
    await afterLayout(() => {
      root.style.display = 'none';
      root.style.width = '450px';
    });
    expect(api!.width).toBe(650);
    await afterLayout(() => {
      root.style.display = '';
    });
    expect(api!.width).toBe(450);
    expect(root.querySelector('textarea')).toBe(editor);
    expect(editor.value).toBe('Unsaved work');
    expect(root.querySelectorAll('[data-corner=right]')).toHaveLength(1);
  });

  it('should keep native sash dragging and keyboard resizing stable', async () => {
    await page.viewport(1300, 650);
    let api: DockviewApi | undefined;
    const view = render(
      <Fixture
        ready={(value) => {
          api = value;
        }}
      />,
    );
    await vi.waitFor(() => {
      expect(api?.width).toBeGreaterThan(0);
    });
    const root = view.getByTestId('layout-frame');
    const sash = await view.findByRole('separator', { name: 'Resize Viewer and Workbench panes' });
    const before = api!.width;
    const rootRect = root.getBoundingClientRect();
    const sashRect = sash.getBoundingClientRect();
    await userEvent.dragAndDrop(sash, root, {
      sourcePosition: { x: sashRect.width / 2, y: 120 },
      targetPosition: { x: sashRect.left - rootRect.left - 80, y: 120 },
    });
    await frame();
    const after = api!.width;
    expect(after).not.toBe(before);
    await frame();
    await frame();
    expect(api!.width).toBe(after);
    sash.focus();
    await userEvent.keyboard('{ArrowRight}');
    await frame();
    expect(api!.width).toBe(after + 8);
    expect(root.querySelectorAll('[data-corner=right]')).toHaveLength(1);
    await page.screenshot({ path: '../../../../../out/test-results/editor-layout/resize-verified.png' });
  });

  it('should keep header action width constant across overflow threshold crossings', async () => {
    await page.viewport(1300, 650);
    let api: DockviewApi | undefined;
    const view = render(
      <TooltipProvider>
        <div data-testid='overflow-frame' style={{ width: 1000, height: 300 }}>
          <Dockview
            components={components}
            rightHeaderActionsComponent={CornerActions}
            onReady={(event) => {
              api = event.api;
              createPanels(event.api);
            }}
          />
        </div>
      </TooltipProvider>,
    );
    await vi.waitFor(() => {
      expect(api?.width).toBe(1000);
    });
    await frame();
    const root = view.getByTestId('overflow-frame');
    const actions = root.querySelector<HTMLElement>('.dv-right-actions-container')!;
    const widths: number[] = [];
    /* oxlint-disable eslint/no-await-in-loop -- Each transition must settle and be sampled before the next mutation. */
    for (const width of [450, 1000, 450, 1000]) {
      await afterLayout(() => {
        root.style.width = `${width}px`;
      });
      widths.push(actions.getBoundingClientRect().width);
      expect(Boolean(root.querySelector('button[aria-label="Open tabs"]'))).toBe(width === 450);
      const first = actions.getBoundingClientRect().width;
      await frame();
      expect(actions.getBoundingClientRect().width).toBe(first);
    }
    /* oxlint-enable eslint/no-await-in-loop */
    expect(new Set(widths).size).toBe(1);
  });

  it('should reveal active tabs before paint without later scroll reversal across splits and restoration', async () => {
    await page.viewport(1300, 650);
    let api: DockviewApi | undefined;
    const view = render(
      <TooltipProvider>
        <div data-testid='scroll-frame' style={{ width: 600, height: 360 }}>
          <Dockview
            components={components}
            rightHeaderActionsComponent={CornerActions}
            onReady={(event) => {
              api = event.api;
              createPanels(event.api);
            }}
          />
        </div>
      </TooltipProvider>,
    );
    await vi.waitFor(() => {
      expect(api?.width).toBe(600);
    });
    const root = view.getByTestId('scroll-frame');
    const tabs = root.querySelector<HTMLElement>('.dv-tabs-container')!;
    const editor = root.querySelector('textarea')!;
    editor.value = 'Unsaved work';
    /* oxlint-disable eslint/no-await-in-loop, eslint/no-loop-func -- Each transition must settle and be sampled before the next mutation. */
    for (const index of [0, 5, 2, 4]) {
      await afterLayout(() => {
        api!.getPanel(`tab-${index}`)!.api.setActive();
      });
      const active = tabs.querySelector<HTMLElement>('.dv-active-tab')!;
      const stripRect = tabs.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      expect(activeRect.left).toBeGreaterThanOrEqual(stripRect.left - 1);
      expect(activeRect.right).toBeLessThanOrEqual(stripRect.right + 1);
      const scroll = tabs.scrollLeft;
      await frame();
      await frame();
      expect(tabs.scrollLeft).toBe(scroll);
    }
    /* oxlint-enable eslint/no-await-in-loop, eslint/no-loop-func */
    const group = api!.activeGroup!;
    await afterLayout(() => {
      api!.addPanel({
        id: 'split',
        component: 'content',
        title: 'Split',
        position: { referenceGroup: group, direction: 'right' },
      });
    });
    expect(root.querySelectorAll('[data-corner=right]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-corner=left]')).toHaveLength(1);
    const saved = api!.toJSON();
    await afterLayout(() => {
      api!.fromJSON(saved);
    });
    expect(root.querySelectorAll('[data-corner=right]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-corner=left]')).toHaveLength(1);
    await afterLayout(() => {
      api!.getPanel('split')!.api.close();
    });
    expect(root.querySelectorAll('[data-corner=right]')).toHaveLength(1);
  });
});
