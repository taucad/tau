import type { RJSFSchema, WidgetProps } from '@rjsf/utils';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { ParametersNumber } from '#components/geometry/parameters/parameters-number.js';
import { ParametersString } from '#components/geometry/parameters/parameters-string.js';
import { toTitleCase } from '#utils/string.utils.js';
import { getDescriptor } from '#constants/build-parameters.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';

export function ParametersWidget(
  props: WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RJSF is untyped
  const { value, onChange, name, schema, registry } = props;

  const { formContext } = registry;

  const prettyLabel = name ? toTitleCase(name) : '';
  const defaultValue = schema.default as string | number | boolean | undefined;
  const type = schema.type as 'boolean' | 'integer' | 'number' | 'string';

  switch (type) {
    case 'boolean': {
      const booleanValue = Boolean(value);

      return <ParametersBoolean value={booleanValue} aria-label={`Toggle for ${prettyLabel}`} onChange={onChange} />;
    }

    case 'number':
    case 'integer': {
      const numericValue = Number.parseFloat(String(value));
      const defaultNumericValue = Number.parseFloat(String(defaultValue));
      const min = schema.minimum;
      const max = schema.maximum;
      const step = schema.multipleOf;
      const descriptor = getDescriptor(name);

      return (
        <ParametersNumber
          className="w-26"
          value={numericValue}
          defaultValue={defaultNumericValue}
          descriptor={descriptor}
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
