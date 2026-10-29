import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalRenderer } from '#components/terminal/terminal-renderer.js';
import type { TerminalRendererOptions, TerminalRendererView } from '#components/terminal/terminal-renderer.js';

const theme = {
  background: '#101010',
  foreground: '#f0f0f0',
  cursor: '#f0f0f0',
  cursorAccent: '#101010',
  selectionBackground: '#404040',
  selectionForeground: '#f0f0f0',
  black: '#808080',
  red: '#ff5050',
  green: '#50ff50',
  yellow: '#ffff50',
  blue: '#5050ff',
  magenta: '#ff50ff',
  cyan: '#50ffff',
  white: '#f0f0f0',
  brightBlack: '#808080',
  brightRed: '#ff5050',
  brightGreen: '#50ff50',
  brightYellow: '#ffff50',
  brightBlue: '#5050ff',
  brightMagenta: '#ff50ff',
  brightCyan: '#50ffff',
  brightWhite: '#f0f0f0',
};

let host: HTMLDivElement;
let view: TerminalRendererView | undefined;

const create = async (overrides: Partial<TerminalRendererOptions> = {}): Promise<TerminalRendererView> => {
  view = await createTerminalRenderer({
    host,
    fontFamily: 'monospace',
    fontSize: 13,
    theme,
    scrollback: 1000,
    screenReaderMode: true,
    minimumContrastRatio: 1,
    reducedMotion: true,
    onLinkActivate: vi.fn(),
    onLeave: vi.fn(),
    ...overrides,
  });
  view.fit();
  return view;
};

const write = async (data: string): Promise<void> =>
  new Promise((resolve) => {
    view!.write(data, resolve);
  });

const textbox = (): HTMLElement => host.querySelector<HTMLElement>('[role="textbox"]')!;

const mirrorText = async (): Promise<string> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 250);
  });
  return host.querySelector('[data-terminal-screen-mirror]')?.textContent ?? '';
};

/** Click the centre of a cell, as a person would, with optional modifiers. */
const clickCell = (column: number, row: number, init: MouseEventInit = {}): void => {
  const canvas = host.querySelector('canvas')!;
  const box = canvas.getBoundingClientRect();
  const size = view!.fit();
  const x = box.left + ((column + 0.5) * box.width) / size.columns;
  const y = box.top + ((row + 0.5) * box.height) / size.rows;
  for (const type of ['mousedown', 'mouseup', 'click'] as const) {
    canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init }));
  }
};

beforeEach(() => {
  host = document.createElement('div');
  host.style.width = '640px';
  host.style.height = '320px';
  host.style.position = 'relative';
  document.body.append(host);
});

afterEach(() => {
  view?.dispose();
  view = undefined;
  host.remove();
  vi.restoreAllMocks();
});

describe('createTerminalRenderer (AurigaX 0.3.6)', () => {
  it('draws output to a hidden canvas and mirrors it as text for screen readers', async () => {
    await create();
    await write('hello from tau\r\n$ ');
    expect(await mirrorText()).toContain('hello from tau');
    for (const canvas of host.querySelectorAll('canvas')) {
      expect(canvas.getAttribute('aria-hidden')).toBe('true');
    }
    expect(textbox().getAttribute('aria-label')).toBe('Terminal');
    expect(host.querySelector('textarea')?.getAttribute('tabindex')).toBe('-1');
    expect(host.querySelector('[role="log"]')).not.toBeNull();
  });

  it('renders HTML in output as characters, never as elements', async () => {
    await create();
    await write('<img src=x onerror="globalThis.pwned=1"><b>bold</b>\r\n');
    expect(host.querySelector('img, b')).toBeNull();
    expect(await mirrorText()).toContain('<img src=x onerror="globalThis.pwned=1"><b>bold</b>');
    expect(Reflect.get(globalThis, 'pwned')).toBeUndefined();
  });

  it('denies OSC 52 clipboard writes and reads and ignores the window title', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const readText = vi.spyOn(navigator.clipboard, 'readText');
    const { title } = document;
    const answers: string[] = [];
    const created = await create();
    created.onData((data) => {
      answers.push(data);
    });
    await write(
      '\u001B]52;c;aGlqYWNrZWQ=\u0007\u001B]52;c;?\u0007\u001B]0;Allow all access\u0007\u001B]2;Evil\u0007done\r\n',
    );
    expect(writeText).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
    expect(answers.join('')).not.toContain('52;');
    expect(document.title).toBe(title);
    expect(await mirrorText()).toContain('done');
  });

  it('opens only http(s) links, only on Ctrl/Cmd+click, and only through the trusted callback', async () => {
    const onLinkActivate = vi.fn();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    await create({ onLinkActivate });
    await write(
      '\u001B]8;;javascript:alert(1)\u001B\\AAAAAAAAAA\u001B]8;;\u001B\\\r\n' +
        '\u001B]8;;file:///etc/passwd\u001B\\BBBBBBBBBB\u001B]8;;\u001B\\\r\n' +
        '\u001B]8;;https://tau.new/docs\u001B\\CCCCCCCCCC\u001B]8;;\u001B\\\r\n',
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    clickCell(3, 0, { ctrlKey: true, metaKey: true });
    clickCell(3, 1, { ctrlKey: true, metaKey: true });
    clickCell(3, 2);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(onLinkActivate).not.toHaveBeenCalled();
    clickCell(3, 2, { ctrlKey: true, metaKey: true });
    await vi.waitFor(() => {
      expect(onLinkActivate).toHaveBeenCalledExactlyOnceWith('https://tau.new/docs');
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves on Shift+Escape without sending it to the shell, and keeps Escape for the shell', async () => {
    const onLeave = vi.fn();
    const created = await create({ onLeave });
    const sent: string[] = [];
    created.onData((data) => {
      sent.push(data);
    });
    created.focus();
    textbox().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(onLeave).toHaveBeenCalledOnce();
    expect(sent).toEqual([]);
    textbox().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => {
      expect(sent.join('')).toBe('\u001B');
    });
  });

  it('pastes line breaks as carriage returns', async () => {
    const created = await create();
    const sent: string[] = [];
    created.onData((data) => {
      sent.push(data);
    });
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'echo one\necho two');
    textbox().dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    expect(sent.join('')).toBe('echo one\recho two');
  });

  it('parses a large backlog in bounded slices and yields to the event loop between them', async () => {
    await create();
    const events: string[] = [];
    const backlog = `${'x'.repeat(79)}\r\n`.repeat(2048);
    setTimeout(() => {
      events.push('task');
    }, 0);
    await write(backlog);
    events.push('painted');
    expect(events).toEqual(['task', 'painted']);
    expect(await mirrorText()).toContain('x'.repeat(40));
  });

  it('turns the screen mirror off and on without losing the screen', async () => {
    const created = await create({ screenReaderMode: false });
    await write('kept\r\n');
    expect(host.querySelector('[data-terminal-screen-mirror]')).toBeNull();
    created.setScreenReaderMode(true);
    expect(await mirrorText()).toContain('kept');
  });
});
