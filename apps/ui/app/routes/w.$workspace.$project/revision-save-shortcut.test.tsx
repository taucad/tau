/**
 * `Mod+S` is one gesture with two obligations: flush, then ask (S30, AC12).
 *
 * The I5 half — a save on an unchanged tree minting nothing — is proved in
 * `checkout.machine`'s own suite, where the gate lives; here the claim is that
 * the keystroke reaches the checkout at all, and that the editor's buffer is on
 * disk before it does.
 */

import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: string[] = [];
const saveRevision = vi.fn<(trigger?: 'save' | 'hidden' | 'close') => void>(() => {
  sent.push('saveRevision');
});

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: {
      send: (event: { type: string }) => {
        sent.push(`project:${event.type}`);
      },
    },
    editorRef: {
      send: (event: { type: string }) => {
        sent.push(`editor:${event.type}`);
      },
    },
  }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionCommands: () => ({ saveRevision }),
}));

const { KeyboardProvider } = await import('#hooks/use-keyboard.js');
const { setPlatform } = await import('#utils/keys.utils.js');
/* `modKey` is Cmd on a Mac and Ctrl everywhere else; the suite pins one so the
 * assertion is about the binding, not about the runner's platform. */
setPlatform('other');
const { RevisionSaveShortcut } = await import('#routes/w.$workspace.$project/revision-save-shortcut.js');

beforeEach(() => {
  sent.length = 0;
  saveRevision.mockClear();
});

describe('the workbench save shortcut', () => {
  it('asks the editor and the project to flush before it asks the checkout to record', async () => {
    render(
      <KeyboardProvider>
        <RevisionSaveShortcut />
      </KeyboardProvider>,
    );

    await userEvent.keyboard('{Control>}s{/Control}');

    expect(sent).toStrictEqual(['editor:flushNow', 'project:flushNow', 'saveRevision']);
    expect(saveRevision).toHaveBeenCalledWith('save');
  });

  it('records nothing until the gesture happens', () => {
    render(
      <KeyboardProvider>
        <RevisionSaveShortcut />
      </KeyboardProvider>,
    );

    expect(saveRevision).not.toHaveBeenCalled();
  });
});
