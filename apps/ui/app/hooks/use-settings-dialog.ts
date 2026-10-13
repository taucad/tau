import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import { tauCloudEnabled } from '#cloud/cloud-enabled.js';
import type { SettingId } from '#components/settings/settings-registry.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { enumParameter, stringParameter } from '#utils/search-parameter.codecs.js';

/** Sections the dialog can show, and the single source of truth for `?settings=`. */
export const settingsSectionSchema = z.enum([
  'general',
  'filesystem',
  'account',
  'security',
  'billing',
  'compute',
  'machines',
  'models',
  'agents',
  'experimental',
]);

export type SettingsSection = z.infer<typeof settingsSectionSchema>;

const defaultSection: SettingsSection = 'general';

/**
 * `''` is the closed dialog. The codec's fallback is the absent parameter, so
 * the closed state has to be a value that is *not* a section — otherwise
 * `open('general')` would serialize to the fallback and delete the parameter it
 * just wrote.
 */
const settingsParameter = enumParameter<SettingsSection | ''>(z.union([settingsSectionSchema, z.literal('')]), '');
const targetParameter = stringParameter();

type SettingsDialogState = {
  readonly isOpen: boolean;
  readonly section: SettingsSection;
  /** The setting the dialog should reveal in `section`, when one was asked for. */
  readonly target: string | undefined;
  /** Opens the dialog, on `section` when given, revealing the `target` setting when given. */
  readonly open: (section?: SettingsSection, target?: SettingId) => void;
  /** Closes the dialog by deleting its parameters. */
  readonly close: () => void;
};

/**
 * Settings dialog state, held in `?settings=<section>` and, for a deep link to
 * one control, `&setting=<id>`.
 *
 * Must be called inside a React Router context. It replaces rather than pushes:
 * Back should leave the surface behind the dialog, not step through sections.
 * Both parameters are written in one `setSearchParams`, since two setters in
 * the same tick would overwrite each other.
 *
 * @returns Whether the dialog is open, its section and target, and the open/close writers.
 */
export function useSettingsDialog(): SettingsDialogState {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const value = settingsParameter.parse(searchParameters.get(searchParameterName.settings) ?? undefined);
  const target = targetParameter.parse(searchParameters.get(searchParameterName.settingsTarget) ?? undefined);
  /* One object per setter identity. React Router renews `setSearchParams` on
   * every URL change, so these are stable between navigations but not across
   * them — fine for handlers, not for an effect that must outlive its write. */
  const actions = useMemo(() => {
    const write = (section: SettingsSection | '', nextTarget: string): void => {
      setSearchParameters(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [name, serialized] of [
            [searchParameterName.settings, settingsParameter.serialize(section)],
            [searchParameterName.settingsTarget, targetParameter.serialize(nextTarget)],
          ] as const) {
            if (serialized === undefined) {
              next.delete(name);
            } else {
              next.set(name, serialized);
            }
          }
          return next;
        },
        { replace: true },
      );
    };
    return {
      open: (next?: SettingsSection, nextTarget?: SettingId): void => {
        write(next ?? defaultSection, nextTarget ?? '');
      },
      close: (): void => {
        write('', '');
      },
    };
  }, [setSearchParameters]);
  return {
    isOpen: value !== '',
    section: value === '' || (value === 'billing' && !tauCloudEnabled) ? defaultSection : value,
    target: value === '' || target === '' ? undefined : target,
    ...actions,
  };
}
