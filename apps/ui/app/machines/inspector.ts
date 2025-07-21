// eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition -- enables easy debugging
export const inspect = false
  ? await import('@statelyai/inspect').then(
      (m) => m.createBrowserInspector({ url: 'https://stately.ai/registry/inspect?rightPanel=sequence' }).inspect,
    )
  : undefined;
