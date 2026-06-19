import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextChip } from '#components/chat/context-chip.js';

describe('ContextChip', () => {
  it('should render label text', () => {
    render(<ContextChip label='main.scad' chipType='file' />);

    expect(screen.getByText('main.scad')).toBeInTheDocument();
  });

  it('should render folder icon for folder chipType', () => {
    const { container } = render(<ContextChip label='src' chipType='folder' />);

    expect(container.querySelector('[class*="lucide-folder"]')).toBeInTheDocument();
  });

  it('should render chat icon for chat chipType', () => {
    const { container } = render(<ContextChip label='My Chat' chipType='chat' />);

    expect(container.querySelector('[class*="lucide-message-square"]')).toBeInTheDocument();
  });

  it('should render file extension icon for file chipType', () => {
    render(<ContextChip label='utils.ts' chipType='file' />);

    expect(screen.getByText('utils.ts')).toBeInTheDocument();
  });

  it('should render screenshot icon for screenshot chipType', () => {
    const { container } = render(<ContextChip label='Screenshot' chipType='screenshot' />);

    expect(container.querySelector('[class*="lucide-camera"]')).toBeInTheDocument();
  });

  it('should render skill icon for skill chipType', () => {
    const { container } = render(<ContextChip label='/create-policy' chipType='skill' />);

    expect(container.querySelector('[class*="lucide-blocks"]')).toBeInTheDocument();
  });

  it('should render geometry icon for geometry chipType', () => {
    const { container } = render(<ContextChip label='Sun Gear' chipType='geometry' />);

    expect(container.querySelector('[class*="lucide-box"]')).toBeInTheDocument();
  });

  describe('onRemove behavior', () => {
    it('should not show X button when onRemove is absent', async () => {
      const user = userEvent.setup();
      const { container } = render(<ContextChip label='main.scad' chipType='file' />);

      const chip = container.querySelector('span')!;
      await user.hover(chip);

      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });

    it('should show X button on hover when onRemove is provided', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      const { container } = render(<ContextChip label='main.scad' chipType='file' onRemove={onRemove} />);

      const chip = container.querySelector('span')!;
      await user.hover(chip);

      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('should call onRemove when X button is clicked', () => {
      const onRemove = vi.fn();
      const { container } = render(<ContextChip label='main.scad' chipType='file' onRemove={onRemove} />);

      const chip = container.firstElementChild!;
      fireEvent.mouseEnter(chip);
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onRemove).toHaveBeenCalledOnce();
    });

    it('should stop propagation and prevent default on X click', () => {
      const parentClick = vi.fn();
      const onRemove = vi.fn();

      const { container } = render(
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- test wrapper
        <div onClick={parentClick}>
          <ContextChip label='main.scad' chipType='file' onRemove={onRemove} />
        </div>,
      );

      const chip = container.querySelector('[class*="inline-flex"]')!;
      fireEvent.mouseEnter(chip);
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onRemove).toHaveBeenCalledOnce();
      expect(parentClick).not.toHaveBeenCalled();
    });

    it('should hide X button when mouse leaves', () => {
      const onRemove = vi.fn();
      const { container } = render(<ContextChip label='main.scad' chipType='file' onRemove={onRemove} />);

      const chip = container.firstElementChild!;
      fireEvent.mouseEnter(chip);
      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();

      fireEvent.mouseLeave(chip);
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });
  });

  describe('interactive styling', () => {
    it('should have cursor-pointer class when isInteractive is true', () => {
      const { container } = render(<ContextChip label='main.scad' chipType='file' isInteractive />);

      const chip = container.firstElementChild!;
      expect(chip.className).toContain('cursor-pointer');
    });

    it('should have cursor-default class when isInteractive is false', () => {
      const { container } = render(<ContextChip label='main.scad' chipType='file' />);

      const chip = container.firstElementChild!;
      expect(chip.className).toContain('cursor-default');
    });
  });

  describe('prop forwarding', () => {
    it('should spread rest props onto root span', () => {
      render(<ContextChip label='main.scad' chipType='file' data-testid='test-chip' />);

      expect(screen.getByTestId('test-chip')).toBeInTheDocument();
    });

    it('should forward onClick to root span', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<ContextChip label='main.scad' chipType='file' onClick={onClick} />);

      await user.click(screen.getByText('main.scad'));

      expect(onClick).toHaveBeenCalledOnce();
    });

    it('should merge className with default classes', () => {
      const { container } = render(<ContextChip label='main.scad' chipType='file' className='custom-class' />);

      const chip = container.firstElementChild!;
      expect(chip.className).toContain('custom-class');
      expect(chip.className).toContain('inline-flex');
    });
  });
});
