'use client';

import type { ComponentType, ReactElement } from 'react';
import dynamic from 'next/dynamic';

const loadRuntimeDemo = async (): Promise<ComponentType> => {
  const module_ = await import('./components/runtime-demo');
  return module_.RuntimeDemo;
};

const RuntimeDemo = dynamic(loadRuntimeDemo, {
  ssr: false,
  loading: () => (
    <main className='flex min-h-screen flex-col gap-4 p-3 sm:p-5'>
      <section
        className='border-slate-400/20 bg-slate-900/85 flex min-h-20 flex-col items-start justify-between gap-4 rounded-lg border px-5 py-4 md:flex-row md:items-center'
        aria-labelledby='runtime-heading'
      >
        <div>
          <div className='text-teal-300 text-xs font-bold tracking-normal uppercase'>Turbopack + Web Worker</div>
          <h1 id='runtime-heading' className='mt-1.5 text-2xl leading-tight font-bold tracking-normal'>
            Tau Runtime Next.js Example
          </h1>
          <p className='text-slate-400 mt-2 max-w-3xl text-sm leading-normal'>Loading the browser runtime worker.</p>
        </div>
      </section>
    </main>
  ),
});

export function RuntimeDemoClientEntry(): ReactElement {
  return <RuntimeDemo />;
}
