import { fireEvent, render, screen } from '@testing-library/react';
import type { Registry, RJSFSchema, WidgetProps } from '@rjsf/utils';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ParametersWidget } from '#components/geometry/parameters/parameters-widget.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

const formContext: RJSFContext = {
  idPrefix: '///root',
  rootPresentation: 'catalog',
  searchTerm: '',
  allExpanded: true,
  resetSingleParameter: vi.fn(),
  shouldShowField: () => true,
  units: { length: { sourceSymbol: 'mm', displaySymbol: 'mm' } },
};

function widgetProps(overrides: Partial<WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>>) {
  const registry = mock<Registry<Record<string, unknown>, RJSFSchema, RJSFContext>>();
  registry.formContext = formContext;
  return {
    id: 'root_width',
    name: 'width',
    label: 'Width',
    schema: { type: 'number', default: 12 },
    value: undefined,
    required: false,
    disabled: false,
    readonly: false,
    autofocus: false,
    options: {},
    onChange: vi.fn(),
    onBlur: vi.fn(),
    onFocus: vi.fn(),
    registry,
    ...overrides,
  } satisfies WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>;
}

const renderWidget = (props: WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>) =>
  render(
    <TooltipProvider>
      <ParametersWidget {...props} />
    </TooltipProvider>,
  );

describe('ParametersWidget number hardening', () => {
  it('should render an empty field with the schema default as its placeholder for undefined values', () => {
    renderWidget(widgetProps({ value: undefined }));

    const input = screen.getByRole('spinbutton', { name: 'Input for Width' });
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute('placeholder', '12');
  });

  it('should render an empty field instead of stringifying non-finite values', () => {
    renderWidget(widgetProps({ value: Number.NaN }));

    expect(screen.getByRole('spinbutton', { name: 'Input for Width' })).toHaveValue(null);
    expect(screen.queryByDisplayValue('NaN')).toBeNull();
  });

  it('should preserve the RJSF disabled and readonly contract', () => {
    const { rerender } = renderWidget(widgetProps({ value: 10, disabled: true }));

    expect(screen.getByRole('textbox', { name: 'Input for Width' })).toBeDisabled();

    rerender(
      <TooltipProvider>
        <ParametersWidget {...widgetProps({ value: 10, readonly: true })} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Input for Width' })).toHaveAttribute('readonly');
  });
});

describe('ParametersWidget string contract', () => {
  it('should render absent optional strings as empty instead of "undefined"', () => {
    renderWidget(widgetProps({ name: 'label', schema: { type: 'string' }, value: undefined }));

    expect(screen.getByRole('textbox', { name: 'Input for Label' })).toHaveValue('');
  });

  it('should forward the RJSF id, autofocus, focus, and blur callbacks', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    renderWidget(
      widgetProps({
        id: 'root_label',
        name: 'label',
        schema: { type: 'string' },
        value: 'front',
        autofocus: true,
        onFocus,
        onBlur,
      }),
    );

    const input = screen.getByRole('textbox', { name: 'Input for Label' });
    expect(input).toHaveAttribute('id', 'root_label');
    expect(input).toHaveFocus();
    fireEvent.blur(input);
    expect(onFocus).toHaveBeenCalledWith('root_label', 'front');
    expect(onBlur).toHaveBeenCalledWith('root_label', 'front');
  });

  it.each([
    ['disabled', { disabled: true }],
    ['readonly', { readonly: true }],
  ] as const)('should prevent %s string edits', (_label, state) => {
    const onChange = vi.fn();
    renderWidget(widgetProps({ name: 'label', schema: { type: 'string' }, value: 'front', onChange, ...state }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Input for Label' }), { target: { value: 'back' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ParametersWidget boolean contract', () => {
  it.each([
    ['disabled', { disabled: true }],
    ['readonly', { readonly: true }],
  ] as const)('should prevent %s boolean edits', (_label, state) => {
    const onChange = vi.fn();
    renderWidget(widgetProps({ name: 'enabled', schema: { type: 'boolean' }, value: false, onChange, ...state }));

    const toggle = screen.getByRole('switch', { name: 'Toggle for Enabled' });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});
