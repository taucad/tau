// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  useKeybinding({ key: 'k' }, onKey, { enabled });
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
