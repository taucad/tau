// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardProvider, useKeybinding } from '#hooks/use-keyboard.js';

function Binding({ enabled, onKey }: { readonly enabled: () => boolean; readonly onKey: () => void }) {
  useKeybinding({ key: 'k' }, onKey, { enabled });
  return null;
}

describe('useKeybinding', () => {
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
