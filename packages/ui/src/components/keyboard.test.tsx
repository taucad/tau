// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSurfaceProvider } from '#hooks/use-mobile.js';
import { KeyboardProvider, useKeybinding } from '#components/keyboard.js';
import { setPlatform } from '#utils/keys.js';

const literalControl = { key: 'w', ctrlKey: true };
const primaryModifier = { key: 'k', modKey: true };

function PlatformBinding({ onKey }: { readonly onKey: () => void }) {
  const control = useKeybinding(literalControl, onKey);
  const primary = useKeybinding(primaryModifier, onKey);
  return (
    <>
      <span>{control.formattedKeyCombination}</span>
      <span>{primary.formattedKeyCombination}</span>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setPlatform('mac');
});

function Binding({ enabled, onKey }: { readonly enabled: () => boolean; readonly onKey: () => void }) {
  useKeybinding({ key: 'k' }, onKey, { enabled, ignoreInputs: true });
  return null;
}

describe('useKeybinding', () => {
  it.each([
    { platform: 'MacIntel', controlLabel: '⌃W', primaryLabel: '⌘K', isMac: true },
    { platform: 'Win32', controlLabel: 'Ctrl+W', primaryLabel: 'Ctrl+K', isMac: false },
    { platform: 'Linux x86_64', controlLabel: 'Ctrl+W', primaryLabel: 'Ctrl+K', isMac: false },
  ])(
    'should update shortcut labels and primary bindings after detecting $platform',
    ({ platform, controlLabel, primaryLabel, isMac }) => {
      vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
      setPlatform('mac');
      const onKey = vi.fn();
      render(
        <KeyboardProvider>
          <PlatformBinding onKey={onKey} />
        </KeyboardProvider>,
      );

      expect(screen.getByText(controlLabel)).toBeInTheDocument();
      expect(screen.getByText(primaryLabel)).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'k', ctrlKey: isMac, metaKey: !isMac });
      expect(onKey).not.toHaveBeenCalled();
      fireEvent.keyDown(document, { key: 'k', ctrlKey: !isMac, metaKey: isMac });
      expect(onKey).toHaveBeenCalledOnce();
    },
  );

  it('labels a subtree that hydrates after the platform was detected with the markup the server sent', async () => {
    // The server has no navigator and sends the Mac label; a client that has already
    // detected Windows must still hydrate against that label, or React regenerates the
    // tree and reports the mismatch as an error (TAU-UI-F).
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    setPlatform('mac');
    const markup = renderToString(
      <KeyboardProvider>
        <PlatformBinding onKey={vi.fn()} />
      </KeyboardProvider>,
    );
    expect(markup).toContain('⌘K');

    // A mounted provider detects the platform, which is what used to flip the label of
    // every subtree still to hydrate.
    render(
      <KeyboardProvider>
        <PlatformBinding onKey={vi.fn()} />
      </KeyboardProvider>,
    );
    const container = document.createElement('div');
    container.innerHTML = markup;
    const recoverableErrors: unknown[] = [];

    const root = await act(async () =>
      hydrateRoot(
        container,
        <KeyboardProvider>
          <PlatformBinding onKey={vi.fn()} />
        </KeyboardProvider>,
        {
          onRecoverableError(error) {
            recoverableErrors.push(error);
          },
        },
      ),
    );

    expect(recoverableErrors).toEqual([]);
    expect(container.textContent).toContain('Ctrl+K');
    act(() => {
      root.unmount();
    });
  });

  it('uses the current function-valued options without re-registering', () => {
    const onKey = vi.fn();
    const view = render(
      <KeyboardProvider>
        <Binding enabled={() => false} onKey={onKey} />
      </KeyboardProvider>,
    );

    fireEvent.keyDown(document, { key: 'k' });
    expect(onKey).not.toHaveBeenCalled();

    view.rerender(
      <KeyboardProvider>
        <Binding enabled={() => true} onKey={onKey} />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'k' });

    expect(onKey).toHaveBeenCalledOnce();
  });
});

it('listens in an embedded surface document and releases its listener on unmount', () => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const container = frame.contentDocument!.body;
  const onKey = vi.fn();
  const view = render(
    <ResponsiveSurfaceProvider isMobile container={container}>
      <KeyboardProvider>
        <Binding enabled={() => true} onKey={onKey} />
      </KeyboardProvider>
    </ResponsiveSurfaceProvider>,
  );
  fireEvent.keyDown(document, { key: 'k' });
  expect(onKey).not.toHaveBeenCalled();
  const input = frame.contentDocument!.createElement('input');
  container.append(input);
  fireEvent.keyDown(input, { key: 'k' });
  expect(onKey).not.toHaveBeenCalled();
  const dialog = frame.contentDocument!.createElement('div');
  dialog.setAttribute('role', 'dialog');
  container.append(dialog);
  fireEvent.keyDown(dialog, { key: 'k' });
  expect(onKey).not.toHaveBeenCalled();
  fireEvent.keyDown(container, { key: 'k' });
  expect(onKey).toHaveBeenCalledOnce();
  view.unmount();
  fireEvent.keyDown(container, { key: 'k' });
  expect(onKey).toHaveBeenCalledOnce();
  frame.remove();
});

function AllowedBinding({ onKey }: { readonly onKey: () => void }) {
  useKeybinding({ key: 'b' }, onKey, { allowedScopes: ['sidebar'] });
  return null;
}

it('suppresses app shortcuts inside a dialog, except those a sidebar dialog allows', () => {
  const onK = vi.fn();
  const onB = vi.fn();
  render(
    <KeyboardProvider>
      <Binding enabled={() => true} onKey={onK} />
      <AllowedBinding onKey={onB} />
      <div role='dialog' aria-label='Settings'>
        <button type='button'>In a dialog</button>
      </div>
      <div role='dialog' aria-label='Sidebar' data-shortcut-scope='sidebar'>
        <button type='button'>In the sidebar sheet</button>
      </div>
    </KeyboardProvider>,
  );

  const inDialog = screen.getByRole('button', { name: 'In a dialog' });
  const inSidebar = screen.getByRole('button', { name: 'In the sidebar sheet' });
  fireEvent.keyDown(inDialog, { key: 'k' });
  fireEvent.keyDown(inDialog, { key: 'b' });
  expect(onK).not.toHaveBeenCalled();
  expect(onB).not.toHaveBeenCalled();
  // The sidebar dialog allows only the bindings that name it.
  fireEvent.keyDown(inSidebar, { key: 'k' });
  expect(onK).not.toHaveBeenCalled();
  fireEvent.keyDown(inSidebar, { key: 'b' });
  expect(onB).toHaveBeenCalledOnce();
});
