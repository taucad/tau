// Canvas review layer: Figma-style pinned comments, injected by the canvas runner into every page it serves.
//
// C toggles comment mode; click an element, type, ⌘Enter. Shift+C comments on the focused element.
// ] and [ step through open threads; Esc closes. Events are immutable files under <canvas>/review/
// (scripts/src/canvas-review.ts); "Finish review" commits them to Brain in one commit.
//
// ponytail: plain DOM in a shadow root, so it neither shares React with the canvas nor inherits its CSS.

type Target =
  | { kind: 'review-id'; reviewId: string }
  | { kind: 'role'; role: string; name: string }
  | { kind: 'path'; path: string };
type Point = { x: number; y: number };
type Anchor = { target: Target; offset: Point; excerpt: string };
type Author = { kind: string; name: string };
type Comment = { id: string; at: string; author: Author; body: string; anchor: Anchor; context: { scenario?: string } };
type Later = {
  id: string;
  at: string;
  author: Author;
  type: 'reply' | 'resolve' | 'reopen';
  body?: string;
  note?: string;
  changes?: string[];
};
type Thread = { id: string; status: 'open' | 'resolved'; comment: Comment; history: Later[] };
type State = { canvas: string; source: string; pending: number; threads: Thread[] };
type Reply = { status?: string; code?: string; message?: string; commit?: string; events?: number };
type Draft = Anchor & { body: string };

const endpoint = '/__tau/review';
let state: State = { canvas: '', source: '', pending: 0, threads: [] };
let commenting = false;
let openThread: string | undefined;
let panelOpen = false;
let notice = '';
const elements = new Map<string, Element | undefined>();

const host = document.createElement('tau-review-layer');

// --- anchors --------------------------------------------------------------------------------------

const implicitRoles = new Map([
  ['BUTTON', 'button'],
  ['SUMMARY', 'button'],
  ['H1', 'heading'],
  ['H2', 'heading'],
  ['H3', 'heading'],
  ['H4', 'heading'],
  ['H5', 'heading'],
  ['H6', 'heading'],
  ['TEXTAREA', 'textbox'],
  ['SELECT', 'combobox'],
  ['IMG', 'img'],
  ['LI', 'listitem'],
  ['TD', 'cell'],
  ['TH', 'columnheader'],
  ['DIALOG', 'dialog'],
]);
// Roles whose accessible name comes from their content; others need an explicit label.
const namedByContent = new Set([
  'button',
  'link',
  'heading',
  'tab',
  'menuitem',
  'option',
  'checkbox',
  'radio',
  'switch',
  'cell',
  'columnheader',
  'listitem',
  'treeitem',
  'row',
]);

const roleOf = (element: Element): string | undefined => {
  const explicit = element.getAttribute('role');
  if (explicit) {
    return explicit;
  }
  if (element instanceof HTMLAnchorElement) {
    return element.hasAttribute('href') ? 'link' : undefined;
  }
  if (element instanceof HTMLInputElement) {
    const { type } = element;
    if (type === 'checkbox' || type === 'radio') {
      return type;
    }
    return type === 'button' || type === 'submit' ? 'button' : 'textbox';
  }
  return implicitRoles.get(element.tagName);
};

const squash = (text: string | undefined): string => (text ?? '').replaceAll(/\s+/g, ' ').trim();
const textOf = (element: Element): string => squash(element.textContent);

const nameOf = (element: Element, role: string): string => {
  const label = element.getAttribute('aria-label');
  if (label) {
    return squash(label);
  }
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    return squash(
      labelledBy
        .split(' ')
        .map((id) => document.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '')
        .join(' '),
    );
  }
  if (element instanceof HTMLImageElement) {
    return squash(element.alt);
  }
  return namedByContent.has(role) ? textOf(element).slice(0, 120) : '';
};

const byRole = (role: string, name: string): Element[] =>
  [...document.body.querySelectorAll('*')].filter(
    (element) => !host.contains(element) && roleOf(element) === role && nameOf(element, role) === name,
  );

const pathOf = (element: Element): string => {
  const parts: string[] = [];
  for (
    let node: Element | undefined = element;
    node && node !== document.body;
    node = node.parentElement ?? undefined
  ) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      return parts.join(' > ');
    }
    const { tagName } = node;
    const siblings = [...(node.parentElement?.children ?? [])].filter((child) => child.tagName === tagName);
    parts.unshift(`${tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
  }
  return ['body', ...parts].join(' > ');
};

/** The most specific stable anchor: the nearest ancestor with a review id or a unique role and name. */
const anchorFor = (element: Element): { target: Target; element: Element } => {
  for (
    let node: Element | undefined = element;
    node && node !== document.body;
    node = node.parentElement ?? undefined
  ) {
    const reviewId = node instanceof HTMLElement ? node.dataset['reviewId'] : undefined;
    if (reviewId) {
      return { target: { kind: 'review-id', reviewId }, element: node };
    }
    const role = roleOf(node);
    const name = role ? nameOf(node, role) : '';
    if (role && name && byRole(role, name).length === 1) {
      return { target: { kind: 'role', role, name }, element: node };
    }
  }
  return { target: { kind: 'path', path: pathOf(element) }, element };
};

const find = (target: Target): Element | undefined => {
  try {
    if (target.kind === 'review-id') {
      return document.querySelector(`[data-review-id="${CSS.escape(target.reviewId)}"]`) ?? undefined;
    }
    if (target.kind === 'role') {
      return byRole(target.role, target.name)[0];
    }
    return document.querySelector(target.path) ?? undefined;
  } catch {
    return undefined;
  }
};

const elementFor = (thread: Thread): Element | undefined => {
  const cached = elements.get(thread.id);
  // A miss is cached too; the interval below clears it so a detached pin is retried, not rescanned per frame.
  if (elements.has(thread.id) && (!cached || cached.isConnected)) {
    return cached;
  }
  const found = find(thread.comment.anchor.target);
  elements.set(thread.id, found);
  return found;
};

// --- context --------------------------------------------------------------------------------------

const themeOf = (): string => {
  const root = document.documentElement;
  if (root.dataset['theme']) {
    return root.dataset['theme'];
  }
  if (root.classList.contains('dark') || root.classList.contains('light')) {
    return root.classList.contains('dark') ? 'dark' : 'light';
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const contextFor = (element: Element): Record<string, unknown> => ({
  canvas: state.canvas,
  url: location.pathname + location.search + location.hash,
  scenario:
    element.closest<HTMLElement>('[data-review-scenario]')?.dataset['reviewScenario'] ??
    new URLSearchParams(location.search).get('scenario'),
  theme: themeOf(),
  viewport: { width: innerWidth, height: innerHeight },
  textScale: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
  source: state.source,
});

// --- server ---------------------------------------------------------------------------------------

const request = async <T extends Reply>(path: string, body?: unknown): Promise<T> => {
  const response = await fetch(
    `${endpoint}${path}`,
    body === undefined
      ? {}
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
  const result = (await response.json()) as T;
  if (result.status === 'refused') {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result;
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// --- DOM ------------------------------------------------------------------------------------------

const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: 'Geist Sans', ui-sans-serif, system-ui, sans-serif; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; color: var(--popover-foreground, #111); font-size: 13px; line-height: 1.4; }
  .hover { position: fixed; border: 2px solid var(--primary, #2563eb); border-radius: 4px; background: color-mix(in oklch, var(--primary, #2563eb) 8%, transparent); display: none; }
  .pin { position: fixed; pointer-events: auto; width: 24px; height: 24px; margin: -24px 0 0 0; border-radius: 12px 12px 12px 2px; border: 2px solid var(--background, #fff);
    background: var(--primary, #2563eb); color: var(--primary-foreground, #fff); font-size: 11px; font-weight: 600; display: grid; place-items: center; padding: 0; box-shadow: 0 1px 4px rgb(0 0 0 / 0.3); }
  .pin[hidden] { display: none; }
  .pin[aria-expanded='true'] { outline: 2px solid var(--ring, #2563eb); outline-offset: 2px; }
  .card { pointer-events: auto; position: fixed; width: min(320px, calc(100vw - 32px)); background: var(--popover, #fff); color: var(--popover-foreground, #111);
    border: 1px solid var(--border, #ddd); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); padding: 12px; display: grid; gap: 8px; }
  .toolbar { pointer-events: auto; position: fixed; right: 16px; bottom: 16px; display: flex; gap: 4px; padding: 4px; background: var(--popover, #fff);
    border: 1px solid var(--border, #ddd); border-radius: 10px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.16); }
  button { font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 4px 8px; }
  button:hover { background: var(--muted, #f4f4f5); }
  button:focus-visible, textarea:focus-visible { outline: 2px solid var(--ring, #2563eb); outline-offset: 1px; }
  button.primary, button[aria-pressed='true'] { background: var(--primary, #2563eb); color: var(--primary-foreground, #fff); }
  button:disabled { opacity: 0.5; }
  kbd { font: 11px 'Geist Mono', ui-monospace, monospace; opacity: 0.7; margin-left: 4px; }
  textarea { font: inherit; color: inherit; width: 100%; min-height: 64px; resize: vertical; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border, #ddd); background: var(--background, #fff); }
  .row { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
  .meta { color: var(--muted-foreground, #666); font-size: 12px; }
  .body { white-space: pre-wrap; overflow-wrap: anywhere; }
  .entry { border-top: 1px solid var(--border, #ddd); padding-top: 6px; }
  .resolved { color: var(--success, #16a34a); }
  .error { color: var(--destructive, #dc2626); font-size: 12px; }
  .panel { pointer-events: auto; position: fixed; top: 16px; right: 16px; bottom: 64px; width: min(340px, calc(100vw - 32px)); overflow: auto; background: var(--popover, #fff);
    border: 1px solid var(--border, #ddd); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); padding: 12px; display: grid; gap: 8px; align-content: start; }
  .item { text-align: left; display: grid; gap: 2px; border: 1px solid var(--border, #ddd); }
  h2 { font-size: 14px; margin: 0; }
</style><div class="layer"><div class="hover"></div><div class="pins"></div><div class="float"></div><div class="panel-slot"></div><div class="toolbar"></div></div>`;
const part = (selector: string): HTMLElement => shadow.querySelector<HTMLElement>(selector)!;
const hoverBox = part('.hover');
const pins = part('.pins');
const float = part('.float');
const panel = part('.panel-slot');
const toolbar = part('.toolbar');

/** Trusted markup `html` inserts unescaped. */
const rawMarkup = Symbol('raw markup');
type Raw = { readonly [rawMarkup]: string };
const raw = (markup: string): Raw => ({ [rawMarkup]: markup });
const isRaw = (value: unknown): value is Raw => typeof value === 'object' && value !== null && rawMarkup in value;
const escape = (text: string): string => text.replaceAll(/["&'<>]/g, (character) => `&#${character.codePointAt(0)};`);
/** Escapes every interpolated value; nest trusted markup with `raw`. */
const html = (strings: TemplateStringsArray, ...values: unknown[]): string => {
  let out = strings[0] ?? '';
  for (const [index, value] of values.entries()) {
    out += (isRaw(value) ? value[rawMarkup] : escape(String(value))) + (strings[index + 1] ?? '');
  }
  return out;
};
const time = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const errorHtml = (): Raw => raw(notice ? html`<div class="error" role="alert">${notice}</div>` : '');

const place = (card: HTMLElement, x: number, y: number): void => {
  card.style.left = `${Math.max(16, Math.min(x, innerWidth - card.offsetWidth - 16))}px`;
  card.style.top = `${Math.max(16, Math.min(y, innerHeight - card.offsetHeight - 16))}px`;
};

const pinPoint = (thread: Thread): Point | undefined => {
  const box = elementFor(thread)?.getBoundingClientRect();
  if (!box || (box.width === 0 && box.height === 0)) {
    return undefined;
  }
  const { x, y } = thread.comment.anchor.offset;
  return { x: box.left + box.width * x, y: box.top + box.height * y };
};

const numberOf = (thread: Thread): number => state.threads.indexOf(thread) + 1;
const threadById = (id: string | undefined): Thread | undefined => state.threads.find((item) => item.id === id);

const positionPins = (): void => {
  for (const pin of pins.querySelectorAll<HTMLElement>('.pin')) {
    const thread = threadById(pin.dataset['thread']);
    const point = thread && pinPoint(thread);
    pin.hidden = !point;
    if (point) {
      pin.style.left = `${point.x}px`;
      pin.style.top = `${point.y}px`;
    }
  }
  const card = float.querySelector<HTMLElement>('.card[data-thread]');
  const thread = threadById(card?.dataset['thread']);
  const point = thread && pinPoint(thread);
  if (card && point) {
    place(card, point.x + 16, point.y - 12);
  }
};

let frame = 0;
const schedule = (): void => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(positionPins);
};

// Late-bound: rendering and actions call each other.
const view = {
  render: (): void => undefined,
  close: (): void => undefined,
};

const load = async (): Promise<void> => {
  state = await request<Reply & State>('/threads');
  view.render();
};

const send = async (event: Record<string, unknown>): Promise<boolean> => {
  try {
    await request('/events', event);
    notice = '';
    await load();
    return true;
  } catch (error) {
    notice = messageOf(error);
    view.render();
    return false;
  }
};

const setCommenting = (value: boolean): void => {
  commenting = value;
  document.documentElement.style.cursor = value ? 'crosshair' : '';
  hoverBox.style.display = 'none';
  view.render();
};

const historyHtml = (thread: Thread): Raw =>
  raw(
    thread.history
      .map((event) => {
        if (event.type === 'resolve') {
          const changes = event.changes?.length ? ` (${event.changes.join(', ')})` : '';
          return html`<div class="entry"><div class="meta resolved">✓ Resolved by ${event.author.name} · ${time(event.at)}</div><div class="body">${event.note ?? ''}${changes}</div></div>`;
        }
        const verb = event.type === 'reopen' ? 'Reopened by ' : '';
        return html`<div class="entry"><div class="meta">${verb}${event.author.name} · ${time(event.at)}</div><div class="body">${event.body ?? ''}</div></div>`;
      })
      .join(''),
  );

const renderThread = (thread: Thread): void => {
  const open = thread.status === 'open';
  const flags = `${open ? '' : ' · resolved'}${elementFor(thread) ? '' : ' · detached'}`;
  const scenario = thread.comment.context.scenario ? ` · ${thread.comment.context.scenario}` : '';
  float.innerHTML = html`<div class="card" role="dialog" aria-label="Comment ${numberOf(thread)}" data-thread="${thread.id}">
    <div class="meta">#${numberOf(thread)} · ${thread.comment.author.name} · ${time(thread.comment.at)}${flags}</div>
    <div class="body">${thread.comment.body}</div>
    <div class="meta">on “${thread.comment.anchor.excerpt}”${scenario}</div>
    ${historyHtml(thread)}
    <textarea aria-label="Reply" placeholder="Reply…"></textarea>
    ${errorHtml()}
    <div class="row"><button data-action="close">Close</button><button data-action="${open ? 'resolve' : 'reopen'}">${open ? 'Resolve' : 'Reopen'}</button><button class="primary" data-action="reply">Reply <kbd>⌘↵</kbd></button></div>
  </div>`;
  const card = part('.float .card');
  const textarea = card.querySelector('textarea')!;
  const act = async (action: string | undefined): Promise<void> => {
    const text = textarea.value.trim();
    if (action === 'close') {
      view.close();
      return;
    }
    if (action === undefined || (action === 'reply' && !text)) {
      return;
    }
    const event =
      action === 'resolve'
        ? { type: 'resolve', thread: thread.id, note: text, changes: [] }
        : { type: action === 'reopen' ? 'reopen' : 'reply', thread: thread.id, body: text };
    if ((await send(event)) && openThread === thread.id) {
      view.render();
    }
  };
  card.addEventListener('click', async (event) => {
    await act((event.target as HTMLElement).closest('button')?.dataset['action']);
  });
  textarea.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      await act('reply');
    }
  });
  const point = pinPoint(thread);
  place(card, (point?.x ?? innerWidth / 2) + 16, (point?.y ?? innerHeight / 3) - 12);
};

// The canvas reloads whenever its source changes, which is often mid-review: keep an unsent comment.
const draftKey = 'tau-review-draft';
const saveDraft = (draft: Draft | undefined): void => {
  try {
    if (draft) {
      sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } else {
      sessionStorage.removeItem(draftKey);
    }
  } catch {
    // Storage blocked: the draft lives only as long as the page.
  }
};
const savedDraft = (): Draft | undefined => {
  try {
    const stored = sessionStorage.getItem(draftKey);
    return stored ? (JSON.parse(stored) as Draft) : undefined;
  } catch {
    return undefined;
  }
};

/** A draft pinned where the reviewer clicked; `point` is in viewport pixels. */
const draftAt = (element: Element, point: Point): Draft => {
  const { target, element: anchored } = anchorFor(element);
  const box = anchored.getBoundingClientRect();
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const text = textOf(anchored).slice(0, 120);
  return {
    target,
    offset: {
      x: box.width ? clamp((point.x - box.left) / box.width) : 0.5,
      y: box.height ? clamp((point.y - box.top) / box.height) : 0.5,
    },
    excerpt: text === '' ? anchored.tagName.toLowerCase() : text,
    body: '',
  };
};

const renderComposer = (draft: Draft): void => {
  const anchored = find(draft.target);
  if (!anchored) {
    saveDraft(undefined);
    return;
  }
  float.innerHTML = html`<div class="card composer" role="dialog" aria-label="New comment">
    <div class="meta">On “${draft.excerpt}”</div>
    <textarea aria-label="Comment" placeholder="Add a comment…"></textarea>
    ${errorHtml()}
    <div class="row"><button data-action="cancel">Cancel <kbd>Esc</kbd></button><button class="primary" data-action="submit">Comment <kbd>⌘↵</kbd></button></div>
  </div>`;
  const card = part('.float .card');
  const textarea = card.querySelector('textarea')!;
  textarea.value = draft.body;
  saveDraft(draft);
  textarea.addEventListener('input', () => {
    saveDraft({ ...draft, body: textarea.value });
  });
  const submit = async (): Promise<void> => {
    const body = textarea.value.trim();
    if (!body) {
      return;
    }
    const { target, offset, excerpt } = draft;
    const ok = await send({
      type: 'comment',
      body,
      anchor: { target, offset, excerpt },
      context: contextFor(anchored),
    });
    if (ok) {
      saveDraft(undefined);
      openThread = state.threads.at(-1)?.id;
      setCommenting(false);
    } else {
      renderComposer({ ...draft, body });
    }
  };
  card.addEventListener('click', async (event) => {
    const action = (event.target as HTMLElement).closest('button')?.dataset['action'];
    if (action === 'cancel') {
      saveDraft(undefined);
      view.close();
    } else if (action === 'submit') {
      await submit();
    }
  });
  textarea.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      await submit();
    }
  });
  const box = anchored.getBoundingClientRect();
  place(card, box.left + box.width * draft.offset.x + 16, box.top + box.height * draft.offset.y - 12);
  textarea.focus();
};

const renderPanel = (): string => {
  if (!panelOpen) {
    return '';
  }
  const open = state.threads.filter((thread) => thread.status === 'open').length;
  const items = state.threads
    .map((thread) => {
      const detached = elementFor(thread) ? '' : ' · detached';
      return html`<button class="item" data-open="${thread.id}"><span class="meta">#${numberOf(thread)} · ${thread.comment.author.name} · ${thread.status}${detached}</span><span class="body">${thread.comment.body.slice(0, 140)}</span></button>`;
    })
    .join('');
  const finish = state.pending === 0 ? raw('disabled') : raw('');
  return html`<aside class="panel" aria-label="Review feedback"><h2>Feedback</h2>
    <div class="meta">${open} open · ${state.threads.length - open} resolved · ${state.pending} not yet committed</div>
    ${errorHtml()}${raw(items)}
    <div class="row"><button class="primary" data-action="finish" ${finish}>Finish review</button></div></aside>`;
};

view.render = (): void => {
  const open = state.threads.filter((thread) => thread.status === 'open').length;
  toolbar.innerHTML = html`<button data-action="comment" aria-pressed="${commenting}" title="Comment (C)">Comment<kbd>C</kbd></button><button data-action="panel" aria-expanded="${panelOpen}">Feedback · ${open} open</button>`;
  pins.innerHTML = state.threads
    // A page that shows a comment itself (a guide's decision) marks its anchor `data-review-pinless`.
    .filter((thread) => thread.status === 'open' || thread.id === openThread)
    .filter((thread) => !elementFor(thread)?.closest('[data-review-pinless]'))
    .map(
      (thread) =>
        html`<button class="pin" data-thread="${thread.id}" aria-expanded="${thread.id === openThread}" aria-label="Comment ${numberOf(thread)}: ${thread.comment.anchor.excerpt}">${numberOf(thread)}</button>`,
    )
    .join('');
  panel.innerHTML = renderPanel();
  const thread = threadById(openThread);
  if (thread) {
    renderThread(thread);
  }
  positionPins();
};

view.close = (): void => {
  openThread = undefined;
  notice = '';
  float.innerHTML = '';
  view.render();
};

const show = (thread: Thread): void => {
  openThread = thread.id;
  elementFor(thread)?.scrollIntoView({ block: 'center', behavior: 'instant' });
  view.render();
};

const finishReview = async (): Promise<boolean> => {
  try {
    const result = await request('/finish', {});
    notice = result.commit
      ? `Committed ${result.events} events as ${result.commit.slice(0, 9)}.`
      : 'Nothing new to commit.';
    await load();
    return true;
  } catch (error) {
    notice = messageOf(error);
    view.render();
    return false;
  }
};

shadow.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest('button');
  const action = button?.dataset['action'];
  switch (action) {
    case 'comment': {
      setCommenting(!commenting);
      break;
    }
    case 'panel': {
      panelOpen = !panelOpen;
      view.render();
      break;
    }
    case 'finish': {
      await finishReview();
      break;
    }
    default:
  }
  const thread = threadById(button?.dataset['thread'] ?? button?.dataset['open']);
  if (!thread) {
    return;
  }
  if (openThread === thread.id && button?.dataset['thread']) {
    view.close();
  } else {
    show(thread);
  }
});

// --- page events ----------------------------------------------------------------------------------

const ours = (event: Event): boolean => event.composedPath().includes(host);
const editing = (event: Event): boolean => {
  const [target] = event.composedPath();
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
};

// In comment mode the canvas must not react to presses: no focus, drags or menus.
const swallow = (event: Event): void => {
  if (commenting && !ours(event)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
};
for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup']) {
  addEventListener(type, swallow, true);
}

let hovered: Element | undefined;
addEventListener(
  'pointermove',
  (event) => {
    const element = commenting && !ours(event) ? (event.target as Element) : undefined;
    if (element === hovered) {
      return;
    }
    hovered = element;
    requestAnimationFrame(() => {
      if (!element || hovered !== element) {
        hoverBox.style.display = hovered ? hoverBox.style.display : 'none';
        return;
      }
      const box = anchorFor(element).element.getBoundingClientRect();
      Object.assign(hoverBox.style, {
        display: 'block',
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
    });
  },
  true,
);

addEventListener(
  'click',
  (event) => {
    if (!commenting || ours(event)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    hoverBox.style.display = 'none';
    renderComposer(draftAt(event.target as Element, { x: event.clientX, y: event.clientY }));
  },
  true,
);

addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape' && (commenting || openThread !== undefined || float.innerHTML !== '')) {
      event.preventDefault();
      saveDraft(undefined);
      setCommenting(false);
      view.close();
      return;
    }
    if (ours(event) || editing(event) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const focused = document.activeElement;
    if (event.key === 'c') {
      event.preventDefault();
      setCommenting(!commenting);
    } else if (event.key === 'C' && focused && focused !== document.body) {
      event.preventDefault();
      const box = focused.getBoundingClientRect();
      renderComposer(draftAt(focused, { x: box.left + box.width / 2, y: box.top + box.height / 2 }));
    } else if (event.key === ']' || event.key === '[') {
      const open = state.threads.filter((thread) => thread.status === 'open');
      const current = open.findIndex((thread) => thread.id === openThread);
      const next = open.at((current + (event.key === ']' ? 1 : -1)) % Math.max(open.length, 1));
      if (next) {
        event.preventDefault();
        show(next);
      }
    }
  },
  true,
);

// Pages record a comment without the composer (an API guide's decision) by dispatching
// `tau-review:comment` from the element it is about, with `{ body, excerpt?, done }` as detail…
type CommentRequest = { body: string; excerpt?: string; done?: (ok: boolean, message: string) => void };
addEventListener('tau-review:comment', async (event) => {
  const { detail, target } = event as CustomEvent<CommentRequest>;
  if (!(target instanceof Element)) {
    return;
  }
  const box = target.getBoundingClientRect();
  const { target: anchor, offset, excerpt } = draftAt(target, { x: box.left + 8, y: box.top + 8 });
  const ok = await send({
    type: 'comment',
    body: detail.body,
    anchor: { target: anchor, offset, excerpt: detail.excerpt ?? excerpt },
    context: contextFor(target),
  });
  detail.done?.(ok, ok ? '' : notice);
});

// …and end the review (one Brain commit) by dispatching `tau-review:finish` on the window, `{ done }` as detail.
type FinishRequest = { done?: (ok: boolean, message: string) => void };
addEventListener('tau-review:finish', async (event) => {
  const ok = await finishReview();
  (event as CustomEvent<FinishRequest>).detail.done?.(ok, notice);
});

addEventListener('scroll', schedule, { capture: true, passive: true });
addEventListener('resize', schedule);
// Canvases change layout without scrolling (tabs, scenarios); re-find anchors that went away.
setInterval(() => {
  for (const [id, element] of elements) {
    if (!element?.isConnected) {
      elements.delete(id);
    }
  }
  schedule();
}, 750);

document.body.append(host);
try {
  await load();
  const draft = savedDraft();
  if (draft) {
    renderComposer(draft);
  }
} catch (error) {
  notice = messageOf(error);
  view.render();
}
