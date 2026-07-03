import { createRoot } from 'react-dom/client';
import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import type { runtime } from '../main/runtime-definition.js';
import { RuntimeFixture } from '../../../../support/RuntimeFixture';

const clientOptions = createElectronClientOptions<typeof runtime>({ renderTimeout: 60_000 });

createRoot(document.querySelector('#root')!).render(
  <RuntimeFixture<typeof runtime> clientOptions={clientOptions} mode='file' />,
);
