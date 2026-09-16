import { useMemo } from 'react';
import { z } from 'zod';
import { tauCloudEnabled } from '#cloud/cloud-enabled.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { enumParameter } from '#utils/search-parameter.codecs.js';

/** Sections the dialog can show, and the single source of truth for `?settings=`. */
export const settingsSectionSchema = z.enum([
  'general',
  'filesystem',
  'account',
  'security',
  'billing',
  'compute',
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

type SettingsDialogState = {
  readonly isOpen: boolean;
  readonly section: SettingsSection;
  /** Opens the dialog, on `section` when given. */
  readonly open: (section?: SettingsSection) => void;
  /** Closes the dialog by deleting the parameter. */
  readonly close: () => void;
};

/**
 * Settings dialog state, held in `?settings=<section>` through the shared
 * search-parameter owner.
 *
 * Must be called inside a React Router context. It replaces rather than pushes:
 * Back should leave the surface behind the dialog, not step through sections.
 *
 * @returns Whether the dialog is open, its section, and the open/close writers.
 */
export function useSettingsDialog(): SettingsDialogState {
  const [value, setValue] = useSearchParameter('settings', settingsParameter);
  /* One object per setter identity. React Router renews `setSearchParams` on
   * every URL change, so these are stable between navigations but not across
   * them — fine for handlers, not for an effect that must outlive its write. */
  const actions = useMemo(
    () => ({
      open: (next?: SettingsSection): void => {
        setValue(next ?? defaultSection);
      },
      close: (): void => {
        setValue('');
      },
    }),
    [setValue],
  );
  return {
    isOpen: value !== '',
    section: value === '' || (value === 'billing' && !tauCloudEnabled) ? defaultSection : value,
    ...actions,
  };
}
