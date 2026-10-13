import { getDefaultRegistry } from '@rjsf/core';
import { deepEquals } from '@rjsf/utils';
import type { FieldProps, RegistryFieldsType, RJSFSchema } from '@rjsf/utils';
import { createContext, createElement, memo, useContext, useMemo } from 'react';
import type { RJSFContext } from '#parameters/rjsf-context.js';

type RenderedFieldPath = {
  readonly fieldId: string;
  readonly path: readonly string[];
  readonly isArrayItem: boolean;
};

const renderedFieldPathContext = createContext<RenderedFieldPath | undefined>(undefined);
const DefaultSchemaField = (() => {
  const field = getDefaultRegistry<Record<string, unknown>, RJSFSchema, RJSFContext>().fields['SchemaField'];
  if (!field) {
    throw new Error('RJSF default SchemaField is unavailable');
  }
  return field;
})();

/* `ObjectField` re-renders every child on any form data change; skipping on RJSF's own
 * `SchemaField.shouldComponentUpdate` rule keeps a commit from re-rendering every field's wrapper. */
const SchemaField = memo(function SchemaField(props: FieldProps<Record<string, unknown>, RJSFSchema, RJSFContext>) {
  const parent = useContext(renderedFieldPathContext);
  const fieldId = props.idSchema.$id;
  const indexValue: unknown = Object.getOwnPropertyDescriptor(props, 'index')?.value;
  const index = typeof indexValue === 'number' ? indexValue : undefined;
  const context = useMemo(() => {
    const segment = index === undefined ? props.name : String(index);
    const path = parent === undefined ? [] : parent.fieldId === fieldId ? parent.path : [...parent.path, segment];
    const isArrayItem = parent?.fieldId === fieldId ? parent.isArrayItem : index !== undefined;
    return { fieldId, path, isArrayItem };
  }, [fieldId, index, parent, props.name]);

  return (
    <renderedFieldPathContext.Provider value={context}>
      {createElement(DefaultSchemaField, props)}
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
