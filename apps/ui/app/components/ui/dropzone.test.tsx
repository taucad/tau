// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dropzone } from '#components/ui/dropzone.js';

describe('Dropzone', () => {
  it('should open one native file picker from the keyboard and accept its selection', async () => {
    const user = userEvent.setup();
    const onDrop = vi.fn();
    render(<Dropzone onDrop={onDrop}>Open model</Dropzone>);
    const input = screen.getByLabelText<HTMLInputElement>('Choose files');
    const click = vi.spyOn(input, 'click');
    const button = screen.getByRole('button', { name: 'Open model' });
    expect(button).not.toContainElement(input);
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(click).toHaveBeenCalledTimes(1);
    const file = new File(['solid model\nendsolid model'], 'model.stl');
    await user.upload(input, file);
    await waitFor(() => {
      expect(onDrop).toHaveBeenCalledWith([file], [], expect.anything());
    });
  });
});
