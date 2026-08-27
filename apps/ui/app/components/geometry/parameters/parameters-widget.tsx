import type { RJSFSchema, WidgetProps } from '@rjsf/utils';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { ParametersNumber } from '#components/geometry/parameters/parameters-number.js';
import { ParametersString } from '#components/geometry/parameters/parameters-string.js';
import { formatDisplayLabel } from '#utils/string.utils.js';
import { getDescriptor } from '#constants/project-parameters.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { Input } from '#components/ui/input.js';

export function ParametersWidget(
  props: WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.JSX.Element {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RJSF is untyped
  const { value, onChange, name, schema, registry } = props;

  const { formContext } = registry;

  const prettyLabel = name ? formatDisplayLabel(name) : '';
  const defaultValue = schema.default as string | number | boolean | undefined;
  const type = schema.type as 'boolean' | 'integer' | 'number' | 'string';

  switch (type) {
    case 'boolean': {
      const booleanValue = Boolean(value);

      return <ParametersBoolean value={booleanValue} aria-label={`Toggle for ${prettyLabel}`} onChange={onChange} />;
    }

    case 'number':
    case 'integer': {
      const numericValue = typeof value === 'number' ? value : Number(value);
      const defaultNumericValue = typeof defaultValue === 'number' ? defaultValue : Number(defaultValue);
      const min = schema.minimum;
      const max = schema.maximum;
      const step = schema.multipleOf;
      const displayDescriptor = formContext.displayDescriptors?.[name];
      const descriptor = displayDescriptor?.descriptor ?? getDescriptor(name);

      if (!Number.isFinite(numericValue)) {
        return (
          <Input
            type='number'
            value=''
            placeholder={Number.isFinite(defaultNumericValue) ? String(defaultNumericValue) : undefined}
            aria-label={`Input for ${prettyLabel}`}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              onChange(Number.isFinite(next) ? next : undefined);
            }}
          />
        );
      }

      return (
        <ParametersNumber
          value={numericValue}
          defaultValue={Number.isFinite(defaultNumericValue) ? defaultNumericValue : numericValue}
          descriptor={descriptor}
          unitOverride={displayDescriptor?.unit}
          min={min}
          max={max}
          step={step}
          units={formContext.units}
          aria-label={`Input for ${prettyLabel}`}
          onChange={onChange}
        />
      );
    }

    case 'string': {
      const stringValue = String(value);
      const defaultStringValue = String(defaultValue);

      return (
        <ParametersString
          value={stringValue}
          defaultValue={defaultStringValue}
          aria-label={`Input for ${prettyLabel}`}
          onChange={onChange}
        />
      );
    }

    default: {
      const exhaustiveCheck: never = type;
      throw new Error(`Unsupported type: ${String(exhaustiveCheck)}`);
    }
  }
}
