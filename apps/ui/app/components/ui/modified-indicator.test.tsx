import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

function renderIndicator(props: { onReset: () => void; tooltip?: string }, wrapper?: React.JSX.Element) {
  const indicator = (
    <TooltipProvider>
      <ModifiedIndicator onReset={props.onReset} tooltip={props.tooltip ?? 'Reset'} />
    </TooltipProvider>
  );

  if (wrapper) {
    return render(
      <div role='button' tabIndex={0} onClick={(wrapper as React.ReactElement<{ onClick: () => void }>).props.onClick}>
        {indicator}
      </div>,
    );
  }

  return render(indicator);
}

describe('ModifiedIndicator', () => {
  it('calls onReset when clicked', () => {
    const handleReset = vi.fn();
    renderIndicator({ onReset: handleReset, tooltip: 'Reset parameters' });

    fireEvent.click(screen.getByLabelText('Reset parameters'));

    expect(handleReset).toHaveBeenCalledOnce();
  });

  it('does not propagate click to parent handlers', () => {
    const handleReset = vi.fn();
    const handleParentClick = vi.fn();

    render(
      <TooltipProvider>
        <div role='button' tabIndex={0} onClick={handleParentClick} onKeyDown={handleParentClick}>
          <ModifiedIndicator onReset={handleReset} tooltip='Reset parameters' />
        </div>
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('Reset parameters'));

    expect(handleReset).toHaveBeenCalledOnce();
    expect(handleParentClick).not.toHaveBeenCalled();
  });

  it('renders with the provided aria-label from tooltip', () => {
    render(
      <TooltipProvider>
        <ModifiedIndicator onReset={vi.fn()} tooltip='Reset Name' />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText('Reset Name')).toBeInTheDocument();
  });

  it('renders as a button element', () => {
    render(
      <TooltipProvider>
        <ModifiedIndicator onReset={vi.fn()} tooltip='Reset' />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });
});
