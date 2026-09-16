import { convert, createQuantity } from '#quantity.js';
import { validateQuantity } from '#quantity-validation.js';
import type { Quantity } from '#quantity.js';
import type { UnitDiagnostic, UnitResult } from '#unit.js';

/** Input representation retained for diagnostics and editing. @public */
export type InputRepresentation = 'decimal' | 'scientific' | 'fraction' | 'mixed' | 'feet-inches';
/** Structured parse request with explicit bare-entry meaning. @public */
export type ParseInputRequest = Readonly<{
  text: string;
  locale?: string;
  expectedUnit?: string;
  inputUnit?: string;
  kind?: string;
  space?: Quantity['space'];
  reference?: string;
}>;
/** Successful complete parse. @public */
export type ParsedInput = Readonly<{
  quantity: Quantity;
  consumedUnit: string;
  representation: InputRepresentation;
  sourceText: string;
}>;
/** Result including an explicit incomplete editing state. @public */
export type ParseInputResult = UnitResult<ParsedInput> | Readonly<{ status: 'incomplete'; diagnostic: UnitDiagnostic }>;
/** Formatting request. @public */
export type FormatQuantityRequest = Readonly<{
  quantity: Quantity;
  locale?: string;
  unit?: string;
  maximumFractionDigits?: number;
}>;
/** One formatted number part, including preserved decimal text. @public */
export type FormattedPart = Readonly<{ type: Intl.NumberFormatPart['type'] | 'decimal-text'; value: string }>;
/** Text and structured parts; never HTML. @public */
export type FormattedQuantity = Readonly<{ text: string; parts: readonly FormattedPart[]; unit: string }>;

const exactAliases = new Map([
  ['in', '[in_i]'],
  ['"', '[in_i]'],
  ['ft', '[ft_i]'],
  ["'", '[ft_i]'],
  ['yd', '[yd_i]'],
  ['lb', '[lb_av]'],
  ['oz', '[oz_av]'],
  ['°', 'deg'],
  ['°C', 'Cel'],
  ['°F', '[degF]'],
]);

const namedAliases = new Map<string, string>();
const addNamedAliases = (names: readonly string[], code: string): void => {
  for (const name of names) {
    namedAliases.set(name, code);
  }
};

addNamedAliases(['inch', 'inches'], '[in_i]');
addNamedAliases(['foot', 'feet'], '[ft_i]');
addNamedAliases(['yard', 'yards'], '[yd_i]');
addNamedAliases(['pound', 'pounds'], '[lb_av]');
addNamedAliases(['ounce', 'ounces'], '[oz_av]');
addNamedAliases(['ton', 'tons'], 't');
addNamedAliases(['minute', 'minutes', 'mins'], 'min');
addNamedAliases(['hour', 'hours', 'hrs'], 'h');
addNamedAliases(['degree', 'degrees', 'degs'], 'deg');
addNamedAliases(['celsius'], 'Cel');
addNamedAliases(['fahrenheit'], '[degF]');

const prefixes = [
  ['quetta', 'Q'],
  ['ronna', 'R'],
  ['yotta', 'Y'],
  ['zetta', 'Z'],
  ['exa', 'E'],
  ['peta', 'P'],
  ['tera', 'T'],
  ['giga', 'G'],
  ['mega', 'M'],
  ['kilo', 'k'],
  ['hecto', 'h'],
  ['deca', 'da'],
  ['deci', 'd'],
  ['centi', 'c'],
  ['milli', 'm'],
  ['micro', 'u'],
  ['nano', 'n'],
  ['pico', 'p'],
  ['femto', 'f'],
  ['atto', 'a'],
  ['zepto', 'z'],
  ['yocto', 'y'],
  ['ronto', 'r'],
  ['quecto', 'q'],
] as const;
const namedBases = [
  ['meter', 'm'],
  ['metre', 'm'],
  ['gram', 'g'],
  ['second', 's'],
  ['ampere', 'A'],
  ['kelvin', 'K'],
  ['mole', 'mol'],
  ['candela', 'cd'],
  ['radian', 'rad'],
] as const;
for (const [name, code] of namedBases) {
  addNamedAliases([name, `${name}s`], code);
  for (const [prefix, symbol] of prefixes) {
    addNamedAliases([`${prefix}${name}`, `${prefix}${name}s`], `${symbol}${code}`);
  }
}

const fail = (
  ...[status, code, message, start, end]: readonly [
    status: 'invalid' | 'unsupported' | 'indeterminate' | 'incomplete',
    code: UnitDiagnostic['code'],
    message: string,
    start: number,
    end: number,
  ]
): ParseInputResult => ({ status, diagnostic: { code, message, span: { start, end } } });

const normalizeUnit = (text: string): string =>
  exactAliases.get(text) ?? namedAliases.get(text.toLowerCase()) ?? text.replace(/^[μµ]/u, 'u');

const selectUnit = (suffix: string, inputUnit?: string, expectedUnit?: string): string =>
  suffix.length > 0 ? suffix : (inputUnit ?? expectedUnit ?? '');

const escapeRegex = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

function localeSeparators(locale: string): UnitResult<Readonly<{ decimal: string; group: string }>> {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12_345.6);
    return {
      status: 'success',
      value: {
        decimal: parts.find(({ type }) => type === 'decimal')?.value ?? '.',
        group: parts.find(({ type }) => type === 'group')?.value ?? ',',
      },
    };
  } catch {
    return {
      status: 'invalid',
      diagnostic: { code: 'REPRESENTATION_UNSUPPORTED', message: 'Locale is not supported by Intl.NumberFormat.' },
    };
  }
}

function parseNumber(
  text: string,
  locale: string,
): UnitResult<Readonly<{ value: number; representation: InputRepresentation }>> {
  const separators = localeSeparators(locale);
  if (separators.status !== 'success') {
    return separators;
  }
  const { decimal, group } = separators.value;
  const exponentIndex = text.search(/[eE]/u);
  const mantissa = exponentIndex < 0 ? text : text.slice(0, exponentIndex);
  if (group !== decimal && mantissa.includes(group)) {
    const grouped = new RegExp(`^[+-]?\\d{1,3}(?:${escapeRegex(group)}\\d{3})+(?:${escapeRegex(decimal)}\\d+)?$`, 'u');
    if (!grouped.test(mantissa)) {
      return {
        status: 'invalid',
        diagnostic: { code: 'REPRESENTATION_UNSUPPORTED', message: 'Locale grouping is malformed or ambiguous.' },
      };
    }
  }
  if (mantissa.split(decimal).length > 2) {
    return {
      status: 'invalid',
      diagnostic: { code: 'REPRESENTATION_UNSUPPORTED', message: 'Locale decimal separator is repeated.' },
    };
  }
  const normalized = text.split(group).join('').replace(decimal, '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(normalized)) {
    return { status: 'invalid', diagnostic: { code: 'UNIT_INVALID', message: 'Malformed numeric value.' } };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return {
      status: 'invalid',
      diagnostic: { code: 'NUMERIC_OVERFLOW', message: 'Numeric value is outside finite binary64.' },
    };
  }
  const normalizedMantissa = normalized.split(/[eE]/u, 1)[0] ?? '';
  if (value === 0 && /[1-9]/u.test(normalizedMantissa)) {
    return {
      status: 'unsupported',
      diagnostic: { code: 'NUMERIC_UNDERFLOW', message: 'Numeric value underflows finite binary64.' },
    };
  }
  return { status: 'success', value: { value, representation: /[eE]/u.test(normalized) ? 'scientific' : 'decimal' } };
}

const parseFraction = (numeratorText: string, denominatorText: string): UnitResult<number> => {
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return {
      status: 'unsupported',
      diagnostic: { code: 'NUMERIC_OVERFLOW', message: 'Fraction component is outside finite binary64.' },
    };
  }
  if (denominator === 0) {
    return {
      status: 'invalid',
      diagnostic: { code: 'CONSTRAINT_VIOLATION', message: 'Fraction denominator cannot be zero.' },
    };
  }
  const value = numerator / denominator;
  if (!Number.isFinite(value)) {
    return {
      status: 'unsupported',
      diagnostic: { code: 'NUMERIC_OVERFLOW', message: 'Fraction result is outside finite binary64.' },
    };
  }
  return numerator !== 0 && value === 0
    ? {
        status: 'unsupported',
        diagnostic: { code: 'NUMERIC_UNDERFLOW', message: 'Fraction result underflows finite binary64.' },
      }
    : { status: 'success', value };
};

const addSpan = (result: UnitResult<Quantity>, start: number, end: number): UnitResult<Quantity> =>
  result.status === 'success'
    ? result
    : { ...result, diagnostic: { ...result.diagnostic, span: result.diagnostic.span ?? { start, end } } };

function finish(
  ...[request, value, unit, representation, unitStart = 0]: readonly [
    request: ParseInputRequest,
    value: number,
    unit: string,
    representation: InputRepresentation,
    unitStart?: number,
  ]
): ParseInputResult {
  if (!unit) {
    return fail(
      'indeterminate',
      'SEMANTICS_UNRESOLVED',
      'Bare input requires an expected or selected input unit.',
      0,
      request.text.length,
    );
  }
  const quantity = addSpan(
    createQuantity({
      value,
      unit,
      kind: request.kind,
      space: request.space ?? 'linear',
      reference: request.reference,
    }),
    unitStart,
    request.text.length,
  );
  if (quantity.status !== 'success') {
    return quantity;
  }
  return {
    status: 'success',
    value: { quantity: quantity.value, consumedUnit: unit, representation, sourceText: request.text },
  };
}

const isRuntimeRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parse the entire user input, preserving representation and explicit unit context.
 * @param request - Source text, locale, semantic metadata, and explicit bare-entry unit.
 * @returns A complete parse, editing state, or structured diagnostic.
 * @public
 */
export function parseInput(request: ParseInputRequest): ParseInputResult {
  const candidate: unknown = request;
  if (!isRuntimeRecord(candidate) || typeof candidate['text'] !== 'string') {
    return fail('invalid', 'METADATA_CONFLICT', 'Parse request must contain text.', 0, 0);
  }
  if (
    (candidate['locale'] !== undefined && typeof candidate['locale'] !== 'string') ||
    (candidate['expectedUnit'] !== undefined && typeof candidate['expectedUnit'] !== 'string') ||
    (candidate['inputUnit'] !== undefined && typeof candidate['inputUnit'] !== 'string')
  ) {
    return fail(
      'invalid',
      'METADATA_CONFLICT',
      'Parse request contains malformed text options.',
      0,
      candidate['text'].length,
    );
  }
  const source = request.text;
  const text = source.trim();
  const locale = request.locale ?? 'en';
  const separators = localeSeparators(locale);
  if (separators.status !== 'success') {
    return fail('invalid', separators.diagnostic.code, separators.diagnostic.message, 0, source.length);
  }
  const incompleteDecimal = escapeRegex(separators.value.decimal);
  if (
    text === '' ||
    /^[+-]$/u.test(text) ||
    new RegExp(`^[+-]?${incompleteDecimal}$`, 'u').test(text) ||
    new RegExp(`^[+-]?\\d+(?:${incompleteDecimal}\\d*)?[eE][+-]?$`, 'u').test(text) ||
    new RegExp(`^[+-]?\\d+${incompleteDecimal}$`, 'u').test(text)
  ) {
    return fail('incomplete', 'UNIT_INVALID', 'Input is incomplete.', 0, source.length);
  }

  const feet = /^(-)?\s*(\d+(?:\.\d+)?)\s*(?:ft|foot|feet|')\s*(\d+(?:\.\d+)?)?\s*(?:in|inch|inches|")?$/iu.exec(text);
  if (feet) {
    const sign = feet[1] ? -1 : 1;
    const value = sign * (Number(feet[2]) * 12 + Number(feet[3] ?? 0));
    return finish(request, value, '[in_i]', 'feet-inches');
  }
  if (/^(?:-.*(?:ft|foot|feet|').*-\s*\d|.*(?:ft|foot|feet|')\s*-\d)/iu.test(text)) {
    return fail('invalid', 'UNIT_INVALID', 'Feet and inches must share one leading sign.', 0, source.length);
  }

  const mixed =
    /^([+-]?\d+)\s+(\d+)\s*\/\s*(\d+)\s*(\S.*)?$/u.exec(text) ??
    /^([+-]?\d+)-(\d+)\s*\/\s*(\d+)\s*(\S.*)?$/u.exec(text);
  if (mixed) {
    const fraction = parseFraction(mixed[2] ?? '', mixed[3] ?? '');
    const whole = Number(mixed[1]);
    if (fraction.status !== 'success') {
      return fail(fraction.status, fraction.diagnostic.code, fraction.diagnostic.message, 0, source.length);
    }
    if (!Number.isFinite(whole)) {
      return fail(
        'unsupported',
        'NUMERIC_OVERFLOW',
        'Mixed-number component is outside finite binary64.',
        0,
        source.length,
      );
    }
    const signedFraction = (whole < 0 || Object.is(whole, -0) ? -1 : 1) * fraction.value;
    const value = whole + signedFraction;
    if (!Number.isFinite(value)) {
      return fail(
        'unsupported',
        'NUMERIC_OVERFLOW',
        'Mixed-number result is outside finite binary64.',
        0,
        source.length,
      );
    }
    if (signedFraction !== 0 && value === whole) {
      return fail(
        'unsupported',
        'REPRESENTATION_UNSUPPORTED',
        'Mixed-number fraction is lost in finite binary64.',
        0,
        source.length,
      );
    }
    const suffix = mixed[4]?.trim() ?? '';
    return finish(
      request,
      value,
      normalizeUnit(selectUnit(suffix, request.inputUnit, request.expectedUnit)),
      'mixed',
      suffix ? source.lastIndexOf(suffix) : 0,
    );
  }
  const fraction = /^([+-]?\d+)\s*\/\s*(\d+)\s*(\S.*)?$/u.exec(text);
  if (fraction) {
    const value = parseFraction(fraction[1] ?? '', fraction[2] ?? '');
    if (value.status !== 'success') {
      return fail(value.status, value.diagnostic.code, value.diagnostic.message, 0, source.length);
    }
    const suffix = fraction[3]?.trim() ?? '';
    return finish(
      request,
      value.value,
      normalizeUnit(selectUnit(suffix, request.inputUnit, request.expectedUnit)),
      'fraction',
      suffix ? source.lastIndexOf(suffix) : 0,
    );
  }

  const match = /^([+-]?[\d.,\u00A0\u202F']+(?:[eE][+-]?\d+)?)\s*(.*)$/u.exec(text);
  if (!match) {
    return fail('invalid', 'UNIT_INVALID', 'Input is not a supported number.', 0, source.length);
  }
  const numberText = match[1] ?? '';
  const parsed = parseNumber(numberText, locale);
  if (parsed.status !== 'success') {
    return { ...parsed, diagnostic: { ...parsed.diagnostic, span: { start: 0, end: numberText.length } } };
  }
  const suffix = match[2]?.trim() ?? '';
  const unit = normalizeUnit(selectUnit(suffix, request.inputUnit, request.expectedUnit));
  return finish(
    request,
    parsed.value.value,
    unit,
    parsed.value.representation,
    suffix ? source.lastIndexOf(suffix) : 0,
  );
}

/**
 * Format a validated quantity using Intl text and parts.
 * @param request - Quantity, optional target unit, locale, and precision.
 * @returns Safe text and structured parts or a diagnostic.
 * @public
 */
export function formatQuantity(request: FormatQuantityRequest): UnitResult<FormattedQuantity> {
  const candidate: unknown = request;
  if (!isRuntimeRecord(candidate)) {
    return {
      status: 'invalid',
      diagnostic: { code: 'METADATA_CONFLICT', message: 'Format request must be an object.' },
    };
  }
  if (
    (candidate['locale'] !== undefined && typeof candidate['locale'] !== 'string') ||
    (candidate['unit'] !== undefined && typeof candidate['unit'] !== 'string') ||
    (candidate['maximumFractionDigits'] !== undefined && typeof candidate['maximumFractionDigits'] !== 'number')
  ) {
    return { status: 'invalid', diagnostic: { code: 'METADATA_CONFLICT', message: 'Format options are malformed.' } };
  }
  const valid = validateQuantity(candidate['quantity']);
  if (valid.status !== 'success') {
    return valid;
  }
  let number: Intl.NumberFormat;
  try {
    number = new Intl.NumberFormat(request.locale, {
      maximumFractionDigits: request.maximumFractionDigits ?? 12,
      signDisplay: 'auto',
    });
  } catch {
    return {
      status: 'invalid',
      diagnostic: { code: 'REPRESENTATION_UNSUPPORTED', message: 'Locale or formatting options are invalid.' },
    };
  }
  if (valid.value.representation === 'decimal') {
    if (request.unit && request.unit !== valid.value.unit.code) {
      return {
        status: 'unsupported',
        diagnostic: {
          code: 'REPRESENTATION_UNSUPPORTED',
          message: 'Decimal conversion requires a decimal execution engine.',
        },
      };
    }
    return {
      status: 'success',
      value: {
        text: `${valid.value.value} ${valid.value.unit.code}`,
        parts: [{ type: 'decimal-text', value: valid.value.value }],
        unit: valid.value.unit.code,
      },
    };
  }
  const displayQuantity: Quantity =
    valid.value.representation === 'safe-integer'
      ? Object.freeze({ ...valid.value, representation: 'binary64' })
      : valid.value;
  const converted = request.unit ? convert({ quantity: displayQuantity, to: request.unit }) : valid;
  if (converted.status !== 'success') {
    return converted;
  }
  if (typeof converted.value.value !== 'number') {
    return {
      status: 'unsupported',
      diagnostic: { code: 'REPRESENTATION_UNSUPPORTED', message: 'Quantity is not executable.' },
    };
  }
  const parts = number.formatToParts(converted.value.value);
  return {
    status: 'success',
    value: {
      text: `${parts.map(({ value }) => value).join('')} ${converted.value.unit.code}`,
      parts,
      unit: converted.value.unit.code,
    },
  };
}
