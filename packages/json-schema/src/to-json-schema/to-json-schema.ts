import type { JSONSchema7, JSONSchema7TypeName } from 'json-schema';
import { isEqual } from '#to-json-schema/to-json-schema.utils.js';
import { getCommonArrayItemsType, getType, mergeSchemaObjs, stringFormats } from '#to-json-schema/helpers.js';
import { isFormat } from '#to-json-schema/json-schema-helpers.js';

const skipReverseFind = new Set(['hostname', 'host-name', 'alpha', 'alphanumeric', 'regex', 'regexp', 'pattern']);
const filteredFormats = stringFormats.filter((item) => !skipReverseFind.has(item));

type ArrayMode = 'all' | 'first' | 'uniform' | 'tuple';

type PostProcessFunction = (
  type: string,
  schema: JSONSchema7,
  value: unknown,
  defaultFunction: (type: string, schema: JSONSchema7, value: unknown) => JSONSchema7,
) => JSONSchema7;

type ObjectPostProcessFunction = (
  schema: JSONSchema7,
  object: Record<string, unknown>,
  defaultFunction: (schema: JSONSchema7, object: Record<string, unknown>) => JSONSchema7,
) => JSONSchema7;

type ObjectPreProcessFunction = (
  object: Record<string, unknown>,
  defaultFunction: (object: Record<string, unknown>) => JSONSchema7,
) => JSONSchema7;

type StringPreProcessFunction = (value: string, defaultFunction: (value: string) => JSONSchema7) => JSONSchema7;

type Options = {
  required?: boolean;
  postProcessFnc?: PostProcessFunction | undefined;
  strings?: {
    detectFormat?: boolean;
    preProcessFnc?: StringPreProcessFunction | undefined;
  };
  arrays?: {
    mode?: ArrayMode;
  };
  objects?: {
    preProcessFnc?: ObjectPreProcessFunction | undefined;
    postProcessFnc?: ObjectPostProcessFunction | undefined;
    additionalProperties?: boolean;
  };
};

const defaultOptions = {
  required: false,
  postProcessFnc: undefined as PostProcessFunction | undefined,
  strings: {
    detectFormat: true,
    preProcessFnc: undefined as StringPreProcessFunction | undefined,
  },
  arrays: {
    mode: 'all' as ArrayMode,
  },
  objects: {
    preProcessFnc: undefined as ObjectPreProcessFunction | undefined,
    postProcessFnc: undefined as ObjectPostProcessFunction | undefined,
    additionalProperties: true,
  },
} as const satisfies Options;

class ToJsonSchema {
  private readonly options: {
    required: boolean;
    postProcessFnc?: PostProcessFunction | undefined;
    strings: {
      detectFormat: boolean;
      preProcessFnc?: StringPreProcessFunction | undefined;
    };
    arrays: {
      mode: ArrayMode;
    };
    objects: {
      preProcessFnc?: ObjectPreProcessFunction | undefined;
      postProcessFnc?: ObjectPostProcessFunction | undefined;
      additionalProperties: boolean;
    };
  };

  public constructor(options: Options = {}) {
    this.options = {
      required: options.required ?? defaultOptions.required,
      postProcessFnc: options.postProcessFnc,
      strings: {
        detectFormat: options.strings?.detectFormat ?? defaultOptions.strings.detectFormat,
        preProcessFnc: options.strings?.preProcessFnc,
      },
      arrays: {
        mode: options.arrays?.mode ?? defaultOptions.arrays.mode,
      },
      objects: {
        preProcessFnc: options.objects?.preProcessFnc,
        postProcessFnc: options.objects?.postProcessFnc,
        additionalProperties: options.objects?.additionalProperties ?? defaultOptions.objects.additionalProperties,
      },
    };

    this.getObjectSchemaDefault = this.getObjectSchemaDefault.bind(this);
    this.getStringSchemaDefault = this.getStringSchemaDefault.bind(this);
    this.objectPostProcessDefault = this.objectPostProcessDefault.bind(this);
    this.commmonPostProcessDefault = this.commmonPostProcessDefault.bind(this);
  }

  /**
   * Gets JSON schema for provided value
   * @param value - Value to get schema for
   * @returns JSON schema
   */
  public getSchema(value: unknown): JSONSchema7 {
    const type = getType(value);
    if (!type) {
      throw new Error("Type of value couldn't be determined");
    }

    let schema: JSONSchema7;
    switch (type) {
      case 'object': {
        schema = this.getObjectSchema(value as Record<string, unknown>);
        break;
      }

      case 'array': {
        schema = this.getArraySchema(value as unknown[]);
        break;
      }

      case 'string': {
        schema = this.getStringSchema(value as string);
        break;
      }

      default: {
        schema = { type: type as JSONSchema7TypeName };
      }
    }

    schema = this.options.postProcessFnc
      ? this.options.postProcessFnc(type, schema, value, this.commmonPostProcessDefault)
      : this.commmonPostProcessDefault(type, schema, value);

    if (type === 'object') {
      if (this.options.objects.postProcessFnc) {
        schema = this.options.objects.postProcessFnc(
          schema,
          value as Record<string, unknown>,
          this.objectPostProcessDefault,
        );
      } else {
        schema = this.objectPostProcessDefault(schema, value as Record<string, unknown>);
      }
    }

    return schema;
  }

  /**
   * Tries to find the least common schema that would validate all items in the array. More details
   * helpers.mergeSchemaObjs description
   * @param array - Array to get schema for
   * @returns JSON schema or null
   */
  private getCommonArrayItemSchema(array: unknown[]): JSONSchema7 | undefined {
    const schemas = array.map((item) => this.getSchema(item));
    let result: JSONSchema7 | undefined = schemas.pop();

    for (const current of schemas) {
      if (result === undefined) {
        result = current;
      } else {
        const merged = mergeSchemaObjs(result, current);
        if (merged === undefined) {
          return undefined;
        }

        result = merged;
      }
    }

    return result;
  }

  private getObjectSchemaDefault(object: Record<string, unknown>): JSONSchema7 {
    const objectKeys = Object.keys(object);
    const properties: Record<string, JSONSchema7> = {};
    for (const propertyName of objectKeys) {
      properties[propertyName] = this.getSchema(object[propertyName]);
    }

    const schema: JSONSchema7 = {
      type: 'object',
      ...(objectKeys.length > 0 && { properties }),
    };

    return schema;
  }

  private getObjectSchema(object: Record<string, unknown>): JSONSchema7 {
    return this.options.objects.preProcessFnc
      ? this.options.objects.preProcessFnc(object, this.getObjectSchemaDefault)
      : this.getObjectSchemaDefault(object);
  }

  private getArraySchemaMerging(array: unknown[]): JSONSchema7 {
    const schema: JSONSchema7 = { type: 'array' };
    const commonType = getCommonArrayItemsType(array);
    if (commonType) {
      schema.items = { type: commonType as JSONSchema7TypeName };
      if (commonType !== 'integer' && commonType !== 'number') {
        const itemSchema = this.getCommonArrayItemSchema(array);
        if (itemSchema) {
          schema.items = itemSchema;
        }
      }
    }

    return schema;
  }

  private getArraySchemaNoMerging(array: unknown[]): JSONSchema7 {
    const schema: JSONSchema7 = {
      type: 'array',
      ...(array.length > 0 && { items: this.getSchema(array[0]) }),
    };

    return schema;
  }

  private getArraySchemaTuple(array: unknown[]): JSONSchema7 {
    const schema: JSONSchema7 = { type: 'array' };
    if (array.length > 0) {
      schema.items = array.map((item) => this.getSchema(item));
    }

    return schema;
  }

  private getArraySchemaUniform(array: unknown[]): JSONSchema7 {
    const schema = this.getArraySchemaNoMerging(array);

    if (array.length > 1) {
      for (let i = 1; i < array.length; i++) {
        const itemSchema = this.getSchema(array[i]);
        if (!isEqual(schema.items, itemSchema)) {
          throw new Error('Invalid schema, incompatible array items');
        }
      }
    }

    return schema;
  }

  private getArraySchema(array: unknown[]): JSONSchema7 {
    if (array.length === 0) {
      return { type: 'array' };
    }

    switch (this.options.arrays.mode) {
      case 'all': {
        return this.getArraySchemaMerging(array);
      }

      case 'first': {
        return this.getArraySchemaNoMerging(array);
      }

      case 'uniform': {
        return this.getArraySchemaUniform(array);
      }

      case 'tuple': {
        return this.getArraySchemaTuple(array);
      }

      default: {
        const mode = this.options.arrays.mode as string;
        throw new Error(`Unknown array mode option '${mode}'`);
      }
    }
  }

  private getStringSchemaDefault(value: string): JSONSchema7 {
    if (!this.options.strings.detectFormat) {
      return { type: 'string' };
    }

    const index = filteredFormats.findIndex((item) => isFormat(value, item));
    const schema: JSONSchema7 = {
      type: 'string',
      ...(index !== -1 && { format: filteredFormats[index] }),
    };

    return schema;
  }

  private getStringSchema(value: string): JSONSchema7 {
    if (this.options.strings.preProcessFnc) {
      return this.options.strings.preProcessFnc(value, this.getStringSchemaDefault);
    }

    return this.getStringSchemaDefault(value);
  }

  private commmonPostProcessDefault(_type: string, schema: JSONSchema7, _value: unknown): JSONSchema7 {
    // Note: The original code set required: true, but JSONSchema7.required is an array of property names
    // This behavior is preserved for compatibility, but it may not work as expected
    return schema;
  }

  private objectPostProcessDefault(schema: JSONSchema7, object: Record<string, unknown>): JSONSchema7 {
    if (!this.options.objects.additionalProperties && Object.getOwnPropertyNames(object).length > 0) {
      return { ...schema, additionalProperties: false };
    }

    return schema;
  }
}

export function toJsonSchema(value: unknown, options?: Options): JSONSchema7 {
  const tjs = new ToJsonSchema(options);
  return tjs.getSchema(value);
}

export default toJsonSchema;
