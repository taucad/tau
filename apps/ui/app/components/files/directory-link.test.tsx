import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectoryLink } from '#components/files/directory-link.js';

const mobileState = vi.hoisted(() => ({ isMobile: false }));

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => mobileState.isMobile,
}));

const editorSend = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: { send: editorSend },
  }),
}));

beforeEach(() => {
  mobileState.isMobile = false;
  editorSend.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('DirectoryLink', () => {
  describe('desktop', () => {
    it('opens the files pane and reveals the directory in order on click', async () => {
      const user = userEvent.setup();
      render(<DirectoryLink path='src/utils'>src/utils</DirectoryLink>);

      await user.click(screen.getByRole('button', { name: 'src/utils' }));

      expect(editorSend).toHaveBeenCalledTimes(2);
      expect(editorSend).toHaveBeenNthCalledWith(1, {
        type: 'setPanelState',
        panelState: { openPanels: { files: true } },
      });
      expect(editorSend).toHaveBeenNthCalledWith(2, {
        type: 'revealFileInTree',
        path: 'src/utils',
        expandTarget: true,
      });
    });

    it('activates on Enter and Space keypresses', async () => {
      const user = userEvent.setup();
      render(<DirectoryLink path='lib'>lib</DirectoryLink>);

      const link = screen.getByRole('button', { name: 'lib' });
      link.focus();

      await user.keyboard('{Enter}');
      expect(editorSend).toHaveBeenCalledTimes(2);

      editorSend.mockReset();
      await user.keyboard(' ');
      expect(editorSend).toHaveBeenCalledTimes(2);
      expect(editorSend).toHaveBeenNthCalledWith(1, {
        type: 'setPanelState',
        panelState: { openPanels: { files: true } },
      });
      expect(editorSend).toHaveBeenNthCalledWith(2, {
        type: 'revealFileInTree',
        path: 'lib',
        expandTarget: true,
      });
    });

    it('ignores keypresses other than Enter and Space', async () => {
      const user = userEvent.setup();
      render(<DirectoryLink path='lib'>lib</DirectoryLink>);

      const link = screen.getByRole('button', { name: 'lib' });
      link.focus();

      await user.keyboard('a');
      await user.keyboard('{Escape}');

      expect(editorSend).not.toHaveBeenCalled();
    });

    it('forwards onClick onto the child element when asChild is set', async () => {
      const user = userEvent.setup();
      render(
        <DirectoryLink path='a/b' asChild>
          <button type='button' data-testid='child'>
            a/b
          </button>
        </DirectoryLink>,
      );

      await user.click(screen.getByTestId('child'));

      expect(editorSend).toHaveBeenCalledTimes(2);
      expect(editorSend).toHaveBeenNthCalledWith(1, {
        type: 'setPanelState',
        panelState: { openPanels: { files: true } },
      });
      expect(editorSend).toHaveBeenNthCalledWith(2, {
        type: 'revealFileInTree',
        path: 'a/b',
        expandTarget: true,
      });
    });
  });

  describe('mobile', () => {
    beforeEach(() => {
      mobileState.isMobile = true;
    });

    it('is a no-op on click', async () => {
      const user = userEvent.setup();
      render(<DirectoryLink path='src/utils'>src/utils</DirectoryLink>);

      await user.click(screen.getByRole('button', { name: 'src/utils' }));

      expect(editorSend).not.toHaveBeenCalled();
    });

    it('is a no-op on Enter and Space keypresses', async () => {
      const user = userEvent.setup();
      render(<DirectoryLink path='lib'>lib</DirectoryLink>);

      const link = screen.getByRole('button', { name: 'lib' });
      link.focus();

      await user.keyboard('{Enter}');
      await user.keyboard(' ');

      expect(editorSend).not.toHaveBeenCalled();
    });
  });
});
