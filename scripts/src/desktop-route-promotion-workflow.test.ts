import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- GitHub expression functions, contexts and repository variable names are exact external names. */

/**
 * Evaluates the publication job's real gate, matrix and environment expressions
 * for each combination of the per-channel repository variables, so that enabling
 * staging can never select a production environment.
 */
const root = resolve(import.meta.dirname, '../..');
const workflowPath = '.github/workflows/desktop-route-promotion.yml';
type Job = {
  if: string;
  strategy: { matrix: { channel: string } };
  environment: { name: string };
  env: Record<string, string>;
};
const workflow = load(readFileSync(join(root, workflowPath), 'utf8')) as { jobs: { publication: Job } };
const job = workflow.jobs.publication;

type Value = string | boolean | number | undefined | Value[] | { [key: string]: Value };
type Context = Record<string, Value>;

/** GitHub's string coercion for the scalar values this workflow formats. */
const scalar = (value: Value): string => {
  if (typeof value === 'object') {
    throw new TypeError('Only scalar values are formatted');
  }
  return value === undefined ? '' : String(value);
};

/** A minimal evaluator for the GitHub Actions expression subset this workflow uses. */
const evaluate = (source: string, context: Context): Value => {
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
const expression = (text: string): string => {
  const match = /^\$\{\{([\s\S]*)\}\}$/u.exec(text.trim());
  if (!match?.[1]) {
    throw new Error(`Not a single expression: ${text}`);
  }
  return match[1];
};
const interpolate = (text: string, context: Context): string =>
  text.replaceAll(/\$\{\{([\s\S]*?)\}\}/gu, (_match, inner: string) => scalar(evaluate(inner, context)));

type Gates = { staging?: string; production?: string };
type Run =
  | { event: 'schedule' }
  | { event: 'workflow_dispatch'; channel: 'staging' | 'production'; operation: 'promote-routes' | 'renew-routes' };
/** The environments the publication job would request, or none when the job is skipped. */
const environments = (run: Run, gates: Gates, ref = 'refs/heads/main'): string[] => {
  const context: Context = {
    github: { ref, event_name: run.event },
    vars: {
      DESKTOP_INSTALLER_PUBLICATION_STAGING: gates.staging ?? '',
      DESKTOP_INSTALLER_PUBLICATION_PRODUCTION: gates.production ?? '',
      // The retired repository-wide switch must not enable anything.
      DESKTOP_INSTALLER_PUBLICATION: 'true',
    },
    inputs: run.event === 'schedule' ? {} : { channel: run.channel, operation: run.operation },
  };
  if (evaluate(job.if, context) !== true) {
    return [];
  }
  const channels = evaluate(expression(job.strategy.matrix.channel), context);
  expect(Array.isArray(channels) && channels.length > 0).toBe(true);
  return (channels as string[]).map((channel) =>
    interpolate(job.environment.name, { ...context, matrix: { channel } }),
  );
};

const everyRun: Run[] = [
  { event: 'schedule' },
  ...(['staging', 'production'] as const).flatMap((channel) =>
    (['promote-routes', 'renew-routes'] as const).map(
      (operation): Run => ({
        event: 'workflow_dispatch',
        channel,
        operation,
      }),
    ),
  ),
];

describe('desktop installer publication channel gates', () => {
  it('should request no environment while both channel gates are off', () => {
    for (const gates of [{}, { staging: 'false', production: 'false' }, { staging: 'yes' }]) {
      for (const run of everyRun) {
        expect(environments(run, gates)).toEqual([]);
      }
    }
  });

  it('should never select a production environment when only staging is enabled', () => {
    for (const gates of [{ staging: 'true' }, { staging: 'true', production: 'false' }]) {
      expect(environments({ event: 'schedule' }, gates)).toEqual(['desktop-installer-renewal-staging']);
      expect(
        environments({ event: 'workflow_dispatch', channel: 'staging', operation: 'promote-routes' }, gates),
      ).toEqual(['desktop-installers-staging']);
      expect(
        environments({ event: 'workflow_dispatch', channel: 'staging', operation: 'renew-routes' }, gates),
      ).toEqual(['desktop-installer-renewal-staging']);
      for (const run of everyRun) {
        expect(environments(run, gates).filter((name) => name.endsWith('-production'))).toEqual([]);
      }
    }
  });

  it('should scope each channel to its own gate', () => {
    expect(environments({ event: 'schedule' }, { production: 'true' })).toEqual([
      'desktop-installer-renewal-production',
    ]);
    expect(
      environments(
        { event: 'workflow_dispatch', channel: 'staging', operation: 'promote-routes' },
        { production: 'true' },
      ),
    ).toEqual([]);
    expect(environments({ event: 'schedule' }, { staging: 'true', production: 'true' })).toEqual([
      'desktop-installer-renewal-staging',
      'desktop-installer-renewal-production',
    ]);
    expect(
      environments(
        { event: 'workflow_dispatch', channel: 'production', operation: 'promote-routes' },
        { production: 'true' },
      ),
    ).toEqual(['desktop-installers-production']);
  });

  it('should run only from main', () => {
    for (const run of everyRun) {
      expect(environments(run, { staging: 'true', production: 'true' }, 'refs/heads/feature')).toEqual([]);
    }
  });

  it('should hand the scripts each channel gate and no repository-wide switch', () => {
    for (const name of ['DESKTOP_INSTALLER_PUBLICATION_STAGING', 'DESKTOP_INSTALLER_PUBLICATION_PRODUCTION']) {
      expect(job.env[name]).toBe(`\${{ vars.${name} }}`);
    }
    expect(Object.keys(job.env)).not.toContain('TAU_ENABLE_INSTALLER_PROMOTION');
    for (const name of readdirSync(join(root, '.github/workflows'))) {
      const text = readFileSync(join(root, '.github/workflows', name), 'utf8');
      expect(text, name).not.toMatch(/\bDESKTOP_INSTALLER_PUBLICATION\b(?!_)/u);
      expect(text, name).not.toContain('TAU_ENABLE_INSTALLER_PROMOTION');
    }
  });
});
