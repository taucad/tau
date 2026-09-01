import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { WidgetProps, RJSFSchema, Registry } from '@rjsf/utils';
import { mock } from 'vitest-mock-extended';
import { templates, uiSchema, widgets } from '#components/geometry/parameters/rjsf-theme.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import {
  rjsfDefaultFormStateBehavior,
  rjsfIdPrefix,
  rjsfIdSeparator,
} from '#components/geometry/parameters/rjsf-utils.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const SelectWidget = widgets['SelectWidget']!;
const CheckboxWidget = widgets['CheckboxWidget']!;
const EmailWidget = widgets['EmailWidget']!;

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

const createOnChange = () =>
  vi.fn<(data: IChangeEvent<Record<string, unknown>, RJSFSchema, RJSFContext>, id?: string) => void>();

const renderSchemaForm = ({
  schema,
  formData,
  defaultParameters = formData ?? {},
  searchTerm = '',
  allExpanded = true,
  onChange = createOnChange(),
}: {
  schema: RJSFSchema;
  formData?: Record<string, unknown>;
  defaultParameters?: Record<string, unknown>;
  searchTerm?: string;
  allExpanded?: boolean;
  onChange?: ReturnType<typeof createOnChange>;
}) => {
  const formContext: RJSFContext = {
    idPrefix: rjsfIdPrefix,
    rootPresentation: 'catalog',
    searchTerm,
    allExpanded,
    resetSingleParameter: vi.fn(),
    shouldShowField: () => true,
    defaultParameters,
    units: { length: { sourceSymbol: 'mm', displaySymbol: 'mm' } },
  };

  render(
    <TooltipProvider>
      <Form
        schema={schema}
        // @ts-expect-error -- TODO: fix this (mirrors parameters.tsx; rjsf-theme exports use default any generics)
        validator={validator}
        widgets={widgets}
        // @ts-expect-error -- TODO: fix this (mirrors parameters.tsx; rjsf-theme exports use default any generics)
        templates={templates}
        // @ts-expect-error -- TODO: fix this (mirrors parameters.tsx; rjsf-theme exports use default any generics)
        uiSchema={uiSchema}
        idPrefix={rjsfIdPrefix}
        idSeparator={rjsfIdSeparator}
        formContext={formContext}
        formData={formData}
        experimental_defaultFormStateBehavior={rjsfDefaultFormStateBehavior}
        onChange={onChange}
      />
    </TooltipProvider>,
  );

  return onChange;
};

describe('SelectWidget', () => {
  describe('numeric enums', () => {
    it('should emit the original numeric enum value after selection', async () => {
      Element.prototype.scrollIntoView = vi.fn();
      Element.prototype.hasPointerCapture = vi.fn(() => false);
      Element.prototype.setPointerCapture = vi.fn();
      Element.prototype.releasePointerCapture = vi.fn();
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <SelectWidget {...createWidgetProps({ value: 10, options: { enumOptions: numericEnumOptions }, onChange })} />,
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: '20' }));
      expect(onChange).toHaveBeenCalledWith(20);
    });

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

  it('should forward native identity, disabled, focus, and blur semantics', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { rerender } = render(
      <SelectWidget
        {...createWidgetProps({
          id: 'material-select',
          value: 'wood',
          schema: stringSchema,
          options: { enumOptions: stringEnumOptions },
          onFocus,
          onBlur,
        })}
      />,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('id', 'material-select');
    fireEvent.focus(trigger);
    fireEvent.blur(trigger);
    expect(onFocus).toHaveBeenCalledWith('material-select', 'wood');
    expect(onBlur).toHaveBeenCalledWith('material-select', 'wood');

    rerender(
      <SelectWidget
        {...createWidgetProps({
          id: 'material-select',
          value: 'wood',
          schema: stringSchema,
          options: { enumOptions: stringEnumOptions },
          disabled: true,
        })}
      />,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});

describe('primitive widget contract', () => {
  it.each([
    ['disabled', { disabled: true }],
    ['readonly', { readonly: true }],
  ] as const)('should prevent %s checkbox edits', (_label, state) => {
    const onChange = vi.fn();
    render(<CheckboxWidget {...createWidgetProps({ value: false, onChange, ...state })} />);

    const checkbox = screen.getByRole('switch');
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should forward the simple-input contract without emitting readonly changes', () => {
    const onChange = vi.fn();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(
      <EmailWidget
        {...createWidgetProps({
          id: 'email-input',
          name: 'email',
          value: 'hello@example.com',
          schema: stringSchema,
          readonly: true,
          autofocus: true,
          onChange,
          onFocus,
          onBlur,
        })}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Input for Email' });
    expect(input).toHaveAttribute('id', 'email-input');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'changed@example.com' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(onFocus).toHaveBeenCalledWith('email-input', 'hello@example.com');
    expect(onBlur).toHaveBeenCalledWith('email-input', 'hello@example.com');
  });
});

describe('fixed-length arrays', () => {
  it('should render and edit tuple items without variable-array controls', () => {
    const onChange = vi.fn();
    const formContext: RJSFContext = {
      idPrefix: rjsfIdPrefix,
      rootPresentation: 'catalog',
      searchTerm: '',
      allExpanded: true,
      resetSingleParameter: vi.fn(),
      shouldShowField: () => true,
      units: { length: { sourceSymbol: 'mm', displaySymbol: 'mm' } },
    };

    render(
      <TooltipProvider>
        <Form
          schema={{
            type: 'object',
            properties: {
              point: {
                type: 'array',
                items: [{ type: 'number' }, { type: 'number' }, { type: 'number' }],
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
          formData={{ point: [0, 0.25, 0.5] }}
          onChange={onChange}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByLabelText('Invalid Field: background')).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /add item/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();

    fireEvent.change(screen.getAllByRole('textbox')[1]!, { target: { value: '0.75' } });
    expect(onChange.mock.lastCall?.[0].formData).toEqual({ point: [0, 0.75, 0.5] });
  });

  it('should preserve Add and Remove controls for homogeneous arrays', () => {
    const formContext: RJSFContext = {
      idPrefix: rjsfIdPrefix,
      rootPresentation: 'catalog',
      searchTerm: '',
      allExpanded: true,
      resetSingleParameter: vi.fn(),
      shouldShowField: () => true,
      units: { length: { sourceSymbol: 'mm', displaySymbol: 'mm' } },
    };

    render(
      <TooltipProvider>
        <Form
          schema={{
            type: 'object',
            properties: { tags: { type: 'array', title: 'Tags', items: { type: 'string' } } },
          }}
          validator={validator}
          widgets={widgets}
          templates={templates}
          uiSchema={uiSchema}
          idPrefix={rjsfIdPrefix}
          idSeparator={rjsfIdSeparator}
          formContext={formContext}
          formData={{ tags: ['one'] }}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Add item (Tags)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Tags 1' })).toBeInTheDocument();
  });
});

describe('composite fields', () => {
  it('should render a discriminated union as one full-width semantic group', () => {
    renderSchemaForm({
      schema: {
        type: 'object',
        properties: {
          camera: {
            title: 'Camera',
            oneOf: [
              {
                title: 'Fit',
                type: 'object',
                properties: {
                  framing: { const: 'fit' },
                  margin: { type: 'number', default: 0.1 },
                  projection: {
                    title: 'Projection',
                    oneOf: [
                      {
                        title: 'Perspective',
                        type: 'object',
                        properties: { kind: { const: 'perspective' }, fieldOfView: { type: 'number', default: 45 } },
                        required: ['kind'],
                      },
                      {
                        title: 'Orthographic',
                        type: 'object',
                        properties: { kind: { const: 'orthographic' } },
                        required: ['kind'],
                      },
                    ],
                  },
                },
                required: ['framing'],
              },
              {
                title: 'Fixed',
                type: 'object',
                properties: { framing: { const: 'fixed' }, distance: { type: 'number', default: 3 } },
                required: ['framing'],
              },
            ],
          },
        },
      },
      formData: {
        camera: { framing: 'fit', margin: 0.1, projection: { kind: 'perspective', fieldOfView: 45 } },
      },
    });

    const cameraTrigger = screen.getByRole('button', { name: 'Group: Camera' });
    const cameraContent = cameraTrigger
      .closest('[data-slot="parameter-group"]')
      ?.querySelector(':scope > [data-slot="parameter-group-content"]');
    expect(screen.getAllByRole('button', { name: 'Group: Camera' })).toHaveLength(1);
    expect(cameraContent).toHaveClass('[&>.panel>.form-group]:flex', '[&>.panel>.form-group]:justify-end');
    expect(screen.getByRole('combobox', { name: 'Select for Framing' })).toHaveTextContent('Fit');
    expect(screen.getByRole('button', { name: 'Group: Projection' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select for Kind' })).toHaveTextContent('Perspective');
    expect(screen.queryByText('Option 1')).toBeNull();
    expect(screen.queryByLabelText('Parameter: Framing')).toBeNull();
    expect(screen.queryByLabelText('Parameter: Kind')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset Framing' })).toBeNull();
  });

  it('should open a matching composite group while filtering', () => {
    renderSchemaForm({
      schema: {
        type: 'object',
        properties: {
          camera: {
            title: 'Camera',
            oneOf: [
              {
                title: 'Fit',
                type: 'object',
                properties: { framing: { const: 'fit' }, margin: { type: 'number' } },
                required: ['framing'],
              },
              {
                title: 'Fixed',
                type: 'object',
                properties: { framing: { const: 'fixed' }, position: { type: 'number' } },
                required: ['framing'],
              },
            ],
          },
        },
      },
      formData: { camera: { framing: 'fit', margin: 0.1 } },
      searchTerm: 'margin',
      allExpanded: false,
    });

    expect(screen.getByRole('button', { name: 'Group: Camera' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Parameter: Margin')).toBeInTheDocument();
  });

  it('should preserve independent discriminated-union branches inside object-array items', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    const user = userEvent.setup();
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        views: {
          title: 'Views',
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              camera: {
                title: 'Camera',
                oneOf: [
                  {
                    title: 'Fit',
                    type: 'object',
                    properties: {
                      framing: { const: 'fit' },
                      margin: { type: 'number', default: 0.1 },
                    },
                    required: ['framing', 'margin'],
                  },
                  {
                    title: 'Fixed',
                    type: 'object',
                    properties: {
                      framing: { const: 'fixed' },
                      distance: { type: 'number', default: 3 },
                    },
                    required: ['framing', 'distance'],
                  },
                ],
              },
            },
            required: ['id', 'camera'],
          },
        },
      },
    };
    const onChange = renderSchemaForm({
      schema,
      formData: {
        views: [
          { id: 'first', camera: { framing: 'fit', margin: 0.1 } },
          { id: 'second', camera: { framing: 'fit', margin: 0.1 } },
        ],
      },
    });

    const framingSelectors = screen.getAllByRole('combobox', { name: 'Select for Framing' });
    expect(framingSelectors).toHaveLength(2);
    await user.click(framingSelectors[0]!);
    await user.click(screen.getByRole('option', { name: 'Fixed' }));

    const emitted = onChange.mock.lastCall![0].formData!;
    expect(emitted).toMatchObject({
      views: [
        { id: 'first', camera: { framing: 'fixed', distance: 3 } },
        { id: 'second', camera: { framing: 'fit', margin: 0.1 } },
      ],
    });
    expect(validator.validateFormData(emitted, schema).errors).toEqual([]);
  });

  it('should give object-array items full width and place the quiet remove action in the item header', () => {
    const onChange = renderSchemaForm({
      schema: {
        type: 'object',
        properties: {
          visiblePrimitives: {
            type: 'array',
            title: 'Visible Primitives',
            items: {
              type: 'object',
              properties: {
                nodeIndex: { type: 'integer', default: 0 },
                meshIndex: { type: 'integer', default: 0 },
                primitiveIndex: { type: 'integer', default: 0 },
              },
            },
          },
        },
      },
      formData: { visiblePrimitives: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }] },
    });

    const itemTrigger = screen.getByRole('button', { name: 'Group: Visible Primitives 1' });
    const remove = screen.getByRole('button', { name: 'Remove Visible Primitives 1' });
    const itemHeader = itemTrigger.closest('[data-slot="parameter-group-header"]');
    const outerContent = screen
      .getByRole('button', { name: 'Group: Visible Primitives' })
      .closest('[data-slot="parameter-group"]')
      ?.querySelector(':scope > [data-slot="parameter-group-content"]');
    expect(itemTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(itemHeader).toContainElement(remove);
    expect(itemHeader).toHaveClass('rounded-md', 'hover:bg-accent');
    expect(itemTrigger).toHaveClass('hover:bg-transparent');
    expect(outerContent).toHaveClass('px-2.5');
    expect(remove).not.toHaveClass('bg-destructive');

    fireEvent.click(remove);

    expect(itemTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(onChange.mock.lastCall?.[0].formData).toEqual({ visiblePrimitives: [] });
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
      units: { length: { sourceSymbol: 'mm', displaySymbol: 'mm' } },
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
