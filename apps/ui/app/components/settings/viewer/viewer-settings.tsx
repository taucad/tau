/**
 * Settings → Viewer (onboarding blueprint, Finding 6): how 3D views look and respond. View defaults hold the person's
 * own value for each inheritable view leaf. Everything is stored on this device through the person record; no view
 * file is written. The section exists only while `viewerControls` is on; the registry hides it otherwise.
 */
import { useCallback, useState } from 'react';
import { ViewDefaultsGroup } from '#components/settings/viewer/view-defaults-group.js';
import { viewerStorageRefused } from '#components/settings/viewer/viewer-settings-copy.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import type { SectionWriteResult } from '#preferences/section-store.js';

/**
 * The Viewer settings section.
 *
 * @returns The section.
 */
export function ViewerSettings(): React.JSX.Element {
  const { viewer, writeViewer } = usePersonRecord();
  /* A write this device would not store still applies in this tab; the line says so and blocks nothing. A later
   * write that saves stores the earlier ones with it, so the line goes. */
  const [isRefused, setIsRefused] = useState(false);
  const onWrite = useCallback((result: SectionWriteResult) => {
    setIsRefused(result !== 'saved');
  }, []);

  return (
    <div className='flex min-w-0 flex-col gap-6 pb-6'>
      <p role='status' className='text-xs empty:hidden' data-testid='viewer-storage-status'>
        {isRefused ? viewerStorageRefused : undefined}
      </p>
      <ViewDefaultsGroup viewer={viewer} writeViewer={writeViewer} onWrite={onWrite} />
    </div>
  );
}
