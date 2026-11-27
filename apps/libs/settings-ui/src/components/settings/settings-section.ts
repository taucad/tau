import { z } from 'zod';

/**
 * Sections the settings dialog can show, and the single source of truth for `?settings=`. Kept apart from the
 * catalogue so the URL codec does not load the catalogue's copy and icons.
 */
export const settingsSectionSchema = z.enum([
  'general',
  'browser',
  'filesystem',
  'account',
  'security',
  'repositories',
  'billing',
  'data-controls',
  'viewer',
  'compute',
  'machines',
  'models',
  'agents',
  'experimental',
]);

export type SettingsSection = z.infer<typeof settingsSectionSchema>;
