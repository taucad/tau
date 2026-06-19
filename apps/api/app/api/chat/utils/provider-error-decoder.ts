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

  if (Array.isArray(value) && value.every((item) => isByteNumber(item))) {
    return decodeBytes(Uint8Array.from(value), 'bytes');
  }

  if (value instanceof ArrayBuffer) {
    return decodeBytes(new Uint8Array(value), 'bytes');
  }

  if (ArrayBuffer.isView(value)) {
    return decodeBytes(copyArrayBufferView(value), 'bytes');
  }

  if (typeof value === 'object') {
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
  if (!values.every((value) => isByteNumber(value))) {
    return undefined;
  }

  return Uint8Array.from(values);
};

const startsJson = (text: string): boolean => {
  const trimmed = text.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

const isByteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;

const extractProviderFields = (
  parsed: unknown,
  fallbackStatus: number | undefined,
): Pick<
  DecodedProviderErrorBody,
  'httpStatus' | 'providerCode' | 'providerMessage' | 'providerReason' | 'providerStatus'
> => {
  const errorRecord = getProviderErrorRecord(parsed);
  const nestedFirstError = asRecord(readArray(errorRecord, 'errors')?.[0]);

  const httpStatus =
    fallbackStatus ??
    readNumber(errorRecord, 'code') ??
    readNumber(errorRecord, 'status') ??
    readNumber(parsed, 'status');
  const providerStatus =
    readString(errorRecord, 'status') ?? readString(errorRecord, 'type') ?? readString(nestedFirstError, 'status');
  const providerCode =
    providerStatus ??
    readString(errorRecord, 'code') ??
    readNumber(errorRecord, 'code') ??
    readString(errorRecord, 'type');

  return {
    httpStatus,
    providerCode,
    providerStatus,
    providerMessage: readString(errorRecord, 'message') ?? readString(nestedFirstError, 'message'),
    providerReason: readString(errorRecord, 'reason') ?? readString(nestedFirstError, 'reason'),
  };
};

const getProviderErrorRecord = (parsed: unknown): Record<string, unknown> | undefined => {
  const first: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
  const record = asRecord(first);
  if (!record) {
    return undefined;
  }

  const error = asRecord(record['error']);
  if (!error) {
    return record;
  }

  const nested = asRecord(error['error']);
  return nested ?? error;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const readArray = (record: Record<string, unknown> | undefined, key: string): unknown[] | undefined => {
  const value = record?.[key];
  return Array.isArray(value) ? value : undefined;
};

const readString = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
};

const readNumber = (value: unknown, key: string): number | undefined => {
  const record = asRecord(value);
  const child = record?.[key];
  return typeof child === 'number' ? child : undefined;
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
