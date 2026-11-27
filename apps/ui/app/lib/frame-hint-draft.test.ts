import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  draftHintProjectLimit,
  draftHintReaderSource,
  draftHintScopeOf,
  draftHintStorageKey,
  draftHintTextLimit,
  readDraftHint,
  writeDraftHint,
} from '#lib/frame-hint-draft.js';
import { frameHintKey } from '#lib/frame-hint.js';

/* The script's realm is the document's: it hands the reader over on the document, as the early input's state is. */
type ReaderDocument = Document & { __tauDraftHintReader?: (where: URL) => { text: string; chatId: string } };

/** The early input script's reader, run as the served page runs it: from a script element's source. */
const readEntryAsScript = (url: string): { text: string; chatId: string } => {
  const script = document.createElement('script');
  script.textContent = `document.__tauDraftHintReader=${draftHintReaderSource}`;
  document.body.append(script);
  script.remove();
  const reader = (document as ReaderDocument).__tauDraftHintReader;
  expect(reader).toBeTypeOf('function');
  return reader!(new URL(url, 'http://localhost'));
};

const readAsScript = (url: string): string => readEntryAsScript(url).text;

describe('draft hint (A15d)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps Home's draft and each project's draft under the frame hint's key", () => {
    writeDraftHint({ kind: 'home' }, { text: 'A shelf bracket' });
    writeDraftHint({ kind: 'project', key: frameHintKey('/w/acme/bracket')! }, { text: 'Fillet it', chatId: 'c1' });

    expect(readDraftHint({ kind: 'home' })).toMatchObject({ text: 'A shelf bracket' });
    expect(readDraftHint({ kind: 'project', key: 'acme/bracket' })).toMatchObject({ text: 'Fillet it', chatId: 'c1' });
    expect(readDraftHint({ kind: 'project', key: 'acme/hinge' })).toBeUndefined();
  });

  it('removes an entry when its draft empties or outgrows the limit', () => {
    writeDraftHint({ kind: 'home' }, { text: 'A shelf bracket' });
    writeDraftHint({ kind: 'home' }, { text: '' });
    expect(readDraftHint({ kind: 'home' })).toBeUndefined();

    writeDraftHint({ kind: 'project', key: 'acme/bracket' }, { text: 'x'.repeat(draftHintTextLimit + 1) });
    expect(readDraftHint({ kind: 'project', key: 'acme/bracket' })).toBeUndefined();
  });

  it('caps the projects it remembers by last use, keeping Home', () => {
    writeDraftHint({ kind: 'home' }, { text: 'Home' }, 0);
    for (let index = 0; index <= draftHintProjectLimit; index += 1) {
      writeDraftHint({ kind: 'project', key: `w/p${index}` }, { text: `draft ${index}` }, index + 1);
    }
    const stored = JSON.parse(localStorage.getItem(draftHintStorageKey)!) as { projects: Record<string, unknown> };

    expect(Object.keys(stored.projects)).toHaveLength(draftHintProjectLimit);
    expect(readDraftHint({ kind: 'project', key: 'w/p0' })).toBeUndefined();
    expect(readDraftHint({ kind: 'project', key: `w/p${draftHintProjectLimit}` })).toBeDefined();
    expect(readDraftHint({ kind: 'home' })).toMatchObject({ text: 'Home' });
  });

  it.each([
    'not json',
    '{"v":2,"projects":{}}',
    '{"v":1}',
    '{"v":1,"home":{"text":7,"usedAt":1},"projects":{"w/p":{"text":"","usedAt":1}}}',
  ])('reads a malformed record %s as no draft, and replaces it on the next write', (raw) => {
    localStorage.setItem(draftHintStorageKey, raw);

    expect(readDraftHint({ kind: 'home' })).toBeUndefined();
    expect(readDraftHint({ kind: 'project', key: 'w/p' })).toBeUndefined();
    expect(readAsScript('/')).toBe('');
    writeDraftHint({ kind: 'home' }, { text: 'A hinge' });
    expect(readDraftHint({ kind: 'home' })).toMatchObject({ text: 'A hinge' });
  });

  it('survives storage that throws, on read and on write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(readDraftHint({ kind: 'home' })).toBeUndefined();
    expect(() => {
      writeDraftHint({ kind: 'home' }, { text: 'A hinge' });
    }).not.toThrow();
    expect(readAsScript('/')).toBe('');
  });

  it.each([
    { url: '/', expected: 'Home draft' },
    { url: '/w/acme/bracket', expected: 'Fillet it' },
    { url: '/w/acme/bracket/', expected: 'Fillet it' },
    { url: '/w/acme/bracket?chat=c1', expected: 'Fillet it' },
    { url: '/w/acme/bracket?chat=c2', expected: '' },
    { url: '/w/acme/hinge', expected: '' },
    { url: '/settings', expected: '' },
  ])('the served reader agrees with the module for $url', ({ url, expected }) => {
    writeDraftHint({ kind: 'home' }, { text: 'Home draft' });
    writeDraftHint({ kind: 'project', key: 'acme/bracket' }, { text: 'Fillet it', chatId: 'c1' });

    expect(readAsScript(url)).toBe(expected);
    const key = frameHintKey(new URL(url, 'http://localhost').pathname);
    const entry =
      url === '/'
        ? readDraftHint({ kind: 'home' })
        : key === undefined
          ? undefined
          : readDraftHint({ kind: 'project', key });
    const chat = new URL(url, 'http://localhost').searchParams.get('chat');
    expect(entry !== undefined && (chat === null || chat === entry.chatId) ? entry.text : '').toBe(expected);
  });

  it.each([
    { url: '/', expected: { text: 'Home draft', chatId: '' } },
    { url: '/w/acme/bracket', expected: { text: 'Fillet it', chatId: 'c1' } },
    { url: '/w/acme/hinge', expected: { text: 'Hinge it', chatId: '' } },
    { url: '/w/acme/bracket?chat=c2', expected: { text: '', chatId: '' } },
  ])('the served reader names the chat a painted draft belongs to, for $url', ({ url, expected }) => {
    writeDraftHint({ kind: 'home' }, { text: 'Home draft' });
    writeDraftHint({ kind: 'project', key: 'acme/bracket' }, { text: 'Fillet it', chatId: 'c1' });
    writeDraftHint({ kind: 'project', key: 'acme/hinge' }, { text: 'Hinge it' });

    expect(readEntryAsScript(url)).toEqual(expected);
  });

  it.each([
    { pathname: '/', isProjectComposer: false, expected: { kind: 'home' } },
    { pathname: '/settings', isProjectComposer: false, expected: undefined },
    { pathname: '/w/acme/bracket', isProjectComposer: true, expected: { kind: 'project', key: 'acme/bracket' } },
    { pathname: '/w/acme/bracket/files', isProjectComposer: true, expected: { kind: 'project', key: 'acme/bracket' } },
    { pathname: '/', isProjectComposer: true, expected: undefined },
  ])(
    'mirrors the main composer on $pathname (project: $isProjectComposer)',
    ({ pathname, isProjectComposer, expected }) => {
      expect(draftHintScopeOf(pathname, isProjectComposer)).toEqual(expected);
    },
  );
});
