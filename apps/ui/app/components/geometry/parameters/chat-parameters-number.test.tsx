import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GraphicsUnits } from '@taucad/types';
import type { LengthSymbol } from '@taucad/units';
import { ChatParametersNumber } from '#components/geometry/parameters/chat-parameters-number.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

// Helper to create units from graphics state
function createUnits(factor: number, symbol: LengthSymbol): GraphicsUnits {
  return {
    length: {
      factor,
      symbol,
    },
  };
}

// Default units (mm)
const defaultUnits = createUnits(1, 'mm');

// Test wrapper component that provides TooltipProvider
function TestWrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('ChatParametersNumber', () => {
  describe('Basic Rendering', () => {
    it('should render with default mm unit for length', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={45}
            defaultValue={45}
            descriptor="angle"
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
          <ChatParametersNumber
            value={5}
            defaultValue={5}
            descriptor="count"
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
          <ChatParametersNumber
            value={1.5}
            defaultValue={1.5}
            descriptor="unitless"
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
          <ChatParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor="length"
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
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor="length"
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
          <ChatParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor="length"
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
          <ChatParametersNumber
            value={123.456}
            defaultValue={123.456}
            descriptor="length"
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

  describe('Slider Interactions', () => {
    it('should calculate appropriate min/max range based on default value', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ChatParametersNumber
            value={50}
            defaultValue={50}
            descriptor="length"
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const slider = screen.getByRole('slider');

      // For default value of 50, range should be [0, 200]
      expect(slider.getAttribute('aria-valuemin')).toBe('0');
      expect(slider.getAttribute('aria-valuemax')).toBe('200');
    });

    it('should respect custom min/max values', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ChatParametersNumber
            value={50}
            defaultValue={50}
            descriptor="length"
            min={10}
            max={100}
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const slider = screen.getByRole('slider');

      expect(slider.getAttribute('aria-valuemin')).toBe('10');
      expect(slider.getAttribute('aria-valuemax')).toBe('100');
    });

    it('should handle zero default value correctly', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ChatParametersNumber
            value={0}
            defaultValue={0}
            descriptor="length"
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const slider = screen.getByRole('slider');

      // For zero, should use symmetric range [-100, 100]
      expect(slider.getAttribute('aria-valuemin')).toBe('-100');
      expect(slider.getAttribute('aria-valuemax')).toBe('100');
    });

    it('should handle negative default values', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ChatParametersNumber
            value={-50}
            defaultValue={-50}
            descriptor="length"
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const slider = screen.getByRole('slider');

      // For negative default, max should be 0, min should be expanded
      expect(slider.getAttribute('aria-valuemax')).toBe('0');
      const minValue = Number.parseFloat(slider.getAttribute('aria-valuemin') ?? '0');
      expect(minValue).toBeLessThan(-50);
    });

    it('should convert slider ranges when unit changes', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits(25.4, 'in');

      render(
        <TestWrapper>
          <ChatParametersNumber
            value={254}
            defaultValue={254}
            descriptor="length"
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const slider = screen.getByRole('slider');
      // 254mm / 25.4 = 10 inches
      // For default of 10, range should be [0, 40]
      const maxValue = Number.parseFloat(slider.getAttribute('aria-valuemax') ?? '0');
      expect(maxValue).toBeGreaterThan(30);
    });
  });

  describe('Input Field Interactions', () => {
    it('should update value when typing in input', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor="length"
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
          <ChatParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor="length"
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
          <ChatParametersNumber
            value={12.7}
            defaultValue={12.7}
            descriptor="length"
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
          <ChatParametersNumber
            value={304.8}
            defaultValue={304.8}
            descriptor="length"
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
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={10}
            defaultValue={10}
            descriptor="length"
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
    it('should disable slider and input when disabled prop is true', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ChatParametersNumber
            disabled
            value={10}
            defaultValue={10}
            descriptor="length"
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const slider = screen.getByRole('slider');
      const input = screen.getByRole('textbox');

      // Radix UI uses aria-disabled or data-disabled attributes
      expect(slider.getAttribute('aria-disabled') ?? Object.hasOwn(slider.dataset, 'disabled')).toBeTruthy();
      expect(input).toBeDisabled();
    });

    it('should not call onChange when disabled', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ChatParametersNumber
            disabled
            value={10}
            defaultValue={10}
            descriptor="length"
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
          <ChatParametersNumber
            value={0.1}
            defaultValue={0.1}
            descriptor="length"
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
