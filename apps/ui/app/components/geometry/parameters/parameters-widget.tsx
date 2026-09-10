import type { RJSFSchema, WidgetProps } from '@rjsf/utils';
import { getSchemaType } from '@rjsf/utils';
import { quantityRegistry } from '@taucad/units/constants';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { ParametersNumber } from '#components/geometry/parameters/parameters-number.js';
import { ParametersString } from '#components/geometry/parameters/parameters-string.js';
import { formatDisplayLabel } from '#utils/string.utils.js';
import { getDescriptor } from '#constants/project-parameters.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { Input } from '@taucad/ui/components/input';

function getQuantityUnit(schema: Readonly<Record<string, unknown>>): string | undefined {
  if (!Object.hasOwn(schema, 'x-tau-quantity')) {
    return undefined;
  }

  const quantityId = schema['x-tau-quantity'];
  if (typeof quantityId !== 'string' || !Object.hasOwn(quantityRegistry, quantityId)) {
    throw new Error(`Unsupported x-tau-quantity: ${String(quantityId)}`);
  }

  const quantity = Object.entries(quantityRegistry).find(([id]) => id === quantityId)?.[1];
  const canonicalUnit = quantity
    ? Object.entries(quantity.units).find(([unitId]) => unitId === quantity.canonicalUnit)?.[1]
    : undefined;
  if (!canonicalUnit) {
    throw new Error(`Quantity ${quantityId} has no canonical unit`);
  }

  return canonicalUnit.symbol;
}

export function ParametersWidget(
  props: WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.JSX.Element {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RJSF is untyped
  const { id, value, onChange, onBlur, onFocus, name, schema, registry, disabled, readonly, autofocus } = props;

  const { formContext } = registry;

  const prettyLabel = name ? formatDisplayLabel(name) : '';
  const defaultValue = schema.default as string | number | boolean | undefined;
  const type =
    Array.isArray(schema.type) && !(schema.type.length === 2 && schema.type.includes('null'))
      ? undefined
      : getSchemaType(schema);
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
      const numericValue = value === null ? Number.NaN : typeof value === 'number' ? value : Number(value);
      const defaultNumericValue = typeof defaultValue === 'number' ? defaultValue : Number.NaN;
      const min = schema.minimum;
      const max = schema.maximum;
      const step = schema.multipleOf;
      const displayDescriptor = formContext.displayDescriptors?.[name];
      const quantityUnit = getQuantityUnit(schema);
      const isConfiguration = formContext.parameterSemantics === 'configuration';
      const descriptor = quantityUnit
        ? 'quantity'
        : (displayDescriptor?.descriptor ?? (isConfiguration ? 'unitless' : getDescriptor(name)));
      const unitOverride = quantityUnit ?? displayDescriptor?.unit ?? (isConfiguration ? '' : undefined);

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
          unitOverride={unitOverride}
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
      throw new Error(`Unsupported type: ${String(schema.type)}`);
    }
  }
}
