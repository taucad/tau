import { renderHook } from '@testing-library/react';
import type { DockviewPanelApi } from 'dockview-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeAllPanelsInGroup,
  closeOtherPanels,
  closePanelsToTheLeft,
  closePanelsToTheRight,
  copyPathToClipboard,
} from '#components/panes/tab-context-menu-actions.js';
import { useDockviewTerminalCloseHost } from '#components/terminal/terminal-close.js';

const mocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('#components/ui/sonner.js', () => ({ toast: { error: mocks.error } }));

const clipboardDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');

const stubClipboard = (writeText: (text: string) => Promise<void>): ReturnType<typeof vi.fn> => {
  const spy = vi.fn(writeText);
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: spy } });
  return spy;
};

afterEach(() => {
  mocks.error.mockReset();
  if (clipboardDescriptor === undefined) {
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- restoring jsdom's own absent property
    Reflect.deleteProperty(globalThis.navigator, 'clipboard');
  } else {
    Object.defineProperty(globalThis.navigator, 'clipboard', clipboardDescriptor);
  }
});

describe('copyPathToClipboard', () => {
  it('should write the path without reporting an error when the clipboard accepts it', async () => {
    const writeText = stubClipboard(async () => undefined);

    await copyPathToClipboard('src/main.ts');

    expect(writeText).toHaveBeenCalledWith('src/main.ts');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('should resolve and report the refusal when the browser denies clipboard access', async () => {
    const message =
      'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.';
    stubClipboard(async () => {
      throw new DOMException(message, 'NotAllowedError');
    });

    await expect(copyPathToClipboard('src/main.ts')).resolves.toBeUndefined();

    expect(mocks.error).toHaveBeenCalledWith('Failed to copy path', {
      description: expect.stringContaining(message) as string,
    });
  });
});

describe('bulk close with a running Terminal (T15)', () => {
  /* One group: a.scad, the Terminal, b.scad. The Terminal holds its close for the person's choice. */
  const createGroup = () => {
    const panels: Array<{ id: string; api: DockviewPanelApi }> = [];
    const group = { panels };
    for (const id of ['a.scad', 'workbench:terminal', 'b.scad']) {
      panels.push({
        id,
        api: { id, group, close: vi.fn(), setActive: vi.fn() } as unknown as DockviewPanelApi,
      });
    }
    const terminal = panels[1]!.api;
    const request = vi.fn(() => true);
    const { result } = renderHook(() => useDockviewTerminalCloseHost(terminal, vi.fn()));
    result.current.register(request);
    const closed = (): string[] =>
      panels.filter((panel) => vi.mocked(panel.api.close).mock.calls.length > 0).map((panel) => panel.id);
    return { panels, terminal, request, closed };
  };

  it.each([
    { name: 'Close All', action: closeAllPanelsInGroup, from: 0, expected: ['a.scad', 'b.scad'] },
    { name: 'Close Others', action: closeOtherPanels, from: 0, expected: ['b.scad'] },
    { name: 'Close to the Right', action: closePanelsToTheRight, from: 0, expected: ['b.scad'] },
    { name: 'Close to the Left', action: closePanelsToTheLeft, from: 2, expected: ['a.scad'] },
  ])('$name closes the other tabs and leaves the Terminal to ask', ({ action, from, expected }) => {
    const { panels, terminal, request, closed } = createGroup();
    action(panels[from]!.api);
    expect(request).toHaveBeenCalledOnce();
    expect(terminal.close).not.toHaveBeenCalled();
    expect(terminal.setActive).toHaveBeenCalledOnce();
    expect(closed()).toEqual(expected);
  });
});
