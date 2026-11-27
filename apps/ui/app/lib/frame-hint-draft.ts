/**
 * The draft hint (loading states UX blueprint, § Input during loading, "Stored draft"): the composer's last draft text
 * on this device, kept where the early input's inline script can read it while the document is still being parsed, so
 * the first painted frame already holds the draft. The composer record stays the source of truth; this is its mirror,
 * readable before any record is.
 *
 * One `localStorage` record, beside the frame hint and keyed like it: Home's draft, and per project URL key
 * (`<workspaceSlug>/<projectSlug>`, `frameHintKey`) the draft of the chat that was focused, with that chat's id. It is a
 * separate key from the layout hint so a keystroke never rewrites the layout record. It is capped at
 * {@link draftHintProjectLimit} projects by last use, and a draft longer than {@link draftHintTextLimit} characters is
 * not mirrored (the record still holds it; the first frame then shows the empty composer, as before).
 */

import { frameHintKey } from '#lib/frame-hint.js';

/** The `localStorage` key holding the draft hint. */
export const draftHintStorageKey = 'tau-draft-hint';

/** How many projects the hint remembers, by last use. */
export const draftHintProjectLimit = 50;

/** The longest draft mirrored, in UTF-16 code units. */
export const draftHintTextLimit = 4000;

/** One remembered draft. `chatId` names the chat a project draft belongs to; Home's has none. */
export type DraftHintEntry = Readonly<{ usedAt: number; text: string; chatId?: string }>;

/** The stored record. */
export type DraftHintRecord = Readonly<{
  v: 1;
  home?: DraftHintEntry;
  projects: Readonly<Record<string, DraftHintEntry>>;
}>;

/** Which draft: Home's, or a project's by its URL key. */
export type DraftHintScope = Readonly<{ kind: 'home' }> | Readonly<{ kind: 'project'; key: string }>;

const isDraftHintEntry = (value: unknown): value is DraftHintEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['usedAt'] === 'number' &&
    typeof entry['text'] === 'string' &&
    entry['text'] !== '' &&
    (entry['chatId'] === undefined || typeof entry['chatId'] === 'string')
  );
};

const readRecord = (): DraftHintRecord | undefined => {
  try {
    const raw = globalThis.localStorage.getItem(draftHintStorageKey);
    if (raw === null) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const { v, home, projects } = parsed as Record<string, unknown>;
    if (v !== 1 || typeof projects !== 'object' || projects === null) {
      return undefined;
    }
    return {
      v: 1,
      ...(isDraftHintEntry(home) ? { home } : {}),
      projects: projects as Record<string, DraftHintEntry>,
    };
  } catch {
    /* Unreadable storage or a malformed record reads as no record. */
    return undefined;
  }
};

/**
 * Which draft hint a main composer mirrors: Home's on `/`, a project's on its route, none elsewhere (another new-project
 * surface, a preview).
 *
 * @param pathname - The document's path.
 * @param isProjectComposer - Whether the composer belongs to a project.
 * @returns The scope, or undefined.
 */
export const draftHintScopeOf = (pathname: string, isProjectComposer: boolean): DraftHintScope | undefined => {
  if (!isProjectComposer) {
    return pathname === '/' ? { kind: 'home' } : undefined;
  }
  const key = frameHintKey(pathname);
  return key === undefined ? undefined : { kind: 'project', key };
};

/**
 * The remembered draft for a scope, or undefined when there is none (or it is malformed).
 *
 * @param scope - Home, or a project by its URL key.
 * @returns The entry.
 */
export const readDraftHint = (scope: DraftHintScope): DraftHintEntry | undefined => {
  const record = readRecord();
  const entry = scope.kind === 'home' ? record?.home : record?.projects[scope.key];
  return isDraftHintEntry(entry) ? entry : undefined;
};

/**
 * Mirror a composer's draft text. An empty text, or one past the length limit, removes the scope's entry, so the next
 * load paints the empty composer rather than a draft the record no longer holds. A full or blocked storage leaves the
 * hint as it was.
 *
 * @param scope - Home, or a project by its URL key.
 * @param draft - The draft's text, and for a project the chat it belongs to.
 * @param now - The time of use, for the cap.
 */
export const writeDraftHint = (
  scope: DraftHintScope,
  draft: Readonly<{ text: string; chatId?: string }>,
  now: number = Date.now(),
): void => {
  const record = readRecord();
  const entry: DraftHintEntry | undefined =
    draft.text !== '' && draft.text.length <= draftHintTextLimit
      ? { usedAt: now, text: draft.text, ...(draft.chatId === undefined ? {} : { chatId: draft.chatId }) }
      : undefined;
  if (isUnchanged(scope.kind === 'home' ? record?.home : record?.projects[scope.key], entry)) {
    return;
  }
  const next: DraftHintRecord =
    scope.kind === 'home'
      ? { v: 1, ...(entry === undefined ? {} : { home: entry }), projects: keptProjects(record, undefined, 0) }
      : {
          v: 1,
          ...(record?.home === undefined ? {} : { home: record.home }),
          projects: {
            ...(entry === undefined ? {} : { [scope.key]: entry }),
            ...keptProjects(record, scope.key, entry === undefined ? 0 : 1),
          },
        };
  try {
    globalThis.localStorage.setItem(draftHintStorageKey, JSON.stringify(next));
  } catch {
    /* Quota or blocked storage: the hint stays as it was. */
  }
};

/** Whether a write would store what is stored: the same draft for the same chat, or no draft where there is none. */
const isUnchanged = (previous: DraftHintEntry | undefined, entry: DraftHintEntry | undefined): boolean =>
  entry === undefined
    ? previous === undefined
    : isDraftHintEntry(previous) && previous.text === entry.text && previous.chatId === entry.chatId;

/**
 * The stored projects a write keeps: every valid entry but `replaced`, the most recently used first, leaving `reserved`
 * places of the cap for the entry being written. A malformed entry is dropped here, as the readers ignore it, rather
 * than failing the write.
 */
const keptProjects = (
  record: DraftHintRecord | undefined,
  replaced: string | undefined,
  reserved: number,
): Record<string, DraftHintEntry> =>
  Object.fromEntries(
    Object.entries((record?.projects ?? {}) as Record<string, unknown>)
      .filter((pair): pair is [string, DraftHintEntry] => pair[0] !== replaced && isDraftHintEntry(pair[1]))
      .toSorted(([, left], [, right]) => right.usedAt - left.usedAt)
      .slice(0, draftHintProjectLimit - reserved),
  );

/**
 * The early input script's reader, as source: a function of the document's location that returns the remembered
 * draft's text, or `''`, and the chat it belongs to, or `''` (`{text, chatId}`). It reads Home's draft on `/`, and on a project URL the project's draft when the URL names no
 * chat or names the chat the draft belongs to. Every storage call is caught. It derives the key as `frameHintKey`
 * does; the draft-hint test holds the two together.
 */
export const draftHintReaderSource =
  `(l)=>{try{const r=JSON.parse(localStorage.getItem(${JSON.stringify(draftHintStorageKey)})||'null');` +
  `const n={text:'',chatId:''};if(!r||r.v!==1||typeof r.projects!=='object'||!r.projects)return n;` +
  `const ok=(e)=>e&&typeof e.text==='string'&&typeof e.usedAt==='number'?e:undefined;` +
  `if(l.pathname==='/'){const e=ok(r.home);return e?{text:e.text,chatId:''}:n}` +
  `const m=/^\\/w\\/([^/]+)\\/([^/]+)/.exec(l.pathname);if(!m)return n;` +
  `const e=ok(r.projects[m[1]+'/'+m[2]]);if(!e)return n;` +
  `const c=new URLSearchParams(l.search).get('chat');const h=typeof e.chatId==='string'?e.chatId:'';` +
  `return c===null||c===e.chatId?{text:e.text,chatId:h}:n}catch(x){return{text:'',chatId:''}}}`;
