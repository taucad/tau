// Content of this file is extracted from jsonschema source

type TypeChecker = (instance: unknown) => boolean;

type FormatChecker = RegExp | ((input: string) => boolean);

export const types: Record<string, TypeChecker> = {
  string(instance: unknown): boolean {
    return typeof instance === 'string';
  },

  number(instance: unknown): boolean {
    // IsFinite returns false for NaN, Infinity, and -Infinity
    return typeof instance === 'number' && Number.isFinite(instance);
  },

  integer(instance: unknown): boolean {
    return typeof instance === 'number' && instance % 1 === 0;
  },

  boolean(instance: unknown): boolean {
    return typeof instance === 'boolean';
  },

  array(instance: unknown): boolean {
    return Array.isArray(instance);
  },

  null(instance: unknown): boolean {
    return instance === null;
  },

  date(instance: unknown): boolean {
    return instance instanceof Date;
  },

  any(_instance: unknown): boolean {
    return true;
  },

  object(instance: unknown): boolean {
    return instance !== null && typeof instance === 'object' && !Array.isArray(instance) && !(instance instanceof Date);
  },
};

export const formatRegexps: Record<string, FormatChecker> = {
  'date-time':
    /^\d{4}-(?:0\d|1[0-2])-(3[01]|0[1-9]|[12]\d)[tT ](2[0-4]|[01]\d):([0-5]\d):(60|[0-5]\d)(\.\d+)?([zZ]|[+-]([0-5]\d):(60|[0-5]\d))$/,
  date: /^\d{4}-(?:0\d|1[0-2])-(3[01]|0[1-9]|[12]\d)$/,
  time: /^(2[0-4]|[01]\d):([0-5]\d):(60|[0-5]\d)$/,

  email:
    /^(?:[\w!#$%&'*+-/=?^`{|}~]+\.)*[\w!#$%&'*+-/=?^`{|}~]+@(?:(?:(?:[a-zA-Z\d](?:[a-zA-Z\d-](?!\.)){0,61}[a-zA-Z\d]?\.)+[a-zA-Z\d](?:[a-zA-Z\d-](?!$)){0,61}[a-zA-Z\d]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])]))$/,
  'ip-address': /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$/,
  // IPv6 regex - using a simpler pattern to avoid bundler parsing issues
  ipv6: /^(([\da-f]{1,4}:){7}[\da-f]{1,4}|([\da-f]{1,4}:){1,7}:|([\da-f]{1,4}:){1,6}:[\da-f]{1,4}|([\da-f]{1,4}:){1,5}(:[\da-f]{1,4}){1,2}|([\da-f]{1,4}:){1,4}(:[\da-f]{1,4}){1,3}|([\da-f]{1,4}:){1,3}(:[\da-f]{1,4}){1,4}|([\da-f]{1,4}:){1,2}(:[\da-f]{1,4}){1,5}|[\da-f]{1,4}:((:[\da-f]{1,4}){1,6})|:((:[\da-f]{1,4}){1,7}|:)|fe80:(:[\da-f]{0,4}){0,4}%[\da-z]+|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)\.){3}(25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)|([\da-f]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)\.){3}(25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d))$/i,
  uri: /^[a-zA-Z][a-zA-Z\d+-.]*:\S*$/,

  color:
    /^(#?([\dA-Fa-f]{3}){1,2}\b|aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow|(rgb\(\s*\b(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\b\s*,\s*\b(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\b\s*,\s*\b(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\b\s*\))|(rgb\(\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*\)))$/,

  // Hostname regex from: http://stackoverflow.com/a/1420225/5628
  hostname:
    /^(?=.{1,255}$)[\dA-Za-z](?:(?:[\dA-Za-z]|-){0,61}[\dA-Za-z])?(?:\.[\dA-Za-z](?:(?:[\dA-Za-z]|-){0,61}[\dA-Za-z])?)*\.?$/,
  'host-name':
    /^(?=.{1,255}$)[\dA-Za-z](?:(?:[\dA-Za-z]|-){0,61}[\dA-Za-z])?(?:\.[\dA-Za-z](?:(?:[\dA-Za-z]|-){0,61}[\dA-Za-z])?)*\.?$/,

  alpha: /^[a-zA-Z]+$/,
  alphanumeric: /^[a-zA-Z\d]+$/,
  'utc-millisec'(input: string): boolean {
    return (
      typeof input === 'string' &&
      Number.parseFloat(input) === Number.parseInt(input, 10) &&
      !Number.isNaN(Number(input))
    );
  },
  regex(input: string): boolean {
    let result = true;
    try {
      // eslint-disable-next-line no-new -- Testing regex validity
      new RegExp(input);
    } catch {
      result = false;
    }

    return result;
  },
  style: /\s*(.+?):\s*([^;]+);?/g,
  phone: /^\+(?:\d ?){6,14}\d$/,
};

formatRegexps['regexp'] = formatRegexps['regex']!;
formatRegexps['pattern'] = formatRegexps['regex']!;
formatRegexps['ipv4'] = formatRegexps['ip-address']!;

export function isFormat(input: unknown, format: string): boolean {
  if (typeof input === 'string' && formatRegexps[format] !== undefined) {
    const formatChecker = formatRegexps[format];
    if (formatChecker instanceof RegExp) {
      return formatChecker.test(input);
    }

    if (typeof formatChecker === 'function') {
      return formatChecker(input);
    }
  }

  return true;
}
