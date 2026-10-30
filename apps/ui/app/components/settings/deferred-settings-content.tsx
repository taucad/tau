import { useEffect, useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import type { SettingsSection } from '#hooks/use-settings-dialog.js';
import type { SettingsContent } from '#components/settings/settings-content.js';

const loadSettingsContent = async (): Promise<{ SettingsContent: typeof SettingsContent }> =>
  import('#components/settings/settings-content.js');

type ContentState = { status: 'loading' } | { status: 'ready'; Content: typeof SettingsContent } | { status: 'failed' };

/** Load settings controls only inside an open settings surface, keeping navigation available on failure. */
export function DeferredSettingsContent({ section }: { readonly section: SettingsSection }): React.JSX.Element {
  const [state, setState] = useState<ContentState>({ status: 'loading' });
  const [loadContent, setLoadContent] = useState(() => loadSettingsContent);
  useEffect(() => {
    const controller = new AbortController();
    // async-iife: bootstrap -- the effect owns cancellation and exposes a settled failure with retry.
    void (async (): Promise<void> => {
      try {
        const { SettingsContent: Content } = await loadContent();
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
  }, [loadContent]);

  if (state.status === 'ready') {
    return <state.Content section={section} />;
  }
  if (state.status === 'failed') {
    return (
      <div role='alert' aria-label='Settings unavailable' className='flex flex-col items-start gap-3'>
        <p>Settings could not be loaded. Try again.</p>
        <Button
          variant='outline'
          onClick={() => {
            setState({ status: 'loading' });
            setLoadContent(() => async () => loadSettingsContent());
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div role='status' aria-label='Loading settings' aria-busy='true'>
      Loading settings…
    </div>
  );
}
