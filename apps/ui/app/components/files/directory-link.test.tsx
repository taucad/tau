import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectoryLink } from '#components/files/directory-link.js';

const mobileState = vi.hoisted(() => ({ isMobile: false }));

vi.mock('@taucad/ui/hooks/use-mobile', () => ({
  useIsMobile: () => mobileState.isMobile,
}));

const editorSend = vi.hoisted(() => vi.fn());
const openPanel = vi.hoisted(() => vi.fn());

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: { send: editorSend },
  }),
}));

beforeEach(() => {
  mobileState.isMobile = false;
  editorSend.mockReset();
  openPanel.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DirectoryLink', () => {
  describe('desktop', () => {
    it('opens the files pane and reveals the directory in order on click', async () => {
      const user = userEvent.setup();
      render(<DirectoryLink path='src/utils'>src/utils</DirectoryLink>);

      await user.click(screen.getByRole('button', { name: 'src/utils' }));

      expect(openPanel).toHaveBeenCalledWith('files');
      expect(editorSend).toHaveBeenCalledOnce();
      expect(editorSend).toHaveBeenCalledWith({
        type: 'revealFileInTree',
        path: 'src/utils',
        expandTarget: true,
      });
      expect(openPanel.mock.invocationCallOrder[0]).toBeLessThan(editorSend.mock.invocationCallOrder[0]!);
    });

    it('activates on Enter and Space keypresses', async () => {
      const user = userEvent.setup();
      render(<DirectoryLink path='lib'>lib</DirectoryLink>);

      const link = screen.getByRole('button', { name: 'lib' });
      link.focus();

      await user.keyboard('{Enter}');
      expect(editorSend).toHaveBeenCalledOnce();
      expect(openPanel).toHaveBeenCalledWith('files');

      editorSend.mockReset();
      openPanel.mockReset();
      await user.keyboard(' ');
      expect(openPanel).toHaveBeenCalledWith('files');
      expect(editorSend).toHaveBeenCalledOnce();
      expect(editorSend).toHaveBeenCalledWith({
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

      expect(openPanel).toHaveBeenCalledWith('files');
      expect(editorSend).toHaveBeenCalledOnce();
      expect(editorSend).toHaveBeenCalledWith({
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
      expect(openPanel).not.toHaveBeenCalled();
    });

    it('is a no-op on Enter and Space keypresses', async () => {
      const user = userEvent.setup();
      render(<DirectoryLink path='lib'>lib</DirectoryLink>);

      const link = screen.getByRole('button', { name: 'lib' });
      link.focus();

      await user.keyboard('{Enter}');
      await user.keyboard(' ');

      expect(editorSend).not.toHaveBeenCalled();
      expect(openPanel).not.toHaveBeenCalled();
    });
  });
});
