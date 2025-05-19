import { createBrowserInspector } from '@statelyai/inspect';

export const { inspect } = createBrowserInspector({ window: globalThis.window });
