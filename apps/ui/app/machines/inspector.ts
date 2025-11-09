import type { InspectionEvent } from 'xstate';

// Toggle this to enable/disable inspector
const inspectEnabled = false;

// Default to console inspector for easy debugging
const isConsoleInspectorEnabled = true;

const consoleInspector = (args: InspectionEvent) => {
  if (args.type === '@xstate.event') {
    console.debug(args.event);
  }
};

const getBrowserInspector = async () => {
  const m = await import('@statelyai/inspect');
  return m.createBrowserInspector({ url: 'https://stately.ai/registry/inspect?rightPanel=sequence' }).inspect;
};

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- enables easy debugging
export const inspect = inspectEnabled
  ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- enables easy debugging
    isConsoleInspectorEnabled
    ? consoleInspector
    : await getBrowserInspector()
  : undefined;
