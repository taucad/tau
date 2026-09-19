import { fireEvent, render, screen } from '@testing-library/react';
import type { Registry, RJSFSchema, WidgetProps } from '@rjsf/utils';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ParametersWidget } from '#components/geometry/parameters/parameters-widget.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

vi.mock('#components/geometry/parameters/rjsf-field-path.js', () => ({
  toInstancePointer: (path: readonly string[]) =>
    `/${path.map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`,
  useRenderedFieldPath: () => ({ fieldId: 'root_width', path: ['width'], isArrayItem: false }),
}));

const formContext: RJSFContext = {
  idPrefix: '///root',
  rootPresentation: 'catalog',
  searchTerm: '',
  allExpanded: true,
  resetSingleParameter: vi.fn(),
  shouldShowField: () => true,
  units: { length: { displaySymbol: 'mm' } },
  parameterManifest: {
    bindings: {},
    bindingDeclarations: {},
    provenance: {},
  } as unknown as RJSFContext['parameterManifest'],
  parameterEdit: { kind: 'transient' },
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
  it('should preserve nullable numbers as empty rather than coercing null to zero', () => {
    const onChange = vi.fn();
    renderWidget(
      widgetProps({
        value: null,
        schema: { type: ['number', 'null'], default: 12 },
        onChange,
      }),
    );

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

  it('should keep unknown numbers unit-free', () => {
    const { container } = renderWidget(widgetProps({ value: 10 }));

    expect(screen.queryByText('mm')).toBeNull();
    expect(container.querySelector('[data-slot="slider-input"]')).toHaveClass('px-2');
  });

  it('should keep unannotated configuration numbers unit-free', async () => {
    const onChange = vi.fn();
    const props = widgetProps({ name: 'width', value: 10, onChange });
    const { container } = renderWidget(props);

    expect(screen.queryByText('mm')).toBeNull();
    expect(container.querySelector('[data-slot="slider-input"]')).toHaveClass('px-2');
    expect(container.querySelector('[data-slot="slider-input-adornment"]')).toBeNull();
    const input = screen.getByRole('textbox', { name: 'Input for Width' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it('should render a producer-declared dimensionless symbol from the manifest', () => {
    const props = widgetProps({ name: 'width', value: 10 });
    props.registry.formContext = {
      ...formContext,
      parameterManifest: {
        bindings: {
          '/width': {
            parameter: { value: 'width', stability: 'stable' },
            schema: { resource: 'urn:taucad:test:configuration', pointer: '/properties/width' },
            representation: 'binary64',
            optional: false,
            nullable: false,
            unit: '1',
            symbol: 'px',
            space: 'linear',
            constraints: {},
          },
        },
        bindingDeclarations: {},
        provenance: {},
      } as unknown as RJSFContext['parameterManifest'],
    };
    renderWidget(props);

    expect(screen.getByText('px')).toBeInTheDocument();
    expect(screen.queryByText('mm')).toBeNull();
  });
});

describe('ParametersWidget nullable default', () => {
  it('should not display a null default as a zero placeholder', () => {
    renderWidget(
      widgetProps({
        name: 'amount',
        schema: { type: ['number', 'null'], default: null },
        value: null,
      }),
    );

    const input = screen.getByRole('spinbutton', { name: 'Input for Amount' });
    expect(input).toHaveValue(null);
    expect(input).not.toHaveAttribute('placeholder');
  });
});

describe('ParametersWidget string contract', () => {
  it('should render absent optional strings as empty instead of "undefined"', () => {
    renderWidget(
      widgetProps({
        name: 'label',
        schema: { type: 'string' },
        value: undefined,
      }),
    );

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
    renderWidget(
      widgetProps({
        name: 'label',
        schema: { type: 'string' },
        value: 'front',
        onChange,
        ...state,
      }),
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Input for Label' }), {
      target: { value: 'back' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ParametersWidget boolean contract', () => {
  it.each([
    ['disabled', { disabled: true }],
    ['readonly', { readonly: true }],
  ] as const)('should prevent %s boolean edits', (_label, state) => {
    const onChange = vi.fn();
    renderWidget(
      widgetProps({
        name: 'enabled',
        schema: { type: 'boolean' },
        value: false,
        onChange,
        ...state,
      }),
    );

    const toggle = screen.getByRole('switch', { name: 'Toggle for Enabled' });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ParametersWidget authoritative commits', () => {
  it('commits a boolean as one field instead of replacing the whole group', () => {
    const setValue = vi.fn(async () => undefined);
    const onChange = vi.fn();
    const props = widgetProps({ name: 'width', schema: { type: 'boolean' }, value: false, onChange });
    props.registry.formContext = {
      ...formContext,
      parameterEdit: {
        kind: 'authoritative',
        commit: {
          target: { authority: 'test', root: '/', entry: 'main.ts' },
          group: 'default',
          editorInstance: 'editor',
          draft: vi.fn(),
          setDraft: vi.fn(),
          subscribeDrafts: vi.fn(() => () => undefined),
          commit: vi.fn(async () => undefined),
          setValue,
        },
      },
    };
    renderWidget(props);

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle for Width' }));

    expect(setValue).toHaveBeenCalledWith({ pointer: '/width', value: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps transient forms on the RJSF change path', () => {
    const onChange = vi.fn();
    renderWidget(widgetProps({ name: 'width', schema: { type: 'boolean' }, value: false, onChange }));

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle for Width' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('admits the empty numeric fallback through the numeric constraints', () => {
    const onChange = vi.fn();
    renderWidget(widgetProps({ value: undefined, schema: { type: 'number', minimum: 0, maximum: 10 }, onChange }));
    const input = screen.getByRole('spinbutton', { name: 'Input for Width' });

    fireEvent.change(input, { target: { value: '-3' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
