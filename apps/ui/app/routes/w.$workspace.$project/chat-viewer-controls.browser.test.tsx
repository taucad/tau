import '#styles/global.css';
import { cleanup, render, screen, within } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { GraphicsProvider } from '@taucad/viewer/hooks/use-graphics';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { ViewerStage } from '@taucad/workbench-panes/shell/viewer-stage';

const editorRef = vi.hoisted(() => ({
  getSnapshot: () => ({ context: { focusedChatId: 'chat-browser' } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ editorRef }) }));
// The shared Capture button as the app renders it, without the chat draft and headless renderer behind it.
vi.mock('#components/geometry/cad/capture-view-control.js', async () => {
  const { CaptureViewControl } = await import('@taucad/workbench-panes/shell/capture-view-control');
  return {
    CaptureViewControl: () => (
      <CaptureViewControl label='Capture view to chat' doneLabel='Added to chat' onCapture={async () => true} />
    ),
  };
});

const { ChatViewerControls } = await import('#routes/w.$workspace.$project/chat-viewer-controls.js');
const { ArButton, ArControl } = await import('#components/cad/ar-button.js');

type GraphicsActor = Actor<typeof graphicsMachine>;
type Box = Readonly<{ left: number; top: number; right: number; bottom: number; width: number; height: number }>;

const actors: GraphicsActor[] = [];

afterEach(() => {
  cleanup();
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

const startGraphics = (): GraphicsActor => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
  // A drawn model, so Capture is live as it is over a real part.
  actor.send({
    type: 'updateArtifact',
    artifact: { mimeType: 'model/gltf-binary', content: new Uint8Array() },
    hash: 'browser-model',
  });
  actors.push(actor);
  return actor;
};

/**
 * The project viewer's stage as the route draws it: the canvas region with a model image inside, and the bar in the
 * stage's bottom slot. `mobileAction` is what the route hands the bar for AR.
 */
const renderStage = ({
  height,
  mobileAction,
  aboveControls,
}: {
  readonly height: number;
  readonly mobileAction?: React.ReactNode;
  readonly aboveControls?: React.ReactNode;
}): GraphicsActor => {
  const actor = startGraphics();
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <GraphicsProvider graphicsRef={actor}>
          <div data-testid='stage' style={{ width: '100%', height }}>
            <ViewerStage
              graphicsRef={actor}
              regionId='browser-viewer-canvas'
              renderCanvas={() => <div role='img' aria-label='3D model preview' className='size-full' />}
              controls={<ChatViewerControls mobileAction={mobileAction} aboveControls={aboveControls} />}
            />
          </div>
        </GraphicsProvider>
      </TooltipProvider>
    </KeyboardProvider>,
  );
  return actor;
};

const box = (element: Element): Box => {
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
  return { left, top, right, bottom, width, height };
};
const controlsGroup = (): HTMLElement => screen.getByRole('group', { name: 'Viewer controls' });
const controlButtons = (): HTMLElement[] => within(controlsGroup()).getAllByRole('button');
const controlNames = (): string[] => controlButtons().map((button) => button.getAttribute('aria-label') ?? '');
const frame = (): HTMLElement => screen.getByTestId('stage').querySelector<HTMLElement>('[data-viewer-frame]')!;
const bar = (): HTMLElement => controlsGroup().closest<HTMLElement>('[data-slot="viewer-controls"]')!;
/** The bar's sections as its visible hairlines divide them, each a list of button names. */
const sections = (): string[][] => {
  const result: string[][] = [[]];
  for (const element of controlsGroup().querySelectorAll('button, [data-orientation="vertical"]')) {
    if (element.tagName === 'BUTTON') {
      result.at(-1)!.push(element.getAttribute('aria-label') ?? '');
    } else if (getComputedStyle(element).display !== 'none') {
      result.push([]);
    }
  }
  return result.filter((section) => section.length > 0);
};

const phoneWidths = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
] as const;

describe('Viewer controls on phones in Chromium', () => {
  it.each(phoneWidths)(
    'centres one group of 28px controls, Grid · Section, Measure · Fit, AR · Viewer settings, at $width px',
    async ({ width, height }) => {
      await page.viewport(width, height);
      renderStage({ height: 360, mobileAction: <ArControl onActivate={() => undefined} /> });

      // Grid is its glyph; the readout lives in its name and tooltip. Capture keeps its own section before Settings.
      expect(controlNames()).toEqual([
        'Grid 1 mm, units and grid',
        'Section view',
        'Measure',
        'Fit view',
        'View in your space',
        'Capture view to chat',
        'Viewer settings',
      ]);
      expect(controlNames()).not.toContain('Enter fullscreen');
      expect(sections()).toEqual([
        ['Grid 1 mm, units and grid'],
        ['Section view', 'Measure'],
        ['Fit view', 'View in your space'],
        ['Capture view to chat'],
        ['Viewer settings'],
      ]);
      for (const button of controlButtons()) {
        const { width: buttonWidth, height: buttonHeight } = box(button);
        expect([button.getAttribute('aria-label'), buttonWidth, buttonHeight]).toEqual([
          button.getAttribute('aria-label'),
          28,
          28,
        ]);
      }

      // One line, centred on the stage, inside it, with nothing scrolling sideways.
      const group = box(controlsGroup());
      const stage = box(frame());
      expect(Math.abs((group.left + group.right) / 2 - (stage.left + stage.right) / 2)).toBeLessThanOrEqual(1);
      expect(group.height).toBeLessThanOrEqual(32);
      expect(group.left).toBeGreaterThanOrEqual(stage.left);
      expect(group.right).toBeLessThanOrEqual(stage.right);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      // Neighbouring targets never overlap.
      const boxes = controlButtons().map((button) => box(button));
      for (const [index, current] of boxes.entries()) {
        const next = boxes[index + 1];
        if (next) {
          expect(next.left).toBeGreaterThanOrEqual(current.right);
        }
      }

      // The model image never wraps the controls (they are not hidden inside an image's name).
      expect(screen.getByRole('img', { name: '3D model preview' })).toBeInTheDocument();
      for (const button of controlButtons()) {
        expect(button.closest('[role="img"]')).toBeNull();
      }
    },
  );

  it('names AR, its tooltip and its accessible name alike, "View in your space"', async () => {
    await page.viewport(390, 844);
    renderStage({ height: 360, mobileAction: <ArControl onActivate={() => undefined} /> });

    const ar = screen.getByRole('button', { name: 'View in your space' });
    // Icon only: no text beside the glyph, whose own "AR" mark sits inside the hidden SVG.
    expect(ar.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(ar.textContent).toBe('AR');
    await userEvent.hover(ar);
    expect(await screen.findByRole('tooltip', { name: 'View in your space' })).toBeInTheDocument();
  });

  it('leaves AR out where it cannot launch, keeping the rest centred and without fullscreen', async () => {
    await page.viewport(320, 640);
    // The route's own AR button: Chromium has no Quick Look and there is no runtime document to export from.
    renderStage({ height: 360, mobileAction: <ArButton artifact={undefined} /> });

    expect(controlNames()).toEqual([
      'Grid 1 mm, units and grid',
      'Section view',
      'Measure',
      'Fit view',
      'Capture view to chat',
      'Viewer settings',
    ]);
    const group = box(controlsGroup());
    const stage = box(frame());
    expect(Math.abs((group.left + group.right) / 2 - (stage.left + stage.right) / 2)).toBeLessThanOrEqual(1);
  });

  it.each(phoneWidths)(
    'keeps running tool rows inside a short stage, scrolling them above a whole controls line, at $width px',
    async ({ width, height }) => {
      await page.viewport(width, height);
      // A stage squeezed by the sheet: too short for both tool rows and the controls line.
      renderStage({ height: 180, mobileAction: <ArControl onActivate={() => undefined} /> });
      await userEvent.click(screen.getByRole('button', { name: 'Section view' }));
      await userEvent.click(screen.getByRole('button', { name: 'Measure' }));
      const sectionRow = screen.getByRole('group', { name: 'Section view options' });
      const measuringRow = screen.getByRole('group', { name: 'Measuring options' });

      const stage = box(frame());
      await expect.poll(() => box(bar()).top).toBeGreaterThanOrEqual(stage.top + 8 - 0.5);
      expect(box(bar()).bottom).toBeLessThanOrEqual(stage.bottom);
      // The controls line stays whole below the rows.
      const group = box(controlsGroup());
      expect(group.top).toBeGreaterThanOrEqual(stage.top);
      expect(group.bottom).toBeLessThanOrEqual(stage.bottom);
      for (const button of controlButtons()) {
        expect(box(button).height).toBe(28);
      }

      // The rows scroll within the space left, never sideways, and each row's Done can be scrolled to and pressed.
      const rows = sectionRow.closest<HTMLElement>('[data-slot="viewer-tool-rows"]')!;
      expect(rows.scrollHeight).toBeGreaterThan(rows.clientHeight);
      expect(rows.scrollWidth).toBeLessThanOrEqual(rows.clientWidth);
      expect(getComputedStyle(rows).overflowY).toBe('auto');
      const measureDone = within(measuringRow).getByRole('button', { name: 'Done with measure' });
      measureDone.scrollIntoView({ block: 'nearest' });
      const reachable = box(measureDone);
      expect(reachable.top).toBeGreaterThanOrEqual(box(rows).top - 0.5);
      expect(reachable.bottom).toBeLessThanOrEqual(box(rows).bottom + 0.5);
      expect(reachable.height).toBeGreaterThanOrEqual(24);
      await userEvent.click(measureDone);
      expect(screen.queryByRole('group', { name: 'Measuring options' })).not.toBeInTheDocument();
      within(sectionRow).getByRole('button', { name: 'Done with section' }).scrollIntoView({ block: 'nearest' });
      await userEvent.click(within(sectionRow).getByRole('button', { name: 'Done with section' }));
      expect(screen.queryByRole('group', { name: 'Section view options' })).not.toBeInTheDocument();
    },
  );
});

/** An open issues list as `ViewerIssues` hands it to the bar: a region whose list scrolls past its own cap. */
const issuesList = (
  <div role='region' aria-label='Issues' className='flex w-full flex-col border-b pb-1'>
    <ul className='max-h-[min(16rem,40svh)] divide-y overflow-y-auto'>
      {Array.from({ length: 12 }, (_, index) => (
        <li key={index} className='py-1.5 pl-2 text-xs'>
          Issue {index + 1}
        </li>
      ))}
    </ul>
  </div>
);

describe('Viewer controls with the issues list on phones in Chromium', () => {
  it('shares a short stage between the issues list and the tool rows, keeping both and the controls line', async () => {
    await page.viewport(320, 640);
    renderStage({ height: 260, aboveControls: issuesList });
    await userEvent.click(screen.getByRole('button', { name: 'Section view' }));
    await userEvent.click(screen.getByRole('button', { name: 'Measure' }));
    const rows = screen
      .getByRole('group', { name: 'Section view options' })
      .closest<HTMLElement>('[data-slot="viewer-tool-rows"]')!;
    const issues = screen.getByRole('region', { name: 'Issues' });

    const stage = box(frame());
    await expect.poll(() => box(bar()).top).toBeGreaterThanOrEqual(stage.top + 8 - 0.5);
    // Nothing spills out of the bar: its sections end inside it, and the controls line is whole below them.
    const barBox = box(bar());
    const group = box(controlsGroup());
    expect(group.bottom).toBeLessThanOrEqual(barBox.bottom);
    expect(box(issues).top).toBeGreaterThanOrEqual(barBox.top);
    expect(box(rows).top).toBeGreaterThanOrEqual(barBox.top);
    for (const button of controlButtons()) {
      expect(box(button).height).toBe(28);
    }
    // Both shrink and scroll; neither is squeezed out.
    expect(rows.clientHeight).toBeGreaterThanOrEqual(28);
    expect(issues.querySelector('ul')!.clientHeight).toBeGreaterThanOrEqual(28);
    expect(rows.scrollHeight + issues.querySelector('ul')!.scrollHeight).toBeGreaterThan(
      rows.clientHeight + issues.querySelector('ul')!.clientHeight,
    );
  });
});

describe('Viewer controls on desktop in Chromium', () => {
  it('keeps the compact controls and the real fullscreen, and no mobile AR', async () => {
    await page.viewport(1280, 800);
    renderStage({ height: 480, mobileAction: <ArControl onActivate={() => undefined} /> });

    expect(controlNames()).toEqual([
      'Grid 1 mm, units and grid',
      'Section view',
      'Measure',
      'Fit view',
      'Enter fullscreen',
      'Capture view to chat',
      'Viewer settings',
    ]);
    for (const button of controlButtons()) {
      expect(box(button).height).toBe(28);
    }
    // Desktop bars are not bounded by the phone measurement.
    expect(bar().style.maxHeight).toBe('');
  });
});
