import { getDefaultRegistry } from '@rjsf/core';
import type { FieldProps, RegistryFieldsType, RJSFSchema } from '@rjsf/utils';
import { createContext, createElement, useContext, useMemo } from 'react';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';

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

const SchemaField = (props: FieldProps<Record<string, unknown>, RJSFSchema, RJSFContext>) => {
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
};

export const rjsfFields: RegistryFieldsType<Record<string, unknown>, RJSFSchema, RJSFContext> = { SchemaField };

export const useRenderedFieldPath = (): RenderedFieldPath | undefined => useContext(renderedFieldPathContext);
