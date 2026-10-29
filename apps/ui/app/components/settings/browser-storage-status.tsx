import { SettingsRow } from '#components/settings/settings-item.js';
import type { PersistentStorageStatus } from '#filesystem/handle-store.js';

const statusCopy: Record<PersistentStorageStatus, { title: string; description: string }> = {
  'best-effort': {
    title: 'Saved in this browser',
    description: 'The browser may clear Home projects when space runs low. Keep important work in a workspace.',
  },
  persistent: {
    title: 'Protected from automatic cleanup',
    description: 'Clearing site data still removes Home projects',
  },
  unknown: {
    title: 'Protection not confirmed',
    description: 'Tau could not check whether the browser may clear Home projects',
  },
  unavailable: {
    title: 'Protection unavailable',
    description: 'This browser does not say whether it may clear Home projects',
  },
};

/**
 * Browser eviction protection is separate from whether an individual save worked. The status is re-read whenever
 * Settings opens or the window regains focus, so there is nothing for the person to press.
 *
 * @param props - Observed status.
 * @returns Storage settings copy, with no permission prompt or save-error styling.
 */
export function BrowserStorageStatus({ status }: { readonly status: PersistentStorageStatus }): React.JSX.Element {
  const copy = statusCopy[status];
  return (
    <div role='status'>
      <SettingsRow title={copy.title} description={copy.description} />
    </div>
  );
}
