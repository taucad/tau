import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Registry, RJSFSchema, WidgetProps } from '@rjsf/utils';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ParametersWidget } from '#components/geometry/parameters/parameters-widget.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const formContext: RJSFContext = {
  idPrefix: '///root',
  parameterSemantics: 'legacy-cad',
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

function withParameterSemantics(parameterSemantics: RJSFContext['parameterSemantics']): RJSFContext {
  return { ...formContext, parameterSemantics };
}

const renderWidget = (props: WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>) =>
  render(
    <TooltipProvider>
      <ParametersWidget {...props} />
    </TooltipProvider>,
  );

describe('ParametersWidget number hardening', () => {
  it('should preserve nullable numbers as empty rather than coercing null to zero', () => {
    const onChange = vi.fn();
    renderWidget(widgetProps({ value: null, schema: { type: ['number', 'null'], default: 12 }, onChange }));

    expect(screen.getByRole('spinbutton', { name: 'Input for Width' })).toHaveValue(null);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Input for Width' }), { target: { value: '3' } });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('should not select an arbitrary scalar from an unsupported union', () => {
    expect(() => renderWidget(widgetProps({ schema: { type: ['number', 'string'] } }))).toThrow(
      'Unsupported type: number,string',
    );
  });

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

  it('should retain the legacy CAD name heuristic', () => {
    const { container } = renderWidget(widgetProps({ value: 10 }));

    expect(screen.getByText('mm')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="slider-input"]')).toHaveClass('pl-2');
  });

  it('should keep unannotated configuration numbers unit-free', async () => {
    const onChange = vi.fn();
    const props = widgetProps({ name: 'width', value: 10, onChange });
    props.registry.formContext = withParameterSemantics('configuration');
    const { container } = renderWidget(props);

    expect(screen.queryByText('mm')).toBeNull();
    expect(container.querySelector('[data-slot="slider-input"]')).toHaveClass('px-2');
    expect(container.querySelector('[data-slot="slider-input-adornment"]')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Input for Width' }), { target: { value: '12' } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(12);
    });
  });

  it('should give a quantity annotation precedence and preserve canonical constraints', async () => {
    const onChange = vi.fn();
    const props = widgetProps({
      name: 'count',
      value: 0.001,
      schema: {
        type: 'number',
        default: 0.001,
        minimum: 0.0005,
        maximum: 0.01,
        multipleOf: 0.0005,
        'x-tau-quantity': 'length',
      },
      onChange,
    });
    props.registry.formContext = {
      ...withParameterSemantics('configuration'),
      units: { length: { sourceSymbol: 'm', displaySymbol: 'mm' } },
    };
    const { container } = renderWidget(props);

    expect(screen.getByText('m')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Input for Count' })).toHaveValue('0.001');
    expect(container.querySelector('[data-slot="slider-input-fill"]')).toHaveStyle({
      width: '5.2631578947368425%',
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Input for Count' }), { target: { value: '0.002' } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(0.002);
    });
  });

  it('should preserve explicit configuration display descriptors when no quantity is annotated', () => {
    const props = widgetProps({ name: 'width', value: 10 });
    props.registry.formContext = {
      ...withParameterSemantics('configuration'),
      displayDescriptors: { width: { descriptor: 'count', unit: 'px' } },
    };
    renderWidget(props);

    expect(screen.getByText('×')).toBeInTheDocument();
    expect(screen.queryByText('mm')).toBeNull();
  });

  it('should refuse an unknown quantity annotation instead of guessing from its name', () => {
    const props = widgetProps({
      value: 10,
      schema: { type: 'number', 'x-tau-quantity': 'distance' },
    });
    props.registry.formContext = withParameterSemantics('configuration');

    expect(() => renderWidget(props)).toThrow('Unsupported x-tau-quantity: distance');
  });
});

describe('ParametersWidget nullable default', () => {
  it('should not display a null default as a zero placeholder', () => {
    renderWidget(widgetProps({ name: 'amount', schema: { type: ['number', 'null'], default: null }, value: null }));

    const input = screen.getByRole('spinbutton', { name: 'Input for Amount' });
    expect(input).toHaveValue(null);
    expect(input).not.toHaveAttribute('placeholder');
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
