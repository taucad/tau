import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import '#styles/global.css';
import axe from 'axe-core';
import { act, cleanup, render as renderReact, screen } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { DesktopTerminalBridge, TerminalHostFrame } from '@taucad/types/desktop-terminal';
import { TerminalPane } from '#components/terminal/terminal-pane.js';
import type { TerminalAvailability } from '#components/terminal/terminal-availability.js';

const render = (ui: React.ReactNode) => renderReact(ui, { wrapper: KeyboardProvider });

/** A bridge that records the pane's calls and lets the test speak for the host. */
const createBridge = (): { bridge: DesktopTerminalBridge; emit: (frame: TerminalHostFrame) => void } => {
  let listener: ((frame: TerminalHostFrame) => void) | undefined;
  const bridge: DesktopTerminalBridge = {
    open(_request, next) {
      listener = next;
      return {
        input: vi.fn(),
        resize: vi.fn(),
        ack: vi.fn(),
        requestAccess: vi.fn(),
        decideAccess: vi.fn(),
        close: vi.fn(),
      };
    },
  };
  return {
    bridge,
    emit(frame) {
      act(() => {
        listener?.(frame);
      });
    },
  };
};

const prompt = '\u001B[32mme@tau\u001B[0m:\u001B[34m~/Tau/bracket\u001B[0m$ ';
const session = '\r\n'.concat(
  `${prompt}ls\r\n`,
  'bracket.ts  package.json  tau.json\r\n',
  `${prompt}export GREETING=hello && cd src\r\n`,
  `${prompt}echo $GREETING\r\n`,
  'hello\r\n',
  prompt,
);

const audit = async (container: HTMLElement): Promise<void> => {
  const result = await axe.run(container, { rules: { region: { enabled: false } } });
  expect(result.violations).toEqual([]);
};

const shot = async (name: string, theme: string): Promise<void> => {
  await page.screenshot({ path: `../../../../../out/research/desktop-bash-terminal/w6/${name}-${theme}.png` });
};

beforeEach(async () => {
  await page.viewport(900, 440);
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

describe.each(['light', 'dark'])('Terminal pane screens (%s)', (theme) => {
  const mount = (availability: TerminalAvailability): HTMLElement => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const { container } = render(
      <div className='bg-background text-foreground' style={{ width: 880, height: 420 }}>
        <TerminalPane availability={availability} />
      </div>,
    );
    return container;
  };

  it('autostarts a shell session with a request card', async () => {
    const { bridge, emit } = createBridge();
    const open = vi.spyOn(bridge, 'open');
    const container = mount({ status: 'available', projectRoot: '/home/me/Tau/bracket', bridge });
    await audit(container);
    await shot('01-start', theme);

    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledOnce();
      expect(container.querySelector('canvas')).not.toBeNull();
    });
    emit({
      type: 'opened',
      session: { id: 's1', projectLabel: 'bracket', access: { read: [], write: [], domains: [] } },
    });
    for (const name of ['Screen reader mode', 'Find', 'Restart', 'Request access']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    emit({ type: 'output', data: session, offset: session.length });
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    await audit(container);
    await shot('02-running', theme);

    emit({
      type: 'access-requested',
      requestId: 'host-1',
      access: { read: [], write: ['/home/me/.npm'], domains: ['registry.npmjs.org'] },
      expiresAt: '2026-10-25T17:00:00.000Z',
    });
    expect(screen.getByRole('button', { name: 'Allow and restart' })).toBeInTheDocument();
    await audit(container);
    await shot('03-access-request', theme);

    emit({ type: 'exited', exitCode: 0, signal: null, reason: 'shell-exited' });
    expect(screen.getByRole('button', { name: 'Start a new Terminal' })).toBeInTheDocument();
    await shot('04-ended', theme);
  });

  it('shows a typed host refusal with its recovery', async () => {
    const { bridge, emit } = createBridge();
    const open = vi.spyOn(bridge, 'open');
    const container = mount({ status: 'available', projectRoot: 'C:\\Users\\me\\Tau\\bracket', bridge });
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledOnce();
      expect(container.querySelector('canvas')).not.toBeNull();
    });
    emit({
      type: 'refused',
      code: 'sandbox-unavailable',
      message: 'This computer has no shell sandbox Tau can use yet.',
      recovery: 'Use the typed Tau tools; Tau never starts an uncontained shell.',
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await audit(container);
    await shot('05-refused-sandbox-unavailable', theme);
  });

  it('explains why the pane is unavailable on desktop', async () => {
    const container = mount({
      status: 'unavailable',
      message: 'This project is stored in Tau, not in a folder on this computer, so the Terminal has nowhere to run.',
      recovery: 'Open a project from a folder on this computer to use the Terminal.',
    });
    await audit(container);
    await shot('06-unavailable', theme);
  });
});

it('keeps a narrow Terminal headerless with one caret and keyboard access actions', async () => {
  await page.viewport(375, 600);
  const { bridge, emit } = createBridge();
  const open = vi.spyOn(bridge, 'open');
  const { container } = render(
    <div className='bg-background text-foreground' style={{ width: 375, height: 580 }}>
      <TerminalPane availability={{ status: 'available', projectRoot: '/home/me/Tau/bracket', bridge }} />
    </div>,
  );
  await vi.waitFor(() => {
    expect(open).toHaveBeenCalledOnce();
    expect(container.querySelector('canvas')).not.toBeNull();
  });
  emit({
    type: 'opened',
    session: { id: 'narrow', projectLabel: 'bracket', access: { read: [], write: [], domains: [] } },
  });
  emit({ type: 'output', data: 'prompt> ', offset: 8 });
  const input = screen.getByRole('textbox', { name: 'Terminal' });
  expect(input).toHaveFocus();
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Chromium serializes the required transparent native caret as RGBA.
  expect(getComputedStyle(input).caretColor).toBe('rgba(0, 0, 0, 0)');
  expect(container.querySelector('[data-slot="terminal-chrome"]')).toBeNull();
  expect(screen.queryByText('Screen reader mode')).toBeNull();
  await audit(container);
  await shot('07-narrow-headerless', 'light');
  await userEvent.keyboard('{Shift>}{F10}{/Shift}');
  await page.getByRole('menuitem', { name: 'Request access' }).click();
  expect(screen.getByLabelText('Folders to read')).toHaveFocus();
  expect(screen.getByRole('form', { name: 'Request Terminal access' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Allow and restart' })).toBeNull();
  await audit(container);
  await shot('08-narrow-request-access', 'light');
});

it('keeps the last column of full lines visible when the request card shortens a scrolled Terminal', async () => {
  /* WebGL redraws the whole frame each time; the 2D canvas, used where WebGL is unavailable or lost, keeps what a
   * frame painted until its row is drawn again, so a stray scrollbar stays on screen. */
  const { getContext } = HTMLCanvasElement.prototype;
  const unavailable = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    ...arguments_: Parameters<typeof getContext>
  ) {
    return arguments_[0] === 'webgl2' || arguments_[0] === 'webgl' ? null : Reflect.apply(getContext, this, arguments_);
  } as typeof getContext);
  onTestFinished(() => {
    unavailable.mockRestore();
  });
  const { bridge, emit } = createBridge();
  const open = vi.spyOn(bridge, 'open');
  const { container } = render(
    <div className='bg-background text-foreground' style={{ width: 880, height: 420 }}>
      <TerminalPane availability={{ status: 'available', projectRoot: '/home/me/Tau/bracket', bridge }} />
    </div>,
  );
  await vi.waitFor(() => {
    expect(open).toHaveBeenCalledOnce();
    expect(container.querySelector('canvas')).not.toBeNull();
  });
  emit({
    type: 'opened',
    session: { id: 'card-fit', projectLabel: 'bracket', access: { read: [], write: [], domains: [] } },
  });
  const { resize } = open.mock.results[0]!.value as { resize: ReturnType<typeof vi.fn> };
  /* The grid sizes the pane has sent the host, oldest first. */
  const sizes = (): Array<{ columns: number; rows: number }> =>
    resize.mock.calls.map(([size]) => size as { columns: number; rows: number });
  await vi.waitFor(() => {
    expect(resize).toHaveBeenCalled();
  });
  const { columns, rows: fullRows } = sizes().at(-1)!;
  /* Full-block lines exactly as wide as the grid, more of them than fit, so the Terminal has scrollback. */
  const full = `${Array.from({ length: 30 }, () => '█'.repeat(columns)).join('\r\n')}\r\n`;
  emit({ type: 'output', data: full, offset: full.length });

  const canvas = container.querySelector('canvas')!;
  const host = container.querySelector<HTMLElement>('[data-slot="terminal"]')!;
  const context = canvas.getContext('2d')!;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  /* Whether row `row` shows ink at the middle of its first cell and 2px inside its last cell's right edge; the
   * cursor's empty last row gives the background. */
  const inked = (row: number, rows: number): [boolean, boolean] => {
    const { width, height } = canvas.getBoundingClientRect();
    const rowY = (index: number): number => Math.floor(((index + 0.5) * height * scale) / rows);
    const y = rowY(row);
    const background = [...context.getImageData(Math.floor((width * scale) / 2), rowY(rows - 1), 1, 1).data];
    const at = (x: number): boolean =>
      [...context.getImageData(Math.floor(x * scale), y, 1, 1).data].some(
        (channel, index) => Math.abs(channel - background[index]!) > 32,
      );
    return [at(width / columns / 2), at(width - 2)];
  };
  await vi.waitFor(() => {
    expect(inked(fullRows - 2, fullRows)).toEqual([true, true]);
  });

  emit({
    type: 'access-requested',
    requestId: 'host-fit',
    access: { read: [], write: [], domains: ['fixture.invalid'] },
    expiresAt: '2026-10-25T17:00:00.000Z',
  });
  expect(screen.getByRole('button', { name: 'Allow and restart' })).toBeInTheDocument();
  await vi.waitFor(() => {
    expect(sizes().at(-1)!.rows).toBeLessThan(fullRows);
  });
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });

  const { rows } = sizes().at(-1)!;
  const style = getComputedStyle(host);
  const contentWidth = host.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  expect(canvas.getBoundingClientRect().width).toBeLessThanOrEqual(contentWidth);
  for (let row = 0; row < rows - 1; row++) {
    expect({ row, inked: inked(row, rows) }).toEqual({ row, inked: [true, true] });
  }
});
