import { z } from 'zod';

export type DecodedProviderErrorBody = {
  bodyKind: 'empty' | 'string' | 'json' | 'byte-list' | 'bytes' | 'object' | 'unknown';
  rawText?: string;
  parsed?: unknown;
  httpStatus?: number;
  providerCode?: string | number;
  providerStatus?: string;
  providerMessage?: string;
  providerReason?: string;
};

const maxDecodedTextLength = 8000;
const textDecoder = new TextDecoder();
const byteSchema = z.number().int().min(0).max(255);
const byteArraySchema = z.array(byteSchema);
const unknownArraySchema = z.array(z.unknown());
const objectValueSchema = z.union([z.array(z.unknown()), z.looseObject({})]);

const providerFieldValueSchema = z.union([z.string(), z.number()]);
const providerFieldsSchema = z.looseObject({
  code: providerFieldValueSchema.optional(),
  status: providerFieldValueSchema.optional(),
  type: z.string().optional(),
  message: z.string().optional(),
  reason: z.string().optional(),
  errors: z.array(z.unknown()).optional(),
});

const providerErrorRecordSchema = z.union([
  z.looseObject({ error: z.looseObject({ error: providerFieldsSchema }) }).transform((value) => value.error.error),
  z.looseObject({ error: providerFieldsSchema }).transform((value) => value.error),
  providerFieldsSchema,
]);

export const decodeProviderErrorBody = (value: unknown): DecodedProviderErrorBody => {
  const decoded = decodeValue(value);
  return {
    ...decoded,
    ...extractProviderFields(decoded.parsed, decoded.httpStatus),
  };
};

const decodeValue = (value: unknown): DecodedProviderErrorBody => {
  if (value === null || value === undefined) {
    return { bodyKind: 'empty' };
  }

  if (typeof value === 'string') {
    return decodeText(value);
  }

  const bytes = byteArraySchema.safeParse(value);
  if (bytes.success) {
    return decodeBytes(Uint8Array.from(bytes.data), 'bytes');
  }

  if (value instanceof ArrayBuffer) {
    return decodeBytes(new Uint8Array(value), 'bytes');
  }

  if (ArrayBuffer.isView(value)) {
    return decodeBytes(copyArrayBufferView(value), 'bytes');
  }

  if (objectValueSchema.safeParse(value).success) {
    return {
      bodyKind: 'object',
      parsed: value,
      rawText: truncateDecodedText(safeJsonStringify(value)),
    };
  }

  return {
    bodyKind: 'unknown',
    rawText: describeOpaqueValue(value),
  };
};

const decodeText = (text: string): DecodedProviderErrorBody => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { bodyKind: 'empty', rawText: '' };
  }

  const googlePrefix = /^google request failed with status code\s+(\d{3})(?::\s*([\S\s]*))?$/i.exec(trimmed);
  if (googlePrefix?.[1]) {
    const httpStatus = Number.parseInt(googlePrefix[1], 10);
    const bodyText = googlePrefix[2];
    if (!bodyText) {
      return { bodyKind: 'string', rawText: truncateDecodedText(text), httpStatus };
    }

    const decoded = decodeProviderErrorBody(bodyText);
    return { ...decoded, httpStatus: decoded.httpStatus ?? httpStatus };
  }

  const statusPrefix = /^(\d{3})\s+([\S\s]+)$/i.exec(trimmed);
  if (statusPrefix?.[1] && statusPrefix[2] && startsJson(statusPrefix[2])) {
    const decoded = decodeProviderErrorBody(statusPrefix[2]);
    return {
      ...decoded,
      httpStatus: decoded.httpStatus ?? Number.parseInt(statusPrefix[1], 10),
    };
  }

  const byteList = parseDecimalByteList(trimmed);
  if (byteList) {
    return decodeBytes(byteList, 'byte-list');
  }

  if (startsJson(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return {
        bodyKind: 'json',
        parsed,
        rawText: truncateDecodedText(text),
      };
    } catch {
      // Fall through to opaque string handling.
    }
  }

  return {
    bodyKind: 'string',
    rawText: truncateDecodedText(text),
  };
};

const decodeBytes = (
  bytes: Uint8Array<ArrayBuffer>,
  bodyKind: DecodedProviderErrorBody['bodyKind'],
): DecodedProviderErrorBody => {
  const decodedText = textDecoder.decode(bytes);
  const decoded = decodeText(decodedText);
  return {
    ...decoded,
    bodyKind,
    rawText: decoded.rawText ?? truncateDecodedText(decodedText),
  };
};

const parseDecimalByteList = (text: string): Uint8Array<ArrayBuffer> | undefined => {
  if (!/^\s*\d{1,3}(?:\s*,\s*\d{1,3})+\s*$/.test(text)) {
    return undefined;
  }

  const values = text.split(',').map((part) => Number.parseInt(part.trim(), 10));
  const bytes = byteArraySchema.safeParse(values);
  if (!bytes.success) {
    return undefined;
  }

  return Uint8Array.from(bytes.data);
};

const startsJson = (text: string): boolean => {
  const trimmed = text.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

const extractProviderFields = (
  parsed: unknown,
  fallbackStatus: number | undefined,
): Pick<
  DecodedProviderErrorBody,
  'httpStatus' | 'providerCode' | 'providerMessage' | 'providerReason' | 'providerStatus'
> => {
  const errorRecord = getProviderErrorRecord(parsed);
  const nestedFirstErrorResult = providerFieldsSchema.safeParse(errorRecord?.errors?.[0]);
  const nestedFirstError = nestedFirstErrorResult.success ? nestedFirstErrorResult.data : undefined;
  const parsedArray = unknownArraySchema.safeParse(parsed);
  const rootResult = providerFieldsSchema.safeParse(parsedArray.success ? parsedArray.data[0] : parsed);
  const root = rootResult.success ? rootResult.data : undefined;

  const httpStatus =
    fallbackStatus ??
    (typeof errorRecord?.code === 'number' ? errorRecord.code : undefined) ??
    (typeof errorRecord?.status === 'number' ? errorRecord.status : undefined) ??
    (typeof root?.status === 'number' ? root.status : undefined);
  const providerStatus =
    (typeof errorRecord?.status === 'string' ? errorRecord.status : undefined) ??
    errorRecord?.type ??
    (typeof nestedFirstError?.status === 'string' ? nestedFirstError.status : undefined);
  const providerCode =
    providerStatus ??
    (typeof errorRecord?.code === 'string' ? errorRecord.code : undefined) ??
    (typeof errorRecord?.code === 'number' ? errorRecord.code : undefined) ??
    errorRecord?.type;

  return {
    httpStatus,
    providerCode,
    providerStatus,
    providerMessage: errorRecord?.message ?? nestedFirstError?.message,
    providerReason: errorRecord?.reason ?? nestedFirstError?.reason,
  };
};

const getProviderErrorRecord = (parsed: unknown): z.infer<typeof providerFieldsSchema> | undefined => {
  const first = unknownArraySchema.safeParse(parsed);
  const result = providerErrorRecordSchema.safeParse(first.success ? first.data[0] : parsed);
  return result.success ? result.data : undefined;
};

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
};

const copyArrayBufferView = (view: ArrayBufferView): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return bytes;
};

const describeOpaqueValue = (value: unknown): string => {
  if (typeof value === 'symbol') {
    return value.description ? `Symbol(${value.description})` : 'Symbol()';
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  return `[${typeof value}]`;
};

const truncateDecodedText = (value: string): string =>
  value.length > maxDecodedTextLength
    ? `${value.slice(0, maxDecodedTextLength)}...[truncated ${value.length - maxDecodedTextLength} chars]`
    : value;
