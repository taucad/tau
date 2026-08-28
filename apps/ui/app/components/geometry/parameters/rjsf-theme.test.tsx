import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { WidgetProps, RJSFSchema, Registry } from '@rjsf/utils';
import { mock } from 'vitest-mock-extended';
import { templates, uiSchema, widgets } from '#components/geometry/parameters/rjsf-theme.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { rjsfIdPrefix, rjsfIdSeparator } from '#components/geometry/parameters/rjsf-utils.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

const SelectWidget = widgets['SelectWidget']!;

const numberSchema: RJSFSchema = { type: 'number' };
const stringSchema: RJSFSchema = { type: 'string' };

function createWidgetProps(overrides: Partial<WidgetProps>): WidgetProps {
  return {
    id: 'test-select',
    name: 'testField',
    label: 'Test Field',
    schema: numberSchema,
    value: undefined,
    required: false,
    disabled: false,
    readonly: false,
    autofocus: false,
    options: {},
    onChange: vi.fn(),
    onBlur: vi.fn(),
    onFocus: vi.fn(),
    registry: mock<Registry>(),
    ...overrides,
  };
}

const numericEnumOptions = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 40, label: '40' },
];

const labeledNumericEnumOptions = [
  { value: 10, label: 'Low' },
  { value: 20, label: 'Medium' },
  { value: 30, label: 'High' },
];

const stringEnumOptions = [
  { value: 'wood', label: 'wood' },
  { value: 'metal', label: 'metal' },
  { value: 'plastic', label: 'plastic' },
];

describe('SelectWidget', () => {
  describe('numeric enums', () => {
    it('should display the selected value when value is a number', () => {
      const props = createWidgetProps({
        value: 20,
        options: { enumOptions: numericEnumOptions },
      });

      render(<SelectWidget {...props} />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveTextContent('20');
    });

    it('should display the selected value after JSON round-trip (string value with numeric options)', () => {
      const props = createWidgetProps({
        value: '20',
        options: { enumOptions: numericEnumOptions },
      });

      render(<SelectWidget {...props} />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveTextContent('20');
    });

    it('should display labeled text for labeled numeric enums', () => {
      const props = createWidgetProps({
        value: 20,
        options: { enumOptions: labeledNumericEnumOptions },
      });

      render(<SelectWidget {...props} />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveTextContent('Medium');
    });

    it('should display labeled text after JSON round-trip (string value with labeled numeric options)', () => {
      const props = createWidgetProps({
        value: '20',
        options: { enumOptions: labeledNumericEnumOptions },
      });

      render(<SelectWidget {...props} />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveTextContent('Medium');
    });
  });

  describe('string enums', () => {
    it('should display the selected value for string enums', () => {
      const props = createWidgetProps({
        value: 'wood',
        schema: stringSchema,
        options: { enumOptions: stringEnumOptions },
      });

      render(<SelectWidget {...props} />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveTextContent('wood');
    });
  });

  describe('value round-trip stability', () => {
    it('should display correctly when value transitions from number to string after rerender', () => {
      const props = createWidgetProps({
        value: 30,
        options: { enumOptions: numericEnumOptions },
      });

      const { rerender } = render(<SelectWidget {...props} />);

      expect(screen.getByRole('combobox')).toHaveTextContent('30');

      // After a JSON round-trip, value might come back as a string
      rerender(
        <SelectWidget
          {...createWidgetProps({
            value: '30',
            options: { enumOptions: numericEnumOptions },
          })}
        />,
      );

      expect(screen.getByRole('combobox')).toHaveTextContent('30');
    });
  });

  describe('placeholder', () => {
    it('should show placeholder when value is undefined', () => {
      const props = createWidgetProps({
        value: undefined,
        options: { enumOptions: numericEnumOptions },
      });

      render(<SelectWidget {...props} />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveTextContent('Choose an option');
    });
  });
});

describe('fixed-length arrays', () => {
  it('should route tuple schemas to the unsupported-field presentation', () => {
    const formContext: RJSFContext = {
      idPrefix: rjsfIdPrefix,
      rootPresentation: 'catalog',
      searchTerm: '',
      allExpanded: true,
      resetSingleParameter: vi.fn(),
      shouldShowField: () => true,
      units: { length: { symbol: 'mm', factor: 1 } },
    };

    render(
      <Form
        schema={{
          type: 'object',
          properties: {
            background: {
              type: 'array',
              items: [{ type: 'number' }, { type: 'number' }, { type: 'number' }, { type: 'number' }],
            },
          },
        }}
        validator={validator}
        widgets={widgets}
        templates={templates}
        uiSchema={uiSchema}
        idPrefix={rjsfIdPrefix}
        idSeparator={rjsfIdSeparator}
        formContext={formContext}
      />,
    );

    expect(screen.getByLabelText('Invalid Field: background')).toHaveTextContent(
      'Fixed-length tuple fields are not supported.',
    );
  });
});

describe('root presentation', () => {
  const schema: RJSFSchema = {
    type: 'object',
    properties: {
      binary: { type: 'boolean', title: 'Binary', default: false },
      tessellation: {
        type: 'object',
        title: 'Tessellation',
        properties: {
          linearTolerance: { type: 'number', title: 'Linear tolerance', default: 0.01 },
        },
      },
    },
  };

  const renderForm = ({
    idPrefix = rjsfIdPrefix,
    rootPresentation,
    formData,
    resetSingleParameter = vi.fn(),
  }: {
    idPrefix?: string;
    rootPresentation: RJSFContext['rootPresentation'];
    formData?: Record<string, unknown>;
    resetSingleParameter?: RJSFContext['resetSingleParameter'];
  }) => {
    const formContext: RJSFContext = {
      idPrefix,
      rootPresentation,
      searchTerm: '',
      allExpanded: true,
      resetSingleParameter,
      shouldShowField: () => true,
      defaultParameters: { binary: false, tessellation: { linearTolerance: 0.01 } },
      units: { length: { symbol: 'mm', factor: 1 } },
    };

    return render(
      <TooltipProvider>
        <Form
          schema={schema}
          formData={formData}
          validator={validator}
          widgets={widgets}
          templates={templates}
          uiSchema={uiSchema}
          idPrefix={idPrefix}
          idSeparator={rjsfIdSeparator}
          formContext={formContext}
        />
      </TooltipProvider>,
    );
  };

  it('should preserve the Parameters catalog root', () => {
    const { container } = renderForm({ rootPresentation: 'catalog' });

    expect(container.querySelector('[data-slot="parameter-catalog"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="embedded-form-root"]')).toBeNull();
  });

  it('should embed a dynamic Export root while preserving meaningful nested groups', () => {
    const { container } = renderForm({
      idPrefix: `${rjsfIdPrefix}-usdz-options`,
      rootPresentation: 'embedded',
    });

    expect(container.querySelector('[data-slot="parameter-catalog"]')).toBeNull();
    expect(container.querySelector('[data-slot="embedded-form-root"]')).not.toBeNull();
    expect(screen.getByLabelText('Parameter: Binary')).toBeDefined();
    expect(screen.getByLabelText('Group: Tessellation')).toBeDefined();
    expect(screen.queryByLabelText(/^Group:\s*$/)).toBeNull();
  });

  it('should reset an embedded Export field using its dynamic root path', () => {
    const resetSingleParameter = vi.fn();
    renderForm({
      idPrefix: `${rjsfIdPrefix}-usdz-options`,
      rootPresentation: 'embedded',
      formData: { binary: true },
      resetSingleParameter,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset Binary' }));

    expect(resetSingleParameter).toHaveBeenCalledWith(['binary']);
  });
});
