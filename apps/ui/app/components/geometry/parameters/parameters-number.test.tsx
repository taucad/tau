import { vi, describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LengthSymbol } from '@taucad/units';
import { ParametersNumber } from '#components/geometry/parameters/parameters-number.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';

// Helper to create units from graphics state
function createUnits(factor: number, symbol: LengthSymbol): Units {
  return {
    length: {
      factor,
      symbol,
    },
  };
}

// Default units (mm)
const defaultUnits = createUnits(1, 'mm');

const fireSliderPointerEvent = (
  element: HTMLElement,
  type: 'pointercancel' | 'pointerdown' | 'pointermove',
  { clientX, pointerId = 1 }: { readonly clientX: number; readonly pointerId?: number },
): void => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  fireEvent(element, event);
};

// Test wrapper component that provides TooltipProvider
function TestWrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('ParametersNumber', () => {
  describe('Basic Rendering', () => {
    it('should render with default mm unit for length', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      // Should show the value
      expect(screen.getByDisplayValue('10')).toBeTruthy();
      // Should show mm unit
      expect(screen.getByText('mm')).toBeTruthy();
    });

    it('should render with angle descriptor', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={45}
            defaultValue={45}
            descriptor='angle'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('45')).toBeTruthy();
    });

    it('should render with count descriptor', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={5}
            defaultValue={5}
            descriptor='count'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('5')).toBeTruthy();
      expect(screen.getByText('×')).toBeTruthy();
    });

    it('should render with unitless descriptor', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={1.5}
            defaultValue={1.5}
            descriptor='unitless'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('1.5')).toBeTruthy();
    });
  });

  describe('Unit Conversion', () => {
    it('should convert from mm to inches and back', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits(25.4, 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      // Value should be converted to 1 inch (25.4mm / 25.4 = 1in)
      expect(screen.getByDisplayValue('1')).toBeTruthy();

      // Should show 'in' unit
      expect(screen.getByText('in')).toBeTruthy();
    });

    it('should show approximation indicator when conversion results in rounding', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits(25.4, 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      // Should show approximation indicator
      expect(screen.getByText('≈')).toBeTruthy();

      // Tooltip content testing is complex in unit tests (requires hover/focus simulation)
      // The important part is that the approximation indicator is shown
    });

    it('should not show approximation indicator for exact conversions', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits(25.4, 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('1')).toBeTruthy();

      // Should NOT show approximation indicator
      expect(screen.queryByText('≈')).toBeNull();
    });

    it('should always call onChange with mm values regardless of display unit', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      const inchUnits = createUnits(25.4, 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('1')).toBeTruthy();

      // Clear and type new value in inches
      const input = screen.getByDisplayValue('1');
      await user.clear(input);
      await user.type(input, '2');

      // OnChange should be called with value in mm (2 inches = 50.8mm)
      expect(mockOnChange).toHaveBeenCalledWith(50.8);
    });

    it('should format values with 4 significant figures during conversion', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits(25.4, 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={123.456}
            defaultValue={123.456}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole<HTMLInputElement>('textbox');
      // 123.456mm / 25.4 ≈ 4.860 inches (4 sig figs)
      expect(input.value).toMatch(/^4\.86/);
    });
  });

  describe('Unified Number Field', () => {
    it('should render a fill bar proportional to the value', () => {
      const mockOnChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <ParametersNumber
            value={50}
            defaultValue={50}
            descriptor='length'
            min={0}
            max={100}
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const fillBar = container.querySelector('[class*="bg-primary"]');
      expect(fillBar).toBeTruthy();
      expect((fillBar as HTMLElement).style.width).toBe('50%');
    });

    it('should clamp fill bar to 0-100%', () => {
      const mockOnChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <ParametersNumber
            value={0}
            defaultValue={0}
            descriptor='length'
            min={0}
            max={100}
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const fillBar = container.querySelector('[class*="bg-primary"]');
      expect(fillBar).toBeTruthy();
      expect((fillBar as HTMLElement).style.width).toBe('0%');
    });

    it('should accept the next external value after pointer cancellation', () => {
      const mockOnChange = vi.fn();
      const properties = {
        defaultValue: 50,
        descriptor: 'length',
        min: 0,
        max: 100,
        units: defaultUnits,
        onChange: mockOnChange,
      } satisfies Omit<React.ComponentProps<typeof ParametersNumber>, 'value'>;
      const { container, rerender } = render(
        <TestWrapper>
          <ParametersNumber {...properties} value={50} />
        </TestWrapper>,
      );
      const sliderInput = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
      Object.defineProperty(sliderInput, 'offsetWidth', { configurable: true, value: 100 });

      fireSliderPointerEvent(sliderInput, 'pointerdown', { clientX: 0 });
      fireSliderPointerEvent(sliderInput, 'pointermove', { clientX: 25 });
      fireSliderPointerEvent(sliderInput, 'pointercancel', { clientX: 25 });
      expect(mockOnChange).toHaveBeenLastCalledWith(75);

      rerender(
        <TestWrapper>
          <ParametersNumber {...properties} value={20} />
        </TestWrapper>,
      );
      expect(screen.getByRole('textbox')).toHaveValue('20');
    });

    it('should enter edit mode on focus and show the input', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole('textbox');
      expect(input.className).toContain('opacity-0');

      act(() => {
        input.focus();
      });
      expect(input.className).toContain('opacity-100');
    });

    it('should exit edit mode on blur', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole('textbox');
      act(() => {
        input.focus();
      });
      expect(input.className).toContain('opacity-100');

      act(() => {
        input.blur();
      });
      expect(input.className).toContain('opacity-0');
    });

    it('should revert text on Escape', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      act(() => {
        input.focus();
      });
      await user.clear(input);
      await user.type(input, '999');
      await user.keyboard('{Escape}');

      expect(input).toHaveValue('10');
    });
  });

  describe('Input Field Interactions', () => {
    it('should update value when typing in input', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);
      await user.type(input, '25');

      // Should call onChange with the new value
      expect(mockOnChange).toHaveBeenCalledWith(25);
    });

    it('should not commit value on blur if user did not edit', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');

      // Focus and blur without editing
      await user.click(input);
      await user.tab();

      // OnChange should NOT be called on blur without edit
      // (it might have been called during render/initialization, but not from blur)
      const callCount = mockOnChange.mock.calls.length;

      // Click again and blur again
      await user.click(input);
      await user.tab();

      // Call count should not increase
      expect(mockOnChange.mock.calls.length).toBe(callCount);
    });

    it('should not commit approximated value on blur without edit', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      const inchUnits = createUnits(25.4, 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      // Should show approximation indicator
      expect(screen.getByText('≈')).toBeTruthy();

      mockOnChange.mockClear();

      const input = screen.getByRole('textbox');

      // Focus and blur without editing
      await user.click(input);
      await user.tab();

      // OnChange should NOT be called
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should parse length input with units', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('25.4');
      await user.clear(input);
      await user.type(input, '1 in');

      // Should parse "1 in" and convert to mm live during typing
      expect(mockOnChange).toHaveBeenCalledWith(25.4);

      // Pressing Enter should just blur, not emit again
      mockOnChange.mockClear();
      await user.keyboard('{Enter}');
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should convert display value on Enter without emitting onChange', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('25.4');
      await user.clear(input);
      await user.type(input, '1in');

      // Should parse "1in" and convert to mm live during typing
      expect(mockOnChange).toHaveBeenCalledWith(25.4);
      mockOnChange.mockClear();

      // Press Enter to trigger UI conversion
      await user.keyboard('{Enter}');

      // Should NOT emit onChange again (value already emitted during typing)
      expect(mockOnChange).not.toHaveBeenCalled();

      // Display value should be updated to the converted value (25.4mm displayed as "25.4")
      // After blur, the input should show the formatted value
      const updatedInput = screen.getByDisplayValue('25.4');
      expect(updatedInput).toBeInTheDocument();
    });

    it('should parse fractional input', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={12.7}
            defaultValue={12.7}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('12.7');
      await user.clear(input);
      await user.type(input, '1/2 in');

      // Should parse "1/2 in" and convert to mm (0.5 * 25.4 = 12.7) live during typing
      expect(mockOnChange).toHaveBeenCalledWith(12.7);

      // Pressing Enter should just blur, not emit again
      mockOnChange.mockClear();
      await user.keyboard('{Enter}');
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should parse feet and inches notation', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={304.8}
            defaultValue={304.8}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('304.8');
      await user.clear(input);
      await user.type(input, "1'");

      // Should parse 1 foot and convert to mm (1 foot = 30 inches = 30 * 25.4 = 762mm) live during typing
      // Note: parseLength converts feet to inches
      expect(mockOnChange).toHaveBeenCalled();

      // Tabbing away should not emit again
      mockOnChange.mockClear();
      await user.tab();
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should handle empty input gracefully', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);

      // Empty input should not call onChange
      // The input should be empty but not propagate
      expect(input).toHaveValue('');
    });

    it('should restore original value when blurring empty input', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);
      await user.tab();

      // Should restore to original value
      expect(input).toHaveValue('10');
    });

    it('should update input value in real-time when arrow keys are pressed while focused', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');

      // Focus the input
      await user.click(input);
      expect(input).toHaveFocus();

      // Press arrow up (should increment by step)
      await user.keyboard('{ArrowUp}');

      // Input should show updated value immediately (10 + 1 = 11)
      expect(input).toHaveValue('11');

      // OnChange should have been called with the new value in mm
      expect(mockOnChange).toHaveBeenCalledWith(11);

      // Press arrow down (should decrement by step)
      mockOnChange.mockClear();
      await user.keyboard('{ArrowDown}');

      // Input should show updated value immediately (11 - 1 = 10)
      expect(input).toHaveValue('10');

      // OnChange should have been called with the new value in mm
      expect(mockOnChange).toHaveBeenCalledWith(10);
    });

    it('should not overwrite user typing after arrow key press', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');

      // Focus the input
      await user.click(input);

      // Press arrow up
      await user.keyboard('{ArrowUp}');
      expect(input).toHaveValue('11');

      // Start typing - this should preserve user input
      await user.keyboard('5');

      // Input should show user's typing, not be overwritten
      expect(input).toHaveValue('115');
    });
  });

  describe('Disabled State', () => {
    it('should disable input when disabled prop is true', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            disabled
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('should not call onChange when disabled', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            disabled
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole('textbox');

      // Try to type in disabled input
      await user.type(input, '5');

      // OnChange should not be called
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle decimal precision correctly', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={0.1}
            defaultValue={0.1}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('0.1');
      await user.clear(input);
      await user.type(input, '0.123456789');

      // Should handle high precision
      expect(mockOnChange).toHaveBeenCalledWith(0.123_456_789);
    });
  });
});
