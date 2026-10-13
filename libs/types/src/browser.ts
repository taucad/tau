import { z } from 'zod';

/** Browser IPC channel names; only the trusted desktop preload exposes them. @public */
export const browserChannels = { command: 'tau:browser:command', state: 'tau:browser:state' } as const;

/** Device-local browsing preferences, never part of project records. @public */
export const browserSettingsSchema = z.strictObject({
  searchEngine: z.enum(['duckduckgo', 'google', 'bing']).default('duckduckgo'),
  rememberHistory: z.boolean().default(true),
  defaultZoom: z.number().min(0.5).max(2).default(1),
});
/** Browser preference values. @public */
export type BrowserSettings = z.output<typeof browserSettingsSchema>;

const tabId = z.string().min(1).max(100);
/** Finite validated operations; no arbitrary channel, script, path or session selection. @public */
export const browserCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('snapshot') }),
  z.strictObject({ kind: z.literal('new-tab'), input: z.string().max(8192).optional() }),
  z.strictObject({ kind: z.literal('select-tab'), tabId }),
  z.strictObject({ kind: z.literal('close-tab'), tabId }),
  z.strictObject({ kind: z.literal('navigate'), tabId, input: z.string().min(1).max(8192) }),
  z.strictObject({
    kind: z.literal('action'),
    tabId,
    action: z.enum(['back', 'forward', 'reload', 'stop', 'print', 'screenshot', 'external', 'devtools']),
  }),
  z.strictObject({ kind: z.literal('zoom'), tabId, factor: z.number().min(0.25).max(3) }),
  z.strictObject({
    kind: z.literal('find'),
    tabId,
    text: z.string().max(1000),
    forward: z.boolean().default(true),
    next: z.boolean().default(false),
  }),
  z.strictObject({
    kind: z.literal('viewport'),
    tabId,
    leaseId: tabId,
    visible: z.boolean(),
    x: z.number().min(0).max(100_000),
    y: z.number().min(0).max(100_000),
    width: z.number().min(0).max(100_000),
    height: z.number().min(0).max(100_000),
  }),
  z.strictObject({ kind: z.literal('detach'), leaseId: tabId }),
  z.strictObject({ kind: z.literal('settings'), settings: browserSettingsSchema }),
  z.strictObject({ kind: z.literal('clear-data'), scope: z.enum(['history', 'all']) }),
  z.strictObject({ kind: z.literal('cancel-download'), downloadId: tabId }),
]);
/** A typed request across the trusted preload boundary. @public */
export type BrowserCommand = z.input<typeof browserCommandSchema>;
/** Display state for one untrusted page. @public */
export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  zoom: number;
  error?: string;
  matches?: { active: number; total: number };
};
/** A bounded device-local history item. @public */
export type BrowserHistoryEntry = { url: string; title: string; visitedAt: number };
/** Download metadata excludes local filesystem paths. @public */
export type BrowserDownload = {
  id: string;
  name: string;
  received: number;
  total: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
};
/** Snapshot sent exclusively to the owning trusted app window. @public */
export type BrowserSnapshot = {
  tabs: BrowserTab[];
  activeTabId?: string;
  settings: BrowserSettings;
  history: BrowserHistoryEntry[];
  downloads: BrowserDownload[];
};
/** Browser bridge installed only in Tau's trusted renderer. @public */
export type BrowserBridge = {
  command(command: BrowserCommand): Promise<BrowserSnapshot>;
  subscribe(listener: (snapshot: BrowserSnapshot) => void): () => void;
};
