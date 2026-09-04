import { describe, expect, it } from 'vitest';
import { buildClientEnvScript } from '#lib/client-env-script.js';

/** Runs the generated script body with `window` bound to a stand-in object. */
const evaluate = (script: string, window: Record<string, unknown>): void => {
  // oxlint-disable-next-line no-new-func -- the subject under test is a script string.
  const run = new Function('window', script) as (windowArgument: Record<string, unknown>) => void;
  run(window);
};

/** Evaluates the generated script against a stand-in `window` and returns `window.ENV`. */
const run = (script: string, preloaded?: Record<string, unknown>): unknown => {
  const window: { ENV?: unknown } = preloaded === undefined ? {} : { ENV: preloaded };
  evaluate(script, window);
  return window.ENV;
};

describe('buildClientEnvScript', () => {
  it('assigns the build-time environment when nothing preloaded it', () => {
    expect(run(buildClientEnvScript({ TAU_API_URL: 'https://api.tau.new' }))).toStrictEqual({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
      TAU_API_URL: 'https://api.tau.new',
    });
  });

  it('lets a preload-injected value win over the build-time value', () => {
    const result = run(buildClientEnvScript({ TAU_API_URL: 'https://api.tau.new' }), {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
      TAU_API_URL: 'http://127.0.0.1:4000',
    });

    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
    expect(result).toStrictEqual({ TAU_API_URL: 'http://127.0.0.1:4000' });
  });

  it('merges rather than replaces, keeping build-time keys the preload omitted', () => {
    const result = run(
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
      buildClientEnvScript({ TAU_API_URL: 'https://api.tau.new', TAU_DEBUG: true }),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
      { TAU_API_URL: 'http://127.0.0.1:4000' },
    );

    expect(result).toStrictEqual({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
      TAU_API_URL: 'http://127.0.0.1:4000',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
      TAU_DEBUG: true,
    });
  });

  it('escapes `<` so a value cannot close the surrounding script element', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
    const script = buildClientEnvScript({ TAU_API_URL: '</script><script>alert(1)</script>' });

    expect(script).not.toContain('<');
    // The escape is transparent to the JavaScript parser that runs the script.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
    expect(run(script)).toStrictEqual({ TAU_API_URL: '</script><script>alert(1)</script>' });
  });

  it('is idempotent — re-running never discards the preloaded values', () => {
    const script = buildClientEnvScript({ TAU_API_URL: 'https://api.tau.new' });
    const window: { ENV?: unknown } = { ENV: { TAU_API_URL: 'http://127.0.0.1:4000' } };
    evaluate(script, window);
    evaluate(script, window);

    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys are SCREAMING_SNAKE_CASE
    expect(window.ENV).toStrictEqual({ TAU_API_URL: 'http://127.0.0.1:4000' });
  });
});
