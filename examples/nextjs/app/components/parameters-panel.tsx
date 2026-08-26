'use client';

import type { IChangeEvent } from '@rjsf/core';
import Form from '@rjsf/core';
import type { FieldTemplateProps, RegistryWidgetsType, RJSFSchema, ValidatorType, WidgetProps } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import type { ReactElement } from 'react';

export type ParameterRecord = Record<string, unknown>;

type ParametersPanelProperties = {
  readonly values: ParameterRecord;
  readonly schema: RJSFSchema | undefined;
  readonly onChange: (parameters: ParameterRecord) => void;
};

const defaultJsonSchema: RJSFSchema = {
  type: 'object',
  properties: {},
};

const isControlDisabled = (disabled: boolean | undefined, readonly: boolean | undefined): boolean =>
  disabled === true || readonly === true;

const FieldTemplate = ({ id, label, description, children }: FieldTemplateProps): ReactElement => {
  if (id === 'root') {
    return children;
  }

  return (
    <label className='text-slate-200 grid gap-2 text-xs font-bold' htmlFor={id}>
      <span>{label}</span>
      {children}
      {description ? <small className='text-slate-500 text-xs font-medium'>{description}</small> : null}
    </label>
  );
};

const TextWidget = ({ id, value, disabled, readonly, schema, onChange }: WidgetProps): ReactElement => {
  const isNumber = schema.type === 'number' || schema.type === 'integer';

  return (
    <input
      className='border-slate-400/20 bg-slate-950/50 text-slate-50 focus:border-teal-300/65 focus:ring-teal-300/20 h-10 min-w-0 rounded-lg border px-3 outline-none focus:ring-2 disabled:opacity-60'
      disabled={isControlDisabled(disabled, readonly)}
      id={id}
      max={isNumber ? schema.maximum : undefined}
      min={isNumber ? schema.minimum : undefined}
      step={isNumber ? schema.multipleOf : undefined}
      type={isNumber ? 'number' : 'text'}
      value={value === undefined ? '' : String(value)}
      onChange={(changeEvent) => {
        if (!isNumber) {
          onChange(changeEvent.target.value);
          return;
        }
        const next = Number(changeEvent.target.value);
        onChange(Number.isFinite(next) ? next : undefined);
      }}
    />
  );
};

const NumberWidget = ({ id, value, disabled, readonly, schema, onChange }: WidgetProps): ReactElement => (
  <input
    className='border-slate-400/20 bg-slate-950/50 text-slate-50 focus:border-teal-300/65 focus:ring-teal-300/20 h-10 min-w-0 rounded-lg border px-3 outline-none focus:ring-2 disabled:opacity-60'
    disabled={isControlDisabled(disabled, readonly)}
    id={id}
    max={schema.maximum}
    min={schema.minimum}
    step={schema.multipleOf}
    type='number'
    value={value === undefined ? '' : Number(value)}
    onChange={(changeEvent) => {
      const next = Number(changeEvent.target.value);
      onChange(Number.isFinite(next) ? next : undefined);
    }}
  />
);

const CheckboxWidget = ({ id, value, disabled, readonly, onChange }: WidgetProps): ReactElement => (
  <input
    className='border-slate-400/20 bg-slate-950/50 text-teal-300 focus:ring-teal-300/30 size-4 rounded disabled:opacity-60'
    checked={Boolean(value)}
    disabled={isControlDisabled(disabled, readonly)}
    id={id}
    type='checkbox'
    onChange={(changeEvent) => {
      onChange(changeEvent.target.checked);
    }}
  />
);

const SelectWidget = ({ id, value, disabled, readonly, options, onChange }: WidgetProps): ReactElement => {
  const enumOptions = (options.enumOptions ?? []) as Array<{ label: string; value: unknown }>;

  return (
    <select
      className='border-slate-400/20 bg-slate-950/50 text-slate-50 focus:border-teal-300/65 focus:ring-teal-300/20 h-10 min-w-0 rounded-lg border px-3 outline-none focus:ring-2 disabled:opacity-60'
      disabled={isControlDisabled(disabled, readonly)}
      id={id}
      value={String(value)}
      onChange={(changeEvent) => {
        const selected = enumOptions.find((entry) => String(entry.value) === changeEvent.target.value);
        onChange(selected ? selected.value : changeEvent.target.value);
      }}
    >
      {enumOptions.map((entry) => (
        <option key={String(entry.value)} value={String(entry.value)}>
          {entry.label}
        </option>
      ))}
    </select>
  );
};

const widgets: RegistryWidgetsType = {
  CheckboxWidget,
  SelectWidget,
  TextWidget,
  NumberWidget,
  UpDownWidget: NumberWidget,
};

const templates = {
  FieldTemplate,
  ButtonTemplates: {
    SubmitButton: () => null,
  },
};

export function ParametersPanel({ values, schema, onChange }: ParametersPanelProperties): ReactElement {
  const effectiveSchema = schema ?? defaultJsonSchema;
  const hasParameters = Object.keys(effectiveSchema.properties ?? {}).length > 0;

  if (!hasParameters) {
    return <p className='text-slate-500 m-0 p-3.5 text-xs'>Parameters appear after the first render.</p>;
  }

  const handleChange = (changeEvent: IChangeEvent<ParameterRecord>) => {
    onChange(changeEvent.formData ?? {});
  };

  return (
    <Form<ParameterRecord>
      className='grid gap-3 p-3.5'
      formData={values}
      liveValidate={false}
      noHtml5Validate
      schema={effectiveSchema}
      showErrorList={false}
      templates={templates}
      validator={validator as ValidatorType<ParameterRecord>}
      widgets={widgets}
      onChange={handleChange}
    />
  );
}
