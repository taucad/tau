/**
 * The frame hint (loading states UX blueprint, § Geometry sources): this device's last workspace layout per project,
 * kept where a blocking script in the document head can read it before first paint. The editor machine's
 * `panelState` is the source of truth; this is its mirror, readable before any project state is.
 *
 * One `localStorage` record maps a project's URL key (`<workspaceSlug>/<projectSlug>`) to its wide lane layout and its
 * phone layout (A15c). The key is the URL's, not the project id, because the pre-paint script only has the URL. It is
 * capped at {@link frameHintProjectLimit} projects by last use.
 *
 * The record becomes CSS variables: the pre-paint script writes them on `<html>`, and on the client
 * `WorkspaceFrame` writes the same variables on itself, so a client navigation to another project overrides the
 * document's values by the cascade. The lanes read only the variables; React renders none of their names on `<html>`.
 * The phone tab bar's selected destination is an attribute selector, `data-frame-tab` on `<html>`: the script sets
 * it, and on the client the frame sets it again for its own project before paint.
 */
import {
  defaultPanelState,
  mobileDrawerOpenSnapPoint,
  mobilePanelIds,
} from '@taucad/ui-core/constants/editor.constants';
import type { MobilePanelId } from '@taucad/ui-core/constants/editor.constants';

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

/**
 * The phone workspace the frame draws (A15c): the surface the sheet shows (`viewer` is the sheet closed on the model)
 * and the detent it opens at. The sheet's detent is not kept across loads, so `snap` is the one the sheet opens at
 * for `tab` ({@link phoneOpeningSnapPoint}), recorded so the pre-paint script need not know the rule.
 */
export type PhoneFrameHint = Readonly<{ tab: MobilePanelId; snap: number }>;

/** One project's entry: the wide layout, the phone layout, or both. Later lanes add the composer beside them. */
export type FrameHintEntry = Readonly<{ usedAt: number; wide?: WideFrameHint; phone?: PhoneFrameHint }>;

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

/** The CSS variables the phone frame reads. Every name the pre-paint script may set for a phone layout is here. */
export const phoneFrameHintVariableNames = ['--frame-sheet-display', '--frame-sheet-height'] as const;

export type PhoneFrameHintVariables = Readonly<Record<(typeof phoneFrameHintVariableNames)[number], string>>;

/**
 * The attribute naming the tab bar's selected destination (`chat`, `parameters`, `model` or `all`) on `<html>`. The
 * pre-paint script sets it for the document's first project; on the client `WorkspaceFrame` sets it again for its own
 * project before paint.
 */
export const frameTabAttribute = 'data-frame-tab';

/** The tab bar's destinations, as `MobileWorkbenchNavigation` names them. */
export type PhoneFrameDestination = 'chat' | 'parameters' | 'model' | 'all';

/** A project never opened on this device has the default layout, which is also what its stored layout starts as. */
export const defaultWideFrameHint: WideFrameHint = defaultPanelState.desktopLayout;

/**
 * The detent a sheet opens at on load: full for the Editor, half for any other surface (`useChatInterfaceState`).
 *
 * @param tab - The surface.
 * @returns The snap point, a fraction of the viewport.
 */
export const phoneOpeningSnapPoint = (tab: MobilePanelId): number => (tab === 'editor' ? 1 : mobileDrawerOpenSnapPoint);

/** A project never opened on a phone on this device opens on the model, with the sheet closed. */
export const defaultPhoneFrameHint: PhoneFrameHint = {
  tab: defaultPanelState.mobileActiveTab,
  snap: phoneOpeningSnapPoint(defaultPanelState.mobileActiveTab),
};

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

const isPhoneFrameHint = (value: unknown): value is PhoneFrameHint => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const phone = value as Record<string, unknown>;
  return (
    typeof phone['tab'] === 'string' &&
    (mobilePanelIds as readonly string[]).includes(phone['tab']) &&
    (phone['snap'] === mobileDrawerOpenSnapPoint || phone['snap'] === 1)
  );
};

/**
 * The part of a stored entry the writer may keep: its numeric `usedAt` and each of its shapes that is valid, so a
 * shape this build cannot read (another build's surface, say) never costs the entry its other shape. Undefined when
 * no shape is valid.
 */
const keptEntry = (value: unknown): FrameHintEntry | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { usedAt, wide, phone } = value as Record<string, unknown>;
  const isWide = isWideFrameHint(wide);
  const isPhone = isPhoneFrameHint(phone);
  if (typeof usedAt !== 'number' || (!isWide && !isPhone)) {
    return undefined;
  }
  return { usedAt, ...(isWide ? { wide } : {}), ...(isPhone ? { phone } : {}) };
};

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

/**
 * The tab bar destination a surface selects, as `ChatInterfaceNav` derives it: the model for the closed sheet, Chat
 * and Parameters for themselves, and All for every other surface. The pre-paint script derives the same.
 *
 * @param tab - The surface.
 * @returns The destination.
 */
export const phoneFrameDestination = (tab: MobilePanelId): PhoneFrameDestination =>
  tab === 'viewer' ? 'model' : tab === 'chat' || tab === 'parameters' ? tab : 'all';

/**
 * The CSS variables for a phone layout. The pre-paint script derives the same values (`buildFrameHintScript`); the
 * frame-hint test holds the two together.
 *
 * @param phone - The layout.
 * @returns The variables.
 */
export const phoneFrameHintVariables = (phone: PhoneFrameHint): PhoneFrameHintVariables => ({
  '--frame-sheet-display': phone.tab === 'viewer' ? 'none' : 'flex',
  '--frame-sheet-height': phone.tab === 'viewer' ? '0px' : `calc(${phone.snap} * 100dvh)`,
});

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

/**
 * A project's remembered phone layout, or undefined when this device has none (or it is malformed). The value is the
 * same object until the stored record changes.
 *
 * @param key - The project's URL key (`frameHintKey`).
 * @returns The layout, or undefined.
 */
export const readPhoneFrameHint = (key: string): PhoneFrameHint | undefined => {
  const phone = readRecord()?.projects[key]?.phone;
  return isPhoneFrameHint(phone) ? phone : undefined;
};

const sameWide = (left: WideFrameHint | undefined, right: WideFrameHint): boolean =>
  left !== undefined &&
  left.chatOpen === right.chatOpen &&
  left.chatWidth === right.chatWidth &&
  left.workbenchOpen === right.workbenchOpen &&
  left.workbenchWidth === right.workbenchWidth &&
  left.compactAuxiliary === right.compactAuxiliary;

/** Write one project's entry, keeping the shape this write does not carry and the other projects up to the cap. */
const writeEntry = ({
  key,
  shape,
  isUnchanged,
  now,
}: Readonly<{
  key: string;
  shape: Readonly<{ wide: WideFrameHint } | { phone: PhoneFrameHint }>;
  isUnchanged: (previous: FrameHintEntry) => boolean;
  now: number;
}>): void => {
  const record = readRecord();
  const previous = record?.projects[key];
  /* A malformed stored entry for this key keeps only its valid shape, or compares as no entry. */
  const kept = keptEntry(previous);
  if (kept !== undefined && isUnchanged(kept) && now - kept.usedAt < 60_000) {
    return;
  }
  const entry: FrameHintEntry = {
    usedAt: now,
    ...(kept?.wide === undefined ? {} : { wide: kept.wide }),
    ...(kept?.phone === undefined ? {} : { phone: kept.phone }),
    ...shape,
  };
  /* A malformed entry or shape is dropped here, as the readers ignore it, rather than failing the write. */
  const others = Object.entries((record?.projects ?? {}) as Record<string, unknown>)
    .filter(([other]) => other !== key)
    .flatMap(([other, value]): Array<[string, FrameHintEntry]> => {
      const entry = keptEntry(value);
      return entry === undefined ? [] : [[other, entry]];
    })
    .toSorted(([, left], [, right]) => right.usedAt - left.usedAt)
    .slice(0, frameHintProjectLimit - 1);
  const next: FrameHintRecord = { v: 1, projects: Object.fromEntries([[key, entry], ...others]) };
  try {
    globalThis.localStorage.setItem(frameHintStorageKey, JSON.stringify(next));
  } catch {
    /* Quota or blocked storage: the hint stays as it was. */
  }
};

/**
 * Remember a project's wide layout. A full or blocked storage leaves the hint as it was: the frame then draws the last
 * layout it knew, or the default.
 *
 * @param key - The project's URL key (`frameHintKey`).
 * @param wide - The layout as the editor machine holds it.
 * @param now - The time of use, for the cap.
 */
export const writeWideFrameHint = (key: string, wide: WideFrameHint, now: number = Date.now()): void => {
  writeEntry({
    key,
    shape: {
      wide: {
        chatOpen: wide.chatOpen,
        chatWidth: wide.chatWidth,
        workbenchOpen: wide.workbenchOpen,
        workbenchWidth: wide.workbenchWidth,
        compactAuxiliary: wide.compactAuxiliary,
      },
    },
    isUnchanged: (previous) => sameWide(previous.wide, wide),
    now,
  });
};

/**
 * Remember a project's phone layout (A15c): the surface the sheet shows and the detent it opens at.
 *
 * @param key - The project's URL key (`frameHintKey`).
 * @param tab - The surface as the editor machine holds it.
 * @param now - The time of use, for the cap.
 */
export const writePhoneFrameHint = (key: string, tab: MobilePanelId, now: number = Date.now()): void => {
  const snap = phoneOpeningSnapPoint(tab);
  writeEntry({
    key,
    shape: { phone: { tab, snap } },
    isUnchanged: (previous) => previous.phone?.tab === tab && previous.phone.snap === snap,
    now,
  });
};

/**
 * The blocking pre-paint script (blueprint, § Geometry sources). It runs in the document head before the body is
 * parsed, so it may only touch `<html>`: it sets `--wait-offset` to minus the time already elapsed since navigation
 * start (A15a's indicator delays count from navigation start through it), and, for a project URL, the variables of
 * each valid shape of its entry: the lanes' for the wide layout, and the sheet's and the tab bar's `data-frame-tab`
 * for the phone layout (A15c). A malformed shape, record or unreadable storage leaves the defaults the frame's CSS
 * falls back to.
 *
 * It derives the values as `frameHintVariables`, `phoneFrameHintVariables` and `phoneFrameDestination` do; the
 * frame-hint test holds them together. Its CSP hash is listed in `#lib/inline-script-hashes`.
 *
 * @returns The script body.
 */
export const buildFrameHintScript = (): string =>
  `(()=>{const h=document.documentElement,s=h.style;` +
  `try{s.setProperty('--wait-offset',-Math.round(performance.now())+'ms')}catch(e){}` +
  `try{const m=/^\\/w\\/([^/]+)\\/([^/]+)/.exec(location.pathname);if(!m)return;` +
  `const r=JSON.parse(localStorage.getItem(${JSON.stringify(frameHintStorageKey)})||'null');` +
  `const e=r&&r.v===1&&r.projects&&r.projects[m[1]+'/'+m[2]];if(!e||typeof e!=='object')return;` +
  `const w=e.wide,f=e.phone;` +
  `const n=(v)=>typeof v==='number'&&isFinite(v)&&v>0&&v<10000;` +
  `if(w&&typeof w.chatOpen==='boolean'&&typeof w.workbenchOpen==='boolean'&&n(w.chatWidth)&&n(w.workbenchWidth)&&(w.compactAuxiliary==='chat'||w.compactAuxiliary==='workbench')){` +
  `const p=w.compactAuxiliary,o=p==='chat'?'workbench':'chat',open=(l)=>l==='chat'?w.chatOpen:w.workbenchOpen,c=open(p)?p:open(o)?o:'';` +
  `const d=(b)=>b?'flex':'none';` +
  `s.setProperty('--frame-chat-width',Math.round(w.chatWidth)+'px');` +
  `s.setProperty('--frame-workbench-width',Math.round(w.workbenchWidth)+'px');` +
  `s.setProperty('--frame-chat-display',d(w.chatOpen));` +
  `s.setProperty('--frame-chat-compact-display',d(c==='chat'));` +
  `s.setProperty('--frame-workbench-display',d(w.workbenchOpen));` +
  `s.setProperty('--frame-workbench-compact-display',d(c==='workbench'))}` +
  `if(f&&typeof f==='object'&&${JSON.stringify(mobilePanelIds)}.includes(f.tab)&&(f.snap===${mobileDrawerOpenSnapPoint}||f.snap===1)){` +
  `const t=f.tab,v=t==='viewer';` +
  `s.setProperty('--frame-sheet-display',v?'none':'flex');` +
  `s.setProperty('--frame-sheet-height',v?'0px':'calc('+f.snap+' * 100dvh)');` +
  `h.setAttribute(${JSON.stringify(frameTabAttribute)},v?'model':t==='chat'||t==='parameters'?t:'all')}` +
  `}catch(e){}})()`;
