import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FieldProps, RJSFSchema } from '@rjsf/utils';
import type { ParameterManifest } from '@taucad/parameters';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import type { ParameterEdit, Units } from '#components/geometry/parameters/rjsf-context.js';
import type * as NumberFieldModule from '#components/geometry/parameters/parameters-number-field.js';
import type * as RjsfCoreModule from '@rjsf/core';

/** Renders of each number row and of each RJSF field wrapper, counted where they call into RJSF. */
const renders = vi.hoisted(() => ({ numberRow: 0, fieldWrapper: 0 }));

vi.mock('#components/geometry/parameters/parameters-number-field.js', async (importOriginal) => {
  const actual = await importOriginal<typeof NumberFieldModule>();
  return {
    ...actual,
    ParametersNumberField: (props: ComponentProps<typeof actual.ParametersNumberField>) => {
      renders.numberRow += 1;
      return createElement(actual.ParametersNumberField, props);
    },
  };
});

vi.mock('@rjsf/core', async (importOriginal) => {
  const actual = await importOriginal<typeof RjsfCoreModule>();
  return {
    ...actual,
    getDefaultRegistry: () => {
      const registry = actual.getDefaultRegistry();
      const DefaultSchemaField = registry.fields['SchemaField']!;
      return {
        ...registry,
        fields: {
          ...registry.fields,
          SchemaField: (props: FieldProps) => {
            renders.fieldWrapper += 1;
            return createElement(DefaultSchemaField, props);
          },
        },
      };
    },
  };
});

const fieldCount = 8;
const names = Array.from({ length: fieldCount }, (_, index) => `width${index}`);
const schema: RJSFSchema = {
  type: 'object',
  properties: Object.fromEntries(names.map((name) => [name, { type: 'number', default: 10 }])),
};
const defaults = Object.fromEntries(names.map((name) => [name, 10]));
const units: Units = { length: { displaySymbol: 'mm' } };
const manifest = { bindings: {}, bindingDeclarations: {}, provenance: {} } as unknown as ParameterManifest;
const edit: ParameterEdit = { kind: 'transient' };
const onParametersChange = vi.fn();

const form = (parameters: Record<string, unknown>): React.JSX.Element => (
  <TooltipProvider>
    <Parameters
      parameters={parameters}
      defaultParameters={defaults}
      jsonSchema={schema}
      units={units}
      parameterManifest={manifest}
      parameterEdit={edit}
      onParametersChange={onParametersChange}
    />
  </TooltipProvider>
);

describe('Parameters render counts', () => {
  it('re-renders only the changed field and its ancestors when one value changes', () => {
    const view = render(form({}));
    renders.fieldWrapper = 0;
    renders.numberRow = 0;

    view.rerender(form({ width3: 12 }));

    expect(renders.fieldWrapper).toBeLessThanOrEqual(3);
    expect(renders.numberRow).toBe(1);
  });

  it('re-renders no number row that stays visible while the filter is typed', async () => {
    const user = userEvent.setup();
    render(form({}));
    const filter = screen.getByPlaceholderText('Filter parameters…');
    renders.numberRow = 0;

    await user.type(filter, 'wid');

    expect(screen.getAllByRole('spinbutton')).toHaveLength(fieldCount);
    expect(renders.numberRow).toBe(0);
  });
});
