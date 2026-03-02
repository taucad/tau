import { useSearchParams } from 'react-router';
import type { SetURLSearchParams } from 'react-router';

export type SettingsSection = 'general' | 'filesystem' | 'account' | 'security' | 'api-keys' | 'billing' | 'experimental';

const validSections = new Set<string>(['general', 'filesystem', 'account', 'security', 'api-keys', 'billing', 'experimental']);

type SettingsDialogState = {
  readonly isOpen: boolean;
  readonly section: SettingsSection;
};

const defaultSection: SettingsSection = 'general';

/**
 * Module-level reference to the latest `setSearchParams` from React Router.
 * Updated on every render of `useSettingsDialog()` so that imperative
 * functions (`openSettingsDialog`, `closeSettingsDialog`, etc.) can
 * manipulate the URL outside of React component context.
 */
let setSearchParametersRef: SetURLSearchParams | undefined;

function isValidSection(value: string): value is SettingsSection {
  return validSections.has(value);
}

/**
 * Opens the settings dialog, optionally navigating to a specific section.
 * Safe to call from event handlers outside React components.
 */
export function openSettingsDialog(section?: SettingsSection): void {
  if (!setSearchParametersRef) {
    return;
  }

  setSearchParametersRef(
    (previous) => {
      const next = new URLSearchParams(previous);
      next.set('settings', section ?? defaultSection);
      return next;
    },
    { replace: true },
  );
}

/**
 * Closes the settings dialog by removing the `?settings` param.
 * Safe to call from event handlers outside React components.
 */
export function closeSettingsDialog(): void {
  if (!setSearchParametersRef) {
    return;
  }

  setSearchParametersRef(
    (previous) => {
      const next = new URLSearchParams(previous);
      next.delete('settings');
      return next;
    },
    { replace: true },
  );
}

/**
 * Sets the active section within the settings dialog.
 * Safe to call from event handlers outside React components.
 */
export function setSettingsSection(section: SettingsSection): void {
  if (!setSearchParametersRef) {
    return;
  }

  setSearchParametersRef(
    (previous) => {
      const next = new URLSearchParams(previous);
      next.set('settings', section);
      return next;
    },
    { replace: true },
  );
}

/**
 * Hook to observe the settings dialog state, derived from the
 * `?settings=<section>` URL search parameter.
 *
 * Must be rendered inside a React Router context. Stores the
 * `setSearchParams` reference for imperative access by the
 * exported helper functions.
 */
export function useSettingsDialog(): SettingsDialogState {
  const [searchParameters, setSearchParameters] = useSearchParams();

  // Keep the module-level ref in sync so imperative callers work
  setSearchParametersRef = setSearchParameters;

  const rawSection = searchParameters.get('settings');

  if (rawSection === null) {
    return { isOpen: false, section: defaultSection };
  }

  const section = isValidSection(rawSection) ? rawSection : defaultSection;
  return { isOpen: true, section };
}
