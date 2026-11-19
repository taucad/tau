import { useMemo } from 'react';
import {
  createSettingsCatalogue,
  searchSettings as searchCatalogue,
} from '@taucad/settings-ui/components/settings/settings-catalogue';
import type {
  SettingDefinition,
  SettingId,
  SettingsSectionDefinition,
} from '@taucad/settings-ui/components/settings/settings-catalogue';
import type { SettingsSection } from '@taucad/settings-ui/components/settings/settings-section';
import { experimentalFeatureFlagNames, flagRegistry, featureFlagDefaults } from '#flags/flag.constants.js';
import type { FeatureFlagName } from '#flags/flag.constants.js';
import { useFeature } from '#flags/use-feature.js';
import { initialDeploymentMode } from '#cloud/deployment-mode.js';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';
import { isDesktopTarget } from '#lib/build-target.js';

/*
 * The catalogue itself is pure and lives in `@taucad/settings-ui`. This module owns what this deployment offers:
 * the Experimental rows from the app's feature flags, and the Tau Cloud, desktop and flag gates.
 */
const settingsCatalog = createSettingsCatalogue(
  experimentalFeatureFlagNames.map((flag) => ({
    name: flag,
    label: flagRegistry[flag].label,
    description: flagRegistry[flag].description,
  })),
);

/**
 * The Tau Cloud rows (adaptive app deployment mode W4): Billing, Show credits and Close account exist only while the
 * display mode is `funded`, read at render. A pinned build's mode is a constant, so its catalogue never changes.
 */
const withoutCloud = (sections: readonly SettingsSectionDefinition[]): readonly SettingsSectionDefinition[] =>
  sections
    .filter((section) => section.id !== 'billing')
    .map((section) =>
      section.id === 'agents'
        ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'show-credits') }
        : section.id === 'data-controls'
          ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'close-account') }
          : section,
    );

const cloudSections: readonly SettingsSectionDefinition[] = settingsCatalog;
/* Machines are hosted by the desktop services utility; the web build has no
 * host to add one to, so the section is hidden rather than shown empty. Desktop's
 * Home is a folder on disk, so it has no browser storage to show. */
const platformSections: readonly SettingsSectionDefinition[] = isDesktopTarget()
  ? cloudSections.map((section) =>
      section.id === 'filesystem'
        ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'browser-storage') }
        : /* The desktop shell has no optional analytics cookies to choose; its analytics switch stands in. */
          section.id === 'data-controls'
          ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'cookie-preferences') }
          : section,
    )
  : cloudSections
      .filter((section) => section.id !== 'machines' && section.id !== 'browser')
      /* The permission selector governs the desktop shell, which the web build has none of (D1). The web asks for
       * analytics consent through cookie preferences, so the desktop analytics switch is not offered there. */
      .map((section) => ({
        ...section,
        entries: section.entries.filter(
          (entry) => entry.id !== 'default-permissions' && entry.id !== 'desktop-analytics',
        ),
      }));

const fundedSections: readonly SettingsSectionDefinition[] = platformSections
  .filter((section) => section.id !== 'machines' || featureFlagDefaults.machines)
  .map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => entry.id !== 'automatic-reload' || featureFlagDefaults.automaticReload),
  }));

const unfundedSections = withoutCloud(fundedSections);

/**
 * The sections for a display mode: every one while `funded`, none of the Tau Cloud rows otherwise.
 *
 * @param isFunded - Whether the display mode is `funded`.
 * @returns The sections.
 */
export const settingsSectionsFor = (isFunded: boolean): readonly SettingsSectionDefinition[] =>
  isFunded ? fundedSections : unfundedSections;

/** The sections for the build's initial mode: a pinned build's for its life. */
export const settingsSections: readonly SettingsSectionDefinition[] = settingsSectionsFor(
  initialDeploymentMode.state === 'funded',
);

/**
 * Sections that exist only while a runtime flag is on. The flag is read at render (PostHog evaluates it after
 * hydration), so these are filtered by {@link useSettingsSections} rather than at module load like the build-time
 * gates above. With the flag off the section, its search results and its deep link are absent.
 */
const flaggedSections: Readonly<Partial<Record<SettingsSection, FeatureFlagName>>> = { viewer: 'viewerControls' };

/** Entries inside an ungated section that exist only while a runtime flag is on, filtered the same way. */
const flaggedEntries: ReadonlyMap<string, FeatureFlagName> = new Map<SettingId, FeatureFlagName>([
  ['use-setup-answers', 'onboarding'],
  ['setup-answers', 'onboarding'],
]);

/**
 * The sections this deployment shows for the given runtime flags.
 *
 * @param isOn - Whether a flag is on.
 * @param isFunded - Whether the display mode is `funded`; the build's initial mode by default.
 * @returns The sections, in catalogue order.
 */
export function availableSettingsSections(
  isOn: (flag: FeatureFlagName) => boolean,
  isFunded: boolean = initialDeploymentMode.state === 'funded',
): readonly SettingsSectionDefinition[] {
  const isShown = (flag: FeatureFlagName | undefined): boolean => flag === undefined || isOn(flag);
  return settingsSectionsFor(isFunded)
    .filter((section) => isShown(flaggedSections[section.id]))
    .map((section) => {
      const entries = section.entries.filter((entry) => isShown(flaggedEntries.get(entry.id)));
      return entries.length === section.entries.length ? section : { ...section, entries };
    });
}

/**
 * The sections shown now, refreshed when a gating flag changes.
 *
 * @returns The sections, stable while the flags are.
 */
export function useSettingsSections(): readonly SettingsSectionDefinition[] {
  const viewerControls = useFeature('viewerControls');
  const onboarding = useFeature('onboarding');
  const isFunded = useDeploymentMode().state === 'funded';
  return useMemo(() => {
    const flags: Readonly<Partial<Record<FeatureFlagName, boolean>>> = { viewerControls, onboarding };
    return availableSettingsSections((flag) => flags[flag] === true, isFunded);
  }, [viewerControls, onboarding, isFunded]);
}

/**
 * Match every query word in the sections this deployment shows, prioritizing setting names over descriptions and
 * aliases.
 *
 * @param query - What the person typed.
 * @param sections - The sections to search; by default those shown with every runtime flag off.
 * @returns The matching sections, best match first, each with its matching entries.
 */
export function searchSettings(
  query: string,
  sections: readonly SettingsSectionDefinition[] = availableSettingsSections(() => false),
): Array<{ section: SettingsSectionDefinition; entries: SettingDefinition[] }> {
  return searchCatalogue(query, sections);
}
