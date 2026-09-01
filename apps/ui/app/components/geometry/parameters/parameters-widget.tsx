import type { RJSFSchema, WidgetProps } from '@rjsf/utils';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { ParametersNumber } from '#components/geometry/parameters/parameters-number.js';
import { ParametersString } from '#components/geometry/parameters/parameters-string.js';
import { formatDisplayLabel } from '#utils/string.utils.js';
import { getDescriptor } from '#constants/project-parameters.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { Input } from '@taucad/ui/components/input';

export function ParametersWidget(
  props: WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.JSX.Element {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RJSF is untyped
  const { id, value, onChange, onBlur, onFocus, name, schema, registry, disabled, readonly, autofocus } = props;

  const { formContext } = registry;

  const prettyLabel = name ? formatDisplayLabel(name) : '';
  const defaultValue = schema.default as string | number | boolean | undefined;
  const type = schema.type as 'boolean' | 'integer' | 'number' | 'string';
  const isDisabled = disabled === true || readonly === true;
  const handleChange = (newValue: unknown) => {
    if (!isDisabled) {
      onChange(newValue);
    }
  };

  switch (type) {
    case 'boolean': {
      const booleanValue = Boolean(value);

      return (
        <ParametersBoolean
          id={id}
          value={booleanValue}
          disabled={isDisabled}
          autoFocus={autofocus}
          aria-label={`Toggle for ${prettyLabel}`}
          onFocus={() => {
            onFocus(id, value);
          }}
          onBlur={() => {
            onBlur(id, value);
          }}
          onChange={handleChange}
        />
      );
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
            id={id}
            type='number'
            value=''
            disabled={disabled}
            readOnly={readonly}
            autoFocus={autofocus}
            placeholder={Number.isFinite(defaultNumericValue) ? String(defaultNumericValue) : undefined}
            aria-label={`Input for ${prettyLabel}`}
            onFocus={() => {
              onFocus(id, value);
            }}
            onBlur={() => {
              onBlur(id, value);
            }}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              handleChange(Number.isFinite(next) ? next : undefined);
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
          id={id}
          disabled={disabled}
          readOnly={readonly}
          autoFocus={autofocus}
          aria-label={`Input for ${prettyLabel}`}
          onFocus={() => {
            onFocus(id, value);
          }}
          onBlur={() => {
            onBlur(id, value);
          }}
          onChange={handleChange}
        />
      );
    }

    case 'string': {
      const stringValue = typeof value === 'string' ? value : '';
      const defaultStringValue = typeof defaultValue === 'string' ? defaultValue : '';

      return (
        <ParametersString
          value={stringValue}
          defaultValue={defaultStringValue}
          id={id}
          disabled={disabled}
          readOnly={readonly}
          autoFocus={autofocus}
          aria-label={`Input for ${prettyLabel}`}
          onFocus={() => {
            onFocus(id, value);
          }}
          onBlur={() => {
            onBlur(id, value);
          }}
          onChange={handleChange}
        />
      );
    }

    default: {
      const exhaustiveCheck: never = type;
      throw new Error(`Unsupported type: ${String(exhaustiveCheck)}`);
    }
  }
}
