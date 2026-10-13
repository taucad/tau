/**
 * Purpose: Shared argument, host and statistics helpers for the native-dependency spike scripts.
 * Why: Every spike records the same host facts and summary statistics (charter wave 0, S1–S13).
 * Environment: Node 24+; imported by the sibling spike scripts only.
 * Usage: import { hostFacts, median, parseFlags } from './spike-common.mts';
 * Exit codes: none (library module).
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { arch, availableParallelism, cpus, platform, release, totalmem } from 'node:os';
import process from 'node:process';

/** Host facts recorded beside every measurement so runner numbers stay attributable. */
export type HostFacts = {
  readonly platform: string;
  readonly arch: string;
  readonly nodeVersion: string;
  readonly osRelease: string;
  readonly productVersion: string | undefined;
  readonly cpuModel: string | undefined;
  readonly parallelism: number;
  readonly totalMemoryBytes: number;
  readonly translated: boolean | undefined;
  readonly loadAverage: string | undefined;
};

const command = (file: string, arguments_: readonly string[]): string | undefined => {
  try {
    return execFileSync(file, arguments_, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
};

/**
 * Collect the host facts for a measurement record.
 *
 * @returns Platform, architecture, CPU model, Rosetta translation state and load average.
 */
export const hostFacts = (): HostFacts => {
  const translated = command('sysctl', ['-n', 'sysctl.proc_translated']);
  return {
    platform: platform(),
    arch: arch(),
    nodeVersion: process.version,
    osRelease: release(),
    productVersion: command('sw_vers', ['-productVersion']),
    cpuModel: cpus()[0]?.model,
    parallelism: availableParallelism(),
    totalMemoryBytes: totalmem(),
    translated: translated === undefined ? undefined : translated === '1',
    loadAverage: command('sysctl', ['-n', 'vm.loadavg']),
  };
};

/**
 * Median of a non-empty sample.
 *
 * @param values - Samples.
 * @returns The middle value (mean of the two middle values for an even count).
 */
export const median = (values: readonly number[]): number => {
  if (values.length === 0) {
    throw new RangeError('median of an empty sample');
  }
  const ordered = [...values].sort((left, right) => left - right);
  const middle = (ordered.length - 1) / 2;
  return (ordered[Math.floor(middle)]! + ordered[Math.ceil(middle)]!) / 2;
};

/**
 * Parse `--name value` flags against an allow-list.
 *
 * @param allowed - Flag names without the leading dashes.
 * @returns The flag values by name.
 */
export const parseFlags = (allowed: readonly string[]): Map<string, string> => {
  const arguments_ = process.argv.slice(2);
  const flags = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index]?.replace(/^--/u, '');
    const value = arguments_[index + 1];
    if (!name || !allowed.includes(name) || value === undefined) {
      throw new TypeError(`Unknown or incomplete flag ${String(arguments_[index])}; allowed: ${allowed.join(', ')}`);
    }
    flags.set(name, value);
  }
  return flags;
};

/**
 * Read a required flag.
 *
 * @param flags - Parsed flags.
 * @param name - Flag name.
 * @returns The value.
 */
export const requiredFlag = (flags: ReadonlyMap<string, string>, name: string): string => {
  const value = flags.get(name);
  if (value === undefined) {
    throw new TypeError(`--${name} is required`);
  }
  return value;
};

/**
 * Write one JSON record to `--out` (or stdout) with the host facts attached.
 *
 * @param out - Destination path, or undefined for stdout.
 * @param record - The measurement record.
 */
export const emit = (out: string | undefined, record: Record<string, unknown>): void => {
  const text = `${JSON.stringify({ host: hostFacts(), ...record }, undefined, 2)}\n`;
  if (out === undefined) {
    process.stdout.write(text);
  } else {
    writeFileSync(out, text);
  }
};

/**
 * CPU time of this process (all threads) in milliseconds since `since`.
 *
 * @param since - An earlier `process.cpuUsage()` reading.
 * @returns User plus system milliseconds.
 */
export const cpuMilliseconds = (since: NodeJS.CpuUsage): number => {
  const usage = process.cpuUsage(since);
  return (usage.user + usage.system) / 1000;
};
