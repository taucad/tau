import '#styles/global.css';
import axe from 'axe-core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopTerminalBridge, TerminalHostFrame } from '@taucad/types/desktop-terminal';
import { TerminalPane } from '#components/terminal/terminal-pane.js';
import type { TerminalAvailability } from '#components/terminal/terminal-availability.js';

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

  it('starts nothing until a person presses Start, then runs a shell session with a request card', async () => {
    const { bridge, emit } = createBridge();
    const container = mount({ status: 'available', projectRoot: '/home/me/Tau/bracket', bridge });
    await audit(container);
    await shot('01-start', theme);

    fireEvent.click(screen.getByRole('button', { name: 'Start Terminal' }));
    await vi.waitFor(() => {
      expect(container.querySelector('canvas')).not.toBeNull();
    });
    emit({
      type: 'opened',
      session: { id: 's1', projectLabel: 'bracket', access: { read: [], write: [], domains: [] } },
    });
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
    const container = mount({ status: 'available', projectRoot: 'C:\\Users\\me\\Tau\\bracket', bridge });
    fireEvent.click(screen.getByRole('button', { name: 'Start Terminal' }));
    await vi.waitFor(() => {
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
