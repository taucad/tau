import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noTimeUnitSuffixRule } from './no-time-unit-suffix.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

describe('no-time-unit-suffix', () => {
  it('flags banned Ms suffix and accepts allowlisted names', () => {
    ruleTester.run('no-time-unit-suffix', noTimeUnitSuffixRule, {
      valid: [
        {
          name: 'plain identifier without suffix',
          code: 'const renderTimeout = 30_000;',
        },
        {
          name: 'Node fs.Stats mtimeMs is allowlisted',
          code: 'const x: { mtimeMs: number } = { mtimeMs: 0 };',
        },
        {
          name: 'fs.Stats parameter mtimeMs is allowlisted',
          code: 'function f({ mtimeMs }: { mtimeMs: number }) { return mtimeMs; }',
        },
        {
          name: 'persisted JSON contract responseTimeMs is allowlisted',
          code: 'const payload = { responseTimeMs: 0 };',
        },
        {
          name: 'persisted JSON contract durationMs is allowlisted',
          code: 'type Report = { durationMs: number };',
        },
        {
          name: 'persisted JSON contract totalDurationMs is allowlisted',
          code: 'interface RunSummary { totalDurationMs: number; }',
        },
        {
          name: 'prefixed Node fs field oldMtimeMs is allowlisted via suffix match',
          code: 'const oldMtimeMs = 0;',
        },
        {
          name: 'benchmark formatter formatMs is allowlisted',
          // oxlint-disable-next-line eslint/no-template-curly-in-string -- code-string fixture intentionally contains a template literal source
          code: 'function formatMs(ms: number): string { return `${ms}ms`; }',
        },
        {
          name: 'benchmark JSON field totalMs is allowlisted',
          code: 'type Stats = { totalMs: number };',
        },
        {
          name: 'benchmark JSON field medianMs is allowlisted',
          code: 'type DataPoint = { medianMs: number };',
        },
        {
          name: 'chat schema reasoningStartedAtMs is allowlisted',
          code: 'type Meta = { reasoningStartedAtMs?: number };',
        },
        {
          name: 'chat schema reasoningEndedAtMs is allowlisted',
          code: 'type Meta = { reasoningEndedAtMs?: number };',
        },
        {
          name: 'chat schema startedAtMs parameter is allowlisted',
          code: 'function useStopwatch(startedAtMs: number) { return startedAtMs; }',
        },
        {
          name: 'chat schema endedAtMs is allowlisted',
          code: 'type Meta = { endedAtMs?: number };',
        },
        {
          name: 'chat schema firstTokenAtMs is allowlisted',
          code: 'type Telemetry = { firstTokenAtMs?: number };',
        },
        {
          name: 'getter mirroring schema field getReasoningStartedAtMs is allowlisted',
          code: 'function getReasoningStartedAtMs() { return 0; }',
        },
      ],
      invalid: [
        {
          name: 'const ending in Ms',
          code: 'const renderTimeoutMs = 30_000;',
          errors: [{ messageId: 'msSuffix', data: { name: 'renderTimeoutMs' } }],
        },
        {
          name: 'function parameter ending in Ms',
          code: 'function schedule(delayMs: number) { return delayMs; }',
          errors: [{ messageId: 'msSuffix', data: { name: 'delayMs' } }],
        },
        {
          name: 'type member ending in Ms',
          code: 'type Options = { timeoutMs: number };',
          errors: [{ messageId: 'msSuffix', data: { name: 'timeoutMs' } }],
        },
        {
          name: 'interface member ending in Ms',
          code: 'interface Cfg { debounceMs: number; }',
          errors: [{ messageId: 'msSuffix', data: { name: 'debounceMs' } }],
        },
        {
          name: 'object property literal ending in Ms',
          code: 'const opts = { intervalMs: 100 };',
          errors: [{ messageId: 'msSuffix', data: { name: 'intervalMs' } }],
        },
      ],
    });
  });
});
