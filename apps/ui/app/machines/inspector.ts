export const inspect = import.meta.env.DEV
  ? await import('@statelyai/inspect').then((m) => m.createBrowserInspector().inspect)
  : undefined;
