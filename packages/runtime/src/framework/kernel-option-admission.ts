import { z } from 'zod';
import type { KernelIssue } from '#types/runtime.types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// oxlint-disable-next-line max-params -- Selected union ownership is tied to the current input object.
const fieldSchemas = (
  schema: z.core.$ZodType,
  key: string,
  value?: unknown,
  selections?: UnionSelections,
): z.core.$ZodType[] | undefined => {
  if (schema instanceof z.ZodPipe) {
    return fieldSchemas(schema.in, key, value, selections);
  }
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodCatch ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodNonOptional
  ) {
    return fieldSchemas(schema.unwrap(), key, value, selections);
  }
  if (schema instanceof z.ZodLazy) {
    return fieldSchemas(schema._zod.def.getter(), key, value, selections);
  }
  if (schema instanceof z.ZodUnion) {
    if (!isOptionObject(value)) {
      return undefined;
    }
    const selected = selections?.get(schema)?.get(value);
    return selected ? fieldSchemas(selected, key, value, selections) : undefined;
  }
  if (schema instanceof z.ZodIntersection) {
    const left = fieldSchemas(schema._zod.def.left, key, value, selections);
    const right = fieldSchemas(schema._zod.def.right, key, value, selections);
    return left === undefined || right === undefined ? undefined : [...left, ...right];
  }
  if (schema instanceof z.ZodRecord) {
    return [schema.valueType];
  }
  if (schema instanceof z.ZodObject) {
    const field: unknown = Reflect.get(schema.shape, key);
    if (field instanceof z.ZodType) {
      return [field];
    }
    const { catchall } = schema._zod.def;
    return catchall && !(catchall instanceof z.ZodNever) ? [catchall] : [];
  }
  return undefined;
};

type OptionObject = Record<string, unknown> | unknown[];
type UnionSelections = WeakMap<z.core.$ZodType, WeakMap<OptionObject, z.core.$ZodType>>;
const isOptionObject = (value: unknown): value is OptionObject => isRecord(value) || Array.isArray(value);

const trackUnionBranches = (schema: z.core.$ZodType, selections: UnionSelections): z.core.$ZodType => {
  if (schema instanceof z.ZodUnion) {
    const byInput = selections.get(schema) ?? new WeakMap<OptionObject, z.core.$ZodType>();
    selections.set(schema, byInput);
    let input: unknown;
    const options = schema.options.map((option) => {
      const tracked = trackUnionBranches(option, selections);
      // Zod 4.4.3's discriminated union reads each option's propValues, so keep its class and
      // intercept only the isolated clone's core run. Neither author schemas nor transforms rerun.
      const { run } = tracked._zod;
      tracked._zod.run = (payload, context): ReturnType<typeof run> => {
        const result = run(payload, context);
        if (!(result instanceof Promise) && result.issues.length === 0 && isOptionObject(input)) {
          byInput.set(input, option);
        }
        return result;
      };
      return tracked;
    });
    const union = schema.clone({ ...schema._zod.def, options });
    const { run } = union._zod;
    union._zod.run = (payload, context): ReturnType<typeof run> => {
      input = payload.value;
      return run(payload, context);
    };
    return union;
  }
  if (schema instanceof z.ZodObject) {
    const shape = Object.fromEntries(
      Object.entries<z.core.$ZodType>(schema.shape).map(([key, child]) => [key, trackUnionBranches(child, selections)]),
    );
    const { catchall } = schema._zod.def;
    return schema.clone({
      ...schema._zod.def,
      shape,
      ...(catchall ? { catchall: trackUnionBranches(catchall, selections) } : {}),
    });
  }
  if (schema instanceof z.ZodArray) {
    return schema.clone({ ...schema._zod.def, element: trackUnionBranches(schema.element, selections) });
  }
  if (schema instanceof z.ZodTuple) {
    const { items, rest } = schema._zod.def;
    return schema.clone({
      ...schema._zod.def,
      items: items.map((item) => trackUnionBranches(item, selections)),
      ...(rest ? { rest: trackUnionBranches(rest, selections) } : {}),
    });
  }
  if (schema instanceof z.ZodRecord) {
    return schema.clone({ ...schema._zod.def, valueType: trackUnionBranches(schema.valueType, selections) });
  }
  if (schema instanceof z.ZodIntersection) {
    return schema.clone({
      ...schema._zod.def,
      left: trackUnionBranches(schema._zod.def.left, selections),
      right: trackUnionBranches(schema._zod.def.right, selections),
    });
  }
  if (schema instanceof z.ZodPipe) {
    return schema.clone({ ...schema._zod.def, in: trackUnionBranches(schema.in, selections) });
  }
  if (schema instanceof z.ZodOptional) {
    return schema.clone({ ...schema._zod.def, innerType: trackUnionBranches(schema.unwrap(), selections) });
  }
  if (schema instanceof z.ZodNullable) {
    return schema.clone({ ...schema._zod.def, innerType: trackUnionBranches(schema.unwrap(), selections) });
  }
  if (schema instanceof z.ZodDefault) {
    return schema.clone({ ...schema._zod.def, innerType: trackUnionBranches(schema.unwrap(), selections) });
  }
  if (
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodCatch ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodNonOptional
  ) {
    return z.core.clone(schema, { ...schema._zod.def, innerType: trackUnionBranches(schema.unwrap(), selections) });
  }
  if (schema instanceof z.ZodLazy) {
    return schema.clone({ ...schema._zod.def, getter: () => trackUnionBranches(schema._zod.def.getter(), selections) });
  }
  return z.core.clone(schema);
};

// oxlint-disable-next-line max-params -- Recursive path, parsed output and transform context travel with the schema.
const strippedPath = (
  schema: z.core.$ZodType,
  value: unknown,
  output: unknown,
  path = '',
  transformed = false,
  selections?: UnionSelections,
): string | undefined => {
  if (schema instanceof z.ZodPipe) {
    return strippedPath(schema.in, value, output, path, true, selections);
  }
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodCatch ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodNonOptional
  ) {
    return strippedPath(schema.unwrap(), value, output, path, transformed, selections);
  }
  if (schema instanceof z.ZodLazy) {
    return strippedPath(schema._zod.def.getter(), value, output, path, transformed, selections);
  }
  if (schema instanceof z.ZodUnion) {
    if (!isOptionObject(value)) {
      return undefined;
    }
    const selected = selections?.get(schema)?.get(value);
    if (selected) {
      return strippedPath(selected, value, output, path, transformed, selections);
    }
    return path || '<root>';
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const parsedItem: unknown = Array.isArray(output) ? output[index] : undefined;
      const stripped = strippedPath(schema.element, item, parsedItem, `${path}[${index}]`, false, selections);
      if (stripped) {
        return stripped;
      }
    }
  }
  if (schema instanceof z.ZodTuple && Array.isArray(value)) {
    const { items, rest } = schema._zod.def;
    for (const [index, item] of value.entries()) {
      const child = items[index] ?? rest;
      if (!child) {
        continue;
      }
      const parsedItem: unknown = Array.isArray(output) ? output[index] : undefined;
      const stripped = strippedPath(child, item, parsedItem, `${path}[${index}]`, false, selections);
      if (stripped) {
        return stripped;
      }
    }
  }
  if (
    (schema instanceof z.ZodObject || schema instanceof z.ZodRecord || schema instanceof z.ZodIntersection) &&
    isRecord(value)
  ) {
    for (const [key, item] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      const children = fieldSchemas(schema, key, value, selections);
      if (children?.length === 0) {
        return childPath;
      }
      if (isRecord(output) && !Object.hasOwn(output, key)) {
        if (!transformed) {
          return childPath;
        }
        if (children) {
          const nested = children.map((child) => strippedPath(child, item, undefined, childPath, false, selections));
          if (nested.every((candidate) => candidate !== undefined)) {
            return nested[0];
          }
        }
        continue;
      }
      if (children) {
        const parsedItem = isRecord(output) ? output[key] : undefined;
        const stripped = children.map((child) => strippedPath(child, item, parsedItem, childPath, false, selections));
        if (stripped.every((candidate) => candidate !== undefined)) {
          return stripped[0];
        }
      }
    }
  }
  return undefined;
};

const issueMessages = (issue: z.core.$ZodIssue, path = ''): string[] => {
  const location = [...(path ? [path] : []), ...issue.path.map(String)].join('.');
  if (issue.code === 'invalid_union') {
    return issue.errors.flatMap((branch, index) =>
      branch.flatMap((nested) => issueMessages(nested, `${location || '<root>'} branch ${index + 1}`)),
    );
  }
  return [`${location || '<root>'}: ${issue.message}`];
};

// oxlint-disable-next-line max-params -- Schema, request, route label and issue code are one admission operation.
export const admitKernelOptions = (
  schema: z.ZodType | undefined,
  input: Record<string, unknown>,
  label: string,
  code: 'EVALUATE_OPTIONS_INVALID' | 'VIEW_OPTIONS_INVALID' | 'EXPORT_OPTIONS_INVALID',
): { success: true; options: Record<string, unknown> } | { success: false; issues: KernelIssue[] } => {
  const messages: string[] = [];
  const selections: UnionSelections = new WeakMap();
  const parsed = schema ? z.safeParse(trackUnionBranches(schema, selections), input) : undefined;
  if (parsed && !parsed.success) {
    messages.push(...parsed.error.issues.flatMap((issue) => issueMessages(issue)));
  } else if (!schema && Object.keys(input).length > 0) {
    messages.push(`${Object.keys(input)[0]}: no options schema is declared`);
  } else if (schema) {
    const stripped = strippedPath(schema, input, parsed?.data, '', false, selections);
    if (stripped) {
      messages.push(`${stripped}: option would be stripped by the schema`);
    }
  }
  const value: unknown = parsed?.success ? parsed.data : {};
  if (messages.length === 0 && !isRecord(value)) {
    messages.push('<root>: options must resolve to an object');
  }
  if (messages.length > 0) {
    return {
      success: false,
      issues: messages.map((message) => ({
        message: `${label} option ${message}`,
        code,
        type: 'kernel',
        severity: 'error',
      })),
    };
  }
  return { success: true, options: value as Record<string, unknown> };
};
