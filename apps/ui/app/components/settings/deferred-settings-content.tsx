import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import type { SettingsSection } from '@taucad/settings-ui/components/settings/settings-section';
import { SettingsPageSkeleton } from '@taucad/settings-ui/components/settings/settings-item';
import type { SettingsContent } from '#components/settings/settings-content.js';
import { loadCode } from '@taucad/ui-core/lib/code-loading';

const loadSettingsContent = async (): Promise<{ SettingsContent: typeof SettingsContent }> =>
  loadCode(async () => import('#components/settings/settings-content.js'));

type ContentState = { status: 'loading' } | { status: 'ready'; Content: typeof SettingsContent } | { status: 'failed' };

/** Load settings controls only inside an open settings surface, keeping navigation available on failure. */
export function DeferredSettingsContent({ section }: { readonly section: SettingsSection }): React.JSX.Element {
  const [state, setState] = useState<ContentState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    // async-iife: bootstrap -- the effect owns cancellation and exposes a settled failure with Reload.
    void (async (): Promise<void> => {
      try {
        const { SettingsContent: Content } = await loadSettingsContent();
        if (!controller.signal.aborted) {
          setState({ status: 'ready', Content });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: 'failed' });
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  if (state.status === 'ready') {
    return <state.Content section={section} />;
  }
  if (state.status === 'failed') {
    return (
      // This page keeps a module that failed to load failed, so only a reload can load it (FP9): no in-place retry.
      <div role='alert' aria-label='Settings unavailable' className='flex flex-col items-start gap-3'>
        <p>Settings did not finish loading. Reload to continue.</p>
        <Button
          variant='outline'
          onClick={() => {
            globalThis.location.reload();
          }}
        >
          <RefreshCcw className='size-4' />
          Reload
        </Button>
      </div>
    );
  }
  return (
    // The controls' code is still arriving: draw the page's shape, not a line of text.
    <SettingsPageSkeleton label='Loading settings' />
  );
}
