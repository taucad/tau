import { getDefaultRegistry } from '@rjsf/core';
import { deepEquals, isObject, useDeepCompareMemo } from '@rjsf/utils';
import type { FieldPathId, FieldPathList, FieldProps, RegistryFieldsType, RJSFSchema } from '@rjsf/utils';
import { createContext, createElement, memo, useCallback, useContext, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { RJSFContext } from '#parameters/rjsf-context.js';

type RenderedFieldPath = {
  readonly fieldId: string;
  readonly path: readonly string[];
  readonly isArrayItem: boolean;
};

type RenderedField = RenderedFieldPath & {
  readonly fieldPathId: FieldPathId;
  readonly schema: RJSFSchema;
  /** Reads the field's latest data without making every descendant re-render when it changes. */
  readonly formData: RefObject<unknown>;
};

type FieldChange = FieldProps<Record<string, unknown>, RJSFSchema, RJSFContext>['onChange'];

const renderedFieldPathContext = createContext<RenderedField | undefined>(undefined);
const DefaultSchemaField = (() => {
  const field = getDefaultRegistry<Record<string, unknown>, RJSFSchema, RJSFContext>().fields['SchemaField'];
  if (!field) {
    throw new Error('RJSF default SchemaField is unavailable');
  }
  return field;
})();

const hasSamePath = (left: FieldPathList, right: FieldPathList): boolean =>
  left.length === right.length && left.every((segment, index) => Object.is(segment, right[index]));

/* RJSF 6's `toFieldPathId` drops an empty property name, so a `""` property would share its parent object's path and
 * write its edits over the whole object. Restore the missing segment, and the `root_` style id RJSF 5 gave it. */
const withEmptyPropertySegment = (
  props: FieldProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
  parent: RenderedField | undefined,
): FieldPathId => {
  const { fieldPathId, name, registry } = props;
  const isDroppedEmptyProperty =
    parent !== undefined &&
    name === '' &&
    Object.hasOwn(parent.schema.properties ?? {}, '') &&
    hasSamePath(fieldPathId.path, parent.fieldPathId.path);
  if (!isDroppedEmptyProperty) {
    return fieldPathId;
  }

  return {
    ...fieldPathId,
    $id: `${fieldPathId.$id}${registry.globalFormOptions.idSeparator}`,
    path: [...fieldPathId.path, ''],
  };
};

/* RJSF 6's `Form` also reads the one-segment path `['']` as the root, so an edit of a root-level `""` property is
 * sent as an edit of the whole root object instead. */
const isRootEmptyProperty = (path: FieldPathList): boolean => path.length === 1 && path[0] === '';

/* RJSF 6 already memoizes `SchemaField`; the same comparator keeps this wrapper's provider value stable. */
const SchemaField = memo(function SchemaField(props: FieldProps<Record<string, unknown>, RJSFSchema, RJSFContext>) {
  const parent = useContext(renderedFieldPathContext);
  const { schema, onChange } = props;
  const formData = useRef<unknown>(props.formData);
  formData.current = props.formData;
  const derivedFieldPathId = withEmptyPropertySegment(props, parent);
  const fieldPathId = useDeepCompareMemo(derivedFieldPathId);
  const context = useMemo<RenderedField>(
    () => ({
      fieldId: fieldPathId.$id,
      path: fieldPathId.path.map(String),
      isArrayItem: typeof fieldPathId.path.at(-1) === 'number',
      fieldPathId,
      schema,
      formData,
    }),
    [fieldPathId, schema],
  );
  const parentFormData = parent?.formData;
  const handleChange = useCallback<FieldChange>(
    (...[value, path, errorSchema, id]: Parameters<FieldChange>) => {
      if (!isRootEmptyProperty(path)) {
        onChange(value, path, errorSchema, id);
        return;
      }

      const siblings = isObject(parentFormData?.current) ? (parentFormData.current as Record<string, unknown>) : {};
      onChange({ ...siblings, '': value }, [], errorSchema === undefined ? undefined : { '': errorSchema }, id);
    },
    [onChange, parentFormData],
  );

  return (
    <renderedFieldPathContext.Provider value={context}>
      {createElement(
        DefaultSchemaField,
        derivedFieldPathId === props.fieldPathId
          ? props
          : {
              ...props,
              fieldPathId: context.fieldPathId,
              onChange: isRootEmptyProperty(context.fieldPathId.path) ? handleChange : onChange,
            },
      )}
    </renderedFieldPathContext.Provider>
  );
}, deepEquals);

/**
 * RJSF field overrides whose `SchemaField` records each rendered field's path for `useRenderedFieldPath`.
 *
 * @public
 */
export const rjsfFields: RegistryFieldsType<Record<string, unknown>, RJSFSchema, RJSFContext> = { SchemaField };

/**
 * Read the path of the RJSF field being rendered, as recorded by `rjsfFields`.
 *
 * @returns The field ID, path segments and whether it is an array item, or `undefined` outside a recorded field.
 * @public
 */
export const useRenderedFieldPath = (): RenderedFieldPath | undefined => useContext(renderedFieldPathContext);

/**
 * Convert field path segments to a JSON Pointer, escaping `~` and `/` in each segment.
 *
 * @param path - The path segments.
 * @returns The JSON Pointer.
 * @public
 */
export const toInstancePointer = (path: readonly string[]): string =>
  `/${path.map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;
