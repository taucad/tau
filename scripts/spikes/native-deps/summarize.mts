#!/usr/bin/env node

/**
 * Purpose: Reduce one spike's raw run records to medians and a verdict against its charter pass line.
 * Why: Wave 0 spikes run on GitHub-hosted runners; the relative pass lines are kept and the absolute
 *   idle-M2-Pro budgets are re-based on the runner and stated as runner numbers (resume.md § 3).
 * Environment: Node 24+; a directory of JSON records written by the sibling spike scripts.
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/summarize.mts --spike S1|S2|S3|S5|S6|S13
 *   --dir <records> --out <summary.json> [--extra <json>]
 * Exit codes: 0 when a verdict was computed (pass, fail or between); 1 when records are missing.
 */

import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/* oxlint-disable no-restricted-imports -- spike-only scripts outside a package import their siblings and the kernel sessions, which are not public exports, by relative path; deleted with their W package. */
import { median, parseFlags, requiredFlag } from './spike-common.mts';
/* oxlint-enable no-restricted-imports */

type RunRecord = Record<string, unknown> & { readonly label: string; readonly host: Record<string, unknown> };
type Verdict = 'pass' | 'fail' | 'between';

/** F1's idle M2 Pro cold handshake (benchmark-native, 2026-09-03), the denominator for re-basing S1. */
const m2ProBuild123dColdMilliseconds = 4389.61;
/** The charter's runner allowance for idle-M2-Pro budgets (S13 row: 15 s → 30 s on `macos-15`). */
const runnerSlack = 2;

const load = (directory: string): RunRecord[] =>
  readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')) as RunRecord)
    .filter((record) => typeof record.label === 'string');

const numbers = (records: readonly RunRecord[], label: string, field: string): number[] =>
  records
    .filter((record) => record.label === label)
    .map((record) => record[field])
    .filter((value): value is number => typeof value === 'number');

const med = (records: readonly RunRecord[], label: string, field: string): number => {
  const values = numbers(records, label, field);
  if (values.length === 0) {
    throw new Error(`no ${field} samples for ${label}`);
  }
  return median(values);
};

const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;

const summarize = (
  spike: string,
  records: readonly RunRecord[],
  extra: Record<string, unknown>,
): Record<string, unknown> => {
  switch (spike) {
    case 'S1': {
      const baseline = med(records, 'baseline', 'coldAnalysisMilliseconds');
      const compiled = med(records, 'compiled', 'coldAnalysisMilliseconds');
      const reduction = 1 - compiled / baseline;
      const rebasedBudget = 2500 * (baseline / m2ProBuild123dColdMilliseconds);
      const bytecodeBytes = Number(extra['addedPycBytes'] ?? Number.NaN);
      const bytecodeOk = bytecodeBytes <= 170 * 1024 * 1024;
      const verdict: Verdict =
        reduction >= 0.4 && compiled <= rebasedBudget && bytecodeOk ? 'pass' : reduction < 0.25 ? 'fail' : 'between';
      return {
        verdict,
        coldHandshakeMedianMilliseconds: { baseline: round(baseline), compiled: round(compiled) },
        samples: {
          baseline: numbers(records, 'baseline', 'coldAnalysisMilliseconds'),
          compiled: numbers(records, 'compiled', 'coldAnalysisMilliseconds'),
        },
        warmCacheMedianMilliseconds: {
          baseline: round(med(records, 'baseline-warm', 'coldAnalysisMilliseconds')),
          compiled: round(med(records, 'compiled-warm', 'coldAnalysisMilliseconds')),
        },
        reductionPercent: round(reduction * 100),
        runnerBudgetMilliseconds: round(rebasedBudget),
        runnerBudgetRule: `2.5 s × (runner baseline ${String(round(baseline))} ms / M2 Pro baseline ${String(m2ProBuild123dColdMilliseconds)} ms)`,
        bytecodeOk,
        line: 'pass: ≥ 40 % below baseline, ≤ re-based 2.5 s, bytecode ≤ 170 MiB; fail: < 25 % → drop D22 compile step',
        inputs: extra,
      };
    }
    case 'S2': {
      const il = (field: string): number => med(records, 'il', field);
      const r2r = (field: string): number => med(records, 'r2r', field);
      const firstBuildGain = 1 - r2r('firstBuildMilliseconds') / il('firstBuildMilliseconds');
      const handshakeRatio = r2r('coldHandshakeMilliseconds') / il('coldHandshakeMilliseconds');
      const layer = extra['layer'] as
        | { il: { layer: { gzipBytes: number } }; r2r: { layer: { gzipBytes: number } } }
        | undefined;
      const gzipDelta = layer ? layer.r2r.layer.gzipBytes - layer.il.layer.gzipBytes : Number.NaN;
      const verdict: Verdict =
        firstBuildGain >= 0.3 && handshakeRatio <= 1.05 && gzipDelta <= 15_000_000
          ? 'pass'
          : firstBuildGain < 0.15
            ? 'fail'
            : 'between';
      const fields = [
        'coldHandshakeMilliseconds',
        'firstCompileMilliseconds',
        'firstBuildRequestMilliseconds',
        'firstBuildMilliseconds',
        'coldToFirstGeometryMilliseconds',
        'warmEditMedianMilliseconds',
      ];
      return {
        verdict,
        medians: Object.fromEntries(fields.map((field) => [field, { il: round(il(field)), r2r: round(r2r(field)) }])),
        firstBuildGainPercent: round(firstBuildGain * 100),
        handshakeRatio: round(handshakeRatio, 3),
        layerGzipDeltaBytes: gzipDelta,
        line: 'pass: first build −30 %, handshake not worse (≤ +5 % noise), layer ≤ +15 MB gz; fail: < 15 % → IL-only stays',
        inputs: extra,
      };
    }
    case 'S3': {
      const row = (label: string) => ({
        wallMedianMilliseconds: round(med(records, label, 'wallMilliseconds')),
        cpuMedianMilliseconds: round(med(records, label, 'cpuMilliseconds')),
        files: numbers(records, label, 'files')[0],
        bytes: numbers(records, label, 'bytes')[0],
      });
      const rows = Object.fromEntries(
        [...new Set(records.map((record) => record.label))].sort().map((label) => [label, row(label)]),
      ) as Record<string, ReturnType<typeof row>>;
      const budgets = { 'python-async-cold': 10_000, 'python-threads-cold': 3000, 'picogk-async-cold': 1000 } as const;
      const checks = Object.fromEntries(
        Object.entries(budgets).map(([label, m2Pro]) => [
          label,
          {
            m2ProBudgetMilliseconds: m2Pro,
            runnerBudgetMilliseconds: m2Pro * runnerSlack,
            measured: rows[label]?.wallMedianMilliseconds,
            ok: (rows[label]?.wallMedianMilliseconds ?? Infinity) <= m2Pro * runnerSlack,
          },
        ]),
      );
      const verdict: Verdict = Object.values(checks).every((check) => check.ok) ? 'pass' : 'fail';
      return {
        verdict,
        rows,
        checks,
        line: 'pass: Python ≤ 10 s single-threaded, ≤ 3 s threaded; PicoGK ≤ 1 s (runner: × 2)',
        inputs: extra,
      };
    }
    case 'S5': {
      const delta = (field: string) => {
        const floor = med(records, 'floor', field);
        const accelerate = med(records, 'accelerate', field);
        return {
          floor: round(floor),
          accelerate: round(accelerate),
          changePercent: round((accelerate / floor - 1) * 100, 2),
        };
      };
      const cold = delta('coldAnalysisMilliseconds');
      const warm = delta('warmWorkloadMilliseconds');
      const verdict: Verdict = Math.abs(cold.changePercent) < 5 && Math.abs(warm.changePercent) < 5 ? 'pass' : 'fail';
      return {
        verdict,
        coldHandshake: cold,
        warmWorkload: warm,
        v8Build: delta('v8BuildMilliseconds'),
        boxLoop: delta('boxLoopMilliseconds'),
        line: '< 5 % → one floor wheel per (os, arch); ≥ 5 % → two variants by minimumOsVersion',
        inputs: extra,
      };
    }
    case 'S6': {
      const gain = (field: string) => {
        const native = med(records, 'arm64', field);
        const translated = med(records, 'x64-rosetta', field);
        return {
          arm64: round(native),
          x64Rosetta: round(translated),
          nativeFasterByPercent: round((1 - native / translated) * 100),
        };
      };
      const cold = gain('coldAnalysisMilliseconds');
      const warm = gain('warmWorkloadMilliseconds');
      const translatedHost = records.find((record) => record.label === 'x64-rosetta')?.host;
      const verdict: Verdict = warm.nativeFasterByPercent >= 25 ? 'pass' : 'fail';
      return {
        verdict,
        coldHandshake: cold,
        warmWorkload: warm,
        v8Build: gain('v8BuildMilliseconds'),
        boxLoop: gain('boxLoopMilliseconds'),
        translatedHost,
        line: 'pass (warm workload ≥ 25 % faster native) enables a v2 hardware-native preference; fail keeps v1',
        inputs: extra,
      };
    }
    case 'S13': {
      const row = (label: string) => ({
        wallMedianMilliseconds: round(med(records, label, 'wallMilliseconds')),
        cpuMedianMilliseconds: round(med(records, label, 'cpuMilliseconds')),
        files: numbers(records, label, 'files')[0],
        bytes: numbers(records, label, 'bytes')[0],
        compressedBytes: numbers(records, label, 'compressedBytes')[0],
      });
      const python = row('python-hash');
      const picogk = row('picogk-hash');
      const pythonNoHash = row('python-nohash');
      const picogkNoHash = row('picogk-nohash');
      const verdict: Verdict =
        python.wallMedianMilliseconds <= 30_000 && picogk.wallMedianMilliseconds <= 6000 ? 'pass' : 'fail';
      return {
        verdict,
        python,
        picogk,
        hashWhileWriteOverheadPercent: {
          python: round((python.wallMedianMilliseconds / pythonNoHash.wallMedianMilliseconds - 1) * 100),
          picogk: round((picogk.wallMedianMilliseconds / picogkNoHash.wallMedianMilliseconds - 1) * 100),
        },
        pythonNoHash,
        picogkNoHash,
        line: 'pass: Python ≤ 15 s, PicoGK ≤ 3 s on M2 Pro (≤ 30 s / ≤ 6 s on macos-15)',
        inputs: extra,
      };
    }
    default: {
      throw new TypeError(`unknown spike ${spike}`);
    }
  }
};

const main = (): void => {
  const flags = parseFlags(['spike', 'dir', 'out', 'extra', 'title']);
  const spike = requiredFlag(flags, 'spike');
  const records = load(requiredFlag(flags, 'dir'));
  const extraPath = flags.get('extra');
  const extra = extraPath === undefined ? {} : (JSON.parse(readFileSync(extraPath, 'utf8')) as Record<string, unknown>);
  const summary: Record<string, unknown> = {
    spike,
    title: flags.get('title') ?? spike,
    host: records[0]?.host,
    ...summarize(spike, records, extra),
  };
  writeFileSync(requiredFlag(flags, 'out'), `${JSON.stringify(summary, undefined, 2)}\n`);
  const step = process.env['GITHUB_STEP_SUMMARY'];
  if (step) {
    appendFileSync(
      step,
      `## ${String(summary['title'])}: ${String(summary['verdict'])}\n\n\`\`\`json\n${JSON.stringify(summary, undefined, 2)}\n\`\`\`\n`,
    );
  }
  console.log(JSON.stringify(summary, undefined, 2));
};

try {
  main();
} catch (error) {
  console.error('summarize failed:', error);
  process.exit(1);
}
