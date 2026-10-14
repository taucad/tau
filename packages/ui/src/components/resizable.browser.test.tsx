import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#components/resizable.js';

afterEach(cleanup);

describe('Resizable panels', () => {
  it('should resize through its named keyboard separator and respect panel limits', async () => {
    render(
      <ResizablePanelGroup direction='horizontal'>
        <ResizablePanel defaultSize={50} minSize={20}>
          Editor
        </ResizablePanel>
        <ResizableHandle aria-label='Resize editor' />
        <ResizablePanel defaultSize={50} minSize={20}>
          Preview
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    const separator = screen.getByRole('separator', { name: 'Resize editor' });
    expect(separator.getAttribute('aria-valuenow')).toBe('50');
    separator.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(separator.getAttribute('aria-valuenow')).toBe('60');
    await userEvent.keyboard('{End}');
    expect(separator.getAttribute('aria-valuenow')).toBe('80');
    await userEvent.keyboard('{Home}');
    expect(separator.getAttribute('aria-valuenow')).toBe('20');
  });
});
