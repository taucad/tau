const inspectEnabled = false;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- enables easy debugging
export const inspect = inspectEnabled
  ? await import('@statelyai/inspect').then(
      (m) => m.createBrowserInspector({ url: 'https://stately.ai/registry/inspect?rightPanel=sequence' }).inspect,
    )
  : undefined;
