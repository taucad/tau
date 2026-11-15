/**
 * The frame hint (loading states UX blueprint, § Geometry sources): this device's last workspace layout per project,
 * kept where a blocking script in the document head can read it before first paint. The editor machine's
 * `panelState` is the source of truth; this is its mirror, readable before any project state is.
 *
 * One `localStorage` record maps a project's URL key (`<workspaceSlug>/<projectSlug>`) to its wide lane layout. The
 * key is the URL's, not the project id, because the pre-paint script only has the URL. It is capped at
 * {@link frameHintProjectLimit} projects by last use.
 *
 * The record becomes CSS variables: the pre-paint script writes them on `<html>`, and on the client
 * `WorkspaceFrame` writes the same variables on itself, so a client navigation to another project overrides the
 * document's values by the cascade. The lanes read only the variables; React renders none of their names on `<html>`.
 */
import { defaultPanelState } from '@taucad/ui-core/constants/editor.constants';

/** The `localStorage` key holding the frame hint. */
export const frameHintStorageKey = 'tau-frame-hint';

/** How many projects the hint remembers, by last use. */
export const frameHintProjectLimit = 50;

/** The wide workspace layout the frame draws: the lanes' open state and widths, as the editor machine keeps them. */
export type WideFrameHint = Readonly<{
  chatOpen: boolean;
  chatWidth: number;
  workbenchOpen: boolean;
  workbenchWidth: number;
  compactAuxiliary: 'chat' | 'workbench';
}>;

/** One project's entry. Later lanes add the phone and composer shapes beside `wide`. */
export type FrameHintEntry = Readonly<{ usedAt: number; wide: WideFrameHint }>;

/** The stored record. */
export type FrameHintRecord = Readonly<{ v: 1; projects: Readonly<Record<string, FrameHintEntry>> }>;

/** The CSS variables the frame's lanes read. Every name the pre-paint script may set is here. */
export const frameHintVariableNames = [
  '--frame-chat-width',
  '--frame-workbench-width',
  '--frame-chat-display',
  '--frame-chat-compact-display',
  '--frame-workbench-display',
  '--frame-workbench-compact-display',
] as const;

export type FrameHintVariables = Readonly<Record<(typeof frameHintVariableNames)[number], string>>;

/** A project never opened on this device has the default layout, which is also what its stored layout starts as. */
export const defaultWideFrameHint: WideFrameHint = defaultPanelState.desktopLayout;

/**
 * The URL key of a project route, or undefined for any other path. The segments stay as the URL encodes them, so the
 * pre-paint script and React derive the same key from `location.pathname`.
 *
 * @param pathname - A URL path.
 * @returns `<workspaceSlug>/<projectSlug>`, or undefined.
 */
export const frameHintKey = (pathname: string): string | undefined => {
  const match = /^\/w\/([^/]+)\/([^/]+)/u.exec(pathname);
  return match === null ? undefined : `${match[1]}/${match[2]}`;
};

const isWidth = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 10_000;

const isWideFrameHint = (value: unknown): value is WideFrameHint => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const wide = value as Record<string, unknown>;
  return (
    typeof wide['chatOpen'] === 'boolean' &&
    typeof wide['workbenchOpen'] === 'boolean' &&
    isWidth(wide['chatWidth']) &&
    isWidth(wide['workbenchWidth']) &&
    (wide['compactAuxiliary'] === 'chat' || wide['compactAuxiliary'] === 'workbench')
  );
};

/** A stored entry the writer may keep: an object with a numeric `usedAt` and a valid wide layout. */
const isFrameHintEntry = (value: unknown): value is FrameHintEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>)['usedAt'] === 'number' &&
  isWideFrameHint((value as Record<string, unknown>)['wide']);

/** The lane that keeps its place beside the viewer below the compact width (`resolveCompactAuxiliary`). */
const compactLane = (wide: WideFrameHint): 'chat' | 'workbench' | undefined => {
  const preferred = wide.compactAuxiliary;
  if (preferred === 'chat' ? wide.chatOpen : wide.workbenchOpen) {
    return preferred;
  }
  const other = preferred === 'chat' ? 'workbench' : 'chat';
  return (other === 'chat' ? wide.chatOpen : wide.workbenchOpen) ? other : undefined;
};

/**
 * The CSS variables for a wide layout. The pre-paint script derives the same values (`buildFrameHintScript`); the
 * frame-hint test holds the two together.
 *
 * @param wide - The layout.
 * @returns The variables.
 */
export const frameHintVariables = (wide: WideFrameHint): FrameHintVariables => {
  const compact = compactLane(wide);
  return {
    '--frame-chat-width': `${Math.round(wide.chatWidth)}px`,
    '--frame-workbench-width': `${Math.round(wide.workbenchWidth)}px`,
    '--frame-chat-display': wide.chatOpen ? 'flex' : 'none',
    '--frame-chat-compact-display': compact === 'chat' ? 'flex' : 'none',
    '--frame-workbench-display': wide.workbenchOpen ? 'flex' : 'none',
    '--frame-workbench-compact-display': compact === 'workbench' ? 'flex' : 'none',
  };
};

/** The last stored value read, and its parse; `''` before the first read, which no stored record is. */
let cachedRaw = '';
let cachedRecord: FrameHintRecord | undefined;

const parseRecord = (raw: string | undefined): FrameHintRecord | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const { v, projects } = parsed as Record<string, unknown>;
    if (v !== 1 || typeof projects !== 'object' || projects === null) {
      return undefined;
    }
    return { v: 1, projects: projects as Record<string, FrameHintEntry> };
  } catch {
    return undefined;
  }
};

/** The stored record, parsed once per stored value. Unreadable storage reads as no record. */
const readRecord = (): FrameHintRecord | undefined => {
  let raw: string | undefined;
  try {
    raw = globalThis.localStorage.getItem(frameHintStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
  if (raw === undefined) {
    return undefined;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecord = parseRecord(raw);
  }
  return cachedRecord;
};

/**
 * A project's remembered wide layout, or undefined when this device has none (or the entry is malformed). The value
 * is the same object until the stored record changes, so it can be a `useSyncExternalStore` snapshot.
 *
 * @param key - The project's URL key (`frameHintKey`).
 * @returns The layout, or undefined.
 */
export const readWideFrameHint = (key: string): WideFrameHint | undefined => {
  const wide = readRecord()?.projects[key]?.wide;
  return isWideFrameHint(wide) ? wide : undefined;
};

const sameWide = (left: WideFrameHint | undefined, right: WideFrameHint): boolean =>
  left !== undefined &&
  left.chatOpen === right.chatOpen &&
  left.chatWidth === right.chatWidth &&
  left.workbenchOpen === right.workbenchOpen &&
  left.workbenchWidth === right.workbenchWidth &&
  left.compactAuxiliary === right.compactAuxiliary;

/**
 * Remember a project's wide layout. A full or blocked storage leaves the hint as it was: the frame then draws the last
 * layout it knew, or the default.
 *
 * @param key - The project's URL key (`frameHintKey`).
 * @param wide - The layout as the editor machine holds it.
 * @param now - The time of use, for the cap.
 */
export const writeWideFrameHint = (key: string, wide: WideFrameHint, now: number = Date.now()): void => {
  const record = readRecord();
  const previous = record?.projects[key];
  if (sameWide(previous?.wide, wide) && previous !== undefined && now - previous.usedAt < 60_000) {
    return;
  }
  const entry: FrameHintEntry = {
    usedAt: now,
    wide: {
      chatOpen: wide.chatOpen,
      chatWidth: wide.chatWidth,
      workbenchOpen: wide.workbenchOpen,
      workbenchWidth: wide.workbenchWidth,
      compactAuxiliary: wide.compactAuxiliary,
    },
  };
  /* A malformed entry is dropped here, as the readers ignore it, rather than failing the write. */
  const kept = Object.entries((record?.projects ?? {}) as Record<string, unknown>)
    .filter((entry): entry is [string, FrameHintEntry] => entry[0] !== key && isFrameHintEntry(entry[1]))
    .toSorted(([, left], [, right]) => right.usedAt - left.usedAt)
    .slice(0, frameHintProjectLimit - 1);
  const next: FrameHintRecord = { v: 1, projects: Object.fromEntries([[key, entry], ...kept]) };
  try {
    globalThis.localStorage.setItem(frameHintStorageKey, JSON.stringify(next));
  } catch {
    /* Quota or blocked storage: the hint stays as it was. */
  }
};

/**
 * The blocking pre-paint script (blueprint, § Geometry sources). It runs in the document head before the body is
 * parsed, so it may only touch `<html>`: it sets `--wait-offset` to minus the time already elapsed since navigation
 * start (A15a's indicator delays count from navigation start through it), and, for a project URL with a valid entry,
 * the frame's variables. A malformed record or unreadable storage leaves the defaults the lanes' CSS falls back to.
 *
 * It derives the variables as `frameHintVariables` does; the frame-hint test holds the two together.
 *
 * @returns The script body.
 */
export const buildFrameHintScript = (): string =>
  `(()=>{const s=document.documentElement.style;` +
  `try{s.setProperty('--wait-offset',-Math.round(performance.now())+'ms')}catch(e){}` +
  `try{const m=/^\\/w\\/([^/]+)\\/([^/]+)/.exec(location.pathname);if(!m)return;` +
  `const r=JSON.parse(localStorage.getItem(${JSON.stringify(frameHintStorageKey)})||'null');` +
  `const w=r&&r.v===1&&r.projects&&r.projects[m[1]+'/'+m[2]]&&r.projects[m[1]+'/'+m[2]].wide;if(!w)return;` +
  `const n=(v)=>typeof v==='number'&&isFinite(v)&&v>0&&v<10000;` +
  `if(typeof w.chatOpen!=='boolean'||typeof w.workbenchOpen!=='boolean'||!n(w.chatWidth)||!n(w.workbenchWidth)||(w.compactAuxiliary!=='chat'&&w.compactAuxiliary!=='workbench'))return;` +
  `const p=w.compactAuxiliary,o=p==='chat'?'workbench':'chat',open=(l)=>l==='chat'?w.chatOpen:w.workbenchOpen,c=open(p)?p:open(o)?o:'';` +
  `const d=(b)=>b?'flex':'none';` +
  `s.setProperty('--frame-chat-width',Math.round(w.chatWidth)+'px');` +
  `s.setProperty('--frame-workbench-width',Math.round(w.workbenchWidth)+'px');` +
  `s.setProperty('--frame-chat-display',d(w.chatOpen));` +
  `s.setProperty('--frame-chat-compact-display',d(c==='chat'));` +
  `s.setProperty('--frame-workbench-display',d(w.workbenchOpen));` +
  `s.setProperty('--frame-workbench-compact-display',d(c==='workbench'))` +
  `}catch(e){}})()`;
