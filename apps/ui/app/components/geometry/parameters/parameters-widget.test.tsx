import { render, screen } from '@testing-library/react';
import type { Registry, RJSFSchema, WidgetProps } from '@rjsf/utils';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ParametersWidget } from '#components/geometry/parameters/parameters-widget.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';

const formContext: RJSFContext = {
  searchTerm: '',
  allExpanded: true,
  resetSingleParameter: vi.fn(),
  shouldShowField: () => true,
  units: { length: { symbol: 'mm', factor: 1 } },
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

describe('ParametersWidget number hardening', () => {
  it('should render an empty field with the schema default as its placeholder for undefined values', () => {
    render(<ParametersWidget {...widgetProps({ value: undefined })} />);

    const input = screen.getByRole('spinbutton', { name: 'Input for Width' });
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute('placeholder', '12');
  });

  it('should render an empty field instead of stringifying non-finite values', () => {
    render(<ParametersWidget {...widgetProps({ value: Number.NaN })} />);

    expect(screen.getByRole('spinbutton', { name: 'Input for Width' })).toHaveValue(null);
    expect(screen.queryByDisplayValue('NaN')).toBeNull();
  });
});
