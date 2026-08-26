import { describe, expect, it } from 'vitest';
import { buildKclSettingsJson, tauHeadlessKclSettings } from '#kcl-headless-settings.js';

/* eslint-disable @typescript-eslint/naming-convention -- keys mirror WASM `Configuration` JSON (serde snake_case) */
const headlessModelingDefaults = {
  enable_ssao: false,
  highlight_edges: false,
  show_scale_grid: false,
  fixed_size_grid: false,
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- end serde snake_case fixture keys */

type ParsedModeling = {
  enable_ssao?: boolean;
  highlight_edges?: boolean;
  show_scale_grid?: boolean;
  fixed_size_grid?: boolean;
  base_unit?: string;
};

describe('tauHeadlessKclSettings / buildKclSettingsJson', () => {
  it('sets all headless visual defaults on the constant', () => {
    expect(tauHeadlessKclSettings.settings?.modeling).toMatchObject(headlessModelingDefaults);
  });

  it('serialises headless defaults for all visual flags when no overrides are passed', () => {
    const parsed = JSON.parse(buildKclSettingsJson()) as { settings?: { modeling?: ParsedModeling } };
    expect(parsed.settings?.modeling).toMatchObject(headlessModelingDefaults);
  });

  it('merges caller modeling overrides without dropping headless defaults when not overridden', () => {
    const parsed = JSON.parse(
      buildKclSettingsJson({
        settings: {
          modeling: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- wire JSON (serde snake_case)
            base_unit: 'in',
          },
        },
      }),
    ) as { settings?: { modeling?: ParsedModeling } };
    expect(parsed.settings?.modeling).toMatchObject({
      ...headlessModelingDefaults,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- wire JSON (serde snake_case)
      base_unit: 'in',
    });
  });

  it('lets caller override enable_ssao to true', () => {
    const parsed = JSON.parse(
      buildKclSettingsJson({
        settings: {
          modeling: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- wire JSON (serde snake_case)
            enable_ssao: true,
          },
        },
      }),
    ) as { settings?: { modeling?: ParsedModeling } };
    expect(parsed.settings?.modeling?.enable_ssao).toBe(true);
    expect(parsed.settings?.modeling?.highlight_edges).toBe(false);
    expect(parsed.settings?.modeling?.show_scale_grid).toBe(false);
    expect(parsed.settings?.modeling?.fixed_size_grid).toBe(false);
  });
});
