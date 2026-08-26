import { Suspense, lazy, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs.js';
import { Loader } from '#components/ui/loader.js';
import { GearDemo } from '#routes/_index/demo/gear-demo.js';

// OpenRSCAD (WASM) is confined to this lazily-imported module, so selecting the
// QR tab is the only thing that pulls the WASM kernel into the page.
const QrDemoLazy = lazy(async () => {
  const m = await import('#routes/_index/demo/qr-demo.js');
  return { default: m.QrDemo };
});

/**
 * Live, in-browser demo (R6). The gear runs on the pure-JS JSCAD kernel and is
 * the default; adjusting parameters rebuilds it instantly and re-runs the
 * unbranded geometry checks. The QR tab lazy-loads the OpenRSCAD kernel on
 * selection only.
 */
export function LiveDemoSection(): React.JSX.Element {
  const [tab, setTab] = useState<'gear' | 'qr'>('gear');

  return (
    <div className='space-y-6'>
      <div className='text-center'>
        <h2 className='text-2xl font-semibold tracking-tight md:text-3xl'>See it in action</h2>
        <p className='mt-2 text-muted-foreground'>
          Tweak parameters, watch the model rebuild, and see the geometry checked live.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as 'gear' | 'qr');
        }}
      >
        <div className='mb-4 flex justify-center'>
          <TabsList>
            <TabsTrigger value='gear'>Gear</TabsTrigger>
            <TabsTrigger value='qr'>QR code</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value='gear'>
          <GearDemo />
        </TabsContent>
        <TabsContent value='qr'>
          {tab === 'qr' ? (
            <Suspense
              fallback={
                <div className='flex h-[560px] items-center justify-center rounded-xl border bg-sidebar'>
                  <Loader />
                </div>
              }
            >
              <QrDemoLazy />
            </Suspense>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
