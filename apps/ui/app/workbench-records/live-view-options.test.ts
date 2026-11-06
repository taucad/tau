import { afterEach, describe, expect, it } from 'vitest';
import {
  discardLiveViewOptions,
  getLiveViewOptions,
  setLiveViewOptions,
  settleLiveViewOptions,
} from '#workbench-records/live-view-options.js';

describe('live view options', () => {
  afterEach(() => {
    setLiveViewOptions('pane-1', undefined);
  });

  it('keeps a draft until the record holds the same options for the same kernel view', () => {
    const draft = { viewId: 'pcb', options: { pinNumbers: true, palette: 'fabrication' } };
    setLiveViewOptions('pane-1', draft);

    // The record still holds the older options: the draft keeps leading, so the pane never steps back.
    settleLiveViewOptions('pane-1', draft, { viewId: 'pcb', options: {} });
    settleLiveViewOptions('pane-1', draft, { viewId: 'pcb', options: { pinNumbers: false, palette: 'fabrication' } });
    expect(getLiveViewOptions('pane-1')).toBe(draft);

    // Another kernel view's record says nothing about this draft.
    settleLiveViewOptions('pane-1', draft, { viewId: 'board', options: { pinNumbers: true, palette: 'fabrication' } });
    expect(getLiveViewOptions('pane-1')).toBe(draft);

    // A record matching an older draft leaves the newer draft leading.
    const older = { viewId: 'pcb', options: { pinNumbers: true, palette: 'fabrication' } };
    settleLiveViewOptions('pane-1', older, { viewId: 'pcb', options: { pinNumbers: true, palette: 'fabrication' } });
    expect(getLiveViewOptions('pane-1')).toBe(draft);

    // Key order is not a difference.
    settleLiveViewOptions('pane-1', draft, { viewId: 'pcb', options: { palette: 'fabrication', pinNumbers: true } });
    expect(getLiveViewOptions('pane-1')).toBeUndefined();
  });

  it('discards only the draft that failed, never a newer one', () => {
    const failed = { viewId: 'pcb', options: { pinNumbers: true } };
    const newer = { viewId: 'pcb', options: { pinNumbers: false } };
    setLiveViewOptions('pane-1', failed);
    setLiveViewOptions('pane-1', newer);

    discardLiveViewOptions('pane-1', failed);
    expect(getLiveViewOptions('pane-1')).toBe(newer);

    discardLiveViewOptions('pane-1', newer);
    expect(getLiveViewOptions('pane-1')).toBeUndefined();
  });
});
