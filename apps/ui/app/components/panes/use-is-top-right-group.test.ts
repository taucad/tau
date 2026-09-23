import { afterEach, describe, expect, it } from 'vitest';
import type { DockviewGroupPanel, DockviewPanelApi } from 'dockview-react';
import {
  checkGroupIsTopCorner,
  checkGroupIsTopRight,
  checkPanelIsTopRight,
  edgeTolerance,
} from '#components/panes/use-is-top-right-group.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

type RectLike = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

function domRect(partial: Partial<RectLike> = {}): DOMRect {
  const rect = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    ...partial,
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mock
  return { ...rect, toJSON: () => rect } satisfies DOMRect;
}

/** Tracks root elements appended to `document.body` for cleanup. */
const roots: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots) {
    root.remove();
  }

  roots.length = 0;
});

/**
 * Builds a mock `DockviewGroupPanel` whose `.element` is (optionally) nested
 * inside a floating-panel ancestor so that `closest()` resolves correctly.
 */
function buildGroupInFloatingPanel(options: {
  locationType?: string;
  groupRect?: Partial<RectLike>;
  panelRect?: Partial<RectLike>;
  panelState?: string;
  omitPanel?: boolean;
}): DockviewGroupPanel {
  const {
    locationType = 'grid',
    groupRect = { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
    panelRect = { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
    panelState = 'open',
    omitPanel = false,
  } = options;

  const groupElement = document.createElement('div');
  groupElement.getBoundingClientRect = () => domRect(groupRect);

  let root: HTMLElement = groupElement;

  if (!omitPanel) {
    const panel = document.createElement('div');
    panel.dataset['slot'] = 'floating-panel';
    panel.dataset['state'] = panelState;
    panel.getBoundingClientRect = () => domRect(panelRect);
    panel.append(groupElement);
    root = panel;
  }

  document.body.append(root);
  roots.push(root);

  return {
    api: { location: { type: locationType } },
    element: groupElement,
  } as unknown as DockviewGroupPanel;
}

/**
 * Builds a mock `DockviewPanelApi` whose group `.element` is (optionally)
 * nested inside a `.dv-dockview` ancestor.
 */
function buildPanelInDockview(options: {
  locationType?: string;
  groupRect?: Partial<RectLike>;
  containerRect?: Partial<RectLike>;
  omitContainer?: boolean;
}): DockviewPanelApi {
  const {
    locationType = 'grid',
    groupRect = { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
    containerRect = { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
    omitContainer = false,
  } = options;

  const groupElement = document.createElement('div');
  groupElement.getBoundingClientRect = () => domRect(groupRect);

  let root: HTMLElement = groupElement;

  if (!omitContainer) {
    const container = document.createElement('div');
    container.classList.add('dv-dockview');
    container.getBoundingClientRect = () => domRect(containerRect);
    container.append(groupElement);
    root = container;
  }

  document.body.append(root);
  roots.push(root);

  return {
    group: {
      api: { location: { type: locationType } },
      element: groupElement,
    },
  } as unknown as DockviewPanelApi;
}

// ── checkGroupIsTopRight ─────────────────────────────────────────────────────

describe('checkGroupIsTopRight', () => {
  describe('returns false', () => {
    it('when group location is not "grid"', () => {
      const group = buildGroupInFloatingPanel({ locationType: 'floating' });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('when no floating panel ancestor exists', () => {
      const group = buildGroupInFloatingPanel({ omitPanel: true });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('when floating panel is closed (data-state != "open")', () => {
      const group = buildGroupInFloatingPanel({ panelState: 'closed' });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('when group element has zero width (not laid out)', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 0, width: 0, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('when group element has zero height (not laid out)', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 500, width: 500, height: 0, left: 0, bottom: 0 },
      });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('when right edge exceeds tolerance', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 500 - edgeTolerance, width: 400, height: 400, left: 100, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('when top edge exceeds tolerance', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: edgeTolerance, right: 500, width: 500, height: 400, left: 0, bottom: 400 + edgeTolerance },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('when group is at top-left instead of top-right', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 250, width: 250, height: 400, left: 0, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('when group is at bottom-right instead of top-right', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 200, right: 500, width: 500, height: 200, left: 0, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });
  });

  describe('returns true', () => {
    it('when group edges exactly align with floating panel', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(true);
    });

    it('when group is a smaller pane filling the top-right corner', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 500, width: 250, height: 200, left: 250, bottom: 200 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(true);
    });

    it('when right edge is within tolerance (1px off)', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 499, width: 499, height: 400, left: 0, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(true);
    });

    it('when top edge is within tolerance (1px off)', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 1, right: 500, width: 500, height: 399, left: 0, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(true);
    });

    it('when both edges are within tolerance simultaneously', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 1, right: 499, width: 499, height: 399, left: 0, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(true);
    });
  });

  describe('edge tolerance boundary', () => {
    it('returns true at exactly (tolerance - epsilon) offset', () => {
      const offset = edgeTolerance - 0.01;
      const group = buildGroupInFloatingPanel({
        groupRect: { top: offset, right: 500 - offset, width: 400, height: 400, left: 100, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(true);
    });

    it('returns false at exactly the tolerance value (strict less-than)', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 500 - edgeTolerance, width: 400, height: 400, left: 100, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(false);
    });

    it('handles negative offset (group slightly past panel edge)', () => {
      const group = buildGroupInFloatingPanel({
        groupRect: { top: 0, right: 501, width: 501, height: 400, left: 0, bottom: 400 },
        panelRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkGroupIsTopRight(group)).toBe(true);
    });
  });
});

// ── checkPanelIsTopRight ─────────────────────────────────────────────────────

describe('checkGroupIsTopCorner', () => {
  it('finds the top-left group, where the chat lane toggle heads the tabs', () => {
    const left = buildGroupInFloatingPanel({
      groupRect: { top: 0, right: 250, width: 250, height: 400, left: 0, bottom: 400 },
    });
    const right = buildGroupInFloatingPanel({
      groupRect: { top: 0, right: 500, width: 250, height: 400, left: 250, bottom: 400 },
    });

    expect(checkGroupIsTopCorner(left, 'left')).toBe(true);
    expect(checkGroupIsTopCorner(right, 'left')).toBe(false);
    expect(checkGroupIsTopCorner(right, 'right')).toBe(true);
  });
});

describe('checkPanelIsTopRight', () => {
  describe('returns false', () => {
    it('when group location is not "grid"', () => {
      const panelApi = buildPanelInDockview({ locationType: 'floating' });
      expect(checkPanelIsTopRight(panelApi)).toBe(false);
    });

    it('when no .dv-dockview ancestor exists', () => {
      const panelApi = buildPanelInDockview({ omitContainer: true });
      expect(checkPanelIsTopRight(panelApi)).toBe(false);
    });

    it('when group has zero dimensions', () => {
      const panelApi = buildPanelInDockview({
        groupRect: { top: 0, right: 0, width: 0, height: 0, left: 0, bottom: 0 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(false);
    });

    it('when group is not at the top-right corner', () => {
      const panelApi = buildPanelInDockview({
        groupRect: { top: 200, right: 250, width: 250, height: 200, left: 0, bottom: 400 },
        containerRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(false);
    });

    it('when right edge exceeds tolerance', () => {
      const panelApi = buildPanelInDockview({
        groupRect: { top: 0, right: 500 - edgeTolerance, width: 400, height: 400, left: 100, bottom: 400 },
        containerRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(false);
    });

    it('when top edge exceeds tolerance', () => {
      const panelApi = buildPanelInDockview({
        groupRect: { top: edgeTolerance, right: 500, width: 500, height: 400, left: 0, bottom: 400 + edgeTolerance },
        containerRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(false);
    });
  });

  describe('returns true', () => {
    it('when group edges exactly align with dockview container', () => {
      const panelApi = buildPanelInDockview({
        groupRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
        containerRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(true);
    });

    it('when group is a smaller pane filling the top-right corner', () => {
      const panelApi = buildPanelInDockview({
        groupRect: { top: 0, right: 800, width: 400, height: 300, left: 400, bottom: 300 },
        containerRect: { top: 0, right: 800, width: 800, height: 600, left: 0, bottom: 600 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(true);
    });

    it('when edges are within tolerance', () => {
      const panelApi = buildPanelInDockview({
        groupRect: { top: 1, right: 799, width: 399, height: 299, left: 400, bottom: 300 },
        containerRect: { top: 0, right: 800, width: 800, height: 600, left: 0, bottom: 600 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(true);
    });
  });

  describe('edge tolerance boundary', () => {
    it('returns true at exactly (tolerance - epsilon) offset', () => {
      const offset = edgeTolerance - 0.01;
      const panelApi = buildPanelInDockview({
        groupRect: { top: offset, right: 500 - offset, width: 400, height: 400, left: 100, bottom: 400 },
        containerRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(true);
    });

    it('returns false at exactly the tolerance value (strict less-than)', () => {
      const panelApi = buildPanelInDockview({
        groupRect: { top: 0, right: 500 - edgeTolerance, width: 400, height: 400, left: 100, bottom: 400 },
        containerRect: { top: 0, right: 500, width: 500, height: 400, left: 0, bottom: 400 },
      });
      expect(checkPanelIsTopRight(panelApi)).toBe(false);
    });
  });
});

// ── edgeTolerance constant ───────────────────────────────────────────────────

describe('edgeTolerance', () => {
  it('is a positive number', () => {
    expect(edgeTolerance).toBeGreaterThan(0);
  });

  it('equals 2 (current documented value)', () => {
    expect(edgeTolerance).toBe(2);
  });
});
