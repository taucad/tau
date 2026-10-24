/**
 * What `test_model` takes from a project's `geospec.config.*`: its data fields as defaults, and one report of a
 * config the host could not apply. Hosts read the config with `readGeoSpecConfig` and never run its exporters.
 *
 * @module
 */

import type { TestModelConfig } from '@taucad/chat';
import type { GeoSpecConfigData, ReadGeoSpecConfigResult } from 'geospec/config';

/** One call's view of the project config, for {@link RunGeoSpecTestsOptions}. @public */
export type GeoSpecTestModelConfig = {
  /** Data fields a `test_model` input field of the same name replaces. */
  readonly defaults?: GeoSpecConfigData;
  /** What the call reports under `config`; absent once a not-applied config was reported this session. */
  readonly report?: TestModelConfig;
};

/**
 * Track one host session's reads of the project config, so a config the host cannot apply is reported once, on the
 * first call that reads it, and again only when its file or reason changes.
 *
 * @returns A function from each call's `readGeoSpecConfig` result to what that call applies and reports.
 * @public
 */
export const createGeoSpecConfigSession = (): ((result: ReadGeoSpecConfigResult) => GeoSpecTestModelConfig) => {
  let reported: string | undefined;
  return (result) => {
    if (result.status === 'absent') {
      reported = undefined;
      return {};
    }
    if (result.status === 'applied') {
      reported = undefined;
      return { defaults: result.options, report: { status: 'applied', path: result.configPath } };
    }
    const key = JSON.stringify([result.configPath, result.reason, result.message]);
    if (reported === key) {
      return {};
    }
    reported = key;
    return {
      report: {
        status: 'not-applied',
        path: result.configPath,
        code: 'GEOSPEC_CONFIG_NOT_APPLIED',
        reason: result.reason,
        message: result.message,
      },
    };
  };
};
