import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { RJSFSchema, WidgetProps } from '@rjsf/utils';
import { getSchemaType } from '@rjsf/utils';
import { projectParameterField, resolveParameterBinding } from '@taucad/parameters';
import { admitUnit } from '@taucad/units/unit';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { ParametersNumber, toNativeValue } from '#components/geometry/parameters/parameters-number.js';
import { ParametersNumberOrString, ParametersString } from '#components/geometry/parameters/parameters-string.js';
import { formatDisplayLabel } from '#utils/string.utils.js';
import { toUcumLengthCode } from '#constants/length-units.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { toInstancePointer, useRenderedFieldPath } from '#components/geometry/parameters/rjsf-field-path.js';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@taucad/ui/components/input-group';
import { validateParameterInputValue } from '#components/geometry/parameters/parameter-field.js';
import { toast } from '#components/ui/sonner.js';

const numericConstraint = (
  constraints: Readonly<Record<string, unknown>> | undefined,
  key: 'default' | 'maximum' | 'minimum' | 'multipleOf',
): number | undefined => {
  const value = constraints?.[key];
  return typeof value === 'number' ? value : undefined;
};

const isLengthUnit = (unit: string | undefined): boolean => {
  if (unit === undefined) {
    return false;
  }
  const admitted = admitUnit(unit);
  return (
    admitted.status === 'success' &&
    Object.entries(admitted.value.dimension).every(
      ([dimension, exponent]) => exponent === (dimension === 'length' ? 1 : 0),
    )
  );
};

/** The label a field's row shows, provided by the field template around its widget. */
export const FieldLabelContext = createContext<string | undefined>(undefined);

/**
 * The label a widget names itself by: the one its row shows, so the accessible name contains the
 * visible label (WCAG 2.5.3), else its formatted property name outside a field row.
 *
 * @param name - The widget's property name.
 * @returns The label.
 */
export const useFieldLabel = (name: string): string => useContext(FieldLabelContext) ?? formatDisplayLabel(name);

export function ParametersWidget(
  props: WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.JSX.Element {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RJSF is untyped
  const { id, onChange, onBlur, onFocus, name, schema, registry, disabled, readonly, autofocus } = props;
  const value: unknown = props.value;

  const { formContext } = registry;
  const fieldPath = useRenderedFieldPath()?.path;

  const prettyLabel = useFieldLabel(name);
  const defaultValue = schema.default as string | number | boolean | undefined;
  const type =
    Array.isArray(schema.type) && !(schema.type.length === 2 && schema.type.includes('null'))
      ? undefined
      : getSchemaType(schema);
  const isDisabled = disabled === true || readonly === true;
  /* RJSF hands every widget fresh `onChange` closures whenever its parent object field renders (any
   * form data or filter change), so the handlers passed down read the latest ones and keep one
   * identity; otherwise the memoised number row re-renders with every field. */
  const latest = useRef({ id, value, isDisabled, onChange, onFocus, onBlur });
  useEffect(() => {
    latest.current = { id, value, isDisabled, onChange, onFocus, onBlur };
  });
  const handleChange = useCallback((newValue: unknown) => {
    if (!latest.current.isDisabled) {
      latest.current.onChange(newValue);
    }
  }, []);
  const handleFocus = useCallback(() => {
    latest.current.onFocus(latest.current.id, latest.current.value);
  }, []);
  const handleBlur = useCallback(() => {
    latest.current.onBlur(latest.current.id, latest.current.value);
  }, []);
  const instancePointer = fieldPath === undefined ? undefined : toInstancePointer(fieldPath);
  const isNumeric = type === 'number' || type === 'integer';
  const { parameterManifest, parameterGroup } = formContext;
  const lengthSymbol = formContext.units.length.displaySymbol;
  const fieldProjection = useMemo(() => {
    if (!isNumeric || instancePointer === undefined) {
      return undefined;
    }
    const nativeBinding = resolveParameterBinding(parameterManifest, instancePointer);
    const requestedUnit =
      nativeBinding?.representation !== 'safe-integer' && isLengthUnit(nativeBinding?.unit)
        ? toUcumLengthCode(lengthSymbol)
        : undefined;
    return projectParameterField(
      parameterManifest,
      instancePointer,
      { unit: requestedUnit, locale: globalThis.navigator.language },
      parameterGroup,
    );
  }, [instancePointer, isNumeric, lengthSymbol, parameterGroup, parameterManifest]);
  /* An authoritative form commits a non-numeric field on its own: RJSF's whole-group `formData` can
   * still hold a pre-commit value of another field, which a group replacement would write back. */
  const commitField = async (newValue: boolean | string | undefined): Promise<void> => {
    const pointer = fieldPath === undefined ? undefined : toInstancePointer(fieldPath);
    const { parameterEdit } = formContext;
    if (isDisabled) {
      return;
    }
    if (parameterEdit.kind !== 'authoritative' || pointer === undefined || newValue === undefined) {
      onChange(newValue);
      return;
    }
    try {
      await parameterEdit.commit.setValue({
        pointer,
        value: newValue,
        base: { pointer, value: value as boolean | string },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The parameter could not be saved.');
    }
  };

  const types = Array.isArray(schema.type) ? schema.type.filter((candidate) => candidate !== 'null') : [];
  if (types.includes('string') && (types.includes('number') || types.includes('integer'))) {
    return (
      <ParametersNumberOrString
        id={id}
        value={value}
        pattern={schema.pattern}
        minimum={schema.minimum}
        maximum={schema.maximum}
        isNullable={Array.isArray(schema.type) && schema.type.includes('null')}
        disabled={disabled}
        readOnly={readonly}
        autoFocus={autofocus}
        aria-label={`Input for ${prettyLabel}`}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
      />
    );
  }

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
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={commitField}
        />
      );
    }

    case 'number':
    case 'integer': {
      const numericValue = value === null ? Number.NaN : typeof value === 'number' ? value : Number(value);
      const defaultNumericValue = typeof defaultValue === 'number' ? defaultValue : Number.NaN;
      if (instancePointer === undefined || fieldProjection === undefined) {
        throw new Error(`Numeric parameter '${name}' has no rendered instance path.`);
      }
      const constraints = fieldProjection.schema === undefined ? schema : fieldProjection.constraints;
      const effectiveDefault = numericConstraint(constraints, 'default') ?? defaultNumericValue;
      const min = numericConstraint(constraints, 'minimum');
      const max = numericConstraint(constraints, 'maximum');
      const step = numericConstraint(constraints, 'multipleOf');

      if (!Number.isFinite(numericValue)) {
        // An unset field still shows its unit and takes what is typed in that unit.
        return (
          <InputGroup className='h-8'>
            <InputGroupInput
              id={id}
              type='number'
              value=''
              disabled={disabled}
              readOnly={readonly}
              autoFocus={autofocus}
              placeholder={Number.isFinite(defaultNumericValue) ? String(defaultNumericValue) : undefined}
              aria-label={`Input for ${prettyLabel}`}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(event) => {
                const next = event.target.valueAsNumber;
                if (!Number.isFinite(next)) {
                  handleChange(undefined);
                  return;
                }
                const native = toNativeValue(fieldProjection, next);
                // The raw fallback input admits values through the same rules as the numeric editor.
                const diagnostic = validateParameterInputValue(
                  {
                    representation: fieldProjection.representation ?? 'binary64',
                    constraints: {
                      ...(min === undefined ? {} : { minimum: min }),
                      ...(max === undefined ? {} : { maximum: max }),
                      ...(step === undefined ? {} : { multipleOf: step }),
                    },
                  },
                  native,
                );
                if (diagnostic === undefined) {
                  handleChange(native);
                }
              }}
            />
            {fieldProjection.adornment ? (
              <InputGroupAddon align='inline-end'>{fieldProjection.adornment}</InputGroupAddon>
            ) : null}
          </InputGroup>
        );
      }

      return (
        <ParametersNumber
          value={numericValue}
          defaultValue={Number.isFinite(effectiveDefault) ? effectiveDefault : numericValue}
          fieldProjection={fieldProjection}
          sourceUnit={parameterGroup?.sourceUnits?.[instancePointer]}
          edit={formContext.parameterEdit}
          min={min}
          max={max}
          step={step}
          id={id}
          disabled={disabled}
          readOnly={readonly}
          autoFocus={autofocus}
          aria-label={`Input for ${prettyLabel}`}
          onFocus={handleFocus}
          onBlur={handleBlur}
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
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={(nextValue) => {
            void commitField(nextValue === '' && props.required !== true ? undefined : nextValue);
          }}
        />
      );
    }

    default: {
      throw new Error(`Unsupported type: ${String(schema.type)}`);
    }
  }
}
