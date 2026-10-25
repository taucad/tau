import { useState } from 'react';
import { readAllocationLedgers } from '#routes/[__e2e].onshape-render-profile/allocation-ledger.js';
import { createRoot } from 'react-dom/client';
import { ViewerEnvironmentProvider, defaultViewerEnvironment } from '@taucad/viewer/environment/viewer-environment';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { RenderingProfile } from '#routes/[__e2e].onshape-render-profile/route.js';
import '#styles/global.css';

function CalibrationLifetime(): React.JSX.Element {
  const [mounted, setMounted] = useState(true);
  const [receipt, setReceipt] = useState('');
  const [name, setName] = useState('ledger5k-checkpoint');
  const save = async (): Promise<void> => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const response = await fetch('/calibration-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          image: canvas.toDataURL(),
          metadata: { checkpoint: name, ledger: readAllocationLedgers() },
        }),
      });
      if (!response.ok) {
        throw new Error(`Capture failed: ${response.status}`);
      }
      setReceipt(JSON.stringify(await response.json()));
    } catch (error) {
      setReceipt(String(error));
    }
  };
  return (
    <>
      {new URLSearchParams(location.search).has('ledger') ? (
        <div className='fixed right-0 bottom-0 z-50 bg-white p-2 text-black'>
          <button
            type='button'
            onClick={() => {
              setMounted((value) => !value);
            }}
          >
            {mounted ? 'Unmount viewer' : 'Remount viewer'}
          </button>
          <input
            aria-label='Ledger checkpoint name'
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <button
            type='button'
            onClick={() => {
              void save();
            }}
          >
            Save allocation checkpoint
          </button>
          <pre aria-label='Allocation checkpoint receipt'>{receipt}</pre>
        </div>
      ) : null}
      {mounted ? <RenderingProfile /> : null}
    </>
  );
}

createRoot(document.querySelector('#root')!).render(
  <ViewerEnvironmentProvider value={defaultViewerEnvironment}>
    <KeyboardProvider>
      <CalibrationLifetime />
    </KeyboardProvider>
  </ViewerEnvironmentProvider>,
);
