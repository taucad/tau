import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ContextChip, middleTruncate } from '#components/chat/context-chip.js';

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
    it('should show hover feedback when interactive', () => {
      const { container } = render(<ContextChip label='main.scad' chipType='file' isInteractive />);

      const chip = container.firstElementChild!;
      expect(chip).toHaveClass('hover:bg-foreground/20');
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

  describe('neutral finish (composer chip audit, finish A)', () => {
    it('keeps the label in the foreground and tints nothing by kind', () => {
      const { container } = render(<ContextChip label='$imagegen' chipType='skill' />);

      const chip = container.firstElementChild!;
      expect(chip).toHaveClass('bg-foreground/10', 'text-foreground');
      expect(chip.className).not.toMatch(/yellow|purple|primary/);
      expect(screen.getByText('$imagegen')).toBeInTheDocument();
    });

    it('shows the node selection Backspace would delete', () => {
      const { container } = render(<ContextChip label='main.scad' chipType='file' isSelected />);

      expect(container.firstElementChild).toHaveClass('ring-1', 'ring-ring');
      expect(container.firstElementChild).toHaveAttribute('data-selected', 'true');
    });

    it('marks a missing file with its own glyph and a struck-through label', () => {
      const { container } = render(<ContextChip label='old.scad' chipType='file' isMissing />);

      expect(container.querySelector('[class*="lucide-file-x"]')).toBeInTheDocument();
      expect(screen.getByText('old.scad')).toHaveClass('line-through');
    });

    it('adds the parent folder as a muted hint', () => {
      render(<ContextChip label='index.ts' chipType='file' detail='parts' />);

      expect(screen.getByText('parts/')).toHaveClass('text-muted-foreground');
    });

    it('shows the full path on hover', async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <ContextChip label='index.ts' chipType='file' tooltip='src/parts/index.ts' />
        </TooltipProvider>,
      );

      await user.hover(screen.getByText('index.ts'));

      expect(await screen.findByRole('tooltip')).toHaveTextContent('src/parts/index.ts');
    });

    it('shortens long file names in the middle so the extension survives', () => {
      render(<ContextChip label='turbofan-housing-assembly-rev-c.step' chipType='file' />);

      expect(screen.getByText(middleTruncate('turbofan-housing-assembly-rev-c.step'))).toBeInTheDocument();
    });
  });
});

describe('middleTruncate', () => {
  it('keeps short names and the extension of long ones', () => {
    expect(middleTruncate('main.scad')).toBe('main.scad');
    const shortened = middleTruncate('turbofan-housing-assembly-rev-c.step');
    expect(shortened).toHaveLength(24);
    expect(shortened).toMatch(/^turbofan-h.*….*\.step$/);
  });

  it('shortens names without an extension', () => {
    expect(middleTruncate('a'.repeat(40))).toHaveLength(24);
  });
});
