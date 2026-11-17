/* eslint-disable @typescript-eslint/naming-convention -- GitHub expression function names are exact external names. */
/**
 * A minimal evaluator for the GitHub Actions expression subset Tau's workflow replay tests use: string and boolean
 * literals, context property paths, `!`, `==`, `!=`, `&&`, `||`, parentheses and a few status and string functions.
 * Status functions model a run that was not cancelled.
 */
export type Value = string | boolean | number | undefined | Value[] | { [key: string]: Value };
export type Context = Record<string, Value>;

/** GitHub's string coercion for the scalar values this workflow formats. */
export const scalar = (value: Value): string => {
  if (typeof value === 'object') {
    throw new TypeError('Only scalar values are formatted');
  }
  return value === undefined ? '' : String(value);
};

/** Evaluate one expression (without its `${{ }}` wrapper) against a context. */
export const evaluate = (source: string, context: Context): Value => {
  const tokens: string[] = [];
  const pattern = /\s*('(?:[^']|'')*'|==|!=|&&|\|\||[!(),]|[A-Za-z_][\w.-]*)\s*/uy;
  while (pattern.lastIndex < source.length) {
    const match = pattern.exec(source);
    if (!match?.[1]) {
      throw new Error(`Unsupported expression syntax in ${source}`);
    }
    tokens.push(match[1]);
  }
  let position = 0;
  const peek = (): string | undefined => tokens[position];
  const take = (expected?: string): string => {
    const token = tokens[position++];
    if (token === undefined || (expected !== undefined && token !== expected)) {
      throw new Error(`Unexpected token ${token ?? 'end'} in ${source}`);
    }
    return token;
  };
  const truthy = (value: Value): boolean => value !== '' && value !== false && value !== 0 && value !== undefined;
  const equal = (left: Value, right: Value): boolean =>
    typeof left === 'string' && typeof right === 'string' ? left.toLowerCase() === right.toLowerCase() : left === right;
  const functions: Record<string, (...args: Value[]) => Value> = {
    format: (template, ...args) =>
      scalar(template).replaceAll(/\{(\d+)\}/gu, (_match, index: string) => scalar(args[Number(index)])),
    fromJSON: (text) => JSON.parse(scalar(text)) as Value,
    startsWith: (text, prefix) => scalar(text).toLowerCase().startsWith(scalar(prefix).toLowerCase()),
    always: () => true,
    cancelled: () => false,
    success: () => true,
    failure: () => false,
  };
  const primary = (): Value => {
    const token = take();
    if (token === '(') {
      const value = or();
      take(')');
      return value;
    }
    if (token === '!') {
      return !truthy(primary());
    }
    if (token.startsWith("'")) {
      return token.slice(1, -1).replaceAll("''", "'");
    }
    if (token === 'true' || token === 'false') {
      return token === 'true';
    }
    if (peek() === '(') {
      take('(');
      const args: Value[] = [];
      while (peek() !== ')') {
        args.push(or());
        if (peek() === ',') {
          take(',');
        }
      }
      take(')');
      const call = functions[token];
      if (!call) {
        throw new Error(`Unsupported function ${token}`);
      }
      return call(...args);
    }
    let value: Value = context;
    for (const key of token.split('.')) {
      value = value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined;
    }
    return value;
  };
  const comparison = (): Value => {
    let left = primary();
    while (peek() === '==' || peek() === '!=') {
      const operator = take();
      const right = primary();
      left = operator === '==' ? equal(left, right) : !equal(left, right);
    }
    return left;
  };
  const and = (): Value => {
    let left = comparison();
    while (peek() === '&&') {
      take();
      const right = comparison();
      left = truthy(left) ? right : left;
    }
    return left;
  };
  const or = (): Value => {
    let left = and();
    while (peek() === '||') {
      take();
      const right = and();
      left = truthy(left) ? left : right;
    }
    return left;
  };
  const value = or();
  if (position !== tokens.length) {
    throw new Error(`Trailing tokens in ${source}`);
  }
  return value;
};
export const expression = (text: string): string => {
  const match = /^\$\{\{([\s\S]*)\}\}$/u.exec(text.trim());
  if (!match?.[1]) {
    throw new Error(`Not a single expression: ${text}`);
  }
  return match[1];
};
export const interpolate = (text: string, context: Context): string =>
  text.replaceAll(/\$\{\{([\s\S]*?)\}\}/gu, (_match, inner: string) => scalar(evaluate(inner, context)));
