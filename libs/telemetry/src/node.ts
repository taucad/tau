/**
 * `@taucad/telemetry/node`: a Node host's device telemetry preference, from the environment and the config file, never
 * from the network (package design §3, surface.ts §5). `current()` is synchronous and cheap: it returns a cached value
 * and checks the config file's mtime at most once per second (FR-06), so a reporter's `consent` reader can call it at
 * every enqueue and send.
 */
import { readFileSync, statSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { DevicePreference } from '#client.js';

/** The preference `tau telemetry on|off` writes. @public */
export type TelemetryPreference = 'on' | 'off';

/** Where a resolved preference came from. @public */
export type TelemetryPreferenceSource = 'env' | 'do-not-track' | 'config' | 'default';

/** The resolved device preference. @public */
export type ResolvedTelemetryPreference = Readonly<{
  preference: DevicePreference;
  /** True only when the config file says `on` for this API origin (an anonymous CLI's opt-in, Q20). */
  explicitOptIn: boolean;
  source: TelemetryPreferenceSource;
}>;

/** The config file's name under the CLI config directory. @public */
export const telemetryConfigFileName = 'telemetry.json';

const configSchema = z.object({ origins: z.record(z.string(), z.enum(['on', 'off'])).default({}) }).loose();
type TelemetryConfig = z.output<typeof configSchema>;

const offValues: ReadonlySet<string> = new Set(['0', 'false', 'off']);
/** Milliseconds between config-file `stat`s. */
const statInterval = 1000;

/**
 * Read the config file, or an empty config when it is absent or unreadable (a broken file never throws into a host).
 *
 * @param file - The file path.
 * @returns The config.
 */
const readConfig = (file: string): TelemetryConfig => {
  try {
    const parsed = configSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : { origins: {} };
  } catch {
    return { origins: {} };
  }
};

/**
 * The config file's mtime, or `undefined` when it does not exist.
 *
 * @param file - The file path.
 * @returns Milliseconds.
 */
const mtimeOf = (file: string): number | undefined => {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
};

/**
 * A Node host's device preference: `TAU_TELEMETRY=0|false|off`, then `DO_NOT_TRACK=1`, then the config file's entry
 * for this API origin, then unset (which behaves as `on`).
 *
 * @param input - The environment, the config directory and the API origin.
 * @returns `current()` and `write()`.
 * @public
 */
export const nodeTelemetryPreference = (
  input: Readonly<{
    env: Readonly<Record<string, string | undefined>>;
    configDir: string;
    apiOrigin: string;
    /** The clock; defaults to `Date.now`. */
    now?: () => number;
  }>,
): Readonly<{
  current(): ResolvedTelemetryPreference;
  /** Writes `<config>/telemetry.json` for this origin; `tau telemetry on|off`. */
  write(preference: TelemetryPreference): Promise<void>;
}> => {
  const now = input.now ?? Date.now;
  const file = path.join(input.configDir, telemetryConfigFileName);
  const { origin } = new URL(input.apiOrigin);
  let checkedAt = Number.NEGATIVE_INFINITY;
  let mtime: number | undefined;
  let config: TelemetryConfig = { origins: {} };

  const refresh = (): void => {
    if (now() - checkedAt < statInterval) {
      return;
    }
    checkedAt = now();
    const next = mtimeOf(file);
    if (next !== mtime) {
      mtime = next;
      config = next === undefined ? { origins: {} } : readConfig(file);
    }
  };

  return {
    current: () => {
      const variable = input.env['TAU_TELEMETRY']?.trim().toLowerCase();
      if (variable !== undefined && offValues.has(variable)) {
        return { preference: 'off', explicitOptIn: false, source: 'env' };
      }
      if (input.env['DO_NOT_TRACK']?.trim() === '1') {
        return { preference: 'off', explicitOptIn: false, source: 'do-not-track' };
      }
      refresh();
      const stored = config.origins[origin];
      return stored === undefined
        ? { preference: 'unset', explicitOptIn: false, source: 'default' }
        : { preference: stored, explicitOptIn: stored === 'on', source: 'config' };
    },
    write: async (preference) => {
      await mkdir(input.configDir, { recursive: true });
      const next = readConfig(file);
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(
        temporary,
        `${JSON.stringify({ ...next, origins: { ...next.origins, [origin]: preference } }, undefined, 2)}\n`,
        { mode: 0o600 },
      );
      await rename(temporary, file);
      checkedAt = Number.NEGATIVE_INFINITY;
    },
  };
};
